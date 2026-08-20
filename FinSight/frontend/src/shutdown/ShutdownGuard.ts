/**
 * ShutdownGuard - Global Shutdown Enforcement
 * 
 * PHASE 39: Irreversibility & Shutdown Governance
 * 
 * PURPOSE:
 * Every speaking, shaping, advising, reserving, or executing path must pass through this guard.
 * If shutdown ≠ NONE → THROW
 * 
 * DESIGN LAW:
 * - No fallback
 * - No "read-only advice" loopholes
 * - No bypass paths
 */

import { ShutdownGovernanceEngine, ShutdownMode, ShutdownState } from './ShutdownGovernanceEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Action types that can be blocked
 */
export type BlockableAction =
  | 'ADVISE'
  | 'RECOMMEND'
  | 'SHAPE'
  | 'NEGOTIATE'
  | 'QUESTION'
  | 'RESERVE'
  | 'EXECUTE'
  | 'OVERRIDE'
  | 'PREAUTH'
  | 'SANDBOX'
  | 'FINBOT_SPEAK'
  | 'LIFECYCLE_TRANSITION'
  | 'CONFLICT_RESOLVE'
  | 'AUDIT_WRITE'
  | 'AUDIT_READ';

/**
 * Shutdown guard check result
 */
export interface ShutdownGuardCheck {
  readonly allowed: boolean;
  readonly mode: ShutdownMode;
  readonly reason: string;
  readonly action: BlockableAction;
  readonly _frozen: true;
}

// =============================================================================
// ACTION PERMISSIONS BY MODE
// =============================================================================

/**
 * What actions are allowed in each mode
 * NONE = everything
 * SOFT_SHUTDOWN = audit only
 * HARD_SHUTDOWN = audit read only
 * ABSOLUTE_SHUTDOWN = nothing
 */
const MODE_PERMISSIONS: Record<ShutdownMode, Set<BlockableAction>> = {
  'NONE': new Set([
    'ADVISE', 'RECOMMEND', 'SHAPE', 'NEGOTIATE', 'QUESTION',
    'RESERVE', 'EXECUTE', 'OVERRIDE', 'PREAUTH', 'SANDBOX',
    'FINBOT_SPEAK', 'LIFECYCLE_TRANSITION', 'CONFLICT_RESOLVE',
    'AUDIT_WRITE', 'AUDIT_READ'
  ]),
  'SOFT_SHUTDOWN': new Set([
    'AUDIT_WRITE', 'AUDIT_READ'
  ]),
  'HARD_SHUTDOWN': new Set([
    'AUDIT_READ'
  ]),
  'ABSOLUTE_SHUTDOWN': new Set([
    // NOTHING - completely inert
  ])
};

// =============================================================================
// SHUTDOWN GUARD
// =============================================================================

export class ShutdownGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  /**
   * Assert system is alive for a given action
   * THROWS if action is not allowed in current mode
   * 
   * NO FALLBACK. NO BYPASS.
   */
  public static assertSystemAlive(action: BlockableAction): void {
    const check = this.checkAction(action);
    
    if (!check.allowed) {
      // Log violation attempt
      this.auditLog.log({
        event_type: 'SHUTDOWN_VIOLATION_ATTEMPT' as any,
        severity: 'CRITICAL',
        summary: `Blocked action "${action}" during ${check.mode}`,
        details: {
          action,
          mode: check.mode,
          reason: check.reason
        },
        actor: 'SYSTEM'
      });
      
      throw new Error(
        `SHUTDOWN_GUARD_BLOCKED: Action "${action}" is not allowed. ` +
        `System mode: ${check.mode}. ` +
        `Reason: ${check.reason}. ` +
        `This cannot be bypassed.`
      );
    }
  }
  
  /**
   * Check if action is allowed (non-throwing)
   */
  public static checkAction(action: BlockableAction): ShutdownGuardCheck {
    const state = ShutdownGovernanceEngine.getState();
    const permissions = MODE_PERMISSIONS[state.mode];
    const allowed = permissions.has(action);
    
    let reason: string;
    if (allowed) {
      reason = `Action "${action}" is permitted in ${state.mode} mode`;
    } else {
      switch (state.mode) {
        case 'SOFT_SHUTDOWN':
          reason = 'System is in SOFT shutdown. Only audit operations allowed.';
          break;
        case 'HARD_SHUTDOWN':
          reason = 'System is in HARD shutdown. Only audit read allowed.';
          break;
        case 'ABSOLUTE_SHUTDOWN':
          reason = 'System is in ABSOLUTE shutdown. No operations allowed. System is permanently inert.';
          break;
        default:
          reason = 'Action not permitted in current mode';
      }
    }
    
    return Object.freeze({
      allowed,
      mode: state.mode,
      reason,
      action,
      _frozen: true
    });
  }
  
  /**
   * Get current state (read-only)
   */
  public static getState(): ShutdownState {
    return ShutdownGovernanceEngine.getState();
  }
  
  /**
   * Check if system can advise
   */
  public static canAdvise(): boolean {
    return ShutdownGovernanceEngine.canAdvise();
  }
  
  /**
   * Check if system is terminal (ABSOLUTE_SHUTDOWN)
   */
  public static isTerminal(): boolean {
    return ShutdownGovernanceEngine.isTerminal();
  }
  
  /**
   * Get why system is not helping
   */
  public static getWhyNotHelpingMessage(): string {
    const state = ShutdownGovernanceEngine.getState();
    
    switch (state.mode) {
      case 'NONE':
        return 'System is operational.';
      case 'SOFT_SHUTDOWN':
        return `System is in soft shutdown since ${state.mode_entered_at}. ` +
               `Reason: ${state.reason || 'Not specified'}. ` +
               `Advisory functions are disabled. Audit access remains.`;
      case 'HARD_SHUTDOWN':
        return `System is in hard shutdown since ${state.mode_entered_at}. ` +
               `Reason: ${state.reason || 'Not specified'}. ` +
               `All outputs disabled. Audit read-only access remains.`;
      case 'ABSOLUTE_SHUTDOWN':
        return `System is in ABSOLUTE shutdown since ${state.mode_entered_at}. ` +
               `Trigger: ${state.trigger || 'Not specified'}. ` +
               `Reason: ${state.reason || 'Not specified'}. ` +
               `This is IRREVERSIBLE. The system is permanently inert. ` +
               `No operations are possible. No recovery path exists.`;
    }
  }
  
  // ===========================================================================
  // CONVENIENCE METHODS
  // ===========================================================================
  
  public static assertCanAdvise(): void {
    this.assertSystemAlive('ADVISE');
  }
  
  public static assertCanRecommend(): void {
    this.assertSystemAlive('RECOMMEND');
  }
  
  public static assertCanSpeak(): void {
    this.assertSystemAlive('FINBOT_SPEAK');
  }
  
  public static assertCanReserve(): void {
    this.assertSystemAlive('RESERVE');
  }
  
  public static assertCanOverride(): void {
    this.assertSystemAlive('OVERRIDE');
  }
  
  public static assertCanAuditWrite(): void {
    this.assertSystemAlive('AUDIT_WRITE');
  }
  
  public static assertCanAuditRead(): void {
    this.assertSystemAlive('AUDIT_READ');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ShutdownGuard;

