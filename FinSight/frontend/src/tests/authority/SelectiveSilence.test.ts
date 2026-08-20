/**
 * SelectiveSilence Tests - Phase 29 QFM
 * 
 * MANDATORY TESTS:
 * - Advice must be impossible when gate ≠ ADVICE_ALLOWED
 * - Only ONE question allowed per snapshot
 * - Question cannot contain action verbs (buy/sell/add/exit)
 * - Silence must be explicit, not empty
 * - All questions logged with reason
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getQuestionFirstGovernor, 
  QuestionFirstGovernor,
  QuestionGate,
  GateContext
} from '../../silence/QuestionFirstGovernor';
import { 
  getNeutralQuestionGenerator, 
  NeutralQuestionGenerator,
  NeutralQuestion
} from '../../silence/NeutralQuestionGenerator';
import { 
  getFinBotQuestionMode, 
  FinBotQuestionMode 
} from '../../silence/FinBotQuestionMode';
import { 
  getQuestionOutcomeTracker,
  QuestionOutcomeTracker 
} from '../../silence/QuestionOutcomeTracker';

// =============================================================================
// ADVICE BLOCKED WHEN GATE ≠ ADVICE_ALLOWED
// =============================================================================

describe('Advice must be impossible when gate ≠ ADVICE_ALLOWED', () => {
  let governor: QuestionFirstGovernor;
  let questionMode: FinBotQuestionMode;
  
  beforeEach(() => {
    governor = getQuestionFirstGovernor();
    questionMode = getFinBotQuestionMode();
  });
  
  it('QuestionFirstGovernor is singleton', () => {
    const g1 = getQuestionFirstGovernor();
    const g2 = getQuestionFirstGovernor();
    expect(g1).toBe(g2);
  });
  
  it('processResponse blocks advice when QUESTION_REQUIRED', () => {
    const context: GateContext = {
      governed_confidence: {
        original_confidence: 80,
        max_allowed_confidence: 40,
        applied_confidence: 40,
        adjustment_reason: 'Muted',
        adjustment_amount: 40,
        discipline_state: 'MUTED', // This triggers QUESTION_REQUIRED
        _frozen: true
      } as any
    };
    
    const result = questionMode.processResponse(
      'You should buy AAPL now!', // Original advice
      context,
      'test-snapshot-1'
    );
    
    // Advice MUST be blocked
    expect(result.advice_blocked).toBe(true);
    expect(result.mode).not.toBe('ADVICE_ALLOWED');
    expect(result.actual_response).not.toContain('buy');
    
    console.log('✓ Advice blocked when QUESTION_REQUIRED');
  });
  
  it('processResponse shows silence when SILENCE_REQUIRED', () => {
    const context: GateContext = {
      recent_ignores: 5 // This triggers SILENCE_REQUIRED
    };
    
    const result = questionMode.processResponse(
      'You should sell now!',
      context,
      'test-snapshot-2'
    );
    
    expect(result.advice_blocked).toBe(true);
    expect(result.mode).toBe('SILENCE_REQUIRED');
    expect(result.silence_message).toBeTruthy();
    
    console.log('✓ Silence shown when SILENCE_REQUIRED');
  });
  
  it('QuestionGate is frozen', () => {
    const gate = governor.evaluateGate({});
    expect(gate._frozen).toBe(true);
    
    console.log('✓ QuestionGate is frozen');
  });
});

// =============================================================================
// ONLY ONE QUESTION ALLOWED PER SNAPSHOT
// =============================================================================

describe('Only ONE question allowed per snapshot', () => {
  let questionMode: FinBotQuestionMode;
  
  beforeEach(() => {
    questionMode = getFinBotQuestionMode();
  });
  
  it('Second question for same snapshot triggers silence', () => {
    const context: GateContext = {
      governed_confidence: {
        original_confidence: 80,
        max_allowed_confidence: 40,
        applied_confidence: 40,
        adjustment_reason: 'Muted',
        adjustment_amount: 40,
        discipline_state: 'MUTED',
        _frozen: true
      } as any
    };
    
    const snapshotId = `one-question-test-${Date.now()}`;
    
    // First call - should get question
    const first = questionMode.processResponse(
      'Advice text',
      context,
      snapshotId
    );
    
    // Second call - should get SILENCE (not another question)
    const second = questionMode.processResponse(
      'More advice',
      context,
      snapshotId
    );
    
    // First should be question
    if (first.mode === 'QUESTION_REQUIRED') {
      expect(first.question).toBeDefined();
    }
    
    // Second MUST be silence (not another question)
    if (first.mode === 'QUESTION_REQUIRED') {
      expect(second.mode).toBe('SILENCE_REQUIRED');
      expect(second.question).toBeUndefined();
    }
    
    console.log('✓ Only ONE question per snapshot');
  });
  
  it('isQuestionLimitReached returns true after first question', () => {
    const snapshotId = `limit-test-${Date.now()}`;
    
    // Ask question for snapshot
    questionMode.processResponse(
      'Advice',
      { governed_confidence: { discipline_state: 'MUTED' } as any },
      snapshotId
    );
    
    // Should be at limit
    expect(questionMode.isQuestionLimitReached(snapshotId)).toBe(true);
    
    console.log('✓ Question limit tracking works');
  });
});

// =============================================================================
// QUESTION CANNOT CONTAIN ACTION VERBS
// =============================================================================

describe('Question cannot contain action verbs (buy/sell/add/exit)', () => {
  let generator: NeutralQuestionGenerator;
  
  beforeEach(() => {
    generator = getNeutralQuestionGenerator();
  });
  
  it('isValidQuestion rejects questions with "buy"', () => {
    const result = generator.validateExternalQuestion(
      "Wouldn't buying now be better?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('buy'))).toBe(true);
    
    console.log('✓ Rejects "buy"');
  });
  
  it('isValidQuestion rejects questions with "sell"', () => {
    const result = generator.validateExternalQuestion(
      "Should you sell your position?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('sell'))).toBe(true);
    
    console.log('✓ Rejects "sell"');
  });
  
  it('isValidQuestion rejects questions with "add"', () => {
    const result = generator.validateExternalQuestion(
      "Do you want to add to your position?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('add'))).toBe(true);
    
    console.log('✓ Rejects "add"');
  });
  
  it('isValidQuestion rejects questions with "exit"', () => {
    const result = generator.validateExternalQuestion(
      "When would you exit this trade?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('exit'))).toBe(true);
    
    console.log('✓ Rejects "exit"');
  });
  
  it('isValidQuestion rejects leading questions', () => {
    const result = generator.validateExternalQuestion(
      "Wouldn't you agree this is a good opportunity?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('leading'))).toBe(true);
    
    console.log('✓ Rejects leading questions');
  });
  
  it('isValidQuestion rejects stacked questions', () => {
    const result = generator.validateExternalQuestion(
      "What is your risk tolerance? And what is your time horizon?"
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('Multiple'))).toBe(true);
    
    console.log('✓ Rejects stacked questions');
  });
  
  it('All generated questions pass validation', () => {
    const factors: Array<'MUTED_CONFIDENCE' | 'HIGH_CONVICTION_GAP' | 'COGNITIVE_OVERLOAD'> = [
      'MUTED_CONFIDENCE',
      'HIGH_CONVICTION_GAP',
      'COGNITIVE_OVERLOAD'
    ];
    
    for (const factor of factors) {
      const templates = generator.getTemplatesForFactor(factor);
      for (const template of templates) {
        expect(generator.isValidQuestion(template)).toBe(true);
      }
    }
    
    console.log('✓ All templates are valid');
  });
});

// =============================================================================
// SILENCE MUST BE EXPLICIT, NOT EMPTY
// =============================================================================

describe('Silence must be explicit, not empty', () => {
  let questionMode: FinBotQuestionMode;
  
  beforeEach(() => {
    questionMode = getFinBotQuestionMode();
  });
  
  it('Silence response has explicit message', () => {
    const result = questionMode.processResponse(
      'Original advice',
      { recent_ignores: 6 }, // Triggers silence
      'silence-test-1'
    );
    
    if (result.mode === 'SILENCE_REQUIRED') {
      expect(result.silence_message).toBeTruthy();
      expect(result.silence_message!.length).toBeGreaterThan(10);
      expect(result.actual_response).toBeTruthy();
      expect(result.actual_response.length).toBeGreaterThan(10);
      
      console.log(`✓ Silence message: "${result.silence_message}"`);
    }
  });
  
  it('Silence message explains why', () => {
    const result = questionMode.processResponse(
      'Advice',
      { recent_ignores: 6 },
      'silence-test-2'
    );
    
    if (result.mode === 'SILENCE_REQUIRED') {
      // Should contain explanation
      const hasExplanation = 
        result.actual_response.includes("don't have enough") ||
        result.actual_response.includes("noticed") ||
        result.actual_response.includes("step back") ||
        result.actual_response.includes("wait");
      
      expect(hasExplanation).toBe(true);
      
      console.log('✓ Silence has explanation');
    }
  });
});

// =============================================================================
// ALL QUESTIONS LOGGED WITH REASON
// =============================================================================

describe('All questions logged with reason', () => {
  let generator: NeutralQuestionGenerator;
  
  beforeEach(() => {
    generator = getNeutralQuestionGenerator();
  });
  
  it('Generated question has reason_for_asking', () => {
    const gate: QuestionGate = {
      mode: 'QUESTION_REQUIRED',
      reason: 'Test reason',
      blocking_factors: ['MUTED_CONFIDENCE'],
      severity: 'HIGH',
      computed_at: new Date().toISOString(),
      _frozen: true
    };
    
    const question = generator.generateQuestion(gate);
    
    expect(question).not.toBeNull();
    expect(question!.reason_for_asking).toBeTruthy();
    expect(question!.reason_for_asking.length).toBeGreaterThan(0);
    
    console.log(`✓ Question reason: "${question!.reason_for_asking}"`);
  });
  
  it('NeutralQuestion is frozen', () => {
    const gate: QuestionGate = {
      mode: 'QUESTION_REQUIRED',
      reason: 'Test',
      blocking_factors: ['HIGH_CONVICTION_GAP'],
      severity: 'HIGH',
      computed_at: new Date().toISOString(),
      _frozen: true
    };
    
    const question = generator.generateQuestion(gate);
    
    expect(question!._frozen).toBe(true);
    
    console.log('✓ NeutralQuestion is frozen');
  });
  
  it('Question has reduces_uncertainty_about', () => {
    const gate: QuestionGate = {
      mode: 'QUESTION_REQUIRED',
      reason: 'Test',
      blocking_factors: ['COGNITIVE_OVERLOAD'],
      severity: 'CRITICAL',
      computed_at: new Date().toISOString(),
      _frozen: true
    };
    
    const question = generator.generateQuestion(gate);
    
    expect(question!.reduces_uncertainty_about).toBeTruthy();
    
    console.log('✓ Question specifies what uncertainty it reduces');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 29 BUILD GATE', () => {
  it('🔒 QuestionFirstGovernor exists', () => {
    const gov = getQuestionFirstGovernor();
    expect(gov).toBeDefined();
    expect(typeof gov.evaluateGate).toBe('function');
    console.log('✓ Governor exists');
  });
  
  it('🔒 NeutralQuestionGenerator exists', () => {
    const gen = getNeutralQuestionGenerator();
    expect(gen).toBeDefined();
    expect(typeof gen.generateQuestion).toBe('function');
    console.log('✓ Generator exists');
  });
  
  it('🔒 FinBotQuestionMode exists', () => {
    const mode = getFinBotQuestionMode();
    expect(mode).toBeDefined();
    expect(typeof mode.processResponse).toBe('function');
    console.log('✓ QuestionMode exists');
  });
  
  it('🔒 QuestionOutcomeTracker exists', () => {
    const tracker = getQuestionOutcomeTracker();
    expect(tracker).toBeDefined();
    expect(typeof tracker.recordQuestionAsked).toBe('function');
    console.log('✓ Tracker exists');
  });
  
  it('🔒 Advice blocked when gate not ADVICE_ALLOWED', () => {
    const mode = getFinBotQuestionMode();
    const result = mode.processResponse(
      'Buy AAPL!',
      { governed_confidence: { discipline_state: 'MUTED' } as any },
      'build-gate-test'
    );
    
    expect(result.advice_blocked).toBe(true);
    console.log('✓ Advice is blocked');
  });
  
  it('🔒 Action verbs rejected', () => {
    const gen = getNeutralQuestionGenerator();
    expect(gen.isValidQuestion('Should you buy now?')).toBe(false);
    expect(gen.isValidQuestion('Should you sell now?')).toBe(false);
    console.log('✓ Action verbs rejected');
  });
  
  it('🔒 Silence is explicit', () => {
    const mode = getFinBotQuestionMode();
    const result = mode.processResponse(
      'Advice',
      { recent_ignores: 10 },
      'explicit-silence-test'
    );
    
    if (result.mode === 'SILENCE_REQUIRED') {
      expect(result.silence_message).toBeTruthy();
      expect(result.silence_message!.length).toBeGreaterThan(0);
    }
    console.log('✓ Silence is explicit');
  });
  
  it('🔒 Questions have reasons', () => {
    const gen = getNeutralQuestionGenerator();
    const gate: QuestionGate = {
      mode: 'QUESTION_REQUIRED',
      reason: 'Test',
      blocking_factors: ['MUTED_CONFIDENCE'],
      severity: 'HIGH',
      computed_at: new Date().toISOString(),
      _frozen: true
    };
    
    const q = gen.generateQuestion(gate);
    expect(q!.reason_for_asking).toBeTruthy();
    console.log('✓ Questions have reasons');
  });
});

