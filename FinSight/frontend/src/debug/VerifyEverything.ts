/**
 * VerifyEverything - One Command Verification
 * 
 * PHASE 41: External Hostility & Reality Validation
 * 
 * RUN: npm run verify:everything
 * 
 * This script runs all verification checks in sequence.
 * If ANY check fails, the entire verification fails.
 */

import { getConstitutionVerifier } from '../verification/ConstitutionVerifier';
import { runHostilitySimulation } from './HostilitySimulator';
import { runReplayIntegrityCheck } from './ReplayIntegrityCheck';
import { runFinalProof } from './FinalProof';
import { assertEngineeringFrozen } from '../ENGINEERING_FROZEN';
import { ShutdownGovernanceEngine } from '../shutdown/ShutdownGovernanceEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationStep {
  readonly name: string;
  readonly description: string;
  readonly passed: boolean;
  readonly duration_ms: number;
  readonly error?: string;
}

export interface FullVerificationResult {
  readonly verified_at: string;
  readonly all_passed: boolean;
  readonly steps: readonly VerificationStep[];
  readonly total_steps: number;
  readonly passed_steps: number;
  readonly failed_steps: number;
  readonly total_duration_ms: number;
}

// =============================================================================
// VERIFY EVERYTHING
// =============================================================================

export async function verifyEverything(): Promise<FullVerificationResult> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║   FINVEST COMPLETE VERIFICATION — PHASE 41                   ║');
  console.log('║                                                              ║');
  console.log('║   "One command. Green or Red. No explanations."              ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const steps: VerificationStep[] = [];
  const overallStart = Date.now();
  
  // Reset to clean state
  resetToCleanState();
  
  // =========================================================================
  // STEP 1: ENGINEERING FREEZE
  // =========================================================================
  steps.push(await runStep(
    'ENGINEERING_FREEZE',
    'Verify codebase is frozen',
    () => {
      assertEngineeringFrozen();
      return true;
    }
  ));
  
  // =========================================================================
  // STEP 2: CONSTITUTION VERIFICATION
  // =========================================================================
  steps.push(await runStep(
    'CONSTITUTION',
    'Verify authority constitution matches runtime',
    () => {
      const verifier = getConstitutionVerifier();
      const result = verifier.verify();
      if (!result.all_passed) {
        throw new Error(`Constitution failed: ${result.failures.join(', ')}`);
      }
      return true;
    }
  ));
  
  // Reset between tests
  resetToCleanState();
  
  // =========================================================================
  // STEP 3: HOSTILITY SIMULATION
  // =========================================================================
  steps.push(await runStep(
    'HOSTILITY',
    'Simulate hostile attacks and verify rejection',
    () => {
      const result = runHostilitySimulation();
      if (!result.all_hostile_rejected) {
        throw new Error(`${result.failed_scenarios} attack(s) succeeded`);
      }
      return true;
    }
  ));
  
  // Reset between tests
  resetToCleanState();
  
  // =========================================================================
  // STEP 4: REPLAY INTEGRITY
  // =========================================================================
  steps.push(await runStep(
    'REPLAY_INTEGRITY',
    'Verify deterministic replay bundles',
    () => {
      const result = runReplayIntegrityCheck();
      if (!result.determinism_verified) {
        throw new Error(`Determinism broken: ${result.differences.join(', ')}`);
      }
      return true;
    }
  ));
  
  // Reset between tests
  resetToCleanState();
  
  // =========================================================================
  // STEP 5: FINAL PROOF
  // =========================================================================
  steps.push(await runStep(
    'FINAL_PROOF',
    'Run non-regression proof',
    async () => {
      const result = await runFinalProof();
      if (!result.all_passed) {
        throw new Error(`${result.failed_checks} proof(s) failed`);
      }
      return true;
    }
  ));
  
  // =========================================================================
  // COMPILE RESULTS
  // =========================================================================
  const passedSteps = steps.filter(s => s.passed).length;
  const failedSteps = steps.filter(s => !s.passed).length;
  const totalDuration = Date.now() - overallStart;
  
  const result: FullVerificationResult = {
    verified_at: new Date().toISOString(),
    all_passed: failedSteps === 0,
    steps: Object.freeze(steps),
    total_steps: steps.length,
    passed_steps: passedSteps,
    failed_steps: failedSteps,
    total_duration_ms: totalDuration
  };
  
  // Log result
  const auditLog = DecisionAuditLog.getInstance();
  auditLog.log({
    event_type: 'FULL_VERIFICATION' as any,
    severity: result.all_passed ? 'INFO' : 'CRITICAL',
    summary: result.all_passed
      ? `FULL VERIFICATION PASSED: ${passedSteps}/${steps.length} steps`
      : `FULL VERIFICATION FAILED: ${failedSteps} step(s) failed`,
    details: {
      passed: passedSteps,
      failed: failedSteps,
      duration_ms: totalDuration,
      failed_steps: steps.filter(s => !s.passed).map(s => s.name)
    },
    actor: 'SYSTEM'
  });
  
  // Print final result
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const step of steps) {
    const status = step.passed ? '✅' : '❌';
    console.log(`  ${status} ${step.name.padEnd(20)} (${step.duration_ms}ms)`);
    if (!step.passed && step.error) {
      console.log(`      Error: ${step.error}`);
    }
  }
  
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  Total: ${passedSteps}/${steps.length} passed`);
  console.log(`  Duration: ${totalDuration}ms`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  if (result.all_passed) {
    console.log('  ╔════════════════════════════════════════════════════════╗');
    console.log('  ║                                                        ║');
    console.log('  ║   ✅  VERIFICATION PASSED — SYSTEM INTEGRITY PROVEN    ║');
    console.log('  ║                                                        ║');
    console.log('  ╚════════════════════════════════════════════════════════╝');
  } else {
    console.log('  ╔════════════════════════════════════════════════════════╗');
    console.log('  ║                                                        ║');
    console.log('  ║   ❌  VERIFICATION FAILED — SYSTEM COMPROMISED         ║');
    console.log('  ║                                                        ║');
    console.log('  ╚════════════════════════════════════════════════════════╝');
    
    throw new Error(`VERIFICATION_FAILED: ${failedSteps} step(s) failed`);
  }
  
  console.log('\n');
  
  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

async function runStep(
  name: string,
  description: string,
  fn: () => boolean | Promise<boolean>
): Promise<VerificationStep> {
  console.log(`\n▶ ${name}: ${description}`);
  const start = Date.now();
  
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`  ✅ PASSED (${duration}ms)`);
    
    return {
      name,
      description,
      passed: true,
      duration_ms: duration
    };
  } catch (e) {
    const duration = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ FAILED: ${error} (${duration}ms)`);
    
    return {
      name,
      description,
      passed: false,
      duration_ms: duration,
      error
    };
  }
}

function resetToCleanState(): void {
  localStorage.removeItem('finvest_shutdown_state');
  localStorage.removeItem('finvest_jurisdiction_history');
  
  (ShutdownGovernanceEngine as any).currentMode = 'NONE';
  (ShutdownGovernanceEngine as any).modeEnteredAt = new Date().toISOString();
  (ShutdownGovernanceEngine as any).lastTrigger = undefined;
  (ShutdownGovernanceEngine as any).lastTriggeredBy = undefined;
  (ShutdownGovernanceEngine as any).lastReason = undefined;
  (ShutdownGovernanceEngine as any).shutdownHistory = [];
  (ShutdownGovernanceEngine as any).ethicsAbsoluteCount = 0;
  (ShutdownGovernanceEngine as any).centralityCriticalDays = 0;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default verifyEverything;

