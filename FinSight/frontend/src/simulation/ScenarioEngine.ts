/**
 * ScenarioEngine - What-If Analysis Engine
 * 
 * GOAL:
 * Users must see consequences BEFORE acting.
 * 
 * NO price prediction.
 * NO Monte Carlo.
 * Pure deterministic math + current regime.
 */

import { DecisionContext } from '../core/DecisionContext';
import { EnrichedHolding } from '../integrations/portfolio';

// Action types for scenarios
export type ScenarioAction = 'SELL' | 'HOLD' | 'BUY' | 'REDUCE';

// Scenario time horizons
export type TimeHorizon = 7 | 14 | 30 | 60 | 90 | 180 | 365;

/**
 * Scenario input parameters
 */
export interface ScenarioInput {
  action: ScenarioAction;
  symbol: string;
  quantity?: number;           // For partial actions
  percentage?: number;         // % of position
  time_horizon: TimeHorizon;   // Days to simulate
  reinvest_proceeds?: string;  // Symbol to reinvest in (for redeployment)
}

/**
 * Tax impact breakdown
 */
export interface TaxImpact {
  tax_type: 'STCG' | 'LTCG' | 'NONE';
  taxable_amount: number;
  tax_rate: number;
  tax_owed: number;
  exemption_used: number;
  days_to_ltcg: number;
  potential_savings_if_wait: number;
}

/**
 * Risk metrics
 */
export interface RiskDelta {
  sector_concentration_before: number;
  sector_concentration_after: number;
  position_concentration_before: number;
  position_concentration_after: number;
  portfolio_volatility_estimate: 'LOWER' | 'SAME' | 'HIGHER';
  diversification_score_delta: number;
}

/**
 * Scenario output
 */
export interface ScenarioResult {
  // Metadata
  scenario_id: string;
  created_at: string;
  context_id: string;
  
  // Input summary
  action: ScenarioAction;
  symbol: string;
  quantity: number;
  time_horizon: TimeHorizon;
  
  // Impact analysis
  tax_impact: TaxImpact;
  
  // Value changes (deterministic, not predicted)
  realized_gain_loss: number;
  proceeds_after_tax: number;
  portfolio_value_before: number;
  portfolio_value_after: number;
  portfolio_value_change: number;
  portfolio_value_change_pct: number;
  
  // Risk analysis
  risk_delta: RiskDelta;
  
  // Signal alignment
  signal_alignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING';
  signal_explanation: string;
  
  // Confidence in analysis
  confidence_score: number;
  confidence_factors: string[];
  
  // Human-readable explanation
  explanation: string[];
  
  // Comparison with alternatives
  alternatives: {
    action: string;
    benefit: string;
    drawback: string;
  }[];
}

/**
 * ScenarioEngine
 * 
 * Simulates investment actions deterministically.
 */
export class ScenarioEngine {
  private static instance: ScenarioEngine;

  private constructor() {}

  static getInstance(): ScenarioEngine {
    if (!ScenarioEngine.instance) {
      ScenarioEngine.instance = new ScenarioEngine();
    }
    return ScenarioEngine.instance;
  }

  /**
   * Run a scenario simulation
   */
  simulate(input: ScenarioInput, context: DecisionContext): ScenarioResult {
    const now = new Date();
    
    // Validate context
    if (context.status === 'INVALID') {
      throw new Error('Cannot simulate: DecisionContext is INVALID');
    }

    // Find the holding
    const holding = context.enriched_holdings.find(h => h.symbol === input.symbol);
    if (!holding && input.action !== 'BUY') {
      throw new Error(`Cannot simulate ${input.action}: ${input.symbol} not in portfolio`);
    }

    // Calculate quantity
    const quantity = this.calculateQuantity(input, holding);

    // Get live price
    const priceData = context.live_prices.get(input.symbol);
    const currentPrice = priceData?.price || holding?.current_price || 0;

    // Calculate tax impact
    const taxImpact = this.calculateTaxImpact(input, holding, currentPrice, quantity);

    // Calculate value changes
    const valueChanges = this.calculateValueChanges(
      input.action,
      holding,
      currentPrice,
      quantity,
      taxImpact,
      context
    );

    // Calculate risk delta
    const riskDelta = this.calculateRiskDelta(
      input.action,
      holding,
      currentPrice,
      quantity,
      context
    );

    // Check signal alignment
    const signalAnalysis = this.analyzeSignalAlignment(
      input.action,
      input.symbol,
      context
    );

    // Calculate confidence
    const { score, factors } = this.calculateConfidence(context, holding, priceData);

    // Generate explanation
    const explanation = this.generateExplanation(
      input,
      taxImpact,
      valueChanges,
      riskDelta,
      signalAnalysis,
      holding
    );

    // Generate alternatives
    const alternatives = this.generateAlternatives(
      input,
      taxImpact,
      holding,
      context
    );

    return {
      scenario_id: `SCN-${now.getTime()}-${input.symbol}`,
      created_at: now.toISOString(),
      context_id: context.id,
      action: input.action,
      symbol: input.symbol,
      quantity,
      time_horizon: input.time_horizon,
      tax_impact: taxImpact,
      realized_gain_loss: valueChanges.realized_gain_loss,
      proceeds_after_tax: valueChanges.proceeds_after_tax,
      portfolio_value_before: valueChanges.portfolio_value_before,
      portfolio_value_after: valueChanges.portfolio_value_after,
      portfolio_value_change: valueChanges.portfolio_value_change,
      portfolio_value_change_pct: valueChanges.portfolio_value_change_pct,
      risk_delta: riskDelta,
      signal_alignment: signalAnalysis.alignment,
      signal_explanation: signalAnalysis.explanation,
      confidence_score: score,
      confidence_factors: factors,
      explanation,
      alternatives
    };
  }

  /**
   * Compare multiple scenarios
   */
  compare(inputs: ScenarioInput[], context: DecisionContext): {
    scenarios: ScenarioResult[];
    best_option: string;
    recommendation: string;
  } {
    const scenarios = inputs.map(input => this.simulate(input, context));
    
    // Find best option (highest confidence + best post-tax outcome)
    let bestIndex = 0;
    let bestScore = -Infinity;
    
    scenarios.forEach((s, i) => {
      const score = s.confidence_score * 0.3 + 
                    s.proceeds_after_tax * 0.4 + 
                    s.risk_delta.diversification_score_delta * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });

    const best = scenarios[bestIndex];
    
    return {
      scenarios,
      best_option: `${best.action} ${best.quantity} ${best.symbol}`,
      recommendation: best.explanation[0]
    };
  }

  // Private methods

  private calculateQuantity(input: ScenarioInput, holding?: EnrichedHolding): number {
    if (input.quantity) return input.quantity;
    if (input.percentage && holding) {
      return Math.floor(holding.quantity * (input.percentage / 100));
    }
    return holding?.quantity || 0;
  }

  private calculateTaxImpact(
    input: ScenarioInput,
    holding: EnrichedHolding | undefined,
    currentPrice: number,
    quantity: number
  ): TaxImpact {
    if (input.action === 'HOLD' || input.action === 'BUY' || !holding) {
      return {
        tax_type: 'NONE',
        taxable_amount: 0,
        tax_rate: 0,
        tax_owed: 0,
        exemption_used: 0,
        days_to_ltcg: holding?.days_to_ltcg || 0,
        potential_savings_if_wait: 0
      };
    }

    const costBasis = holding.avg_price * quantity;
    const proceeds = currentPrice * quantity;
    const gain = proceeds - costBasis;

    if (gain <= 0) {
      return {
        tax_type: 'NONE',
        taxable_amount: gain, // Loss
        tax_rate: 0,
        tax_owed: 0,
        exemption_used: 0,
        days_to_ltcg: holding.days_to_ltcg,
        potential_savings_if_wait: 0
      };
    }

    const isLTCG = holding.is_ltcg_eligible;
    const taxRate = isLTCG ? 0.10 : 0.15;
    const exemption = isLTCG ? Math.min(100000, gain) : 0;
    const taxableAmount = gain - exemption;
    const taxOwed = taxableAmount * taxRate;

    // Calculate savings if wait for LTCG
    let potentialSavings = 0;
    if (!isLTCG && holding.days_to_ltcg <= 90) {
      const stcgTax = gain * 0.15;
      const ltcgTax = Math.max(0, gain - 100000) * 0.10;
      potentialSavings = stcgTax - ltcgTax;
    }

    return {
      tax_type: isLTCG ? 'LTCG' : 'STCG',
      taxable_amount: taxableAmount,
      tax_rate: taxRate,
      tax_owed: taxOwed,
      exemption_used: exemption,
      days_to_ltcg: holding.days_to_ltcg,
      potential_savings_if_wait: potentialSavings
    };
  }

  private calculateValueChanges(
    action: ScenarioAction,
    holding: EnrichedHolding | undefined,
    currentPrice: number,
    quantity: number,
    taxImpact: TaxImpact,
    context: DecisionContext
  ): {
    realized_gain_loss: number;
    proceeds_after_tax: number;
    portfolio_value_before: number;
    portfolio_value_after: number;
    portfolio_value_change: number;
    portfolio_value_change_pct: number;
  } {
    const portfolioValueBefore = context.enriched_holdings.reduce(
      (sum, h) => sum + h.current_value, 0
    );

    if (action === 'HOLD' || !holding) {
      return {
        realized_gain_loss: 0,
        proceeds_after_tax: 0,
        portfolio_value_before: portfolioValueBefore,
        portfolio_value_after: portfolioValueBefore,
        portfolio_value_change: 0,
        portfolio_value_change_pct: 0
      };
    }

    const proceeds = currentPrice * quantity;
    const costBasis = holding.avg_price * quantity;
    const realizedGainLoss = proceeds - costBasis;
    const proceedsAfterTax = proceeds - taxImpact.tax_owed;

    const soldValue = currentPrice * quantity;
    const portfolioValueAfter = portfolioValueBefore - soldValue + proceedsAfterTax;
    const portfolioValueChange = portfolioValueAfter - portfolioValueBefore;
    const portfolioValueChangePct = portfolioValueBefore > 0 
      ? (portfolioValueChange / portfolioValueBefore) * 100 
      : 0;

    return {
      realized_gain_loss: realizedGainLoss,
      proceeds_after_tax: proceedsAfterTax,
      portfolio_value_before: portfolioValueBefore,
      portfolio_value_after: portfolioValueAfter,
      portfolio_value_change: portfolioValueChange,
      portfolio_value_change_pct: portfolioValueChangePct
    };
  }

  private calculateRiskDelta(
    action: ScenarioAction,
    holding: EnrichedHolding | undefined,
    _currentPrice: number,
    quantity: number,
    context: DecisionContext
  ): RiskDelta {
    const totalValue = context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0);
    
    // Calculate current concentrations
    const sectorConcentrations = new Map<string, number>();
    context.enriched_holdings.forEach(h => {
      const sector = (h as any).sector || 'Other';
      sectorConcentrations.set(sector, (sectorConcentrations.get(sector) || 0) + h.current_value);
    });
    
    const maxSectorConcentration = Math.max(...Array.from(sectorConcentrations.values())) / totalValue * 100;
    const maxPositionConcentration = holding 
      ? (holding.current_value / totalValue) * 100 
      : 0;

    if (action === 'HOLD' || !holding) {
      return {
        sector_concentration_before: maxSectorConcentration,
        sector_concentration_after: maxSectorConcentration,
        position_concentration_before: maxPositionConcentration,
        position_concentration_after: maxPositionConcentration,
        portfolio_volatility_estimate: 'SAME',
        diversification_score_delta: 0
      };
    }

    // After action
    const soldValue = holding.current_price * quantity;
    const newTotalValue = totalValue - soldValue;
    const newPositionValue = holding.current_value - soldValue;
    const newPositionConcentration = newTotalValue > 0 
      ? (newPositionValue / newTotalValue) * 100 
      : 0;

    // Update sector concentration
    const holdingSector = (holding as any).sector || 'Other';
    const newSectorValue = (sectorConcentrations.get(holdingSector) || 0) - soldValue;
    const newMaxSectorConcentration = newTotalValue > 0
      ? Math.max(
          ...Array.from(sectorConcentrations.entries())
            .map(([sector, value]) => 
              sector === holdingSector ? newSectorValue : value
            )
        ) / newTotalValue * 100
      : 0;

    const diversificationDelta = (maxSectorConcentration - newMaxSectorConcentration) + 
                                  (maxPositionConcentration - newPositionConcentration);

    return {
      sector_concentration_before: maxSectorConcentration,
      sector_concentration_after: newMaxSectorConcentration,
      position_concentration_before: maxPositionConcentration,
      position_concentration_after: newPositionConcentration,
      portfolio_volatility_estimate: diversificationDelta > 5 ? 'LOWER' : 
                                      diversificationDelta < -5 ? 'HIGHER' : 'SAME',
      diversification_score_delta: diversificationDelta
    };
  }

  private analyzeSignalAlignment(
    action: ScenarioAction,
    symbol: string,
    context: DecisionContext
  ): { alignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING'; explanation: string } {
    const signal = context.finsight_signals.get(symbol);
    
    if (!signal) {
      return {
        alignment: 'NEUTRAL',
        explanation: 'No FinSight signal available for this stock.'
      };
    }

    const signalIntent = signal.intent;
    
    if (action === 'SELL' || action === 'REDUCE') {
      if (signalIntent === 'AVOID') {
        return {
          alignment: 'ALIGNED',
          explanation: `FinSight rates ${symbol} as AVOID. Selling aligns with intelligence.`
        };
      } else if (signalIntent === 'INITIATE') {
        return {
          alignment: 'CONFLICTING',
          explanation: `FinSight rates ${symbol} as INITIATE. Selling conflicts with intelligence.`
        };
      }
    }

    if (action === 'BUY') {
      if (signalIntent === 'INITIATE') {
        return {
          alignment: 'ALIGNED',
          explanation: `FinSight rates ${symbol} as INITIATE. Buying aligns with intelligence.`
        };
      } else if (signalIntent === 'AVOID') {
        return {
          alignment: 'CONFLICTING',
          explanation: `FinSight rates ${symbol} as AVOID. Buying conflicts with intelligence.`
        };
      }
    }

    return {
      alignment: 'NEUTRAL',
      explanation: `FinSight signal is HOLD. Action is neutral with respect to intelligence.`
    };
  }

  private calculateConfidence(
    context: DecisionContext,
    holding?: EnrichedHolding,
    priceData?: { is_stale: boolean }
  ): { score: number; factors: string[] } {
    let score = 100;
    const factors: string[] = [];

    if (context.status === 'STALE') {
      score -= 20;
      factors.push('Context data is stale');
    }

    if (!holding) {
      score -= 15;
      factors.push('No holding data');
    }

    if (!priceData || priceData.is_stale) {
      score -= 15;
      factors.push('Price data is stale or missing');
    }

    if (context.market_regime === 'UNKNOWN') {
      score -= 10;
      factors.push('Market regime unknown');
    }

    if (factors.length === 0) {
      factors.push('All data sources current and valid');
    }

    return { score: Math.max(0, score), factors };
  }

  private generateExplanation(
    input: ScenarioInput,
    taxImpact: TaxImpact,
    valueChanges: { proceeds_after_tax: number; realized_gain_loss: number },
    riskDelta: RiskDelta,
    signalAnalysis: { alignment: string; explanation: string },
    holding?: EnrichedHolding
  ): string[] {
    const explanation: string[] = [];

    // Action summary
    if (input.action === 'SELL' || input.action === 'REDUCE') {
      explanation.push(
        `${input.action}ing ${input.symbol} will realize ₹${Math.abs(valueChanges.realized_gain_loss).toLocaleString()} ${valueChanges.realized_gain_loss >= 0 ? 'gain' : 'loss'}.`
      );

      if (taxImpact.tax_owed > 0) {
        explanation.push(
          `Tax impact: ₹${taxImpact.tax_owed.toLocaleString()} ${taxImpact.tax_type} at ${(taxImpact.tax_rate * 100).toFixed(0)}% rate.`
        );
      }

      if (taxImpact.potential_savings_if_wait > 0) {
        explanation.push(
          `Waiting ${holding?.days_to_ltcg || 0} days for LTCG could save ₹${taxImpact.potential_savings_if_wait.toLocaleString()}.`
        );
      }
    }

    if (input.action === 'HOLD') {
      explanation.push(`Holding ${input.symbol} maintains current position with no tax event.`);
      if (holding && !holding.is_ltcg_eligible) {
        explanation.push(`Position becomes LTCG eligible in ${holding.days_to_ltcg} days.`);
      }
    }

    // Risk changes
    if (riskDelta.diversification_score_delta > 5) {
      explanation.push('This action improves portfolio diversification.');
    } else if (riskDelta.diversification_score_delta < -5) {
      explanation.push('This action reduces portfolio diversification.');
    }

    // Signal alignment
    explanation.push(signalAnalysis.explanation);

    return explanation;
  }

  private generateAlternatives(
    input: ScenarioInput,
    taxImpact: TaxImpact,
    holding: EnrichedHolding | undefined,
    _context: DecisionContext
  ): { action: string; benefit: string; drawback: string }[] {
    const alternatives: { action: string; benefit: string; drawback: string }[] = [];

    if (input.action === 'SELL' && holding) {
      // Alternative: Hold
      if (taxImpact.potential_savings_if_wait > 0) {
        alternatives.push({
          action: `HOLD for ${holding.days_to_ltcg} days`,
          benefit: `Save ₹${taxImpact.potential_savings_if_wait.toLocaleString()} in taxes`,
          drawback: 'Exposed to market risk during wait period'
        });
      }

      // Alternative: Partial sell
      alternatives.push({
        action: 'REDUCE 50% instead of full exit',
        benefit: 'Maintains exposure while freeing capital',
        drawback: 'Still incurs proportional tax'
      });
    }

    if (input.action === 'HOLD' && holding && holding.unrealized_pnl < 0) {
      alternatives.push({
        action: 'SELL for tax loss harvesting',
        benefit: 'Offset gains and reduce tax liability',
        drawback: 'Exits position, need to wait 30 days to re-enter'
      });
    }

    return alternatives;
  }
}

// Export singleton
export const scenarioEngine = ScenarioEngine.getInstance();

export default ScenarioEngine;

