/**
 * Tax-Aware Allocation Engine
 * 
 * Every recommendation MUST minimize AFTER-TAX risk.
 * 
 * Inputs:
 * - Portfolio snapshot (from CAMS/CDSL)
 * - Live prices (PriceService)
 * - FinSight signals
 * - User tax profile
 * 
 * Logic considers:
 * - STCG vs LTCG
 * - FIFO realization
 * - Loss harvesting
 * - Wash-sale avoidance (where applicable)
 * - Post-tax CAGR, not raw CAGR
 * 
 * NO EXECUTION. Only planning.
 */

import { 
  portfolioCore, 
  EnrichedHolding, 
  TaxProfile
} from '../integrations/portfolio';

// Action types
export type AllocationAction = 'BUY' | 'HOLD' | 'REDUCE' | 'EXIT';

// Confidence levels
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * FinSight signal for a stock
 */
export interface FinSightSignal {
  symbol: string;
  intent: 'INITIATE' | 'AVOID' | 'HOLD';
  conviction: number; // 0-1
  expected_return_p50: number; // Median expected return
  cvar_95: number; // Conditional Value at Risk (downside)
  regime: string;
  reasoning: string[];
}

/**
 * Tax lot for FIFO calculation
 */
export interface TaxLot {
  lot_id: string;
  symbol: string;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
  holding_days: number;
  is_ltcg: boolean;
  unrealized_gain: number;
  tax_if_sold: number;
}

/**
 * Allocation recommendation output
 */
export interface AllocationRecommendation {
  symbol: string;
  isin?: string;
  action: AllocationAction;
  quantity: number;
  current_quantity: number;
  
  // Return projections
  expected_pre_tax_return: number;
  expected_tax: number;
  expected_post_tax_return: number;
  
  // Risk metrics
  cvar_95: number;
  conviction: ConfidenceLevel;
  
  // Reasoning chain
  reasoning: string[];
  
  // Tax optimization info
  tax_lots?: TaxLot[];
  days_to_ltcg?: number;
  loss_harvest_potential?: number;
}

/**
 * Allocation engine output
 */
export interface AllocationPlan {
  generated_at: string;
  portfolio_value: number;
  recommendations: AllocationRecommendation[];
  summary: {
    total_buy_value: number;
    total_reduce_value: number;
    total_exit_value: number;
    estimated_tax_savings: number;
    actions_count: {
      BUY: number;
      HOLD: number;
      REDUCE: number;
      EXIT: number;
    };
  };
  warnings: string[];
}

/**
 * Tax-Aware Allocation Engine
 */
export class TaxAwareAllocator {
  private static instance: TaxAwareAllocator;
  private signals: Map<string, FinSightSignal> = new Map();
  private prices: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): TaxAwareAllocator {
    if (!TaxAwareAllocator.instance) {
      TaxAwareAllocator.instance = new TaxAwareAllocator();
    }
    return TaxAwareAllocator.instance;
  }

  /**
   * Update FinSight signals
   */
  updateSignals(signals: FinSightSignal[]): void {
    this.signals.clear();
    signals.forEach(s => this.signals.set(s.symbol, s));
  }

  /**
   * Update live prices
   */
  updatePrices(prices: Record<string, number>): void {
    Object.entries(prices).forEach(([symbol, price]) => {
      this.prices.set(symbol, price);
    });
  }

  /**
   * Generate allocation plan
   * Returns null if portfolio not connected
   */
  async generatePlan(): Promise<AllocationPlan | null> {
    if (!portfolioCore.isAvailable()) {
      return null;
    }

    const taxProfile = portfolioCore.getTaxProfile();
    const holdings = await portfolioCore.getEnrichedHoldings();
    const recommendations: AllocationRecommendation[] = [];
    const warnings: string[] = [];

    let totalBuy = 0;
    let totalReduce = 0;
    let totalExit = 0;
    let estimatedTaxSavings = 0;

    // Process each holding
    for (const holding of holdings) {
      const signal = this.signals.get(holding.symbol);
      const recommendation = this.analyzeHolding(holding, signal, taxProfile);
      recommendations.push(recommendation);

      // Track values
      switch (recommendation.action) {
        case 'BUY':
          totalBuy += recommendation.quantity * (this.prices.get(holding.symbol) || holding.current_price);
          break;
        case 'REDUCE':
          totalReduce += recommendation.quantity * holding.current_price;
          break;
        case 'EXIT':
          totalExit += holding.current_value;
          break;
      }

      // Track tax savings from waiting for LTCG
      if (recommendation.days_to_ltcg && recommendation.days_to_ltcg > 0 && recommendation.days_to_ltcg <= 60) {
        const potentialSavings = this.calculateLtcgSavings(holding, taxProfile);
        if (potentialSavings > 0) {
          estimatedTaxSavings += potentialSavings;
        }
      }
    }

    // Check for INITIATE signals in watchlist (not in portfolio)
    for (const [symbol, signal] of this.signals) {
      if (signal.intent === 'INITIATE' && !holdings.find(h => h.symbol === symbol)) {
        recommendations.push(this.createBuyRecommendation(symbol, signal));
        warnings.push(`${symbol}: INITIATE signal but not in portfolio`);
      }
    }

    // Sort by conviction
    recommendations.sort((a, b) => {
      const convOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return convOrder[a.conviction] - convOrder[b.conviction];
    });

    const summary = {
      total_buy_value: totalBuy,
      total_reduce_value: totalReduce,
      total_exit_value: totalExit,
      estimated_tax_savings: estimatedTaxSavings,
      actions_count: {
        BUY: recommendations.filter(r => r.action === 'BUY').length,
        HOLD: recommendations.filter(r => r.action === 'HOLD').length,
        REDUCE: recommendations.filter(r => r.action === 'REDUCE').length,
        EXIT: recommendations.filter(r => r.action === 'EXIT').length
      }
    };

    const portfolioSummary = await portfolioCore.getSummary();

    return {
      generated_at: new Date().toISOString(),
      portfolio_value: portfolioSummary?.current_value || 0,
      recommendations,
      summary,
      warnings
    };
  }

  /**
   * Analyze a single holding
   */
  private analyzeHolding(
    holding: EnrichedHolding, 
    signal: FinSightSignal | undefined,
    taxProfile: TaxProfile
  ): AllocationRecommendation {
    const reasoning: string[] = [];
    let action: AllocationAction = 'HOLD';
    let quantity = 0;
    let expectedPreTaxReturn = 0;
    let expectedTax = 0;
    let conviction: ConfidenceLevel = 'MEDIUM';

    // Factor 1: FinSight Signal
    if (signal) {
      expectedPreTaxReturn = signal.expected_return_p50;
      
      if (signal.intent === 'AVOID') {
        action = holding.unrealized_pnl > 0 ? 'EXIT' : 'REDUCE';
        reasoning.push(`FinSight signal: AVOID with ${(signal.conviction * 100).toFixed(0)}% conviction`);
      } else if (signal.intent === 'INITIATE') {
        action = 'BUY';
        reasoning.push(`FinSight signal: INITIATE with ${(signal.conviction * 100).toFixed(0)}% conviction`);
      } else {
        action = 'HOLD';
        reasoning.push(`FinSight signal: HOLD - neutral outlook`);
      }
      
      conviction = signal.conviction > 0.7 ? 'HIGH' : signal.conviction > 0.4 ? 'MEDIUM' : 'LOW';
    } else {
      reasoning.push('No FinSight signal available - defaulting to HOLD');
      conviction = 'LOW';
    }

    // Factor 2: Tax Optimization (can override action)
    if (action === 'EXIT' || action === 'REDUCE') {
      // Check LTCG eligibility
      if (!holding.is_ltcg_eligible && holding.days_to_ltcg <= 60 && holding.unrealized_pnl > 0) {
        // Worth waiting for LTCG
        const stcgTax = holding.unrealized_pnl * taxProfile.stcg_rate;
        const ltcgTax = Math.max(0, holding.unrealized_pnl - taxProfile.ltcg_exemption) * taxProfile.ltcg_rate;
        const taxSavings = stcgTax - ltcgTax;
        
        if (taxSavings > holding.unrealized_pnl * 0.02) { // >2% savings threshold
          action = 'HOLD';
          reasoning.push(`TAX: Holding ${holding.days_to_ltcg} more days converts to LTCG`);
          reasoning.push(`TAX: Potential savings of ₹${taxSavings.toFixed(0)} by waiting`);
        }
      }

      // Loss harvesting opportunity
      if (holding.unrealized_pnl < 0) {
        reasoning.push(`TAX: Loss of ₹${Math.abs(holding.unrealized_pnl).toFixed(0)} can offset gains`);
        if (action !== 'EXIT') {
          action = 'EXIT'; // Harvest the loss
          reasoning.push(`TAX: Recommending EXIT to harvest loss`);
        }
      }
    }

    // Factor 3: Calculate tax impact
    if (action === 'EXIT' || action === 'REDUCE') {
      if (holding.unrealized_pnl > 0) {
        if (holding.is_ltcg_eligible) {
          expectedTax = Math.max(0, holding.unrealized_pnl - taxProfile.ltcg_exemption) * taxProfile.ltcg_rate;
          reasoning.push(`TAX: LTCG of ₹${expectedTax.toFixed(0)} applies (10% above ₹1L exemption)`);
        } else {
          expectedTax = holding.unrealized_pnl * taxProfile.stcg_rate;
          reasoning.push(`TAX: STCG of ₹${expectedTax.toFixed(0)} applies (15%)`);
        }
      }
    }

    // Determine quantity
    if (action === 'EXIT') {
      quantity = holding.quantity;
    } else if (action === 'REDUCE') {
      quantity = Math.ceil(holding.quantity * 0.5); // Reduce by 50%
    } else if (action === 'BUY') {
      // Suggest 10% of current holding value or base amount
      quantity = Math.max(1, Math.ceil(holding.quantity * 0.1));
    }

    const expectedPostTaxReturn = expectedPreTaxReturn - (expectedTax / holding.current_value);

    return {
      symbol: holding.symbol,
      isin: holding.isin,
      action,
      quantity,
      current_quantity: holding.quantity,
      expected_pre_tax_return: expectedPreTaxReturn,
      expected_tax: expectedTax,
      expected_post_tax_return: expectedPostTaxReturn,
      cvar_95: signal?.cvar_95 || 0,
      conviction,
      reasoning,
      days_to_ltcg: holding.days_to_ltcg,
      loss_harvest_potential: holding.unrealized_pnl < 0 ? Math.abs(holding.unrealized_pnl) : 0
    };
  }

  /**
   * Create buy recommendation for non-held stock
   */
  private createBuyRecommendation(symbol: string, signal: FinSightSignal): AllocationRecommendation {
    return {
      symbol,
      action: 'BUY',
      quantity: 0, // User must decide quantity
      current_quantity: 0,
      expected_pre_tax_return: signal.expected_return_p50,
      expected_tax: 0,
      expected_post_tax_return: signal.expected_return_p50,
      cvar_95: signal.cvar_95,
      conviction: signal.conviction > 0.7 ? 'HIGH' : signal.conviction > 0.4 ? 'MEDIUM' : 'LOW',
      reasoning: [
        `FinSight INITIATE signal with ${(signal.conviction * 100).toFixed(0)}% conviction`,
        `Expected 30-day return: ${(signal.expected_return_p50 * 100).toFixed(1)}%`,
        `Regime: ${signal.regime}`,
        ...signal.reasoning
      ]
    };
  }

  /**
   * Calculate potential LTCG savings
   */
  private calculateLtcgSavings(holding: EnrichedHolding, taxProfile: TaxProfile): number {
    if (holding.unrealized_pnl <= 0) return 0;
    
    const stcgTax = holding.unrealized_pnl * taxProfile.stcg_rate;
    const ltcgTax = Math.max(0, holding.unrealized_pnl - taxProfile.ltcg_exemption) * taxProfile.ltcg_rate;
    
    return stcgTax - ltcgTax;
  }

  /**
   * Get recommendation for a specific symbol
   */
  async getRecommendation(symbol: string): Promise<AllocationRecommendation | null> {
    const plan = await this.generatePlan();
    if (!plan) return null;
    
    return plan.recommendations.find(r => r.symbol === symbol) || null;
  }
}

// Export singleton
export const taxAwareAllocator = TaxAwareAllocator.getInstance();

export default TaxAwareAllocator;

