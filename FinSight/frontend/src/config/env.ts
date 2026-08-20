/**
 * Environment Configuration - Single Source of Truth
 * 
 * RULES:
 * - All environment-dependent config must come from here
 * - No hardcoded URLs anywhere else in the codebase
 * - Supports local dev + cloud deployment (Render/Vercel)
 */

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;
export const MODE = import.meta.env.MODE; // 'development' | 'production'

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * FinSight Backend API URL
 * Priority: VITE_API_URL > production Render > localhost fallback
 */
const PRODUCTION_API = 'https://finvest-api-gwkz.onrender.com';
const DEV_API = 'http://localhost:8001';

export const API_BASE_URL: string = (() => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.length > 0) return envUrl;
  if (import.meta.env.PROD) return PRODUCTION_API;
  return DEV_API;
})();

/**
 * FinDash URL - Markets page
 * Will be replaced by native module once component extraction is complete
 */
export const FINDASH_URL: string = 
  import.meta.env.VITE_FINDASH_URL || 
  'https://findash.fintaxlife.com';

// =============================================================================
// TIMEOUTS
// =============================================================================

export const TIMEOUTS = {
  /** Hard timeout for DataCore loaders - Increased for Render free tier cold starts */
  DATA_CORE_HARD_TIMEOUT: 60000, // 60 seconds (Render free tier can take 50s+ to cold start)
  
  /** Timeout for health checks */
  HEALTH_CHECK_TIMEOUT: 60000, // 60 seconds (allow cold start)
  
  /** Default API request timeout */
  API_DEFAULT_TIMEOUT: 60000, // 60 seconds (allow cold start)
  
  /** Timeout for large queries (screener) */
  API_LARGE_QUERY_TIMEOUT: 90000, // 90 seconds (cold start + processing)
  
  /** Stale threshold for data sources */
  STALE_THRESHOLD: 5 * 60 * 1000, // 5 minutes
  
  /** Auto-refresh interval */
  REFRESH_INTERVAL: 60 * 1000, // 1 minute
} as const;

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

export const RETRY_CONFIG = {
  /** Maximum retry attempts */
  MAX_RETRIES: 2,
  
  /** Base delay between retries (ms) */
  RETRY_DELAY: 1000,
  
  /** Retry on these HTTP status codes */
  RETRY_STATUS_CODES: [500, 502, 503, 504],
  
  /** Never retry on render cycles - only explicit loader functions */
  RETRY_ON_RENDER: false,
} as const;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Feature flags control what's enabled in the UI.
 * Disabled features show explicit "Disabled" state.
 */
export const FEATURES = {
  // ===== CORE MODULES (Always Enabled) =====
  /** FinSight Intelligence - Screener, Signals */
  FINSIGHT_INTELLIGENCE: true,
  
  /** FinDash Markets - Live charts, Yahoo data */
  FINDASH_MARKETS: true,
  
  /** Screener - Stock filtering */
  SCREENER: true,
  
  /** Smart Money - Insider trades, 13F filings */
  SMART_MONEY: true,
  
  /** Portfolio Core - Holdings, Demats */
  PORTFOLIO_CORE: true,
  
  /** Tax Engine - STCG/LTCG computation */
  TAX_ENGINE: true,
  
  /** Capital Allocator - Multi-demat planning */
  CAPITAL_ALLOCATOR: true,
  
  // ===== DISABLED UNTIL STABLE =====
  /** FinBot - AI assistant (requires stable DataCore) */
  FINBOT: false,
  
  /** AI Pilot - Planning assistant (requires stable engines) */
  AI_PILOT: false,
  
  /** Execution - Order placement (requires stable everything) */
  EXECUTION: false,
  
  /** Auto Trading - Automated execution (far future) */
  AUTO_TRADING: false,
} as const;

// =============================================================================
// DATA SOURCES
// =============================================================================

export const DATA_SOURCES = {
  FINSIGHT: {
    id: 'finsight',
    name: 'FinSight Intelligence',
    description: 'Screener, signals, fundamentals',
  },
  FINDASH: {
    id: 'findash',
    name: 'FinDash Markets',
    description: 'Live market data from Yahoo Finance',
  },
  INSIDER: {
    id: 'insider',
    name: 'Insider Trades',
    description: 'SEC Form 4 filings',
  },
  HEDGE_FUND: {
    id: 'hedge_fund',
    name: 'Hedge Fund 13F',
    description: 'Quarterly holdings from 13F filings',
  },
  FII_DII: {
    id: 'fii_dii',
    name: 'FII/DII Flows',
    description: 'Indian institutional flows',
  },
} as const;

// =============================================================================
// DEMAT INTEGRATION CONFIGURATION
// =============================================================================

export const DEMAT_CONFIG = {
  /** Available demat providers */
  PROVIDERS: {
    csv: { enabled: true, name: 'CSV Import' },
    zerodha: { enabled: false, name: 'Zerodha' },
    groww: { enabled: false, name: 'Groww' },
    upstox: { enabled: false, name: 'Upstox' },
    angelone: { enabled: false, name: 'Angel One' },
    dhan: { enabled: false, name: 'Dhan' },
  },
  
  /** Allow demo mode (DISABLED in production) */
  ALLOW_DEMO_MODE: false,
  
  /** Auto-sync interval (ms) */
  AUTO_SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
} as const;

// =============================================================================
// TAX CONFIGURATION (India FY 2024-25 - Budget 2024 Updated)
// =============================================================================

/**
 * Tax config is now defined in engines/TaxEngine.ts for single source of truth.
 * Use TAX_CONFIG from TaxEngine for tax calculations.
 */
export { TAX_CONFIG } from '../engines/TaxEngine';

// =============================================================================
// MARKET CONFIGURATION
// =============================================================================

export const SUPPORTED_MARKETS = {
  US: { 
    name: 'United States', 
    flag: '🇺🇸', 
    currency: 'USD', 
    enabled: true,
    timezone: 'America/New_York',
  },
  IN: { 
    name: 'India', 
    flag: '🇮🇳', 
    currency: 'INR', 
    enabled: true,
    timezone: 'Asia/Kolkata',
  },
  HK: { 
    name: 'Hong Kong', 
    flag: '🇭🇰', 
    currency: 'HKD', 
    enabled: true,
    timezone: 'Asia/Hong_Kong',
  },
  UK: { 
    name: 'United Kingdom', 
    flag: '🇬🇧', 
    currency: 'GBP', 
    enabled: true,
    timezone: 'Europe/London',
  },
  AU: { 
    name: 'Australia', 
    flag: '🇦🇺', 
    currency: 'AUD', 
    enabled: true,
    timezone: 'Australia/Sydney',
  },
} as const;

// =============================================================================
// DEBUG / LOGGING
// =============================================================================

export const DEBUG = {
  /** Log API calls */
  LOG_API_CALLS: IS_DEV,
  
  /** Log state changes in DataCore */
  LOG_STATE_CHANGES: IS_DEV && false,
  
  /** Log performance metrics */
  LOG_PERFORMANCE: IS_DEV && false,
  
  /** Show debug panel in UI */
  SHOW_DEBUG_PANEL: IS_DEV && false,
} as const;

// =============================================================================
// VALIDATION - Log config on load (dev only)
// =============================================================================

if (IS_DEV) {
  console.log('[Config] FinVest Environment:');
  console.log('  API_BASE_URL:', API_BASE_URL);
  console.log('  MODE:', MODE);
  console.log('  Features enabled:', Object.entries(FEATURES).filter(([_, v]) => v).map(([k]) => k).join(', '));
  console.log('  Features disabled:', Object.entries(FEATURES).filter(([_, v]) => !v).map(([k]) => k).join(', '));
}

// Type exports for strict typing
export type FeatureKey = keyof typeof FEATURES;
export type DataSourceKey = keyof typeof DATA_SOURCES;
export type MarketKey = keyof typeof SUPPORTED_MARKETS;
