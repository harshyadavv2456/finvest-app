/**
 * ConvictionGap - Conviction Gap Analyzer
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * PURPOSE:
 * Analyze the gap between system confidence and user conviction.
 * Identify why users don't act on high-confidence recommendations.
 * 
 * COMPUTES:
 * - system_confidence
 * - user_confidence_proxy (delay, overrides)
 * - conviction_gap_score
 * - value_lost_due_to_inaction
 */

import { 
  getDecisionAdoption, 
  AdoptionRecord, 
  AdoptionStats, 
  RejectionReason,
  UserAction 
} from './DecisionAdoption';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ConvictionAnalysis - Analysis for a single decision
 */
export interface ConvictionAnalysis {
  record_id: string;
  snapshot_id: string;
  symbol: string;
  
  // Confidence
  system_confidence: number;           // 0-100
  user_confidence_proxy: number;       // 0-100, inferred from behavior
  conviction_gap: number;              // system - user (positive = user less confident)
  
  // Behavior signals
  time_to_action_seconds: number;
  hesitation_penalty: number;
  was_reminded: boolean;
  user_action: UserAction;
  rejection_reason: RejectionReason | null;
  
  // Cost
  value_lost_due_to_inaction: number;
  
  // Classification
  gap_severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Recommendations
  suggested_intervention: string | null;
}

/**
 * ConvictionGapReport - Aggregate conviction gap analysis
 */
export interface ConvictionGapReport {
  generated_at: string;
  total_decisions_analyzed: number;
  
  // Overall metrics
  avg_system_confidence: number;
  avg_user_confidence_proxy: number;
  avg_conviction_gap: number;
  
  // Gap distribution
  gap_distribution: {
    none: number;       // gap < 10
    low: number;        // gap 10-25
    medium: number;     // gap 25-50
    high: number;       // gap 50-75
    critical: number;   // gap > 75
  };
  
  // By confidence bucket
  by_system_confidence: {
    high: ConvictionBucketStats;      // 75+
    medium: ConvictionBucketStats;    // 50-74
    low: ConvictionBucketStats;       // <50
  };
  
  // Value analysis
  total_value_lost: number;
  avg_value_lost_per_gap_point: number;
  high_gap_value_lost: number;
  
  // Top gaps (worst offenders)
  worst_gaps: ConvictionAnalysis[];
  
  // Insights
  insights: ConvictionInsight[];
}

/**
 * ConvictionBucketStats - Stats for a confidence bucket
 */
export interface ConvictionBucketStats {
  count: number;
  avg_user_proxy: number;
  avg_gap: number;
  adoption_rate: number;
  value_lost: number;
}

/**
 * ConvictionInsight - Actionable insight
 */
export interface ConvictionInsight {
  type: 'WARNING' | 'INFO' | 'SUGGESTION';
  message: string;
  data_point: string;
  action?: string;
}

// =============================================================================
// CONVICTION GAP ANALYZER
// =============================================================================

export class ConvictionGapAnalyzer {
  private static instance: ConvictionGapAnalyzer;
  private adoption = getDecisionAdoption();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Confidence proxy weights
  private readonly TIME_WEIGHT = 0.3;          // Time to action
  private readonly HESITATION_WEIGHT = 0.25;   // Hesitation penalty
  private readonly ACTION_WEIGHT = 0.45;       // Final action
  
  private constructor() {}
  
  public static getInstance(): ConvictionGapAnalyzer {
    if (!ConvictionGapAnalyzer.instance) {
      ConvictionGapAnalyzer.instance = new ConvictionGapAnalyzer();
    }
    return ConvictionGapAnalyzer.instance;
  }
  
  // ===========================================================================
  // ANALYSIS
  // ===========================================================================
  
  /**
   * Analyze conviction gap for a single record
   */
  public analyzeRecord(record: AdoptionRecord): ConvictionAnalysis {
    const systemConfidence = record.system_recommendation.confidence;
    const userConfidenceProxy = this.computeUserConfidenceProxy(record);
    const convictionGap = systemConfidence - userConfidenceProxy;
    const gapSeverity = this.classifyGapSeverity(convictionGap);
    
    const analysis: ConvictionAnalysis = {
      record_id: record.id,
      snapshot_id: record.snapshot_id,
      symbol: record.system_recommendation.symbol,
      system_confidence: systemConfidence,
      user_confidence_proxy: userConfidenceProxy,
      conviction_gap: convictionGap,
      time_to_action_seconds: record.time_to_action_seconds,
      hesitation_penalty: record.hesitation_penalty,
      was_reminded: record.was_reminded,
      user_action: record.user_action,
      rejection_reason: record.rejection_reason,
      value_lost_due_to_inaction: record.value_lost_due_to_inaction || 0,
      gap_severity: gapSeverity,
      suggested_intervention: this.suggestIntervention(record, gapSeverity)
    };
    
    return analysis;
  }
  
  /**
   * Compute user confidence proxy from behavior
   */
  private computeUserConfidenceProxy(record: AdoptionRecord): number {
    let proxy = 0;
    
    // Action component (45%)
    switch (record.user_action) {
      case 'APPROVE':
        proxy += 100 * this.ACTION_WEIGHT;
        break;
      case 'REJECT':
        // Rejection with reason shows some engagement
        if (record.rejection_reason && record.rejection_reason !== 'NOT_SPECIFIED') {
          proxy += 30 * this.ACTION_WEIGHT;
        } else {
          proxy += 10 * this.ACTION_WEIGHT;
        }
        break;
      case 'IGNORE':
        proxy += 0; // No confidence signal
        break;
    }
    
    // Time component (30%) - faster = more confident
    const maxTime = 3600; // 1 hour
    const timeScore = Math.max(0, 100 - (record.time_to_action_seconds / maxTime) * 100);
    proxy += timeScore * this.TIME_WEIGHT;
    
    // Hesitation component (25%) - less hesitation = more confident
    const hesitationScore = 100 - record.hesitation_penalty;
    proxy += hesitationScore * this.HESITATION_WEIGHT;
    
    return Math.round(proxy);
  }
  
  /**
   * Classify gap severity
   */
  private classifyGapSeverity(gap: number): ConvictionAnalysis['gap_severity'] {
    if (gap < 10) return 'NONE';
    if (gap < 25) return 'LOW';
    if (gap < 50) return 'MEDIUM';
    if (gap < 75) return 'HIGH';
    return 'CRITICAL';
  }
  
  /**
   * Suggest intervention based on gap
   */
  private suggestIntervention(
    record: AdoptionRecord,
    severity: ConvictionAnalysis['gap_severity']
  ): string | null {
    if (severity === 'NONE' || severity === 'LOW') {
      return null;
    }
    
    // Base intervention on rejection reason
    switch (record.rejection_reason) {
      case 'TOO_COMPLEX':
        return 'Simplify explanation with key 3 points only';
      case 'TAX_FEAR':
        return 'Show after-tax returns and LTCG eligibility date';
      case 'TIMING_DOUBT':
        return 'Provide historical entry point comparison';
      case 'CONVICTION_TOO_LOW':
        return 'Show backtested win rate for similar signals';
      case 'POLICY_CONFLICT':
        return 'Review and adjust user policy settings';
      case 'PASSIVE_IGNORE':
        return 'Send single, clear reminder with deadline';
      case 'MARKET_CONDITION':
        return 'Explain current regime and why timing is valid';
      case 'LIQUIDITY_CONCERN':
        return 'Suggest smaller position size option';
      default:
        if (severity === 'CRITICAL') {
          return 'High-priority: Direct outreach needed';
        }
        return 'Request specific feedback on hesitation';
    }
  }
  
  // ===========================================================================
  // REPORT
  // ===========================================================================
  
  /**
   * Generate full conviction gap report
   */
  public getReport(): ConvictionGapReport {
    const stats = this.adoption.getStats();
    const allRecords = [
      ...this.adoption.getRecordsByAction('APPROVE'),
      ...this.adoption.getRecordsByAction('REJECT'),
      ...this.adoption.getRecordsByAction('IGNORE')
    ];
    
    if (allRecords.length === 0) {
      return this.createEmptyReport();
    }
    
    // Analyze all records
    const analyses = allRecords.map(r => this.analyzeRecord(r));
    
    // Compute averages
    const avgSystemConf = analyses.reduce((sum, a) => sum + a.system_confidence, 0) / analyses.length;
    const avgUserProxy = analyses.reduce((sum, a) => sum + a.user_confidence_proxy, 0) / analyses.length;
    const avgGap = analyses.reduce((sum, a) => sum + a.conviction_gap, 0) / analyses.length;
    
    // Gap distribution
    const gapDistribution = {
      none: analyses.filter(a => a.gap_severity === 'NONE').length,
      low: analyses.filter(a => a.gap_severity === 'LOW').length,
      medium: analyses.filter(a => a.gap_severity === 'MEDIUM').length,
      high: analyses.filter(a => a.gap_severity === 'HIGH').length,
      critical: analyses.filter(a => a.gap_severity === 'CRITICAL').length
    };
    
    // By confidence bucket
    const highConf = analyses.filter(a => a.system_confidence >= 75);
    const medConf = analyses.filter(a => a.system_confidence >= 50 && a.system_confidence < 75);
    const lowConf = analyses.filter(a => a.system_confidence < 50);
    
    // Value analysis
    const totalValueLost = analyses.reduce((sum, a) => sum + a.value_lost_due_to_inaction, 0);
    const totalGapPoints = analyses.reduce((sum, a) => sum + Math.max(0, a.conviction_gap), 0);
    const avgValuePerGapPoint = totalGapPoints > 0 ? totalValueLost / totalGapPoints : 0;
    
    const highGapAnalyses = analyses.filter(a => a.gap_severity === 'HIGH' || a.gap_severity === 'CRITICAL');
    const highGapValueLost = highGapAnalyses.reduce((sum, a) => sum + a.value_lost_due_to_inaction, 0);
    
    // Worst gaps
    const worstGaps = [...analyses]
      .sort((a, b) => b.conviction_gap - a.conviction_gap)
      .slice(0, 5);
    
    // Generate insights
    const insights = this.generateInsights(analyses, gapDistribution, avgGap);
    
    // Log report generation
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Conviction gap report: ${analyses.length} decisions analyzed`,
      details: {
        total_analyzed: analyses.length,
        avg_gap: avgGap,
        total_value_lost: totalValueLost
      },
      actor: 'ENGINE'
    });
    
    return {
      generated_at: new Date().toISOString(),
      total_decisions_analyzed: analyses.length,
      avg_system_confidence: avgSystemConf,
      avg_user_confidence_proxy: avgUserProxy,
      avg_conviction_gap: avgGap,
      gap_distribution: gapDistribution,
      by_system_confidence: {
        high: this.computeBucketStats(highConf),
        medium: this.computeBucketStats(medConf),
        low: this.computeBucketStats(lowConf)
      },
      total_value_lost: totalValueLost,
      avg_value_lost_per_gap_point: avgValuePerGapPoint,
      high_gap_value_lost: highGapValueLost,
      worst_gaps: worstGaps,
      insights
    };
  }
  
  /**
   * Compute bucket stats
   */
  private computeBucketStats(analyses: ConvictionAnalysis[]): ConvictionBucketStats {
    if (analyses.length === 0) {
      return { count: 0, avg_user_proxy: 0, avg_gap: 0, adoption_rate: 0, value_lost: 0 };
    }
    
    const approved = analyses.filter(a => a.user_action === 'APPROVE').length;
    
    return {
      count: analyses.length,
      avg_user_proxy: analyses.reduce((sum, a) => sum + a.user_confidence_proxy, 0) / analyses.length,
      avg_gap: analyses.reduce((sum, a) => sum + a.conviction_gap, 0) / analyses.length,
      adoption_rate: approved / analyses.length,
      value_lost: analyses.reduce((sum, a) => sum + a.value_lost_due_to_inaction, 0)
    };
  }
  
  /**
   * Generate insights
   */
  private generateInsights(
    analyses: ConvictionAnalysis[],
    gapDistribution: ConvictionGapReport['gap_distribution'],
    avgGap: number
  ): ConvictionInsight[] {
    const insights: ConvictionInsight[] = [];
    
    // High/Critical gap warning
    const criticalCount = gapDistribution.high + gapDistribution.critical;
    if (criticalCount > analyses.length * 0.3) {
      insights.push({
        type: 'WARNING',
        message: `${criticalCount} decisions (${Math.round(criticalCount / analyses.length * 100)}%) have HIGH or CRITICAL conviction gaps`,
        data_point: `Gap distribution: ${gapDistribution.critical} critical, ${gapDistribution.high} high`,
        action: 'Review explanation quality and simplicity'
      });
    }
    
    // Average gap insight
    if (avgGap > 40) {
      insights.push({
        type: 'WARNING',
        message: `Average conviction gap is ${avgGap.toFixed(1)} points - significant trust deficit`,
        data_point: `System avg: ${analyses.reduce((sum, a) => sum + a.system_confidence, 0) / analyses.length}%, User proxy avg: ${analyses.reduce((sum, a) => sum + a.user_confidence_proxy, 0) / analyses.length}%`
      });
    } else if (avgGap < 15) {
      insights.push({
        type: 'INFO',
        message: `Average conviction gap is only ${avgGap.toFixed(1)} points - good alignment`,
        data_point: 'User confidence tracks well with system confidence'
      });
    }
    
    // Rejection reason patterns
    const rejectionCounts = new Map<RejectionReason, number>();
    for (const a of analyses) {
      if (a.rejection_reason) {
        rejectionCounts.set(a.rejection_reason, (rejectionCounts.get(a.rejection_reason) || 0) + 1);
      }
    }
    
    const topRejection = Array.from(rejectionCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (topRejection && topRejection[1] >= 3) {
      insights.push({
        type: 'SUGGESTION',
        message: `Top rejection reason: "${topRejection[0]}" (${topRejection[1]} times)`,
        data_point: `${Math.round(topRejection[1] / analyses.filter(a => a.rejection_reason).length * 100)}% of rejections`,
        action: this.getActionForRejectionReason(topRejection[0])
      });
    }
    
    return insights;
  }
  
  /**
   * Get action for rejection reason
   */
  private getActionForRejectionReason(reason: RejectionReason): string {
    switch (reason) {
      case 'TOO_COMPLEX':
        return 'Simplify recommendation explanations to 3 bullet points';
      case 'TAX_FEAR':
        return 'Always show after-tax returns prominently';
      case 'TIMING_DOUBT':
        return 'Add historical context for entry timing';
      case 'CONVICTION_TOO_LOW':
        return 'Show win rate and backtested accuracy';
      case 'POLICY_CONFLICT':
        return 'Review policy settings with user';
      case 'PASSIVE_IGNORE':
        return 'Implement single-reminder system with deadline';
      default:
        return 'Gather more specific feedback';
    }
  }
  
  private createEmptyReport(): ConvictionGapReport {
    return {
      generated_at: new Date().toISOString(),
      total_decisions_analyzed: 0,
      avg_system_confidence: 0,
      avg_user_confidence_proxy: 0,
      avg_conviction_gap: 0,
      gap_distribution: { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
      by_system_confidence: {
        high: { count: 0, avg_user_proxy: 0, avg_gap: 0, adoption_rate: 0, value_lost: 0 },
        medium: { count: 0, avg_user_proxy: 0, avg_gap: 0, adoption_rate: 0, value_lost: 0 },
        low: { count: 0, avg_user_proxy: 0, avg_gap: 0, adoption_rate: 0, value_lost: 0 }
      },
      total_value_lost: 0,
      avg_value_lost_per_gap_point: 0,
      high_gap_value_lost: 0,
      worst_gaps: [],
      insights: []
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getConvictionGap = () => ConvictionGapAnalyzer.getInstance();
export default ConvictionGapAnalyzer;

