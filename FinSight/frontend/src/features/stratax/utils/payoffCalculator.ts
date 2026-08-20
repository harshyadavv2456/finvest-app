/**
 * Payoff Calculator for Options Strategies
 * 
 * Calculates P&L, breakeven points, and max profit/loss for multi-leg strategies.
 */

import { StrataXStrategy, StrataXStrategyAnalysis } from '../types/strataxTypes';

/**
 * Calculate P&L for a strategy at a given underlying price
 */
export function calculatePayoff(
  strategy: StrataXStrategy,
  underlyingPrice: number
): number {
  let totalPnL = 0;

  for (const leg of strategy.legs) {
    const intrinsicValue = leg.optionType === 'CALL'
      ? Math.max(0, underlyingPrice - leg.strike)
      : Math.max(0, leg.strike - underlyingPrice);

    const currentValue = intrinsicValue * leg.quantity;
    const costBasis = leg.entryPrice * leg.quantity;

    if (leg.action === 'BUY') {
      totalPnL += currentValue - costBasis;
    } else {
      // SELL: we receive premium, pay out intrinsic value
      totalPnL += costBasis - currentValue;
    }
  }

  return totalPnL;
}

/**
 * Calculate payoff curve for a strategy
 * 
 * @param strategy - The strategy to analyze
 * @param minPrice - Minimum underlying price to calculate
 * @param maxPrice - Maximum underlying price to calculate
 * @param step - Price step size (default: 50)
 * @returns Array of { underlyingPrice, pnl } points
 */
export function calculatePayoffCurve(
  strategy: StrataXStrategy,
  minPrice?: number,
  maxPrice?: number,
  step: number = 50
): Array<{ underlyingPrice: number; pnl: number }> {
  // Safety check: if no legs, return empty array
  if (!strategy.legs || strategy.legs.length === 0) {
    return [];
  }

  // Determine price range from strikes
  const strikes = strategy.legs.map(leg => leg.strike).filter(s => s > 0);
  if (strikes.length === 0) {
    return [];
  }

  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const range = maxStrike - minStrike;

  const startPrice = minPrice ?? Math.max(0, minStrike - range * 0.5);
  const endPrice = maxPrice ?? maxStrike + range * 0.5;

  const curve: Array<{ underlyingPrice: number; pnl: number }> = [];
  
  for (let price = startPrice; price <= endPrice; price += step) {
    curve.push({
      underlyingPrice: price,
      pnl: calculatePayoff(strategy, price),
    });
  }

  return curve;
}

/**
 * Calculate breakeven points for a strategy
 * 
 * Returns array of underlying prices where P&L = 0
 */
export function calculateBreakeven(strategy: StrataXStrategy): number[] {
  // Special case: Single leg strategies
  if (strategy.legs.length === 1) {
    const leg = strategy.legs[0];
    const premiumPaid = leg.entryPrice;
    
    if (leg.action === 'BUY') {
      if (leg.optionType === 'CALL') {
        // Long call: Breakeven = Strike + Premium
        return [leg.strike + premiumPaid];
      } else {
        // Long put: Breakeven = Strike - Premium
        return [leg.strike - premiumPaid];
      }
    } else {
      // SELL: Same breakeven as buy (but opposite P&L)
      if (leg.optionType === 'CALL') {
        return [leg.strike + premiumPaid];
      } else {
        return [leg.strike - premiumPaid];
      }
    }
  }

  // Multi-leg strategies: Calculate from payoff curve
  const curve = calculatePayoffCurve(strategy, undefined, undefined, 1);
  if (!curve || curve.length === 0) {
    return [];
  }

  const breakevens: number[] = [];

  for (let i = 0; i < curve.length - 1; i++) {
    const current = curve[i];
    const next = curve[i + 1];

    // Check if sign changes (crosses zero)
    if (Math.abs(current.pnl) < 0.01) {
      breakevens.push(current.underlyingPrice);
    } else if ((current.pnl > 0 && next.pnl < 0) || (current.pnl < 0 && next.pnl > 0)) {
      // Linear interpolation to find exact breakeven
      const ratio = Math.abs(current.pnl) / (Math.abs(current.pnl) + Math.abs(next.pnl));
      const breakeven = current.underlyingPrice + ratio * (next.underlyingPrice - current.underlyingPrice);
      breakevens.push(breakeven);
    }
  }

  // Remove duplicates and sort
  return [...new Set(breakevens)].sort((a, b) => a - b);
}

/**
 * Calculate max profit and max loss for a strategy
 * 
 * @returns Object with maxProfit (null if unlimited) and maxLoss (null if unlimited)
 */
export function calculateMaxProfitLoss(strategy: StrataXStrategy): {
  maxProfit: number | null;
  maxLoss: number | null;
} {
  // Safety check: if no legs, return zeros
  if (!strategy.legs || strategy.legs.length === 0) {
    return { maxProfit: 0, maxLoss: 0 };
  }

  // Special case: Single leg strategies
  if (strategy.legs.length === 1) {
    const leg = strategy.legs[0];
    const premiumPaid = leg.entryPrice * leg.quantity;
    
    if (leg.action === 'BUY') {
      // Long call or put: Unlimited profit potential, limited loss
      if (leg.optionType === 'CALL') {
        return { maxProfit: null, maxLoss: -premiumPaid };
      } else {
        // PUT
        return { maxProfit: null, maxLoss: -premiumPaid };
      }
    } else {
      // SELL: Limited profit, unlimited loss
      if (leg.optionType === 'CALL') {
        return { maxProfit: premiumPaid, maxLoss: null };
      } else {
        // PUT
        return { maxProfit: premiumPaid, maxLoss: null };
      }
    }
  }

  // Multi-leg strategies: Calculate from payoff curve
  const curve = calculatePayoffCurve(strategy, undefined, undefined, 10);
  
  // Safety check: if curve is empty or too short
  if (!curve || curve.length === 0) {
    return { maxProfit: 0, maxLoss: 0 };
  }

  if (curve.length < 2) {
    return {
      maxProfit: curve[0]?.pnl ?? 0,
      maxLoss: curve[0]?.pnl ?? 0,
    };
  }
  
  let maxProfit = -Infinity;
  let minProfit = Infinity;
  let hasUnlimitedProfit = false;
  let hasUnlimitedLoss = false;

  // Check endpoints for unlimited scenarios
  const firstPnL = curve[0]?.pnl ?? 0;
  const lastPnL = curve[curve.length - 1]?.pnl ?? 0;
  
  // Check if profit/loss is increasing/decreasing at extremes
  const secondPnL = curve[1]?.pnl ?? 0;
  const secondLastPnL = curve[curve.length - 2]?.pnl ?? 0;

  // If P&L is increasing at the end, profit is unlimited
  if (lastPnL > secondLastPnL) {
    hasUnlimitedProfit = true;
  }

  // If P&L is decreasing at the start, loss might be unlimited
  if (firstPnL < secondPnL) {
    hasUnlimitedLoss = true;
  }

  // Find min/max in the curve
  for (const point of curve) {
    if (point.pnl > maxProfit) {
      maxProfit = point.pnl;
    }
    if (point.pnl < minProfit) {
      minProfit = point.pnl;
    }
  }

  return {
    maxProfit: hasUnlimitedProfit ? null : maxProfit,
    maxLoss: hasUnlimitedLoss ? null : minProfit,
  };
}

/**
 * Calculate net premium (total credit/debit)
 */
export function calculateNetPremium(strategy: StrataXStrategy): number {
  let netPremium = 0;

  for (const leg of strategy.legs) {
    const legCost = leg.entryPrice * leg.quantity;
    
    if (leg.action === 'BUY') {
      netPremium -= legCost; // Debit
    } else {
      netPremium += legCost; // Credit
    }
  }

  return netPremium;
}

/**
 * Calculate complete strategy analysis
 */
export function analyzeStrategy(strategy: StrataXStrategy): StrataXStrategyAnalysis {
  const netPremium = calculateNetPremium(strategy);
  const { maxProfit, maxLoss } = calculateMaxProfitLoss(strategy);
  const breakevenPoints = calculateBreakeven(strategy);
  const payoff = calculatePayoffCurve(strategy);

  // Greeks will be calculated separately using Black-Scholes
  // For now, return zeros (will be filled by Strategy Builder)
  return {
    netPremium,
    maxProfit,
    maxLoss,
    breakevenPoints,
    payoff,
    greeks: {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    },
    legGreeks: strategy.legs.map(leg => ({
      legId: leg.id,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    })),
  };
}

