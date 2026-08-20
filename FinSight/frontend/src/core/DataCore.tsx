/**
 * DataCore - Centralized Data Loading System
 * 
 * RULES (NON-NEGOTIABLE):
 * - Every source resolves to: LIVE | STALE | FAILED
 * - Hard timeout: 15 seconds (configurable)
 * - Never stays in LOADING indefinitely
 * - Stores: lastUpdated, errorReason
 * - UI must reflect truth, not optimism
 * - Max 2 retries, no render cycle retries
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { api, withRetry } from '../services/apiClient';
import { TIMEOUTS, RETRY_CONFIG } from '../config/env';

// =============================================================================
// TYPES
// =============================================================================

export type DataStatus = 'idle' | 'loading' | 'live' | 'stale' | 'failed';

// Reason codes for status - enables UI to distinguish between different failure modes
export type StatusReason = 
  | 'LOADING'           // Currently fetching
  | 'LIVE'              // Fresh data available
  | 'STALE'             // Data older than threshold
  | 'FILTERED'          // Data was filtered out (not an error)
  | 'NOT_SUPPORTED'     // Feature not supported for this market
  | 'NOT_PROCESSED'     // Pipeline hasn't processed this yet
  | 'TIMEOUT'           // Request timed out
  | 'NETWORK_ERROR'     // Network/connectivity issue
  | 'PIPELINE_DOWN'     // Backend pipeline error
  | 'NO_DATA'           // No data available (empty response)
  | 'UNKNOWN';          // Catch-all

export interface DataSourceState<T> {
  data: T | null;
  status: DataStatus;
  statusReason: StatusReason;
  lastUpdated: string | null;
  error: string | null;
  dataAge: number | null;  // Age in seconds since lastUpdated
}

// FinSight Screener Row type
export interface ScreenerRow {
  ticker: string;
  market: string;
  signal?: string;
  conviction?: number;
  ret_1m?: number;
  ret_3m?: number;
  ret_1y?: number;
  pe_trailing?: number;
  market_cap?: number;
  sector?: string;
  industry?: string;
  [key: string]: any;
}

export interface ScreenerData {
  rows: ScreenerRow[];
  total_count: number;
}

// Smart Money Types - MUST MATCH BACKEND RESPONSE SCHEMA
export interface InsiderTrade {
  symbol: string;  // ticker symbol
  insider: string; // insider name
  type: string;    // "BUY" or "SELL"
  value: number;   // transaction value
  shares?: number;
  price?: number;
  date?: string;
}

export interface HedgeFundSignal {
  ticker: string | null; // ticker symbol (from CUSIP mapper)
  name: string;          // company name
  cusip: string;         // CUSIP identifier
  num_funds: number;     // number of funds
  total_value: number;   // total position value
  increases: number;     // funds that increased
  decreases: number;     // funds that decreased
  new_positions: number;
  exits: number;
  net_flow: number;      // net fund flow
  date?: string;
}

// Top Opportunities from Intelligence Pipeline
export interface Opportunity {
  rank: number;
  ticker: string;
  market: string;
  edge_score: number;
  intent: string;
  conviction: number;
  expected_return_p50: number;
  cvar_95: number;
  regime: string;
  regime_alignment: number;
  risk_summary: string;
  why_this_beats_alternatives: string;
  recommended_position_pct: number;
  max_position_pct: number;
}

export interface TopOpportunitiesData {
  market: string;
  generated_at: string;
  total_stocks: number;
  initiate_candidates: number;
  avoid_candidates: number;
  intent_counts: Record<string, number>;
  opportunities: Opportunity[];
  avoid_list: Opportunity[];
}

// FII/DII Flow Data - MUST MATCH BACKEND /api/smart-money/summary
export interface FiiDiiData {
  latest_date?: string;
  fii_today?: number;
  dii_today?: number;
  total_today?: number;
  fii_5d?: number;
  dii_5d?: number;
  fii_20d?: number;
  dii_20d?: number;
  regime?: string;
  flow_signal?: string;
  data_days?: number;
  error?: string;
}

// Full DataCore State
export interface DataCoreState {
  finSight: DataSourceState<ScreenerData>;
  topOpportunities: DataSourceState<TopOpportunitiesData>;
  smartMoney: {
    insider: DataSourceState<InsiderTrade[]>;
    hedgeFund: DataSourceState<HedgeFundSignal[]>;
    fiiDii: DataSourceState<FiiDiiData>;
  };
  health: {
    apiReachable: boolean;
    lastCheck: string | null;
    backendUrl: string;
  };
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const createInitialDataSource = <T,>(): DataSourceState<T> => ({
  data: null,
  status: 'idle',
  statusReason: 'LOADING',
  lastUpdated: null,
  error: null,
  dataAge: null,
});

const initialState: DataCoreState = {
  finSight: createInitialDataSource<ScreenerData>(),
  topOpportunities: createInitialDataSource<TopOpportunitiesData>(),
  smartMoney: {
    insider: createInitialDataSource<InsiderTrade[]>(),
    hedgeFund: createInitialDataSource<HedgeFundSignal[]>(),
    fiiDii: createInitialDataSource<FiiDiiData>(),
  },
  health: {
    apiReachable: false,
    lastCheck: null,
    backendUrl: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://finvest-api-gwkz.onrender.com' : 'http://localhost:8001'),
  },
};

// =============================================================================
// TIMEOUT UTILITY - HARD TIMEOUT, NEVER EXCEEDS
// =============================================================================

async function withHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${errorMessage} (${timeoutMs}ms exceeded)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// =============================================================================
// ACTIONS
// =============================================================================

type DataCoreAction =
  // FinSight
  | { type: 'FINSIGHT_LOADING' }
  | { type: 'FINSIGHT_SUCCESS'; payload: ScreenerData }
  | { type: 'FINSIGHT_FAILED'; payload: string }
  | { type: 'FINSIGHT_STALE' }
  // Top Opportunities
  | { type: 'OPPORTUNITIES_LOADING' }
  | { type: 'OPPORTUNITIES_SUCCESS'; payload: TopOpportunitiesData }
  | { type: 'OPPORTUNITIES_FAILED'; payload: string }
  // Insider
  | { type: 'INSIDER_LOADING' }
  | { type: 'INSIDER_SUCCESS'; payload: InsiderTrade[] }
  | { type: 'INSIDER_FAILED'; payload: string }
  // Hedge Fund
  | { type: 'HEDGEFUND_LOADING' }
  | { type: 'HEDGEFUND_SUCCESS'; payload: HedgeFundSignal[] }
  | { type: 'HEDGEFUND_FAILED'; payload: string }
  // FII/DII
  | { type: 'FIIDII_LOADING' }
  | { type: 'FIIDII_SUCCESS'; payload: FiiDiiData }
  | { type: 'FIIDII_FAILED'; payload: string }
  // Health
  | { type: 'HEALTH_SUCCESS' }
  | { type: 'HEALTH_FAILED' };

// =============================================================================
// REDUCER
// =============================================================================

// Helper to determine status reason from error message
function getStatusReasonFromError(error: string): StatusReason {
  const lowerError = error.toLowerCase();
  if (lowerError.includes('timeout')) return 'TIMEOUT';
  if (lowerError.includes('network') || lowerError.includes('fetch')) return 'NETWORK_ERROR';
  if (lowerError.includes('not supported')) return 'NOT_SUPPORTED';
  if (lowerError.includes('not processed') || lowerError.includes('not available')) return 'NOT_PROCESSED';
  if (lowerError.includes('filtered')) return 'FILTERED';
  if (lowerError.includes('pipeline') || lowerError.includes('backend')) return 'PIPELINE_DOWN';
  if (lowerError.includes('empty') || lowerError.includes('no data')) return 'NO_DATA';
  return 'UNKNOWN';
}

function dataCoreReducer(state: DataCoreState, action: DataCoreAction): DataCoreState {
  const now = new Date().toISOString();

  switch (action.type) {
    // FinSight
    case 'FINSIGHT_LOADING':
      return {
        ...state,
        finSight: { ...state.finSight, status: 'loading', statusReason: 'LOADING', error: null },
      };
    case 'FINSIGHT_SUCCESS':
      return {
        ...state,
        finSight: {
          data: action.payload,
          status: 'live',
          statusReason: 'LIVE',
          lastUpdated: now,
          error: null,
          dataAge: 0,
        },
      };
    case 'FINSIGHT_FAILED':
      return {
        ...state,
        finSight: {
          ...state.finSight,
          status: 'failed',
          statusReason: getStatusReasonFromError(action.payload),
          error: action.payload,
        },
      };
    case 'FINSIGHT_STALE':
      return {
        ...state,
        finSight: { ...state.finSight, status: 'stale', statusReason: 'STALE' },
      };

    // Top Opportunities
    case 'OPPORTUNITIES_LOADING':
      return {
        ...state,
        topOpportunities: { ...state.topOpportunities, status: 'loading', statusReason: 'LOADING', error: null },
      };
    case 'OPPORTUNITIES_SUCCESS':
      return {
        ...state,
        topOpportunities: {
          data: action.payload,
          status: 'live',
          statusReason: 'LIVE',
          lastUpdated: now,
          error: null,
          dataAge: 0,
        },
      };
    case 'OPPORTUNITIES_FAILED':
      return {
        ...state,
        topOpportunities: {
          ...state.topOpportunities,
          status: 'failed',
          statusReason: getStatusReasonFromError(action.payload),
          error: action.payload,
        },
      };

    // Insider
    case 'INSIDER_LOADING':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          insider: { ...state.smartMoney.insider, status: 'loading', statusReason: 'LOADING', error: null },
        },
      };
    case 'INSIDER_SUCCESS':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          insider: {
            data: action.payload,
            status: 'live',
            statusReason: 'LIVE',
            lastUpdated: now,
            error: null,
            dataAge: 0,
          },
        },
      };
    case 'INSIDER_FAILED':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          insider: {
            ...state.smartMoney.insider,
            status: 'failed',
            statusReason: getStatusReasonFromError(action.payload),
            error: action.payload,
          },
        },
      };

    // Hedge Fund
    case 'HEDGEFUND_LOADING':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          hedgeFund: { ...state.smartMoney.hedgeFund, status: 'loading', statusReason: 'LOADING', error: null },
        },
      };
    case 'HEDGEFUND_SUCCESS':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          hedgeFund: {
            data: action.payload,
            status: 'live',
            statusReason: 'LIVE',
            lastUpdated: now,
            error: null,
            dataAge: 0,
          },
        },
      };
    case 'HEDGEFUND_FAILED':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          hedgeFund: {
            ...state.smartMoney.hedgeFund,
            status: 'failed',
            statusReason: getStatusReasonFromError(action.payload),
            error: action.payload,
          },
        },
      };

    // FII/DII
    case 'FIIDII_LOADING':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          fiiDii: { ...state.smartMoney.fiiDii, status: 'loading', statusReason: 'LOADING', error: null },
        },
      };
    case 'FIIDII_SUCCESS':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          fiiDii: {
            data: action.payload,
            status: 'live',
            statusReason: 'LIVE',
            lastUpdated: now,
            error: null,
            dataAge: 0,
          },
        },
      };
    case 'FIIDII_FAILED':
      return {
        ...state,
        smartMoney: {
          ...state.smartMoney,
          fiiDii: {
            ...state.smartMoney.fiiDii,
            status: 'failed',
            statusReason: getStatusReasonFromError(action.payload),
            error: action.payload,
          },
        },
      };

    // Health
    case 'HEALTH_SUCCESS':
      return {
        ...state,
        health: {
          ...state.health,
          apiReachable: true,
          lastCheck: now,
        },
      };
    case 'HEALTH_FAILED':
      return {
        ...state,
        health: {
          ...state.health,
          apiReachable: false,
          lastCheck: now,
        },
      };

    default:
      return state;
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

interface DataCoreContextType {
  state: DataCoreState;
  loadFinSight: () => Promise<void>;
  loadTopOpportunities: () => Promise<void>;
  loadInsiderTrades: () => Promise<void>;
  loadHedgeFundSignals: () => Promise<void>;
  loadFiiDii: () => Promise<void>;
  loadAllData: () => Promise<void>;
  checkHealth: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const DataCoreContext = createContext<DataCoreContextType | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function DataCoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(dataCoreReducer, initialState);
  
  // Track loading state to prevent duplicate requests
  const loadingRef = useRef<Record<string, boolean>>({});
  const timeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(timeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  // ===== HEALTH CHECK =====
  const checkHealth = useCallback(async () => {
    try {
      await withHardTimeout(
        api.health(),
        TIMEOUTS.HEALTH_CHECK_TIMEOUT,
        'Health check'
      );
      if (mountedRef.current) {
        dispatch({ type: 'HEALTH_SUCCESS' });
      }
    } catch {
      if (mountedRef.current) {
        dispatch({ type: 'HEALTH_FAILED' });
      }
    }
  }, []);

  // ===== FINSIGHT LOADER =====
  const loadFinSight = useCallback(async () => {
    if (loadingRef.current['finSight']) return;
    loadingRef.current['finSight'] = true;
    
    dispatch({ type: 'FINSIGHT_LOADING' });
    
    // Set hard timeout failsafe
    timeoutRef.current['finSight'] = setTimeout(() => {
      if (loadingRef.current['finSight'] && mountedRef.current) {
        dispatch({ type: 'FINSIGHT_FAILED', payload: 'Hard timeout exceeded (15s)' });
        loadingRef.current['finSight'] = false;
      }
    }, TIMEOUTS.DATA_CORE_HARD_TIMEOUT);

    try {
      const data = await withHardTimeout(
        withRetry(() => api.getScreener({ limit: 2000 }), {
          maxRetries: RETRY_CONFIG.MAX_RETRIES,
          retryDelay: RETRY_CONFIG.RETRY_DELAY,
        }),
        TIMEOUTS.DATA_CORE_HARD_TIMEOUT,
        'FinSight screener'
      );

      clearTimeout(timeoutRef.current['finSight']);
      
      if (mountedRef.current) {
        dispatch({
          type: 'FINSIGHT_SUCCESS',
          payload: {
            rows: data.rows || [],
            total_count: data.total_count || data.rows?.length || 0,
          },
        });
      }
    } catch (e: any) {
      clearTimeout(timeoutRef.current['finSight']);
      if (mountedRef.current) {
        const errorMsg = e.message?.includes('TIMEOUT')
          ? 'Request timed out - backend may be slow'
          : e.message || 'Failed to load FinSight data';
        dispatch({ type: 'FINSIGHT_FAILED', payload: errorMsg });
      }
    } finally {
      loadingRef.current['finSight'] = false;
    }
  }, []);

  // ===== TOP OPPORTUNITIES LOADER =====
  const loadTopOpportunities = useCallback(async () => {
    if (loadingRef.current['opportunities']) return;
    loadingRef.current['opportunities'] = true;
    
    dispatch({ type: 'OPPORTUNITIES_LOADING' });
    
    timeoutRef.current['opportunities'] = setTimeout(() => {
      if (loadingRef.current['opportunities'] && mountedRef.current) {
        dispatch({ type: 'OPPORTUNITIES_FAILED', payload: 'Hard timeout exceeded (15s)' });
        loadingRef.current['opportunities'] = false;
      }
    }, TIMEOUTS.DATA_CORE_HARD_TIMEOUT);

    try {
      const data = await withHardTimeout(
        withRetry(() => api.getTopOpportunities('US'), {
          maxRetries: RETRY_CONFIG.MAX_RETRIES,
          retryDelay: RETRY_CONFIG.RETRY_DELAY,
        }),
        TIMEOUTS.DATA_CORE_HARD_TIMEOUT,
        'Top opportunities'
      );

      clearTimeout(timeoutRef.current['opportunities']);
      
      if (mountedRef.current) {
        dispatch({
          type: 'OPPORTUNITIES_SUCCESS',
          payload: {
            market: data.market || 'US',
            generated_at: data.generated_at || new Date().toISOString(),
            total_stocks: data.total_stocks || 0,
            initiate_candidates: data.initiate_candidates || 0,
            avoid_candidates: data.avoid_candidates || 0,
            intent_counts: data.intent_counts || {},
            opportunities: data.opportunities || [],
            avoid_list: data.avoid_list || [],
          },
        });
      }
    } catch (e: any) {
      clearTimeout(timeoutRef.current['opportunities']);
      if (mountedRef.current) {
        const errorMsg = e.message?.includes('TIMEOUT')
          ? 'Request timed out'
          : e.message || 'Failed to load opportunities';
        dispatch({ type: 'OPPORTUNITIES_FAILED', payload: errorMsg });
      }
    } finally {
      loadingRef.current['opportunities'] = false;
    }
  }, []);

  // ===== INSIDER TRADES LOADER =====
  const loadInsiderTrades = useCallback(async () => {
    if (loadingRef.current['insider']) return;
    loadingRef.current['insider'] = true;
    
    dispatch({ type: 'INSIDER_LOADING' });
    
    timeoutRef.current['insider'] = setTimeout(() => {
      if (loadingRef.current['insider'] && mountedRef.current) {
        dispatch({ type: 'INSIDER_FAILED', payload: 'Hard timeout exceeded (15s)' });
        loadingRef.current['insider'] = false;
      }
    }, TIMEOUTS.DATA_CORE_HARD_TIMEOUT);

    try {
      const data = await withHardTimeout(
        withRetry(() => api.getInsiderTrades(30, 50), { // 30 days instead of 7 for more data
          maxRetries: RETRY_CONFIG.MAX_RETRIES,
          retryDelay: RETRY_CONFIG.RETRY_DELAY,
        }),
        TIMEOUTS.DATA_CORE_HARD_TIMEOUT,
        'Insider trades'
      );

      clearTimeout(timeoutRef.current['insider']);
      
      if (mountedRef.current) {
        // Map to InsiderTrade interface - fields from backend
        const trades: InsiderTrade[] = (data.trades || []).map((t: any) => ({
          symbol: t.symbol,
          insider: t.insider,
          type: t.type, // "BUY" or "SELL"
          value: t.value || 0,
          shares: t.shares,
          price: t.price,
          date: t.date,
        }));
        dispatch({ type: 'INSIDER_SUCCESS', payload: trades });
      }
    } catch (e: any) {
      clearTimeout(timeoutRef.current['insider']);
      if (mountedRef.current) {
        const errorMsg = e.message?.includes('TIMEOUT')
          ? 'Request timed out'
          : e.message || 'Failed to load insider trades';
        dispatch({ type: 'INSIDER_FAILED', payload: errorMsg });
      }
    } finally {
      loadingRef.current['insider'] = false;
    }
  }, []);

  // ===== HEDGE FUND LOADER =====
  const loadHedgeFundSignals = useCallback(async () => {
    if (loadingRef.current['hedgeFund']) return;
    loadingRef.current['hedgeFund'] = true;
    
    dispatch({ type: 'HEDGEFUND_LOADING' });
    
    timeoutRef.current['hedgeFund'] = setTimeout(() => {
      if (loadingRef.current['hedgeFund'] && mountedRef.current) {
        dispatch({ type: 'HEDGEFUND_FAILED', payload: 'Hard timeout exceeded (15s)' });
        loadingRef.current['hedgeFund'] = false;
      }
    }, TIMEOUTS.DATA_CORE_HARD_TIMEOUT);

    try {
      const data = await withHardTimeout(
        withRetry(() => api.get13FSignals(90), {
          maxRetries: RETRY_CONFIG.MAX_RETRIES,
          retryDelay: RETRY_CONFIG.RETRY_DELAY,
        }),
        TIMEOUTS.DATA_CORE_HARD_TIMEOUT,
        'Hedge fund 13F'
      );

      clearTimeout(timeoutRef.current['hedgeFund']);
      
      if (mountedRef.current) {
        // Map to HedgeFundSignal interface - fields from backend (with ticker from CUSIP mapper)
        const signals: HedgeFundSignal[] = (data.signals || []).map((s: any) => ({
          ticker: s.ticker || null, // Now includes ticker from CUSIP mapper
          name: s.name || 'Unknown',
          cusip: s.cusip,
          num_funds: s.num_funds || 0,
          total_value: s.total_value || 0,
          increases: s.increases || 0,
          decreases: s.decreases || 0,
          new_positions: s.new_positions || 0,
          exits: s.exits || 0,
          net_flow: s.net_flow || 0,
          date: s.date,
        }));
        dispatch({ type: 'HEDGEFUND_SUCCESS', payload: signals });
      }
    } catch (e: any) {
      clearTimeout(timeoutRef.current['hedgeFund']);
      if (mountedRef.current) {
        const errorMsg = e.message?.includes('TIMEOUT')
          ? 'Request timed out'
          : e.message || 'Failed to load hedge fund data';
        dispatch({ type: 'HEDGEFUND_FAILED', payload: errorMsg });
      }
    } finally {
      loadingRef.current['hedgeFund'] = false;
    }
  }, []);

  // ===== FII/DII LOADER =====
  const loadFiiDii = useCallback(async () => {
    if (loadingRef.current['fiiDii']) return;
    loadingRef.current['fiiDii'] = true;
    
    dispatch({ type: 'FIIDII_LOADING' });
    
    timeoutRef.current['fiiDii'] = setTimeout(() => {
      if (loadingRef.current['fiiDii'] && mountedRef.current) {
        dispatch({ type: 'FIIDII_FAILED', payload: 'Hard timeout exceeded (15s)' });
        loadingRef.current['fiiDii'] = false;
      }
    }, TIMEOUTS.DATA_CORE_HARD_TIMEOUT);

    try {
      const data = await withHardTimeout(
        withRetry(() => api.getFiiDiiSummary(), {
          maxRetries: RETRY_CONFIG.MAX_RETRIES,
          retryDelay: RETRY_CONFIG.RETRY_DELAY,
        }),
        TIMEOUTS.DATA_CORE_HARD_TIMEOUT,
        'FII/DII data'
      );

      clearTimeout(timeoutRef.current['fiiDii']);
      
      if (mountedRef.current) {
        if (data.error) {
          dispatch({ type: 'FIIDII_FAILED', payload: data.error });
        } else {
          dispatch({
            type: 'FIIDII_SUCCESS',
            payload: {
              latest_date: data.latest_date,
              fii_today: data.fii_today,
              dii_today: data.dii_today,
              total_today: data.total_today,
              fii_5d: data.fii_5d,
              dii_5d: data.dii_5d,
              fii_20d: data.fii_20d,
              dii_20d: data.dii_20d,
              regime: data.regime,
              flow_signal: data.flow_signal,
              data_days: data.data_days,
            },
          });
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutRef.current['fiiDii']);
      if (mountedRef.current) {
        const errorMsg = e.message?.includes('TIMEOUT')
          ? 'Request timed out'
          : e.message || 'Failed to load FII/DII data';
        dispatch({ type: 'FIIDII_FAILED', payload: errorMsg });
      }
    } finally {
      loadingRef.current['fiiDii'] = false;
    }
  }, []);

  // ===== LOAD ALL DATA =====
  const loadAllData = useCallback(async () => {
    // Run all loaders in parallel
    await Promise.allSettled([
      loadFinSight(),
      loadTopOpportunities(),
      loadInsiderTrades(),
      loadHedgeFundSignals(),
      loadFiiDii(),
    ]);
  }, [loadFinSight, loadTopOpportunities, loadInsiderTrades, loadHedgeFundSignals, loadFiiDii]);

  // ===== REFRESH ALL =====
  const refreshAll = useCallback(async () => {
    // Clear any pending timeouts
    Object.values(timeoutRef.current).forEach(clearTimeout);
    timeoutRef.current = {};
    
    // Clear loading locks
    loadingRef.current = {};
    
    // Reload everything
    await checkHealth();
    await loadAllData();
  }, [checkHealth, loadAllData]);

  // ===== INITIAL LOAD + STALE CHECK =====
  useEffect(() => {
    // Initial health check and data load
    checkHealth();
    loadAllData();

    // Check for stale data every minute
    const staleCheckInterval = setInterval(() => {
      const now = Date.now();
      
      // Check FinSight staleness
      if (state.finSight.lastUpdated && state.finSight.status === 'live') {
        const age = now - new Date(state.finSight.lastUpdated).getTime();
        if (age > TIMEOUTS.STALE_THRESHOLD) {
          dispatch({ type: 'FINSIGHT_STALE' });
        }
      }
    }, 60000);

    return () => clearInterval(staleCheckInterval);
  }, []); // Only run once on mount

  const value: DataCoreContextType = {
    state,
    loadFinSight,
    loadTopOpportunities,
    loadInsiderTrades,
    loadHedgeFundSignals,
    loadFiiDii,
    loadAllData,
    checkHealth,
    refreshAll,
  };

  return (
    <DataCoreContext.Provider value={value}>
      {children}
    </DataCoreContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useDataCore(): DataCoreContextType {
  const context = useContext(DataCoreContext);
  if (!context) {
    throw new Error('useDataCore must be used within DataCoreProvider');
  }
  return context;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export function getStatusColor(status: DataStatus): string {
  switch (status) {
    case 'live': return 'text-green-400';
    case 'loading': return 'text-blue-400';
    case 'stale': return 'text-amber-400';
    case 'failed': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

export function getStatusText(status: DataStatus): string {
  switch (status) {
    case 'live': return 'LIVE';
    case 'loading': return 'LOADING';
    case 'stale': return 'STALE';
    case 'failed': return 'FAILED';
    default: return 'IDLE';
  }
}
