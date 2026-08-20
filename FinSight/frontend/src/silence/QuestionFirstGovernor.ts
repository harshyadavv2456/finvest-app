/**
 * QuestionFirstGovernor - Determines When FinVest May Advise
 * 
 * PHASE 29: Selective Silence & Question-First Mode (QFM)
 * 
 * PURPOSE:
 * Determine whether FinVest is allowed to advise or must ask instead.
 * The most dangerous system is one that always has an answer.
 * 
 * RULES:
 * - MUTED confidence → QUESTION_REQUIRED
 * - Conviction gap ≥ HIGH → QUESTION_REQUIRED
 * - Cognitive load ≥ 80 → SILENCE_REQUIRED
 * - Repeated ignore streak → QUESTION_REQUIRED
 * 
 * FORBIDDEN:
 * - Advice when gate ≠ ADVICE_ALLOWED
 * - "Soft advice" disguised as questions
 */

import { getConfidenceGovernor, GovernedConfidence } from '../governance/ConfidenceGovernor';
import { DisciplineState } from '../governance/ConfidenceDisciplinePolicy';
import { getConvictionGap, ConvictionAnalysis } from '../adoption/ConvictionGap';
import { getAdoptionScore, AdoptionScore } from '../adoption/AdoptionScore';
import { getCognitiveLoad, CognitiveLoadProfile } from '../shaping/CognitiveLoad';
import { UserPolicy, userPolicy } from '../policy/UserPolicy';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * QuestionGateMode - What FinVest is allowed to do
 */
export type QuestionGateMode = 'ADVICE_ALLOWED' | 'QUESTION_REQUIRED' | 'SILENCE_REQUIRED';

/**
 * BlockingFactor - Why advice is blocked
 */
export type BlockingFactor = 
  | 'MUTED_CONFIDENCE'
  | 'HIGH_CONVICTION_GAP'
  | 'COGNITIVE_OVERLOAD'
  | 'REPEATED_IGNORES'
  | 'LOW_ADOPTION_SCORE'
  | 'RESTRAINED_CONFIDENCE'
  | 'USER_POLICY_BLOCK'
  | 'INSUFFICIENT_DATA';

/**
 * QuestionGate - The gate decision
 */
export interface QuestionGate {
  readonly mode: QuestionGateMode;
  readonly reason: string;
  readonly blocking_factors: BlockingFactor[];
  readonly severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly snapshot_id?: string;
  readonly computed_at: string;
  readonly _frozen: true;
}

/**
 * GateContext - Input context for gate decision
 */
export interface GateContext {
  governed_confidence?: GovernedConfidence;
  conviction_gap?: ConvictionAnalysis;
  adoption_score?: AdoptionScore;
  cognitive_load?: CognitiveLoadProfile;
  user_policy?: UserPolicy;
  recent_ignores?: number;
}

// =============================================================================
// THRESHOLDS (IMMUTABLE)
// =============================================================================

export const QUESTION_GATE_THRESHOLDS = Object.freeze({
  // Confidence thresholds
  muted_confidence_triggers_question: true,
  restrained_confidence_triggers_question: false,  // Only MUTED triggers
  
  // Conviction gap thresholds
  conviction_gap_high_threshold: 30,      // Gap >= 30 = QUESTION_REQUIRED
  conviction_gap_critical_threshold: 50,  // Gap >= 50 = SILENCE_REQUIRED
  
  // Cognitive load thresholds
  cognitive_load_question_threshold: 70,  // Load >= 70 = QUESTION_REQUIRED
  cognitive_load_silence_threshold: 85,   // Load >= 85 = SILENCE_REQUIRED
  
  // Adoption thresholds
  adoption_score_low_threshold: 30,       // Score < 30 = QUESTION_REQUIRED
  
  // Ignore streak thresholds
  ignore_streak_question_threshold: 3,    // 3+ ignores = QUESTION_REQUIRED
  ignore_streak_silence_threshold: 5,     // 5+ ignores = SILENCE_REQUIRED
});

// =============================================================================
// QUESTION FIRST GOVERNOR
// =============================================================================

export class QuestionFirstGovernor {
  private static instance: QuestionFirstGovernor;
  private confidenceGovernor = getConfidenceGovernor();
  private auditLog = DecisionAuditLog.getInstance();
  private thresholds = QUESTION_GATE_THRESHOLDS;
  
  // Gate history
  private gateHistory: QuestionGate[] = [];
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): QuestionFirstGovernor {
    if (!QuestionFirstGovernor.instance) {
      QuestionFirstGovernor.instance = new QuestionFirstGovernor();
    }
    return QuestionFirstGovernor.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_question_gate');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.gateHistory = (parsed.history || []).map((g: QuestionGate) => Object.freeze(g));
      }
    } catch (e) {
      console.error('Failed to load question gate history:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('finvest_question_gate', JSON.stringify({
        history: this.gateHistory
      }));
    } catch (e) {
      console.error('Failed to save question gate history:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Evaluate the gate for a given context
   * Returns whether advice is allowed, question required, or silence required
   */
  public evaluateGate(context: GateContext, snapshotId?: string): QuestionGate {
    const blockingFactors: BlockingFactor[] = [];
    let mode: QuestionGateMode = 'ADVICE_ALLOWED';
    let severity: QuestionGate['severity'] = 'NONE';
    
    // Check confidence state
    const confidenceResult = this.checkConfidenceState(context.governed_confidence);
    if (confidenceResult.blocks) {
      blockingFactors.push(...confidenceResult.factors);
      if (confidenceResult.severity === 'CRITICAL') {
        mode = 'SILENCE_REQUIRED';
        severity = 'CRITICAL';
      } else if (mode !== 'SILENCE_REQUIRED') {
        mode = 'QUESTION_REQUIRED';
        severity = this.maxSeverity(severity, confidenceResult.severity);
      }
    }
    
    // Check conviction gap
    const gapResult = this.checkConvictionGap(context.conviction_gap);
    if (gapResult.blocks) {
      blockingFactors.push(...gapResult.factors);
      if (gapResult.severity === 'CRITICAL') {
        mode = 'SILENCE_REQUIRED';
        severity = 'CRITICAL';
      } else if (mode !== 'SILENCE_REQUIRED') {
        mode = 'QUESTION_REQUIRED';
        severity = this.maxSeverity(severity, gapResult.severity);
      }
    }
    
    // Check cognitive load
    const loadResult = this.checkCognitiveLoad(context.cognitive_load);
    if (loadResult.blocks) {
      blockingFactors.push(...loadResult.factors);
      if (loadResult.severity === 'CRITICAL') {
        mode = 'SILENCE_REQUIRED';
        severity = 'CRITICAL';
      } else if (mode !== 'SILENCE_REQUIRED') {
        mode = 'QUESTION_REQUIRED';
        severity = this.maxSeverity(severity, loadResult.severity);
      }
    }
    
    // Check adoption score
    const adoptionResult = this.checkAdoptionScore(context.adoption_score);
    if (adoptionResult.blocks) {
      blockingFactors.push(...adoptionResult.factors);
      if (mode !== 'SILENCE_REQUIRED') {
        mode = 'QUESTION_REQUIRED';
        severity = this.maxSeverity(severity, adoptionResult.severity);
      }
    }
    
    // Check ignore streak
    const ignoreResult = this.checkIgnoreStreak(context.recent_ignores);
    if (ignoreResult.blocks) {
      blockingFactors.push(...ignoreResult.factors);
      if (ignoreResult.severity === 'CRITICAL') {
        mode = 'SILENCE_REQUIRED';
        severity = 'CRITICAL';
      } else if (mode !== 'SILENCE_REQUIRED') {
        mode = 'QUESTION_REQUIRED';
        severity = this.maxSeverity(severity, ignoreResult.severity);
      }
    }
    
    // Build reason
    const reason = this.buildReason(mode, blockingFactors);
    
    // Create frozen gate
    const gate: QuestionGate = Object.freeze({
      mode,
      reason,
      blocking_factors: blockingFactors,
      severity,
      snapshot_id: snapshotId,
      computed_at: new Date().toISOString(),
      _frozen: true
    });
    
    // Record history
    this.gateHistory.push(gate);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: mode === 'ADVICE_ALLOWED' ? 'CONTEXT_CREATED' : 'POLICY_UPDATE',
      severity: mode === 'SILENCE_REQUIRED' ? 'WARNING' : 'INFO',
      summary: `Question gate: ${mode}`,
      details: {
        mode,
        reason,
        blocking_factors: blockingFactors,
        severity,
        snapshot_id: snapshotId
      },
      actor: 'ENGINE'
    });
    
    return gate;
  }
  
  // ===========================================================================
  // CHECKS
  // ===========================================================================
  
  private checkConfidenceState(governed?: GovernedConfidence): {
    blocks: boolean;
    factors: BlockingFactor[];
    severity: QuestionGate['severity'];
  } {
    if (!governed) {
      return { blocks: false, factors: [], severity: 'NONE' };
    }
    
    const factors: BlockingFactor[] = [];
    let severity: QuestionGate['severity'] = 'NONE';
    
    if (governed.discipline_state === 'MUTED') {
      factors.push('MUTED_CONFIDENCE');
      severity = 'HIGH';
    } else if (governed.discipline_state === 'RESTRAINED' && 
               this.thresholds.restrained_confidence_triggers_question) {
      factors.push('RESTRAINED_CONFIDENCE');
      severity = 'MEDIUM';
    }
    
    return {
      blocks: factors.length > 0,
      factors,
      severity
    };
  }
  
  private checkConvictionGap(gap?: ConvictionAnalysis): {
    blocks: boolean;
    factors: BlockingFactor[];
    severity: QuestionGate['severity'];
  } {
    if (!gap) {
      return { blocks: false, factors: [], severity: 'NONE' };
    }
    
    const factors: BlockingFactor[] = [];
    let severity: QuestionGate['severity'] = 'NONE';
    
    if (gap.conviction_gap >= this.thresholds.conviction_gap_critical_threshold) {
      factors.push('HIGH_CONVICTION_GAP');
      severity = 'CRITICAL';
    } else if (gap.conviction_gap >= this.thresholds.conviction_gap_high_threshold) {
      factors.push('HIGH_CONVICTION_GAP');
      severity = 'HIGH';
    }
    
    return {
      blocks: factors.length > 0,
      factors,
      severity
    };
  }
  
  private checkCognitiveLoad(load?: CognitiveLoadProfile): {
    blocks: boolean;
    factors: BlockingFactor[];
    severity: QuestionGate['severity'];
  } {
    if (!load) {
      return { blocks: false, factors: [], severity: 'NONE' };
    }
    
    const factors: BlockingFactor[] = [];
    let severity: QuestionGate['severity'] = 'NONE';
    
    // Calculate effective load
    const effectiveLoad = (load.ignore_rate * 100) + 
                          (load.overload_events * 10);
    
    if (effectiveLoad >= this.thresholds.cognitive_load_silence_threshold) {
      factors.push('COGNITIVE_OVERLOAD');
      severity = 'CRITICAL';
    } else if (effectiveLoad >= this.thresholds.cognitive_load_question_threshold) {
      factors.push('COGNITIVE_OVERLOAD');
      severity = 'HIGH';
    }
    
    return {
      blocks: factors.length > 0,
      factors,
      severity
    };
  }
  
  private checkAdoptionScore(adoption?: AdoptionScore): {
    blocks: boolean;
    factors: BlockingFactor[];
    severity: QuestionGate['severity'];
  } {
    if (!adoption) {
      return { blocks: false, factors: [], severity: 'NONE' };
    }
    
    const factors: BlockingFactor[] = [];
    let severity: QuestionGate['severity'] = 'NONE';
    
    if (adoption.net_adoption_score < this.thresholds.adoption_score_low_threshold) {
      factors.push('LOW_ADOPTION_SCORE');
      severity = 'MEDIUM';
    }
    
    return {
      blocks: factors.length > 0,
      factors,
      severity
    };
  }
  
  private checkIgnoreStreak(ignores?: number): {
    blocks: boolean;
    factors: BlockingFactor[];
    severity: QuestionGate['severity'];
  } {
    if (ignores === undefined || ignores === null) {
      return { blocks: false, factors: [], severity: 'NONE' };
    }
    
    const factors: BlockingFactor[] = [];
    let severity: QuestionGate['severity'] = 'NONE';
    
    if (ignores >= this.thresholds.ignore_streak_silence_threshold) {
      factors.push('REPEATED_IGNORES');
      severity = 'CRITICAL';
    } else if (ignores >= this.thresholds.ignore_streak_question_threshold) {
      factors.push('REPEATED_IGNORES');
      severity = 'HIGH';
    }
    
    return {
      blocks: factors.length > 0,
      factors,
      severity
    };
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private maxSeverity(
    a: QuestionGate['severity'],
    b: QuestionGate['severity']
  ): QuestionGate['severity'] {
    const order: QuestionGate['severity'][] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return order.indexOf(a) > order.indexOf(b) ? a : b;
  }
  
  private buildReason(mode: QuestionGateMode, factors: BlockingFactor[]): string {
    if (mode === 'ADVICE_ALLOWED') {
      return 'Advice is permitted';
    }
    
    if (factors.length === 0) {
      return mode === 'SILENCE_REQUIRED' 
        ? 'Silence required due to system state'
        : 'Question required due to system state';
    }
    
    const factorDescriptions: Record<BlockingFactor, string> = {
      MUTED_CONFIDENCE: 'confidence is muted',
      HIGH_CONVICTION_GAP: 'conviction gap is high',
      COGNITIVE_OVERLOAD: 'cognitive load is too high',
      REPEATED_IGNORES: 'advice has been repeatedly ignored',
      LOW_ADOPTION_SCORE: 'adoption score is low',
      RESTRAINED_CONFIDENCE: 'confidence is restrained',
      USER_POLICY_BLOCK: 'user policy blocks advice',
      INSUFFICIENT_DATA: 'insufficient data available'
    };
    
    const descriptions = factors.map(f => factorDescriptions[f]);
    
    if (mode === 'SILENCE_REQUIRED') {
      return `Silence required: ${descriptions.join(', ')}`;
    }
    
    return `Question required: ${descriptions.join(', ')}`;
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Check if advice is currently allowed
   */
  public isAdviceAllowed(context: GateContext): boolean {
    const gate = this.evaluateGate(context);
    return gate.mode === 'ADVICE_ALLOWED';
  }
  
  /**
   * Get the most recent gate
   */
  public getLastGate(): QuestionGate | null {
    if (this.gateHistory.length === 0) return null;
    return this.gateHistory[this.gateHistory.length - 1];
  }
  
  /**
   * Get all gates
   */
  public getGateHistory(): QuestionGate[] {
    return [...this.gateHistory];
  }
  
  /**
   * Get stats
   */
  public getStats(): {
    total_evaluations: number;
    advice_allowed: number;
    question_required: number;
    silence_required: number;
    most_common_blocker: BlockingFactor | null;
  } {
    const history = this.gateHistory;
    const adviceAllowed = history.filter(g => g.mode === 'ADVICE_ALLOWED').length;
    const questionRequired = history.filter(g => g.mode === 'QUESTION_REQUIRED').length;
    const silenceRequired = history.filter(g => g.mode === 'SILENCE_REQUIRED').length;
    
    // Find most common blocker
    const blockerCounts: Record<string, number> = {};
    for (const gate of history) {
      for (const factor of gate.blocking_factors) {
        blockerCounts[factor] = (blockerCounts[factor] || 0) + 1;
      }
    }
    
    let mostCommon: BlockingFactor | null = null;
    let maxCount = 0;
    for (const [factor, count] of Object.entries(blockerCounts)) {
      if (count > maxCount) {
        mostCommon = factor as BlockingFactor;
        maxCount = count;
      }
    }
    
    return {
      total_evaluations: history.length,
      advice_allowed: adviceAllowed,
      question_required: questionRequired,
      silence_required: silenceRequired,
      most_common_blocker: mostCommon
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getQuestionFirstGovernor = () => QuestionFirstGovernor.getInstance();
export default QuestionFirstGovernor;

