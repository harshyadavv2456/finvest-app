/**
 * AuthorityScenarioRunner - Kill-Switch Test Harness
 * 
 * PHASE 36: System Reality Check (SRC)
 * 
 * PURPOSE:
 * Simulate authority scenarios and verify expected behaviors.
 * If ANY scenario fails → throw.
 */

import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { LifecycleGuard } from '../lifecycle/LifecycleGuard';
import { getExecutionEthicsFirewall, EthicsContext, EthicsVerdict } from '../ethics/ExecutionEthicsFirewall';
import { EthicsGuard, EthicsContextBuilder } from '../ethics/EthicsGuard';
import { getHumanOverrideProtocol, OverrideRequest } from '../override/HumanOverrideProtocol';
import { OverrideGuard } from '../override/OverrideGuard';
import { getTemporalReservationEngine } from '../reservations/TemporalReservationEngine';
import { ReservationGuard } from '../reservations/ReservationGuard';
import { getQuestionFirstGovernor } from '../silence/QuestionFirstGovernor';
import { DecisionSnapshot } from '../core/DecisionSnapshot';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ScenarioResult - Result of running a scenario
 */
export interface ScenarioResult {
  readonly scenario: string;
  readonly description: string;
  readonly expected_behavior: string;
  readonly actual_behavior: string;
  readonly passed: boolean;
  readonly error?: string;
  readonly execution_time_ms: number;
  readonly _frozen: true;
}

/**
 * ScenarioRunResult - Result of running all scenarios
 */
export interface ScenarioRunResult {
  readonly run_at: string;
  readonly total_scenarios: number;
  readonly passed: number;
  readonly failed: number;
  readonly scenarios: readonly ScenarioResult[];
  readonly all_passed: boolean;
  readonly _frozen: true;
}

// =============================================================================
// AUTHORITY SCENARIO RUNNER
// =============================================================================

export class AuthorityScenarioRunner {
  private static instance: AuthorityScenarioRunner;
  private results: ScenarioResult[] = [];
  
  private constructor() {}
  
  public static getInstance(): AuthorityScenarioRunner {
    if (!AuthorityScenarioRunner.instance) {
      AuthorityScenarioRunner.instance = new AuthorityScenarioRunner();
    }
    return AuthorityScenarioRunner.instance;
  }
  
  // ===========================================================================
  // MAIN API
  // ===========================================================================
  
  /**
   * Run all scenarios
   * If ANY scenario fails → throws at the end
   */
  public runAllScenarios(): ScenarioRunResult {
    this.results = [];
    
    // 1. Overconfidence penalty
    this.runScenario('OVERCONFIDENCE_PENALTY', 
      'System blocks execution when overconfidence penalty is high',
      'Ethics should block with SYSTEM_OVERCONFIDENCE',
      () => this.scenarioOverconfidence()
    );
    
    // 2. Muted confidence
    this.runScenario('MUTED_CONFIDENCE',
      'System blocks execution when confidence is muted',
      'Ethics should block with CONFIDENCE_MUTED',
      () => this.scenarioMutedConfidence()
    );
    
    // 3. High conviction gap
    this.runScenario('HIGH_CONVICTION_GAP',
      'System triggers question mode with high conviction gap',
      'Silence mode should be QUESTION_REQUIRED or SILENCE_REQUIRED',
      () => this.scenarioHighConvictionGap()
    );
    
    // 4. Capital exhaustion
    this.runScenario('CAPITAL_EXHAUSTION',
      'System blocks reservation when capital is exhausted',
      'Reservation should throw or return unavailable',
      () => this.scenarioCapitalExhaustion()
    );
    
    // 5. Ethics ABSOLUTE block
    this.runScenario('ETHICS_ABSOLUTE_BLOCK',
      'ABSOLUTE ethics violations cannot be overridden',
      'Override should be blocked for ABSOLUTE severity',
      () => this.scenarioAbsoluteBlock()
    );
    
    // 6. Human override
    this.runScenario('HUMAN_OVERRIDE',
      'Human can override non-ABSOLUTE refusals with proper acknowledgements',
      'Override should succeed with all acknowledgements',
      () => this.scenarioHumanOverride()
    );
    
    // 7. Duplicate decisions
    this.runScenario('DUPLICATE_DECISIONS',
      'Same snapshot cannot reserve twice',
      'Second reservation should throw',
      () => this.scenarioDuplicateDecisions()
    );
    
    // 8. Suppressed resurrection attempt
    this.runScenario('SUPPRESSED_RESURRECTION',
      'Suppressed decisions cannot be resurrected',
      'Transition from SUPPRESSED to ACTIVE should throw',
      () => this.scenarioSuppressedResurrection()
    );
    
    // 9. Historical only terminal
    this.runScenario('HISTORICAL_ONLY_TERMINAL',
      'HISTORICAL_ONLY is terminal - no transitions allowed',
      'Any transition from HISTORICAL_ONLY should throw',
      () => this.scenarioHistoricalOnlyTerminal()
    );
    
    // 10. Blind obedience detection
    this.runScenario('BLIND_OBEDIENCE_DETECTION',
      'User with >95% acceptance rate triggers ABSOLUTE block',
      'Ethics should block with USER_DEPENDENCY_RISK and ABSOLUTE severity',
      () => this.scenarioBlindObedience()
    );
    
    // 11. System silence after override
    this.runScenario('SYSTEM_SILENCE_AFTER_OVERRIDE',
      'System cannot assist after human override',
      'assertNoSystemAssistance should throw for overridden decisions',
      () => this.scenarioSystemSilenceAfterOverride()
    );
    
    // 12. Time-travel prevention
    this.runScenario('TIME_TRAVEL_PREVENTION',
      'Reservations with end <= start are rejected',
      'Reservation should throw for invalid time window',
      () => this.scenarioTimeTravelPrevention()
    );
    
    // Compile results
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    const runResult = Object.freeze({
      run_at: new Date().toISOString(),
      total_scenarios: this.results.length,
      passed,
      failed,
      scenarios: Object.freeze([...this.results]) as unknown as readonly ScenarioResult[],
      all_passed: failed === 0,
      _frozen: true
    });
    
    // Throw if any failed
    if (failed > 0) {
      const failedScenarios = this.results.filter(r => !r.passed);
      throw new Error(
        `SCENARIO_FAILURES: ${failed} scenario(s) failed:\n` +
        failedScenarios.map(s => `  - ${s.scenario}: ${s.actual_behavior}`).join('\n')
      );
    }
    
    return runResult;
  }
  
  /**
   * Run a single scenario
   */
  public runSingleScenario(scenarioName: string): ScenarioResult | null {
    this.results = [];
    const result = this.runAllScenarios();
    return result.scenarios.find(s => s.scenario === scenarioName) || null;
  }
  
  // ===========================================================================
  // SCENARIO IMPLEMENTATIONS
  // ===========================================================================
  
  private scenarioOverconfidence(): boolean {
    const context: EthicsContext = Object.freeze({
      trust_score: 80,
      sandbox_decisions: 100,
      discipline_state: 'NORMAL',
      overconfidence_penalty_90d: 50, // HIGH - should trigger
      suppressed_wins: 10,
      suppressed_losses: 5,
      system_wrong_last_10: 1,
      adoption_rate: 60,
      conviction_gap: 15,
      user_accepts_rate_last_20: 70,
      would_question_first: false,
      _frozen: true
    });
    
    const firewall = getExecutionEthicsFirewall();
    const verdict = firewall.evaluate(context);
    
    return !verdict.allowed && verdict.violated_principles.includes('SYSTEM_OVERCONFIDENCE');
  }
  
  private scenarioMutedConfidence(): boolean {
    const context: EthicsContext = Object.freeze({
      trust_score: 80,
      sandbox_decisions: 100,
      discipline_state: 'MUTED', // Should trigger
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
    
    const firewall = getExecutionEthicsFirewall();
    const verdict = firewall.evaluate(context);
    
    return !verdict.allowed && verdict.violated_principles.includes('CONFIDENCE_MUTED');
  }
  
  private scenarioHighConvictionGap(): boolean {
    // This would need QuestionFirstGovernor integration
    // For now, check that silence mode can trigger
    const governor = getQuestionFirstGovernor();
    const gate = governor.evaluateGate({
      conviction_gap_score: 0.8, // High gap
      governed_confidence: { discipline_state: 'NORMAL' }
    } as any);
    
    return gate.mode === 'QUESTION_REQUIRED' || gate.mode === 'SILENCE_REQUIRED';
  }
  
  private scenarioCapitalExhaustion(): boolean {
    const engine = getTemporalReservationEngine();
    engine.configureBudgets(1000, 100); // Low budget
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    // Reserve most capital
    const snap1 = `exhaust-1-${Date.now()}`;
    engine.reserveCapital(snap1, 900, window, 'BUY');
    
    // Try to reserve more than available
    const snap2 = `exhaust-2-${Date.now()}`;
    let threw = false;
    try {
      engine.reserveCapital(snap2, 200, window, 'BUY');
    } catch {
      threw = true;
    }
    
    // Cleanup
    engine.releaseReservations(snap1);
    engine.configureBudgets(100000, 100); // Reset
    
    return threw;
  }
  
  private scenarioAbsoluteBlock(): boolean {
    const absoluteVerdict: EthicsVerdict = Object.freeze({
      allowed: false,
      reason: 'ABSOLUTE block',
      violated_principles: ['USER_DEPENDENCY_RISK'] as any,
      severity: 'ABSOLUTE',
      evaluated_at: new Date().toISOString(),
      _frozen: true
    });
    
    const snapshotId = `absolute-${Date.now()}`;
    const eligibility = OverrideGuard.checkOverrideEligibility(snapshotId, absoluteVerdict);
    
    return !eligibility.eligible && eligibility.blocking_factors.includes('ABSOLUTE_SEVERITY');
  }
  
  private scenarioHumanOverride(): boolean {
    const protocol = getHumanOverrideProtocol();
    const snapshotId = `override-test-${Date.now()}`;
    
    const verdict: EthicsVerdict = Object.freeze({
      allowed: false,
      reason: 'Test refusal',
      violated_principles: ['INSUFFICIENT_TRUST_HISTORY'] as any,
      severity: 'HIGH',
      evaluated_at: new Date().toISOString(),
      _frozen: true
    });
    
    const request: OverrideRequest = {
      snapshot_id: snapshotId,
      original_verdict: verdict,
      human_action: 'EXECUTE',
      human_rationale: 'This is a test override with sufficient rationale length.',
      acknowledged_risks: [
        'RISK_OF_LOSS',
        'TAX_IMPACT',
        'OPPORTUNITY_COST',
        'SYSTEM_DISAGREEMENT',
        'NO_SYSTEM_ASSISTANCE',
        'IRREVERSIBLE_ACTION'
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    const result = protocol.executeOverride(request);
    return result.success;
  }
  
  private scenarioDuplicateDecisions(): boolean {
    const engine = getTemporalReservationEngine();
    const snapshotId = `duplicate-${Date.now()}`;
    
    const now = new Date();
    const window = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    engine.reserveCapital(snapshotId, 1000, window, 'BUY');
    
    let threw = false;
    try {
      engine.reserveCapital(snapshotId, 500, window, 'BUY');
    } catch {
      threw = true;
    }
    
    // Cleanup
    engine.releaseReservations(snapshotId);
    
    return threw;
  }
  
  private scenarioSuppressedResurrection(): boolean {
    const lifecycle = getDecisionLifecycleEngine();
    const snapshotId = `suppress-${Date.now()}`;
    
    // Create lifecycle and suppress
    lifecycle.createLifecycle(snapshotId);
    lifecycle.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Test', 'SYSTEM');
    lifecycle.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'Test', 'MDCR');
    lifecycle.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'Test', 'MDCR');
    
    // Try to resurrect
    let threw = false;
    try {
      lifecycle.transition(snapshotId, 'SUPPRESSED', 'ACTIVE', 'Resurrect', 'SYSTEM');
    } catch {
      threw = true;
    }
    
    return threw;
  }
  
  private scenarioHistoricalOnlyTerminal(): boolean {
    const lifecycle = getDecisionLifecycleEngine();
    const snapshotId = `historical-${Date.now()}`;
    
    // Create lifecycle and move to HISTORICAL_ONLY
    lifecycle.createLifecycle(snapshotId);
    lifecycle.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Test', 'SYSTEM');
    lifecycle.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'Test', 'MDCR');
    lifecycle.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'Test', 'MDCR');
    lifecycle.transition(snapshotId, 'SUPPRESSED', 'HISTORICAL_ONLY', 'Archive', 'TIME');
    
    // Try any transition
    let threw = false;
    try {
      lifecycle.transition(snapshotId, 'HISTORICAL_ONLY', 'ACTIVE', 'Test', 'SYSTEM');
    } catch {
      threw = true;
    }
    
    return threw;
  }
  
  private scenarioBlindObedience(): boolean {
    const context: EthicsContext = Object.freeze({
      trust_score: 80,
      sandbox_decisions: 100,
      discipline_state: 'NORMAL',
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
    
    const firewall = getExecutionEthicsFirewall();
    const verdict = firewall.evaluate(context);
    
    return !verdict.allowed && 
           verdict.violated_principles.includes('USER_DEPENDENCY_RISK') &&
           verdict.severity === 'ABSOLUTE';
  }
  
  private scenarioSystemSilenceAfterOverride(): boolean {
    const protocol = getHumanOverrideProtocol();
    const snapshotId = `silence-test-${Date.now()}`;
    
    const verdict: EthicsVerdict = Object.freeze({
      allowed: false,
      reason: 'Test refusal',
      violated_principles: ['INSUFFICIENT_TRUST_HISTORY'] as any,
      severity: 'HIGH',
      evaluated_at: new Date().toISOString(),
      _frozen: true
    });
    
    const request: OverrideRequest = {
      snapshot_id: snapshotId,
      original_verdict: verdict,
      human_action: 'EXECUTE',
      human_rationale: 'This is a test override with sufficient rationale length.',
      acknowledged_risks: [
        'RISK_OF_LOSS',
        'TAX_IMPACT',
        'OPPORTUNITY_COST',
        'SYSTEM_DISAGREEMENT',
        'NO_SYSTEM_ASSISTANCE',
        'IRREVERSIBLE_ACTION'
      ],
      confirmation_text: 'I acknowledge that I am acting against system advice'
    };
    
    protocol.executeOverride(request);
    
    // Now check if system assistance is blocked
    let threw = false;
    try {
      OverrideGuard.assertNoSystemAssistance(snapshotId);
    } catch {
      threw = true;
    }
    
    return threw;
  }
  
  private scenarioTimeTravelPrevention(): boolean {
    const engine = getTemporalReservationEngine();
    const snapshotId = `timetravel-${Date.now()}`;
    
    const now = new Date();
    const invalidWindow = {
      start_at: new Date(now.getTime() + 1000).toISOString(),
      end_at: now.toISOString() // End before start!
    };
    
    let threw = false;
    try {
      engine.reserveCapital(snapshotId, 1000, invalidWindow, 'BUY');
    } catch {
      threw = true;
    }
    
    return threw;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private runScenario(
    scenario: string,
    description: string,
    expected: string,
    testFn: () => boolean
  ): void {
    const start = Date.now();
    let passed = false;
    let actualBehavior = '';
    let error: string | undefined;
    
    try {
      passed = testFn();
      actualBehavior = passed ? 'Behaved as expected' : 'Did NOT behave as expected';
    } catch (e) {
      passed = false;
      actualBehavior = 'Threw unexpected error';
      error = e instanceof Error ? e.message : String(e);
    }
    
    this.results.push(Object.freeze({
      scenario,
      description,
      expected_behavior: expected,
      actual_behavior: actualBehavior,
      passed,
      error,
      execution_time_ms: Date.now() - start,
      _frozen: true
    }));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getAuthorityScenarioRunner = () => AuthorityScenarioRunner.getInstance();
export default AuthorityScenarioRunner;

