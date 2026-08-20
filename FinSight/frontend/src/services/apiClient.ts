/**
 * API Client - Single Source of Truth
 * 
 * RULES:
 * - This is the ONLY axios instance in the entire codebase
 * - All API calls must go through this client
 * - No other axios.create() or direct axios imports allowed
 * - Handles: base URL, timeouts, interceptors, error formatting
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Base URL Configuration
// Priority: env var > production fallback > localhost
const PRODUCTION_API = 'https://finvest-api-gwkz.onrender.com';
const DEV_API = 'http://localhost:8001';

// Determine API URL
function getApiBaseUrl(): string {
  // Check for explicit env var first
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }
  
  // In production, use Render backend
  if (import.meta.env.PROD) {
    return PRODUCTION_API;
  }
  
  // Development fallback
  return DEV_API;
}

const API_BASE_URL: string = getApiBaseUrl();

// Log API configuration for debugging
console.log('[FinVest API] Base URL:', API_BASE_URL, '| Prod:', import.meta.env.PROD);

// Timeouts - Increased for Render free tier cold starts (can take 50+ seconds)
const DEFAULT_TIMEOUT = 60000; // 60 seconds for normal requests
const HEALTH_TIMEOUT = 60000;  // 60 seconds for health checks (allow cold start)

// Debug mode
const DEBUG = import.meta.env.DEV;

// =============================================================================
// API CLIENT INSTANCE
// =============================================================================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// =============================================================================
// REQUEST INTERCEPTOR
// =============================================================================

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (DEBUG) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error: AxiosError) => {
    console.error('[API] Request setup error:', error.message);
    return Promise.reject(error);
  }
);

// =============================================================================
// RESPONSE INTERCEPTOR
// =============================================================================

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (DEBUG) {
      console.log(`[API] ✓ ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error: AxiosError) => {
    // Format error for consistent handling
    const formattedError = formatApiError(error);
    
    if (DEBUG) {
      console.error('[API] ✗', formattedError.message, {
        url: error.config?.url,
        status: error.response?.status,
      });
    }
    
    return Promise.reject(formattedError);
  }
);

// =============================================================================
// ERROR FORMATTING
// =============================================================================

export interface ApiError {
  message: string;
  status: number | null;
  code: string;
  isNetworkError: boolean;
  isTimeout: boolean;
  originalError: AxiosError;
}

function formatApiError(error: AxiosError): ApiError {
  const isNetworkError = !error.response && error.code !== 'ECONNABORTED';
  const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
  
  let message: string;
  let code: string;
  
  if (isTimeout) {
    message = 'Request timed out';
    code = 'TIMEOUT';
  } else if (isNetworkError) {
    message = 'Network error - server unreachable';
    code = 'NETWORK_ERROR';
  } else if (error.response) {
    const status = error.response.status;
    const data = error.response.data as any;
    
    message = data?.detail || data?.message || `Server error (${status})`;
    code = `HTTP_${status}`;
  } else {
    message = error.message || 'Unknown error';
    code = 'UNKNOWN';
  }
  
  return {
    message,
    status: error.response?.status || null,
    code,
    isNetworkError,
    isTimeout,
    originalError: error,
  };
}

// =============================================================================
// RETRY LOGIC - MAX 2 RETRIES, NO RENDER CYCLE RETRIES
// =============================================================================

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (error: ApiError, attempt: number) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  retryDelay: 1000,
  shouldRetry: (error: ApiError, attempt: number) => {
    // Only retry on network errors or 5xx server errors
    // Never retry on 4xx client errors
    if (error.isTimeout) return attempt < 2;
    if (error.isNetworkError) return attempt < 2;
    if (error.status && error.status >= 500) return attempt < 2;
    return false;
  },
};

export async function withRetry<T>(
  requestFn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxRetries, retryDelay, shouldRetry } = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let lastError: ApiError | null = null;
  
  for (let attempt = 0; attempt <= maxRetries!; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error as ApiError;
      
      if (attempt < maxRetries! && shouldRetry!(lastError, attempt)) {
        if (DEBUG) {
          console.log(`[API] Retry ${attempt + 1}/${maxRetries} in ${retryDelay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay! * (attempt + 1)));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

// =============================================================================
// API METHODS
// =============================================================================

export const api = {
  // Health check - fast, no DB work
  health: async (): Promise<{ status: string; timestamp: string }> => {
    const response = await apiClient.get('/api/health', { 
      timeout: HEALTH_TIMEOUT 
    });
    return response.data;
  },

  // Markets
  getMarkets: async (): Promise<Record<string, boolean>> => {
    const response = await apiClient.get('/api/markets');
    return response.data;
  },

  // Screener
  getScreener: async (params: {
    market?: string;
    limit?: number;
    offset?: number;
    search?: string;
    sector?: string;
    industry?: string;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
    signal?: AbortSignal;
  } = {}): Promise<any> => {
    const response = await apiClient.get('/api/screener', { 
      params,
      signal: params.signal,
      timeout: 90000, // 90s for large screener queries (cold start + processing)
    });
    return response.data;
  },

  // Ticker data
  getTickerDaily: async (ticker: string): Promise<any> => {
    const response = await apiClient.get(`/api/ticker/${ticker}/daily`);
    return response.data;
  },

  getTickerFundamentals: async (ticker: string): Promise<any> => {
    const response = await apiClient.get(`/api/ticker/${ticker}/fundamentals`);
    return response.data;
  },

  getTickerNews: async (ticker: string): Promise<any> => {
    const response = await apiClient.get(`/api/ticker/${ticker}/news`);
    return response.data;
  },

  getTickerPeers: async (ticker: string, limit = 10): Promise<any> => {
    const response = await apiClient.get(`/api/ticker/${ticker}/peers`, { params: { limit } });
    return response.data;
  },

  getTickerRealtime: async (ticker: string): Promise<any> => {
    const response = await apiClient.get(`/api/ticker/${ticker}/realtime`);
    return response.data;
  },

  // Smart Money - DataCore endpoints
  // IMPORTANT: These endpoints must match backend routes in main.py
  getInsiderTrades: async (days = 30, limit = 100): Promise<any> => {
    // Backend route: /api/insider-flow/trades (from app.insider_flow)
    const response = await apiClient.get('/api/insider-flow/trades', { 
      params: { days, limit } 
    });
    return response.data;
  },

  get13FSignals: async (days = 180): Promise<any> => {
    // Backend route: /api/insider-flow/13f (from app.insider_flow)
    const response = await apiClient.get('/api/insider-flow/13f', { 
      params: { days } 
    });
    return response.data;
  },

  getFiiDiiSummary: async (): Promise<any> => {
    // Backend route: /api/smart-money/summary (from app.insider_flow)
    const response = await apiClient.get('/api/smart-money/summary');
    return response.data;
  },

  // Insider Flow (specific endpoints)
  getInsiderFlowSignals: async (days = 365): Promise<any> => {
    const response = await apiClient.get('/api/insider-flow/signals', { params: { days } });
    return response.data;
  },

  getInsiderFlowTrades: async (days = 180, limit = 200): Promise<any> => {
    const response = await apiClient.get('/api/insider-flow/trades', { params: { days, limit } });
    return response.data;
  },

  getInsiderFlowSummary: async (): Promise<any> => {
    const response = await apiClient.get('/api/insider-flow/summary');
    return response.data;
  },

  getInsiderFlow13F: async (days = 365): Promise<any> => {
    const response = await apiClient.get('/api/insider-flow/13f', { params: { days } });
    return response.data;
  },

  // Smart Money Daily
  getSmartMoneyDaily: async (): Promise<any> => {
    const response = await apiClient.get('/api/smart-money/daily');
    return response.data;
  },

  getSmartMoneySummary: async (): Promise<any> => {
    const response = await apiClient.get('/api/smart-money/summary');
    return response.data;
  },

  // Filter options
  getFilterOptions: async (market?: string): Promise<{ sectors: string[]; industries: string[] }> => {
    const response = await apiClient.get('/api/meta/filters', { 
      params: market ? { market } : {} 
    });
    return response.data;
  },

  // AI Insights (when enabled)
  getAIInsights: async (ticker: string, context?: string): Promise<any> => {
    try {
      const response = await apiClient.post(`/api/ticker/${ticker}/ai-insights`, {
        strategy_context: context,
      });
      return response.data;
    } catch {
      // Fallback to GET
      const response = await apiClient.get(`/api/ticker/${ticker}/ai-insights`);
      return response.data;
    }
  },

  // Top Opportunities - from Intelligence pipeline
  getTopOpportunities: async (market = 'US'): Promise<any> => {
    // Backend route: /api/top-opportunities/{market}
    const response = await apiClient.get(`/api/top-opportunities/${market}`);
    return response.data;
  },

  // StrataX Options
  getStrataXOptionChain: async (symbol: string): Promise<any> => {
    const response = await apiClient.get('/api/stratax/option-chain', { 
      params: { symbol },
      timeout: 20000,
    });
    return response.data;
  },

  getStrataXUnderlyings: async (): Promise<string[]> => {
    const response = await apiClient.get('/api/stratax/underlyings');
    return response.data;
  },

  getStrataXExpiries: async (symbol: string): Promise<string[]> => {
    const response = await apiClient.get('/api/stratax/expiries', { params: { symbol } });
    return response.data;
  },

  // =========================================================================
  // COVERAGE & SYSTEM STATUS
  // =========================================================================
  
  /**
   * Get per-market pipeline coverage breakdown
   */
  getCoverage: async (): Promise<{
    coverage: Array<{
      market: string;
      total_ingested: number;
      data_valid: number;
      signal_eligible: number;
      decision_generated: Record<string, number>;
      last_pipeline_run: string | null;
      pipeline_version: string;
      status: string;
      status_reason: string | null;
    }>;
    api_version: string;
    git_commit: string | null;
    timestamp: string;
  }> => {
    const response = await apiClient.get('/api/coverage');
    return response.data;
  },

  /**
   * Get system-wide status including pipeline health
   */
  getSystemStatus: async (): Promise<{
    status: string;
    overall_health: string;
    last_successful_run: string | null;
    next_scheduled_run: string;
    pipeline_health: Record<string, {
      last_run?: string;
      age_hours?: number;
      status: string;
      total_stocks?: number;
      version?: string;
      error?: string;
    }>;
    backend: {
      environment: string;
      api_url: string;
      data_dir: string;
      data_dir_exists: boolean;
    };
    timestamp: string;
  }> => {
    const response = await apiClient.get('/api/system/status');
    return response.data;
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export { apiClient as default, API_BASE_URL };

