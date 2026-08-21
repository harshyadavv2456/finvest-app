import axios from 'axios';
import { retryUntilSuccess } from './retry';

// Production API URL - Render backend
const PRODUCTION_API_URL = 'https://finvest-api-gwkz.onrender.com';

// Use environment variable for API URL
// In production, fall back to Render backend URL if VITE_API_URL is not set
// In development, empty string uses Vite proxy (vite.config.ts forwards /api/* to localhost:8001)
const API_BASE = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') // Remove trailing slash
  : import.meta.env.PROD 
    ? PRODUCTION_API_URL 
    : ''; // Empty for dev proxy

// Log API base URL for debugging (both dev and prod)
console.log('[FinSight] API Configuration:', {
  API_BASE: String(API_BASE),
  VITE_API_URL: String(import.meta.env.VITE_API_URL || 'not set'),
  MODE: String(import.meta.env.MODE),
  PROD: String(import.meta.env.PROD),
});

// Add axios interceptor for better error handling
axios.interceptors.response.use(
  (response) => {
    console.log('[FinSight] API Success:', response.config.method?.toUpperCase(), response.config.url, response.status);
    // Log response data structure for debugging
    if (response.config.url?.includes('/screener')) {
      const data = response.data;
      console.log('[FinSight] Screener response data:', {
        hasRows: !!data?.rows,
        rowCount: data?.rows?.length || 0,
        totalCount: data?.total_count || data?.total || 0,
        limit: data?.limit,
        offset: data?.offset,
        keys: Object.keys(data || {}),
        fullResponse: JSON.stringify(data, null, 2), // Log full response
      });
      if (data?.rows && data.rows.length > 0) {
        console.log('[FinSight] First row sample:', JSON.stringify(data.rows[0], null, 2));
      } else {
        console.warn('[FinSight] No rows in response! Full response:', JSON.stringify(data, null, 2));
      }
    }
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      console.error('[FinSight] API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url,
      });
    } else if (error.request) {
      // Request made but no response received
      console.error('[FinSight] API Request Error: No response received', {
        url: error.config?.url,
        method: error.config?.method,
        timeout: error.config?.timeout,
        baseURL: error.config?.baseURL,
      });
      console.error('[FinSight] This usually means:', {
        'Backend is down': 'Check if backend is running',
        'CORS issue': 'Check backend CORS configuration',
        'Network error': 'Check internet connection',
        'Wrong API URL': `Current API_BASE: ${API_BASE}`,
      });
    } else {
      // Error setting up request
      console.error('[FinSight] API Setup Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export interface TickerBasic {
  ticker: string;
  market: string;
  exchange_tz: string;
  current_price?: number;
  pe_trailing?: number;
  market_cap?: number;
}

export interface ScreenerRow {
  ticker: string;
  market: string;
  exchange_tz: string;
  currency?: string;
  company_name?: string;
  industry?: string;
  sector?: string;
  current_price?: number;
  market_cap?: number;
  enterprise_value?: number;
  shares_outstanding_est?: number;
  pe_trailing?: number;
  pe_forward?: number;
  pb_ratio?: number;
  price_to_sales?: number;
  ev_to_ebitda?: number;
  ev_to_revenue?: number;
  peg_ratio?: number;
  earnings_yield?: number;
  dividend_yield?: number;
  industry_pe?: number;
  roe?: number;
  roa?: number;
  roce?: number;
  gross_margin?: number;
  operating_margin?: number;
  ebitda_margin?: number;
  profit_margin?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  quick_ratio?: number;
  free_cash_flow?: number;
  operating_cash_flow?: number;
  fcf_yield?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  earnings_quarterly_growth?: number;
  eps_growth_yoy?: number;
  payout_ratio?: number;
  beta?: number;
  insider_holding?: number;
  institutional_holding?: number;
  short_ratio?: number;
  short_pct_float?: number;
  analyst_target_mean?: number;
  analyst_rating?: number;
  num_analysts?: number;
  analyst_upside?: number;
  ret_1d?: number;
  ret_1w?: number;
  ret_1m?: number;
  ret_3m?: number;
  ret_6m?: number;
  ret_1y?: number;
  high_52w?: number;
  low_52w?: number;
  pct_from_52w_high?: number;
  pct_from_52w_low?: number;
  vol_20d?: number;
  vol_60d?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  rsi14?: number;
  price_above_sma50?: boolean;
  price_above_sma200?: boolean;
  golden_cross_50_200?: boolean;
  volume_latest?: number;
  avg_volume_20d?: number;
  avg_volume_60d?: number;
  volume_spike_20d?: number;
}

export interface ScreenerResponse {
  rows: ScreenerRow[];  // List of screener rows matching ScreenerRow schema
  total: number;        // Total rows before pagination (legacy)
  total_count: number;  // Total rows before pagination (preferred)
  limit: number;        // Page size
  offset: number;       // Current offset
}

export interface ScreenerFilterParams {
  market?: string;
  min_market_cap?: number | string;
  max_market_cap?: number | string;
  min_pe?: number | string;
  max_pe?: number | string;
  min_pb?: number | string;
  max_pb?: number | string;
  min_roe?: number | string;
  max_roe?: number | string;
  min_roa?: number | string;
  max_roa?: number | string;
  min_roce?: number | string;
  max_roce?: number | string;
  max_debt_to_equity?: number | string;
  min_debt_to_equity?: number | string;
  min_ret_3m?: number | string;
  max_ret_3m?: number | string;
  min_ret_1y?: number | string;
  max_ret_1y?: number | string;
  min_eps_growth_yoy?: number | string;
  max_eps_growth_yoy?: number | string;
  min_profit_margin?: number | string;
  max_profit_margin?: number | string;
  min_revenue_growth?: number | string;
  max_revenue_growth?: number | string;
  min_dividend_yield?: number | string;
  max_dividend_yield?: number | string;
  min_beta?: number | string;
  max_beta?: number | string;
  min_current_ratio?: number | string;
  max_current_ratio?: number | string;
  min_ev_to_ebitda?: number | string;
  max_ev_to_ebitda?: number | string;
}

export interface PriceDataPoint {
  timestamp: string;
  local_timestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close?: number;
  volume?: number;
}

export interface TechnicalIndicator {
  timestamp: string;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema20?: number;
  ema50?: number;
  rsi14?: number;
}

export interface DailyDataResponse {
  ticker: string;
  data: PriceDataPoint[];
  technicals?: TechnicalIndicator[];
}

export interface MinuteDataResponse {
  ticker: string;
  data: PriceDataPoint[];
}

export interface NewsItem {
  ticker?: string;
  title: string;
  publisher?: string;
  link?: string;
  type?: string;
  provider_time_utc?: string;
  timestamp?: string;
  summary?: string;
  source?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentiment_score?: number;
  related_ticker?: string;
}

export interface FundamentalsResponse {
  ticker: string;
  info: Record<string, any>;
  fast_info?: Record<string, any>;
  balance_sheet?: Record<string, any>;
  income_statement?: Record<string, any>;
  cashflow_statement?: Record<string, any>;
  derived?: Record<string, any>;
}

export interface AIInsightsResponse {
  summary: string;
  bull_case: string;
  bear_case: string;
  key_points: string[];
  risk_factors: string[];
  metrics_to_watch: string[];
  time_horizon: string;
  risk_profile: string;
  data_warnings: string[];
  key_metrics?: string[]; // Legacy field
}

export interface RatioMetadata {
  key: string;
  label: string;
  category: string;
  source?: string; // 'screener', 'fundamentals', 'derived', 'info'
  field_path?: string; // Path to value in data structure
  format?: string; // 'number', 'percent', 'currency', 'multiple'
}

export interface RatiosResponse {
  ratios: RatioMetadata[];
}

export const api = {
  getTickers: async (): Promise<TickerBasic[]> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<TickerBasic[]>(`${API_BASE}/api/tickers`);
      return response.data;
    });
  },

  getScreener: async (params: {
    market?: string;
    search?: string;
    sector?: string;
    industry?: string;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
    [key: string]: any;
  }): Promise<ScreenerResponse> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<ScreenerResponse>(`${API_BASE}/api/screener`, { 
        params, 
        timeout: 60000, // 60 seconds for cold starts
        signal: params.signal,
      });
      return response.data;
    });
  },

  // Get FULL universe of all ingested tickers (not limited by screener.parquet)
  getUniverse: async (market?: string): Promise<{
    tickers: Array<{
      ticker: string;
      market: string;
      company_name?: string;
      current_price?: number;
      market_cap?: number;
      pe_trailing?: number;
      roe?: number;
      sector?: string;
      industry?: string;
      ret_3m?: number;
      ret_1y?: number;
      rsi?: number;
      has_screener_data: boolean;
    }>;
    total: number;
    by_market: Record<string, number>;
    markets_available: string[];
    screener_coverage: number;
  }> => {
    const response = await axios.get(`${API_BASE}/api/universe`, {
      params: market ? { market } : {},
      timeout: 90000, // 90 seconds for large dataset
    });
    return response.data;
  },

  getTickerDaily: async (ticker: string): Promise<DailyDataResponse> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<DailyDataResponse>(`${API_BASE}/api/ticker/${ticker}/daily`);
      return response.data;
    });
  },

  getTickerMinute: async (ticker: string): Promise<MinuteDataResponse> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<MinuteDataResponse>(`${API_BASE}/api/ticker/${ticker}/minute`);
      return response.data;
    });
  },

  getTickerFundamentals: async (ticker: string): Promise<FundamentalsResponse> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<FundamentalsResponse>(`${API_BASE}/api/ticker/${ticker}/fundamentals`);
      return response.data;
    });
  },

  getTickerNews: async (ticker: string): Promise<{
    stock_specific: NewsItem[];
    sector_peer: NewsItem[];
    generic: NewsItem[];
    sector?: string | null;
    industry?: string | null;
  }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<{
        stock_specific: NewsItem[];
        sector_peer: NewsItem[];
        generic: NewsItem[];
        sector?: string | null;
        industry?: string | null;
      }>(`${API_BASE}/api/ticker/${ticker}/news`, { timeout: 60000 });
      return response.data;
    });
  },

  getAIInsights: async (ticker: string, strategyContext?: string): Promise<AIInsightsResponse> => {
    return retryUntilSuccess(async () => {
      try {
        const response = await axios.post<AIInsightsResponse>(`${API_BASE}/api/ticker/${ticker}/ai-insights`, {
          strategy_context: strategyContext,
        });
        return response.data;
      } catch (error) {
        // Fallback to GET if POST fails
        const response = await axios.get<AIInsightsResponse>(`${API_BASE}/api/ticker/${ticker}/ai-insights`);
        return response.data;
      }
    });
  },

  getTickerPeers: async (ticker: string, limit = 10): Promise<{ peers: ScreenerRow[]; industry: string | null; sector: string | null }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get(`${API_BASE}/api/ticker/${ticker}/peers`, { params: { limit } });
      return response.data;
    });
  },

  getTickerQuarterly: async (ticker: string): Promise<{ ticker: string; quarters: any[] }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get(`${API_BASE}/api/ticker/${ticker}/quarterly`);
      return response.data;
    });
  },

  getSectorNews: async (ticker: string, limit = 20): Promise<{ news: NewsItem[]; industry: string | null; sector: string | null }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get(`${API_BASE}/api/ticker/${ticker}/sector-news`, { params: { limit } });
      return response.data;
    });
  },

  getRatios: async (): Promise<RatiosResponse> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<RatiosResponse>(`${API_BASE}/api/ratios`, { timeout: 60000 });
      return response.data;
    });
  },

  getMarkets: async (): Promise<Record<string, boolean>> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<Record<string, boolean>>(`${API_BASE}/api/markets`, { timeout: 60000 });
      return response.data;
    });
  },

  getHealth: async (): Promise<any> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<any>(`${API_BASE}/api/health`, { timeout: 60000 });
      return response.data;
    });
  },

  getFilterOptions: async (market?: string): Promise<{ sectors: string[]; industries: string[] }> => {
    return retryUntilSuccess(async () => {
      const params = market ? { market } : {};
      const response = await axios.get<{ sectors: string[]; industries: string[] }>(`${API_BASE}/api/meta/filters`, { 
        params,
        timeout: 60000 
      });
      return response.data;
    });
  },

  getTickerRealtime: async (ticker: string): Promise<{ current_price: number; change: number; change_percent: number; source: string }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<{ current_price: number; change: number; change_percent: number; source: string }>(`${API_BASE}/api/ticker/${ticker}/realtime`, { timeout: 60000 });
      return response.data;
    }, { delay: 1000, onRetry: (attempt, error) => console.warn(`[FinSight] Retrying getTickerRealtime (attempt ${attempt}):`, error.message) });
  },
  
  getRealtimePrice: async (ticker: string): Promise<{ price: number; change: number; changePercent: number }> => {
    return retryUntilSuccess(async () => {
      const response = await axios.get<{ current_price: number; change: number; change_percent: number; source: string }>(`${API_BASE}/api/ticker/${ticker}/realtime`, { timeout: 60000 });
      // Map to legacy format for backward compatibility
      return {
        price: response.data.current_price,
        change: response.data.change,
        changePercent: response.data.change_percent
      };
    }, { delay: 1000, onRetry: (attempt, error) => console.warn(`[FinSight] Retrying getRealtimePrice (attempt ${attempt}):`, error.message) });
  },

  // StrataX API methods - Use direct calls with error handling (no infinite retry)
  getStrataXOptionChain: async (symbol: string): Promise<any[]> => {
    try {
      const response = await axios.get(`${API_BASE}/api/stratax/option-chain`, { 
        params: { symbol },
        timeout: 60000 
      });
      return response.data.rows || [];
    } catch (error: any) {
      console.error('Error fetching option chain:', error);
      throw new Error(error.response?.data?.detail || error.message || 'Failed to fetch option chain');
    }
  },

  getStrataXAnalytics: async (symbol: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE}/api/stratax/analytics`, {
        params: { symbol },
        timeout: 60000
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching chain analytics:', error);
      return { available: false };
    }
  },

  getStrataXUnderlyings: async (): Promise<string[]> => {
    try {
      const response = await axios.get<string[]>(`${API_BASE}/api/stratax/underlyings`, { timeout: 10000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching underlyings:', error);
      // Return default list if API fails
      return ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
    }
  },

  getStrataXExpiries: async (symbol: string): Promise<string[]> => {
    try {
      const response = await axios.get<string[]>(`${API_BASE}/api/stratax/expiries`, { 
        params: { symbol },
        timeout: 60000 
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching expiries:', error);
      // Return empty array if API fails
      return [];
    }
  },

  getStrataXDataStatus: async (): Promise<{
    active_source: 'mock' | 'nse' | 'csv';
    fallback_used_recently: boolean;
    last_successful_nse_fetch: string | null;
    nse_available: boolean;
    csv_rows_loaded?: number;
  }> => {
    try {
      const response = await axios.get(`${API_BASE}/api/stratax/data-status`, { timeout: 60000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching data status:', error);
      // Return default CSV status if API fails
      return {
        active_source: 'csv',
        fallback_used_recently: false,
        last_successful_nse_fetch: null,
        nse_available: false,
        csv_rows_loaded: 0,
      };
    }
  },

  analyzeStrataXOptionChain: async (symbol: string, spotPrice: number): Promise<any> => {
    try {
      const response = await axios.post(`${API_BASE}/api/stratax/analyze-option-chain`, {
        symbol,
        spot_price: spotPrice,
      }, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error analyzing option chain:', error);
      throw new Error(error.response?.data?.detail || error.message || 'AI analysis failed');
    }
  },

  analyzeStrataXStrategy: async (strategyData: any): Promise<any> => {
    try {
      const response = await axios.post(`${API_BASE}/api/stratax/analyze-strategy`, strategyData, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error analyzing strategy:', error);
      throw new Error(error.response?.data?.detail || error.message || 'Strategy analysis failed');
    }
  },

  // Generic HTTP methods for new APIs
  get: async (url: string) => {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    return axios.get(fullUrl, { timeout: 30000 });
  },

  post: async (url: string, data?: any) => {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    return axios.post(fullUrl, data, { timeout: 30000 });
  },

  // Stock Intelligence APIs
  getStockIntelligence: async (ticker: string) => {
    const response = await axios.get(`${API_BASE}/api/intelligence/stock/${ticker}`, { timeout: 30000 });
    return response.data;
  },

  getInsiderHistory: async (ticker: string, days: number = 365) => {
    const response = await axios.get(`${API_BASE}/api/intelligence/stock/${ticker}/insider-history?days=${days}`, { timeout: 30000 });
    return response.data;
  },

  getFundHoldings: async (fundName: string) => {
    const response = await axios.get(`${API_BASE}/api/intelligence/fund-holdings/${fundName}`, { timeout: 30000 });
    return response.data;
  },

  getMarketOverview: async () => {
    const response = await axios.get(`${API_BASE}/api/intelligence/market-overview`, { timeout: 30000 });
    return response.data;
  },

  getConfluenceSignals: async (minSignals: number = 2) => {
    const response = await axios.get(`${API_BASE}/api/intelligence/signals/confluence?min_signals=${minSignals}`, { timeout: 30000 });
    return response.data;
  },

  // Analytics Engine APIs
  getChartPatterns: async (ticker: string, days: number = 90) => {
    const response = await axios.get(`${API_BASE}/api/analytics/patterns/${ticker}?days=${days}`, { timeout: 30000 });
    return response.data;
  },

  getVolumeProfile: async (ticker: string, days: number = 60) => {
    const response = await axios.get(`${API_BASE}/api/analytics/volume-profile/${ticker}?days=${days}`, { timeout: 30000 });
    return response.data;
  },

  getMultiFactorScore: async (ticker: string) => {
    const response = await axios.get(`${API_BASE}/api/analytics/score/${ticker}`, { timeout: 30000 });
    return response.data;
  },

  getMinuteAnalysis: async (ticker: string, minutes: number = 60) => {
    const response = await axios.get(`${API_BASE}/api/analytics/minute-analysis/${ticker}?minutes=${minutes}`, { timeout: 30000 });
    return response.data;
  },

  getTopMovers: async (market: string = 'US', limit: number = 20) => {
    const response = await axios.get(`${API_BASE}/api/analytics/screener/top-movers?market=${market}&limit=${limit}`, { timeout: 30000 });
    return response.data;
  },

  // Portfolio Intelligence API (Precomputed Snapshots)
  getPortfolioSnapshot: async (market: string, universe: string) => {
    try {
      const response = await axios.get(`${API_BASE}/api/portfolio-snapshot`, {
        params: { market, universe },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching portfolio snapshot:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Snapshot not available',
      };
    }
  },

  getStockSnapshot: async (market: string, ticker: string) => {
    try {
      const response = await axios.get(`${API_BASE}/api/stock-snapshot/${market}/${ticker}`, {
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching stock snapshot:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Snapshot not available',
      };
    }
  },

  getIntelligenceIndex: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/intelligence-index`, {
        timeout: 10000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching intelligence index:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Index not available',
      };
    }
  },

  // Get list of available stocks with intelligence data
  getIntelligenceStockList: async (market: string): Promise<{ success: boolean; stocks?: string[]; error?: string }> => {
    try {
      // Fetch the list of stocks from the public intelligence folder
      const response = await fetch(`/intelligence/${market}/`);
      if (!response.ok) {
        // Fallback: try to get from API
        const apiResponse = await axios.get(`${API_BASE}/api/intelligence-stocks/${market}`, {
          timeout: 10000,
        });
        return { success: true, stocks: apiResponse.data.stocks || [] };
      }
      // Parse directory listing (if available) or return empty
      return { success: true, stocks: [] };
    } catch (error: any) {
      console.error('Error fetching intelligence stock list:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Stock list not available',
        stocks: [],
      };
    }
  },

  // Legacy - redirects to precomputed snapshot
  getPortfolioSimulation: async (params: {
    market: string;
    universe: string;
    capital: number;
    start_date: string;
    end_date: string;
  }) => {
    // Redirect to precomputed snapshot
    try {
      const response = await axios.get(`${API_BASE}/api/portfolio-snapshot`, {
        params: { market: params.market, universe: params.universe },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching portfolio snapshot:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Snapshot not available',
      };
    }
  },

  // =====================================
  // TOP OPPORTUNITIES API
  // =====================================
  getTopOpportunities: async (market: string = 'US') => {
    try {
      const response = await axios.get(`${API_BASE}/api/top-opportunities/${market}`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching top opportunities:', error);
      return { success: false, opportunities: [], avoid_list: [], error: error.message };
    }
  },

  // =====================================
  // INSIDER FLOW API (SEC Form 4 + 13F)
  // =====================================
  getInsiderSignals: async (days: number = 90) => {
    try {
      const response = await axios.get(`${API_BASE}/api/insider-flow/signals`, { 
        params: { days },
        timeout: 30000 
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching insider signals:', error);
      return { signals: [], count: 0, error: error.message };
    }
  },

  getInsiderTrades: async (days: number = 30, limit: number = 100) => {
    try {
      const response = await axios.get(`${API_BASE}/api/insider-flow/trades`, { 
        params: { days, limit },
        timeout: 30000 
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching insider trades:', error);
      return { trades: [], count: 0, error: error.message };
    }
  },

  getInsiderSummary: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/insider-flow/summary`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching insider summary:', error);
      return { error: error.message };
    }
  },

  get13FSignals: async (days: number = 180) => {
    try {
      const response = await axios.get(`${API_BASE}/api/insider-flow/13f`, { 
        params: { days },
        timeout: 30000 
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching 13F signals:', error);
      return { signals: [], count: 0, error: error.message };
    }
  },

  // =====================================
  // SMART MONEY FLOW API (FII/DII)
  // =====================================
  getFiiDiiDaily: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/smart-money/daily`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching FII/DII daily:', error);
      return { data: [], count: 0, error: error.message };
    }
  },

  getFiiDiiOutlook: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/smart-money/outlook`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching FII/DII outlook:', error);
      return { error: error.message };
    }
  },

  getFiiDiiSummary: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/smart-money/summary`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching FII/DII summary:', error);
      return { error: error.message };
    }
  },

  getFiiDiiSignals: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/smart-money/signals`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching FII/DII signals:', error);
      return { signals: [], count: 0, error: error.message };
    }
  },

  // =====================================
  // ANNOUNCEMENTS API
  // =====================================
  getTodaysAnnouncements: async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/announcements/today`, { timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching today announcements:', error);
      return { status: 'ERROR', error: error.message };
    }
  },

  getStockAnnouncements: async (market: string, symbol: string, days: number = 90) => {
    try {
      const response = await axios.get(`${API_BASE}/api/announcements/${market}/${symbol}`, {
        params: { days },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching announcements for ${symbol}:`, error);
      return { status: 'ERROR', insider_trades: [], hedge_fund_holdings: [], error: error.message };
    }
  },

  getInsiderAnnouncements: async (params: { market?: string; symbol?: string; days?: number; limit?: number; signal_type?: string } = {}) => {
    try {
      const response = await axios.get(`${API_BASE}/api/announcements/insider`, {
        params,
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching insider announcements:', error);
      return { status: 'ERROR', trades: [], total: 0, error: error.message };
    }
  },

  get13FAnnouncements: async (params: { symbol?: string; fund?: string; limit?: number } = {}) => {
    try {
      const response = await axios.get(`${API_BASE}/api/announcements/13f`, {
        params,
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching 13F announcements:', error);
      return { status: 'ERROR', holdings: [], total: 0, error: error.message };
    }
  },

  getFiiDiiAnnouncements: async (days: number = 30) => {
    try {
      const response = await axios.get(`${API_BASE}/api/announcements/fii-dii`, {
        params: { days },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching FII/DII announcements:', error);
      return { status: 'ERROR', flows: [], total: 0, error: error.message };
    }
  },

  // =====================================
  // LIVE PRICE API
  // =====================================
  getLivePrice: async (symbol: string, market: string = 'US') => {
    try {
      // Construct Yahoo-compatible symbol
      const suffixes: Record<string, string> = {
        'US': '',
        'IN': '.NS',
        'UK': '.L',
        'JP': '.T',
        'CN': '.SS',
        'HK': '.HK',
        'SG': '.SI',
        'AU': '.AX',
      };
      const yahooSymbol = symbol.split('.')[0] + (suffixes[market] || '');
      
      const response = await axios.get(`${API_BASE}/api/ticker/${yahooSymbol}/realtime`, {
        timeout: 15000,
      });
      return {
        symbol,
        market,
        price: response.data?.price || response.data?.regularMarketPrice || null,
        change: response.data?.change || response.data?.regularMarketChange || null,
        changePercent: response.data?.changePercent || response.data?.regularMarketChangePercent || null,
        timestamp: new Date().toISOString(),
        status: response.data?.price ? 'LIVE' : 'UNAVAILABLE',
      };
    } catch (error: any) {
      return {
        symbol,
        market,
        price: null,
        change: null,
        changePercent: null,
        timestamp: new Date().toISOString(),
        status: 'UNAVAILABLE',
        error: error.message,
      };
    }
  },
};

