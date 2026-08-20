/**
 * AdoptionScore - Adoption Score Calculator
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * PURPOSE:
 * Compute and expose adoption metrics alongside Trust Score.
 * 
 * COMPUTES:
 * - adoption_rate
 * - delayed_adoption_cost
 * - passive_loss_cost
 * 
 * EXPOSES alongside Trust Score.
 */

import { getDecisionAdoption, AdoptionStats } from './DecisionAdoption';
import { getConvictionGap, ConvictionGapReport } from './ConvictionGap';
import { getFrictionMap, FrictionHeatmap } from './FrictionMap';
import { getTrustLedger, TrustScore } from '../trust/TrustLedger';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * AdoptionScore - Core adoption metrics
 */
export interface AdoptionScore {
  // Core metrics
  adoption_rate: number;              // 0-1
  rejection_rate: number;             // 0-1
  ignore_rate: number;                // 0-1
  
  // Cost metrics
  delayed_adoption_cost: number;      // Cost of acting late
  passive_loss_cost: number;          // Cost of not acting
  total_friction_cost: number;        // Total cost due to friction
  
  // Efficiency metrics
  avg_time_to_action_seconds: number;
  decision_efficiency_score: number;  // 0-100
  
  // Alignment metrics
  avg_conviction_gap: number;
  alignment_score: number;            // 0-100, how well user tracks system
  
  // Combined score
  net_adoption_score: number;         // 0-100
  
  // Grade
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  grade_explanation: string;
  
  // Metadata
  total_decisions: number;
  computed_at: string;
}

/**
 * AdoptionTrustComparison - Side-by-side with Trust Score
 */
export interface AdoptionTrustComparison {
  trust_score: TrustScore;
  adoption_score: AdoptionScore;
  
  // Combined insights
  combined_health_score: number;      // 0-100
  primary_issue: 'TRUST' | 'ADOPTION' | 'BALANCED' | 'NONE';
  action_priority: string;
  
  computed_at: string;
}

/**
 * AdoptionTrend - Trend over time
 */
export interface AdoptionTrend {
  period_days: number;
  adoption_rate_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  cost_trend: 'DECREASING' | 'STABLE' | 'INCREASING';
  gap_trend: 'CLOSING' | 'STABLE' | 'WIDENING';
}

// =============================================================================
// ADOPTION SCORE CALCULATOR
// =============================================================================

export class AdoptionScoreCalculator {
  private static instance: AdoptionScoreCalculator;
  private adoption = getDecisionAdoption();
  private convictionGap = getConvictionGap();
  private frictionMap = getFrictionMap();
  private trustLedger = getTrustLedger();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Cached score
  private cachedScore: AdoptionScore | null = null;
  private lastComputedAt: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  
  private constructor() {}
  
  public static getInstance(): AdoptionScoreCalculator {
    if (!AdoptionScoreCalculator.instance) {
      AdoptionScoreCalculator.instance = new AdoptionScoreCalculator();
    }
    return AdoptionScoreCalculator.instance;
  }
  
  // ===========================================================================
  // SCORE CALCULATION
  // ===========================================================================
  
  /**
   * Get adoption score
   */
  public getAdoptionScore(): AdoptionScore {
    // Check cache
    const now = Date.now();
    if (this.cachedScore && (now - this.lastComputedAt) < this.CACHE_TTL_MS) {
      return this.cachedScore;
    }
    
    const stats = this.adoption.getStats();
    const gapReport = this.convictionGap.getReport();
    const frictionHeatmap = this.frictionMap.getFrictionHeatmap();
    
    // Core rates
    const adoptionRate = stats.adoption_rate;
    const rejectionRate = stats.rejection_rate;
    const ignoreRate = stats.ignore_rate;
    
    // Costs
    const delayedCost = stats.delayed_adoption_cost;
    const passiveCost = stats.passive_loss_cost;
    const totalFrictionCost = stats.total_value_lost_to_inaction;
    
    // Efficiency
    const avgTime = stats.avg_time_to_action_seconds;
    const efficiencyScore = this.calculateEfficiencyScore(avgTime, stats.high_hesitation_count, stats.total_recommendations);
    
    // Alignment
    const avgGap = gapReport.avg_conviction_gap;
    const alignmentScore = this.calculateAlignmentScore(avgGap, adoptionRate);
    
    // Combined score
    const netScore = this.calculateNetScore(adoptionRate, efficiencyScore, alignmentScore, totalFrictionCost);
    
    // Grade
    const { grade, explanation } = this.calculateGrade(netScore, adoptionRate, avgGap);
    
    const score: AdoptionScore = {
      adoption_rate: adoptionRate,
      rejection_rate: rejectionRate,
      ignore_rate: ignoreRate,
      delayed_adoption_cost: delayedCost,
      passive_loss_cost: passiveCost,
      total_friction_cost: totalFrictionCost,
      avg_time_to_action_seconds: avgTime,
      decision_efficiency_score: efficiencyScore,
      avg_conviction_gap: avgGap,
      alignment_score: alignmentScore,
      net_adoption_score: netScore,
      grade,
      grade_explanation: explanation,
      total_decisions: stats.total_recommendations,
      computed_at: new Date().toISOString()
    };
    
    // Cache
    this.cachedScore = score;
    this.lastComputedAt = now;
    
    return score;
  }
  
  /**
   * Calculate efficiency score
   */
  private calculateEfficiencyScore(
    avgTime: number,
    highHesitationCount: number,
    totalDecisions: number
  ): number {
    let score = 100;
    
    // Penalize slow decisions
    const targetTime = 300; // 5 minutes
    if (avgTime > targetTime) {
      const delayMinutes = (avgTime - targetTime) / 60;
      score -= Math.min(30, delayMinutes * 0.5);
    }
    
    // Penalize high hesitation
    if (totalDecisions > 0) {
      const hesitationRate = highHesitationCount / totalDecisions;
      score -= hesitationRate * 30;
    }
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * Calculate alignment score
   */
  private calculateAlignmentScore(avgGap: number, adoptionRate: number): number {
    // Start at 100
    let score = 100;
    
    // Penalize conviction gap
    score -= Math.min(40, avgGap * 0.8);
    
    // Reward high adoption
    score += (adoptionRate - 0.5) * 20; // +10 at 100%, -10 at 0%
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * Calculate net adoption score
   */
  private calculateNetScore(
    adoptionRate: number,
    efficiencyScore: number,
    alignmentScore: number,
    frictionCost: number
  ): number {
    // Weighted combination
    let score = 0;
    
    // Adoption rate (40% weight)
    score += adoptionRate * 100 * 0.40;
    
    // Efficiency (25% weight)
    score += efficiencyScore * 0.25;
    
    // Alignment (25% weight)
    score += alignmentScore * 0.25;
    
    // Cost penalty (10% weight)
    const costPenalty = frictionCost > 0 ? Math.min(10, Math.log10(frictionCost)) : 0;
    score -= costPenalty;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * Calculate grade
   */
  private calculateGrade(
    netScore: number,
    adoptionRate: number,
    avgGap: number
  ): { grade: AdoptionScore['grade']; explanation: string } {
    if (netScore >= 80) {
      return {
        grade: 'A',
        explanation: 'Excellent adoption. User acts quickly on recommendations.'
      };
    }
    
    if (netScore >= 65) {
      return {
        grade: 'B',
        explanation: adoptionRate >= 0.6 
          ? 'Good adoption rate but some hesitation.'
          : 'Moderate adoption. Gap between confidence and action.'
      };
    }
    
    if (netScore >= 50) {
      return {
        grade: 'C',
        explanation: avgGap > 30
          ? 'Significant conviction gap. User hesitant to follow.'
          : 'Average adoption. Room for improvement in speed.'
      };
    }
    
    if (netScore >= 35) {
      return {
        grade: 'D',
        explanation: 'Low adoption. Many recommendations ignored or rejected.'
      };
    }
    
    return {
      grade: 'F',
      explanation: 'Critical adoption failure. User rarely follows recommendations.'
    };
  }
  
  // ===========================================================================
  // COMPARISON WITH TRUST
  // ===========================================================================
  
  /**
   * Get adoption score compared with trust score
   */
  public getComparisonWithTrust(): AdoptionTrustComparison {
    const adoptionScore = this.getAdoptionScore();
    const trustScore = this.trustLedger.getTrustScore();
    
    // Combined health score (average of both)
    const combinedHealth = Math.round(
      (adoptionScore.net_adoption_score + trustScore.net_trust_score) / 2
    );
    
    // Determine primary issue
    let primaryIssue: AdoptionTrustComparison['primary_issue'];
    let actionPriority: string;
    
    const trustDiff = trustScore.net_trust_score - adoptionScore.net_adoption_score;
    
    if (Math.abs(trustDiff) < 10) {
      primaryIssue = 'BALANCED';
      actionPriority = 'Both trust and adoption are aligned. Continue building track record.';
    } else if (trustDiff > 10) {
      // Trust is higher than adoption - user doesn't act despite trust
      primaryIssue = 'ADOPTION';
      actionPriority = 'Focus on reducing friction. User trusts but doesn\'t act.';
    } else {
      // Adoption is higher than trust - user acts but trust is low
      primaryIssue = 'TRUST';
      actionPriority = 'Focus on building trust. User acts but lacks confidence.';
    }
    
    if (combinedHealth >= 70) {
      primaryIssue = 'NONE';
      actionPriority = 'System healthy. Maintain current approach.';
    }
    
    return {
      trust_score: trustScore,
      adoption_score: adoptionScore,
      combined_health_score: combinedHealth,
      primary_issue: primaryIssue,
      action_priority: actionPriority,
      computed_at: new Date().toISOString()
    };
  }
  
  // ===========================================================================
  // QUICK ACCESS
  // ===========================================================================
  
  /**
   * Get just the net score
   */
  public getNetScore(): number {
    return this.getAdoptionScore().net_adoption_score;
  }
  
  /**
   * Get just the grade
   */
  public getGrade(): AdoptionScore['grade'] {
    return this.getAdoptionScore().grade;
  }
  
  /**
   * Get adoption rate
   */
  public getAdoptionRate(): number {
    return this.getAdoptionScore().adoption_rate;
  }
  
  /**
   * Get total friction cost
   */
  public getTotalFrictionCost(): number {
    return this.getAdoptionScore().total_friction_cost;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getAdoptionScore = () => AdoptionScoreCalculator.getInstance();
export default AdoptionScoreCalculator;

