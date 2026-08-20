/**
 * UserPolicy - User Risk & Tax Philosophy Engine
 * 
 * GOAL:
 * System must respect user's risk & tax philosophy.
 * 
 * DecisionContext must be filtered THROUGH UserPolicy
 * before recommendations.
 */

import { DecisionContext, MarketRegime } from '../core/DecisionContext';
import { AllocationRecommendation, AllocationAction } from '../engines/TaxAwareAllocator';

// Risk tolerance levels
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

// Tax preference
export type TaxPreference = 'OPTIMIZE' | 'NEUTRAL' | 'IGNORE';

// Holding bias
export type HoldingBias = 'LONG_TERM' | 'FLEXIBLE';

// Investment style
export type InvestmentStyle = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

/**
 * User policy configuration
 */
export interface UserPolicyConfig {
  // Risk profile
  risk_tolerance: RiskTolerance;
  max_drawdown_allowed: number;  // e.g., 0.15 for 15%
  max_single_position: number;   // e.g., 0.10 for 10%
  max_sector_exposure: number;   // e.g., 0.30 for 30%
  
  // Tax preferences
  tax_preference: TaxPreference;
  ltcg_priority: boolean;        // Prioritize LTCG conversion
  harvest_losses: boolean;       // Enable tax loss harvesting
  
  // Holding preferences
  holding_bias: HoldingBias;
  min_holding_days: number;      // Minimum days before selling
  
  // Market regime filters
  avoid_in_bear: boolean;        // Avoid new positions in bear market
  reduce_in_volatile: boolean;   // Reduce position sizes in volatile markets
  
  // Investment limits
  investment_style: InvestmentStyle;
  min_conviction_score: number;  // Minimum conviction for recommendations
  
  // Constraints
  excluded_sectors: string[];
  excluded_symbols: string[];
  only_dividend_stocks: boolean;
}

/**
 * Policy filter result
 */
export interface PolicyFilterResult {
  // Original recommendation
  original_action: AllocationAction;
  original_symbol: string;
  
  // Filtered action
  filtered_action: AllocationAction;
  was_modified: boolean;
  
  // Reason for modification
  modification_reason?: string;
  
  // Policy violations
  violations: string[];
  
  // Warnings (not violations, but cautions)
  warnings: string[];
  
  // Policy compliance score (0-100)
  compliance_score: number;
}

/**
 * Default policy configurations
 */
export const DEFAULT_POLICIES: Record<InvestmentStyle, Partial<UserPolicyConfig>> = {
  CONSERVATIVE: {
    risk_tolerance: 'LOW',
    max_drawdown_allowed: 0.10,
    max_single_position: 0.08,
    max_sector_exposure: 0.25,
    tax_preference: 'OPTIMIZE',
    ltcg_priority: true,
    harvest_losses: true,
    holding_bias: 'LONG_TERM',
    min_holding_days: 365,
    avoid_in_bear: true,
    reduce_in_volatile: true,
    min_conviction_score: 0.70,
    only_dividend_stocks: false
  },
  MODERATE: {
    risk_tolerance: 'MEDIUM',
    max_drawdown_allowed: 0.20,
    max_single_position: 0.12,
    max_sector_exposure: 0.30,
    tax_preference: 'NEUTRAL',
    ltcg_priority: true,
    harvest_losses: true,
    holding_bias: 'FLEXIBLE',
    min_holding_days: 90,
    avoid_in_bear: false,
    reduce_in_volatile: true,
    min_conviction_score: 0.60,
    only_dividend_stocks: false
  },
  AGGRESSIVE: {
    risk_tolerance: 'HIGH',
    max_drawdown_allowed: 0.35,
    max_single_position: 0.15,
    max_sector_exposure: 0.40,
    tax_preference: 'IGNORE',
    ltcg_priority: false,
    harvest_losses: false,
    holding_bias: 'FLEXIBLE',
    min_holding_days: 30,
    avoid_in_bear: false,
    reduce_in_volatile: false,
    min_conviction_score: 0.50,
    only_dividend_stocks: false
  }
};

/**
 * UserPolicy Engine
 * 
 * Filters recommendations through user's policy.
 */
export class UserPolicy {
  private static instance: UserPolicy;
  private config: UserPolicyConfig;

  private constructor() {
    // Default to moderate
    this.config = this.buildFullConfig('MODERATE');
  }

  static getInstance(): UserPolicy {
    if (!UserPolicy.instance) {
      UserPolicy.instance = new UserPolicy();
    }
    return UserPolicy.instance;
  }

  /**
   * Get current policy config
   */
  getConfig(): UserPolicyConfig {
    return { ...this.config };
  }

  /**
   * Update policy config
   */
  updateConfig(updates: Partial<UserPolicyConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Set investment style (applies preset)
   */
  setInvestmentStyle(style: InvestmentStyle): void {
    this.config = this.buildFullConfig(style);
  }

  /**
   * Filter a single recommendation
   */
  filterRecommendation(
    recommendation: AllocationRecommendation,
    context: DecisionContext
  ): PolicyFilterResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let filteredAction = recommendation.action;
    let modificationReason: string | undefined;

    // Check excluded symbols
    if (this.config.excluded_symbols.includes(recommendation.symbol)) {
      violations.push(`${recommendation.symbol} is in excluded symbols list`);
      if (filteredAction === 'BUY') {
        filteredAction = 'HOLD';
        modificationReason = 'Symbol is excluded by policy';
      }
    }

    // Check excluded sectors
    const holding = context.enriched_holdings.find(h => h.symbol === recommendation.symbol);
    const holdingSector = (holding as any)?.sector || '';
    if (holding && this.config.excluded_sectors.includes(holdingSector)) {
      violations.push(`${holdingSector} sector is excluded`);
      if (filteredAction === 'BUY') {
        filteredAction = 'HOLD';
        modificationReason = 'Sector is excluded by policy';
      }
    }

    // Check conviction score
    const signal = context.finsight_signals.get(recommendation.symbol);
    if (signal && signal.conviction < this.config.min_conviction_score) {
      warnings.push(`Conviction ${(signal.conviction * 100).toFixed(0)}% below minimum ${(this.config.min_conviction_score * 100).toFixed(0)}%`);
      if (filteredAction === 'BUY') {
        filteredAction = 'HOLD';
        modificationReason = 'Conviction below minimum threshold';
      }
    }

    // Check market regime
    if (this.config.avoid_in_bear && this.isBearMarket(context.market_regime)) {
      if (filteredAction === 'BUY') {
        warnings.push('Avoiding new positions in bear market');
        filteredAction = 'HOLD';
        modificationReason = 'Bear market - new positions avoided';
      }
    }

    // Check LTCG priority for sells
    if (this.config.ltcg_priority && (filteredAction === 'EXIT' || filteredAction === 'REDUCE')) {
      if (holding && !holding.is_ltcg_eligible && holding.unrealized_pnl > 0) {
        if (holding.days_to_ltcg <= 60) {
          warnings.push(`${holding.days_to_ltcg} days to LTCG - consider waiting`);
          if (this.config.tax_preference === 'OPTIMIZE') {
            filteredAction = 'HOLD';
            modificationReason = `LTCG conversion possible in ${holding.days_to_ltcg} days`;
          }
        }
      }
    }

    // Check min holding period
    if (holding && holding.holding_days < this.config.min_holding_days) {
      if (filteredAction === 'EXIT' || filteredAction === 'REDUCE') {
        warnings.push(`Held only ${holding.holding_days} days, below minimum ${this.config.min_holding_days}`);
        if (this.config.holding_bias === 'LONG_TERM') {
          filteredAction = 'HOLD';
          modificationReason = 'Minimum holding period not met';
        }
      }
    }

    // Check position size
    if (filteredAction === 'BUY') {
      const portfolioValue = context.enriched_holdings.reduce((sum, h) => sum + h.current_value, 0);
      const positionValue = holding?.current_value || 0;
      const positionPct = portfolioValue > 0 ? positionValue / portfolioValue : 0;
      
      if (positionPct > this.config.max_single_position) {
        violations.push(`Position ${(positionPct * 100).toFixed(1)}% exceeds max ${(this.config.max_single_position * 100).toFixed(0)}%`);
      }
    }

    // Calculate compliance score
    const complianceScore = this.calculateComplianceScore(violations, warnings);

    return {
      original_action: recommendation.action,
      original_symbol: recommendation.symbol,
      filtered_action: filteredAction,
      was_modified: filteredAction !== recommendation.action,
      modification_reason: modificationReason,
      violations,
      warnings,
      compliance_score: complianceScore
    };
  }

  /**
   * Filter multiple recommendations
   */
  filterRecommendations(
    recommendations: AllocationRecommendation[],
    context: DecisionContext
  ): PolicyFilterResult[] {
    return recommendations.map(rec => this.filterRecommendation(rec, context));
  }

  /**
   * Check if action is allowed by policy
   */
  isActionAllowed(
    action: AllocationAction,
    symbol: string,
    context: DecisionContext
  ): { allowed: boolean; reason?: string } {
    // Excluded symbol
    if (this.config.excluded_symbols.includes(symbol)) {
      return { allowed: false, reason: 'Symbol is excluded by policy' };
    }

    // Market regime check
    if (action === 'BUY' && this.config.avoid_in_bear && this.isBearMarket(context.market_regime)) {
      return { allowed: false, reason: 'New positions not allowed in bear market' };
    }

    // Check holding for sells
    if (action === 'EXIT' || action === 'REDUCE') {
      const holding = context.enriched_holdings.find(h => h.symbol === symbol);
      if (holding && holding.holding_days < this.config.min_holding_days) {
        if (this.config.holding_bias === 'LONG_TERM') {
          return { allowed: false, reason: `Minimum holding period of ${this.config.min_holding_days} days not met` };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Get policy summary for UI
   */
  getPolicySummary(): {
    style: InvestmentStyle;
    risk: RiskTolerance;
    tax: TaxPreference;
    constraints: string[];
  } {
    const constraints: string[] = [];
    
    if (this.config.max_single_position < 0.15) {
      constraints.push(`Max position: ${(this.config.max_single_position * 100).toFixed(0)}%`);
    }
    if (this.config.max_sector_exposure < 0.35) {
      constraints.push(`Max sector: ${(this.config.max_sector_exposure * 100).toFixed(0)}%`);
    }
    if (this.config.ltcg_priority) {
      constraints.push('LTCG priority enabled');
    }
    if (this.config.avoid_in_bear) {
      constraints.push('No buys in bear market');
    }
    if (this.config.excluded_sectors.length > 0) {
      constraints.push(`Excluded sectors: ${this.config.excluded_sectors.join(', ')}`);
    }

    return {
      style: this.config.investment_style,
      risk: this.config.risk_tolerance,
      tax: this.config.tax_preference,
      constraints
    };
  }

  // Private methods

  private buildFullConfig(style: InvestmentStyle): UserPolicyConfig {
    const preset = DEFAULT_POLICIES[style];
    return {
      risk_tolerance: preset.risk_tolerance || 'MEDIUM',
      max_drawdown_allowed: preset.max_drawdown_allowed || 0.20,
      max_single_position: preset.max_single_position || 0.12,
      max_sector_exposure: preset.max_sector_exposure || 0.30,
      tax_preference: preset.tax_preference || 'NEUTRAL',
      ltcg_priority: preset.ltcg_priority ?? true,
      harvest_losses: preset.harvest_losses ?? true,
      holding_bias: preset.holding_bias || 'FLEXIBLE',
      min_holding_days: preset.min_holding_days || 90,
      avoid_in_bear: preset.avoid_in_bear ?? false,
      reduce_in_volatile: preset.reduce_in_volatile ?? true,
      investment_style: style,
      min_conviction_score: preset.min_conviction_score || 0.60,
      excluded_sectors: [],
      excluded_symbols: [],
      only_dividend_stocks: preset.only_dividend_stocks ?? false
    };
  }

  private isBearMarket(regime: MarketRegime): boolean {
    return regime === 'BEAR_STRONG' || regime === 'BEAR_VOLATILE';
  }

  private calculateComplianceScore(violations: string[], warnings: string[]): number {
    let score = 100;
    score -= violations.length * 25;  // Each violation costs 25 points
    score -= warnings.length * 10;    // Each warning costs 10 points
    return Math.max(0, Math.min(100, score));
  }
}

// Export singleton
export const userPolicy = UserPolicy.getInstance();

export default UserPolicy;

