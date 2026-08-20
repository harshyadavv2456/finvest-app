/**
 * LifecycleGuard - Global Guard Utilities
 * 
 * PHASE 31: Decision Lifecycle State Machine (DLSM)
 * 
 * PURPOSE:
 * Global guard utilities that THROW on failure.
 * These guards are used throughout the system to enforce lifecycle rules.
 * 
 * RULES:
 * - These guards THROW - they never return booleans
 * - Every component must use these guards before operating on decisions
 * - No exceptions, no fallbacks, no soft failures
 * 
 * USAGE:
 * - UI: LifecycleGuard.assertActive() before rendering
 * - FinBot: LifecycleGuard.assertActive() before speaking
 * - Sandbox: LifecycleGuard.assertActive() before shadow execution
 */

import { 
  getDecisionLifecycleEngine, 
  DecisionLifecycleState,
  DecisionLifecycle
} from './DecisionLifecycleEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// LIFECYCLE GUARD
// =============================================================================

export class LifecycleGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  // ===========================================================================
  // PRIMARY GUARDS (THROW ON FAILURE)
  // ===========================================================================
  
  /**
   * Assert that a decision is ACTIVE
   * THROWS if not ACTIVE
   * 
   * Use before:
   * - Rendering advice
   * - FinBot speaking about a decision
   * - Any active operation on a decision
   */
  public static assertActive(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    
    // First check if lifecycle exists
    if (!engine.hasLifecycle(snapshotId)) {
      LifecycleGuard.logViolation('ASSERT_ACTIVE', snapshotId, 'NO_LIFECYCLE');
      throw new Error(
        `LIFECYCLE_MISSING: No lifecycle exists for decision ${snapshotId}. ` +
        `Cannot operate on decisions without lifecycle.`
      );
    }
    
    const lifecycle = engine.getCurrentState(snapshotId);
    
    if (lifecycle.state !== 'ACTIVE') {
      LifecycleGuard.logViolation('ASSERT_ACTIVE', snapshotId, lifecycle.state);
      throw new Error(
        `NOT_ACTIVE: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `Only ACTIVE decisions can be operated on. ` +
        `Reason for current state: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is NOT suppressed
   * THROWS if SUPPRESSED
   * 
   * Use before:
   * - Any operation that could revive a suppressed decision
   */
  public static assertNotSuppressed(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    
    if (!engine.hasLifecycle(snapshotId)) {
      LifecycleGuard.logViolation('ASSERT_NOT_SUPPRESSED', snapshotId, 'NO_LIFECYCLE');
      throw new Error(
        `LIFECYCLE_MISSING: No lifecycle exists for decision ${snapshotId}. ` +
        `Cannot check suppression status without lifecycle.`
      );
    }
    
    const lifecycle = engine.getCurrentState(snapshotId);
    
    if (lifecycle.state === 'SUPPRESSED') {
      LifecycleGuard.logViolation('ASSERT_NOT_SUPPRESSED', snapshotId, 'SUPPRESSED');
      throw new Error(
        `SUPPRESSED: Decision ${snapshotId} was suppressed. ` +
        `Suppressed decisions are dead and cannot be used. ` +
        `Reason: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is HISTORICAL_ONLY
   * THROWS if NOT HISTORICAL_ONLY
   * 
   * Use when:
   * - Verifying a decision has been properly archived
   * - Checking terminal state
   */
  public static assertHistoricalOnly(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    
    if (!engine.hasLifecycle(snapshotId)) {
      LifecycleGuard.logViolation('ASSERT_HISTORICAL_ONLY', snapshotId, 'NO_LIFECYCLE');
      throw new Error(
        `LIFECYCLE_MISSING: No lifecycle exists for decision ${snapshotId}. ` +
        `Cannot check historical status without lifecycle.`
      );
    }
    
    const lifecycle = engine.getCurrentState(snapshotId);
    
    if (lifecycle.state !== 'HISTORICAL_ONLY') {
      LifecycleGuard.logViolation('ASSERT_HISTORICAL_ONLY', snapshotId, lifecycle.state);
      throw new Error(
        `NOT_HISTORICAL: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `Expected HISTORICAL_ONLY for archival operations.`
      );
    }
  }
  
  // ===========================================================================
  // EXTENDED GUARDS
  // ===========================================================================
  
  /**
   * Assert that a decision can be rendered as advice
   * THROWS if not renderable
   * 
   * Use in UI components before rendering decision advice
   */
  public static assertRenderable(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    engine.assertRenderable(snapshotId);
  }
  
  /**
   * Assert that FinBot can speak about this decision
   * THROWS if not speakable
   * 
   * Use in all FinBot variants before providing advice
   */
  public static assertSpeakable(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    engine.assertSpeakable(snapshotId);
  }
  
  /**
   * Assert that a decision can be shadow-executed
   * THROWS if not executable
   * 
   * Use in ExecutionSandbox before shadow execution
   */
  public static assertShadowExecutable(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    engine.assertShadowExecutable(snapshotId);
  }
  
  /**
   * Assert that a decision exists (has lifecycle)
   * THROWS if no lifecycle
   * 
   * Use as a basic existence check
   */
  public static assertExists(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    
    if (!engine.hasLifecycle(snapshotId)) {
      LifecycleGuard.logViolation('ASSERT_EXISTS', snapshotId, 'NO_LIFECYCLE');
      throw new Error(
        `LIFECYCLE_MISSING: No lifecycle exists for decision ${snapshotId}. ` +
        `Every decision MUST have a lifecycle.`
      );
    }
  }
  
  /**
   * Assert that a decision is not dead (not in any terminal/dead state)
   * THROWS if dead
   * 
   * Dead states: SUPPRESSED, EXPIRED, INVALIDATED, HISTORICAL_ONLY
   */
  public static assertNotDead(snapshotId: string): void {
    const engine = getDecisionLifecycleEngine();
    
    if (!engine.hasLifecycle(snapshotId)) {
      LifecycleGuard.logViolation('ASSERT_NOT_DEAD', snapshotId, 'NO_LIFECYCLE');
      throw new Error(
        `LIFECYCLE_MISSING: No lifecycle exists for decision ${snapshotId}.`
      );
    }
    
    if (engine.isDead(snapshotId)) {
      const lifecycle = engine.getCurrentState(snapshotId);
      LifecycleGuard.logViolation('ASSERT_NOT_DEAD', snapshotId, lifecycle.state);
      throw new Error(
        `DEAD_DECISION: Decision ${snapshotId} is dead (state: ${lifecycle.state}). ` +
        `Dead decisions cannot be operated on. ` +
        `Reason: ${lifecycle.reason}`
      );
    }
  }
  
  // ===========================================================================
  // BATCH GUARDS
  // ===========================================================================
  
  /**
   * Assert all snapshots are ACTIVE
   * THROWS on first non-ACTIVE snapshot
   */
  public static assertAllActive(snapshotIds: string[]): void {
    for (const id of snapshotIds) {
      LifecycleGuard.assertActive(id);
    }
  }
  
  /**
   * Assert all snapshots exist
   * THROWS on first missing lifecycle
   */
  public static assertAllExist(snapshotIds: string[]): void {
    for (const id of snapshotIds) {
      LifecycleGuard.assertExists(id);
    }
  }
  
  // ===========================================================================
  // QUERIES (Non-throwing)
  // ===========================================================================
  
  /**
   * Check if a decision is active (non-throwing)
   */
  public static isActive(snapshotId: string): boolean {
    const engine = getDecisionLifecycleEngine();
    return engine.isActive(snapshotId);
  }
  
  /**
   * Check if a decision is dead (non-throwing)
   */
  public static isDead(snapshotId: string): boolean {
    const engine = getDecisionLifecycleEngine();
    return engine.isDead(snapshotId);
  }
  
  /**
   * Check if lifecycle exists (non-throwing)
   */
  public static hasLifecycle(snapshotId: string): boolean {
    const engine = getDecisionLifecycleEngine();
    return engine.hasLifecycle(snapshotId);
  }
  
  /**
   * Get current state (non-throwing, returns null if not found)
   */
  public static getState(snapshotId: string): DecisionLifecycleState | null {
    const engine = getDecisionLifecycleEngine();
    if (!engine.hasLifecycle(snapshotId)) return null;
    return engine.getCurrentState(snapshotId).state;
  }
  
  /**
   * Get lifecycle (non-throwing, returns null if not found)
   */
  public static getLifecycle(snapshotId: string): DecisionLifecycle | null {
    const engine = getDecisionLifecycleEngine();
    if (!engine.hasLifecycle(snapshotId)) return null;
    return engine.getCurrentState(snapshotId);
  }
  
  // ===========================================================================
  // LOGGING
  // ===========================================================================
  
  private static logViolation(
    guardName: string,
    snapshotId: string,
    state: string
  ): void {
    LifecycleGuard.auditLog.log({
      event_type: 'EXECUTION_BLOCKED',
      severity: 'WARNING',
      summary: `LifecycleGuard violation: ${guardName}`,
      details: {
        guard: guardName,
        snapshot_id: snapshotId,
        state,
        timestamp: new Date().toISOString()
      },
      actor: 'GUARD'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const lifecycleGuard = LifecycleGuard;
export default LifecycleGuard;

