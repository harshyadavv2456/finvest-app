/**
 * FinBotQuestionMode - Question-First Response Override
 * 
 * PHASE 29: Selective Silence & Question-First Mode (QFM)
 * 
 * PURPOSE:
 * Override all FinBot responses when gate triggers.
 * 
 * BEHAVIOR:
 * - QUESTION_REQUIRED → ask ONE question
 * - SILENCE_REQUIRED → explicit silence statement
 * - No workaround paths
 * 
 * FORBIDDEN:
 * - Combining question + advice
 * - "Just one more clarification..." loops
 * - Empty silence (must be explicit)
 */

import { 
  getQuestionFirstGovernor, 
  QuestionGate, 
  QuestionGateMode,
  GateContext,
  BlockingFactor
} from './QuestionFirstGovernor';
import { 
  getNeutralQuestionGenerator, 
  NeutralQuestion 
} from './NeutralQuestionGenerator';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * QuestionModeResponse - The response when question mode is active
 */
export interface QuestionModeResponse {
  readonly mode: QuestionGateMode;
  readonly original_intended_response: string;
  readonly actual_response: string;
  readonly question?: NeutralQuestion;
  readonly silence_message?: string;
  readonly advice_blocked: boolean;
  readonly reason: string;
  readonly _frozen: true;
}

/**
 * SilenceResponse - The explicit silence message
 */
export interface SilenceResponse {
  readonly message: string;
  readonly reason: string;
  readonly blocking_factors: BlockingFactor[];
  readonly _frozen: true;
}

// =============================================================================
// SILENCE MESSAGES
// =============================================================================

/**
 * Explicit silence messages - never empty, always explanatory
 */
const SILENCE_MESSAGES = Object.freeze({
  default: "I don't have enough clarity to advise right now.",
  
  cognitive_overload: 
    "I notice you may be experiencing information overload. " +
    "I'll wait until you have more capacity to process new recommendations.",
  
  repeated_ignores: 
    "I've noticed my recent recommendations haven't been helpful. " +
    "I'll step back and give you space.",
  
  high_conviction_gap: 
    "There's a significant gap between my analysis and your actions. " +
    "I need to understand your perspective better before offering more advice.",
  
  combined_factors:
    "Multiple factors suggest I should not offer advice at this time. " +
    "I'll remain available when conditions improve."
});

// =============================================================================
// FINBOT QUESTION MODE
// =============================================================================

export class FinBotQuestionMode {
  private static instance: FinBotQuestionMode;
  private governor = getQuestionFirstGovernor();
  private questionGenerator = getNeutralQuestionGenerator();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Track active question (only ONE at a time)
  private activeQuestion: NeutralQuestion | null = null;
  private questionAskedCount: Map<string, number> = new Map(); // snapshotId -> count
  
  private constructor() {}
  
  public static getInstance(): FinBotQuestionMode {
    if (!FinBotQuestionMode.instance) {
      FinBotQuestionMode.instance = new FinBotQuestionMode();
    }
    return FinBotQuestionMode.instance;
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Process a FinBot response through question mode
   * This is the main entry point
   */
  public processResponse(
    intendedResponse: string,
    context: GateContext,
    snapshotId?: string,
    userId: string = 'default'
  ): QuestionModeResponse {
    // Evaluate gate
    const gate = this.governor.evaluateGate(context, snapshotId);
    
    // If advice allowed, pass through
    if (gate.mode === 'ADVICE_ALLOWED') {
      return this.createAllowedResponse(intendedResponse);
    }
    
    // Check for question loops
    if (snapshotId) {
      const count = this.questionAskedCount.get(snapshotId) || 0;
      if (count >= 1) {
        // Already asked ONE question for this snapshot - must silence
        return this.createSilenceResponse(intendedResponse, gate, 'question_limit_reached');
      }
    }
    
    // Handle based on mode
    if (gate.mode === 'SILENCE_REQUIRED') {
      return this.createSilenceResponse(intendedResponse, gate);
    }
    
    // QUESTION_REQUIRED - generate ONE question
    return this.createQuestionResponse(intendedResponse, gate, userId, snapshotId);
  }
  
  /**
   * Check if advice is currently allowed (convenience method)
   */
  public isAdviceAllowed(context: GateContext): boolean {
    return this.governor.isAdviceAllowed(context);
  }
  
  /**
   * Record that a question has been answered
   */
  public recordQuestionAnswered(snapshotId: string): void {
    this.activeQuestion = null;
    // Don't reset count - still only ONE question per snapshot
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: 'Question answered',
      details: { snapshot_id: snapshotId },
      actor: 'USER'
    });
  }
  
  // ===========================================================================
  // RESPONSE BUILDERS
  // ===========================================================================
  
  private createAllowedResponse(intendedResponse: string): QuestionModeResponse {
    return Object.freeze({
      mode: 'ADVICE_ALLOWED' as const,
      original_intended_response: intendedResponse,
      actual_response: intendedResponse,
      advice_blocked: false,
      reason: 'Advice is permitted',
      _frozen: true
    });
  }
  
  private createSilenceResponse(
    intendedResponse: string,
    gate: QuestionGate,
    extraReason?: string
  ): QuestionModeResponse {
    // Build silence message
    const silence = this.buildSilenceMessage(gate.blocking_factors, extraReason);
    
    // Audit
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'WARNING',
      summary: 'Silence response generated',
      details: {
        mode: 'SILENCE_REQUIRED',
        reason: gate.reason,
        blocking_factors: gate.blocking_factors,
        extra_reason: extraReason
      },
      actor: 'FINBOT'
    });
    
    return Object.freeze({
      mode: 'SILENCE_REQUIRED' as const,
      original_intended_response: intendedResponse,
      actual_response: silence.message,
      silence_message: silence.message,
      advice_blocked: true,
      reason: silence.reason,
      _frozen: true
    });
  }
  
  private createQuestionResponse(
    intendedResponse: string,
    gate: QuestionGate,
    userId: string,
    snapshotId?: string
  ): QuestionModeResponse {
    // Generate question
    const question = this.questionGenerator.generateQuestion(gate, userId);
    
    if (!question) {
      // Fallback to silence if question generation fails
      return this.createSilenceResponse(intendedResponse, gate, 'question_generation_failed');
    }
    
    // Store active question
    this.activeQuestion = question;
    
    // Increment count for snapshot
    if (snapshotId) {
      const current = this.questionAskedCount.get(snapshotId) || 0;
      this.questionAskedCount.set(snapshotId, current + 1);
    }
    
    // Build response with question
    const actualResponse = this.formatQuestionResponse(question);
    
    // Audit
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: 'Question response generated',
      details: {
        mode: 'QUESTION_REQUIRED',
        question_id: question.id,
        question: question.question,
        reason: question.reason_for_asking,
        snapshot_id: snapshotId
      },
      actor: 'FINBOT'
    });
    
    return Object.freeze({
      mode: 'QUESTION_REQUIRED' as const,
      original_intended_response: intendedResponse,
      actual_response: actualResponse,
      question,
      advice_blocked: true,
      reason: question.reason_for_asking,
      _frozen: true
    });
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private buildSilenceMessage(
    factors: BlockingFactor[],
    extraReason?: string
  ): SilenceResponse {
    let message: string;
    let reason: string;
    
    if (extraReason === 'question_limit_reached') {
      message = SILENCE_MESSAGES.default;
      reason = 'Already asked one question for this decision';
    } else if (factors.includes('COGNITIVE_OVERLOAD')) {
      message = SILENCE_MESSAGES.cognitive_overload;
      reason = 'User cognitive load is high';
    } else if (factors.includes('REPEATED_IGNORES')) {
      message = SILENCE_MESSAGES.repeated_ignores;
      reason = 'User has repeatedly ignored recommendations';
    } else if (factors.includes('HIGH_CONVICTION_GAP')) {
      message = SILENCE_MESSAGES.high_conviction_gap;
      reason = 'Conviction gap is too high';
    } else if (factors.length > 1) {
      message = SILENCE_MESSAGES.combined_factors;
      reason = 'Multiple blocking factors present';
    } else {
      message = SILENCE_MESSAGES.default;
      reason = 'Insufficient clarity for advice';
    }
    
    return Object.freeze({
      message,
      reason,
      blocking_factors: factors,
      _frozen: true
    });
  }
  
  private formatQuestionResponse(question: NeutralQuestion): string {
    return `Before I can provide advice, I need to understand something:\n\n` +
           `${question.question}\n\n` +
           `(This question is being asked because: ${question.reason_for_asking})`;
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get the currently active question (if any)
   */
  public getActiveQuestion(): NeutralQuestion | null {
    return this.activeQuestion;
  }
  
  /**
   * Check if there's an unanswered question for a snapshot
   */
  public hasUnansweredQuestion(snapshotId: string): boolean {
    const count = this.questionAskedCount.get(snapshotId) || 0;
    return count > 0 && this.activeQuestion !== null;
  }
  
  /**
   * Get question count for snapshot
   */
  public getQuestionCount(snapshotId: string): number {
    return this.questionAskedCount.get(snapshotId) || 0;
  }
  
  /**
   * Check if question limit reached for snapshot
   */
  public isQuestionLimitReached(snapshotId: string): boolean {
    return this.getQuestionCount(snapshotId) >= 1;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotQuestionMode = () => FinBotQuestionMode.getInstance();
export default FinBotQuestionMode;

