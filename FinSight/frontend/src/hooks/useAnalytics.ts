/**
 * ANALYTICS DISABLED - PUBLIC MODE
 * No tracking, no Supabase, no data collection.
 */

import { useCallback } from 'react';

// Main analytics hook - DISABLED
export function useAnalytics() {
  const track = useCallback((_action: string, _metadata?: Record<string, unknown>) => {
    // No-op in public mode
  }, []);

  const trackClick = useCallback((_element: string, _metadata?: Record<string, unknown>) => {
    // No-op in public mode
  }, []);

  const trackSearch = useCallback((_query: string, _results?: number) => {
    // No-op in public mode
  }, []);

  const trackStockView = useCallback((_ticker: string) => {
    // No-op in public mode
  }, []);

  const trackFeatureUse = useCallback((_feature: string, _metadata?: Record<string, unknown>) => {
    // No-op in public mode
  }, []);

  const trackError = useCallback((_error: string, _context?: Record<string, unknown>) => {
    // No-op in public mode
  }, []);

  return {
    track,
    trackClick,
    trackSearch,
    trackStockView,
    trackFeatureUse,
    trackError,
  };
}

// Session tracking - DISABLED
export function useSessionTracking() {
  // No-op in public mode
}

// Event types for reference
export const ANALYTICS_EVENTS = {
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  SESSION_HEARTBEAT: 'session_heartbeat',
  PAGE_VIEW: 'page_view',
  TIME_SPENT: 'time_spent',
  CLICK: 'click',
  SEARCH: 'search',
  FILTER: 'filter',
  SORT: 'sort',
  STOCK_VIEW: 'stock_view',
  CHART_INTERACTION: 'chart_interaction',
  AI_QUESTION: 'ai_question',
  WATCHLIST_ADD: 'watchlist_add',
  WATCHLIST_REMOVE: 'watchlist_remove',
  ALERT_CREATE: 'alert_create',
  ALERT_DELETE: 'alert_delete',
  PORTFOLIO_UPDATE: 'portfolio_update',
  STRATEGY_CREATE: 'strategy_create',
  EXPORT_DATA: 'export_data',
  SIGNED_IN: 'signed_in',
  SIGNED_OUT: 'signed_out',
  PROFILE_UPDATED: 'profile_updated',
  ERROR: 'error',
  API_ERROR: 'api_error',
} as const;
