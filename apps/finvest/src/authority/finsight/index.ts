/**
 * FinSight Authority Module
 * 
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                              ║
 * ║    AUTHORITY: FinSight decisions are LOCKED.                                ║
 * ║    No reinterpretation. No override. No modification.                       ║
 * ║                                                                              ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 * 
 * This module provides READ-ONLY access to FinSight intelligence.
 * 
 * FinSight is the DECISION AUTHORITY.
 * FinVest is the ORCHESTRATOR.
 * 
 * Rules:
 * - NEVER modify FinSight logic
 * - NEVER compute new intelligence
 * - NEVER override decisions
 * - ALWAYS fail loudly if data is missing
 * - ALWAYS enforce schema validation
 */

// Re-export contracts
export * from './contracts';

// Re-export errors
export * from './errors';

// Re-export adapter
export { FinSightAdapter, getFinSightAdapter } from './adapter';

// ============================================================================
// QUICK ACCESS FUNCTIONS
// ============================================================================

import { getFinSightAdapter } from './adapter';
import type {
  AuthorityStatus,
  TopOpportunitiesResponse,
  StockIntelligence,
  PortfolioIntelligence,
} from './contracts';

/**
 * Get FinSight authority status
 */
export function getAuthorityStatus(): AuthorityStatus {
  return getFinSightAdapter().getStatus();
}

/**
 * Get top opportunities for a market
 * @param market - Market code (US, IN)
 */
export function getTopOpportunities(market: string): TopOpportunitiesResponse {
  return getFinSightAdapter().getTopOpportunities(market);
}

/**
 * Get intelligence for a specific stock
 * @param market - Market code (US, IN)
 * @param symbol - Stock symbol
 */
export function getStockIntelligence(market: string, symbol: string): StockIntelligence {
  return getFinSightAdapter().getStockIntelligence(market, symbol);
}

/**
 * Get portfolio intelligence for a market
 * @param market - Market code (US, IN)
 */
export function getPortfolioIntelligence(market: string): PortfolioIntelligence {
  return getFinSightAdapter().getPortfolioIntelligence(market);
}

/**
 * List all available stocks with intelligence for a market
 * @param market - Market code (US, IN)
 */
export function listAvailableStocks(market: string): string[] {
  return getFinSightAdapter().listStocks(market);
}

