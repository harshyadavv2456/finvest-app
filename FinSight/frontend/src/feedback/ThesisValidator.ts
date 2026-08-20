/**
 * ThesisValidator - Thesis Assessment Engine
 * 
 * PHASE 27: Market-Reality Feedback Loop (MRFL)
 * 
 * PURPOSE:
 * Evaluate WHY a decision aged the way it did.
 * 
 * RULES:
 * - Compare expected_return vs realized return
 * - Compare risk estimates vs actual drawdowns
 * - Detect thesis breaks caused by external events
 * 
 * FORBIDDEN:
 * - Any retrospective optimization
 * - Any recommendation mutation
 * - Any "should have" analysis
 */

import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { getDecisionAgingEngine, DecisionAging, ThesisStatus } from './DecisionAgingEngine';
import { getMarketTimeline } from '../core/MarketTimeline';
import { MarketEvent } from '../core/MarketEvent';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * FailureMode - Why the thesis failed (if it did)
 */
export type FailureMode = 
  | 'TIMING'              // Right thesis, wrong timing
  | 'RISK_UNDERESTIMATED' // Didn't account for downside
  | 'THESIS_WRONG'        // Fundamental thesis was incorrect
  | 'EXTERNAL_SHOCK'      // Unpredictable external event
  | 'NONE';               // Thesis is still valid

/**
 * ThesisAssessment - Immutable assessment record
 */
export interface ThesisAssessment {
  readonly id: string;
  readonly snapshot_id: string;
  readonly aging_id: string;
  readonly assessed_at: string;
  
  // Core metrics
  readonly thesis_accuracy_score: number; // 0-100
  readonly failure_mode: FailureMode;
  
  // Expected vs Actual
  readonly expected_return: number;
  readonly realized_return: number;
  readonly return_delta: number;
  
  readonly expected_risk: number;
  readonly realized_risk: number;
  readonly risk_delta: number;
  
  // Timing analysis
  readonly was_timing_issue: boolean;
  readonly peak_return_achieved: number;
  readonly time_to_peak_days: number;
  
  // External factors
  readonly external_events: ExternalEventImpact[];
  readonly primary_external_cause?: string;
  
  // Classification
  readonly thesis_quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN';
  readonly risk_assessment_quality: 'ACCURATE' | 'UNDERESTIMATED' | 'OVERESTIMATED';
  
  // Immutability
  readonly _frozen: true;
}

/**
 * ExternalEventImpact - How an external event impacted the thesis
 */
export interface ExternalEventImpact {
  readonly event_id: string;
  readonly event_type: string;
  readonly event_date: string;
  readonly price_before: number;
  readonly price_after: number;
  readonly impact_percent: number;
  readonly was_predictable: boolean;
}

// =============================================================================
// THESIS VALIDATOR
// =============================================================================

export class ThesisValidator {
  private static instance: ThesisValidator;
  private snapshotAuthority = getSnapshotAuthority();
  private agingEngine = getDecisionAgingEngine();
  private marketTimeline = getMarketTimeline();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Assessment cache
  private assessments: Map<string, ThesisAssessment> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ThesisValidator {
    if (!ThesisValidator.instance) {
      ThesisValidator.instance = new ThesisValidator();
    }
    return ThesisValidator.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_thesis_assessments');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, assessment] of Object.entries(parsed)) {
          this.assessments.set(id, assessment as ThesisAssessment);
        }
      }
    } catch (e) {
      console.error('Failed to load thesis assessments:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const store: Record<string, ThesisAssessment> = {};
      for (const [id, assessment] of this.assessments) {
        store[id] = assessment;
      }
      localStorage.setItem('finvest_thesis_assessments', JSON.stringify(store));
    } catch (e) {
      console.error('Failed to save thesis assessments:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Validate thesis for a snapshot
   * FAIL-CLOSED: Requires aging data
   */
  public validateThesis(snapshotId: string): ThesisAssessment {
    // Get aging data - FAIL CLOSED if missing
    const aging = this.agingEngine.getAging(snapshotId);
    if (!aging) {
      // Try to compute aging first
      try {
        this.agingEngine.computeAging(snapshotId);
      } catch (e) {
        throw new Error(`THESIS_FAIL_CLOSED: Aging data not available for ${snapshotId}`);
      }
      
      const newAging = this.agingEngine.getAging(snapshotId);
      if (!newAging) {
        throw new Error(`THESIS_FAIL_CLOSED: Failed to compute aging for ${snapshotId}`);
      }
    }
    
    const agingData = aging || this.agingEngine.getAging(snapshotId)!;
    
    // Get snapshot
    const snapshot = this.snapshotAuthority.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`THESIS_FAIL_CLOSED: Snapshot ${snapshotId} not found`);
    }
    
    const output = snapshot.outputs[0];
    if (!output) {
      throw new Error(`THESIS_FAIL_CLOSED: No output in snapshot ${snapshotId}`);
    }
    
    // Build assessment
    const assessment = this.buildAssessment(snapshot, output, agingData);
    
    // Store
    this.assessments.set(assessment.id, assessment);
    this.saveToStorage();
    
    // Audit
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: assessment.failure_mode === 'NONE' ? 'INFO' : 'WARNING',
      summary: `Thesis validated: ${agingData.symbol} (${assessment.thesis_quality}, ${assessment.failure_mode})`,
      details: {
        assessment_id: assessment.id,
        snapshot_id: snapshotId,
        accuracy_score: assessment.thesis_accuracy_score,
        failure_mode: assessment.failure_mode,
        thesis_quality: assessment.thesis_quality,
        risk_quality: assessment.risk_assessment_quality
      },
      actor: 'ENGINE'
    });
    
    return assessment;
  }
  
  // ===========================================================================
  // ASSESSMENT BUILDING
  // ===========================================================================
  
  private buildAssessment(
    snapshot: DecisionSnapshot,
    output: DecisionOutput,
    aging: DecisionAging
  ): ThesisAssessment {
    // Expected values
    const expectedReturn = output.expected_return || 0;
    const expectedRisk = aging.expected_drawdown;
    
    // Realized values
    const realizedReturn = aging.price_change_percent;
    const realizedRisk = aging.max_adverse_move;
    
    // Deltas
    const returnDelta = realizedReturn - expectedReturn;
    const riskDelta = realizedRisk - expectedRisk;
    
    // Timing analysis
    const wasTimingIssue = this.analyzeTimingIssue(aging, realizedReturn);
    
    // External events
    const externalEvents = this.analyzeExternalEvents(aging.symbol, snapshot.created_at);
    
    // Failure mode
    const failureMode = this.determineFailureMode(
      aging.thesis_status,
      returnDelta,
      riskDelta,
      wasTimingIssue,
      externalEvents
    );
    
    // Thesis quality
    const thesisQuality = this.assessThesisQuality(aging.thesis_status, returnDelta);
    
    // Risk assessment quality
    const riskQuality = this.assessRiskQuality(expectedRisk, realizedRisk);
    
    // Accuracy score
    const accuracyScore = this.calculateAccuracyScore(
      aging.thesis_status,
      returnDelta,
      riskDelta,
      externalEvents.length
    );
    
    const assessment: ThesisAssessment = Object.freeze({
      id: `THESIS-${snapshot.id}-${Date.now()}`,
      snapshot_id: snapshot.id,
      aging_id: aging.id,
      assessed_at: new Date().toISOString(),
      thesis_accuracy_score: accuracyScore,
      failure_mode: failureMode,
      expected_return: expectedReturn,
      realized_return: realizedReturn,
      return_delta: returnDelta,
      expected_risk: expectedRisk,
      realized_risk: realizedRisk,
      risk_delta: riskDelta,
      was_timing_issue: wasTimingIssue,
      peak_return_achieved: aging.max_favorable_move,
      time_to_peak_days: aging.time_to_peak_days,
      external_events: externalEvents,
      primary_external_cause: externalEvents.length > 0 
        ? externalEvents[0].type 
        : undefined,
      thesis_quality: thesisQuality,
      risk_assessment_quality: riskQuality,
      _frozen: true
    });
    
    return assessment;
  }
  
  // ===========================================================================
  // ANALYSIS METHODS
  // ===========================================================================
  
  /**
   * Analyze if this was a timing issue
   */
  private analyzeTimingIssue(aging: DecisionAging, realizedReturn: number): boolean {
    // If peak was favorable but current is not, timing was the issue
    const peakWasFavorable = aging.max_favorable_move > 5; // 5% favorable
    const currentIsUnfavorable = realizedReturn < 0;
    
    // Or if thesis is broken but peak was achieved first
    const thesisBroken = aging.thesis_status === 'BROKEN';
    const peakBeforeTrough = aging.time_to_peak_days < aging.time_to_trough_days;
    
    return (peakWasFavorable && currentIsUnfavorable) || (thesisBroken && peakBeforeTrough);
  }
  
  /**
   * Analyze external events impact
   */
  private analyzeExternalEvents(symbol: string, afterDate: string): ExternalEventImpact[] {
    const events = this.marketTimeline.getEventsBySymbol(symbol);
    const impacts: ExternalEventImpact[] = [];
    
    for (const event of events) {
      if (new Date(event.timestamp) <= new Date(afterDate)) continue;
      
      // Only include significant events
      if (!this.isSignificantEvent(event)) continue;
      
      const priceBefore = event.data?.price_before as number || 0;
      const priceAfter = event.data?.price_after as number || 0;
      const impact: ExternalEventImpact = {
        event_id: event.id,
        event_type: event.type,
        event_date: event.timestamp,
        price_before: priceBefore,
        price_after: priceAfter,
        impact_percent: priceBefore 
          ? (priceAfter - priceBefore) / priceBefore * 100
          : 0,
        was_predictable: this.wasEventPredictable(event)
      };
      
      impacts.push(impact);
    }
    
    // Sort by impact magnitude
    impacts.sort((a, b) => Math.abs(b.impact_percent) - Math.abs(a.impact_percent));
    
    return impacts;
  }
  
  private isSignificantEvent(event: MarketEvent): boolean {
    const significantTypes = [
      'EARNINGS_MISS',
      'EARNINGS_BEAT',
      'GUIDANCE_CUT',
      'GUIDANCE_RAISE',
      'ANALYST_DOWNGRADE',
      'ANALYST_UPGRADE',
      'SECTOR_SHOCK',
      'REGIME_CHANGE',
      'MANAGEMENT_CHANGE'
    ];
    
    return significantTypes.includes(event.type);
  }
  
  private wasEventPredictable(event: MarketEvent): boolean {
    // Events that are generally predictable
    const predictable = ['EARNINGS_MISS', 'EARNINGS_BEAT', 'GUIDANCE_CUT', 'GUIDANCE_RAISE'];
    
    // Events that are unpredictable
    const unpredictable = ['SECTOR_SHOCK', 'REGIME_CHANGE', 'MANAGEMENT_CHANGE'];
    
    if (predictable.includes(event.type)) return true;
    if (unpredictable.includes(event.type)) return false;
    
    return false;
  }
  
  // ===========================================================================
  // FAILURE MODE DETERMINATION
  // ===========================================================================
  
  /**
   * Determine failure mode WITHOUT retrospective bias
   * Only classify as failure if objective criteria are met
   */
  private determineFailureMode(
    thesisStatus: ThesisStatus,
    returnDelta: number,
    riskDelta: number,
    wasTimingIssue: boolean,
    externalEvents: ExternalEventImpact[]
  ): FailureMode {
    // If thesis is still holding, no failure
    if (thesisStatus === 'HOLDING') {
      return 'NONE';
    }
    
    // If major unpredictable external event
    const unpredictableShock = externalEvents.find(
      e => !e.was_predictable && Math.abs(e.impact_percent) > 10
    );
    if (unpredictableShock) {
      return 'EXTERNAL_SHOCK';
    }
    
    // If timing was the issue (thesis was right, timing was wrong)
    if (wasTimingIssue) {
      return 'TIMING';
    }
    
    // If risk was underestimated
    if (riskDelta > 10) { // Realized risk 10%+ higher than expected
      return 'RISK_UNDERESTIMATED';
    }
    
    // If thesis is broken without external cause
    if (thesisStatus === 'BROKEN') {
      return 'THESIS_WRONG';
    }
    
    // Decaying but not broken
    if (thesisStatus === 'DECAYING') {
      // Could recover - not a failure yet
      if (returnDelta < -20) {
        return 'THESIS_WRONG';
      }
      return 'NONE'; // Still could recover
    }
    
    return 'NONE';
  }
  
  // ===========================================================================
  // QUALITY ASSESSMENT
  // ===========================================================================
  
  private assessThesisQuality(
    status: ThesisStatus,
    returnDelta: number
  ): ThesisAssessment['thesis_quality'] {
    if (status === 'BROKEN') return 'BROKEN';
    if (status === 'DECAYING') {
      if (returnDelta < -15) return 'POOR';
      return 'FAIR';
    }
    
    // HOLDING
    if (returnDelta >= 10) return 'EXCELLENT';
    if (returnDelta >= 0) return 'GOOD';
    if (returnDelta >= -10) return 'FAIR';
    return 'POOR';
  }
  
  private assessRiskQuality(
    expectedRisk: number,
    realizedRisk: number
  ): ThesisAssessment['risk_assessment_quality'] {
    const riskRatio = realizedRisk / (expectedRisk || 1);
    
    if (riskRatio > 1.5) return 'UNDERESTIMATED';
    if (riskRatio < 0.5) return 'OVERESTIMATED';
    return 'ACCURATE';
  }
  
  private calculateAccuracyScore(
    status: ThesisStatus,
    returnDelta: number,
    riskDelta: number,
    externalEventCount: number
  ): number {
    let score = 50; // Base score
    
    // Status contribution (0-30)
    if (status === 'HOLDING') score += 30;
    else if (status === 'DECAYING') score += 10;
    else score -= 10;
    
    // Return delta contribution (-20 to +20)
    if (returnDelta >= 10) score += 20;
    else if (returnDelta >= 0) score += 10;
    else if (returnDelta >= -10) score -= 5;
    else score -= 15;
    
    // Risk delta contribution (-10 to +10)
    if (riskDelta <= 0) score += 10; // Risk overestimated (conservative)
    else if (riskDelta <= 5) score += 5;
    else if (riskDelta <= 10) score -= 5;
    else score -= 10;
    
    // External events (reduce blame for unpredictable events)
    if (externalEventCount > 0 && status !== 'HOLDING') {
      score += 5; // Partial credit for external factors
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  public getAssessment(snapshotId: string): ThesisAssessment | null {
    for (const assessment of this.assessments.values()) {
      if (assessment.snapshot_id === snapshotId) {
        return assessment;
      }
    }
    return null;
  }
  
  public getAllAssessments(): ThesisAssessment[] {
    return Array.from(this.assessments.values());
  }
  
  public getAssessmentsByFailureMode(mode: FailureMode): ThesisAssessment[] {
    return this.getAllAssessments().filter(a => a.failure_mode === mode);
  }
  
  public getStats(): {
    total_assessed: number;
    avg_accuracy_score: number;
    failure_distribution: Record<FailureMode, number>;
    quality_distribution: Record<ThesisAssessment['thesis_quality'], number>;
  } {
    const all = this.getAllAssessments();
    
    if (all.length === 0) {
      return {
        total_assessed: 0,
        avg_accuracy_score: 0,
        failure_distribution: { TIMING: 0, RISK_UNDERESTIMATED: 0, THESIS_WRONG: 0, EXTERNAL_SHOCK: 0, NONE: 0 },
        quality_distribution: { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0, BROKEN: 0 }
      };
    }
    
    const avgScore = all.reduce((sum, a) => sum + a.thesis_accuracy_score, 0) / all.length;
    
    const failureDist: Record<FailureMode, number> = { TIMING: 0, RISK_UNDERESTIMATED: 0, THESIS_WRONG: 0, EXTERNAL_SHOCK: 0, NONE: 0 };
    for (const a of all) {
      failureDist[a.failure_mode]++;
    }
    
    const qualityDist: Record<ThesisAssessment['thesis_quality'], number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0, BROKEN: 0 };
    for (const a of all) {
      qualityDist[a.thesis_quality]++;
    }
    
    return {
      total_assessed: all.length,
      avg_accuracy_score: Math.round(avgScore),
      failure_distribution: failureDist,
      quality_distribution: qualityDist
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getThesisValidator = () => ThesisValidator.getInstance();
export default ThesisValidator;

