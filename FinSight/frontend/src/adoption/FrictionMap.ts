/**
 * FrictionMap - Friction Heatmap
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * PURPOSE:
 * Aggregate friction points that prevent user adoption.
 * Identify explanations that failed to convince.
 * 
 * AGGREGATES:
 * - Top rejection reasons
 * - Avg regret per reason
 * - Explanations that failed
 * 
 * EXPOSES:
 * - getFrictionInsights()
 */

import { 
  getDecisionAdoption, 
  AdoptionRecord, 
  RejectionReason,
  AdoptionStats 
} from './DecisionAdoption';
import { getConvictionGap, ConvictionAnalysis } from './ConvictionGap';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * FrictionPoint - A specific point of friction
 */
export interface FrictionPoint {
  reason: RejectionReason;
  count: number;
  percentage_of_rejections: number;
  
  // Financial impact
  total_regret: number;
  avg_regret: number;
  max_regret: number;
  
  // Confidence analysis
  avg_system_confidence_at_rejection: number;
  avg_conviction_gap: number;
  
  // Examples
  example_symbols: string[];
  
  // Severity
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Suggested remediation
  remediation: string;
}

/**
 * FailedExplanation - An explanation that didn't convince
 */
export interface FailedExplanation {
  record_id: string;
  symbol: string;
  action_recommended: string;
  confidence: number;
  
  // Failure details
  rejection_reason: RejectionReason | null;
  time_to_rejection_seconds: number;
  
  // What was said
  explanation_points: string[];
  
  // Outcome
  value_at_rejection: number;
  value_lost: number;
  
  // Analysis
  failure_category: 'CLARITY' | 'TRUST' | 'TIMING' | 'ALIGNMENT' | 'UNKNOWN';
}

/**
 * FrictionHeatmap - Full friction analysis
 */
export interface FrictionHeatmap {
  generated_at: string;
  
  // Summary
  total_rejections: number;
  total_ignores: number;
  total_friction_events: number;
  
  // Friction points ranked by severity
  friction_points: FrictionPoint[];
  
  // Top 3 issues
  top_issues: {
    reason: RejectionReason;
    count: number;
    impact: number;
  }[];
  
  // Failed explanations
  failed_explanations: FailedExplanation[];
  
  // Heatmap data (reason x confidence bucket)
  heatmap_matrix: {
    reason: RejectionReason;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
  }[];
  
  // Insights
  friction_insights: FrictionInsight[];
}

/**
 * FrictionInsight - Actionable insight
 */
export interface FrictionInsight {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'EXPLANATION' | 'TIMING' | 'TRUST' | 'UX' | 'POLICY';
  insight: string;
  data_support: string;
  recommended_action: string;
  estimated_impact: string;
}

// =============================================================================
// FRICTION MAP ENGINE
// =============================================================================

export class FrictionMapEngine {
  private static instance: FrictionMapEngine;
  private adoption = getDecisionAdoption();
  private convictionGap = getConvictionGap();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): FrictionMapEngine {
    if (!FrictionMapEngine.instance) {
      FrictionMapEngine.instance = new FrictionMapEngine();
    }
    return FrictionMapEngine.instance;
  }
  
  // ===========================================================================
  // FRICTION ANALYSIS
  // ===========================================================================
  
  /**
   * Get friction heatmap
   */
  public getFrictionHeatmap(): FrictionHeatmap {
    const stats = this.adoption.getStats();
    const rejectedRecords = [...this.adoption.getRecordsByAction('REJECT')];
    const ignoredRecords = [...this.adoption.getRecordsByAction('IGNORE')];
    const allFrictionRecords = [...rejectedRecords, ...ignoredRecords];
    
    if (allFrictionRecords.length === 0) {
      return this.createEmptyHeatmap();
    }
    
    // Analyze friction points
    const frictionPoints = this.analyzeFrictionPoints(allFrictionRecords, stats);
    
    // Identify failed explanations
    const failedExplanations = this.identifyFailedExplanations(rejectedRecords);
    
    // Build heatmap matrix
    const heatmapMatrix = this.buildHeatmapMatrix(allFrictionRecords);
    
    // Generate insights
    const insights = this.generateFrictionInsights(frictionPoints, failedExplanations, stats);
    
    // Top issues
    const topIssues = frictionPoints
      .slice(0, 3)
      .map(fp => ({
        reason: fp.reason,
        count: fp.count,
        impact: fp.total_regret
      }));
    
    // Log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Friction heatmap generated: ${allFrictionRecords.length} friction events`,
      details: {
        rejections: rejectedRecords.length,
        ignores: ignoredRecords.length,
        top_reason: topIssues[0]?.reason
      },
      actor: 'ENGINE'
    });
    
    return {
      generated_at: new Date().toISOString(),
      total_rejections: rejectedRecords.length,
      total_ignores: ignoredRecords.length,
      total_friction_events: allFrictionRecords.length,
      friction_points: frictionPoints,
      top_issues: topIssues,
      failed_explanations: failedExplanations.slice(0, 10),
      heatmap_matrix: heatmapMatrix,
      friction_insights: insights
    };
  }
  
  /**
   * Analyze friction points by rejection reason
   */
  private analyzeFrictionPoints(
    records: AdoptionRecord[],
    stats: AdoptionStats
  ): FrictionPoint[] {
    const byReason = new Map<RejectionReason, AdoptionRecord[]>();
    
    // Group by reason
    for (const record of records) {
      const reason = record.rejection_reason || 'PASSIVE_IGNORE';
      if (!byReason.has(reason)) {
        byReason.set(reason, []);
      }
      byReason.get(reason)!.push(record);
    }
    
    const frictionPoints: FrictionPoint[] = [];
    const totalRejections = records.filter(r => r.rejection_reason).length;
    
    for (const [reason, reasonRecords] of byReason) {
      const count = reasonRecords.length;
      const regrets = reasonRecords.map(r => r.value_lost_due_to_inaction || 0);
      const totalRegret = regrets.reduce((sum, r) => sum + r, 0);
      const avgRegret = count > 0 ? totalRegret / count : 0;
      const maxRegret = Math.max(...regrets, 0);
      
      // Conviction analysis
      const analyses = reasonRecords.map(r => this.convictionGap.analyzeRecord(r));
      const avgSystemConf = analyses.length > 0 
        ? analyses.reduce((sum, a) => sum + a.system_confidence, 0) / analyses.length 
        : 0;
      const avgGap = analyses.length > 0 
        ? analyses.reduce((sum, a) => sum + a.conviction_gap, 0) / analyses.length 
        : 0;
      
      // Severity
      const severity = this.calculateSeverity(count, avgRegret, avgGap);
      
      // Example symbols
      const exampleSymbols = [...new Set(reasonRecords.map(r => r.system_recommendation.symbol))]
        .slice(0, 5);
      
      frictionPoints.push({
        reason,
        count,
        percentage_of_rejections: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
        total_regret: totalRegret,
        avg_regret: avgRegret,
        max_regret: maxRegret,
        avg_system_confidence_at_rejection: avgSystemConf,
        avg_conviction_gap: avgGap,
        example_symbols: exampleSymbols,
        severity,
        remediation: this.getRemediation(reason)
      });
    }
    
    // Sort by severity and count
    return frictionPoints.sort((a, b) => {
      const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    });
  }
  
  /**
   * Calculate severity of a friction point
   */
  private calculateSeverity(count: number, avgRegret: number, avgGap: number): FrictionPoint['severity'] {
    let score = 0;
    
    // Count factor
    if (count >= 10) score += 3;
    else if (count >= 5) score += 2;
    else if (count >= 2) score += 1;
    
    // Regret factor
    if (avgRegret >= 50000) score += 3;
    else if (avgRegret >= 20000) score += 2;
    else if (avgRegret >= 5000) score += 1;
    
    // Gap factor
    if (avgGap >= 50) score += 2;
    else if (avgGap >= 25) score += 1;
    
    if (score >= 7) return 'CRITICAL';
    if (score >= 5) return 'HIGH';
    if (score >= 3) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Get remediation for rejection reason
   */
  private getRemediation(reason: RejectionReason): string {
    switch (reason) {
      case 'TOO_COMPLEX':
        return 'Simplify to 3 bullet points. Use plain language. Avoid jargon.';
      case 'TAX_FEAR':
        return 'Show LTCG eligibility date. Display after-tax returns. Explain tax harvesting.';
      case 'TIMING_DOUBT':
        return 'Show entry compared to 52-week range. Provide regime context.';
      case 'CONVICTION_TOO_LOW':
        return 'Display backtested accuracy. Show similar past signals.';
      case 'POLICY_CONFLICT':
        return 'Highlight which policy rule is triggered. Offer policy adjustment.';
      case 'PASSIVE_IGNORE':
        return 'Send ONE reminder with deadline. Show opportunity cost preview.';
      case 'MARKET_CONDITION':
        return 'Explain why current conditions support the recommendation.';
      case 'LIQUIDITY_CONCERN':
        return 'Offer smaller position size option. Show liquidity data.';
      case 'EXTERNAL_ADVICE':
        return 'Provide data comparison. Do not compete - acknowledge other views.';
      case 'NOT_SPECIFIED':
        return 'Request specific feedback. Implement friction survey.';
      default:
        return 'Gather more feedback data.';
    }
  }
  
  /**
   * Identify failed explanations
   */
  private identifyFailedExplanations(records: AdoptionRecord[]): FailedExplanation[] {
    return records.map(record => {
      const failureCategory = this.categorizeFailure(record);
      
      return {
        record_id: record.id,
        symbol: record.system_recommendation.symbol,
        action_recommended: record.system_recommendation.action,
        confidence: record.system_recommendation.confidence,
        rejection_reason: record.rejection_reason,
        time_to_rejection_seconds: record.time_to_action_seconds,
        explanation_points: record.system_recommendation.reasoning,
        value_at_rejection: record.value_at_decision,
        value_lost: record.value_lost_due_to_inaction || 0,
        failure_category: failureCategory
      };
    }).sort((a, b) => b.value_lost - a.value_lost);
  }
  
  /**
   * Categorize failure type
   */
  private categorizeFailure(record: AdoptionRecord): FailedExplanation['failure_category'] {
    switch (record.rejection_reason) {
      case 'TOO_COMPLEX':
        return 'CLARITY';
      case 'CONVICTION_TOO_LOW':
      case 'TAX_FEAR':
        return 'TRUST';
      case 'TIMING_DOUBT':
      case 'MARKET_CONDITION':
        return 'TIMING';
      case 'POLICY_CONFLICT':
      case 'LIQUIDITY_CONCERN':
        return 'ALIGNMENT';
      default:
        return 'UNKNOWN';
    }
  }
  
  /**
   * Build heatmap matrix (reason x confidence)
   */
  private buildHeatmapMatrix(
    records: AdoptionRecord[]
  ): FrictionHeatmap['heatmap_matrix'] {
    const reasons: RejectionReason[] = [
      'TOO_COMPLEX', 'TAX_FEAR', 'TIMING_DOUBT', 'CONVICTION_TOO_LOW',
      'POLICY_CONFLICT', 'PASSIVE_IGNORE', 'MARKET_CONDITION',
      'LIQUIDITY_CONCERN', 'EXTERNAL_ADVICE', 'NOT_SPECIFIED'
    ];
    
    return reasons.map(reason => {
      const reasonRecords = records.filter(r => r.rejection_reason === reason);
      
      return {
        reason,
        high_confidence: reasonRecords.filter(r => r.system_recommendation.confidence >= 75).length,
        medium_confidence: reasonRecords.filter(r => 
          r.system_recommendation.confidence >= 50 && r.system_recommendation.confidence < 75
        ).length,
        low_confidence: reasonRecords.filter(r => r.system_recommendation.confidence < 50).length
      };
    }).filter(row => row.high_confidence + row.medium_confidence + row.low_confidence > 0);
  }
  
  /**
   * Generate friction insights
   */
  private generateFrictionInsights(
    frictionPoints: FrictionPoint[],
    failedExplanations: FailedExplanation[],
    stats: AdoptionStats
  ): FrictionInsight[] {
    const insights: FrictionInsight[] = [];
    
    // Top friction point insight
    if (frictionPoints.length > 0) {
      const top = frictionPoints[0];
      insights.push({
        priority: top.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        category: this.getCategoryForReason(top.reason),
        insight: `"${top.reason}" is the #1 friction point with ${top.count} occurrences`,
        data_support: `Avg regret: ₹${top.avg_regret.toLocaleString()}, ${top.percentage_of_rejections.toFixed(0)}% of rejections`,
        recommended_action: top.remediation,
        estimated_impact: `Addressing could recover ₹${top.total_regret.toLocaleString()}`
      });
    }
    
    // High confidence rejections (most concerning)
    const highConfRejections = failedExplanations.filter(fe => fe.confidence >= 75);
    if (highConfRejections.length >= 3) {
      insights.push({
        priority: 'HIGH',
        category: 'TRUST',
        insight: `${highConfRejections.length} high-confidence recommendations were rejected`,
        data_support: `These had confidence ≥75% but user didn't act`,
        recommended_action: 'Review explanation quality for high-confidence signals',
        estimated_impact: `Value at risk: ₹${highConfRejections.reduce((sum, fe) => sum + fe.value_lost, 0).toLocaleString()}`
      });
    }
    
    // Passive ignore pattern
    const passiveCount = stats.rejection_breakdown['PASSIVE_IGNORE'] || 0;
    if (passiveCount >= 5 || stats.ignore_rate > 0.3) {
      insights.push({
        priority: 'HIGH',
        category: 'UX',
        insight: `${passiveCount} decisions were passively ignored`,
        data_support: `Ignore rate: ${(stats.ignore_rate * 100).toFixed(0)}%`,
        recommended_action: 'Implement gentle reminder system with single notification',
        estimated_impact: `Passive loss cost: ₹${stats.passive_loss_cost.toLocaleString()}`
      });
    }
    
    // Tax fear pattern
    const taxFear = stats.rejection_breakdown['TAX_FEAR'] || 0;
    if (taxFear >= 3) {
      insights.push({
        priority: 'MEDIUM',
        category: 'EXPLANATION',
        insight: `Tax fear caused ${taxFear} rejections`,
        data_support: 'Users concerned about tax implications',
        recommended_action: 'Always show after-tax returns and LTCG eligibility upfront',
        estimated_impact: 'Could improve adoption by showing favorable tax outcomes'
      });
    }
    
    return insights.slice(0, 5); // Top 5 insights
  }
  
  /**
   * Get category for rejection reason
   */
  private getCategoryForReason(reason: RejectionReason): FrictionInsight['category'] {
    switch (reason) {
      case 'TOO_COMPLEX':
        return 'EXPLANATION';
      case 'TAX_FEAR':
      case 'CONVICTION_TOO_LOW':
        return 'TRUST';
      case 'TIMING_DOUBT':
      case 'MARKET_CONDITION':
        return 'TIMING';
      case 'POLICY_CONFLICT':
      case 'LIQUIDITY_CONCERN':
        return 'POLICY';
      default:
        return 'UX';
    }
  }
  
  private createEmptyHeatmap(): FrictionHeatmap {
    return {
      generated_at: new Date().toISOString(),
      total_rejections: 0,
      total_ignores: 0,
      total_friction_events: 0,
      friction_points: [],
      top_issues: [],
      failed_explanations: [],
      heatmap_matrix: [],
      friction_insights: []
    };
  }
  
  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  
  /**
   * Get friction insights (main API)
   */
  public getFrictionInsights(): FrictionInsight[] {
    return this.getFrictionHeatmap().friction_insights;
  }
  
  /**
   * Get top friction reasons
   */
  public getTopFrictionReasons(limit: number = 5): FrictionPoint[] {
    return this.getFrictionHeatmap().friction_points.slice(0, limit);
  }
  
  /**
   * Get friction for a specific reason
   */
  public getFrictionForReason(reason: RejectionReason): FrictionPoint | null {
    return this.getFrictionHeatmap().friction_points.find(fp => fp.reason === reason) || null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFrictionMap = () => FrictionMapEngine.getInstance();
export default FrictionMapEngine;

