/**
 * Internal Intelligence API Client
 * 
 * AUTHORITY: LOCKED
 * 
 * This module provides client-side access to FinSight intelligence.
 * All data comes from precomputed FinSight outputs.
 * No live computation. No reinterpretation.
 */

const API_BASE = '/api/intelligence';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthorityStatus {
  authority: 'LOCKED';
  finsight_version: string;
  last_updated: string;
  data_freshness: {
    is_fresh: boolean;
    hours_old: number;
    threshold_hours: number;
    warning: string | null;
  };
  markets: {
    US: MarketStatus;
    IN: MarketStatus;
  };
  schema_version: string;
}

export interface MarketStatus {
  status: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';
  stocks_available: number;
  last_intelligence_update: string;
}

export interface TopOpportunity {
  ticker: string;
  company_name: string;
  intent: 'INITIATE' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'AVOID';
  probability: number;
  confidence: number;
  regime: string;
  current_price: number | null;
  change_1d: number | null;
  change_1m: number | null;
  sector: string | null;
  industry: string | null;
}

export interface TopOpportunitiesResponse {
  success: boolean;
  market: string;
  generated_at: string;
  total_stocks: number;
  initiate_candidates: number;
  avoid_candidates: number;
  intent_counts: Record<string, number>;
  opportunities: TopOpportunity[];
  avoid_list: TopOpportunity[];
}

export interface StockIntelligence {
  ticker: string;
  market: string;
  intent: string;
  probability: number;
  confidence: number;
  regime: string;
  signals: Array<{
    name: string;
    value: number;
    direction: string;
    weight: number;
  }>;
  risk_metrics: {
    volatility_20d: number | null;
    volatility_60d: number | null;
    max_drawdown: number | null;
    sharpe_ratio: number | null;
    beta: number | null;
  };
  generated_at: string;
}

export interface PortfolioIntelligence {
  market: string;
  as_of_date: string;
  total_stocks_analyzed: number;
  regime_summary: {
    overall: string;
    bull_count: number;
    bear_count: number;
    neutral_count: number;
    volatile_count: number;
  };
  intent_distribution: Record<string, number>;
  top_opportunities: TopOpportunity[];
  risk_alerts: string[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get authority status
 */
export async function getStatus(): Promise<AuthorityStatus> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get top opportunities for a market
 */
export async function getTopOpportunities(market: string): Promise<TopOpportunitiesResponse> {
  const response = await fetch(`${API_BASE}/top-opportunities/${market.toUpperCase()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch opportunities: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get intelligence for a specific stock
 */
export async function getStockIntelligence(market: string, symbol: string): Promise<StockIntelligence> {
  const response = await fetch(`${API_BASE}/stock/${market.toUpperCase()}/${symbol.toUpperCase()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stock intelligence: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get portfolio intelligence for a market
 */
export async function getPortfolioIntelligence(market: string): Promise<PortfolioIntelligence> {
  const response = await fetch(`${API_BASE}/portfolio/${market.toUpperCase()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch portfolio intelligence: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List all stocks with intelligence for a market
 */
export async function listStocks(market: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/stocks/${market.toUpperCase()}`);
  if (!response.ok) {
    throw new Error(`Failed to list stocks: ${response.statusText}`);
  }
  const data = await response.json();
  return data.stocks || [];
}

