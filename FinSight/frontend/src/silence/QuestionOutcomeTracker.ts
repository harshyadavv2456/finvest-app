/**
 * QuestionOutcomeTracker - Track Question Effectiveness
 * 
 * PHASE 29: Selective Silence & Question-First Mode (QFM)
 * 
 * PURPOSE:
 * Track whether questions were effective.
 * 
 * TRACKS:
 * - Was the question answered?
 * - Did it reduce conviction gap?
 * - Did it lead to later adoption?
 * - Did it reduce regret?
 * 
 * NOTE:
 * This feeds back into Adoption & Trust — NOT confidence.
 * (Per Phase 28 rule: governed confidence never fed back)
 */

import { NeutralQuestion } from './NeutralQuestionGenerator';
import { BlockingFactor } from './QuestionFirstGovernor';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * QuestionOutcome - What happened after a question was asked
 */
export interface QuestionOutcome {
  readonly id: string;
  readonly question_id: string;
  readonly snapshot_id?: string;
  readonly blocking_factor: BlockingFactor;
  
  // Answer tracking
  readonly was_answered: boolean;
  readonly answer_text?: string;
  readonly answer_received_at?: string;
  readonly time_to_answer_seconds?: number;
  
  // Effectiveness metrics
  readonly conviction_gap_before?: number;
  readonly conviction_gap_after?: number;
  readonly conviction_gap_reduced: boolean;
  
  readonly led_to_adoption: boolean;
  readonly adoption_timestamp?: string;
  
  readonly regret_before?: number;
  readonly regret_after?: number;
  readonly regret_reduced: boolean;
  
  // Computed effectiveness
  readonly effectiveness_score: number;  // 0-100
  readonly outcome_classification: 'EFFECTIVE' | 'NEUTRAL' | 'INEFFECTIVE';
  
  readonly created_at: string;
  readonly _frozen: true;
}

/**
 * QuestionEffectivenessStats - Aggregate statistics
 */
export interface QuestionEffectivenessStats {
  readonly total_questions: number;
  readonly answered: number;
  readonly unanswered: number;
  readonly answer_rate: number;
  readonly avg_time_to_answer_seconds: number;
  readonly conviction_gap_reduced_count: number;
  readonly led_to_adoption_count: number;
  readonly regret_reduced_count: number;
  readonly avg_effectiveness_score: number;
  readonly by_blocking_factor: Record<BlockingFactor, {
    count: number;
    effectiveness: number;
    answer_rate: number;
  }>;
}

// =============================================================================
// QUESTION OUTCOME TRACKER
// =============================================================================

export class QuestionOutcomeTracker {
  private static instance: QuestionOutcomeTracker;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Outcomes storage
  private outcomes: Map<string, QuestionOutcome> = new Map();
  
  // Pending questions (awaiting answer)
  private pendingQuestions: Map<string, {
    question: NeutralQuestion;
    asked_at: number;
    snapshot_id?: string;
  }> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): QuestionOutcomeTracker {
    if (!QuestionOutcomeTracker.instance) {
      QuestionOutcomeTracker.instance = new QuestionOutcomeTracker();
    }
    return QuestionOutcomeTracker.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_question_outcomes');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, outcome] of Object.entries(parsed.outcomes || {})) {
          this.outcomes.set(id, Object.freeze(outcome as QuestionOutcome));
        }
        for (const [id, pending] of Object.entries(parsed.pending || {})) {
          this.pendingQuestions.set(id, pending as any);
        }
      }
    } catch (e) {
      console.error('Failed to load question outcomes:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const outcomesObj: Record<string, QuestionOutcome> = {};
      for (const [id, outcome] of this.outcomes) {
        outcomesObj[id] = outcome;
      }
      
      const pendingObj: Record<string, any> = {};
      for (const [id, pending] of this.pendingQuestions) {
        pendingObj[id] = pending;
      }
      
      localStorage.setItem('finvest_question_outcomes', JSON.stringify({
        outcomes: outcomesObj,
        pending: pendingObj
      }));
    } catch (e) {
      console.error('Failed to save question outcomes:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Record that a question was asked
   */
  public recordQuestionAsked(
    question: NeutralQuestion,
    snapshotId?: string
  ): void {
    this.pendingQuestions.set(question.id, {
      question,
      asked_at: Date.now(),
      snapshot_id: snapshotId
    });
    
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Question asked: ${question.blocking_factor}`,
      details: {
        question_id: question.id,
        question: question.question,
        blocking_factor: question.blocking_factor,
        snapshot_id: snapshotId
      },
      actor: 'ENGINE'
    });
  }
  
  /**
   * Record that a question was answered
   */
  public recordQuestionAnswered(
    questionId: string,
    answerText: string,
    convictionGapBefore?: number,
    convictionGapAfter?: number
  ): QuestionOutcome {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      throw new Error(`TRACKER_ERROR: Question ${questionId} not found in pending`);
    }
    
    const timeToAnswer = Math.floor((Date.now() - pending.asked_at) / 1000);
    const convictionGapReduced = convictionGapBefore !== undefined && 
                                  convictionGapAfter !== undefined &&
                                  convictionGapAfter < convictionGapBefore;
    
    // Calculate initial effectiveness (will be updated later with adoption/regret)
    const effectiveness = this.calculateEffectiveness(
      true, // was answered
      convictionGapReduced,
      false, // led to adoption (unknown yet)
      false, // regret reduced (unknown yet)
      timeToAnswer
    );
    
    const outcome: QuestionOutcome = Object.freeze({
      id: `OUTCOME-${questionId}`,
      question_id: questionId,
      snapshot_id: pending.snapshot_id,
      blocking_factor: pending.question.blocking_factor,
      was_answered: true,
      answer_text: answerText,
      answer_received_at: new Date().toISOString(),
      time_to_answer_seconds: timeToAnswer,
      conviction_gap_before: convictionGapBefore,
      conviction_gap_after: convictionGapAfter,
      conviction_gap_reduced: convictionGapReduced,
      led_to_adoption: false, // Will be updated
      regret_before: undefined,
      regret_after: undefined,
      regret_reduced: false, // Will be updated
      effectiveness_score: effectiveness,
      outcome_classification: this.classifyEffectiveness(effectiveness),
      created_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.outcomes.set(outcome.id, outcome);
    this.pendingQuestions.delete(questionId);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Question answered: ${outcome.blocking_factor}`,
      details: {
        outcome_id: outcome.id,
        question_id: questionId,
        time_to_answer: timeToAnswer,
        conviction_gap_reduced: convictionGapReduced,
        effectiveness: effectiveness
      },
      actor: 'USER'
    });
    
    return outcome;
  }
  
  /**
   * Record that question was not answered (timeout or skip)
   */
  public recordQuestionUnanswered(questionId: string): QuestionOutcome {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      throw new Error(`TRACKER_ERROR: Question ${questionId} not found in pending`);
    }
    
    const outcome: QuestionOutcome = Object.freeze({
      id: `OUTCOME-${questionId}`,
      question_id: questionId,
      snapshot_id: pending.snapshot_id,
      blocking_factor: pending.question.blocking_factor,
      was_answered: false,
      conviction_gap_reduced: false,
      led_to_adoption: false,
      regret_reduced: false,
      effectiveness_score: 0,
      outcome_classification: 'INEFFECTIVE' as const,
      created_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.outcomes.set(outcome.id, outcome);
    this.pendingQuestions.delete(questionId);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'WARNING',
      summary: `Question unanswered: ${outcome.blocking_factor}`,
      details: {
        outcome_id: outcome.id,
        question_id: questionId
      },
      actor: 'ENGINE'
    });
    
    return outcome;
  }
  
  /**
   * Update outcome with adoption data (called later when adoption happens)
   */
  public recordAdoptionAfterQuestion(
    outcomeId: string,
    regretBefore?: number,
    regretAfter?: number
  ): QuestionOutcome {
    const existing = this.outcomes.get(outcomeId);
    if (!existing) {
      throw new Error(`TRACKER_ERROR: Outcome ${outcomeId} not found`);
    }
    
    const regretReduced = regretBefore !== undefined &&
                          regretAfter !== undefined &&
                          regretAfter < regretBefore;
    
    // Recalculate effectiveness with adoption data
    const effectiveness = this.calculateEffectiveness(
      existing.was_answered,
      existing.conviction_gap_reduced,
      true, // led to adoption
      regretReduced,
      existing.time_to_answer_seconds
    );
    
    // Create new frozen outcome (immutable)
    const updated: QuestionOutcome = Object.freeze({
      ...existing,
      id: existing.id,
      led_to_adoption: true,
      adoption_timestamp: new Date().toISOString(),
      regret_before: regretBefore,
      regret_after: regretAfter,
      regret_reduced: regretReduced,
      effectiveness_score: effectiveness,
      outcome_classification: this.classifyEffectiveness(effectiveness),
      _frozen: true
    });
    
    this.outcomes.set(outcomeId, updated);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Adoption recorded after question`,
      details: {
        outcome_id: outcomeId,
        led_to_adoption: true,
        regret_reduced: regretReduced,
        effectiveness: effectiveness
      },
      actor: 'ENGINE'
    });
    
    return updated;
  }
  
  // ===========================================================================
  // EFFECTIVENESS CALCULATION
  // ===========================================================================
  
  private calculateEffectiveness(
    wasAnswered: boolean,
    convictionGapReduced: boolean,
    ledToAdoption: boolean,
    regretReduced: boolean,
    timeToAnswerSeconds?: number
  ): number {
    if (!wasAnswered) return 0;
    
    let score = 25; // Base score for being answered
    
    // Conviction gap reduction (+25)
    if (convictionGapReduced) score += 25;
    
    // Led to adoption (+30)
    if (ledToAdoption) score += 30;
    
    // Regret reduced (+20)
    if (regretReduced) score += 20;
    
    // Time penalty (slower = less effective)
    if (timeToAnswerSeconds !== undefined) {
      if (timeToAnswerSeconds < 30) {
        // Quick answer - no penalty
      } else if (timeToAnswerSeconds < 120) {
        score -= 5; // Moderate delay
      } else {
        score -= 10; // Long delay
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  private classifyEffectiveness(score: number): QuestionOutcome['outcome_classification'] {
    if (score >= 60) return 'EFFECTIVE';
    if (score >= 30) return 'NEUTRAL';
    return 'INEFFECTIVE';
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get all outcomes
   */
  public getAllOutcomes(): QuestionOutcome[] {
    return Array.from(this.outcomes.values());
  }
  
  /**
   * Get outcome by question ID
   */
  public getOutcomeForQuestion(questionId: string): QuestionOutcome | null {
    return this.outcomes.get(`OUTCOME-${questionId}`) || null;
  }
  
  /**
   * Get pending questions
   */
  public getPendingQuestions(): NeutralQuestion[] {
    return Array.from(this.pendingQuestions.values()).map(p => p.question);
  }
  
  /**
   * Get statistics
   */
  public getStats(): QuestionEffectivenessStats {
    const outcomes = this.getAllOutcomes();
    
    if (outcomes.length === 0) {
      return {
        total_questions: 0,
        answered: 0,
        unanswered: 0,
        answer_rate: 0,
        avg_time_to_answer_seconds: 0,
        conviction_gap_reduced_count: 0,
        led_to_adoption_count: 0,
        regret_reduced_count: 0,
        avg_effectiveness_score: 0,
        by_blocking_factor: {} as any
      };
    }
    
    const answered = outcomes.filter(o => o.was_answered);
    const answerTimes = answered
      .filter(o => o.time_to_answer_seconds !== undefined)
      .map(o => o.time_to_answer_seconds!);
    
    const byFactor: Record<BlockingFactor, { count: number; effectiveness: number; answer_rate: number }> = {} as any;
    
    for (const outcome of outcomes) {
      const factor = outcome.blocking_factor;
      if (!byFactor[factor]) {
        byFactor[factor] = { count: 0, effectiveness: 0, answer_rate: 0 };
      }
      byFactor[factor].count++;
      byFactor[factor].effectiveness += outcome.effectiveness_score;
      if (outcome.was_answered) {
        byFactor[factor].answer_rate++;
      }
    }
    
    // Compute averages
    for (const factor of Object.keys(byFactor) as BlockingFactor[]) {
      if (byFactor[factor].count > 0) {
        byFactor[factor].effectiveness /= byFactor[factor].count;
        byFactor[factor].answer_rate /= byFactor[factor].count;
      }
    }
    
    return {
      total_questions: outcomes.length,
      answered: answered.length,
      unanswered: outcomes.length - answered.length,
      answer_rate: answered.length / outcomes.length,
      avg_time_to_answer_seconds: answerTimes.length > 0
        ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length
        : 0,
      conviction_gap_reduced_count: outcomes.filter(o => o.conviction_gap_reduced).length,
      led_to_adoption_count: outcomes.filter(o => o.led_to_adoption).length,
      regret_reduced_count: outcomes.filter(o => o.regret_reduced).length,
      avg_effectiveness_score: outcomes.reduce((sum, o) => sum + o.effectiveness_score, 0) / outcomes.length,
      by_blocking_factor: byFactor
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getQuestionOutcomeTracker = () => QuestionOutcomeTracker.getInstance();
export default QuestionOutcomeTracker;

