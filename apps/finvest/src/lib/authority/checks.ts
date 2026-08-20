/**
 * Authority Checks
 * 
 * Validation functions to ensure FinSight authority is respected.
 */

import { getAuthorityStatus } from '../../authority/finsight';

/**
 * Check if FinSight data is fresh enough for decision-making
 */
export function isDataFresh(): boolean {
  try {
    const status = getAuthorityStatus();
    return status.data_freshness.is_fresh;
  } catch {
    return false;
  }
}

/**
 * Get data freshness warning message (if any)
 */
export function getDataFreshnessWarning(): string | null {
  try {
    const status = getAuthorityStatus();
    return status.data_freshness.warning;
  } catch (error) {
    return `Unable to verify data freshness: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Check if a specific market has data available
 */
export function hasMarketData(market: string): boolean {
  try {
    const status = getAuthorityStatus();
    const marketUpper = market.toUpperCase() as 'US' | 'IN';
    return (status.markets[marketUpper]?.stocks_available ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Check if intelligence operations should be blocked
 * Returns a reason string if blocked, null if allowed
 */
export function shouldBlockDecisionActions(): string | null {
  try {
    const status = getAuthorityStatus();
    
    if (!status.data_freshness.is_fresh) {
      return `Data is ${status.data_freshness.hours_old.toFixed(1)} hours old. Intelligence may be outdated.`;
    }
    
    const usAvailable = status.markets.US?.stocks_available ?? 0;
    const inAvailable = status.markets.IN?.stocks_available ?? 0;
    
    if (usAvailable === 0 && inAvailable === 0) {
      return 'No intelligence data available. Run the FinSight pipeline first.';
    }
    
    return null;
  } catch (error) {
    return `Authority check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Verify that no execution actions are attempted
 * This is a safeguard to ensure FinVest never executes trades
 */
export function assertNoExecution(action: string): void {
  const blockedActions = [
    'place_order',
    'execute_trade',
    'buy',
    'sell',
    'submit_order',
    'cancel_order',
    'modify_order',
  ];
  
  const actionLower = action.toLowerCase();
  for (const blocked of blockedActions) {
    if (actionLower.includes(blocked)) {
      throw new Error(`EXECUTION BLOCKED: Action "${action}" is not allowed. FinVest does not execute trades.`);
    }
  }
}

