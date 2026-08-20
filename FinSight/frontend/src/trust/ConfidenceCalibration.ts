/**
 * ConfidenceCalibration - Calibration Engine
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * PURPOSE:
 * Track how well confidence predictions match outcomes.
 * Detect overconfidence and underconfidence.
 * 
 * BUCKETS:
 * - HIGH: ≥75 confidence
 * - MEDIUM: 50-74 confidence
 * - LOW: <50 confidence
 * 
 * NO confidence inflation.
 * Losses must be visible.
 */

import { getTrustLedger, TrustEntry, TrustScore } from './TrustLedger';
import { getExecutionSandbox, IntentRecord, IntentPerformance } from '../execution/ExecutionSandbox';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export type ConfidenceBucket = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * BucketStats - Statistics for a confidence bucket
 */
export interface BucketStats {
  bucket: ConfidenceBucket;
  confidence_range: string;
  
  // Counts
  total_decisions: number;
  correct_decisions: number;
  wrong_decisions: number;
  pending_decisions: number;
  
  // Accuracy
  accuracy_percent: number;          // 0-100
  expected_accuracy_percent: number; // Based on confidence
  
  // Calibration
  overconfidence_penalty: number;    // Positive = overconfident
  underconfidence_bonus: number;     // Positive = underconfident
  calibration_error: number;         // Absolute difference
  
  // Regret
  total_regret: number;
  avg_regret_per_decision: number;
  
  // Financial impact
  total_gain: number;
  total_loss: number;
  net_impact: number;
}

/**
 * CalibrationReport - Full calibration report
 */
export interface CalibrationReport {
  generated_at: string;
  
  // Overall
  overall_accuracy: number;
  overall_calibration_error: number;
  is_well_calibrated: boolean;
  
  // By bucket
  high: BucketStats;
  medium: BucketStats;
  low: BucketStats;
  
  // Summary
  total_decisions: number;
  total_regret: number;
  net_financial_impact: number;
  
  // Insights
  insights: CalibrationInsight[];
  
  // Calibration curve data (for visualization)
  calibration_curve: Array<{
    predicted_confidence: number;
    actual_accuracy: number;
    sample_size: number;
  }>;
}

/**
 * CalibrationInsight - Actionable insight from calibration
 */
export interface CalibrationInsight {
  type: 'WARNING' | 'INFO' | 'SUCCESS';
  message: string;
  bucket?: ConfidenceBucket;
  action_suggested?: string;
}

// =============================================================================
// CONFIDENCE CALIBRATION ENGINE
// =============================================================================

export class ConfidenceCalibrationEngine {
  private static instance: ConfidenceCalibrationEngine;
  private trustLedger = getTrustLedger();
  private sandbox = getExecutionSandbox();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Bucket boundaries
  private readonly HIGH_THRESHOLD = 75;
  private readonly MEDIUM_THRESHOLD = 50;
  
  private constructor() {}
  
  public static getInstance(): ConfidenceCalibrationEngine {
    if (!ConfidenceCalibrationEngine.instance) {
      ConfidenceCalibrationEngine.instance = new ConfidenceCalibrationEngine();
    }
    return ConfidenceCalibrationEngine.instance;
  }
  
  // ===========================================================================
  // BUCKET CLASSIFICATION
  // ===========================================================================
  
  /**
   * Classify confidence into bucket
   */
  public classifyConfidence(confidence: number): ConfidenceBucket {
    if (confidence >= this.HIGH_THRESHOLD) return 'HIGH';
    if (confidence >= this.MEDIUM_THRESHOLD) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Get expected accuracy for a bucket
   */
  private getExpectedAccuracy(bucket: ConfidenceBucket): number {
    switch (bucket) {
      case 'HIGH': return 0.85; // 85% expected for high confidence
      case 'MEDIUM': return 0.65; // 65% expected for medium
      case 'LOW': return 0.45; // 45% expected for low
    }
  }
  
  // ===========================================================================
  // CALIBRATION COMPUTATION
  // ===========================================================================
  
  /**
   * Get calibration report
   */
  public getCalibrationReport(): CalibrationReport {
    const entries = this.trustLedger.getEntries();
    const now = new Date().toISOString();
    
    // Group by bucket
    const highEntries = entries.filter(e => this.classifyConfidence(e.confidence_at_decision) === 'HIGH');
    const mediumEntries = entries.filter(e => this.classifyConfidence(e.confidence_at_decision) === 'MEDIUM');
    const lowEntries = entries.filter(e => this.classifyConfidence(e.confidence_at_decision) === 'LOW');
    
    // Compute bucket stats
    const high = this.computeBucketStats(highEntries, 'HIGH');
    const medium = this.computeBucketStats(mediumEntries, 'MEDIUM');
    const low = this.computeBucketStats(lowEntries, 'LOW');
    
    // Overall metrics
    const totalDecisions = entries.length;
    const correctDecisions = entries.filter(e => e.outcome === 'CORRECT').length;
    const decidedEntries = entries.filter(e => e.outcome !== 'PENDING');
    
    const overallAccuracy = decidedEntries.length > 0 
      ? correctDecisions / decidedEntries.length 
      : 0;
    
    const overallCalibrationError = (
      Math.abs(high.calibration_error) + 
      Math.abs(medium.calibration_error) + 
      Math.abs(low.calibration_error)
    ) / 3;
    
    const isWellCalibrated = overallCalibrationError < 0.15; // Within 15%
    
    // Total financial impact
    const totalRegret = entries.reduce((sum, e) => sum + Math.abs(e.regret_amount), 0);
    const netFinancialImpact = 
      (high.net_impact + medium.net_impact + low.net_impact);
    
    // Generate insights
    const insights = this.generateInsights(high, medium, low, overallAccuracy);
    
    // Calibration curve (10 points)
    const calibrationCurve = this.generateCalibrationCurve(entries);
    
    // Log report generation
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Calibration report generated: ${totalDecisions} decisions`,
      details: {
        total_decisions: totalDecisions,
        overall_accuracy: overallAccuracy,
        is_well_calibrated: isWellCalibrated,
        calibration_error: overallCalibrationError
      },
      actor: 'ENGINE'
    });
    
    return {
      generated_at: now,
      overall_accuracy: overallAccuracy * 100,
      overall_calibration_error: overallCalibrationError * 100,
      is_well_calibrated: isWellCalibrated,
      high,
      medium,
      low,
      total_decisions: totalDecisions,
      total_regret: totalRegret,
      net_financial_impact: netFinancialImpact,
      insights,
      calibration_curve: calibrationCurve
    };
  }
  
  /**
   * Compute stats for a bucket
   */
  private computeBucketStats(entries: readonly TrustEntry[], bucket: ConfidenceBucket): BucketStats {
    const total = entries.length;
    const correct = entries.filter(e => e.outcome === 'CORRECT').length;
    const wrong = entries.filter(e => e.outcome === 'WRONG').length;
    const pending = entries.filter(e => e.outcome === 'PENDING').length;
    
    const decided = correct + wrong;
    const actualAccuracy = decided > 0 ? correct / decided : 0;
    const expectedAccuracy = this.getExpectedAccuracy(bucket);
    
    // Calibration
    const calibrationError = actualAccuracy - expectedAccuracy;
    const overconfidencePenalty = calibrationError < 0 ? Math.abs(calibrationError) : 0;
    const underconfidenceBonus = calibrationError > 0 ? calibrationError : 0;
    
    // Regret
    const totalRegret = entries.reduce((sum, e) => sum + Math.abs(e.regret_amount), 0);
    const avgRegret = total > 0 ? totalRegret / total : 0;
    
    // Financial
    const totalGain = entries
      .filter(e => e.return_if_followed > 0 && e.outcome === 'CORRECT')
      .reduce((sum, e) => sum + e.return_if_followed, 0);
    
    const totalLoss = entries
      .filter(e => e.outcome === 'WRONG')
      .reduce((sum, e) => sum + Math.abs(e.regret_amount), 0);
    
    return {
      bucket,
      confidence_range: this.getBucketRange(bucket),
      total_decisions: total,
      correct_decisions: correct,
      wrong_decisions: wrong,
      pending_decisions: pending,
      accuracy_percent: actualAccuracy * 100,
      expected_accuracy_percent: expectedAccuracy * 100,
      overconfidence_penalty: overconfidencePenalty * 100,
      underconfidence_bonus: underconfidenceBonus * 100,
      calibration_error: calibrationError * 100,
      total_regret: totalRegret,
      avg_regret_per_decision: avgRegret,
      total_gain: totalGain,
      total_loss: totalLoss,
      net_impact: totalGain - totalLoss
    };
  }
  
  /**
   * Get bucket range string
   */
  private getBucketRange(bucket: ConfidenceBucket): string {
    switch (bucket) {
      case 'HIGH': return '≥75';
      case 'MEDIUM': return '50-74';
      case 'LOW': return '<50';
    }
  }
  
  /**
   * Generate calibration curve
   */
  private generateCalibrationCurve(
    entries: readonly TrustEntry[]
  ): Array<{ predicted_confidence: number; actual_accuracy: number; sample_size: number }> {
    const curve: Array<{ predicted_confidence: number; actual_accuracy: number; sample_size: number }> = [];
    
    // Group by 10-point confidence ranges
    for (let conf = 0; conf <= 90; conf += 10) {
      const inRange = entries.filter(e => 
        e.confidence_at_decision >= conf && e.confidence_at_decision < conf + 10
      );
      
      const decided = inRange.filter(e => e.outcome !== 'PENDING');
      const correct = decided.filter(e => e.outcome === 'CORRECT').length;
      
      curve.push({
        predicted_confidence: conf + 5, // Midpoint
        actual_accuracy: decided.length > 0 ? (correct / decided.length) * 100 : 0,
        sample_size: decided.length
      });
    }
    
    return curve;
  }
  
  /**
   * Generate insights from calibration data
   */
  private generateInsights(
    high: BucketStats,
    medium: BucketStats,
    low: BucketStats,
    overallAccuracy: number
  ): CalibrationInsight[] {
    const insights: CalibrationInsight[] = [];
    
    // Check for overconfidence in HIGH bucket
    if (high.overconfidence_penalty > 10 && high.total_decisions >= 5) {
      insights.push({
        type: 'WARNING',
        message: `High confidence predictions are ${high.overconfidence_penalty.toFixed(0)}% overconfident`,
        bucket: 'HIGH',
        action_suggested: 'Consider lowering confidence thresholds for recommendations'
      });
    }
    
    // Check for underconfidence
    if (low.underconfidence_bonus > 15 && low.total_decisions >= 5) {
      insights.push({
        type: 'INFO',
        message: `Low confidence predictions are actually ${low.underconfidence_bonus.toFixed(0)}% more accurate than expected`,
        bucket: 'LOW',
        action_suggested: 'Some low-confidence signals may be undervalued'
      });
    }
    
    // Check for high accuracy overall
    if (overallAccuracy > 0.7 && high.total_decisions + medium.total_decisions >= 10) {
      insights.push({
        type: 'SUCCESS',
        message: `Overall accuracy is ${(overallAccuracy * 100).toFixed(0)}% - predictions are reliable`
      });
    }
    
    // Check for high regret in any bucket
    for (const bucket of [high, medium, low]) {
      if (bucket.avg_regret_per_decision > 10000 && bucket.total_decisions >= 3) {
        insights.push({
          type: 'WARNING',
          message: `${bucket.bucket} confidence decisions have average regret of ₹${bucket.avg_regret_per_decision.toLocaleString()}`,
          bucket: bucket.bucket,
          action_suggested: 'Review position sizing for this confidence level'
        });
      }
    }
    
    // Check for insufficient data
    const totalDecisions = high.total_decisions + medium.total_decisions + low.total_decisions;
    if (totalDecisions < 10) {
      insights.push({
        type: 'INFO',
        message: `Only ${totalDecisions} decisions tracked. More data needed for reliable calibration.`,
        action_suggested: 'Continue using sandbox to build trust history'
      });
    }
    
    return insights;
  }
  
  // ===========================================================================
  // QUICK QUERIES
  // ===========================================================================
  
  /**
   * Get accuracy for a specific bucket
   */
  public getBucketAccuracy(bucket: ConfidenceBucket): number {
    const report = this.getCalibrationReport();
    return report[bucket.toLowerCase() as 'high' | 'medium' | 'low'].accuracy_percent;
  }
  
  /**
   * Check if system is overconfident
   */
  public isOverconfident(): boolean {
    const report = this.getCalibrationReport();
    return report.high.overconfidence_penalty > 10;
  }
  
  /**
   * Get average regret by bucket
   */
  public getAvgRegretByBucket(): { high: number; medium: number; low: number } {
    const report = this.getCalibrationReport();
    return {
      high: report.high.avg_regret_per_decision,
      medium: report.medium.avg_regret_per_decision,
      low: report.low.avg_regret_per_decision
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getConfidenceCalibration = () => ConfidenceCalibrationEngine.getInstance();
export default ConfidenceCalibrationEngine;

