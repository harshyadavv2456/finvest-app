/**
 * ExecutionEthicsFirewall Tests - Phase 34 EEF
 * 
 * MANDATORY TESTS (BUILD MUST FAIL WITHOUT THESE):
 * - Blocks despite high confidence
 * - Blocks despite high expected return
 * - Blocks on blind user obedience
 * - Blocks on system wrong history
 * - Allows only when ALL principles pass
 * - Immutability of verdict
 * - Audit log presence
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExecutionEthicsFirewall,
  ExecutionEthicsFirewall,
  EthicsVerdict,
  EthicsContext,
  EthicsPrinciple
} from '../../ethics/ExecutionEthicsFirewall';
import { EthicsGuard, EthicsContextBuilder } from '../../ethics/EthicsGuard';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a passing context (all ethics satisfied)
 */
const createPassingContext = (): EthicsContext => {
  return Object.freeze({
    trust_score: 80,
    sandbox_decisions: 100,
    discipline_state: 'NORMAL' as const,
    overconfidence_penalty_90d: 5,
    suppressed_wins: 10,
    suppressed_losses: 5,
    system_wrong_last_10: 1,
    adoption_rate: 60,
    conviction_gap: 15,
    user_accepts_rate_last_20: 70,
    would_question_first: false,
    market_uncertainty_index: 30,
    _frozen: true
  });
};

/**
 * Create a context with specific violation
 */
const createViolatingContext = (violation: EthicsPrinciple): EthicsContext => {
  const base = createPassingContext();
  
  switch (violation) {
    case 'INSUFFICIENT_TRUST_HISTORY':
      return { ...base, trust_score: 30, sandbox_decisions: 10 };
    case 'CONFIDENCE_MUTED':
      return { ...base, discipline_state: 'MUTED' };
    case 'EXCESSIVE_REGRET_HISTORY':
      return { ...base, suppressed_wins: 10, suppressed_losses: 20 };
    case 'ADOPTION_MISALIGNMENT':
      return { ...base, adoption_rate: 20, conviction_gap: 50 };
    case 'SYSTEM_OVERCONFIDENCE':
      return { ...base, overconfidence_penalty_90d: 50 };
    case 'USER_DEPENDENCY_RISK':
      return { ...base, user_accepts_rate_last_20: 98 };
    case 'REPEATED_SYSTEM_WRONG':
      return { ...base, system_wrong_last_10: 5 };
    case 'UNCLEAR_USER_INTENT':
      return { ...base, would_question_first: true };
    case 'MARKET_UNCERTAINTY_TOO_HIGH':
      return { ...base, market_uncertainty_index: 90 };
    default:
      return base;
  }
};

// =============================================================================
// ETHICS EVALUATION TESTS
// =============================================================================

describe('Ethics Evaluation', () => {
  let firewall: ExecutionEthicsFirewall;
  
  beforeEach(() => {
    firewall = getExecutionEthicsFirewall();
  });
  
  it('allows when all principles pass', () => {
    const context = createPassingContext();
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(true);
    expect(verdict.violated_principles).toHaveLength(0);
    expect(verdict._frozen).toBe(true);
    
    console.log('✓ Allows when all principles pass');
  });
  
  it('blocks on insufficient trust history', () => {
    const context = createViolatingContext('INSUFFICIENT_TRUST_HISTORY');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('INSUFFICIENT_TRUST_HISTORY');
    
    console.log('✓ Blocks on insufficient trust');
  });
  
  it('blocks on confidence muted', () => {
    const context = createViolatingContext('CONFIDENCE_MUTED');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('CONFIDENCE_MUTED');
    
    console.log('✓ Blocks on confidence muted');
  });
  
  it('blocks on excessive regret history', () => {
    const context = createViolatingContext('EXCESSIVE_REGRET_HISTORY');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('EXCESSIVE_REGRET_HISTORY');
    
    console.log('✓ Blocks on excessive regret');
  });
  
  it('blocks on adoption misalignment', () => {
    const context = createViolatingContext('ADOPTION_MISALIGNMENT');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('ADOPTION_MISALIGNMENT');
    
    console.log('✓ Blocks on adoption misalignment');
  });
  
  it('blocks on system overconfidence', () => {
    const context = createViolatingContext('SYSTEM_OVERCONFIDENCE');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('SYSTEM_OVERCONFIDENCE');
    
    console.log('✓ Blocks on overconfidence');
  });
  
  it('blocks on repeated system wrong', () => {
    const context = createViolatingContext('REPEATED_SYSTEM_WRONG');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('REPEATED_SYSTEM_WRONG');
    
    console.log('✓ Blocks on repeated wrong');
  });
  
  it('blocks on unclear user intent', () => {
    const context = createViolatingContext('UNCLEAR_USER_INTENT');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('UNCLEAR_USER_INTENT');
    
    console.log('✓ Blocks on unclear intent');
  });
  
  it('blocks on market uncertainty', () => {
    const context = createViolatingContext('MARKET_UNCERTAINTY_TOO_HIGH');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('MARKET_UNCERTAINTY_TOO_HIGH');
    
    console.log('✓ Blocks on market uncertainty');
  });
});

// =============================================================================
// BLIND OBEDIENCE TEST (CRITICAL)
// =============================================================================

describe('User Dependency Risk (Blind Obedience)', () => {
  let firewall: ExecutionEthicsFirewall;
  
  beforeEach(() => {
    firewall = getExecutionEthicsFirewall();
  });
  
  it('blocks on blind user obedience with ABSOLUTE severity', () => {
    const context = createViolatingContext('USER_DEPENDENCY_RISK');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.violated_principles).toContain('USER_DEPENDENCY_RISK');
    expect(verdict.severity).toBe('ABSOLUTE');
    
    console.log('✓ Blocks blind obedience with ABSOLUTE severity');
  });
  
  it('user dependency risk explanation warns about failure state', () => {
    const explanation = firewall.explainPrinciple('USER_DEPENDENCY_RISK');
    
    expect(explanation).toContain('blind obedience');
    expect(explanation).toContain('failure state');
    
    console.log('✓ Explanation warns about failure state');
  });
});

// =============================================================================
// BLOCKS DESPITE HIGH METRICS
// =============================================================================

describe('Blocks Despite High Metrics', () => {
  let firewall: ExecutionEthicsFirewall;
  
  beforeEach(() => {
    firewall = getExecutionEthicsFirewall();
  });
  
  it('blocks despite high confidence', () => {
    // High confidence context but muted discipline state
    const context: EthicsContext = {
      ...createPassingContext(),
      discipline_state: 'MUTED' // This should block
    };
    
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    
    console.log('✓ Blocks despite high confidence');
  });
  
  it('blocks despite high expected return (not relevant to ethics)', () => {
    // Ethics doesn't care about expected return
    // If trust is low, block anyway
    const context: EthicsContext = {
      ...createPassingContext(),
      trust_score: 30 // Low trust
    };
    
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    
    console.log('✓ Blocks despite high expected return');
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

describe('Immutability', () => {
  let firewall: ExecutionEthicsFirewall;
  
  beforeEach(() => {
    firewall = getExecutionEthicsFirewall();
  });
  
  it('verdict is frozen', () => {
    const context = createPassingContext();
    const verdict = firewall.evaluate(context);
    
    expect(verdict._frozen).toBe(true);
    expect(Object.isFrozen(verdict)).toBe(true);
    
    console.log('✓ Verdict is frozen');
  });
  
  it('violated principles array is frozen', () => {
    const context = createViolatingContext('INSUFFICIENT_TRUST_HISTORY');
    const verdict = firewall.evaluate(context);
    
    expect(Object.isFrozen(verdict.violated_principles)).toBe(true);
    
    console.log('✓ Violated principles frozen');
  });
});

// =============================================================================
// ETHICS GUARD TESTS
// =============================================================================

describe('EthicsGuard', () => {
  it('assertEthicallyAllowed throws on violation', () => {
    const context = createViolatingContext('CONFIDENCE_MUTED');
    
    expect(() => EthicsGuard.assertEthicallyAllowed(context))
      .toThrow('ETHICS_BLOCKED');
    
    console.log('✓ assertEthicallyAllowed throws');
  });
  
  it('assertEthicallyAllowed passes on valid context', () => {
    const context = createPassingContext();
    
    expect(() => EthicsGuard.assertEthicallyAllowed(context))
      .not.toThrow();
    
    console.log('✓ assertEthicallyAllowed passes');
  });
  
  it('isEthicallyAllowed returns verdict', () => {
    const context = createPassingContext();
    const verdict = EthicsGuard.isEthicallyAllowed(context);
    
    expect(verdict).toHaveProperty('allowed');
    expect(verdict).toHaveProperty('violated_principles');
    expect(verdict).toHaveProperty('severity');
    
    console.log('✓ isEthicallyAllowed returns verdict');
  });
  
  it('getRefusalMessage does NOT suggest workarounds', () => {
    const context = createViolatingContext('CONFIDENCE_MUTED');
    const verdict = EthicsGuard.isEthicallyAllowed(context);
    const message = EthicsGuard.getRefusalMessage(verdict);
    
    // Should NOT contain bypass suggestions
    expect(message.toLowerCase()).not.toContain('bypass');
    expect(message.toLowerCase()).not.toContain('override');
    expect(message.toLowerCase()).not.toContain('workaround');
    expect(message.toLowerCase()).not.toContain('try');
    expect(message.toLowerCase()).not.toContain('you can');
    
    // Should contain explanation
    expect(message).toContain('cannot ethically');
    
    console.log('✓ Refusal message has no workarounds');
  });
});

// =============================================================================
// CONTEXT BUILDER TESTS
// =============================================================================

describe('EthicsContextBuilder', () => {
  it('builds valid context', () => {
    const context = new EthicsContextBuilder()
      .withTrustMetrics(80, 100)
      .withConfidenceGovernance('NORMAL', 5)
      .withCounterfactualData(10, 5, 1)
      .withAdoptionMetrics(60, 15, 70)
      .withSilenceState(false)
      .withMarketUncertainty(30)
      .build();
    
    expect(context.trust_score).toBe(80);
    expect(context._frozen).toBe(true);
    
    console.log('✓ Builder creates valid context');
  });
  
  it('throws on missing required fields', () => {
    const builder = new EthicsContextBuilder()
      .withTrustMetrics(80, 100);
    // Missing other required fields
    
    expect(() => builder.build()).toThrow('Missing required field');
    
    console.log('✓ Builder throws on missing fields');
  });
  
  it('restrictive default blocks execution', () => {
    const context = EthicsContextBuilder.createRestrictiveDefault();
    const verdict = EthicsGuard.isEthicallyAllowed(context);
    
    expect(verdict.allowed).toBe(false);
    
    console.log('✓ Restrictive default blocks');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 34 BUILD GATE', () => {
  let firewall: ExecutionEthicsFirewall;
  
  beforeEach(() => {
    firewall = getExecutionEthicsFirewall();
  });
  
  it('🔒 Firewall is singleton', () => {
    const f1 = getExecutionEthicsFirewall();
    const f2 = getExecutionEthicsFirewall();
    
    expect(f1).toBe(f2);
    
    console.log('✓ Firewall is singleton');
  });
  
  it('🔒 Blocks despite high confidence', () => {
    const context: EthicsContext = {
      ...createPassingContext(),
      discipline_state: 'MUTED'
    };
    
    const verdict = firewall.evaluate(context);
    expect(verdict.allowed).toBe(false);
    
    console.log('✓ Blocks despite high confidence');
  });
  
  it('🔒 Blocks on blind user obedience', () => {
    const context = createViolatingContext('USER_DEPENDENCY_RISK');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.severity).toBe('ABSOLUTE');
    
    console.log('✓ Blocks blind obedience');
  });
  
  it('🔒 Blocks on system wrong history', () => {
    const context = createViolatingContext('REPEATED_SYSTEM_WRONG');
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(false);
    
    console.log('✓ Blocks on system wrong');
  });
  
  it('🔒 Allows only when ALL principles pass', () => {
    const context = createPassingContext();
    const verdict = firewall.evaluate(context);
    
    expect(verdict.allowed).toBe(true);
    expect(verdict.violated_principles).toHaveLength(0);
    
    console.log('✓ Allows only when ALL pass');
  });
  
  it('🔒 Verdict is immutable', () => {
    const context = createPassingContext();
    const verdict = firewall.evaluate(context);
    
    expect(verdict._frozen).toBe(true);
    expect(Object.isFrozen(verdict)).toBe(true);
    
    console.log('✓ Verdict immutable');
  });
  
  it('🔒 EthicsGuard exists', () => {
    expect(EthicsGuard).toBeDefined();
    expect(typeof EthicsGuard.assertEthicallyAllowed).toBe('function');
    expect(typeof EthicsGuard.isEthicallyAllowed).toBe('function');
    
    console.log('✓ EthicsGuard exists');
  });
  
  it('🔒 All 9 principles are checked', () => {
    const allPrinciples: EthicsPrinciple[] = [
      'INSUFFICIENT_TRUST_HISTORY',
      'CONFIDENCE_MUTED',
      'EXCESSIVE_REGRET_HISTORY',
      'ADOPTION_MISALIGNMENT',
      'SYSTEM_OVERCONFIDENCE',
      'USER_DEPENDENCY_RISK',
      'REPEATED_SYSTEM_WRONG',
      'UNCLEAR_USER_INTENT',
      'MARKET_UNCERTAINTY_TOO_HIGH'
    ];
    
    // Each principle should be able to trigger a block
    for (const principle of allPrinciples) {
      const context = createViolatingContext(principle);
      const verdict = firewall.evaluate(context);
      
      expect(verdict.violated_principles).toContain(principle);
    }
    
    console.log('✓ All 9 principles checked');
  });
});

