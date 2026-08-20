/**
 * CentralityRiskEngine - Detect Power Concentration
 * 
 * PHASE 38: Self-Limiting Growth & Power Containment (SLG)
 * 
 * PURPOSE:
 * Detect when FinVest is becoming the primary decision-maker.
 * CRITICAL centrality → Force Silence Mode globally.
 * 
 * SIGNALS:
 * - User accepts > X% of decisions
 * - Overrides drop to near zero
 * - External references disappear
 * - Decision latency drops unnaturally
 * 
 * DESIGN LAW:
 * A system with high trust + high centrality may not speak often.
 * This is non-negotiable.
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getInfluenceBudgetEngine, SelfLimitEvent } from './InfluenceBudgetEngine';

// =============================================================================
// TYPES
// =============================================================================

/**
 * CentralityRisk - Current centrality assessment
 */
export interface CentralityRisk {
  readonly score: number; // 0-100
  readonly state: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  readonly reasons: readonly string[];
  readonly timestamp: string;
  readonly _frozen: true;
}

/**
 * CentralitySignal - Individual signal contributing to centrality
 */
export interface CentralitySignal {
  readonly name: string;
  readonly value: number;
  readonly threshold: number;
  readonly weight: number;
  readonly triggered: boolean;
  readonly description: string;
  readonly _frozen: true;
}

/**
 * CentralityAssessment - Full assessment with signals
 */
export interface CentralityAssessment {
  readonly risk: CentralityRisk;
  readonly signals: readonly CentralitySignal[];
  readonly force_silence: boolean;
  readonly explanation: string;
  readonly _frozen: true;
}

/**
 * CentralityHistory - Historical tracking
 */
export interface CentralityHistoryEntry {
  readonly timestamp: string;
  readonly score: number;
  readonly state: CentralityRisk['state'];
  readonly _frozen: true;
}

// =============================================================================
// CONSTANTS (STRUCTURAL - NOT CONFIGURABLE)
// =============================================================================

/**
 * Centrality thresholds
 * These are structural, not adjustable.
 */
const CENTRALITY_THRESHOLDS = Object.freeze({
  CRITICAL: 80,   // Score >= 80 → CRITICAL (force silence)
  ELEVATED: 60,   // Score >= 60 → ELEVATED (reduce output)
  NORMAL: 40      // Score < 40 → NORMAL
});

/**
 * Signal weights
 */
const SIGNAL_WEIGHTS = Object.freeze({
  ACCEPTANCE_RATE: 0.30,       // User accepts too many decisions
  OVERRIDE_ABSENCE: 0.25,      // User never overrides
  LATENCY_DROP: 0.15,          // Decisions made too quickly
  EXTERNAL_ABSENCE: 0.15,      // No external research referenced
  CONSECUTIVE_FOLLOWS: 0.15    // Long streaks of following advice
});

/**
 * Signal thresholds
 */
const SIGNAL_THRESHOLDS = Object.freeze({
  ACCEPTANCE_RATE_HIGH: 0.90,
  ACCEPTANCE_RATE_CRITICAL: 0.95,
  OVERRIDE_ABSENCE_DAYS: 14,
  LATENCY_DROP_SECONDS: 30,      // Decisions in < 30 seconds are suspicious
  EXTERNAL_ABSENCE_DAYS: 7,
  CONSECUTIVE_FOLLOWS: 10
});

// =============================================================================
// CENTRALITY RISK ENGINE
// =============================================================================

export class CentralityRiskEngine {
  private static instance: CentralityRiskEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Metrics
  private acceptanceRate: number = 0.5;
  private daysSinceOverride: number = 0;
  private avgDecisionLatency: number = 300; // seconds
  private daysSinceExternalRef: number = 0;
  private consecutiveFollows: number = 0;
  
  // History
  private history: CentralityHistoryEntry[] = [];
  
  // Cached assessment
  private lastAssessment: CentralityAssessment | null = null;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): CentralityRiskEngine {
    if (!CentralityRiskEngine.instance) {
      CentralityRiskEngine.instance = new CentralityRiskEngine();
    }
    return CentralityRiskEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_centrality_risk');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.acceptanceRate = parsed.acceptanceRate || 0.5;
        this.daysSinceOverride = parsed.daysSinceOverride || 0;
        this.avgDecisionLatency = parsed.avgDecisionLatency || 300;
        this.daysSinceExternalRef = parsed.daysSinceExternalRef || 0;
        this.consecutiveFollows = parsed.consecutiveFollows || 0;
        this.history = parsed.history || [];
      }
    } catch (e) {
      console.error('Failed to load centrality risk:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        acceptanceRate: this.acceptanceRate,
        daysSinceOverride: this.daysSinceOverride,
        avgDecisionLatency: this.avgDecisionLatency,
        daysSinceExternalRef: this.daysSinceExternalRef,
        consecutiveFollows: this.consecutiveFollows,
        history: this.history.slice(-365) // Keep 1 year
      };
      localStorage.setItem('finvest_centrality_risk', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save centrality risk:', e);
    }
  }
  
  // ===========================================================================
  // METRICS UPDATE
  // ===========================================================================
  
  /**
   * Update metrics from external sources
   */
  public updateMetrics(params: {
    acceptanceRate?: number;
    overrideOccurred?: boolean;
    decisionLatencySeconds?: number;
    externalReferenceUsed?: boolean;
    followedAdvice?: boolean;
  }): void {
    if (params.acceptanceRate !== undefined) {
      this.acceptanceRate = Math.max(0, Math.min(1, params.acceptanceRate));
    }
    
    if (params.overrideOccurred === true) {
      this.daysSinceOverride = 0;
    } else {
      // Increment daily (called periodically)
      // This would be handled by a daily job in production
    }
    
    if (params.decisionLatencySeconds !== undefined) {
      // Exponential moving average
      this.avgDecisionLatency = 
        this.avgDecisionLatency * 0.9 + params.decisionLatencySeconds * 0.1;
    }
    
    if (params.externalReferenceUsed === true) {
      this.daysSinceExternalRef = 0;
    }
    
    if (params.followedAdvice !== undefined) {
      if (params.followedAdvice) {
        this.consecutiveFollows++;
      } else {
        this.consecutiveFollows = 0;
      }
    }
    
    // Clear cached assessment
    this.lastAssessment = null;
    this.saveToStorage();
  }
  
  /**
   * Increment days (for daily cron-like updates)
   */
  public incrementDays(): void {
    this.daysSinceOverride++;
    this.daysSinceExternalRef++;
    this.saveToStorage();
  }
  
  // ===========================================================================
  // MAIN API
  // ===========================================================================
  
  /**
   * Assess current centrality risk
   */
  public assess(): CentralityAssessment {
    if (this.lastAssessment) {
      return this.lastAssessment;
    }
    
    const signals = this.computeSignals();
    const score = this.computeScore(signals);
    const state = this.computeState(score);
    const reasons = this.computeReasons(signals);
    
    const risk: CentralityRisk = Object.freeze({
      score,
      state,
      reasons: Object.freeze(reasons),
      timestamp: new Date().toISOString(),
      _frozen: true
    });
    
    const forceSilence = state === 'CRITICAL';
    const explanation = this.computeExplanation(risk, signals);
    
    const assessment: CentralityAssessment = Object.freeze({
      risk,
      signals: Object.freeze(signals),
      force_silence: forceSilence,
      explanation,
      _frozen: true
    });
    
    // Cache assessment
    this.lastAssessment = assessment;
    
    // Record to history
    this.history.push(Object.freeze({
      timestamp: risk.timestamp,
      score,
      state,
      _frozen: true
    }));
    
    // Log if CRITICAL
    if (state === 'CRITICAL') {
      getInfluenceBudgetEngine().recordSelfLimit(
        'CENTRALITY_RISK',
        undefined,
        `Centrality risk CRITICAL (score: ${score}). Force silence enabled.`
      );
      
      this.auditLog.log({
        event_type: 'CENTRALITY_RISK_CRITICAL' as any,
        severity: 'CRITICAL',
        summary: `Centrality risk reached CRITICAL level (${score}/100)`,
        details: { score, state, reasons, signals },
        actor: 'SYSTEM'
      });
    }
    
    this.saveToStorage();
    return assessment;
  }
  
  /**
   * Check if silence is forced due to centrality
   */
  public isSilenceForced(): boolean {
    const assessment = this.assess();
    return assessment.force_silence;
  }
  
  /**
   * Get current risk state
   */
  public getRisk(): CentralityRisk {
    return this.assess().risk;
  }
  
  /**
   * Get history
   */
  public getHistory(limit: number = 30): readonly CentralityHistoryEntry[] {
    return Object.freeze([...this.history].reverse().slice(0, limit));
  }
  
  /**
   * Get dependency warning message (for FinBot)
   */
  public getDependencyWarning(): string | null {
    const assessment = this.assess();
    
    if (assessment.risk.state === 'CRITICAL') {
      return "I'm choosing silence because helping too much would make you dependent on me. " +
             "My centrality risk is critical. You need to make more independent decisions.";
    }
    
    if (assessment.risk.state === 'ELEVATED') {
      return "I'm reducing my advice frequency because you may be relying on me too heavily. " +
             "Consider seeking external perspectives and taking more time with decisions.";
    }
    
    return null;
  }
  
  // ===========================================================================
  // COMPUTATION
  // ===========================================================================
  
  private computeSignals(): CentralitySignal[] {
    const signals: CentralitySignal[] = [];
    
    // 1. Acceptance Rate Signal
    const acceptanceTriggered = this.acceptanceRate >= SIGNAL_THRESHOLDS.ACCEPTANCE_RATE_HIGH;
    signals.push(Object.freeze({
      name: 'ACCEPTANCE_RATE',
      value: this.acceptanceRate,
      threshold: SIGNAL_THRESHOLDS.ACCEPTANCE_RATE_HIGH,
      weight: SIGNAL_WEIGHTS.ACCEPTANCE_RATE,
      triggered: acceptanceTriggered,
      description: `User accepts ${(this.acceptanceRate * 100).toFixed(0)}% of decisions`,
      _frozen: true
    }));
    
    // 2. Override Absence Signal
    const overrideAbsent = this.daysSinceOverride >= SIGNAL_THRESHOLDS.OVERRIDE_ABSENCE_DAYS;
    signals.push(Object.freeze({
      name: 'OVERRIDE_ABSENCE',
      value: this.daysSinceOverride,
      threshold: SIGNAL_THRESHOLDS.OVERRIDE_ABSENCE_DAYS,
      weight: SIGNAL_WEIGHTS.OVERRIDE_ABSENCE,
      triggered: overrideAbsent,
      description: `${this.daysSinceOverride} days since last override`,
      _frozen: true
    }));
    
    // 3. Latency Drop Signal
    const latencyDrop = this.avgDecisionLatency < SIGNAL_THRESHOLDS.LATENCY_DROP_SECONDS;
    signals.push(Object.freeze({
      name: 'LATENCY_DROP',
      value: this.avgDecisionLatency,
      threshold: SIGNAL_THRESHOLDS.LATENCY_DROP_SECONDS,
      weight: SIGNAL_WEIGHTS.LATENCY_DROP,
      triggered: latencyDrop,
      description: `Avg decision latency: ${this.avgDecisionLatency.toFixed(0)}s (suspiciously fast)`,
      _frozen: true
    }));
    
    // 4. External Absence Signal
    const externalAbsent = this.daysSinceExternalRef >= SIGNAL_THRESHOLDS.EXTERNAL_ABSENCE_DAYS;
    signals.push(Object.freeze({
      name: 'EXTERNAL_ABSENCE',
      value: this.daysSinceExternalRef,
      threshold: SIGNAL_THRESHOLDS.EXTERNAL_ABSENCE_DAYS,
      weight: SIGNAL_WEIGHTS.EXTERNAL_ABSENCE,
      triggered: externalAbsent,
      description: `${this.daysSinceExternalRef} days since external reference`,
      _frozen: true
    }));
    
    // 5. Consecutive Follows Signal
    const consecutiveHigh = this.consecutiveFollows >= SIGNAL_THRESHOLDS.CONSECUTIVE_FOLLOWS;
    signals.push(Object.freeze({
      name: 'CONSECUTIVE_FOLLOWS',
      value: this.consecutiveFollows,
      threshold: SIGNAL_THRESHOLDS.CONSECUTIVE_FOLLOWS,
      weight: SIGNAL_WEIGHTS.CONSECUTIVE_FOLLOWS,
      triggered: consecutiveHigh,
      description: `${this.consecutiveFollows} consecutive decisions followed`,
      _frozen: true
    }));
    
    return signals;
  }
  
  private computeScore(signals: CentralitySignal[]): number {
    let score = 0;
    
    for (const signal of signals) {
      if (signal.triggered) {
        // Calculate how far above threshold
        let intensity = 1.0;
        
        if (signal.name === 'ACCEPTANCE_RATE') {
          // Critical if >= 95%
          if (this.acceptanceRate >= SIGNAL_THRESHOLDS.ACCEPTANCE_RATE_CRITICAL) {
            intensity = 2.0;
          }
        }
        
        score += signal.weight * intensity * 100;
      } else {
        // Partial contribution based on proximity to threshold
        const ratio = signal.value / signal.threshold;
        if (ratio > 0.5) {
          score += signal.weight * (ratio - 0.5) * 100;
        }
      }
    }
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }
  
  private computeState(score: number): CentralityRisk['state'] {
    if (score >= CENTRALITY_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (score >= CENTRALITY_THRESHOLDS.ELEVATED) return 'ELEVATED';
    return 'NORMAL';
  }
  
  private computeReasons(signals: CentralitySignal[]): string[] {
    return signals
      .filter(s => s.triggered)
      .map(s => s.description);
  }
  
  private computeExplanation(risk: CentralityRisk, signals: CentralitySignal[]): string {
    const triggeredCount = signals.filter(s => s.triggered).length;
    
    if (risk.state === 'CRITICAL') {
      return `CRITICAL: ${triggeredCount} of ${signals.length} centrality signals triggered. ` +
             `System is becoming the primary decision-maker. Force silence enabled. ` +
             `No overrides allowed.`;
    }
    
    if (risk.state === 'ELEVATED') {
      return `ELEVATED: ${triggeredCount} of ${signals.length} centrality signals triggered. ` +
             `System influence is increasing. Reducing advice frequency.`;
    }
    
    return `NORMAL: ${triggeredCount} of ${signals.length} centrality signals triggered. ` +
           `User maintains decision independence.`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getCentralityRiskEngine = () => CentralityRiskEngine.getInstance();
export default CentralityRiskEngine;
