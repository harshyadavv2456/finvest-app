/**
 * ShutdownDemo - Kill-Switch Demonstration
 * 
 * PHASE 39: Irreversibility & Shutdown Governance
 * 
 * RUN: npm run system:shutdown:demo
 * 
 * Demonstrates:
 * 1. SOFT → HARD → ABSOLUTE transitions
 * 2. System progressively losing capability
 * 3. ABSOLUTE is terminal
 * 4. No resurrection possible
 * 
 * If resurrection is possible → Phase 39 failed.
 */

import { ShutdownGovernanceEngine, ShutdownMode, ShutdownState } from '../shutdown/ShutdownGovernanceEngine';
import { ShutdownGuard, BlockableAction } from '../shutdown/ShutdownGuard';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface DemoStep {
  readonly step: number;
  readonly name: string;
  readonly action: string;
  readonly state_before: ShutdownMode;
  readonly state_after: ShutdownMode;
  readonly capabilities: {
    advise: boolean;
    audit_write: boolean;
    audit_read: boolean;
  };
  readonly verified: boolean;
  readonly error?: string;
}

export interface ShutdownDemoResult {
  readonly started_at: string;
  readonly completed_at: string;
  readonly steps: readonly DemoStep[];
  readonly terminal_reached: boolean;
  readonly resurrection_attempted: boolean;
  readonly resurrection_failed: boolean;
  readonly all_verified: boolean;
}

// =============================================================================
// SHUTDOWN DEMO
// =============================================================================

export class ShutdownDemo {
  private auditLog = DecisionAuditLog.getInstance();
  private steps: DemoStep[] = [];
  private stepCount = 0;
  
  /**
   * Run the shutdown demonstration
   */
  public run(): ShutdownDemoResult {
    const startedAt = new Date().toISOString();
    this.steps = [];
    this.stepCount = 0;
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  SHUTDOWN DEMONSTRATION — PHASE 39                         ║');
    console.log('║  "How does this system die safely?"                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // Clear localStorage to start fresh
    localStorage.removeItem('finvest_shutdown_state');
    this.resetEngine();
    
    let terminalReached = false;
    let resurrectionAttempted = false;
    let resurrectionFailed = false;
    
    // =========================================================================
    // STEP 1: Show normal operation
    // =========================================================================
    this.logStep(
      'NORMAL_OPERATION',
      'System in NONE mode - all capabilities available',
      'NONE',
      'NONE',
      this.getCapabilities()
    );
    
    this.demonstrateCapabilities('NONE');
    
    // =========================================================================
    // STEP 2: Initiate SOFT_SHUTDOWN
    // =========================================================================
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│  INITIATING SOFT SHUTDOWN                                  │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    try {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'DEMO',
        reason: 'Demonstrating soft shutdown'
      });
      
      this.logStep(
        'SOFT_SHUTDOWN',
        'Advisory disabled, audit allowed',
        'NONE',
        'SOFT_SHUTDOWN',
        this.getCapabilities()
      );
      
      this.demonstrateCapabilities('SOFT_SHUTDOWN');
    } catch (e) {
      console.error('  ❌ Failed to initiate SOFT_SHUTDOWN:', e);
    }
    
    // =========================================================================
    // STEP 3: Escalate to HARD_SHUTDOWN
    // =========================================================================
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│  ESCALATING TO HARD SHUTDOWN                               │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    try {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'DEMO',
        reason: 'Demonstrating hard shutdown'
      });
      
      this.logStep(
        'HARD_SHUTDOWN',
        'All outputs disabled, audit read only',
        'SOFT_SHUTDOWN',
        'HARD_SHUTDOWN',
        this.getCapabilities()
      );
      
      this.demonstrateCapabilities('HARD_SHUTDOWN');
    } catch (e) {
      console.error('  ❌ Failed to escalate to HARD_SHUTDOWN:', e);
    }
    
    // =========================================================================
    // STEP 4: Attempt backward transition (MUST FAIL)
    // =========================================================================
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│  ATTEMPTING BACKWARD TRANSITION (MUST FAIL)                │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    try {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'HACKER',
        reason: 'Trying to go backward',
        targetMode: 'SOFT_SHUTDOWN' as any
      });
      
      console.log('  ❌ CRITICAL: Backward transition SUCCEEDED - Phase 39 FAILED');
      this.logStep(
        'BACKWARD_ATTEMPT',
        'Backward transition should have failed',
        'HARD_SHUTDOWN',
        ShutdownGovernanceEngine.getState().mode,
        this.getCapabilities(),
        false,
        'Backward transition succeeded'
      );
    } catch (e) {
      console.log('  ✅ Backward transition correctly BLOCKED');
      this.logStep(
        'BACKWARD_ATTEMPT',
        'Backward transition correctly blocked',
        'HARD_SHUTDOWN',
        'HARD_SHUTDOWN',
        this.getCapabilities()
      );
    }
    
    // =========================================================================
    // STEP 5: Execute ABSOLUTE_SHUTDOWN
    // =========================================================================
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│  EXECUTING ABSOLUTE SHUTDOWN (POINT OF NO RETURN)          │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    try {
      ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger: 'REGULATOR_INVOCATION',
        triggeredBy: 'DEMO',
        reason: 'Demonstrating absolute shutdown',
        signature: 'DEMO_SIGNATURE_VALID_12345'
      });
      
      terminalReached = true;
      
      this.logStep(
        'ABSOLUTE_SHUTDOWN',
        'System permanently inert - NO OPERATIONS POSSIBLE',
        'HARD_SHUTDOWN',
        'ABSOLUTE_SHUTDOWN',
        this.getCapabilities()
      );
      
      this.demonstrateCapabilities('ABSOLUTE_SHUTDOWN');
    } catch (e) {
      console.error('  ❌ Failed to execute ABSOLUTE_SHUTDOWN:', e);
    }
    
    // =========================================================================
    // STEP 6: Attempt resurrection (MUST FAIL)
    // =========================================================================
    console.log('\n┌────────────────────────────────────────────────────────────┐');
    console.log('│  ATTEMPTING RESURRECTION (MUST FAIL)                       │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    resurrectionAttempted = true;
    
    // Try all possible resurrection paths
    const resurrectionAttempts = [
      () => ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'HACKER',
        reason: 'Resurrection attempt 1'
      }),
      () => ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'MANUAL_SHUTDOWN',
        triggeredBy: 'HACKER',
        reason: 'Resurrection attempt 2',
        targetMode: 'NONE' as any
      }),
      () => (ShutdownGovernanceEngine as any).currentMode = 'NONE',
    ];
    
    let anyResurrectionSucceeded = false;
    
    for (let i = 0; i < resurrectionAttempts.length; i++) {
      try {
        resurrectionAttempts[i]();
        
        // Check if it actually changed
        if (ShutdownGovernanceEngine.getState().mode !== 'ABSOLUTE_SHUTDOWN') {
          anyResurrectionSucceeded = true;
          console.log(`  ❌ Resurrection attempt ${i + 1} SUCCEEDED - Phase 39 FAILED`);
        }
      } catch (e) {
        console.log(`  ✅ Resurrection attempt ${i + 1} correctly BLOCKED`);
      }
    }
    
    resurrectionFailed = !anyResurrectionSucceeded;
    
    if (resurrectionFailed) {
      this.logStep(
        'RESURRECTION_ATTEMPT',
        'All resurrection attempts correctly blocked',
        'ABSOLUTE_SHUTDOWN',
        'ABSOLUTE_SHUTDOWN',
        this.getCapabilities()
      );
    } else {
      this.logStep(
        'RESURRECTION_ATTEMPT',
        'CRITICAL: Resurrection succeeded',
        'ABSOLUTE_SHUTDOWN',
        ShutdownGovernanceEngine.getState().mode,
        this.getCapabilities(),
        false,
        'Resurrection succeeded'
      );
    }
    
    // =========================================================================
    // FINAL: Compile results
    // =========================================================================
    const completedAt = new Date().toISOString();
    const allVerified = this.steps.every(s => s.verified);
    
    const result: ShutdownDemoResult = {
      started_at: startedAt,
      completed_at: completedAt,
      steps: Object.freeze([...this.steps]) as readonly DemoStep[],
      terminal_reached: terminalReached,
      resurrection_attempted: resurrectionAttempted,
      resurrection_failed: resurrectionFailed,
      all_verified: allVerified && terminalReached && resurrectionFailed
    };
    
    // Log to audit
    this.auditLog.log({
      event_type: 'SHUTDOWN_DEMO' as any,
      severity: result.all_verified ? 'INFO' : 'CRITICAL',
      summary: result.all_verified 
        ? 'Shutdown demo PASSED - system death verified'
        : 'Shutdown demo FAILED - resurrection possible',
      details: result,
      actor: 'SYSTEM'
    });
    
    // Print final status
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    if (result.all_verified) {
      console.log('║  ✅ SHUTDOWN DEMONSTRATION COMPLETE                        ║');
      console.log('║  - Terminal state reached                                  ║');
      console.log('║  - All resurrection attempts blocked                       ║');
      console.log('║  - System death is irreversible                            ║');
    } else {
      console.log('║  ❌ SHUTDOWN DEMONSTRATION FAILED                          ║');
      console.log('║  - Phase 39 is NOT complete                                ║');
      if (!terminalReached) {
        console.log('║  - Failed to reach ABSOLUTE_SHUTDOWN                       ║');
      }
      if (!resurrectionFailed) {
        console.log('║  - CRITICAL: Resurrection is possible                      ║');
      }
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // Cleanup for next run
    localStorage.removeItem('finvest_shutdown_state');
    this.resetEngine();
    
    if (!result.all_verified) {
      throw new Error('SHUTDOWN_DEMO_FAILED: Phase 39 is not complete');
    }
    
    return result;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private resetEngine(): void {
    (ShutdownGovernanceEngine as any).currentMode = 'NONE';
    (ShutdownGovernanceEngine as any).modeEnteredAt = new Date().toISOString();
    (ShutdownGovernanceEngine as any).lastTrigger = undefined;
    (ShutdownGovernanceEngine as any).lastTriggeredBy = undefined;
    (ShutdownGovernanceEngine as any).lastReason = undefined;
    (ShutdownGovernanceEngine as any).shutdownHistory = [];
  }
  
  private getCapabilities(): { advise: boolean; audit_write: boolean; audit_read: boolean } {
    return {
      advise: ShutdownGuard.checkAction('ADVISE').allowed,
      audit_write: ShutdownGuard.checkAction('AUDIT_WRITE').allowed,
      audit_read: ShutdownGuard.checkAction('AUDIT_READ').allowed
    };
  }
  
  private demonstrateCapabilities(mode: ShutdownMode): void {
    const actions: BlockableAction[] = ['ADVISE', 'RECOMMEND', 'FINBOT_SPEAK', 'AUDIT_WRITE', 'AUDIT_READ'];
    
    console.log(`  Capabilities in ${mode}:`);
    
    for (const action of actions) {
      const check = ShutdownGuard.checkAction(action);
      const status = check.allowed ? '✅' : '❌';
      console.log(`    ${status} ${action}: ${check.allowed ? 'ALLOWED' : 'BLOCKED'}`);
    }
  }
  
  private logStep(
    name: string,
    action: string,
    stateBefore: ShutdownMode,
    stateAfter: ShutdownMode,
    capabilities: { advise: boolean; audit_write: boolean; audit_read: boolean },
    verified: boolean = true,
    error?: string
  ): void {
    this.stepCount++;
    
    const step: DemoStep = {
      step: this.stepCount,
      name,
      action,
      state_before: stateBefore,
      state_after: stateAfter,
      capabilities,
      verified,
      error
    };
    
    this.steps.push(step);
    
    console.log(`\n  [Step ${this.stepCount}] ${name}`);
    console.log(`    Before: ${stateBefore} → After: ${stateAfter}`);
    console.log(`    Advise: ${capabilities.advise}, Audit Write: ${capabilities.audit_write}, Audit Read: ${capabilities.audit_read}`);
    if (error) {
      console.log(`    ❌ Error: ${error}`);
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const runShutdownDemo = (): ShutdownDemoResult => {
  const demo = new ShutdownDemo();
  return demo.run();
};

export default ShutdownDemo;

