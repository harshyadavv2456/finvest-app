/**
 * Hook for managing strategy state and calculations
 */

import { useState, useMemo } from 'react';
import { StrataXStrategy, StrataXOptionLeg, StrataXStrategyAnalysis } from '../types/strataxTypes';
import { analyzeStrategy } from '../utils/payoffCalculator';
import { calculateAllGreeks, DEFAULT_RISK_FREE_RATE } from '../utils/blackScholes';
import { StrataXOptionRow } from '../types/strataxTypes';

export interface UseStrataXStrategyOptions {
  spotPrice?: number | null;
  optionChainData?: StrataXOptionRow[];
}

export function useStrataXStrategy(
  initialStrategy?: StrataXStrategy,
  options?: UseStrataXStrategyOptions
) {
  const [strategy, setStrategy] = useState<StrataXStrategy>(
    initialStrategy || {
      id: `strategy_${Date.now()}`,
      legs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );

  /**
   * Add a leg to the strategy
   */
  const addLeg = (leg: Omit<StrataXOptionLeg, 'id'>) => {
    const newLeg: StrataXOptionLeg = {
      ...leg,
      id: `leg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    setStrategy(prev => ({
      ...prev,
      legs: [...prev.legs, newLeg],
      updatedAt: new Date().toISOString(),
    }));
  };

  /**
   * Remove a leg from the strategy
   */
  const removeLeg = (legId: string) => {
    setStrategy(prev => ({
      ...prev,
      legs: prev.legs.filter(leg => leg.id !== legId),
      updatedAt: new Date().toISOString(),
    }));
  };

  /**
   * Update a leg in the strategy
   */
  const updateLeg = (legId: string, updates: Partial<StrataXOptionLeg>) => {
    setStrategy(prev => ({
      ...prev,
      legs: prev.legs.map(leg =>
        leg.id === legId ? { ...leg, ...updates } : leg
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  /**
   * Calculate strategy analysis with Greeks
   * Note: This hook should receive spotPrice and optionChainData as props for accurate Greeks
   */
  const analysis = useMemo((): StrataXStrategyAnalysis => {
    const baseAnalysis = analyzeStrategy(strategy);

    // Calculate Greeks for each leg and aggregate
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    const spotPrice = options?.spotPrice ?? 26202.95; // Use provided spot or default
    const optionChainData = options?.optionChainData ?? [];

    const legGreeks = strategy.legs.map(leg => {
      // Find matching option row for this leg to get IV
      const matchingRow = optionChainData.find(row => 
        row.strikePrice === leg.strike &&
        row.optionType === (leg.optionType === 'CALL' ? 'CE' : 'PE') &&
        row.expiryDate === leg.expiry
      );

      // Get IV from option chain, convert if needed (CSV might have IV as percentage like 35.10)
      let volatility = 0.20; // Default 20%
      if (matchingRow?.impliedVolatility) {
        const rawIV = matchingRow.impliedVolatility;
        // If IV > 100, it's already in percentage form, divide by 100
        volatility = rawIV > 100 ? rawIV / 100 : rawIV;
      }

      const riskFreeRate = DEFAULT_RISK_FREE_RATE;

      const greeks = calculateAllGreeks(
        spotPrice,
        leg.strike,
        leg.expiry,
        riskFreeRate,
        volatility,
        leg.optionType
      );

      // Apply quantity and action (buy/sell)
      const multiplier = leg.action === 'BUY' ? 1 : -1;
      const quantityMultiplier = leg.quantity * multiplier;

      const legDelta = greeks.delta * quantityMultiplier;
      const legGamma = greeks.gamma * quantityMultiplier;
      const legTheta = greeks.theta * quantityMultiplier;
      const legVega = greeks.vega * quantityMultiplier;
      const legRho = greeks.rho * quantityMultiplier;

      totalDelta += legDelta;
      totalGamma += legGamma;
      totalTheta += legTheta;
      totalVega += legVega;
      totalRho += legRho;

      return {
        legId: leg.id,
        delta: legDelta,
        gamma: legGamma,
        theta: legTheta,
        vega: legVega,
        rho: legRho,
      };
    });

    return {
      ...baseAnalysis,
      greeks: {
        delta: totalDelta,
        gamma: totalGamma,
        theta: totalTheta,
        vega: totalVega,
        rho: totalRho,
      },
      legGreeks,
    };
  }, [strategy, options?.spotPrice, options?.optionChainData]);

  return {
    strategy,
    analysis,
    addLeg,
    removeLeg,
    updateLeg,
    setStrategy,
  };
}

