/**
 * ACTIVITY TRACKER DISABLED - PUBLIC MODE
 * No tracking, no Supabase, no data collection.
 */

import { useCallback } from 'react';

// Track page views - DISABLED
export function usePageTracker() {
  // No-op in public mode
}

// Track custom events - DISABLED
export function useEventTracker() {
  const track = useCallback((_action: string, _metadata?: Record<string, unknown>) => {
    // No-op in public mode
  }, []);

  return { track };
}

// Common tracked events
export const EVENTS = {
  STOCK_VIEWED: 'stock_viewed',
  AI_QUESTION_ASKED: 'ai_question_asked',
  WATCHLIST_ADDED: 'watchlist_added',
  WATCHLIST_REMOVED: 'watchlist_removed',
  STRATEGY_CREATED: 'strategy_created',
  PORTFOLIO_UPDATED: 'portfolio_updated',
  PAGE_VIEW: 'page_view',
  MODULE_CLICKED: 'module_clicked',
  TIME_SPENT: 'time_spent',
  CHART_INTERACTION: 'chart_interaction',
  FILTER_APPLIED: 'filter_applied',
  EXPORT_DATA: 'export_data',
  SIGNED_IN: 'signed_in',
  SIGNED_OUT: 'signed_out',
  SESSION_RESTORED: 'session_restored',
} as const;
