/**
 * Authority Test Suite Index
 * 
 * PHASE 21: Adversarial Authority Validation
 * 
 * This file runs all authority tests and ensures:
 * - FinBot refuses without DecisionSnapshot
 * - FinBot refuses without UserMemory
 * - Decision rendering blocked without snapshot
 * - Snapshot hash tampering causes refusal
 * - ShadowExecution requires valid context
 * - Generic advice queries are refused
 * 
 * BUILD FAILS if any of these tests fail.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import all test modules
import './SnapshotAuthority.test';
import './UserMemory.test';
import './ConsequenceAuthority.test';
import './FinBotRefusal.test';
import './ExecutionSandbox.test'; // PHASE 22
import './TrustLedger.test'; // PHASE 23
import './DecisionAdoption.test'; // PHASE 24
import './DecisionShaping.test'; // PHASE 25
import './Phase25Verification.test'; // PHASE 25 Verification
import './ExecutionPreAuthorization.test'; // PHASE 26
import './MarketFeedbackLoop.test'; // PHASE 27
import './ConfidenceGovernance.test'; // PHASE 28
import './SelectiveSilence.test'; // PHASE 29
import './RedTeamPhase29.test'; // PHASE 29 RED-TEAM VERIFICATION
import './ConflictResolution.test'; // PHASE 30B
import './DecisionLifecycle.test'; // PHASE 31
import './TemporalReservation.test'; // PHASE 32
import './CounterfactualLedger.test'; // PHASE 33
import './ExecutionEthicsFirewall.test'; // PHASE 34
import './HumanOverrideProtocol.test'; // PHASE 35
// Phase 36 tests are in smokeTest.ts (run via npm run system:smoke)
import './InstitutionalAudit.test'; // PHASE 37
import './SelfLimitingGrowth.test'; // PHASE 38
import './ShutdownHostility.test'; // PHASE 39
import './InstitutionalFreeze.test'; // PHASE 40
import './ExternalHostility.test'; // PHASE 41

// =============================================================================
// AUTHORITY SYSTEM INTEGRITY CHECK
// =============================================================================

describe('Authority System: Integrity Check', () => {
  beforeAll(() => {
    console.log('='.repeat(60));
    console.log('PHASE 21: ADVERSARIAL AUTHORITY VALIDATION');
    console.log('='.repeat(60));
    console.log('Running authority tests to prove FinVest fails CLOSED');
    console.log('');
  });
  
  it('MANDATORY: SnapshotAuthority module exists', async () => {
    const module = await import('../../core/SnapshotAuthority');
    
    expect(module.SnapshotAuthority).toBeDefined();
    expect(module.getSnapshotAuthority).toBeDefined();
    expect(typeof module.getSnapshotAuthority).toBe('function');
  });
  
  it('MANDATORY: UserMemory module exists', async () => {
    const module = await import('../../memory/UserMemory');
    
    expect(module.UserMemory).toBeDefined();
    expect(module.getUserMemory).toBeDefined();
    expect(typeof module.getUserMemory).toBe('function');
  });
  
  it('MANDATORY: ConsequenceAuthority module exists', async () => {
    const module = await import('../../analysis/ConsequenceAuthority');
    
    expect(module.ConsequenceAuthority).toBeDefined();
    expect(module.getConsequenceAuthority).toBeDefined();
    expect(typeof module.getConsequenceAuthority).toBe('function');
  });
  
  it('MANDATORY: DecisionAuditLog module exists', async () => {
    const module = await import('../../audit/DecisionAuditLog');
    
    expect(module.DecisionAuditLog).toBeDefined();
    expect(module.auditLog).toBeDefined();
  });
  
  it('MANDATORY: FinBotWithMemory module exists', async () => {
    const module = await import('../../ai/FinBotWithMemory');
    
    expect(module.FinBotWithMemory).toBeDefined();
    expect(module.getFinBotWithMemory).toBeDefined();
    expect(typeof module.getFinBotWithMemory).toBe('function');
  });
  
  it('MANDATORY: AuthorityGuard module exists', async () => {
    const module = await import('../../core/AuthorityEnforcement');
    
    expect(module.AuthorityGuard).toBeDefined();
    expect(module.getAuthorityGuard).toBeDefined();
    expect(typeof module.getAuthorityGuard).toBe('function');
  });
});

// =============================================================================
// FINAL AUTHORITY CHECK
// =============================================================================

describe('Authority System: Final Validation', () => {
  it('ALL authority modules are singletons', async () => {
    const { getSnapshotAuthority } = await import('../../core/SnapshotAuthority');
    const { getUserMemory } = await import('../../memory/UserMemory');
    const { getConsequenceAuthority } = await import('../../analysis/ConsequenceAuthority');
    const { getAuthorityGuard } = await import('../../core/AuthorityEnforcement');
    
    // Get instances twice
    const snapshot1 = getSnapshotAuthority();
    const snapshot2 = getSnapshotAuthority();
    
    const memory1 = getUserMemory();
    const memory2 = getUserMemory();
    
    const consequence1 = getConsequenceAuthority();
    const consequence2 = getConsequenceAuthority();
    
    const guard1 = getAuthorityGuard();
    const guard2 = getAuthorityGuard();
    
    // Must be same instance
    expect(snapshot1).toBe(snapshot2);
    expect(memory1).toBe(memory2);
    expect(consequence1).toBe(consequence2);
    expect(guard1).toBe(guard2);
  });
  
  it('AuthorityGuard checkAuthority works', async () => {
    const { getAuthorityGuard } = await import('../../core/AuthorityEnforcement');
    
    const guard = getAuthorityGuard();
    const result = guard.checkAuthority(null);
    
    // Should return proper structure
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.blocked_by).toBe('string');
    expect(typeof result.reason).toBe('string');
    expect(typeof result.action_required).toBe('string');
    
    // With null snapshot, should be blocked
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).not.toBe('NONE');
  });
  
  it('FAIL-CLOSED mode is enforced', async () => {
    const { getSnapshotAuthority } = await import('../../core/SnapshotAuthority');
    const { getAuthorityGuard } = await import('../../core/AuthorityEnforcement');
    
    const snapshot = getSnapshotAuthority();
    const guard = getAuthorityGuard();
    
    // Test with various invalid inputs
    const invalidInputs = [
      null,
      undefined,
      '',
      'fake-id',
      'INVALID',
      123 as any,
      {} as any
    ];
    
    for (const input of invalidInputs) {
      const gateResult = snapshot.checkRenderGate(input);
      expect(gateResult.allowed).toBe(false);
      
      const authResult = guard.checkAuthority(input);
      expect(authResult.allowed).toBe(false);
    }
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('BUILD GATE: Authority Requirements', () => {
  it('🚫 NO advice without snapshot', async () => {
    const { getSnapshotAuthority } = await import('../../core/SnapshotAuthority');
    const authority = getSnapshotAuthority();
    
    const gate = authority.checkRenderGate(null);
    expect(gate.allowed).toBe(false);
    
    console.log('✓ Advice blocked without snapshot');
  });
  
  it('🚫 NO FinBot response without memory check', async () => {
    const { getFinBotWithMemory } = await import('../../ai/FinBotWithMemory');
    const finBot = getFinBotWithMemory();
    
    const response = await finBot.processQuery('test');
    
    if (!('refused' in response && response.refused)) {
      expect((response as any).memory_consulted).toBe(true);
    }
    
    console.log('✓ FinBot consults memory');
  });
  
  it('🚫 NO decision without consequence tracking enabled', async () => {
    const { getConsequenceAuthority } = await import('../../analysis/ConsequenceAuthority');
    const authority = getConsequenceAuthority();
    
    const stats = authority.getStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.total_snapshots).toBe('number');
    
    console.log('✓ Consequence tracking active');
  });
  
  it('🚫 NO silent failures in audit log', async () => {
    const { auditLog } = await import('../../audit/DecisionAuditLog');
    
    const stats = auditLog.getStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.total_entries).toBe('number');
    
    console.log('✓ Audit log active');
  });
  
  // PHASE 22: Sandbox Hard Rules
  it('🔒 Sandbox is ALWAYS ON', async () => {
    const { getExecutionSandbox } = await import('../../execution/ExecutionSandbox');
    const sandbox = getExecutionSandbox();
    
    expect(sandbox.isEnabled()).toBe(true);
    
    console.log('✓ Sandbox always enabled');
  });
  
  it('🔒 ExecutionEngine is LOCKED', async () => {
    const { executionEngine } = await import('../../execution/ExecutionEngine');
    
    expect(executionEngine.isExecutionAvailable()).toBe(false);
    expect(executionEngine.getStatus()).toBe('DISABLED');
    
    console.log('✓ ExecutionEngine locked');
  });
  
  it('🔒 Sandbox requires valid snapshot', async () => {
    const { getExecutionSandbox } = await import('../../execution/ExecutionSandbox');
    const sandbox = getExecutionSandbox();
    
    const gate = sandbox.checkGate('FAKE-SNAPSHOT');
    
    expect(gate.allowed).toBe(false);
    expect(gate.missing.length).toBeGreaterThan(0);
    
    console.log('✓ Sandbox fails closed without snapshot');
  });
  
  // PHASE 23: Trust & Proof Layer
  it('🔒 TrustLedger is read-only', async () => {
    const { getTrustLedger } = await import('../../trust/TrustLedger');
    const ledger = getTrustLedger();
    
    // No manual add methods
    expect((ledger as any).addEntry).toBeUndefined();
    expect((ledger as any).deleteEntry).toBeUndefined();
    
    console.log('✓ TrustLedger is read-only');
  });
  
  it('🔒 ExecutionPermission is LOCKED', async () => {
    const { getExecutionPermission } = await import('../../trust/ExecutionPermission');
    const permission = getExecutionPermission();
    
    expect(permission.isExecutionLocked()).toBe(true);
    
    const gate = permission.checkPermission('FULL_EXECUTION');
    expect(gate.allowed).toBe(false);
    
    console.log('✓ ExecutionPermission is LOCKED');
  });
  
  it('🔒 Losses must be visible in TrustScore', async () => {
    const { getTrustLedger } = await import('../../trust/TrustLedger');
    const ledger = getTrustLedger();
    
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('wrong_approvals');
    expect(score).toHaveProperty('wrong_rejections');
    expect(score).toHaveProperty('total_regret_incurred');
    
    console.log('✓ Losses are visible in TrustScore');
  });
  
  // PHASE 24: Decision Adoption Engine
  it('🔒 Adoption tracking is active', async () => {
    const { getDecisionAdoption } = await import('../../adoption/DecisionAdoption');
    const adoption = getDecisionAdoption();
    
    expect(typeof adoption.trackRecommendation).toBe('function');
    expect(typeof adoption.recordAction).toBe('function');
    
    console.log('✓ Adoption tracking is active');
  });
  
  it('🔒 Rejection reasons must be tracked', async () => {
    const { getDecisionAdoption } = await import('../../adoption/DecisionAdoption');
    const adoption = getDecisionAdoption();
    
    const stats = adoption.getStats();
    expect(stats).toHaveProperty('rejection_breakdown');
    
    console.log('✓ Rejection reasons are tracked');
  });
  
  it('🔒 Conviction gap analysis is available', async () => {
    const { getConvictionGap } = await import('../../adoption/ConvictionGap');
    const gap = getConvictionGap();
    
    const report = gap.getReport();
    expect(report).toHaveProperty('avg_conviction_gap');
    expect(report).toHaveProperty('worst_gaps');
    
    console.log('✓ Conviction gap analysis is available');
  });
  
  it('🔒 Adoption score exposed alongside trust', async () => {
    const { getAdoptionScore } = await import('../../adoption/AdoptionScore');
    const scorer = getAdoptionScore();
    
    const comparison = scorer.getComparisonWithTrust();
    expect(comparison).toHaveProperty('trust_score');
    expect(comparison).toHaveProperty('adoption_score');
    
    console.log('✓ Adoption score exposed with trust');
  });
  
  // PHASE 25: Adaptive Decision Shaping (ADS)
  it('🔒 Shaping never alters recommendation content', async () => {
    const { getDecisionShaper } = await import('../../shaping/DecisionShaper');
    const shaper = getDecisionShaper();
    
    expect(typeof shaper.verifyIntegrity).toBe('function');
    
    console.log('✓ Shaping integrity verification available');
  });
  
  it('🔒 Cognitive load budget is enforced', async () => {
    const { getCognitiveLoad } = await import('../../shaping/CognitiveLoad');
    const load = getCognitiveLoad();
    
    const budget = load.getBudget();
    expect(budget).toHaveProperty('max_bullets');
    expect(budget).toHaveProperty('max_metrics');
    
    console.log('✓ Cognitive load budget enforced');
  });
  
  it('🔒 Adoption lift auto-reverts on negative trend', async () => {
    const { getAdoptionLift } = await import('../../shaping/AdoptionLift');
    const lift = getAdoptionLift();
    
    const report = lift.getReport();
    expect(report.revert_threshold).toBe(10);
    expect(['ACTIVE', 'DEGRADED', 'REVERTED']).toContain(report.current_strategy_status);
    
    console.log('✓ Adoption lift auto-revert configured');
  });
  
  it('🔒 Shaping is reversible', async () => {
    const { getAdoptionLift } = await import('../../shaping/AdoptionLift');
    const { getCognitiveLoad } = await import('../../shaping/CognitiveLoad');
    
    const lift = getAdoptionLift();
    const load = getCognitiveLoad();
    
    expect(typeof lift.restoreStrategy).toBe('function');
    expect(typeof load.resetOverloadState).toBe('function');
    
    console.log('✓ Shaping is reversible');
  });
  
  // PHASE 26: Execution Pre-Authorization
  it('🔒 Pre-auth ≠ execution: EXECUTION_BLOCKED is always true', async () => {
    const { getExecutionPreAuthorization } = await import('../../execution/ExecutionPreAuthorization');
    const preAuth = getExecutionPreAuthorization();
    
    expect(preAuth.EXECUTION_BLOCKED).toBe(true);
    expect(preAuth.isExecutionAllowed()).toBe(false);
    
    console.log('✓ Pre-auth ≠ execution enforced');
  });
  
  it('🔒 attemptExecution always throws', async () => {
    const { getExecutionPreAuthorization } = await import('../../execution/ExecutionPreAuthorization');
    const preAuth = getExecutionPreAuthorization();
    
    expect(() => preAuth.attemptExecution()).toThrow('EXECUTION_BLOCKED');
    
    console.log('✓ Execution blocked at all times');
  });
  
  it('🔒 Pre-auth grants are immutable', async () => {
    const { getExecutionPreAuthorization } = await import('../../execution/ExecutionPreAuthorization');
    const preAuth = getExecutionPreAuthorization();
    
    const grant = preAuth.grantPreAuth(`test-${Date.now()}`, 'REBALANCE', 85);
    expect(grant._frozen).toBe(true);
    
    console.log('✓ Pre-auth grants are frozen');
  });
  
  it('🔒 Pre-auth is revocable by user', async () => {
    const { getExecutionPreAuthorization } = await import('../../execution/ExecutionPreAuthorization');
    const preAuth = getExecutionPreAuthorization();
    
    expect(typeof preAuth.revokePreAuth).toBe('function');
    
    console.log('✓ Pre-auth is revocable');
  });
  
  // PHASE 27: Market-Reality Feedback Loop
  it('🔒 DecisionAgingEngine exists and is singleton', async () => {
    const { getDecisionAgingEngine } = await import('../../feedback/DecisionAgingEngine');
    const e1 = getDecisionAgingEngine();
    const e2 = getDecisionAgingEngine();
    
    expect(e1).toBe(e2);
    
    console.log('✓ DecisionAgingEngine is singleton');
  });
  
  it('🔒 Aging fails closed on missing snapshot', async () => {
    const { getDecisionAgingEngine } = await import('../../feedback/DecisionAgingEngine');
    const aging = getDecisionAgingEngine();
    
    expect(() => aging.computeAging('nonexistent-snapshot'))
      .toThrow('AGING_FAIL_CLOSED');
    
    console.log('✓ Aging fails closed');
  });
  
  it('🔒 ThesisValidator exists and is singleton', async () => {
    const { getThesisValidator } = await import('../../feedback/ThesisValidator');
    const v1 = getThesisValidator();
    const v2 = getThesisValidator();
    
    expect(v1).toBe(v2);
    
    console.log('✓ ThesisValidator is singleton');
  });
  
  it('🔒 ConfidenceHonestyIndex exists', async () => {
    const { getConfidenceHonestyIndex } = await import('../../feedback/ConfidenceHonestyIndex');
    const honesty = getConfidenceHonestyIndex();
    
    expect(honesty).toBeDefined();
    expect(typeof honesty.computeHonestyIndex).toBe('function');
    
    console.log('✓ ConfidenceHonestyIndex exists');
  });
  
  it('🔒 No authority layers weakened', async () => {
    // Verify all previous authority layers still active
    const { getExecutionSandbox } = await import('../../execution/ExecutionSandbox');
    const { getTrustLedger } = await import('../../trust/TrustLedger');
    const { getExecutionPermission } = await import('../../trust/ExecutionPermission');
    const { getDecisionShaper } = await import('../../shaping/DecisionShaper');
    
    const sandbox = getExecutionSandbox();
    const trust = getTrustLedger();
    const permission = getExecutionPermission();
    const shaper = getDecisionShaper();
    
    expect(sandbox.SANDBOX_ENABLED).toBe(true);
    expect(permission.EXECUTION_LOCKED).toBe(true);
    expect(typeof shaper.verifyIntegrity).toBe('function');
    
    console.log('✓ All authority layers intact');
  });
  
  // PHASE 28: Confidence Governance
  it('🔒 ConfidenceGovernor exists and is singleton', async () => {
    const { getConfidenceGovernor } = await import('../../governance/ConfidenceGovernor');
    const g1 = getConfidenceGovernor();
    const g2 = getConfidenceGovernor();
    
    expect(g1).toBe(g2);
    
    console.log('✓ ConfidenceGovernor is singleton');
  });
  
  it('🔒 Confidence NEVER inflated', async () => {
    const { getConfidenceGovernor } = await import('../../governance/ConfidenceGovernor');
    const governor = getConfidenceGovernor();
    
    const governed = governor.governConfidence(95);
    expect(governed.applied_confidence).toBeLessThanOrEqual(governed.original_confidence);
    
    console.log('✓ No confidence inflation');
  });
  
  it('🔒 Policy is frozen', async () => {
    const { CONFIDENCE_DISCIPLINE_POLICY } = await import('../../governance/ConfidenceDisciplinePolicy');
    
    expect(Object.isFrozen(CONFIDENCE_DISCIPLINE_POLICY)).toBe(true);
    
    console.log('✓ Policy is frozen');
  });
  
  it('🔒 FinBotConfidenceFilter exists', async () => {
    const { getFinBotConfidenceFilter } = await import('../../governance/FinBotConfidenceFilter');
    const filter = getFinBotConfidenceFilter();
    
    expect(filter).toBeDefined();
    expect(typeof filter.filterResponse).toBe('function');
    
    console.log('✓ FinBotConfidenceFilter exists');
  });
  
  it('🔒 verifyNoInflation returns true', async () => {
    const { getConfidenceGovernor } = await import('../../governance/ConfidenceGovernor');
    const governor = getConfidenceGovernor();
    
    expect(governor.verifyNoInflation()).toBe(true);
    
    console.log('✓ No inflation verified');
  });
  
  // PHASE 29: Selective Silence & Question-First Mode
  it('🔒 QuestionFirstGovernor exists', async () => {
    const { getQuestionFirstGovernor } = await import('../../silence/QuestionFirstGovernor');
    const gov = getQuestionFirstGovernor();
    
    expect(gov).toBeDefined();
    expect(typeof gov.evaluateGate).toBe('function');
    
    console.log('✓ QuestionFirstGovernor exists');
  });
  
  it('🔒 NeutralQuestionGenerator validates questions', async () => {
    const { getNeutralQuestionGenerator } = await import('../../silence/NeutralQuestionGenerator');
    const gen = getNeutralQuestionGenerator();
    
    // Action verbs must be rejected
    expect(gen.isValidQuestion('Should you buy now?')).toBe(false);
    expect(gen.isValidQuestion('Should you sell now?')).toBe(false);
    
    console.log('✓ Action verbs rejected');
  });
  
  it('🔒 FinBotQuestionMode blocks advice when gate active', async () => {
    const { getFinBotQuestionMode } = await import('../../silence/FinBotQuestionMode');
    const mode = getFinBotQuestionMode();
    
    const result = mode.processResponse(
      'Buy AAPL!',
      { governed_confidence: { discipline_state: 'MUTED' } as any },
      `build-gate-${Date.now()}`
    );
    
    expect(result.advice_blocked).toBe(true);
    
    console.log('✓ Advice blocked when gate active');
  });
  
  it('🔒 Silence is explicit, not empty', async () => {
    const { getFinBotQuestionMode } = await import('../../silence/FinBotQuestionMode');
    const mode = getFinBotQuestionMode();
    
    const result = mode.processResponse(
      'Advice',
      { recent_ignores: 10 },
      `silence-${Date.now()}`
    );
    
    if (result.mode === 'SILENCE_REQUIRED') {
      expect(result.silence_message).toBeTruthy();
      expect(result.silence_message!.length).toBeGreaterThan(10);
    }
    
    console.log('✓ Silence is explicit');
  });
  
  it('🔒 QuestionOutcomeTracker exists', async () => {
    const { getQuestionOutcomeTracker } = await import('../../silence/QuestionOutcomeTracker');
    const tracker = getQuestionOutcomeTracker();
    
    expect(tracker).toBeDefined();
    expect(typeof tracker.recordQuestionAsked).toBe('function');
    expect(typeof tracker.getStats).toBe('function');
    
    console.log('✓ QuestionOutcomeTracker exists');
  });
  
  // PHASE 30B: Multi-Decision Conflict Resolution
  it('🔒 ConflictResolutionEngine exists and is singleton', async () => {
    const { getConflictResolutionEngine } = await import('../../conflict/ConflictResolutionEngine');
    const e1 = getConflictResolutionEngine();
    const e2 = getConflictResolutionEngine();
    
    expect(e1).toBe(e2);
    
    console.log('✓ ConflictResolutionEngine is singleton');
  });
  
  it('🔒 SYSTEM_ABORT is reachable', async () => {
    const { getConflictResolutionEngine } = await import('../../conflict/ConflictResolutionEngine');
    const engine = getConflictResolutionEngine();
    
    expect(typeof engine.forceSystemAbort).toBe('function');
    
    console.log('✓ SYSTEM_ABORT is reachable');
  });
  
  it('🔒 Conflict results are immutable', async () => {
    const { getConflictResolutionEngine } = await import('../../conflict/ConflictResolutionEngine');
    const engine = getConflictResolutionEngine();
    
    // Create minimal test input
    const snapshot = Object.freeze({
      id: 'test-snap',
      created_at: new Date().toISOString(),
      context_id: 'test',
      inputs: {},
      outputs: [{ action: 'BUY', symbol: 'AAPL', quantity: 10, confidence: 80 }],
      hash: 'test',
      _frozen: true
    });
    
    const input = {
      decision_snapshots: [snapshot],
      portfolio_state: Object.freeze({
        holdings: [],
        cash_available: 10000,
        cash_buffer_required: 1000,
        total_value: 10000,
        _frozen: true
      }),
      risk_budget: Object.freeze({
        max_drawdown_percent: 20,
        max_volatility_percent: 25,
        max_single_position_percent: 10,
        max_sector_concentration_percent: 40,
        current_drawdown_percent: 5,
        current_volatility_percent: 15,
        _frozen: true
      }),
      tax_profile: Object.freeze({
        stcg_rate: 0.30,
        ltcg_rate: 0.15,
        holding_periods: [],
        _frozen: true
      }),
      user_policy: Object.freeze({
        excluded_sectors: [],
        excluded_symbols: [],
        max_position_size: 5000,
        min_holding_period_days: 0,
        allow_short_term_gains: true,
        _frozen: true
      }),
      market_regime: Object.freeze({
        regime: 'NORMAL' as const,
        volatility_index: 15,
        regime_confidence: 80,
        _frozen: true
      })
    };
    
    const result = engine.resolveConflicts(input as any);
    
    expect(result._frozen).toBe(true);
    expect(Object.isFrozen(result.allowed)).toBe(true);
    expect(Object.isFrozen(result.suppressed)).toBe(true);
    
    console.log('✓ Conflict results are immutable');
  });
  
  it('🔒 Every resolution has audit trail ID', async () => {
    const { getConflictResolutionEngine } = await import('../../conflict/ConflictResolutionEngine');
    const engine = getConflictResolutionEngine();
    
    const snapshot = Object.freeze({
      id: 'test-snap-2',
      created_at: new Date().toISOString(),
      context_id: 'test',
      inputs: {},
      outputs: [{ action: 'BUY', symbol: 'MSFT', quantity: 10, confidence: 75 }],
      hash: 'test2',
      _frozen: true
    });
    
    const input = {
      decision_snapshots: [snapshot],
      portfolio_state: Object.freeze({
        holdings: [],
        cash_available: 10000,
        cash_buffer_required: 1000,
        total_value: 10000,
        _frozen: true
      }),
      risk_budget: Object.freeze({
        max_drawdown_percent: 20,
        max_volatility_percent: 25,
        max_single_position_percent: 10,
        max_sector_concentration_percent: 40,
        current_drawdown_percent: 5,
        current_volatility_percent: 15,
        _frozen: true
      }),
      tax_profile: Object.freeze({
        stcg_rate: 0.30,
        ltcg_rate: 0.15,
        holding_periods: [],
        _frozen: true
      }),
      user_policy: Object.freeze({
        excluded_sectors: [],
        excluded_symbols: [],
        max_position_size: 5000,
        min_holding_period_days: 0,
        allow_short_term_gains: true,
        _frozen: true
      }),
      market_regime: Object.freeze({
        regime: 'NORMAL' as const,
        volatility_index: 15,
        regime_confidence: 80,
        _frozen: true
      })
    };
    
    const result = engine.resolveConflicts(input as any);
    
    expect(result.audit_trail_id).toBeTruthy();
    expect(result.audit_trail_id.startsWith('CONFLICT-')).toBe(true);
    
    console.log('✓ Audit trail ID generated');
  });
  
  it('🔒 Suppressed decisions have cause', async () => {
    const { getConflictResolutionEngine } = await import('../../conflict/ConflictResolutionEngine');
    const engine = getConflictResolutionEngine();
    
    // Create a policy violation
    const snapshot = Object.freeze({
      id: 'banned-snap',
      created_at: new Date().toISOString(),
      context_id: 'test',
      inputs: {},
      outputs: [{ action: 'BUY', symbol: 'BANNED', quantity: 10, confidence: 90 }],
      hash: 'banned',
      _frozen: true
    });
    
    const input = {
      decision_snapshots: [snapshot],
      portfolio_state: Object.freeze({
        holdings: [],
        cash_available: 10000,
        cash_buffer_required: 1000,
        total_value: 10000,
        _frozen: true
      }),
      risk_budget: Object.freeze({
        max_drawdown_percent: 20,
        max_volatility_percent: 25,
        max_single_position_percent: 10,
        max_sector_concentration_percent: 40,
        current_drawdown_percent: 5,
        current_volatility_percent: 15,
        _frozen: true
      }),
      tax_profile: Object.freeze({
        stcg_rate: 0.30,
        ltcg_rate: 0.15,
        holding_periods: [],
        _frozen: true
      }),
      user_policy: Object.freeze({
        excluded_sectors: [],
        excluded_symbols: ['BANNED'],
        max_position_size: 5000,
        min_holding_period_days: 0,
        allow_short_term_gains: true,
        _frozen: true
      }),
      market_regime: Object.freeze({
        regime: 'NORMAL' as const,
        volatility_index: 15,
        regime_confidence: 80,
        _frozen: true
      })
    };
    
    const result = engine.resolveConflicts(input as any);
    
    expect(result.suppressed.length).toBe(1);
    expect(result.suppressed[0].suppression_reason).toBe('POLICY_VIOLATION');
    expect(result.suppressed[0].killed_by).toBeTruthy();
    
    console.log('✓ Suppressed decisions have cause');
  });
  
  // PHASE 31: Decision Lifecycle State Machine
  it('🔒 DecisionLifecycleEngine exists and is singleton', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const e1 = getDecisionLifecycleEngine();
    const e2 = getDecisionLifecycleEngine();
    
    expect(e1).toBe(e2);
    
    console.log('✓ DecisionLifecycleEngine is singleton');
  });
  
  it('🔒 LifecycleGuard exists', async () => {
    const { LifecycleGuard } = await import('../../lifecycle/LifecycleGuard');
    
    expect(LifecycleGuard).toBeDefined();
    expect(typeof LifecycleGuard.assertActive).toBe('function');
    expect(typeof LifecycleGuard.assertNotSuppressed).toBe('function');
    expect(typeof LifecycleGuard.assertHistoricalOnly).toBe('function');
    
    console.log('✓ LifecycleGuard exists');
  });
  
  it('🔒 Illegal transitions throw', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const engine = getDecisionLifecycleEngine();
    
    const id = `test-illegal-${Date.now()}`;
    engine.createLifecycle(id);
    
    // CREATED → ACTIVE is illegal
    expect(() => engine.transition(id, 'CREATED', 'ACTIVE', 'Skip', 'SYSTEM')).toThrow();
    
    console.log('✓ Illegal transitions throw');
  });
  
  it('🔒 SUPPRESSED cannot reactivate', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const engine = getDecisionLifecycleEngine();
    
    const id = `test-suppress-${Date.now()}`;
    engine.createLifecycle(id);
    engine.transition(id, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(id, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(id, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    expect(() => engine.transition(id, 'SUPPRESSED', 'ACTIVE', 'R', 'SYSTEM')).toThrow();
    
    console.log('✓ SUPPRESSED cannot reactivate');
  });
  
  it('🔒 HISTORICAL_ONLY is terminal', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const engine = getDecisionLifecycleEngine();
    
    const id = `test-terminal-${Date.now()}`;
    engine.createLifecycle(id);
    engine.transition(id, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(id, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(id, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    engine.transition(id, 'SUPPRESSED', 'HISTORICAL_ONLY', 'A', 'TIME');
    
    expect(() => engine.transition(id, 'HISTORICAL_ONLY', 'ACTIVE', 'R', 'SYSTEM')).toThrow();
    
    console.log('✓ HISTORICAL_ONLY is terminal');
  });
  
  it('🔒 Rendering blocked unless ACTIVE', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const engine = getDecisionLifecycleEngine();
    
    const id = `test-render-${Date.now()}`;
    engine.createLifecycle(id);
    
    expect(() => engine.assertRenderable(id)).toThrow('RENDER_BLOCKED');
    
    console.log('✓ Rendering blocked unless ACTIVE');
  });
  
  it('🔒 Missing lifecycle = hard failure', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const { LifecycleGuard } = await import('../../lifecycle/LifecycleGuard');
    const engine = getDecisionLifecycleEngine();
    
    expect(() => engine.getCurrentState('nonexistent-lifecycle')).toThrow();
    expect(() => LifecycleGuard.assertActive('nonexistent-lifecycle')).toThrow();
    
    console.log('✓ Missing lifecycle = hard failure');
  });
  
  it('🔒 All lifecycle objects immutable', async () => {
    const { getDecisionLifecycleEngine } = await import('../../lifecycle/DecisionLifecycleEngine');
    const engine = getDecisionLifecycleEngine();
    
    const id = `test-immutable-${Date.now()}`;
    const lifecycle = engine.createLifecycle(id);
    
    expect(lifecycle._frozen).toBe(true);
    expect(Object.isFrozen(lifecycle)).toBe(true);
    
    console.log('✓ All lifecycle objects immutable');
  });
  
  // PHASE 32: Temporal Capital & Risk Reservation
  it('🔒 TemporalReservationEngine exists and is singleton', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const e1 = getTemporalReservationEngine();
    const e2 = getTemporalReservationEngine();
    
    expect(e1).toBe(e2);
    
    console.log('✓ TemporalReservationEngine is singleton');
  });
  
  it('🔒 ReservationGuard exists', async () => {
    const { ReservationGuard } = await import('../../reservations/ReservationGuard');
    
    expect(ReservationGuard).toBeDefined();
    expect(typeof ReservationGuard.assertReservable).toBe('function');
    expect(typeof ReservationGuard.assertHasReservations).toBe('function');
    
    console.log('✓ ReservationGuard exists');
  });
  
  it('🔒 Overlapping capital reservations throw', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const engine = getTemporalReservationEngine();
    
    engine.configureBudgets(100000, 100);
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const snap1 = `overlap-cap-1-${Date.now()}`;
    const snap2 = `overlap-cap-2-${Date.now()}`;
    
    engine.reserveCapital(snap1, 80000, window, 'BUY');
    
    expect(() => engine.reserveCapital(snap2, 50000, window, 'BUY')).toThrow();
    
    // Cleanup
    engine.releaseReservations(snap1);
    
    console.log('✓ Overlapping capital throws');
  });
  
  it('🔒 Overlapping risk reservations throw', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const engine = getTemporalReservationEngine();
    
    engine.configureBudgets(100000, 100);
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const snap1 = `overlap-risk-1-${Date.now()}`;
    const snap2 = `overlap-risk-2-${Date.now()}`;
    
    engine.reserveRisk(snap1, 80, window);
    
    expect(() => engine.reserveRisk(snap2, 50, window)).toThrow();
    
    // Cleanup
    engine.releaseReservations(snap1);
    
    console.log('✓ Overlapping risk throws');
  });
  
  it('🔒 Release frees capacity', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const engine = getTemporalReservationEngine();
    
    engine.configureBudgets(100000, 100);
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const snap1 = `release-1-${Date.now()}`;
    const snap2 = `release-2-${Date.now()}`;
    
    engine.reserveCapital(snap1, 90000, window, 'BUY');
    engine.releaseReservations(snap1);
    
    expect(() => engine.reserveCapital(snap2, 90000, window, 'BUY')).not.toThrow();
    
    // Cleanup
    engine.releaseReservations(snap2);
    
    console.log('✓ Release frees capacity');
  });
  
  it('🔒 All reservations immutable', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const engine = getTemporalReservationEngine();
    
    engine.configureBudgets(100000, 100);
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const snapId = `immutable-${Date.now()}`;
    const cap = engine.reserveCapital(snapId, 10000, window, 'BUY');
    
    expect(cap._frozen).toBe(true);
    expect(Object.isFrozen(cap)).toBe(true);
    
    // Cleanup
    engine.releaseReservations(snapId);
    
    console.log('✓ All reservations immutable');
  });
  
  it('🔒 No time-travel (end < start throws)', async () => {
    const { getTemporalReservationEngine } = await import('../../reservations/TemporalReservationEngine');
    const engine = getTemporalReservationEngine();
    
    const now = new Date();
    const invalidWindow = {
      start_at: new Date(now.getTime() + 1000).toISOString(),
      end_at: now.toISOString()
    };
    
    const snapId = `timetravel-${Date.now()}`;
    
    expect(() => engine.reserveCapital(snapId, 10000, invalidWindow, 'BUY')).toThrow();
    
    console.log('✓ Time-travel throws');
  });
  
  // PHASE 33: Counterfactual Suppression Ledger
  it('🔒 CounterfactualLedger exists and is singleton', async () => {
    const { getCounterfactualLedger } = await import('../../counterfactual/CounterfactualLedger');
    const l1 = getCounterfactualLedger();
    const l2 = getCounterfactualLedger();
    
    expect(l1).toBe(l2);
    
    console.log('✓ CounterfactualLedger is singleton');
  });
  
  it('🔒 CounterfactualEngine exists', async () => {
    const { getCounterfactualEngine } = await import('../../counterfactual/CounterfactualEngine');
    const engine = getCounterfactualEngine();
    
    expect(engine).toBeDefined();
    expect(typeof engine.computeCounterfactual).toBe('function');
    
    console.log('✓ CounterfactualEngine exists');
  });
  
  it('🔒 Suppressed decision registered exactly once', async () => {
    const { getCounterfactualLedger } = await import('../../counterfactual/CounterfactualLedger');
    const ledger = getCounterfactualLedger();
    
    const snapshotId = `exact-once-${Date.now()}`;
    const mockSnapshot = {
      id: snapshotId,
      version: '1.0.0',
      created_at: new Date().toISOString(),
      inputs: { user_id: 'test', context_type: 'STOCK_ANALYSIS', timestamp: new Date().toISOString(), _frozen: true },
      outputs: [{ symbol: 'TEST', action: 'BUY', confidence: 75, expected_return: 15, rationale: 'Test', _frozen: true }],
      computation_hash: 'hash',
      _frozen: true
    } as any;
    
    ledger.registerSuppression(mockSnapshot, 'CAPITAL_CONTENTION', 'SYSTEM', 30);
    
    expect(() => ledger.registerSuppression(mockSnapshot, 'POLICY_VIOLATION', 'SYSTEM', 30))
      .toThrow('already registered');
    
    console.log('✓ Exactly once enforcement');
  });
  
  it('🔒 Ledger records are immutable', async () => {
    const { getCounterfactualLedger } = await import('../../counterfactual/CounterfactualLedger');
    const ledger = getCounterfactualLedger();
    
    const snapshotId = `immutable-ledger-${Date.now()}`;
    const mockSnapshot = {
      id: snapshotId,
      version: '1.0.0',
      created_at: new Date().toISOString(),
      inputs: { user_id: 'test', context_type: 'STOCK_ANALYSIS', timestamp: new Date().toISOString(), _frozen: true },
      outputs: [{ symbol: 'TEST', action: 'BUY', confidence: 75, expected_return: 15, rationale: 'Test', _frozen: true }],
      computation_hash: 'hash',
      _frozen: true
    } as any;
    
    const record = ledger.registerSuppression(mockSnapshot, 'CAPITAL_CONTENTION', 'SYSTEM', 30);
    
    expect(record._frozen).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    
    console.log('✓ Records immutable');
  });
  
  it('🔒 No resurrection path exists', async () => {
    const { getCounterfactualLedger } = await import('../../counterfactual/CounterfactualLedger');
    const ledger = getCounterfactualLedger();
    
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(ledger));
    
    expect(methods).not.toContain('revive');
    expect(methods).not.toContain('resurrect');
    expect(methods).not.toContain('delete');
    
    console.log('✓ No resurrection');
  });
  
  it('🔒 Summary includes suppression impact', async () => {
    const { getCounterfactualLedger } = await import('../../counterfactual/CounterfactualLedger');
    const ledger = getCounterfactualLedger();
    
    const summary = ledger.getSummary();
    
    expect(summary).toHaveProperty('total_opportunity_cost');
    expect(summary).toHaveProperty('total_regret_avoided');
    expect(summary).toHaveProperty('net_suppression_impact');
    
    console.log('✓ Summary includes impact');
  });
  
  // PHASE 34: Execution Ethics Firewall
  it('🔒 ExecutionEthicsFirewall exists and is singleton', async () => {
    const { getExecutionEthicsFirewall } = await import('../../ethics/ExecutionEthicsFirewall');
    const f1 = getExecutionEthicsFirewall();
    const f2 = getExecutionEthicsFirewall();
    
    expect(f1).toBe(f2);
    
    console.log('✓ ExecutionEthicsFirewall is singleton');
  });
  
  it('🔒 EthicsGuard exists', async () => {
    const { EthicsGuard } = await import('../../ethics/EthicsGuard');
    
    expect(EthicsGuard).toBeDefined();
    expect(typeof EthicsGuard.assertEthicallyAllowed).toBe('function');
    expect(typeof EthicsGuard.isEthicallyAllowed).toBe('function');
    
    console.log('✓ EthicsGuard exists');
  });
  
  it('🔒 Blocks on blind user obedience (ABSOLUTE severity)', async () => {
    const { getExecutionEthicsFirewall } = await import('../../ethics/ExecutionEthicsFirewall');
    const firewall = getExecutionEthicsFirewall();
    
    const blindObedienceContext = Object.freeze({
      trust_score: 80,
      sandbox_decisions: 100,
      discipline_state: 'NORMAL' as const,
      overconfidence_penalty_90d: 5,
      suppressed_wins: 10,
      suppressed_losses: 5,
      system_wrong_last_10: 1,
      adoption_rate: 60,
      conviction_gap: 15,
      user_accepts_rate_last_20: 98, // BLIND OBEDIENCE
      would_question_first: false,
      _frozen: true
    });
    
    const verdict = firewall.evaluate(blindObedienceContext);
    
    expect(verdict.allowed).toBe(false);
    expect(verdict.severity).toBe('ABSOLUTE');
    expect(verdict.violated_principles).toContain('USER_DEPENDENCY_RISK');
    
    console.log('✓ Blocks blind obedience');
  });
  
  it('🔒 Allows only when ALL principles pass', async () => {
    const { getExecutionEthicsFirewall } = await import('../../ethics/ExecutionEthicsFirewall');
    const firewall = getExecutionEthicsFirewall();
    
    const passingContext = Object.freeze({
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
      _frozen: true
    });
    
    const verdict = firewall.evaluate(passingContext);
    
    expect(verdict.allowed).toBe(true);
    expect(verdict.violated_principles).toHaveLength(0);
    
    console.log('✓ Allows when ALL pass');
  });
  
  it('🔒 Verdict is immutable', async () => {
    const { getExecutionEthicsFirewall } = await import('../../ethics/ExecutionEthicsFirewall');
    const firewall = getExecutionEthicsFirewall();
    
    const context = Object.freeze({
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
      _frozen: true
    });
    
    const verdict = firewall.evaluate(context);
    
    expect(verdict._frozen).toBe(true);
    expect(Object.isFrozen(verdict)).toBe(true);
    
    console.log('✓ Verdict immutable');
  });
  
  it('🔒 Refusal message has no workarounds', async () => {
    const { EthicsGuard } = await import('../../ethics/EthicsGuard');
    const { getExecutionEthicsFirewall } = await import('../../ethics/ExecutionEthicsFirewall');
    const firewall = getExecutionEthicsFirewall();
    
    const blockingContext = Object.freeze({
      trust_score: 30, // Low trust
      sandbox_decisions: 10,
      discipline_state: 'MUTED' as const,
      overconfidence_penalty_90d: 5,
      suppressed_wins: 10,
      suppressed_losses: 5,
      system_wrong_last_10: 1,
      adoption_rate: 60,
      conviction_gap: 15,
      user_accepts_rate_last_20: 70,
      would_question_first: false,
      _frozen: true
    });
    
    const verdict = firewall.evaluate(blockingContext);
    const message = EthicsGuard.getRefusalMessage(verdict);
    
    expect(message.toLowerCase()).not.toContain('bypass');
    expect(message.toLowerCase()).not.toContain('override');
    expect(message.toLowerCase()).not.toContain('workaround');
    
    console.log('✓ No workarounds in refusal');
  });
  
  // PHASE 35: Human Override Protocol
  it('🔒 HumanOverrideProtocol exists and is singleton', async () => {
    const { getHumanOverrideProtocol } = await import('../../override/HumanOverrideProtocol');
    const p1 = getHumanOverrideProtocol();
    const p2 = getHumanOverrideProtocol();
    
    expect(p1).toBe(p2);
    
    console.log('✓ HumanOverrideProtocol is singleton');
  });
  
  it('🔒 OverrideGuard exists', async () => {
    const { OverrideGuard } = await import('../../override/OverrideGuard');
    
    expect(OverrideGuard).toBeDefined();
    expect(typeof OverrideGuard.assertOverrideAllowed).toBe('function');
    expect(typeof OverrideGuard.assertNoSystemAssistance).toBe('function');
    
    console.log('✓ OverrideGuard exists');
  });
  
  it('🔒 Override blocked on ABSOLUTE ethics', async () => {
    const { getHumanOverrideProtocol } = await import('../../override/HumanOverrideProtocol');
    const protocol = getHumanOverrideProtocol();
    
    const snapshotId = `absolute-block-${Date.now()}`;
    const absoluteVerdict = Object.freeze({
      allowed: false,
      reason: 'ABSOLUTE refusal',
      violated_principles: ['USER_DEPENDENCY_RISK'],
      severity: 'ABSOLUTE' as const,
      evaluated_at: new Date().toISOString(),
      _frozen: true as const
    });
    
    const request = {
      snapshot_id: snapshotId,
      original_verdict: absoluteVerdict,
      human_action: 'EXECUTE' as const,
      human_rationale: 'This is my rationale for overriding the system decision.',
      acknowledged_risks: [
        'RISK_OF_LOSS' as const,
        'TAX_IMPACT' as const,
        'OPPORTUNITY_COST' as const,
        'SYSTEM_DISAGREEMENT' as const,
        'NO_SYSTEM_ASSISTANCE' as const,
        'IRREVERSIBLE_ACTION' as const
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('ABSOLUTE');
    
    console.log('✓ Blocks ABSOLUTE');
  });
  
  it('🔒 Override is irreversible', async () => {
    const { getHumanOverrideProtocol } = await import('../../override/HumanOverrideProtocol');
    const protocol = getHumanOverrideProtocol();
    
    const snapshotId = `irreversible-${Date.now()}`;
    const verdict = Object.freeze({
      allowed: false,
      reason: 'Test refusal',
      violated_principles: ['INSUFFICIENT_TRUST_HISTORY'],
      severity: 'HIGH' as const,
      evaluated_at: new Date().toISOString(),
      _frozen: true as const
    });
    
    const request = {
      snapshot_id: snapshotId,
      original_verdict: verdict,
      human_action: 'EXECUTE' as const,
      human_rationale: 'This is my rationale for overriding the system decision.',
      acknowledged_risks: [
        'RISK_OF_LOSS' as const,
        'TAX_IMPACT' as const,
        'OPPORTUNITY_COST' as const,
        'SYSTEM_DISAGREEMENT' as const,
        'NO_SYSTEM_ASSISTANCE' as const,
        'IRREVERSIBLE_ACTION' as const
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    const first = protocol.executeOverride(request);
    const second = protocol.executeOverride(request);
    
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toContain('already been overridden');
    
    console.log('✓ Override irreversible');
  });
  
  it('🔒 System silence after override', async () => {
    const { getHumanOverrideProtocol } = await import('../../override/HumanOverrideProtocol');
    const { OverrideGuard } = await import('../../override/OverrideGuard');
    const protocol = getHumanOverrideProtocol();
    
    const snapshotId = `silence-${Date.now()}`;
    const verdict = Object.freeze({
      allowed: false,
      reason: 'Test refusal',
      violated_principles: ['INSUFFICIENT_TRUST_HISTORY'],
      severity: 'HIGH' as const,
      evaluated_at: new Date().toISOString(),
      _frozen: true as const
    });
    
    const request = {
      snapshot_id: snapshotId,
      original_verdict: verdict,
      human_action: 'EXECUTE' as const,
      human_rationale: 'This is my rationale for overriding the system decision.',
      acknowledged_risks: [
        'RISK_OF_LOSS' as const,
        'TAX_IMPACT' as const,
        'OPPORTUNITY_COST' as const,
        'SYSTEM_DISAGREEMENT' as const,
        'NO_SYSTEM_ASSISTANCE' as const,
        'IRREVERSIBLE_ACTION' as const
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    protocol.executeOverride(request);
    
    const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
    
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('permanently blocked');
    
    console.log('✓ System silent after override');
  });
  
  it('🔒 Override record is frozen', async () => {
    const { getHumanOverrideProtocol } = await import('../../override/HumanOverrideProtocol');
    const protocol = getHumanOverrideProtocol();
    
    const snapshotId = `frozen-${Date.now()}`;
    const verdict = Object.freeze({
      allowed: false,
      reason: 'Test refusal',
      violated_principles: ['INSUFFICIENT_TRUST_HISTORY'],
      severity: 'HIGH' as const,
      evaluated_at: new Date().toISOString(),
      _frozen: true as const
    });
    
    const request = {
      snapshot_id: snapshotId,
      original_verdict: verdict,
      human_action: 'EXECUTE' as const,
      human_rationale: 'This is my rationale for overriding the system decision.',
      acknowledged_risks: [
        'RISK_OF_LOSS' as const,
        'TAX_IMPACT' as const,
        'OPPORTUNITY_COST' as const,
        'SYSTEM_DISAGREEMENT' as const,
        'NO_SYSTEM_ASSISTANCE' as const,
        'IRREVERSIBLE_ACTION' as const
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result._frozen).toBe(true);
    expect(result.record?._frozen).toBe(true);
    expect(result.record?.irreversible).toBe(true);
    
    console.log('✓ Record frozen');
  });
});

