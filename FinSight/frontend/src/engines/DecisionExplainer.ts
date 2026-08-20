/**
 * DecisionExplainer - Audit-Grade Explanations
 * 
 * GOAL:
 * Every action must be explainable to a CA, CFA, or regulator.
 * 
 * RULES:
 * - NO vague language ("might", "could", "possibly")
 * - Clear factor attribution
 * - Counterfactual scenarios
 * - Numerical confidence
 */

import { 
  DecisionContext, 
  TaxAnalysis, 
  MarketRegime 
} from '../core/DecisionContext';
import { 
  AllocationRecommendation, 
  AllocationAction
} from './TaxAwareAllocator';

// Key decision factors
export type DecisionFactor = 
  | 'TAX_IMPACT'
  | 'SIGNAL_STRENGTH'
  | 'MARKET_REGIME'
  | 'HOLDING_DURATION'
  | 'DOWNSIDE_RISK'
  | 'SECTOR_EXPOSURE'
  | 'CORRELATION_RISK'
  | 'LIQUIDITY';

// Factor weight in decision
export interface FactorContribution {
  factor: DecisionFactor;
  weight: number;        // 0-100 contribution to decision
  value: string;         // Human-readable value
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  explanation: string;   // Clear, non-vague explanation
}

// Counterfactual scenario
export interface Counterfactual {
  scenario: string;      // "If sold today", "If held 42 days"
  outcome: string;       // "STCG ₹15,000 applies"
  value_impact: number;  // +/- amount
  is_better: boolean;    // Compared to recommended action
}

/**
 * Decision Explanation Output
 * 
 * This is what gets shown to users and logged for audit.
 */
export interface DecisionExplanation {
  // Metadata
  explanation_id: string;
  created_at: string;
  context_id: string;
  
  // Subject
  symbol: string;
  action: AllocationAction;
  quantity: number;
  
  // Summary (one clear sentence)
  summary: string;
  
  // Key factors with weights
  key_factors: FactorContribution[];
  
  // Alternative scenarios
  counterfactuals: Counterfactual[];
  
  // Confidence
  confidence_score: number;  // 0-100
  confidence_breakdown: {
    data_quality: number;    // How complete is the data
    signal_strength: number; // How strong is the signal
    tax_clarity: number;     // How clear is tax impact
    regime_fit: number;      // How well does regime support action
  };
  
  // Disclaimers (required for compliance)
  disclaimers: string[];
  
  // Audit trail
  data_sources: string[];
  calculation_timestamp: string;
}

/**
 * DecisionExplainer
 * 
 * Generates audit-grade explanations for investment decisions.
 */
export class DecisionExplainer {
  private static instance: DecisionExplainer;

  private constructor() {}

  static getInstance(): DecisionExplainer {
    if (!DecisionExplainer.instance) {
      DecisionExplainer.instance = new DecisionExplainer();
    }
    return DecisionExplainer.instance;
  }

  /**
   * Generate explanation for a recommendation
   */
  explain(
    recommendation: AllocationRecommendation,
    context: DecisionContext
  ): DecisionExplanation {
    const now = new Date();
    const taxAnalysis = context.tax_analyses.get(recommendation.symbol);
    const signal = context.finsight_signals.get(recommendation.symbol);
    const price = context.live_prices.get(recommendation.symbol);
    const holding = context.enriched_holdings.find(h => h.symbol === recommendation.symbol);

    // Build key factors
    const keyFactors = this.buildKeyFactors(recommendation, taxAnalysis, signal, context.market_regime, holding);

    // Build counterfactuals
    const counterfactuals = this.buildCounterfactuals(recommendation, taxAnalysis, holding);

    // Calculate confidence
    const confidenceBreakdown = this.calculateConfidenceBreakdown(context, recommendation, signal);
    const confidenceScore = this.calculateOverallConfidence(confidenceBreakdown);

    // Generate summary (one clear sentence, no vague language)
    const summary = this.generateSummary(recommendation, keyFactors, confidenceScore);

    // Data sources used
    const dataSources: string[] = [];
    if (context.portfolio_snapshot) dataSources.push('PORTFOLIO_SNAPSHOT');
    if (price) dataSources.push(`PRICE:${price.source}`);
    if (signal) dataSources.push('FINSIGHT_SIGNAL');
    if (taxAnalysis) dataSources.push('TAX_ANALYSIS');

    return {
      explanation_id: `EXP-${now.getTime()}-${recommendation.symbol}`,
      created_at: now.toISOString(),
      context_id: context.id,
      symbol: recommendation.symbol,
      action: recommendation.action,
      quantity: recommendation.quantity,
      summary,
      key_factors: keyFactors,
      counterfactuals,
      confidence_score: confidenceScore,
      confidence_breakdown: confidenceBreakdown,
      disclaimers: this.getDisclaimers(recommendation.action),
      data_sources: dataSources,
      calculation_timestamp: now.toISOString()
    };
  }

  /**
   * Build key factors with clear attributions
   */
  private buildKeyFactors(
    rec: AllocationRecommendation,
    tax: TaxAnalysis | undefined,
    signal: { intent: string; conviction: number; cvar_95: number } | undefined,
    regime: MarketRegime,
    holding: { holding_days: number; unrealized_pnl: number; is_ltcg_eligible: boolean } | undefined
  ): FactorContribution[] {
    const factors: FactorContribution[] = [];

    // Tax Impact Factor
    if (tax) {
      const taxImpact = tax.tax_if_sold_now;
      const savingsIfWait = tax.potential_savings;
      
      factors.push({
        factor: 'TAX_IMPACT',
        weight: this.calculateTaxWeight(rec.action, tax),
        value: `₹${taxImpact.toLocaleString()}`,
        impact: savingsIfWait > 0 ? 'NEGATIVE' : 'NEUTRAL',
        explanation: tax.is_ltcg_eligible
          ? `Long-term capital gains tax of ₹${taxImpact.toLocaleString()} applies (10% above ₹1L exemption).`
          : `Short-term capital gains tax of ₹${taxImpact.toLocaleString()} applies (15%). Waiting ${tax.days_to_ltcg} days converts to LTCG, saving ₹${savingsIfWait.toLocaleString()}.`
      });
    }

    // Signal Strength Factor
    if (signal) {
      const signalStrength = Math.round(signal.conviction * 100);
      factors.push({
        factor: 'SIGNAL_STRENGTH',
        weight: signalStrength,
        value: `${signalStrength}%`,
        impact: signal.intent === 'INITIATE' ? 'POSITIVE' : signal.intent === 'AVOID' ? 'NEGATIVE' : 'NEUTRAL',
        explanation: `FinSight intelligence rates this ${signal.intent} with ${signalStrength}% conviction based on quantitative analysis.`
      });
    }

    // Market Regime Factor
    factors.push({
      factor: 'MARKET_REGIME',
      weight: this.getRegimeWeight(regime, rec.action),
      value: regime.replace('_', ' '),
      impact: this.getRegimeImpact(regime, rec.action),
      explanation: this.getRegimeExplanation(regime, rec.action)
    });

    // Holding Duration Factor
    if (holding) {
      factors.push({
        factor: 'HOLDING_DURATION',
        weight: holding.is_ltcg_eligible ? 80 : 40,
        value: `${holding.holding_days} days`,
        impact: holding.is_ltcg_eligible ? 'POSITIVE' : 'NEGATIVE',
        explanation: holding.is_ltcg_eligible
          ? `Held for ${holding.holding_days} days. Qualifies for long-term capital gains treatment.`
          : `Held for ${holding.holding_days} days. Does not qualify for LTCG. ${holding.unrealized_pnl > 0 ? 'Selling now incurs higher STCG rate.' : 'Short-term loss can offset gains.'}`
      });
    }

    // Downside Risk Factor
    if (signal && signal.cvar_95 !== undefined) {
      const cvar = Math.abs(signal.cvar_95 * 100);
      factors.push({
        factor: 'DOWNSIDE_RISK',
        weight: Math.min(100, cvar),
        value: `${cvar.toFixed(1)}% CVaR`,
        impact: cvar > 15 ? 'NEGATIVE' : cvar > 10 ? 'NEUTRAL' : 'POSITIVE',
        explanation: `Conditional Value-at-Risk (worst 5% scenarios) is ${cvar.toFixed(1)}%. ${cvar > 15 ? 'Elevated downside risk.' : cvar > 10 ? 'Moderate risk profile.' : 'Low downside risk.'}`
      });
    }

    // Sort by weight descending
    return factors.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Build counterfactual scenarios
   */
  private buildCounterfactuals(
    rec: AllocationRecommendation,
    tax: TaxAnalysis | undefined,
    holding: { unrealized_pnl: number; days_to_ltcg: number; is_ltcg_eligible: boolean } | undefined
  ): Counterfactual[] {
    const counterfactuals: Counterfactual[] = [];

    if (!tax || !holding) return counterfactuals;

    // Current action scenario
    if (rec.action === 'EXIT' || rec.action === 'REDUCE') {
      // Sell now scenario
      counterfactuals.push({
        scenario: 'If sold today',
        outcome: holding.is_ltcg_eligible 
          ? `LTCG tax of ₹${tax.tax_if_sold_now.toLocaleString()} applies`
          : `STCG tax of ₹${tax.tax_if_sold_now.toLocaleString()} applies`,
        value_impact: -tax.tax_if_sold_now,
        is_better: true // Action is EXIT or REDUCE, so selling is the recommended path
      });

      // Wait for LTCG scenario (if applicable)
      if (!holding.is_ltcg_eligible && holding.days_to_ltcg <= 90) {
        counterfactuals.push({
          scenario: `If held ${holding.days_to_ltcg} more days`,
          outcome: `Converts to LTCG. Tax becomes ₹${tax.tax_if_ltcg.toLocaleString()}`,
          value_impact: tax.potential_savings,
          is_better: tax.potential_savings > holding.unrealized_pnl * 0.02
        });
      }
    }

    // Hold scenario
    if (rec.action === 'HOLD') {
      counterfactuals.push({
        scenario: 'Continue holding',
        outcome: 'No tax event triggered. Unrealized gains remain unrealized.',
        value_impact: 0,
        is_better: true
      });

      if (!holding.is_ltcg_eligible) {
        counterfactuals.push({
          scenario: `In ${holding.days_to_ltcg} days`,
          outcome: 'Position becomes LTCG eligible',
          value_impact: tax.potential_savings,
          is_better: true
        });
      }
    }

    // Loss harvesting scenario
    if (holding.unrealized_pnl < 0) {
      counterfactuals.push({
        scenario: 'If loss harvested',
        outcome: `Loss of ₹${Math.abs(holding.unrealized_pnl).toLocaleString()} can offset capital gains`,
        value_impact: Math.abs(holding.unrealized_pnl) * 0.15, // Approx tax savings
        is_better: true
      });
    }

    return counterfactuals;
  }

  /**
   * Calculate confidence breakdown
   */
  private calculateConfidenceBreakdown(
    context: DecisionContext,
    rec: AllocationRecommendation,
    signal: { conviction: number } | undefined
  ): { data_quality: number; signal_strength: number; tax_clarity: number; regime_fit: number } {
    // Data quality: based on context status
    let dataQuality = 0;
    if (context.status === 'VALID') dataQuality = 100;
    else if (context.status === 'STALE') dataQuality = 70;
    else if (context.status === 'INCOMPLETE') dataQuality = 40;
    else dataQuality = 0;

    // Signal strength: from FinSight
    const signalStrength = signal ? Math.round(signal.conviction * 100) : 30;

    // Tax clarity: based on tax analysis availability
    const taxClarity = context.tax_analyses.has(rec.symbol) ? 100 : 20;

    // Regime fit: how well does regime support action
    const regimeFit = this.calculateRegimeFit(context.market_regime, rec.action);

    return {
      data_quality: dataQuality,
      signal_strength: signalStrength,
      tax_clarity: taxClarity,
      regime_fit: regimeFit
    };
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(breakdown: { 
    data_quality: number; 
    signal_strength: number; 
    tax_clarity: number; 
    regime_fit: number 
  }): number {
    // Weighted average
    const weights = {
      data_quality: 0.3,
      signal_strength: 0.35,
      tax_clarity: 0.2,
      regime_fit: 0.15
    };

    return Math.round(
      breakdown.data_quality * weights.data_quality +
      breakdown.signal_strength * weights.signal_strength +
      breakdown.tax_clarity * weights.tax_clarity +
      breakdown.regime_fit * weights.regime_fit
    );
  }

  /**
   * Generate clear summary (NO vague language)
   */
  private generateSummary(
    rec: AllocationRecommendation,
    factors: FactorContribution[],
    confidence: number
  ): string {
    const topFactor = factors[0];
    const action = rec.action;
    const symbol = rec.symbol;

    const actionVerb = {
      'BUY': 'Initiating position in',
      'HOLD': 'Maintaining position in',
      'REDUCE': 'Reducing position in',
      'EXIT': 'Exiting position in'
    }[action];

    const confidenceText = confidence >= 80 
      ? 'with high confidence' 
      : confidence >= 60 
        ? 'with moderate confidence' 
        : 'with low confidence';

    return `${actionVerb} ${symbol} ${confidenceText}. Primary factor: ${topFactor.explanation}`;
  }

  /**
   * Get compliance disclaimers
   */
  private getDisclaimers(action: AllocationAction): string[] {
    const base = [
      'This analysis is for informational purposes only and does not constitute investment advice.',
      'Past performance does not guarantee future results.',
      'Tax calculations are estimates based on available data and current tax laws.',
      'Consult a qualified financial advisor before making investment decisions.'
    ];

    if (action === 'BUY' || action === 'EXIT') {
      base.push('Execution of trades is subject to market conditions and liquidity.');
    }

    return base;
  }

  // Helper methods

  private calculateTaxWeight(action: AllocationAction, tax: TaxAnalysis): number {
    if (action === 'HOLD') return 30;
    if (tax.potential_savings > 0) return 80;
    if (tax.tax_if_sold_now > 0) return 60;
    return 40;
  }

  private getRegimeWeight(regime: MarketRegime, action: AllocationAction): number {
    if (regime === 'UNKNOWN') return 20;
    if (regime === 'BULL_STRONG' && action === 'BUY') return 80;
    if (regime === 'BEAR_STRONG' && action === 'EXIT') return 80;
    return 50;
  }

  private getRegimeImpact(regime: MarketRegime, action: AllocationAction): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
    if (regime === 'BULL_STRONG' && (action === 'BUY' || action === 'HOLD')) return 'POSITIVE';
    if (regime === 'BEAR_STRONG' && (action === 'EXIT' || action === 'REDUCE')) return 'POSITIVE';
    if (regime === 'BULL_STRONG' && action === 'EXIT') return 'NEGATIVE';
    if (regime === 'BEAR_STRONG' && action === 'BUY') return 'NEGATIVE';
    return 'NEUTRAL';
  }

  private getRegimeExplanation(regime: MarketRegime, _action: AllocationAction): string {
    const explanations: Record<MarketRegime, string> = {
      'BULL_STRONG': 'Market is in a strong uptrend with low volatility. Favorable for equity positions.',
      'BULL_VOLATILE': 'Market is trending up but with elevated volatility. Proceed with position sizing caution.',
      'BEAR_STRONG': 'Market is in a strong downtrend. Defensive positioning recommended.',
      'BEAR_VOLATILE': 'Market is declining with high volatility. High risk environment.',
      'SIDEWAYS': 'Market lacks clear direction. Range-bound trading conditions.',
      'UNKNOWN': 'Market regime data unavailable. Using conservative assumptions.'
    };
    return explanations[regime];
  }

  private calculateRegimeFit(regime: MarketRegime, action: AllocationAction): number {
    if (regime === 'UNKNOWN') return 50;
    if (regime === 'BULL_STRONG' && (action === 'BUY' || action === 'HOLD')) return 90;
    if (regime === 'BEAR_STRONG' && (action === 'EXIT' || action === 'REDUCE')) return 90;
    if (regime === 'SIDEWAYS') return 60;
    if (regime.includes('VOLATILE')) return 40;
    return 50;
  }
}

// Export singleton
export const decisionExplainer = DecisionExplainer.getInstance();

export default DecisionExplainer;

