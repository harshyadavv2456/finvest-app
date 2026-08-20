/**
 * Probability Calculator for Options Strategies
 * Calculates probability of profit, probability of maximum profit, etc.
 */

import { StrataXStrategy, StrataXStrategyAnalysis } from '../types/strataxTypes';
import { normCDF } from './blackScholes';
import { calculateBreakeven, calculatePayoff, calculateNetPremium } from './payoffCalculator';

/**
 * Calculate probability of profit for a strategy
 * Uses Black-Scholes model assumptions (lognormal distribution)
 */
export function calculateProbabilityOfProfit(
  strategy: StrataXStrategy,
  spotPrice: number,
  volatility: number,
  riskFreeRate: number,
  expiryDate: string
): number {
  if (strategy.legs.length === 0) return 0;

  // Get breakeven points
  const breakevens = calculateBreakeven(strategy);
  
  if (breakevens.length === 0) {
    // If no breakeven, check if strategy is always profitable
    const currentPnL = calculatePayoff(strategy, spotPrice);
    return currentPnL > 0 ? 1 : 0;
  }

  // Calculate time to expiry
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  const timeToExpiry = diffDays / 365.0;

  if (timeToExpiry <= 0) {
    // At expiry, check if current spot is above breakeven
    const currentPnL = calculatePayoff(strategy, spotPrice);
    return currentPnL > 0 ? 1 : 0;
  }

  // Calculate probability using lognormal distribution
  // P(S_T > K) = N((ln(S/K) + (r - 0.5*σ²)*T) / (σ*√T))

  // For strategies with one breakeven, calculate probability of being above it
  if (breakevens.length === 1) {
    const breakeven = breakevens[0];
    const z = (Math.log(breakeven / spotPrice) - (riskFreeRate - 0.5 * volatility * volatility) * timeToExpiry) /
      (volatility * Math.sqrt(timeToExpiry));
    
    // Check if strategy profits above or below breakeven
    const testPrice = breakeven * 1.01; // Test slightly above breakeven
    const testPnL = calculatePayoff(strategy, testPrice);
    
    if (testPnL > 0) {
      // Profits above breakeven
      return 1 - normCDF(z);
    } else {
      // Profits below breakeven
      return normCDF(z);
    }
  }

  // For multiple breakevens, calculate probability in profitable range
  // This is simplified - full calculation would integrate over payoff curve
  return 0.5; // Placeholder
}

/**
 * Calculate expected value (expected P&L) of strategy
 */
export function calculateExpectedValue(
  strategy: StrataXStrategy,
  _spotPrice: number,
  _volatility: number,
  _riskFreeRate: number,
  _expiryDate: string
): number {
  if (strategy.legs.length === 0) return 0;

  // Simplified calculation using Monte Carlo simulation approach
  // For now, return net premium as approximation
  return calculateNetPremium(strategy);
}

/**
 * Calculate probability of reaching maximum profit
 */
export function calculateProbabilityOfMaxProfit(
  strategy: StrataXStrategy,
  spotPrice: number,
  volatility: number,
  riskFreeRate: number,
  expiryDate: string,
  analysis: StrataXStrategyAnalysis
): number {
  if (analysis.maxProfit === null) {
    // Unlimited profit - calculate probability of being in profitable region
    return calculateProbabilityOfProfit(strategy, spotPrice, volatility, riskFreeRate, expiryDate);
  }

  // For limited profit strategies, calculate probability of reaching max profit zone
  // This is simplified - would need to identify the price range for max profit
  return 0.3; // Placeholder
}

