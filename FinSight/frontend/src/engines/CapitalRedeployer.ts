/**
 * CapitalRedeployer - Capital Redeployment Engine
 * 
 * GOAL:
 * Selling without redeployment is incomplete advice.
 * 
 * Hard constraints:
 * - No sector > 30%
 * - No stock > 15%
 * - Prefer LTCG-friendly entries
 */

import { DecisionContext } from '../core/DecisionContext';
import { EnrichedHolding } from '../integrations/portfolio';
import { PortfolioIntelligence } from '../intelligence/PortfolioIntel';

// Redeployment allocation
export interface AllocationTarget {
  symbol: string;
  allocation_pct: number;
  allocation_amount: number;
  rationale: string[];
  signal_intent: string;
  signal_conviction: number;
  sector: string;
  expected_return: number;
  risk_score: number;
}

// Diversification improvement
export interface DiversificationImprovement {
  sector_concentration_before: number;
  sector_concentration_after: number;
  position_count_before: number;
  position_count_after: number;
  hhi_before: number;  // Herfindahl-Hirschman Index
  hhi_after: number;
  improvement_score: number;
}

// Redeployment plan output
export interface RedeploymentPlan {
  // Metadata
  plan_id: string;
  created_at: string;
  context_id: string;
  
  // Input
  freed_capital: number;
  source_symbol?: string;
  
  // Plan
  redeployment_plan: AllocationTarget[];
  total_allocated: number;
  cash_reserved: number;
  
  // Expected outcomes
  expected_post_tax_return: number;
  expected_pre_tax_return: number;
  tax_efficiency_score: number;
  
  // Diversification
  diversification_improvement: DiversificationImprovement;
  
  // Constraints satisfied
  constraints_satisfied: {
    max_sector_30: boolean;
    max_position_15: boolean;
    ltcg_friendly: boolean;
  };
  
  // Explanation
  summary: string;
  reasoning: string[];
  warnings: string[];
}

// Sector limits
const SECTOR_LIMIT = 0.30;    // Max 30% in any sector
const POSITION_LIMIT = 0.15;  // Max 15% in any stock
const CASH_RESERVE = 0.05;    // Keep 5% as cash buffer

/**
 * CapitalRedeployer
 * 
 * Generates optimal redeployment plans for freed capital.
 */
export class CapitalRedeployer {
  private static instance: CapitalRedeployer;

  private constructor() {}

  static getInstance(): CapitalRedeployer {
    if (!CapitalRedeployer.instance) {
      CapitalRedeployer.instance = new CapitalRedeployer();
    }
    return CapitalRedeployer.instance;
  }

  /**
   * Generate redeployment plan
   */
  generatePlan(
    freedCapital: number,
    context: DecisionContext,
    portfolioIntel: PortfolioIntelligence,
    sourceSymbol?: string
  ): RedeploymentPlan {
    const now = new Date();
    
    // Validate
    if (context.status === 'INVALID') {
      throw new Error('Cannot generate plan: DecisionContext is INVALID');
    }
    
    if (freedCapital <= 0) {
      throw new Error('Cannot generate plan: No capital to redeploy');
    }

    // Get INITIATE signals from FinSight
    const initiateSignals = this.getInitiateSignals(context, sourceSymbol);
    
    // Calculate current portfolio state
    const currentState = this.analyzeCurrentState(context, portfolioIntel);
    
    // Calculate capital available for deployment (reserve some cash)
    const cashReserve = freedCapital * CASH_RESERVE;
    const deployableCapital = freedCapital - cashReserve;
    
    // Generate allocation targets
    const targets = this.generateAllocationTargets(
      deployableCapital,
      initiateSignals,
      currentState,
      context
    );
    
    // Calculate expected returns
    const { preTaxReturn, postTaxReturn, taxEfficiency } = this.calculateExpectedReturns(
      targets
    );
    
    // Calculate diversification improvement
    const diversification = this.calculateDiversificationImprovement(
      targets,
      currentState,
      context
    );
    
    // Check constraints
    const constraintsSatisfied = this.checkConstraints(targets, currentState);
    
    // Generate summary and reasoning
    const { summary, reasoning, warnings } = this.generateExplanation(
      targets,
      diversification,
      constraintsSatisfied,
      freedCapital,
      sourceSymbol
    );

    const totalAllocated = targets.reduce((sum, t) => sum + t.allocation_amount, 0);

    return {
      plan_id: `RDP-${now.getTime()}`,
      created_at: now.toISOString(),
      context_id: context.id,
      freed_capital: freedCapital,
      source_symbol: sourceSymbol,
      redeployment_plan: targets,
      total_allocated: totalAllocated,
      cash_reserved: cashReserve,
      expected_post_tax_return: postTaxReturn,
      expected_pre_tax_return: preTaxReturn,
      tax_efficiency_score: taxEfficiency,
      diversification_improvement: diversification,
      constraints_satisfied: constraintsSatisfied,
      summary,
      reasoning,
      warnings
    };
  }

  // Private methods

  private getInitiateSignals(
    context: DecisionContext,
    excludeSymbol?: string
  ): Array<{ symbol: string; intent: string; conviction: number; expected_return: number; sector: string }> {
    const signals: Array<{ symbol: string; intent: string; conviction: number; expected_return: number; sector: string }> = [];
    
    context.finsight_signals.forEach((signal, symbol) => {
      if (signal.intent === 'INITIATE' && symbol !== excludeSymbol) {
        signals.push({
          symbol,
          intent: signal.intent,
          conviction: signal.conviction,
          expected_return: signal.expected_return_p50 || 0,
          sector: (signal as any).sector || 'Other'
        });
      }
    });
    
    // Sort by conviction
    return signals.sort((a, b) => b.conviction - a.conviction);
  }

  private analyzeCurrentState(
    context: DecisionContext,
    _portfolioIntel: PortfolioIntelligence
  ): {
    totalValue: number;
    sectorAllocations: Map<string, number>;
    positionAllocations: Map<string, number>;
    holdings: EnrichedHolding[];
  } {
    const totalValue = context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0);
    
    const sectorAllocations = new Map<string, number>();
    const positionAllocations = new Map<string, number>();
    
    context.enriched_holdings.forEach(h => {
      const sector = (h as any).sector || 'Other';
      const allocation = totalValue > 0 ? h.current_value / totalValue : 0;
      
      sectorAllocations.set(sector, (sectorAllocations.get(sector) || 0) + allocation);
      positionAllocations.set(h.symbol, allocation);
    });
    
    return {
      totalValue,
      sectorAllocations,
      positionAllocations,
      holdings: context.enriched_holdings
    };
  }

  private generateAllocationTargets(
    deployableCapital: number,
    initiateSignals: Array<{ symbol: string; intent: string; conviction: number; expected_return: number; sector: string }>,
    currentState: {
      totalValue: number;
      sectorAllocations: Map<string, number>;
      positionAllocations: Map<string, number>;
    },
    _context: DecisionContext
  ): AllocationTarget[] {
    const targets: AllocationTarget[] = [];
    let remainingCapital = deployableCapital;
    const newTotalValue = currentState.totalValue + deployableCapital;
    
    // Track allocations as we go
    const newSectorAllocations = new Map(currentState.sectorAllocations);
    const newPositionAllocations = new Map(currentState.positionAllocations);
    
    for (const signal of initiateSignals) {
      if (remainingCapital <= 0) break;
      
      // Check sector limit
      const currentSectorAllocation = newSectorAllocations.get(signal.sector) || 0;
      const maxSectorAddition = (SECTOR_LIMIT - currentSectorAllocation) * newTotalValue;
      
      // Check position limit
      const currentPositionAllocation = newPositionAllocations.get(signal.symbol) || 0;
      const maxPositionAddition = (POSITION_LIMIT - currentPositionAllocation) * newTotalValue;
      
      // Calculate allocation
      const maxAllocation = Math.min(
        remainingCapital,
        maxSectorAddition,
        maxPositionAddition,
        deployableCapital * 0.25  // Max 25% of freed capital in one stock
      );
      
      if (maxAllocation <= 0) continue;
      
      const allocationAmount = maxAllocation;
      const allocationPct = (allocationAmount / deployableCapital) * 100;
      
      // Build rationale
      const rationale: string[] = [];
      rationale.push(`FinSight INITIATE signal with ${(signal.conviction * 100).toFixed(0)}% conviction`);
      rationale.push(`Expected return: ${(signal.expected_return * 100).toFixed(1)}%`);
      
      if (currentSectorAllocation < 0.20) {
        rationale.push(`Adds exposure to underweight ${signal.sector} sector`);
      }
      
      // Risk score (inverse of conviction)
      const riskScore = (1 - signal.conviction) * 100;
      
      targets.push({
        symbol: signal.symbol,
        allocation_pct: allocationPct,
        allocation_amount: allocationAmount,
        rationale,
        signal_intent: signal.intent,
        signal_conviction: signal.conviction,
        sector: signal.sector,
        expected_return: signal.expected_return,
        risk_score: riskScore
      });
      
      // Update tracking
      remainingCapital -= allocationAmount;
      newSectorAllocations.set(signal.sector, 
        (newSectorAllocations.get(signal.sector) || 0) + (allocationAmount / newTotalValue)
      );
      newPositionAllocations.set(signal.symbol,
        (newPositionAllocations.get(signal.symbol) || 0) + (allocationAmount / newTotalValue)
      );
    }
    
    // If no INITIATE signals, suggest broad market exposure
    if (targets.length === 0 && deployableCapital > 0) {
      targets.push({
        symbol: 'NIFTYBEES.NS',
        allocation_pct: 100,
        allocation_amount: deployableCapital,
        rationale: [
          'No strong INITIATE signals available',
          'Broad market exposure via Nifty ETF',
          'Low cost, high liquidity'
        ],
        signal_intent: 'HOLD',
        signal_conviction: 0.5,
        sector: 'ETF',
        expected_return: 0.12, // Long-term market return
        risk_score: 30
      });
    }
    
    return targets;
  }

  private calculateExpectedReturns(
    targets: AllocationTarget[]
  ): { preTaxReturn: number; postTaxReturn: number; taxEfficiency: number } {
    const totalWeight = targets.reduce((sum, t) => sum + t.allocation_pct, 0);
    
    if (totalWeight === 0) {
      return { preTaxReturn: 0, postTaxReturn: 0, taxEfficiency: 100 };
    }
    
    // Weighted average expected return
    const preTaxReturn = targets.reduce(
      (sum, t) => sum + (t.expected_return * (t.allocation_pct / totalWeight)),
      0
    );
    
    // Assume LTCG treatment (10% tax on gains above exemption)
    const postTaxReturn = preTaxReturn * 0.90; // Simplified
    
    const taxEfficiency = preTaxReturn > 0 
      ? (postTaxReturn / preTaxReturn) * 100 
      : 100;
    
    return { preTaxReturn, postTaxReturn, taxEfficiency };
  }

  private calculateDiversificationImprovement(
    targets: AllocationTarget[],
    currentState: {
      totalValue: number;
      sectorAllocations: Map<string, number>;
      positionAllocations: Map<string, number>;
      holdings: EnrichedHolding[];
    },
    _context: DecisionContext
  ): DiversificationImprovement {
    // Calculate HHI before
    const hhiBefore = this.calculateHHI(Array.from(currentState.positionAllocations.values()));
    
    // Calculate new allocations
    const newPositionAllocations = new Map(currentState.positionAllocations);
    const totalNewValue = currentState.totalValue + targets.reduce((sum, t) => sum + t.allocation_amount, 0);
    
    targets.forEach(t => {
      const existingAllocation = currentState.positionAllocations.get(t.symbol) || 0;
      const addedAllocation = t.allocation_amount / totalNewValue;
      newPositionAllocations.set(t.symbol, existingAllocation + addedAllocation);
    });
    
    const hhiAfter = this.calculateHHI(Array.from(newPositionAllocations.values()));
    
    // Max sector before
    const maxSectorBefore = Math.max(...Array.from(currentState.sectorAllocations.values())) * 100;
    
    // Max sector after
    const newSectorAllocations = new Map(currentState.sectorAllocations);
    targets.forEach(t => {
      const existingSector = currentState.sectorAllocations.get(t.sector) || 0;
      const addedSector = t.allocation_amount / totalNewValue;
      newSectorAllocations.set(t.sector, existingSector + addedSector);
    });
    const maxSectorAfter = Math.max(...Array.from(newSectorAllocations.values())) * 100;
    
    const improvementScore = (hhiBefore - hhiAfter) * 100 + (maxSectorBefore - maxSectorAfter);
    
    return {
      sector_concentration_before: maxSectorBefore,
      sector_concentration_after: maxSectorAfter,
      position_count_before: currentState.holdings.length,
      position_count_after: newPositionAllocations.size,
      hhi_before: hhiBefore,
      hhi_after: hhiAfter,
      improvement_score: improvementScore
    };
  }

  private calculateHHI(allocations: number[]): number {
    return allocations.reduce((sum, a) => sum + Math.pow(a, 2), 0);
  }

  private checkConstraints(
    targets: AllocationTarget[],
    currentState: {
      totalValue: number;
      sectorAllocations: Map<string, number>;
      positionAllocations: Map<string, number>;
    }
  ): { max_sector_30: boolean; max_position_15: boolean; ltcg_friendly: boolean } {
    const totalNewValue = currentState.totalValue + targets.reduce((sum, t) => sum + t.allocation_amount, 0);
    
    // Check sector constraint
    const newSectorAllocations = new Map(currentState.sectorAllocations);
    targets.forEach(t => {
      const existingSector = (currentState.sectorAllocations.get(t.sector) || 0) * currentState.totalValue;
      newSectorAllocations.set(t.sector, (existingSector + t.allocation_amount) / totalNewValue);
    });
    const maxSector = Math.max(...Array.from(newSectorAllocations.values()));
    
    // Check position constraint
    const newPositionAllocations = new Map(currentState.positionAllocations);
    targets.forEach(t => {
      const existingPosition = (currentState.positionAllocations.get(t.symbol) || 0) * currentState.totalValue;
      newPositionAllocations.set(t.symbol, (existingPosition + t.allocation_amount) / totalNewValue);
    });
    const maxPosition = Math.max(...Array.from(newPositionAllocations.values()));
    
    return {
      max_sector_30: maxSector <= SECTOR_LIMIT,
      max_position_15: maxPosition <= POSITION_LIMIT,
      ltcg_friendly: true // New investments are LTCG-friendly by default (long hold intent)
    };
  }

  private generateExplanation(
    targets: AllocationTarget[],
    diversification: DiversificationImprovement,
    constraints: { max_sector_30: boolean; max_position_15: boolean; ltcg_friendly: boolean },
    freedCapital: number,
    sourceSymbol?: string
  ): { summary: string; reasoning: string[]; warnings: string[] } {
    const reasoning: string[] = [];
    const warnings: string[] = [];
    
    // Summary
    const summary = targets.length > 0
      ? `Redeploying ₹${freedCapital.toLocaleString()} across ${targets.length} INITIATE-rated stocks.`
      : `No suitable redeployment targets found. Recommend holding as cash.`;
    
    // Reasoning
    if (sourceSymbol) {
      reasoning.push(`Capital freed from ${sourceSymbol} sale.`);
    }
    
    reasoning.push(`${targets.length} stocks selected based on FinSight INITIATE signals.`);
    
    if (diversification.improvement_score > 5) {
      reasoning.push(`Redeployment improves portfolio diversification.`);
    }
    
    // Top allocations
    targets.slice(0, 3).forEach(t => {
      reasoning.push(`${t.allocation_pct.toFixed(1)}% to ${t.symbol}: ${t.rationale[0]}`);
    });
    
    // Warnings
    if (!constraints.max_sector_30) {
      warnings.push('Sector concentration exceeds 30% limit after redeployment.');
    }
    
    if (!constraints.max_position_15) {
      warnings.push('Position concentration exceeds 15% limit after redeployment.');
    }
    
    if (targets.length === 0) {
      warnings.push('No INITIATE signals available. Consider waiting for opportunities.');
    }
    
    return { summary, reasoning, warnings };
  }
}

// Export singleton
export const capitalRedeployer = CapitalRedeployer.getInstance();

export default CapitalRedeployer;

