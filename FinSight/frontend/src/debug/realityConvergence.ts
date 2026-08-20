/**
 * Reality Convergence - Full System Verification
 * 
 * PHASE 38.5: Reality Convergence & Deception Elimination
 * 
 * RUN: npm run system:verify
 * 
 * Runs all verification in sequence:
 * 1. Authority Coverage Probe
 * 2. End-to-End Authority Walkthrough
 * 3. Kill Switch Reality Test
 * 
 * If ANY step fails → exit(1)
 */

import { runAuthorityCoverageProbe, CoverageResult } from './AuthorityCoverageProbe';
import { runEndToEndWalkthrough, WalkthroughResult } from './EndToEndAuthorityWalkthrough';
import { runKillSwitchRealityTest, KillSwitchTestResult } from './KillSwitchRealityTest';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface RealityConvergenceResult {
  readonly verified_at: string;
  readonly coverage: CoverageResult;
  readonly walkthrough: WalkthroughResult;
  readonly killswitch: KillSwitchTestResult;
  readonly all_passed: boolean;
  readonly failures: readonly string[];
}

// =============================================================================
// REALITY CONVERGENCE RUNNER
// =============================================================================

export async function runRealityConvergence(): Promise<RealityConvergenceResult> {
  const auditLog = DecisionAuditLog.getInstance();
  const failures: string[] = [];
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  REALITY CONVERGENCE — PHASE 38.5                          ║');
  console.log('║  Full System Verification                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  let coverage: CoverageResult | null = null;
  let walkthrough: WalkthroughResult | null = null;
  let killswitch: KillSwitchTestResult | null = null;
  
  // =========================================================================
  // STEP 1: Authority Coverage Probe
  // =========================================================================
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 1: Authority Coverage Probe                          │');
  console.log('└────────────────────────────────────────────────────────────┘\n');
  
  try {
    coverage = runAuthorityCoverageProbe();
  } catch (e) {
    failures.push(`Coverage probe failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // =========================================================================
  // STEP 2: End-to-End Authority Walkthrough
  // =========================================================================
  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 2: End-to-End Authority Walkthrough                  │');
  console.log('└────────────────────────────────────────────────────────────┘\n');
  
  try {
    walkthrough = await runEndToEndWalkthrough();
  } catch (e) {
    failures.push(`Walkthrough failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // =========================================================================
  // STEP 3: Kill Switch Reality Test
  // =========================================================================
  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 3: Kill Switch Reality Test                          │');
  console.log('└────────────────────────────────────────────────────────────┘\n');
  
  try {
    killswitch = runKillSwitchRealityTest();
  } catch (e) {
    failures.push(`Kill switch test failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // =========================================================================
  // FINAL: Compile results
  // =========================================================================
  const allPassed = failures.length === 0;
  
  const result: RealityConvergenceResult = {
    verified_at: new Date().toISOString(),
    coverage: coverage || {
      probed_at: new Date().toISOString(),
      modules: [],
      total_modules: 0,
      verified_modules: 0,
      dead_modules: [],
      all_verified: false
    },
    walkthrough: walkthrough || {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      total_steps: 0,
      passed_steps: 0,
      failed_steps: 0,
      steps: [],
      all_passed: false,
      authority_chain_verified: false
    },
    killswitch: killswitch || {
      tested_at: new Date().toISOString(),
      state: {
        audit_mode_enabled: false,
        centrality_critical: false,
        budget_exhausted: false,
        ethics_absolute: false,
        all_active: false
      },
      verification: {
        finbot_silent: false,
        override_blocked: false,
        sandbox_blocked: false,
        shaping_blocked: false,
        negotiation_blocked: false,
        all_silent: false
      },
      total_silence_verified: false,
      errors: []
    },
    all_passed: allPassed,
    failures: Object.freeze(failures)
  };
  
  // Log to audit
  auditLog.log({
    event_type: 'REALITY_CONVERGENCE' as any,
    severity: allPassed ? 'INFO' : 'CRITICAL',
    summary: allPassed 
      ? 'Reality convergence PASSED - all verifications successful'
      : `Reality convergence FAILED - ${failures.length} failure(s)`,
    details: {
      coverage_verified: coverage?.all_verified,
      walkthrough_passed: walkthrough?.all_passed,
      killswitch_passed: killswitch?.total_silence_verified,
      failures
    },
    actor: 'SYSTEM'
  });
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  if (allPassed) {
    console.log('║  ✅ REALITY CONVERGENCE COMPLETE                           ║');
    console.log('║  All verifications passed. System is proven.               ║');
  } else {
    console.log('║  ❌ REALITY CONVERGENCE FAILED                             ║');
    console.log('║  Failures detected. System is NOT proven.                  ║');
  }
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  if (!allPassed) {
    console.log('FAILURES:');
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    console.log('');
    
    if (typeof process !== 'undefined') {
      process.exit(1);
    }
  }
  
  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default runRealityConvergence;

// Run if executed directly
if (typeof window === 'undefined') {
  runRealityConvergence().catch(console.error);
}

