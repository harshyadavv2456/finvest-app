/**
 * ConfidenceHonestyIndex - Confidence Calibration Honesty
 * 
 * PHASE 27: Market-Reality Feedback Loop (MRFL)
 * 
 * PURPOSE:
 * Measure whether FinVest's confidence calibration remained honest over time.
 * 
 * METRICS:
 * - Confidence vs realized outcome
 * - Overconfidence penalty
 * - Underconfidence penalty
 * 
 * OUTPUT:
 * Feeds INTO TrustLedger, does NOT overwrite it.
 * 
 * FORBIDDEN:
 * - Retrospective confidence adjustment
 * - Confidence inflation/deflation
 * - TrustLedger mutation
 */

import { DecisionSnapshot } from '../core/DecisionSnapshot';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { getDecisionAgingEngine, DecisionAging } from './DecisionAgingEngine';
import { getThesisValidator, ThesisAssessment } from './ThesisValidator';
import { getTrustLedger } from '../trust/TrustLedger';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * HonestyBucket - Confidence ranges for calibration
 */
export type HonestyBucket = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * ConfidenceOutcome - What happened to a confident decision
 */
export interface ConfidenceOutcome {
  readonly snapshot_id: string;
  readonly symbol: string;
  readonly stated_confidence: number;
  readonly bucket: HonestyBucket;
  readonly thesis_status: 'HOLDING' | 'DECAYING' | 'BROKEN';
  readonly accuracy_score: number;
  readonly was_correct: boolean;
  readonly overconfidence_penalty: number;
  readonly underconfidence_bonus: number;
}

/**
 * HonestyMetrics - Per-bucket honesty metrics
 */
export interface HonestyMetrics {
  readonly bucket: HonestyBucket;
  readonly count: number;
  readonly avg_stated_confidence: number;
  readonly success_rate: number;
  readonly expected_success_rate: number;
  readonly calibration_error: number;
  readonly is_overconfident: boolean;
  readonly is_underconfident: boolean;
  readonly total_penalty: number;
  readonly total_bonus: number;
}

/**
 * HonestyIndex - Overall honesty index
 */
export interface HonestyIndex {
  readonly id: string;
  readonly computed_at: string;
  
  // Overall score (0-100)
  readonly overall_honesty_score: number;
  
  // Per-bucket metrics
  readonly by_bucket: Record<HonestyBucket, HonestyMetrics>;
  
  // Calibration
  readonly calibration_score: number;         // How well calibrated (0-100)
  readonly overconfidence_penalty: number;    // Total penalty for overconfidence
  readonly underconfidence_bonus: number;     // Total bonus for underconfidence
  
  // Trends
  readonly confidence_trend: 'INFLATING' | 'STABLE' | 'DEFLATING';
  readonly honesty_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  
  // Individual outcomes
  readonly outcomes: ConfidenceOutcome[];
  
  // Summary
  readonly total_decisions: number;
  readonly decisions_correct: number;
  readonly decisions_wrong: number;
  
  // Immutability
  readonly _frozen: true;
}

// =============================================================================
// CONFIDENCE HONESTY INDEX
// =============================================================================

export class ConfidenceHonestyIndexEngine {
  private static instance: ConfidenceHonestyIndexEngine;
  private snapshotAuthority = getSnapshotAuthority();
  private agingEngine = getDecisionAgingEngine();
  private thesisValidator = getThesisValidator();
  private trustLedger = getTrustLedger();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Indices cache
  private indices: Map<string, HonestyIndex> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ConfidenceHonestyIndexEngine {
    if (!ConfidenceHonestyIndexEngine.instance) {
      ConfidenceHonestyIndexEngine.instance = new ConfidenceHonestyIndexEngine();
    }
    return ConfidenceHonestyIndexEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_honesty_index');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, index] of Object.entries(parsed)) {
          this.indices.set(id, index as HonestyIndex);
        }
      }
    } catch (e) {
      console.error('Failed to load honesty index:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const store: Record<string, HonestyIndex> = {};
      for (const [id, index] of this.indices) {
        store[id] = index;
      }
      localStorage.setItem('finvest_honesty_index', JSON.stringify(store));
    } catch (e) {
      console.error('Failed to save honesty index:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Compute full honesty index
   * FAIL-CLOSED: Requires aging data
   */
  public computeHonestyIndex(): HonestyIndex {
    // Get all aged decisions
    const agingRecords = this.agingEngine.getAllAgingRecords();
    
    if (agingRecords.length === 0) {
      throw new Error('HONESTY_FAIL_CLOSED: No aging records available');
    }
    
    // Build outcomes
    const outcomes: ConfidenceOutcome[] = [];
    
    for (const aging of agingRecords) {
      const outcome = this.buildOutcome(aging);
      if (outcome) {
        outcomes.push(outcome);
      }
    }
    
    if (outcomes.length === 0) {
      throw new Error('HONESTY_FAIL_CLOSED: No outcomes could be computed');
    }
    
    // Compute per-bucket metrics
    const byBucket = this.computeBucketMetrics(outcomes);
    
    // Compute overall
    const calibrationScore = this.computeCalibrationScore(byBucket);
    const totalPenalty = Object.values(byBucket).reduce((sum, b) => sum + b.total_penalty, 0);
    const totalBonus = Object.values(byBucket).reduce((sum, b) => sum + b.total_bonus, 0);
    
    // Overall score
    const overallScore = this.computeOverallScore(byBucket, totalPenalty, totalBonus);
    
    // Trends
    const confidenceTrend = this.analyzeConfidenceTrend(outcomes);
    const honestyTrend = this.analyzeHonestyTrend();
    
    // Counts
    const correct = outcomes.filter(o => o.was_correct).length;
    const wrong = outcomes.filter(o => !o.was_correct).length;
    
    const index: HonestyIndex = Object.freeze({
      id: `HONESTY-${Date.now()}`,
      computed_at: new Date().toISOString(),
      overall_honesty_score: overallScore,
      by_bucket: byBucket,
      calibration_score: calibrationScore,
      overconfidence_penalty: totalPenalty,
      underconfidence_bonus: totalBonus,
      confidence_trend: confidenceTrend,
      honesty_trend: honestyTrend,
      outcomes,
      total_decisions: outcomes.length,
      decisions_correct: correct,
      decisions_wrong: wrong,
      _frozen: true
    });
    
    // Store
    this.indices.set(index.id, index);
    this.saveToStorage();
    
    // Audit
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Honesty index computed: ${overallScore}/100`,
      details: {
        index_id: index.id,
        overall_score: overallScore,
        calibration_score: calibrationScore,
        total_decisions: outcomes.length,
        correct: correct,
        wrong: wrong,
        overconfidence_penalty: totalPenalty,
        underconfidence_bonus: totalBonus
      },
      actor: 'ENGINE'
    });
    
    // Feed to TrustLedger (does NOT overwrite, only adds data)
    this.feedToTrustLedger(index);
    
    return index;
  }
  
  // ===========================================================================
  // OUTCOME BUILDING
  // ===========================================================================
  
  private buildOutcome(aging: DecisionAging): ConfidenceOutcome | null {
    // Get snapshot for confidence
    const snapshot = this.snapshotAuthority.getSnapshot(aging.snapshot_id);
    if (!snapshot || !snapshot.outputs[0]) {
      return null;
    }
    
    const output = snapshot.outputs[0];
    const confidence = output.confidence;
    
    // Get thesis assessment if available
    const assessment = this.thesisValidator.getAssessment(aging.snapshot_id);
    const accuracyScore = assessment?.thesis_accuracy_score || 50;
    
    // Determine bucket
    const bucket = this.getBucket(confidence);
    
    // Was it correct? (thesis holding or accuracy score > 50)
    const wasCorrect = aging.thesis_status === 'HOLDING' || 
                       (aging.thesis_status === 'DECAYING' && accuracyScore >= 60);
    
    // Calculate penalties/bonuses
    const { penalty, bonus } = this.calculateConfidenceAdjustment(
      confidence,
      wasCorrect,
      accuracyScore
    );
    
    return {
      snapshot_id: aging.snapshot_id,
      symbol: aging.symbol,
      stated_confidence: confidence,
      bucket,
      thesis_status: aging.thesis_status,
      accuracy_score: accuracyScore,
      was_correct: wasCorrect,
      overconfidence_penalty: penalty,
      underconfidence_bonus: bonus
    };
  }
  
  private getBucket(confidence: number): HonestyBucket {
    if (confidence >= 75) return 'HIGH';
    if (confidence >= 50) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Calculate overconfidence penalty or underconfidence bonus
   * NO retrospective adjustment to original confidence
   */
  private calculateConfidenceAdjustment(
    confidence: number,
    wasCorrect: boolean,
    accuracyScore: number
  ): { penalty: number; bonus: number } {
    let penalty = 0;
    let bonus = 0;
    
    if (wasCorrect) {
      // Was correct
      if (confidence < 50) {
        // Underconfident but correct - bonus
        bonus = (50 - confidence) * 0.5;
      }
      // If high confidence and correct, no adjustment (expected)
    } else {
      // Was wrong
      if (confidence >= 75) {
        // High confidence but wrong - significant penalty
        penalty = (confidence - 50) * 1.5;
      } else if (confidence >= 50) {
        // Medium confidence but wrong - moderate penalty
        penalty = (confidence - 50) * 0.5;
      }
      // Low confidence and wrong - expected, no penalty
    }
    
    return { penalty, bonus };
  }
  
  // ===========================================================================
  // BUCKET METRICS
  // ===========================================================================
  
  private computeBucketMetrics(
    outcomes: ConfidenceOutcome[]
  ): Record<HonestyBucket, HonestyMetrics> {
    const buckets: HonestyBucket[] = ['HIGH', 'MEDIUM', 'LOW'];
    const result: Record<HonestyBucket, HonestyMetrics> = {} as any;
    
    for (const bucket of buckets) {
      const bucketOutcomes = outcomes.filter(o => o.bucket === bucket);
      
      if (bucketOutcomes.length === 0) {
        result[bucket] = {
          bucket,
          count: 0,
          avg_stated_confidence: 0,
          success_rate: 0,
          expected_success_rate: this.getExpectedSuccessRate(bucket),
          calibration_error: 0,
          is_overconfident: false,
          is_underconfident: false,
          total_penalty: 0,
          total_bonus: 0
        };
        continue;
      }
      
      const avgConfidence = bucketOutcomes.reduce((sum, o) => sum + o.stated_confidence, 0) / bucketOutcomes.length;
      const successRate = bucketOutcomes.filter(o => o.was_correct).length / bucketOutcomes.length;
      const expectedRate = this.getExpectedSuccessRate(bucket);
      const calibrationError = Math.abs(successRate - (avgConfidence / 100));
      
      const isOverconfident = successRate < expectedRate - 0.1;
      const isUnderconfident = successRate > expectedRate + 0.1;
      
      const totalPenalty = bucketOutcomes.reduce((sum, o) => sum + o.overconfidence_penalty, 0);
      const totalBonus = bucketOutcomes.reduce((sum, o) => sum + o.underconfidence_bonus, 0);
      
      result[bucket] = {
        bucket,
        count: bucketOutcomes.length,
        avg_stated_confidence: Math.round(avgConfidence),
        success_rate: Math.round(successRate * 100) / 100,
        expected_success_rate: expectedRate,
        calibration_error: Math.round(calibrationError * 100) / 100,
        is_overconfident: isOverconfident,
        is_underconfident: isUnderconfident,
        total_penalty: Math.round(totalPenalty),
        total_bonus: Math.round(totalBonus)
      };
    }
    
    return result;
  }
  
  private getExpectedSuccessRate(bucket: HonestyBucket): number {
    // Well-calibrated confidence should match success rate
    switch (bucket) {
      case 'HIGH': return 0.80;   // 80% success expected
      case 'MEDIUM': return 0.60; // 60% success expected
      case 'LOW': return 0.40;    // 40% success expected
    }
  }
  
  // ===========================================================================
  // SCORING
  // ===========================================================================
  
  private computeCalibrationScore(byBucket: Record<HonestyBucket, HonestyMetrics>): number {
    let totalError = 0;
    let totalCount = 0;
    
    for (const metrics of Object.values(byBucket)) {
      if (metrics.count > 0) {
        totalError += metrics.calibration_error * metrics.count;
        totalCount += metrics.count;
      }
    }
    
    if (totalCount === 0) return 50;
    
    const avgError = totalError / totalCount;
    // Convert error (0-1) to score (0-100), where 0 error = 100 score
    return Math.round(100 - avgError * 100);
  }
  
  private computeOverallScore(
    byBucket: Record<HonestyBucket, HonestyMetrics>,
    totalPenalty: number,
    totalBonus: number
  ): number {
    // Base score from calibration
    let score = 50;
    
    // Calibration contribution (+/- 30)
    for (const metrics of Object.values(byBucket)) {
      if (metrics.count > 0) {
        if (!metrics.is_overconfident && !metrics.is_underconfident) {
          score += 10;
        } else if (metrics.is_overconfident) {
          score -= 10;
        } else {
          score += 5; // Underconfident is better than overconfident
        }
      }
    }
    
    // Penalty/bonus contribution
    score -= Math.min(20, totalPenalty / 10);
    score += Math.min(10, totalBonus / 10);
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  // ===========================================================================
  // TRENDS
  // ===========================================================================
  
  private analyzeConfidenceTrend(outcomes: ConfidenceOutcome[]): HonestyIndex['confidence_trend'] {
    if (outcomes.length < 2) return 'STABLE';
    
    // Compare recent vs older
    const sorted = [...outcomes].sort((a, b) => 
      a.snapshot_id.localeCompare(b.snapshot_id)
    );
    
    const midpoint = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, midpoint);
    const newer = sorted.slice(midpoint);
    
    const oldAvg = older.reduce((sum, o) => sum + o.stated_confidence, 0) / older.length;
    const newAvg = newer.reduce((sum, o) => sum + o.stated_confidence, 0) / newer.length;
    
    if (newAvg > oldAvg + 5) return 'INFLATING';
    if (newAvg < oldAvg - 5) return 'DEFLATING';
    return 'STABLE';
  }
  
  private analyzeHonestyTrend(): HonestyIndex['honesty_trend'] {
    const indices = Array.from(this.indices.values());
    if (indices.length < 2) return 'STABLE';
    
    // Compare last two indices
    const sorted = indices.sort((a, b) => 
      new Date(a.computed_at).getTime() - new Date(b.computed_at).getTime()
    );
    
    const prev = sorted[sorted.length - 2];
    const current = sorted[sorted.length - 1];
    
    if (current.overall_honesty_score > prev.overall_honesty_score + 5) return 'IMPROVING';
    if (current.overall_honesty_score < prev.overall_honesty_score - 5) return 'DECLINING';
    return 'STABLE';
  }
  
  // ===========================================================================
  // TRUST LEDGER INTEGRATION
  // ===========================================================================
  
  /**
   * Feed honesty data to TrustLedger
   * Does NOT overwrite TrustLedger data
   */
  private feedToTrustLedger(index: HonestyIndex): void {
    // Log that we're feeding data
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: 'Honesty index fed to TrustLedger',
      details: {
        honesty_index_id: index.id,
        overall_score: index.overall_honesty_score,
        calibration_score: index.calibration_score
      },
      actor: 'ENGINE'
    });
    
    // The TrustLedger will pick up this data during its sync
    // We don't directly modify TrustLedger - it pulls from us
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  public getLatestIndex(): HonestyIndex | null {
    const indices = Array.from(this.indices.values());
    if (indices.length === 0) return null;
    
    return indices.sort((a, b) => 
      new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime()
    )[0];
  }
  
  public getAllIndices(): HonestyIndex[] {
    return Array.from(this.indices.values());
  }
  
  public getOutcomeForSnapshot(snapshotId: string): ConfidenceOutcome | null {
    const latest = this.getLatestIndex();
    if (!latest) return null;
    
    return latest.outcomes.find(o => o.snapshot_id === snapshotId) || null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getConfidenceHonestyIndex = () => ConfidenceHonestyIndexEngine.getInstance();
export default ConfidenceHonestyIndexEngine;

