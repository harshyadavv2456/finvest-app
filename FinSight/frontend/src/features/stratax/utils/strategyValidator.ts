/**
 * Strategy Validation Utilities
 * Validates options strategies and provides warnings/errors
 */

import { StrataXStrategy } from '../types/strataxTypes';

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  legIds?: string[];
}

/**
 * Validate a strategy and return any issues
 */
export function validateStrategy(strategy: StrataXStrategy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (strategy.legs.length === 0) {
    return issues; // Empty strategy is valid
  }

  // Check for duplicate legs
  const legKeys = strategy.legs.map(leg => 
    `${leg.underlying}-${leg.expiry}-${leg.strike}-${leg.optionType}-${leg.action}`
  );
  const duplicates = legKeys.filter((key, index) => legKeys.indexOf(key) !== index);
  if (duplicates.length > 0) {
    issues.push({
      type: 'warning',
      message: 'Duplicate legs detected. Consider adjusting quantities instead.',
    });
  }

  // Validate spreads
  if (strategy.legs.length === 2) {
    const [leg1, leg2] = strategy.legs;
    
    // Bull Call Spread validation
    if (
      leg1.optionType === 'CALL' && leg2.optionType === 'CALL' &&
      ((leg1.action === 'BUY' && leg2.action === 'SELL') || (leg1.action === 'SELL' && leg2.action === 'BUY'))
    ) {
      const buyLeg = leg1.action === 'BUY' ? leg1 : leg2;
      const sellLeg = leg1.action === 'SELL' ? leg1 : leg2;
      
      if (buyLeg.strike >= sellLeg.strike) {
        issues.push({
          type: 'error',
          message: 'Bull Call Spread: Buy strike must be lower than sell strike',
          legIds: [buyLeg.id, sellLeg.id],
        });
      }
    }

    // Bear Put Spread validation
    if (
      leg1.optionType === 'PUT' && leg2.optionType === 'PUT' &&
      ((leg1.action === 'BUY' && leg2.action === 'SELL') || (leg1.action === 'SELL' && leg2.action === 'BUY'))
    ) {
      const buyLeg = leg1.action === 'BUY' ? leg1 : leg2;
      const sellLeg = leg1.action === 'SELL' ? leg1 : leg2;
      
      if (buyLeg.strike <= sellLeg.strike) {
        issues.push({
          type: 'error',
          message: 'Bear Put Spread: Buy strike must be higher than sell strike',
          legIds: [buyLeg.id, sellLeg.id],
        });
      }
    }
  }

  // Check for zero or negative entry prices
  strategy.legs.forEach(leg => {
    if (leg.entryPrice <= 0) {
      issues.push({
        type: 'warning',
        message: `Leg ${leg.strike} ${leg.optionType} has zero or negative entry price`,
        legIds: [leg.id],
      });
    }
  });

  // Check for zero or negative quantities
  strategy.legs.forEach(leg => {
    if (leg.quantity <= 0) {
      issues.push({
        type: 'error',
        message: `Leg ${leg.strike} ${leg.optionType} has invalid quantity`,
        legIds: [leg.id],
      });
    }
  });

  return issues;
}

/**
 * Get strategy type name
 */
export function getStrategyType(strategy: StrataXStrategy): string {
  if (strategy.legs.length === 0) return 'Empty Strategy';
  if (strategy.legs.length === 1) {
    const leg = strategy.legs[0];
    return `${leg.action} ${leg.optionType} (Single Leg)`;
  }
  if (strategy.legs.length === 2) {
    const [leg1, leg2] = strategy.legs;
    
    // Bull Call Spread
    if (
      leg1.optionType === 'CALL' && leg2.optionType === 'CALL' &&
      leg1.action !== leg2.action
    ) {
      const buyLeg = leg1.action === 'BUY' ? leg1 : leg2;
      const sellLeg = leg1.action === 'SELL' ? leg1 : leg2;
      if (buyLeg.strike < sellLeg.strike) {
        return 'Bull Call Spread';
      }
    }
    
    // Bear Put Spread
    if (
      leg1.optionType === 'PUT' && leg2.optionType === 'PUT' &&
      leg1.action !== leg2.action
    ) {
      const buyLeg = leg1.action === 'BUY' ? leg1 : leg2;
      const sellLeg = leg1.action === 'SELL' ? leg1 : leg2;
      if (buyLeg.strike > sellLeg.strike) {
        return 'Bear Put Spread';
      }
    }
    
    // Straddle
    if (
      leg1.strike === leg2.strike &&
      leg1.optionType !== leg2.optionType &&
      leg1.action === leg2.action
    ) {
      return leg1.action === 'BUY' ? 'Long Straddle' : 'Short Straddle';
    }
    
    // Strangle
    if (
      leg1.strike !== leg2.strike &&
      leg1.optionType !== leg2.optionType &&
      leg1.action === leg2.action
    ) {
      return leg1.action === 'BUY' ? 'Long Strangle' : 'Short Strangle';
    }
  }
  
  if (strategy.legs.length === 4) {
    // Check for Iron Condor, Iron Butterfly, etc.
    const calls = strategy.legs.filter(l => l.optionType === 'CALL');
    const puts = strategy.legs.filter(l => l.optionType === 'PUT');
    
    if (calls.length === 2 && puts.length === 2) {
      return 'Iron Condor / Iron Butterfly';
    }
  }
  
  return 'Custom Strategy';
}
