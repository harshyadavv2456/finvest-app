/**
 * PortfolioIntel - Portfolio Intelligence Layer
 * 
 * GOAL:
 * Portfolio view must feel smarter than screener.
 * 
 * Capabilities:
 * - Position overlap risk
 * - Sector concentration
 * - Correlation risk (approx)
 * - Tax drag score
 * - Signal conflict detection
 */

import { DecisionContext } from '../core/DecisionContext';
import { EnrichedHolding } from '../integrations/portfolio';
// Note: FinSightSignal types are used via DecisionContext

// Portfolio health levels
export type PortfolioHealth = 
  | 'HEALTHY'         // Well diversified, no issues
  | 'MODERATE_RISK'   // Some concentration, minor issues
  | 'ELEVATED_RISK'   // Multiple issues need attention
  | 'HIGH_RISK'       // Critical issues, action required
  | 'UNKNOWN';        // Insufficient data

// Issue severity
export type IssueSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

// Issue types
export type IssueType = 
  | 'SECTOR_CONCENTRATION'
  | 'POSITION_OVERLAP'
  | 'CORRELATION_RISK'
  | 'TAX_DRAG'
  | 'SIGNAL_CONFLICT'
  | 'HOLDING_PERIOD'
  | 'POSITION_SIZE'
  | 'LIQUIDITY_RISK';

/**
 * Portfolio issue
 */
export interface PortfolioIssue {
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  affected_holdings: string[];
  metric_value?: number;
  threshold?: number;
  recommended_action?: string;
}

/**
 * Sector allocation
 */
export interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  holdings_count: number;
  holdings: string[];
}

/**
 * Tax drag analysis
 */
export interface TaxDragAnalysis {
  total_unrealized_gains: number;
  total_stcg_exposure: number;
  total_ltcg_exposure: number;
  estimated_tax_liability: number;
  tax_drag_percent: number;  // Tax as % of portfolio
  optimization_potential: number;
}

/**
 * Signal conflict
 */
export interface SignalConflict {
  symbol: string;
  current_action: 'HOLD';
  signal_intent: 'AVOID' | 'INITIATE';
  conviction: number;
  unrealized_pnl: number;
  recommendation: string;
}

/**
 * Recommended action
 */
export interface RecommendedAction {
  priority: number;      // 1 = highest
  action: string;
  reason: string;
  impact: string;
  symbols?: string[];
}

/**
 * Portfolio Intelligence Output
 */
export interface PortfolioIntelligence {
  // Metadata
  analysis_id: string;
  analyzed_at: string;
  context_id: string;
  
  // Overall assessment
  portfolio_health: PortfolioHealth;
  health_score: number;  // 0-100
  
  // Issues detected
  issues: PortfolioIssue[];
  issues_by_severity: {
    critical: number;
    warning: number;
    info: number;
  };
  
  // Detailed analysis
  sector_allocation: SectorAllocation[];
  tax_drag: TaxDragAnalysis;
  signal_conflicts: SignalConflict[];
  
  // Recommendations
  recommended_actions: RecommendedAction[];
  
  // Summary
  summary: string;
}

// Sector mapping for Indian stocks
const SECTOR_MAP: Record<string, string> = {
  // IT
  'INFY': 'IT', 'TCS': 'IT', 'WIPRO': 'IT', 'HCLTECH': 'IT', 'TECHM': 'IT', 'LTI': 'IT', 'LTIM': 'IT',
  // Banking
  'HDFCBANK': 'Banking', 'ICICIBANK': 'Banking', 'SBIN': 'Banking', 'AXISBANK': 'Banking', 'KOTAKBANK': 'Banking', 'INDUSINDBK': 'Banking',
  // Auto
  'MARUTI': 'Auto', 'TATAMOTORS': 'Auto', 'M&M': 'Auto', 'BAJAJ-AUTO': 'Auto', 'HEROMOTOCO': 'Auto', 'EICHERMOT': 'Auto',
  // Pharma
  'SUNPHARMA': 'Pharma', 'DRREDDY': 'Pharma', 'CIPLA': 'Pharma', 'DIVISLAB': 'Pharma', 'APOLLOHOSP': 'Pharma',
  // FMCG
  'HINDUNILVR': 'FMCG', 'ITC': 'FMCG', 'NESTLEIND': 'FMCG', 'BRITANNIA': 'FMCG', 'DABUR': 'FMCG',
  // Energy
  'RELIANCE': 'Energy', 'ONGC': 'Energy', 'BPCL': 'Energy', 'IOC': 'Energy', 'POWERGRID': 'Energy', 'NTPC': 'Energy',
  // Metals
  'TATASTEEL': 'Metals', 'HINDALCO': 'Metals', 'JSWSTEEL': 'Metals', 'COALINDIA': 'Metals',
  // Finance
  'BAJFINANCE': 'Finance', 'BAJAJFINSV': 'Finance', 'HDFC': 'Finance', 'SBILIFE': 'Finance', 'HDFCLIFE': 'Finance',
  // Telecom
  'BHARTIARTL': 'Telecom', 'JIO': 'Telecom',
  // Infra
  'LT': 'Infra', 'ADANIENT': 'Infra', 'ADANIPORTS': 'Infra', 'ULTRACEMCO': 'Infra', 'GRASIM': 'Infra',
  // Consumer
  'TITAN': 'Consumer', 'ASIANPAINT': 'Consumer', 'PIDILITIND': 'Consumer',
};

// Thresholds for issue detection
const THRESHOLDS = {
  SECTOR_CONCENTRATION: 30,   // % allocation to single sector
  POSITION_SIZE: 15,          // % allocation to single stock
  STCG_EXPOSURE: 20,          // % of gains subject to STCG
  SIGNAL_CONFLICT_CONVICTION: 0.6
} as const;

/**
 * PortfolioIntel
 * 
 * Analyzes portfolio for risks, concentration, and optimization opportunities.
 */
export class PortfolioIntel {
  private static instance: PortfolioIntel;

  private constructor() {}

  static getInstance(): PortfolioIntel {
    if (!PortfolioIntel.instance) {
      PortfolioIntel.instance = new PortfolioIntel();
    }
    return PortfolioIntel.instance;
  }

  /**
   * Analyze portfolio
   */
  analyze(context: DecisionContext): PortfolioIntelligence {
    const now = new Date();
    const issues: PortfolioIssue[] = [];
    const holdings = context.enriched_holdings;
    const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);

    // Sector allocation analysis
    const sectorAllocation = this.analyzeSectorAllocation(holdings, totalValue);
    const sectorIssues = this.detectSectorConcentration(sectorAllocation);
    issues.push(...sectorIssues);

    // Position size analysis
    const positionIssues = this.detectPositionSizeRisk(holdings, totalValue);
    issues.push(...positionIssues);

    // Tax drag analysis
    const taxDrag = this.analyzeTaxDrag(holdings, totalValue, context);
    const taxIssues = this.detectTaxIssues(taxDrag, holdings);
    issues.push(...taxIssues);

    // Signal conflict detection
    const signalConflicts = this.detectSignalConflicts(holdings, context);
    const conflictIssues = this.signalConflictsToIssues(signalConflicts);
    issues.push(...conflictIssues);

    // Holding period issues
    const holdingIssues = this.detectHoldingPeriodIssues(holdings);
    issues.push(...holdingIssues);

    // Calculate health score
    const { health, score } = this.calculatePortfolioHealth(issues);

    // Generate recommendations
    const recommendedActions = this.generateRecommendations(issues, signalConflicts, taxDrag);

    // Count issues by severity
    const issuesBySeverity = {
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      warning: issues.filter(i => i.severity === 'WARNING').length,
      info: issues.filter(i => i.severity === 'INFO').length
    };

    // Generate summary
    const summary = this.generateSummary(health, issues, taxDrag, signalConflicts);

    return {
      analysis_id: `INTEL-${now.getTime()}`,
      analyzed_at: now.toISOString(),
      context_id: context.id,
      portfolio_health: health,
      health_score: score,
      issues,
      issues_by_severity: issuesBySeverity,
      sector_allocation: sectorAllocation,
      tax_drag: taxDrag,
      signal_conflicts: signalConflicts,
      recommended_actions: recommendedActions,
      summary
    };
  }

  /**
   * Analyze sector allocation
   */
  private analyzeSectorAllocation(holdings: EnrichedHolding[], totalValue: number): SectorAllocation[] {
    const sectorMap = new Map<string, { value: number; holdings: string[] }>();

    for (const holding of holdings) {
      const sector = SECTOR_MAP[holding.symbol] || 'Other';
      const existing = sectorMap.get(sector) || { value: 0, holdings: [] };
      existing.value += holding.current_value;
      existing.holdings.push(holding.symbol);
      sectorMap.set(sector, existing);
    }

    return Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        holdings_count: data.holdings.length,
        holdings: data.holdings
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Detect sector concentration issues
   */
  private detectSectorConcentration(allocation: SectorAllocation[]): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];

    for (const sector of allocation) {
      if (sector.percentage > THRESHOLDS.SECTOR_CONCENTRATION) {
        issues.push({
          type: 'SECTOR_CONCENTRATION',
          severity: sector.percentage > 50 ? 'CRITICAL' : 'WARNING',
          title: `High ${sector.sector} sector exposure`,
          description: `${sector.percentage.toFixed(1)}% of portfolio is in ${sector.sector} sector. Consider diversifying to reduce sector-specific risk.`,
          affected_holdings: sector.holdings,
          metric_value: sector.percentage,
          threshold: THRESHOLDS.SECTOR_CONCENTRATION,
          recommended_action: `Reduce ${sector.sector} exposure below ${THRESHOLDS.SECTOR_CONCENTRATION}%`
        });
      }
    }

    return issues;
  }

  /**
   * Detect position size risks
   */
  private detectPositionSizeRisk(holdings: EnrichedHolding[], totalValue: number): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];

    for (const holding of holdings) {
      const percentage = totalValue > 0 ? (holding.current_value / totalValue) * 100 : 0;
      
      if (percentage > THRESHOLDS.POSITION_SIZE) {
        issues.push({
          type: 'POSITION_SIZE',
          severity: percentage > 25 ? 'CRITICAL' : 'WARNING',
          title: `Large position in ${holding.symbol}`,
          description: `${holding.symbol} represents ${percentage.toFixed(1)}% of portfolio. Consider trimming to reduce concentration risk.`,
          affected_holdings: [holding.symbol],
          metric_value: percentage,
          threshold: THRESHOLDS.POSITION_SIZE,
          recommended_action: `Reduce ${holding.symbol} position to below ${THRESHOLDS.POSITION_SIZE}%`
        });
      }
    }

    return issues;
  }

  /**
   * Analyze tax drag
   */
  private analyzeTaxDrag(
    holdings: EnrichedHolding[], 
    totalValue: number, 
    context: DecisionContext
  ): TaxDragAnalysis {
    let totalGains = 0;
    let stcgExposure = 0;
    let ltcgExposure = 0;
    let estimatedTax = 0;
    let optimizationPotential = 0;

    for (const holding of holdings) {
      if (holding.unrealized_pnl > 0) {
        totalGains += holding.unrealized_pnl;
        
        if (holding.is_ltcg_eligible) {
          ltcgExposure += holding.unrealized_pnl;
          estimatedTax += Math.max(0, holding.unrealized_pnl - 100000) * 0.10;
        } else {
          stcgExposure += holding.unrealized_pnl;
          estimatedTax += holding.unrealized_pnl * 0.15;
          
          // Optimization potential: tax saved by waiting for LTCG
          const taxAnalysis = context.tax_analyses.get(holding.symbol);
          if (taxAnalysis) {
            optimizationPotential += taxAnalysis.potential_savings;
          }
        }
      }
    }

    return {
      total_unrealized_gains: totalGains,
      total_stcg_exposure: stcgExposure,
      total_ltcg_exposure: ltcgExposure,
      estimated_tax_liability: estimatedTax,
      tax_drag_percent: totalValue > 0 ? (estimatedTax / totalValue) * 100 : 0,
      optimization_potential: optimizationPotential
    };
  }

  /**
   * Detect tax-related issues
   */
  private detectTaxIssues(taxDrag: TaxDragAnalysis, holdings: EnrichedHolding[]): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];
    const totalGains = taxDrag.total_unrealized_gains;

    if (totalGains > 0 && taxDrag.total_stcg_exposure > 0) {
      const stcgPercent = (taxDrag.total_stcg_exposure / totalGains) * 100;
      
      if (stcgPercent > THRESHOLDS.STCG_EXPOSURE) {
        const affectedHoldings = holdings
          .filter(h => h.unrealized_pnl > 0 && !h.is_ltcg_eligible)
          .map(h => h.symbol);

        issues.push({
          type: 'TAX_DRAG',
          severity: stcgPercent > 50 ? 'WARNING' : 'INFO',
          title: 'Significant STCG exposure',
          description: `₹${taxDrag.total_stcg_exposure.toLocaleString()} in gains are subject to 15% STCG. Waiting for LTCG can save ₹${taxDrag.optimization_potential.toLocaleString()}.`,
          affected_holdings: affectedHoldings,
          metric_value: stcgPercent,
          threshold: THRESHOLDS.STCG_EXPOSURE,
          recommended_action: 'Consider holding STCG positions for LTCG eligibility before selling'
        });
      }
    }

    return issues;
  }

  /**
   * Detect signal conflicts
   */
  private detectSignalConflicts(
    holdings: EnrichedHolding[], 
    context: DecisionContext
  ): SignalConflict[] {
    const conflicts: SignalConflict[] = [];

    for (const holding of holdings) {
      const signal = context.finsight_signals.get(holding.symbol);
      
      if (signal && signal.intent === 'AVOID' && signal.conviction > THRESHOLDS.SIGNAL_CONFLICT_CONVICTION) {
        conflicts.push({
          symbol: holding.symbol,
          current_action: 'HOLD',
          signal_intent: 'AVOID',
          conviction: signal.conviction,
          unrealized_pnl: holding.unrealized_pnl,
          recommendation: holding.unrealized_pnl < 0 
            ? 'Consider harvesting loss and exiting position'
            : holding.is_ltcg_eligible 
              ? 'Signal suggests exit. LTCG eligible - consider exiting.'
              : `Signal suggests exit. ${holding.days_to_ltcg} days to LTCG - weigh tax vs signal.`
        });
      }
    }

    return conflicts;
  }

  /**
   * Convert signal conflicts to issues
   */
  private signalConflictsToIssues(conflicts: SignalConflict[]): PortfolioIssue[] {
    return conflicts.map(conflict => ({
      type: 'SIGNAL_CONFLICT' as IssueType,
      severity: conflict.conviction > 0.8 ? 'CRITICAL' : 'WARNING' as IssueSeverity,
      title: `${conflict.symbol} flagged AVOID but still held`,
      description: `FinSight rates ${conflict.symbol} as AVOID with ${(conflict.conviction * 100).toFixed(0)}% conviction, but position is still held.`,
      affected_holdings: [conflict.symbol],
      metric_value: conflict.conviction * 100,
      threshold: THRESHOLDS.SIGNAL_CONFLICT_CONVICTION * 100,
      recommended_action: conflict.recommendation
    }));
  }

  /**
   * Detect holding period issues
   */
  private detectHoldingPeriodIssues(holdings: EnrichedHolding[]): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];
    const nearLtcg = holdings.filter(h => 
      !h.is_ltcg_eligible && 
      h.days_to_ltcg <= 30 && 
      h.unrealized_pnl > 0
    );

    if (nearLtcg.length > 0) {
      issues.push({
        type: 'HOLDING_PERIOD',
        severity: 'INFO',
        title: `${nearLtcg.length} holding(s) near LTCG eligibility`,
        description: `${nearLtcg.map(h => h.symbol).join(', ')} will qualify for LTCG within 30 days. Consider holding.`,
        affected_holdings: nearLtcg.map(h => h.symbol),
        recommended_action: 'Wait for LTCG eligibility before selling to reduce tax'
      });
    }

    return issues;
  }

  /**
   * Calculate portfolio health
   */
  private calculatePortfolioHealth(issues: PortfolioIssue[]): { health: PortfolioHealth; score: number } {
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;
    const infoCount = issues.filter(i => i.severity === 'INFO').length;

    // Score calculation
    let score = 100;
    score -= criticalCount * 20;
    score -= warningCount * 10;
    score -= infoCount * 2;
    score = Math.max(0, Math.min(100, score));

    // Health classification
    let health: PortfolioHealth;
    if (criticalCount >= 2) {
      health = 'HIGH_RISK';
    } else if (criticalCount >= 1 || warningCount >= 3) {
      health = 'ELEVATED_RISK';
    } else if (warningCount >= 1) {
      health = 'MODERATE_RISK';
    } else {
      health = 'HEALTHY';
    }

    return { health, score };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    issues: PortfolioIssue[], 
    conflicts: SignalConflict[],
    taxDrag: TaxDragAnalysis
  ): RecommendedAction[] {
    const actions: RecommendedAction[] = [];
    let priority = 1;

    // Critical issues first
    for (const issue of issues.filter(i => i.severity === 'CRITICAL')) {
      actions.push({
        priority: priority++,
        action: issue.recommended_action || 'Review and take action',
        reason: issue.description,
        impact: 'High - reduces portfolio risk',
        symbols: issue.affected_holdings
      });
    }

    // Signal conflicts
    for (const conflict of conflicts.filter(c => c.conviction > 0.8)) {
      actions.push({
        priority: priority++,
        action: `Exit ${conflict.symbol}`,
        reason: `Strong AVOID signal (${(conflict.conviction * 100).toFixed(0)}% conviction)`,
        impact: conflict.unrealized_pnl > 0 
          ? `Realize gain of ₹${conflict.unrealized_pnl.toLocaleString()}`
          : `Harvest loss of ₹${Math.abs(conflict.unrealized_pnl).toLocaleString()}`,
        symbols: [conflict.symbol]
      });
    }

    // Tax optimization
    if (taxDrag.optimization_potential > 10000) {
      actions.push({
        priority: priority++,
        action: 'Wait for LTCG eligibility on STCG positions',
        reason: `Potential tax savings of ₹${taxDrag.optimization_potential.toLocaleString()}`,
        impact: 'Medium - improves after-tax returns'
      });
    }

    return actions.slice(0, 5); // Top 5 actions
  }

  /**
   * Generate summary
   */
  private generateSummary(
    health: PortfolioHealth,
    issues: PortfolioIssue[],
    taxDrag: TaxDragAnalysis,
    conflicts: SignalConflict[]
  ): string {
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;

    let summary = '';

    if (health === 'HEALTHY') {
      summary = 'Portfolio is well-diversified with no critical issues.';
    } else if (health === 'MODERATE_RISK') {
      summary = `Portfolio has ${warningCount} warning(s) requiring attention.`;
    } else if (health === 'ELEVATED_RISK') {
      summary = `Portfolio has ${criticalCount} critical and ${warningCount} warning issue(s). Review recommended.`;
    } else {
      summary = `Portfolio has ${criticalCount} critical issue(s) requiring immediate attention.`;
    }

    if (conflicts.length > 0) {
      summary += ` ${conflicts.length} holding(s) flagged AVOID but still held.`;
    }

    if (taxDrag.optimization_potential > 10000) {
      summary += ` Potential tax savings of ₹${taxDrag.optimization_potential.toLocaleString()} available.`;
    }

    return summary;
  }
}

// Export singleton
export const portfolioIntel = PortfolioIntel.getInstance();

export default PortfolioIntel;

