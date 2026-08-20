/**
 * NeutralQuestionGenerator - Non-Manipulative Question Generation
 * 
 * PHASE 29: Selective Silence & Question-First Mode (QFM)
 * 
 * PURPOSE:
 * Generate questions that reduce uncertainty without implying action.
 * 
 * RULES:
 * - Must be answerable with data
 * - Must reduce uncertainty
 * - Must NOT imply an action
 * - Must NOT be rhetorical
 * - Must NOT be leading
 * - Must NOT be stacked
 * - Exactly ONE question
 * 
 * FORBIDDEN:
 * - Action verbs (buy/sell/add/exit)
 * - Emotional framing
 * - Suggesting ranges that bias behavior
 * - "Just one more clarification..." loops
 */

import { BlockingFactor, QuestionGate } from './QuestionFirstGovernor';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * NeutralQuestion - A non-manipulative question
 */
export interface NeutralQuestion {
  readonly id: string;
  readonly question: string;
  readonly reason_for_asking: string;
  readonly blocking_factor: BlockingFactor;
  readonly expected_answer_type: 'NUMBER' | 'BOOLEAN' | 'CHOICE' | 'TEXT';
  readonly reduces_uncertainty_about: string;
  readonly generated_at: string;
  readonly _frozen: true;
}

/**
 * QuestionTemplate - Template for question generation
 */
interface QuestionTemplate {
  blocking_factor: BlockingFactor;
  templates: string[];
  reason: string;
  answer_type: NeutralQuestion['expected_answer_type'];
  reduces: string;
}

// =============================================================================
// FORBIDDEN PATTERNS
// =============================================================================

/**
 * Action verbs that MUST NOT appear in questions
 */
const FORBIDDEN_ACTION_VERBS = [
  'buy', 'sell', 'add', 'exit', 'hold', 'purchase', 'acquire',
  'invest', 'trade', 'execute', 'enter', 'close', 'increase',
  'decrease', 'accumulate', 'liquidate', 'dump', 'grab'
];

/**
 * Leading phrases that MUST NOT appear
 */
const FORBIDDEN_LEADING_PHRASES = [
  "wouldn't you",
  "don't you think",
  "isn't it better",
  "shouldn't you",
  "wouldn't it be",
  "wouldn't buying",
  "wouldn't selling",
  "wouldn't holding",
  "have you considered that",
  "given that.*should",
  "since.*why not"
];

/**
 * Emotional framing that MUST NOT appear
 */
const FORBIDDEN_EMOTIONAL_FRAMING = [
  'fear', 'worry', 'excited', 'thrilled', 'nervous', 'scared',
  'anxious', 'regret', 'miss out', 'opportunity of', 'once in',
  'urgent', 'immediately', 'quickly', 'before it\'s too late'
];

// =============================================================================
// QUESTION TEMPLATES
// =============================================================================

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // Muted confidence
  {
    blocking_factor: 'MUTED_CONFIDENCE',
    templates: [
      'What information would increase your clarity about this decision?',
      'What price level would you consider significant for this position?',
      'What time horizon are you considering for this investment?'
    ],
    reason: 'Confidence is muted due to past overconfidence',
    answer_type: 'TEXT',
    reduces: 'uncertainty about user intent'
  },
  
  // High conviction gap
  {
    blocking_factor: 'HIGH_CONVICTION_GAP',
    templates: [
      'What is your target allocation percentage for this sector?',
      'At what price would you reassess this position?',
      'What is your maximum acceptable loss percentage?'
    ],
    reason: 'There is a gap between system confidence and user conviction',
    answer_type: 'NUMBER',
    reduces: 'conviction gap'
  },
  
  // Cognitive overload
  {
    blocking_factor: 'COGNITIVE_OVERLOAD',
    templates: [
      'Would you prefer fewer details in recommendations?',
      'Would you like to focus on just one metric at a time?',
      'What is the single most important factor for your decision?'
    ],
    reason: 'Cognitive load appears high',
    answer_type: 'CHOICE',
    reduces: 'information overload'
  },
  
  // Repeated ignores
  {
    blocking_factor: 'REPEATED_IGNORES',
    templates: [
      'What aspect of previous recommendations was not useful?',
      'What type of information would be more helpful?',
      'What is preventing action on these recommendations?'
    ],
    reason: 'Recent recommendations have been ignored',
    answer_type: 'TEXT',
    reduces: 'friction between system and user'
  },
  
  // Low adoption score
  {
    blocking_factor: 'LOW_ADOPTION_SCORE',
    templates: [
      'What criteria do you use when evaluating recommendations?',
      'What additional context would help your decision-making?',
      'What constraints should I consider in future recommendations?'
    ],
    reason: 'Adoption rate is low',
    answer_type: 'TEXT',
    reduces: 'adoption friction'
  },
  
  // Restrained confidence
  {
    blocking_factor: 'RESTRAINED_CONFIDENCE',
    templates: [
      'What level of detail helps you most in analysis?',
      'What comparison data would be valuable for this decision?',
      'What timeframe is most relevant for your goals?'
    ],
    reason: 'Confidence is restrained due to calibration concerns',
    answer_type: 'CHOICE',
    reduces: 'calibration uncertainty'
  },
  
  // User policy block
  {
    blocking_factor: 'USER_POLICY_BLOCK',
    templates: [
      'Should I adjust recommendations to your current policy settings?',
      'Would you like to update your risk tolerance preference?',
      'What policy constraints are most important to maintain?'
    ],
    reason: 'User policy conflicts with recommendation',
    answer_type: 'BOOLEAN',
    reduces: 'policy misalignment'
  },
  
  // Insufficient data
  {
    blocking_factor: 'INSUFFICIENT_DATA',
    templates: [
      'What additional data sources should I consider?',
      'What is your experience with this sector or stock?',
      'What assumptions should I verify before proceeding?'
    ],
    reason: 'Insufficient data for confident recommendation',
    answer_type: 'TEXT',
    reduces: 'data gaps'
  }
];

// =============================================================================
// NEUTRAL QUESTION GENERATOR
// =============================================================================

export class NeutralQuestionGenerator {
  private static instance: NeutralQuestionGenerator;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Question history to avoid repetition
  private askedQuestions: Map<string, string[]> = new Map(); // userId -> question ids
  
  private constructor() {}
  
  public static getInstance(): NeutralQuestionGenerator {
    if (!NeutralQuestionGenerator.instance) {
      NeutralQuestionGenerator.instance = new NeutralQuestionGenerator();
    }
    return NeutralQuestionGenerator.instance;
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Generate ONE neutral question based on the gate
   * Returns null if gate mode is ADVICE_ALLOWED
   */
  public generateQuestion(gate: QuestionGate, userId: string = 'default'): NeutralQuestion | null {
    // No question needed if advice is allowed
    if (gate.mode === 'ADVICE_ALLOWED') {
      return null;
    }
    
    // Get primary blocking factor
    const primaryFactor = gate.blocking_factors[0] || 'INSUFFICIENT_DATA';
    
    // Find template for this factor
    const template = QUESTION_TEMPLATES.find(t => t.blocking_factor === primaryFactor);
    if (!template) {
      // Fallback to generic
      return this.generateGenericQuestion(primaryFactor);
    }
    
    // Select question (avoid recently asked)
    const userHistory = this.askedQuestions.get(userId) || [];
    const availableTemplates = template.templates.filter((_, i) => 
      !userHistory.includes(`${primaryFactor}-${i}`)
    );
    
    // If all asked, reset and use first
    const selectedIndex = availableTemplates.length > 0 
      ? Math.floor(Math.random() * availableTemplates.length)
      : 0;
    
    const questionText = availableTemplates.length > 0
      ? availableTemplates[selectedIndex]
      : template.templates[0];
    
    // Validate question
    this.validateQuestion(questionText);
    
    // Build question
    const question: NeutralQuestion = Object.freeze({
      id: `Q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: questionText,
      reason_for_asking: template.reason,
      blocking_factor: primaryFactor,
      expected_answer_type: template.answer_type,
      reduces_uncertainty_about: template.reduces,
      generated_at: new Date().toISOString(),
      _frozen: true
    });
    
    // Record in history
    const questionIndex = template.templates.indexOf(questionText);
    userHistory.push(`${primaryFactor}-${questionIndex}`);
    this.askedQuestions.set(userId, userHistory.slice(-10)); // Keep last 10
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Neutral question generated: ${primaryFactor}`,
      details: {
        question_id: question.id,
        question: question.question,
        reason: question.reason_for_asking,
        blocking_factor: primaryFactor,
        reduces: question.reduces_uncertainty_about
      },
      actor: 'ENGINE'
    });
    
    return question;
  }
  
  // ===========================================================================
  // VALIDATION
  // ===========================================================================
  
  /**
   * Validate that question follows all rules
   * Throws if validation fails
   */
  private validateQuestion(question: string): void {
    const lower = question.toLowerCase();
    
    // Check for forbidden action verbs
    for (const verb of FORBIDDEN_ACTION_VERBS) {
      if (lower.includes(verb)) {
        throw new Error(
          `QUESTION_VALIDATION_FAILED: Contains forbidden action verb "${verb}"`
        );
      }
    }
    
    // Check for leading phrases
    for (const phrase of FORBIDDEN_LEADING_PHRASES) {
      const regex = new RegExp(phrase, 'i');
      if (regex.test(lower)) {
        throw new Error(
          `QUESTION_VALIDATION_FAILED: Contains leading phrase "${phrase}"`
        );
      }
    }
    
    // Check for emotional framing
    for (const emotion of FORBIDDEN_EMOTIONAL_FRAMING) {
      if (lower.includes(emotion)) {
        throw new Error(
          `QUESTION_VALIDATION_FAILED: Contains emotional framing "${emotion}"`
        );
      }
    }
    
    // Check for multiple questions (stacked)
    const questionMarks = (question.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      throw new Error(
        `QUESTION_VALIDATION_FAILED: Contains multiple questions (${questionMarks})`
      );
    }
    
    // Check it ends with exactly one question mark
    if (!question.trim().endsWith('?')) {
      throw new Error(
        'QUESTION_VALIDATION_FAILED: Does not end with question mark'
      );
    }
  }
  
  /**
   * Validate external question (for custom questions)
   */
  public validateExternalQuestion(question: string): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    const lower = question.toLowerCase();
    
    // Check all rules
    for (const verb of FORBIDDEN_ACTION_VERBS) {
      if (lower.includes(verb)) {
        violations.push(`Contains action verb: ${verb}`);
      }
    }
    
    for (const phrase of FORBIDDEN_LEADING_PHRASES) {
      const regex = new RegExp(phrase, 'i');
      if (regex.test(lower)) {
        violations.push(`Contains leading phrase: ${phrase}`);
      }
    }
    
    for (const emotion of FORBIDDEN_EMOTIONAL_FRAMING) {
      if (lower.includes(emotion)) {
        violations.push(`Contains emotional framing: ${emotion}`);
      }
    }
    
    const questionMarks = (question.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      violations.push(`Multiple questions: ${questionMarks}`);
    }
    
    if (!question.trim().endsWith('?')) {
      violations.push('Does not end with question mark');
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private generateGenericQuestion(factor: BlockingFactor): NeutralQuestion {
    return Object.freeze({
      id: `Q-${Date.now()}-generic`,
      question: 'What additional information would help clarify your decision?',
      reason_for_asking: `Blocking factor: ${factor}`,
      blocking_factor: factor,
      expected_answer_type: 'TEXT' as const,
      reduces_uncertainty_about: 'general decision context',
      generated_at: new Date().toISOString(),
      _frozen: true
    });
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get available templates for a blocking factor
   */
  public getTemplatesForFactor(factor: BlockingFactor): string[] {
    const template = QUESTION_TEMPLATES.find(t => t.blocking_factor === factor);
    return template ? [...template.templates] : [];
  }
  
  /**
   * Check if a question text is valid
   */
  public isValidQuestion(question: string): boolean {
    try {
      this.validateQuestion(question);
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getNeutralQuestionGenerator = () => NeutralQuestionGenerator.getInstance();
export default NeutralQuestionGenerator;

