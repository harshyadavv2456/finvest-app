/**
 * FinBot as CIO (Chief Investment Officer)
 * 
 * GOAL:
 * FinBot should behave like a Chief Investment Officer, not a chatbot.
 * 
 * RULES:
 * 1. Responses must follow structure:
 *    - Current state
 *    - Constraints
 *    - Options (ranked)
 *    - Recommendation
 *    - What could go wrong
 * 
 * 2. FinBot MUST cite:
 *    - DecisionContext ID
 *    - Scenario ID (if used)
 *    - Confidence score
 * 
 * 3. FinBot NEVER gives:
 *    - Generic advice
 *    - Opinions without numbers
 *    - Actions without explanation
 */

import { DecisionContext, decisionContextManager } from '../core/DecisionContext';
import { ScenarioEngine, ScenarioResult } from '../simulation/ScenarioEngine';
import { UserPolicy } from '../policy/UserPolicy';
import { auditLog } from '../audit/DecisionAuditLog';

// CIO Response structure
export interface CIOResponse {
  // Metadata
  response_id: string;
  context_id: string;
  scenario_id?: string;
  timestamp: string;
  
  // Structured response
  current_state: {
    portfolio_value: number;
    positions_count: number;
    unrealized_pnl: number;
    market_regime: string;
  };
  
  constraints: {
    policy_applied: string;
    risk_tolerance: string;
    tax_preference: string;
    active_constraints: string[];
  };
  
  options: RankedOption[];
  
  recommendation: {
    action: string;
    symbol?: string;
    quantity?: number;
    reasoning: string[];
    expected_outcome: string;
  };
  
  risks: {
    what_could_go_wrong: string[];
    risk_mitigation: string[];
    downside_scenario: string;
  };
  
  // Citations (NON-NEGOTIABLE)
  citations: {
    context_id: string;
    scenario_id?: string;
    confidence_score: number;
    data_sources: string[];
  };
  
  // Disclaimers
  disclaimers: string[];
}

// Ranked option
export interface RankedOption {
  rank: number;
  action: string;
  symbol?: string;
  pros: string[];
  cons: string[];
  expected_return: number;
  tax_impact: number;
  risk_score: number;
  overall_score: number;
}

// Query types that CIO can handle
export type CIOQueryType = 
  | 'SHOULD_SELL'
  | 'SHOULD_BUY'
  | 'PORTFOLIO_REVIEW'
  | 'TAX_OPTIMIZATION'
  | 'REBALANCING'
  | 'RISK_ASSESSMENT'
  | 'WHAT_IF';

/**
 * FinBot CIO
 * 
 * Chief Investment Officer behavior for FinBot.
 */
export class FinBotCIO {
  private static instance: FinBotCIO;
  private scenarioEngine: ScenarioEngine;
  private userPolicy: UserPolicy;

  private constructor() {
    this.scenarioEngine = ScenarioEngine.getInstance();
    this.userPolicy = UserPolicy.getInstance();
  }

  static getInstance(): FinBotCIO {
    if (!FinBotCIO.instance) {
      FinBotCIO.instance = new FinBotCIO();
    }
    return FinBotCIO.instance;
  }

  /**
   * Process a query as CIO
   */
  async processQuery(query: string): Promise<CIOResponse> {
    const now = new Date();
    const responseId = `CIO-${now.getTime()}`;
    
    // Log query
    const queryLogId = auditLog.logFinBotQuery(query);
    
    // Get context
    const context = decisionContextManager.getContext();
    
    // Validate context
    if (!context || context.status === 'INVALID') {
      const refusalResponse = this.createRefusalResponse(
        responseId,
        'Cannot provide advice: Decision context is invalid or missing.',
        queryLogId
      );
      
      auditLog.logFinBotResponse({
        query_id: queryLogId,
        confidence: 'LOW',
        data_used: [],
        refused: true,
        refusal_reason: 'Invalid context'
      });
      
      return refusalResponse;
    }

    // Detect query type
    const queryType = this.detectQueryType(query);
    
    // Process based on query type
    let response: CIOResponse;
    
    switch (queryType) {
      case 'SHOULD_SELL':
        response = await this.handleSellQuery(query, context, responseId);
        break;
      case 'SHOULD_BUY':
        response = await this.handleBuyQuery(query, context, responseId);
        break;
      case 'PORTFOLIO_REVIEW':
        response = this.handlePortfolioReview(context, responseId);
        break;
      case 'TAX_OPTIMIZATION':
        response = this.handleTaxOptimization(context, responseId);
        break;
      case 'RISK_ASSESSMENT':
        response = this.handleRiskAssessment(context, responseId);
        break;
      default:
        response = this.handleGeneralQuery(query, context, responseId);
    }

    // Log response
    auditLog.logFinBotResponse({
      query_id: queryLogId,
      confidence: this.getConfidenceLevel(response.citations.confidence_score),
      data_used: response.citations.data_sources,
      refused: false
    });

    return response;
  }

  /**
   * Handle "Should I sell X?" queries
   */
  private async handleSellQuery(
    query: string,
    context: DecisionContext,
    responseId: string
  ): Promise<CIOResponse> {
    // Extract symbol from query
    const symbol = this.extractSymbol(query);
    
    if (!symbol) {
      return this.createRefusalResponse(
        responseId,
        'Please specify which stock you want to analyze (e.g., "Should I sell INFY?").',
        ''
      );
    }

    // Find holding
    const holding = context.enriched_holdings.find(h => 
      h.symbol === symbol || h.symbol.includes(symbol)
    );

    if (!holding) {
      return this.createRefusalResponse(
        responseId,
        `${symbol} is not in your portfolio. Cannot provide sell analysis.`,
        ''
      );
    }

    // Run scenario - FAIL CLOSED: Log failure to audit
    let sellScenario: ScenarioResult | null = null;
    
    try {
      sellScenario = this.scenarioEngine.simulate(
        { action: 'SELL', symbol: holding.symbol, time_horizon: 30 },
        context
      );
    } catch (e: any) {
      // NO SILENT FAILURE: Log to audit trail
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: `Scenario simulation failed for ${holding.symbol}`,
        details: { 
          symbol: holding.symbol, 
          error: e.message || String(e),
          action: 'SELL'
        },
        actor: 'ENGINE'
      });
    }

    // Get signal
    const signal = context.finsight_signals.get(holding.symbol);
    
    // Build options
    const options: RankedOption[] = [];

    // Option 1: Sell now
    if (sellScenario) {
      options.push({
        rank: 0,
        action: 'SELL',
        symbol: holding.symbol,
        pros: [
          `Realize ${holding.unrealized_pnl >= 0 ? 'gain' : 'loss'} of ₹${Math.abs(holding.unrealized_pnl).toLocaleString()}`,
          sellScenario.signal_alignment === 'ALIGNED' ? 'Aligned with FinSight signal' : '',
          sellScenario.risk_delta.diversification_score_delta > 0 ? 'Improves diversification' : ''
        ].filter(Boolean),
        cons: [
          sellScenario.tax_impact.tax_owed > 0 
            ? `Tax liability: ₹${sellScenario.tax_impact.tax_owed.toLocaleString()} (${sellScenario.tax_impact.tax_type})`
            : '',
          sellScenario.tax_impact.potential_savings_if_wait > 0
            ? `Waiting ${sellScenario.tax_impact.days_to_ltcg} days saves ₹${sellScenario.tax_impact.potential_savings_if_wait.toLocaleString()}`
            : '',
          sellScenario.signal_alignment === 'CONFLICTING' ? 'Conflicts with FinSight signal' : ''
        ].filter(Boolean),
        expected_return: 0,
        tax_impact: sellScenario.tax_impact.tax_owed,
        risk_score: 30,
        overall_score: 0
      });
    }

    // Option 2: Hold
    options.push({
      rank: 1,
      action: 'HOLD',
      symbol: holding.symbol,
      pros: [
        'No tax event triggered',
        !holding.is_ltcg_eligible ? `${holding.days_to_ltcg} days to LTCG eligibility` : 'Already LTCG eligible',
        'Maintains market exposure'
      ].filter(Boolean),
      cons: [
        holding.unrealized_pnl < 0 ? 'Unrealized loss continues' : '',
        signal?.intent === 'AVOID' ? 'FinSight signals AVOID' : ''
      ].filter(Boolean),
      expected_return: 0,
      tax_impact: 0,
      risk_score: 50,
      overall_score: 0
    });

    // Option 3: Reduce 50%
    options.push({
      rank: 2,
      action: 'REDUCE 50%',
      symbol: holding.symbol,
      pros: [
        'Partial profit taking / loss realization',
        'Maintains some exposure',
        'Reduces concentration risk'
      ],
      cons: [
        'Still triggers tax event',
        'May incur transaction costs'
      ],
      expected_return: 0,
      tax_impact: sellScenario ? sellScenario.tax_impact.tax_owed / 2 : 0,
      risk_score: 40,
      overall_score: 0
    });

    // Rank options based on scoring
    options.forEach(opt => {
      let score = 50;
      if (opt.action === 'SELL' && signal?.intent === 'AVOID') score += 20;
      if (opt.action === 'HOLD' && signal?.intent === 'INITIATE') score += 20;
      if (opt.action === 'HOLD' && !holding.is_ltcg_eligible && holding.days_to_ltcg <= 60) score += 15;
      if ((sellScenario?.tax_impact.potential_savings_if_wait || 0) > holding.unrealized_pnl * 0.02) score += 10;
      opt.overall_score = score;
    });

    options.sort((a, b) => b.overall_score - a.overall_score);
    options.forEach((opt, i) => opt.rank = i + 1);

    // Build recommendation
    const topOption = options[0];
    const recommendation = {
      action: topOption.action,
      symbol: holding.symbol,
      quantity: topOption.action === 'REDUCE 50%' ? Math.floor(holding.quantity / 2) : holding.quantity,
      reasoning: [
        ...topOption.pros,
        `FinSight signal: ${signal?.intent || 'HOLD'} (${((signal?.conviction || 0.5) * 100).toFixed(0)}% conviction)`
      ],
      expected_outcome: topOption.action === 'SELL'
        ? `Proceeds after tax: ₹${sellScenario?.proceeds_after_tax.toLocaleString()}`
        : topOption.action === 'HOLD' && !holding.is_ltcg_eligible
          ? `LTCG eligible in ${holding.days_to_ltcg} days`
          : 'Position maintained'
    };

    // Build risks
    const risks = {
      what_could_go_wrong: [
        topOption.action === 'SELL' && signal?.intent === 'INITIATE' 
          ? 'Stock may continue to rise after selling' 
          : '',
        topOption.action === 'HOLD' && signal?.intent === 'AVOID'
          ? 'Stock may decline further'
          : '',
        'Market conditions may change unexpectedly',
        'Tax laws may change'
      ].filter(Boolean),
      risk_mitigation: [
        topOption.action === 'SELL' ? 'Consider redeployment into INITIATE-rated stocks' : '',
        topOption.action === 'HOLD' ? 'Set stop-loss to limit downside' : '',
        'Diversify across sectors and asset classes'
      ].filter(Boolean),
      downside_scenario: topOption.action === 'HOLD'
        ? `If ${holding.symbol} drops 20%, unrealized loss would be ₹${(holding.current_value * 0.2).toLocaleString()}`
        : `Tax of ₹${sellScenario?.tax_impact.tax_owed.toLocaleString()} is crystallized`
    };

    return {
      response_id: responseId,
      context_id: context.id,
      scenario_id: sellScenario?.scenario_id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0),
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0),
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options,
      recommendation,
      risks,
      citations: {
        context_id: context.id,
        scenario_id: sellScenario?.scenario_id,
        confidence_score: sellScenario?.confidence_score || 70,
        data_sources: ['PORTFOLIO_SNAPSHOT', 'FINSIGHT_SIGNALS', 'TAX_ANALYSIS', 'SCENARIO_ENGINE']
      },
      disclaimers: [
        'This analysis is for informational purposes only.',
        'Past performance does not guarantee future results.',
        'Consult a financial advisor before making investment decisions.',
        'Tax calculations are estimates based on current law.'
      ]
    };
  }

  /**
   * Handle "Should I buy X?" queries
   */
  private async handleBuyQuery(
    query: string,
    context: DecisionContext,
    responseId: string
  ): Promise<CIOResponse> {
    const symbol = this.extractSymbol(query);
    
    if (!symbol) {
      return this.createRefusalResponse(
        responseId,
        'Please specify which stock you want to analyze (e.g., "Should I buy RELIANCE?").',
        ''
      );
    }

    const signal = context.finsight_signals.get(symbol);
    
    const options: RankedOption[] = [
      {
        rank: 1,
        action: signal?.intent === 'INITIATE' ? 'BUY' : 'WAIT',
        symbol,
        pros: signal?.intent === 'INITIATE' 
          ? [`FinSight INITIATE signal with ${((signal.conviction || 0) * 100).toFixed(0)}% conviction`]
          : ['No buy signal - avoid speculation'],
        cons: signal?.intent === 'AVOID' 
          ? ['FinSight AVOID signal - high risk']
          : [],
        expected_return: signal?.expected_return_p50 || 0,
        tax_impact: 0,
        risk_score: signal?.intent === 'AVOID' ? 80 : 40,
        overall_score: signal?.intent === 'INITIATE' ? 80 : 20
      }
    ];

    return {
      response_id: responseId,
      context_id: context.id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0),
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0),
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options,
      recommendation: {
        action: signal?.intent === 'INITIATE' ? 'BUY' : 'WAIT',
        symbol,
        reasoning: signal 
          ? [`FinSight rates ${symbol} as ${signal.intent} with ${((signal.conviction || 0) * 100).toFixed(0)}% conviction`]
          : [`No FinSight intelligence available for ${symbol}`],
        expected_outcome: signal?.intent === 'INITIATE'
          ? `Expected return: ${((signal.expected_return_p50 || 0) * 100).toFixed(1)}%`
          : 'Wait for better entry opportunity'
      },
      risks: {
        what_could_go_wrong: [
          'Market conditions may deteriorate',
          signal?.intent === 'INITIATE' ? 'Signal may not materialize as expected' : ''
        ].filter(Boolean),
        risk_mitigation: [
          'Start with smaller position and scale in',
          'Set stop-loss at entry'
        ],
        downside_scenario: 'Stock drops 15% from entry point'
      },
      citations: {
        context_id: context.id,
        confidence_score: signal ? 70 : 30,
        data_sources: signal ? ['FINSIGHT_SIGNALS'] : []
      },
      disclaimers: [
        'This analysis is for informational purposes only.',
        'Past performance does not guarantee future results.'
      ]
    };
  }

  /**
   * Handle portfolio review
   */
  private handlePortfolioReview(context: DecisionContext, responseId: string): CIOResponse {
    const totalValue = context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0);
    const totalPnl = context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0);
    
    const avoidHoldings = context.enriched_holdings.filter(h => {
      const signal = context.finsight_signals.get(h.symbol);
      return signal?.intent === 'AVOID';
    });

    return {
      response_id: responseId,
      context_id: context.id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: totalValue,
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: totalPnl,
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options: [],
      recommendation: {
        action: 'REVIEW',
        reasoning: [
          `Portfolio value: ₹${totalValue.toLocaleString()}`,
          `Unrealized P&L: ₹${totalPnl.toLocaleString()} (${((totalPnl / totalValue) * 100).toFixed(1)}%)`,
          `${avoidHoldings.length} holdings flagged AVOID by FinSight`
        ],
        expected_outcome: 'Detailed portfolio analysis provided'
      },
      risks: {
        what_could_go_wrong: avoidHoldings.length > 0 
          ? [`${avoidHoldings.length} holdings have AVOID signals`]
          : [],
        risk_mitigation: ['Review AVOID holdings for potential exit'],
        downside_scenario: 'Market correction affects unrealized gains'
      },
      citations: {
        context_id: context.id,
        confidence_score: 85,
        data_sources: ['PORTFOLIO_SNAPSHOT', 'FINSIGHT_SIGNALS']
      },
      disclaimers: ['Portfolio analysis based on current market data.']
    };
  }

  /**
   * Handle tax optimization
   */
  private handleTaxOptimization(context: DecisionContext, responseId: string): CIOResponse {
    const stcgHoldings = context.enriched_holdings.filter(h => 
      !h.is_ltcg_eligible && h.unrealized_pnl > 0
    );
    
    const nearLtcg = stcgHoldings.filter(h => h.days_to_ltcg <= 60);
    
    const potentialSavings = nearLtcg.reduce((sum, h) => {
      const stcgTax = h.unrealized_pnl * 0.15;
      const ltcgTax = Math.max(0, h.unrealized_pnl - 100000) * 0.10;
      return sum + (stcgTax - ltcgTax);
    }, 0);

    return {
      response_id: responseId,
      context_id: context.id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0),
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0),
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options: [],
      recommendation: {
        action: 'TAX_OPTIMIZE',
        reasoning: [
          `${stcgHoldings.length} holdings have STCG exposure`,
          `${nearLtcg.length} holdings will convert to LTCG within 60 days`,
          potentialSavings > 0 ? `Potential tax savings by waiting: ₹${potentialSavings.toLocaleString()}` : ''
        ].filter(Boolean),
        expected_outcome: potentialSavings > 0 
          ? `Save ₹${potentialSavings.toLocaleString()} by waiting for LTCG conversion`
          : 'No immediate tax optimization available'
      },
      risks: {
        what_could_go_wrong: ['Market may decline while waiting for LTCG'],
        risk_mitigation: ['Set trailing stop-losses to protect gains'],
        downside_scenario: 'Gains evaporate while waiting for tax-efficient exit'
      },
      citations: {
        context_id: context.id,
        confidence_score: 80,
        data_sources: ['PORTFOLIO_SNAPSHOT', 'TAX_ANALYSIS']
      },
      disclaimers: ['Tax calculations are estimates. Consult a tax professional.']
    };
  }

  /**
   * Handle risk assessment
   */
  private handleRiskAssessment(context: DecisionContext, responseId: string): CIOResponse {
    const totalValue = context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0);
    
    // Calculate sector concentration
    const sectorValues = new Map<string, number>();
    context.enriched_holdings.forEach(h => {
      const sector = (h as any).sector || 'Other';
      sectorValues.set(sector, (sectorValues.get(sector) || 0) + h.current_value);
    });
    const maxSectorConcentration = Math.max(...Array.from(sectorValues.values())) / totalValue * 100;
    
    // Calculate position concentration
    const maxPositionConcentration = Math.max(
      ...context.enriched_holdings.map(h => h.current_value / totalValue)
    ) * 100;

    return {
      response_id: responseId,
      context_id: context.id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: totalValue,
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0),
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options: [],
      recommendation: {
        action: 'ASSESS_RISK',
        reasoning: [
          `Max sector concentration: ${maxSectorConcentration.toFixed(1)}%`,
          `Max position concentration: ${maxPositionConcentration.toFixed(1)}%`,
          `Market regime: ${context.market_regime}`
        ],
        expected_outcome: 'Risk metrics calculated and analyzed'
      },
      risks: {
        what_could_go_wrong: [
          maxSectorConcentration > 30 ? `High sector concentration (${maxSectorConcentration.toFixed(0)}%)` : '',
          maxPositionConcentration > 15 ? `High position concentration (${maxPositionConcentration.toFixed(0)}%)` : ''
        ].filter(Boolean),
        risk_mitigation: [
          maxSectorConcentration > 30 ? 'Reduce sector exposure through rebalancing' : '',
          maxPositionConcentration > 15 ? 'Trim largest positions' : ''
        ].filter(Boolean),
        downside_scenario: 'Concentrated positions amplify losses in downturns'
      },
      citations: {
        context_id: context.id,
        confidence_score: 90,
        data_sources: ['PORTFOLIO_SNAPSHOT']
      },
      disclaimers: ['Risk metrics are estimates based on current holdings.']
    };
  }

  /**
   * Handle general query
   */
  private handleGeneralQuery(
    _query: string,
    context: DecisionContext,
    responseId: string
  ): CIOResponse {
    return {
      response_id: responseId,
      context_id: context.id,
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0),
        positions_count: context.enriched_holdings.length,
        unrealized_pnl: context.enriched_holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0),
        market_regime: context.market_regime
      },
      constraints: this.buildConstraints(),
      options: [],
      recommendation: {
        action: 'CONSULT',
        reasoning: [
          'Query requires more specific information.',
          'Try asking: "Should I sell INFY?", "Review my portfolio", or "What are my tax options?"'
        ],
        expected_outcome: 'More specific query needed for actionable advice'
      },
      risks: {
        what_could_go_wrong: [],
        risk_mitigation: [],
        downside_scenario: 'N/A'
      },
      citations: {
        context_id: context.id,
        confidence_score: 50,
        data_sources: ['PORTFOLIO_SNAPSHOT']
      },
      disclaimers: ['Please provide a more specific query for detailed analysis.']
    };
  }

  // Helper methods

  private detectQueryType(query: string): CIOQueryType {
    const q = query.toLowerCase();
    if (q.includes('sell') || q.includes('exit')) return 'SHOULD_SELL';
    if (q.includes('buy') || q.includes('purchase')) return 'SHOULD_BUY';
    if (q.includes('portfolio') || q.includes('review') || q.includes('holdings')) return 'PORTFOLIO_REVIEW';
    if (q.includes('tax') || q.includes('stcg') || q.includes('ltcg')) return 'TAX_OPTIMIZATION';
    if (q.includes('risk') || q.includes('concentration')) return 'RISK_ASSESSMENT';
    if (q.includes('what if') || q.includes('scenario')) return 'WHAT_IF';
    return 'PORTFOLIO_REVIEW';
  }

  private extractSymbol(query: string): string | null {
    // Look for uppercase stock symbols
    const match = query.match(/\b([A-Z]{2,10}(?:\.[A-Z]{2})?)\b/);
    return match ? match[1] : null;
  }

  private buildConstraints(): {
    policy_applied: string;
    risk_tolerance: string;
    tax_preference: string;
    active_constraints: string[];
  } {
    const policySummary = this.userPolicy.getPolicySummary();
    return {
      policy_applied: policySummary.style,
      risk_tolerance: policySummary.risk,
      tax_preference: policySummary.tax,
      active_constraints: policySummary.constraints
    };
  }

  private getConfidenceLevel(score: number): string {
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'LOW';
  }

  private createRefusalResponse(
    responseId: string,
    message: string,
    _queryLogId: string
  ): CIOResponse {
    return {
      response_id: responseId,
      context_id: 'N/A',
      timestamp: new Date().toISOString(),
      current_state: {
        portfolio_value: 0,
        positions_count: 0,
        unrealized_pnl: 0,
        market_regime: 'UNKNOWN'
      },
      constraints: {
        policy_applied: 'N/A',
        risk_tolerance: 'N/A',
        tax_preference: 'N/A',
        active_constraints: []
      },
      options: [],
      recommendation: {
        action: 'REFUSED',
        reasoning: [message],
        expected_outcome: 'Please connect your portfolio or refresh data.'
      },
      risks: {
        what_could_go_wrong: [],
        risk_mitigation: [],
        downside_scenario: 'N/A'
      },
      citations: {
        context_id: 'N/A',
        confidence_score: 0,
        data_sources: []
      },
      disclaimers: ['Unable to provide analysis due to insufficient data.']
    };
  }
}

// Export singleton
export const finBotCIO = FinBotCIO.getInstance();

export default FinBotCIO;

