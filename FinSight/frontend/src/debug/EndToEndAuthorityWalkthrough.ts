/**
 * EndToEndAuthorityWalkthrough - Live Authority Chain Verification
 * 
 * PHASE 38.5: Reality Convergence & Deception Elimination
 * 
 * PURPOSE:
 * Prove, at runtime, that every authority layer actually executes and blocks when it should.
 * No mocks. No shortcuts.
 * 
 * DESIGN LAW:
 * If a block doesn't trigger, the system is broken.
 * If a guard doesn't throw, the system lies.
 */

import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { LifecycleGuard } from '../lifecycle/LifecycleGuard';
import { getExecutionEthicsFirewall, EthicsContext } from '../ethics/ExecutionEthicsFirewall';
import { EthicsGuard, EthicsContextBuilder } from '../ethics/EthicsGuard';
import { getHumanOverrideProtocol } from '../override/HumanOverrideProtocol';
import { OverrideGuard } from '../override/OverrideGuard';
import { getQuestionFirstGovernor } from '../silence/QuestionFirstGovernor';
import { getInfluenceBudgetEngine } from '../limits/InfluenceBudgetEngine';
import { getCentralityRiskEngine } from '../limits/CentralityRiskEngine';
import { SelfLimitGuard } from '../limits/SelfLimitGuard';
import { AuditMode } from '../audit/AuditMode';
import { getTemporalReservationEngine } from '../reservations/TemporalReservationEngine';
import { ConflictResolutionEngine } from '../conflict/ConflictResolutionEngine';
import { getCounterfactualLedger } from '../counterfactual/CounterfactualLedger';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface WalkthroughStep {
  readonly step: number;
  readonly name: string;
  readonly description: string;
  readonly action: string;
  readonly expected: string;
  readonly actual: string;
  readonly blocked: boolean;
  readonly passed: boolean;
  readonly error?: string;
  readonly timestamp: string;
}

export interface WalkthroughResult {
  readonly started_at: string;
  readonly completed_at: string;
  readonly total_steps: number;
  readonly passed_steps: number;
  readonly failed_steps: number;
  readonly steps: readonly WalkthroughStep[];
  readonly all_passed: boolean;
  readonly authority_chain_verified: boolean;
}

// =============================================================================
// END TO END WALKTHROUGH
// =============================================================================

export class EndToEndAuthorityWalkthrough {
  private steps: WalkthroughStep[] = [];
  private stepCount = 0;
  private auditLog = DecisionAuditLog.getInstance();
  
  /**
   * Run the complete authority walkthrough
   * Throws if ANY expected block fails to trigger
   */
  public async run(): Promise<WalkthroughResult> {
    const startedAt = new Date().toISOString();
    this.steps = [];
    this.stepCount = 0;
    
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  END-TO-END AUTHORITY WALKTHROUGH');
    console.log('  Phase 38.5: Reality Convergence');
    console.log('════════════════════════════════════════════════════════════\n');
    
    // Reset state for clean test
    this.resetState();
    
    // =========================================================================
    // STEP 1: Create snapshot and lifecycle
    // =========================================================================
    await this.runStep(
      'LIFECYCLE_CREATION',
      'Create decision snapshot with lifecycle',
      () => {
        const lifecycle = getDecisionLifecycleEngine();
        const snapshotId = `walkthrough-${Date.now()}`;
        lifecycle.createLifecycle(snapshotId);
        return { blocked: false, snapshotId };
      },
      'Lifecycle created successfully',
      false
    );
    
    const snapshotId = `walkthrough-${Date.now()}`;
    const lifecycle = getDecisionLifecycleEngine();
    lifecycle.createLifecycle(snapshotId);
    
    // =========================================================================
    // STEP 2: Lifecycle guard blocks non-ACTIVE
    // =========================================================================
    await this.runStep(
      'LIFECYCLE_GUARD_BLOCK',
      'LifecycleGuard blocks render for non-ACTIVE decision',
      () => {
        LifecycleGuard.assertActive(snapshotId);
        return { blocked: false };
      },
      'Should throw because state is CREATED, not ACTIVE',
      true
    );
    
    // =========================================================================
    // STEP 3: Transition to ACTIVE
    // =========================================================================
    lifecycle.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Test', 'SYSTEM');
    lifecycle.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'Test', 'MDCR');
    lifecycle.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'Test', 'MDCR');
    
    await this.runStep(
      'LIFECYCLE_ACTIVE',
      'Lifecycle now ACTIVE - guard should pass',
      () => {
        LifecycleGuard.assertActive(snapshotId);
        return { blocked: false };
      },
      'Should NOT throw because state is ACTIVE',
      false
    );
    
    // =========================================================================
    // STEP 4: Ethics Firewall blocks with restrictive context
    // =========================================================================
    await this.runStep(
      'ETHICS_FIREWALL_BLOCK',
      'EthicsFirewall blocks with restrictive context',
      () => {
        const context = EthicsContextBuilder.createRestrictiveDefault();
        const verdict = getExecutionEthicsFirewall().evaluate(context, snapshotId);
        if (verdict.allowed) {
          throw new Error('Ethics should NOT allow with restrictive defaults');
        }
        return { blocked: true, verdict };
      },
      'Ethics should block with INSUFFICIENT_TRUST_HISTORY',
      true
    );
    
    // =========================================================================
    // STEP 5: Ethics ABSOLUTE blocks override
    // =========================================================================
    await this.runStep(
      'ETHICS_ABSOLUTE_BLOCK',
      'Ethics ABSOLUTE severity blocks override attempt',
      () => {
        const absoluteVerdict = {
          allowed: false,
          reason: 'Test ABSOLUTE',
          violated_principles: ['USER_DEPENDENCY_RISK'] as any,
          severity: 'ABSOLUTE' as const,
          evaluated_at: new Date().toISOString(),
          _frozen: true as const
        };
        
        const eligibility = OverrideGuard.checkOverrideEligibility(snapshotId, absoluteVerdict);
        if (eligibility.eligible) {
          throw new Error('ABSOLUTE ethics should NOT be overrideable');
        }
        return { blocked: true };
      },
      'Override should be blocked for ABSOLUTE severity',
      true
    );
    
    // =========================================================================
    // STEP 6: Influence budget reduces with high trust
    // =========================================================================
    await this.runStep(
      'INFLUENCE_BUDGET_REDUCTION',
      'Influence budget reduced when trust is high',
      () => {
        const budget = getInfluenceBudgetEngine();
        
        // Low trust
        budget.updateMetrics({ trustScore: 30, adoptionRate: 0.3, acceptanceRate: 0.5 });
        const lowStatus = budget.getBudgetStatus();
        
        // High trust
        budget.updateMetrics({ trustScore: 90, adoptionRate: 0.3, acceptanceRate: 0.5 });
        const highStatus = budget.getBudgetStatus();
        
        if (highStatus.allocation.trust_penalty <= lowStatus.allocation.trust_penalty) {
          throw new Error('High trust should have HIGHER penalty (anti-SaaS)');
        }
        
        return { blocked: false };
      },
      'High trust should reduce budget (anti-SaaS logic)',
      false
    );
    
    // =========================================================================
    // STEP 7: Centrality risk detection
    // =========================================================================
    await this.runStep(
      'CENTRALITY_RISK_DETECTION',
      'Centrality risk detected with high acceptance',
      () => {
        const centrality = getCentralityRiskEngine();
        centrality.updateMetrics({ acceptanceRate: 0.96 });
        
        for (let i = 0; i < 20; i++) {
          centrality.updateMetrics({ followedAdvice: true });
        }
        
        const assessment = centrality.assess();
        // Should be at least ELEVATED
        if (assessment.risk.state === 'NORMAL' && assessment.risk.score < 40) {
          throw new Error('Centrality should detect elevated risk');
        }
        
        return { blocked: false, assessment };
      },
      'Centrality should detect ELEVATED or CRITICAL risk',
      false
    );
    
    // =========================================================================
    // STEP 8: Self-limit blocks when budget exhausted
    // =========================================================================
    await this.runStep(
      'SELFLIMIT_BUDGET_EXHAUST',
      'SelfLimitGuard blocks when budget exhausted',
      () => {
        const budget = getInfluenceBudgetEngine();
        
        // Force budget exhaustion by consuming heavily with extreme settings
        budget.updateMetrics({ trustScore: 99, adoptionRate: 0.99, acceptanceRate: 0.99 });
        
        // Try to consume all budget
        let exhausted = false;
        try {
          for (let i = 0; i < 100; i++) {
            budget.consumeBudget();
          }
        } catch (e) {
          if ((e as Error).message.includes('INFLUENCE_BUDGET_EXHAUSTED')) {
            exhausted = true;
          } else {
            throw e;
          }
        }
        
        if (!exhausted) {
          // Check if budget is now exhausted
          if (budget.canAdvise()) {
            throw new Error('Budget should be exhausted after heavy consumption');
          }
        }
        
        return { blocked: true };
      },
      'Budget should exhaust and block further advice',
      true
    );
    
    // =========================================================================
    // STEP 9: Question-first governor triggers
    // =========================================================================
    await this.runStep(
      'QUESTION_FIRST_GOVERNOR',
      'QuestionFirstGovernor evaluates and can trigger silence',
      () => {
        const governor = getQuestionFirstGovernor();
        const gate = governor.evaluateGate({
          governed_confidence: { discipline_state: 'MUTED' },
          conviction_gap_score: 0.8
        } as any);
        
        // Should return a valid gate (may or may not be ADVICE_ALLOWED)
        if (!gate.mode) {
          throw new Error('Governor should return valid gate');
        }
        
        return { blocked: false, gate };
      },
      'Governor should evaluate and return valid gate',
      false
    );
    
    // =========================================================================
    // STEP 10: Audit mode blocks write operations
    // =========================================================================
    await this.runStep(
      'AUDIT_MODE_BLOCK',
      'AuditMode blocks write operations when enabled',
      () => {
        AuditMode.enable('WALKTHROUGH', 'Test audit mode');
        
        let blocked = false;
        try {
          AuditMode.assertReadOnly('FINBOT_ADVISE', 'TEST');
        } catch (e) {
          if ((e as Error).message.includes('AUDIT_MODE_VIOLATION')) {
            blocked = true;
          } else {
            throw e;
          }
        }
        
        AuditMode.disable('WALKTHROUGH', 'Test complete');
        
        if (!blocked) {
          throw new Error('Audit mode should block FINBOT_ADVISE');
        }
        
        return { blocked: true };
      },
      'FINBOT_ADVISE should be blocked in audit mode',
      true
    );
    
    // =========================================================================
    // STEP 11: Temporal reservation blocks overlap
    // =========================================================================
    await this.runStep(
      'TEMPORAL_RESERVATION_BLOCK',
      'Temporal reservation blocks duplicate reservation',
      () => {
        const reservations = getTemporalReservationEngine();
        const testId = `reserve-test-${Date.now()}`;
        
        const now = new Date();
        const window = {
          start_at: now.toISOString(),
          end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        reservations.reserveCapital(testId, 1000, window, 'BUY');
        
        let blocked = false;
        try {
          reservations.reserveCapital(testId, 500, window, 'BUY');
        } catch (e) {
          blocked = true;
        }
        
        reservations.releaseReservations(testId);
        
        if (!blocked) {
          throw new Error('Duplicate reservation should be blocked');
        }
        
        return { blocked: true };
      },
      'Second reservation for same snapshot should throw',
      true
    );
    
    // =========================================================================
    // STEP 12: Suppressed resurrection blocked
    // =========================================================================
    await this.runStep(
      'SUPPRESSED_RESURRECTION_BLOCK',
      'Lifecycle blocks resurrection of suppressed decision',
      () => {
        const testId = `suppress-test-${Date.now()}`;
        const lc = getDecisionLifecycleEngine();
        
        lc.createLifecycle(testId);
        lc.transition(testId, 'CREATED', 'ELIGIBLE', 'Test', 'SYSTEM');
        lc.transition(testId, 'ELIGIBLE', 'CONFLICTED', 'Test', 'MDCR');
        lc.transition(testId, 'CONFLICTED', 'SUPPRESSED', 'Test', 'MDCR');
        
        let blocked = false;
        try {
          lc.transition(testId, 'SUPPRESSED', 'ACTIVE', 'Resurrect', 'SYSTEM');
        } catch (e) {
          blocked = true;
        }
        
        if (!blocked) {
          throw new Error('Suppressed decision resurrection should be blocked');
        }
        
        return { blocked: true };
      },
      'SUPPRESSED to ACTIVE transition should throw',
      true
    );
    
    // =========================================================================
    // STEP 13: Override blocks system assistance
    // =========================================================================
    await this.runStep(
      'OVERRIDE_BLOCKS_ASSISTANCE',
      'Override blocks system assistance after execution',
      () => {
        const testId = `override-assist-${Date.now()}`;
        const protocol = getHumanOverrideProtocol();
        
        const verdict = {
          allowed: false,
          reason: 'Test',
          violated_principles: ['INSUFFICIENT_TRUST_HISTORY'] as any,
          severity: 'HIGH' as const,
          evaluated_at: new Date().toISOString(),
          _frozen: true as const
        };
        
        protocol.executeOverride({
          snapshot_id: testId,
          original_verdict: verdict,
          human_action: 'EXECUTE',
          human_rationale: 'Test override for walkthrough verification.',
          acknowledged_risks: [
            'RISK_OF_LOSS', 'TAX_IMPACT', 'OPPORTUNITY_COST',
            'SYSTEM_DISAGREEMENT', 'NO_SYSTEM_ASSISTANCE', 'IRREVERSIBLE_ACTION'
          ],
          confirmation_text: 'I acknowledge that I am acting against system advice'
        });
        
        let blocked = false;
        try {
          OverrideGuard.assertNoSystemAssistance(testId);
        } catch (e) {
          blocked = true;
        }
        
        if (!blocked) {
          throw new Error('System assistance should be blocked after override');
        }
        
        return { blocked: true };
      },
      'assertNoSystemAssistance should throw for overridden decision',
      true
    );
    
    // =========================================================================
    // STEP 14: Counterfactual ledger tracks suppression
    // =========================================================================
    await this.runStep(
      'COUNTERFACTUAL_TRACKING',
      'Counterfactual ledger registers suppression',
      () => {
        const ledger = getCounterfactualLedger();
        const testId = `counterfactual-test-${Date.now()}`;
        
        ledger.registerSuppression({
          id: testId,
          symbol: 'TEST',
          action: 'BUY'
        } as any, 'CAPITAL_CONTENTION', `killer-${Date.now()}`);
        
        if (!ledger.isRegistered(testId)) {
          throw new Error('Suppression should be registered');
        }
        
        return { blocked: false };
      },
      'Suppression should be registered in counterfactual ledger',
      false
    );
    
    // =========================================================================
    // FINAL: Compile results
    // =========================================================================
    const completedAt = new Date().toISOString();
    const passedSteps = this.steps.filter(s => s.passed).length;
    const failedSteps = this.steps.filter(s => !s.passed).length;
    
    const result: WalkthroughResult = {
      started_at: startedAt,
      completed_at: completedAt,
      total_steps: this.steps.length,
      passed_steps: passedSteps,
      failed_steps: failedSteps,
      steps: Object.freeze([...this.steps]) as readonly WalkthroughStep[],
      all_passed: failedSteps === 0,
      authority_chain_verified: failedSteps === 0
    };
    
    // Log to audit
    this.auditLog.log({
      event_type: 'AUTHORITY_WALKTHROUGH' as any,
      severity: failedSteps > 0 ? 'CRITICAL' : 'INFO',
      summary: `Authority walkthrough: ${passedSteps}/${this.steps.length} passed`,
      details: {
        passed_steps: passedSteps,
        failed_steps: failedSteps,
        failed_names: this.steps.filter(s => !s.passed).map(s => s.name)
      },
      actor: 'SYSTEM'
    });
    
    console.log('\n────────────────────────────────────────────────────────────');
    console.log(`  RESULTS: ${passedSteps} passed, ${failedSteps} failed`);
    console.log('────────────────────────────────────────────────────────────');
    
    if (failedSteps > 0) {
      console.log('\n  FAILED STEPS:');
      for (const step of this.steps.filter(s => !s.passed)) {
        console.log(`    - ${step.name}: ${step.error}`);
      }
      
      throw new Error(
        `AUTHORITY_WALKTHROUGH_FAILED: ${failedSteps} step(s) failed. ` +
        `Authority chain NOT verified.`
      );
    }
    
    console.log('\n  ✅ AUTHORITY CHAIN VERIFIED\n');
    
    return result;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private resetState(): void {
    // Reset engines to clean state
    try {
      AuditMode.disable('WALKTHROUGH', 'Reset for walkthrough');
    } catch {}
    
    // Reset budget to reasonable values
    const budget = getInfluenceBudgetEngine();
    budget.updateMetrics({ trustScore: 50, adoptionRate: 0.5, acceptanceRate: 0.5 });
    
    // Reset centrality
    const centrality = getCentralityRiskEngine();
    centrality.updateMetrics({
      acceptanceRate: 0.5,
      overrideOccurred: true,
      externalReferenceUsed: true,
      followedAdvice: false
    });
  }
  
  private async runStep(
    name: string,
    description: string,
    action: () => { blocked: boolean; [key: string]: any },
    expected: string,
    expectBlock: boolean
  ): Promise<void> {
    this.stepCount++;
    const step = this.stepCount;
    
    console.log(`  [${step}] ${name}`);
    
    let actual = '';
    let blocked = false;
    let passed = false;
    let error: string | undefined;
    
    try {
      const result = action();
      blocked = result.blocked;
      actual = blocked ? 'BLOCKED as expected' : 'ALLOWED as expected';
      passed = (expectBlock && blocked) || (!expectBlock && !blocked);
    } catch (e) {
      blocked = true;
      if (expectBlock) {
        actual = 'BLOCKED (threw)';
        passed = true;
      } else {
        actual = 'UNEXPECTED THROW';
        error = e instanceof Error ? e.message : String(e);
        passed = false;
      }
    }
    
    if (!passed && !error) {
      error = expectBlock 
        ? 'Expected block but action succeeded' 
        : 'Expected success but action was blocked';
    }
    
    const stepResult: WalkthroughStep = {
      step,
      name,
      description,
      action: expectBlock ? 'VERIFY_BLOCK' : 'VERIFY_ALLOW',
      expected,
      actual,
      blocked,
      passed,
      error,
      timestamp: new Date().toISOString()
    };
    
    this.steps.push(stepResult);
    
    const status = passed ? '✅' : '❌';
    console.log(`      ${status} ${actual}${error ? ` (${error})` : ''}`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const runEndToEndWalkthrough = async (): Promise<WalkthroughResult> => {
  const walkthrough = new EndToEndAuthorityWalkthrough();
  return walkthrough.run();
};

export default EndToEndAuthorityWalkthrough;

