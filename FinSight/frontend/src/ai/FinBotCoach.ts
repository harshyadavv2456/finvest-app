/**
 * FinBotCoach - Decision Coach
 * 
 * PHASE 25: Adaptive Decision Shaping (ADS)
 * 
 * PURPOSE:
 * Guide user through decisions with optimal presentation.
 * 
 * BEHAVIOR:
 * - Select variant via DecisionShaper
 * - Explain why this format is shown
 * - Ask ONE clarification question max
 * - NO persuasion
 * - NO repetition
 */

import { getDecisionShaper, ShapedDecision, PresentationVariant, EmphasisFlag } from '../shaping/DecisionShaper';
import { getCognitiveLoad, CognitiveLoadProfile, SimplificationLevel } from '../shaping/CognitiveLoad';
import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { UserPolicy, getUserPolicyManager } from '../policy/UserPolicy';
import { getDecisionAdoption, RejectionReason } from '../adoption/DecisionAdoption';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * CoachingSession - A coaching interaction
 */
export interface CoachingSession {
  session_id: string;
  started_at: string;
  
  // Decision being coached
  snapshot_id: string;
  output_index: number;
  symbol: string;
  action: string;
  
  // Shaped presentation
  shaped_decision: ShapedDecision;
  
  // Coaching elements
  variant_explanation: string;
  clarification_question: string | null;
  format_reason: string;
  
  // User state
  cognitive_profile: CognitiveLoadProfile;
  simplification_level: SimplificationLevel;
  
  // Interaction tracking
  question_asked: boolean;
  user_responded: boolean;
  
  // Audit
  audit_log_id: string;
}

/**
 * CoachingResponse - Response to user
 */
export interface CoachingResponse {
  session_id: string;
  
  // Main content
  headline: string;
  explanation_bullets: string[];
  key_metrics: Array<{ name: string; value: string | number; emphasized: boolean }>;
  
  // Coaching meta
  why_this_format: string;
  clarification_question: string | null;
  
  // Actions
  primary_action: string;
  alternative_action?: string;
  
  // Status
  is_simplified: boolean;
  simplification_reason?: string;
}

/**
 * UserResponse - User's response to coaching question
 */
export interface UserResponse {
  session_id: string;
  response_type: 'ANSWER' | 'SKIP' | 'CONFUSED' | 'NOT_NOW';
  answer?: string;
  follow_up_needed: boolean;
}

// =============================================================================
// FINBOT COACH
// =============================================================================

export class FinBotCoach {
  private static instance: FinBotCoach;
  private shaper = getDecisionShaper();
  private cognitiveLoad = getCognitiveLoad();
  private adoption = getDecisionAdoption();
  private policyManager = getUserPolicyManager();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Active sessions
  private sessions: Map<string, CoachingSession> = new Map();
  
  // Track questions asked (to prevent repetition)
  private questionsAskedPerSymbol: Map<string, string[]> = new Map();
  
  private constructor() {}
  
  public static getInstance(): FinBotCoach {
    if (!FinBotCoach.instance) {
      FinBotCoach.instance = new FinBotCoach();
    }
    return FinBotCoach.instance;
  }
  
  // ===========================================================================
  // MAIN COACHING API
  // ===========================================================================
  
  /**
   * Start a coaching session for a decision
   */
  public startSession(
    snapshot: DecisionSnapshot,
    outputIndex: number,
    userId: string = 'default'
  ): CoachingSession {
    const output = snapshot.outputs[outputIndex];
    if (!output) {
      throw new Error(`Output at index ${outputIndex} not found`);
    }
    
    // Get user policy
    const userPolicy = this.policyManager.getActivePolicy() || this.policyManager.createOrUpdatePolicy({
      risk_tolerance: 'MEDIUM',
      tax_preference: 'NEUTRAL',
      holding_bias: 'NEUTRAL',
      max_drawdown_allowed: 0.15
    });
    
    // Shape the decision
    const shaped = this.shaper.shapeDecision(snapshot, outputIndex, userPolicy);
    
    // Get cognitive profile
    const cogProfile = this.cognitiveLoad.getProfile(userId);
    const simpLevel = this.cognitiveLoad.getBudget(userId);
    
    // Generate coaching elements
    const variantExplanation = this.explainVariant(shaped.variant, shaped.emphasis_flags);
    const clarificationQuestion = this.generateClarificationQuestion(output, shaped, cogProfile);
    const formatReason = shaped.shaping_rationale;
    
    // Log
    const auditLogId = this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Coaching session started: ${output.symbol}`,
      details: {
        snapshot_id: snapshot.id,
        variant: shaped.variant,
        simplification_level: simpLevel.level,
        has_question: !!clarificationQuestion
      },
      actor: 'FINBOT'
    });
    
    const session: CoachingSession = {
      session_id: `COACH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      started_at: new Date().toISOString(),
      snapshot_id: snapshot.id,
      output_index: outputIndex,
      symbol: output.symbol || 'UNKNOWN',
      action: output.action,
      shaped_decision: shaped,
      variant_explanation: variantExplanation,
      clarification_question: clarificationQuestion,
      format_reason: formatReason,
      cognitive_profile: cogProfile,
      simplification_level: simpLevel,
      question_asked: false,
      user_responded: false,
      audit_log_id: auditLogId
    };
    
    this.sessions.set(session.session_id, session);
    return session;
  }
  
  /**
   * Get coaching response for user
   */
  public getResponse(sessionId: string): CoachingResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const shaped = session.shaped_decision;
    const isSimplified = session.simplification_level.level > 0;
    
    // Mark question as asked if provided
    if (session.clarification_question) {
      session.question_asked = true;
      this.sessions.set(sessionId, session);
      
      // Track to prevent repetition
      const symbol = session.symbol;
      if (!this.questionsAskedPerSymbol.has(symbol)) {
        this.questionsAskedPerSymbol.set(symbol, []);
      }
      this.questionsAskedPerSymbol.get(symbol)!.push(session.clarification_question);
    }
    
    return {
      session_id: sessionId,
      headline: shaped.headline,
      explanation_bullets: shaped.shaped_explanation,
      key_metrics: shaped.shaped_metrics.map(m => ({
        name: m.name,
        value: m.value,
        emphasized: m.emphasized
      })),
      why_this_format: session.variant_explanation,
      clarification_question: session.clarification_question,
      primary_action: `${shaped.original_output.action} ${session.symbol}`,
      alternative_action: this.generateAlternativeAction(shaped),
      is_simplified: isSimplified,
      simplification_reason: isSimplified 
        ? `Simplified to level ${session.simplification_level.level} based on your interaction pattern`
        : undefined
    };
  }
  
  // ===========================================================================
  // VARIANT EXPLANATION
  // ===========================================================================
  
  /**
   * Explain why this variant was chosen
   * NO persuasion, just facts
   */
  private explainVariant(variant: PresentationVariant, emphasis: EmphasisFlag[]): string {
    const parts: string[] = [];
    
    switch (variant) {
      case 'FULL':
        parts.push('Showing full analysis');
        break;
      case 'TAX_FIRST':
        parts.push('Leading with tax impact');
        break;
      case 'RISK_FIRST':
        parts.push('Leading with risk metrics');
        break;
      case 'SIMPLE':
        parts.push('Showing simplified view');
        break;
      case 'COMPARISON_ONLY':
        parts.push('Showing before/after comparison');
        break;
    }
    
    if (emphasis.length > 0) {
      parts.push(`Emphasizing: ${emphasis.join(', ').toLowerCase()}`);
    }
    
    return parts.join('. ') + '.';
  }
  
  // ===========================================================================
  // CLARIFICATION QUESTIONS
  // ===========================================================================
  
  /**
   * Generate ONE clarification question
   * Based on output and cognitive state
   * NO repetition of previously asked questions
   */
  private generateClarificationQuestion(
    output: DecisionOutput,
    shaped: ShapedDecision,
    profile: CognitiveLoadProfile
  ): string | null {
    // Don't ask if load is high
    if (profile.current_load_score > 70) {
      return null;
    }
    
    // Get previously asked questions for this symbol
    const prevQuestions = this.questionsAskedPerSymbol.get(output.symbol || '') || [];
    
    // Generate candidate questions
    const candidates = this.getCandidateQuestions(output, shaped);
    
    // Filter out previously asked
    const available = candidates.filter(q => !prevQuestions.includes(q));
    
    if (available.length === 0) {
      return null;
    }
    
    // Return the most relevant one
    return available[0];
  }
  
  /**
   * Get candidate clarification questions
   */
  private getCandidateQuestions(
    output: DecisionOutput,
    shaped: ShapedDecision
  ): string[] {
    const questions: string[] = [];
    const symbol = output.symbol || 'this position';
    
    // Based on emphasis
    if (shaped.emphasis_flags.includes('TAX')) {
      questions.push(`Is the tax treatment of ${symbol} clear?`);
    }
    
    if (shaped.emphasis_flags.includes('RISK')) {
      questions.push(`Are you comfortable with the risk level?`);
    }
    
    if (shaped.emphasis_flags.includes('TIMING')) {
      questions.push(`Does the entry timing make sense?`);
    }
    
    // Based on confidence
    if (output.confidence < 60) {
      questions.push(`This has ${output.confidence}% confidence. Is that enough for you?`);
    }
    
    // Based on action
    if (output.action === 'SELL') {
      questions.push(`Are you ready to exit ${symbol}?`);
    }
    
    // Default
    questions.push(`Any questions about ${symbol}?`);
    
    return questions;
  }
  
  // ===========================================================================
  // ALTERNATIVE ACTIONS
  // ===========================================================================
  
  /**
   * Generate alternative action (reduced commitment)
   */
  private generateAlternativeAction(shaped: ShapedDecision): string | undefined {
    const action = shaped.original_output.action;
    const symbol = shaped.original_output.symbol || 'position';
    
    if (action === 'BUY') {
      return `Start with 50% position in ${symbol}`;
    }
    
    if (action === 'SELL') {
      return `Partial exit: sell 50% of ${symbol}`;
    }
    
    return undefined;
  }
  
  // ===========================================================================
  // USER RESPONSE HANDLING
  // ===========================================================================
  
  /**
   * Handle user response to clarification question
   */
  public handleUserResponse(
    sessionId: string,
    response: UserResponse
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.user_responded = true;
    this.sessions.set(sessionId, session);
    
    // Update cognitive load based on response
    const userId = session.cognitive_profile.user_id;
    
    if (response.response_type === 'CONFUSED') {
      this.cognitiveLoad.recordOverloadEvent(userId, 'HELP_REQUEST', {
        session_id: sessionId,
        symbol: session.symbol
      });
    }
    
    this.auditLog.log({
      event_type: 'USER_CONFIRMATION',
      severity: 'INFO',
      summary: `User responded to coaching: ${response.response_type}`,
      details: {
        session_id: sessionId,
        response_type: response.response_type,
        follow_up_needed: response.follow_up_needed
      },
      actor: 'USER'
    });
  }
  
  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================
  
  /**
   * Get active session
   */
  public getSession(sessionId: string): CoachingSession | null {
    return this.sessions.get(sessionId) || null;
  }
  
  /**
   * End session and record outcome
   */
  public endSession(
    sessionId: string,
    outcome: 'APPROVED' | 'REJECTED' | 'DEFERRED'
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Update cognitive load
    const userId = session.cognitive_profile.user_id;
    const wasIgnored = outcome === 'DEFERRED';
    
    const endTime = Date.now();
    const startTime = new Date(session.started_at).getTime();
    const decisionTimeSeconds = (endTime - startTime) / 1000;
    
    this.cognitiveLoad.updateProfile(userId, decisionTimeSeconds, wasIgnored);
    
    // Record with adoption tracker
    this.adoption.recordAction(
      session.snapshot_id,
      session.output_index,
      outcome === 'APPROVED' ? 'APPROVE' : outcome === 'REJECTED' ? 'REJECT' : 'IGNORE'
    );
    
    this.auditLog.log({
      event_type: outcome === 'APPROVED' ? 'USER_CONFIRMATION' : 'USER_REJECTION',
      severity: 'INFO',
      summary: `Coaching session ended: ${outcome}`,
      details: {
        session_id: sessionId,
        outcome,
        decision_time_seconds: decisionTimeSeconds,
        variant_used: session.shaped_decision.variant
      },
      actor: 'USER'
    });
    
    // Clean up
    this.sessions.delete(sessionId);
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  /**
   * Get coaching stats
   */
  public getStats(): {
    active_sessions: number;
    questions_asked_total: number;
    avg_session_duration: number;
  } {
    let totalQuestions = 0;
    for (const questions of this.questionsAskedPerSymbol.values()) {
      totalQuestions += questions.length;
    }
    
    return {
      active_sessions: this.sessions.size,
      questions_asked_total: totalQuestions,
      avg_session_duration: 0 // Would need historical data
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotCoach = () => FinBotCoach.getInstance();
export default FinBotCoach;

