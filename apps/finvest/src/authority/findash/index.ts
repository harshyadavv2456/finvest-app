/**
 * FinDash Authority Module
 * 
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                              ║
 * ║    AUTHORITY: FinDash is the DATA SOURCE.                                   ║
 * ║    Powered by yfinance. No recomputation. No duplication.                   ║
 * ║                                                                              ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 * 
 * This module provides READ-ONLY access to FinDash market data.
 * 
 * FinDash = DATA AUTHORITY (LIVE)
 * FinSight = DECISION AUTHORITY (LOCKED)
 * FinVest = ORCHESTRATOR
 * 
 * Rules:
 * - NEVER compute indicators in FinVest
 * - NEVER duplicate yfinance logic
 * - NEVER mock data
 * - ALWAYS fail loudly if FinDash is offline
 */

// Re-export contracts
export * from './contracts';

// Re-export errors
export * from './errors';

// Re-export status utilities
export * from './status';

// Re-export adapter
export { FindashAdapter, getFindashAdapter } from './adapter';

// ============================================================================
// QUICK ACCESS FUNCTIONS
// ============================================================================

import { getFindashAdapter } from './adapter';
import type { MarketStatusResponse } from './contracts';

/**
 * Get FinDash status
 */
export async function getFindashStatus(): Promise<MarketStatusResponse> {
  return getFindashAdapter().getStatus();
}

/**
 * Get FinDash embed URL
 */
export function getFindashEmbedUrl(): string {
  return getFindashAdapter().getEmbedUrl();
}

