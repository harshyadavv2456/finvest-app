/**
 * FinSight Authority Contracts
 * 
 * AUTHORITY: LOCKED
 * These contracts define the response schemas from FinSight.
 * FinSight is the DECISION AUTHORITY. No modifications allowed.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type Market = 'US' | 'IN' | 'UK' | 'JP' | 'CN' | 'SG' | 'HK';

export type DecisionIntent = 
  | 'INITIATE'      // Strong buy signal
  | 'ACCUMULATE'    // Add to position
  | 'HOLD'          // Maintain position
  | 'REDUCE'        // Trim position
  | 'AVOID';        // Do not buy / sell

export type RegimeState = 
  | 'BULL'          // Uptrend
  | 'BEAR'          // Downtrend
  | 'NEUTRAL'       // Sideways
  | 'VOLATILE';     // High volatility

export type MarketStatus = 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';

// ============================================================================
// INTELLIGENCE RESPONSE SCHEMAS
// ============================================================================

export interface StockIntelligence {
  ticker: string;
  market: Market;
  intent: DecisionIntent;
  probability: number;          // 0-100
  confidence: number;           // 0-100
  regime: RegimeState;
  signals: SignalSummary[];
  risk_metrics: RiskMetrics;
  generated_at: string;         // ISO timestamp
  schema_version: string;
  authority: 'LOCKED';
}

export interface SignalSummary {
  name: string;
  value: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;
}

export interface RiskMetrics {
  volatility_20d: number | null;
  volatility_60d: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  beta: number | null;
}

export interface TopOpportunity {
  ticker: string;
  market: Market;
  company_name: string;
  intent: DecisionIntent;
  probability: number;
  confidence: number;
  regime: RegimeState;
  current_price: number | null;
  change_1d: number | null;
  change_1m: number | null;
  sector: string | null;
  industry: string | null;
}

export interface TopOpportunitiesResponse {
  success: boolean;
  market: Market;
  generated_at: string;
  total_stocks: number;
  initiate_candidates: number;
  avoid_candidates: number;
  intent_counts: Record<DecisionIntent, number>;
  opportunities: TopOpportunity[];
  avoid_list: TopOpportunity[];
  schema_version: string;
  authority: 'LOCKED';
}

export interface PortfolioIntelligence {
  market: Market;
  as_of_date: string;
  total_stocks_analyzed: number;
  regime_summary: RegimeSummary;
  intent_distribution: Record<DecisionIntent, number>;
  top_opportunities: TopOpportunity[];
  risk_alerts: string[];
  schema_version: string;
  authority: 'LOCKED';
}

export interface RegimeSummary {
  overall: RegimeState;
  bull_count: number;
  bear_count: number;
  neutral_count: number;
  volatile_count: number;
}

// ============================================================================
// STATUS RESPONSE SCHEMAS
// ============================================================================

export interface AuthorityStatus {
  authority: 'LOCKED';
  finsight_version: string;
  last_updated: string;
  data_freshness: DataFreshness;
  markets: MarketStatusMap;
  schema_version: string;
}

export interface DataFreshness {
  is_fresh: boolean;
  hours_old: number;
  threshold_hours: number;
  warning: string | null;
}

export interface MarketStatusMap {
  US: MarketStatusInfo;
  IN: MarketStatusInfo;
}

export interface MarketStatusInfo {
  status: MarketStatus;
  stocks_available: number;
  last_intelligence_update: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface AuthorityError {
  code: 'DATA_MISSING' | 'DATA_STALE' | 'INVALID_MARKET' | 'SYMBOL_NOT_FOUND' | 'AUTHORITY_VIOLATION';
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// SCHEMA VERSION
// ============================================================================

export const SCHEMA_VERSION = '1.0.0';
export const AUTHORITY = 'LOCKED' as const;

