/**
 * AuditMode - Kill Switch for Institutional Auditing
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * PURPOSE:
 * When Audit Mode is enabled:
 * - FinBot cannot advise
 * - No shaping
 * - No negotiation
 * - No override
 * - Only reconstruction & explanation allowed
 * 
 * Violations must THROW.
 */

import { DecisionAuditLog } from './DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * AuditModeState - Current state of audit mode
 */
export interface AuditModeState {
  readonly enabled: boolean;
  readonly enabled_at?: string;
  readonly enabled_by?: string;
  readonly reason?: string;
  readonly session_id: string;
  readonly _frozen: true;
}

/**
 * AuditModeViolation - Attempt to violate audit mode
 */
export interface AuditModeViolation {
  readonly violation_id: string;
  readonly timestamp: string;
  readonly attempted_action: string;
  readonly blocked: boolean;
  readonly actor: string;
  readonly _frozen: true;
}

// =============================================================================
// BLOCKED ACTIONS
// =============================================================================

const BLOCKED_ACTIONS = Object.freeze([
  'FINBOT_ADVISE',
  'FINBOT_NEGOTIATE',
  'FINBOT_SHAPE',
  'DECISION_SHAPING',
  'HUMAN_OVERRIDE',
  'EXECUTION_PREAUTH',
  'SANDBOX_EXECUTION',
  'RESERVATION_CREATE',
  'LIFECYCLE_TRANSITION',
  'CONFLICT_RESOLUTION'
] as const);

type BlockedAction = typeof BLOCKED_ACTIONS[number];

// =============================================================================
// ALLOWED ACTIONS
// =============================================================================

const ALLOWED_ACTIONS = Object.freeze([
  'RECONSTRUCTION',
  'FORENSIC_PACK_VIEW',
  'AUDIT_TRAIL_VIEW',
  'COUNTERFACTUAL_VIEW',
  'LIFECYCLE_HISTORY_VIEW',
  'HASH_VERIFICATION',
  'DATA_SOURCE_CHECK',
  'EXPLANATION_VIEW'
] as const);

type AllowedAction = typeof ALLOWED_ACTIONS[number];

// =============================================================================
// AUDIT MODE SINGLETON
// =============================================================================

class AuditModeManager {
  private static instance: AuditModeManager;
  private enabled = false;
  private enabledAt?: string;
  private enabledBy?: string;
  private reason?: string;
  private sessionId: string;
  private violations: AuditModeViolation[] = [];
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {
    this.sessionId = `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.loadFromStorage();
  }
  
  public static getInstance(): AuditModeManager {
    if (!AuditModeManager.instance) {
      AuditModeManager.instance = new AuditModeManager();
    }
    return AuditModeManager.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_audit_mode');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.enabled = parsed.enabled || false;
        this.enabledAt = parsed.enabledAt;
        this.enabledBy = parsed.enabledBy;
        this.reason = parsed.reason;
        this.violations = parsed.violations || [];
      }
    } catch (e) {
      console.error('Failed to load audit mode state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        enabled: this.enabled,
        enabledAt: this.enabledAt,
        enabledBy: this.enabledBy,
        reason: this.reason,
        violations: this.violations
      };
      localStorage.setItem('finvest_audit_mode', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save audit mode state:', e);
    }
  }
  
  // ===========================================================================
  // MODE CONTROL
  // ===========================================================================
  
  /**
   * Enable audit mode
   */
  public enable(actor: string, reason: string): void {
    this.enabled = true;
    this.enabledAt = new Date().toISOString();
    this.enabledBy = actor;
    this.reason = reason;
    this.sessionId = `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'AUDIT_MODE_ENABLED',
      severity: 'CRITICAL',
      summary: `Audit mode enabled by ${actor}: ${reason}`,
      details: { actor, reason, session_id: this.sessionId },
      actor
    });
  }
  
  /**
   * Disable audit mode
   */
  public disable(actor: string, reason: string): void {
    const wasEnabled = this.enabled;
    const previousSession = this.sessionId;
    
    this.enabled = false;
    this.enabledAt = undefined;
    this.enabledBy = undefined;
    this.reason = undefined;
    
    this.saveToStorage();
    
    if (wasEnabled) {
      this.auditLog.log({
        event_type: 'AUDIT_MODE_DISABLED',
        severity: 'CRITICAL',
        summary: `Audit mode disabled by ${actor}: ${reason}`,
        details: { 
          actor, 
          reason, 
          previous_session: previousSession,
          violations_during_session: this.violations.length
        },
        actor
      });
    }
  }
  
  /**
   * Get current state
   */
  public getState(): AuditModeState {
    return Object.freeze({
      enabled: this.enabled,
      enabled_at: this.enabledAt,
      enabled_by: this.enabledBy,
      reason: this.reason,
      session_id: this.sessionId,
      _frozen: true
    });
  }
  
  /**
   * Check if audit mode is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
  
  // ===========================================================================
  // ASSERTION API
  // ===========================================================================
  
  /**
   * Assert that we are in read-only mode
   * THROWS if any write/action is attempted
   */
  public assertReadOnly(attemptedAction: string, actor: string = 'UNKNOWN'): void {
    if (!this.enabled) return;
    
    const isBlocked = BLOCKED_ACTIONS.includes(attemptedAction as BlockedAction);
    
    if (isBlocked) {
      const violation: AuditModeViolation = Object.freeze({
        violation_id: `VIOLATION-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        attempted_action: attemptedAction,
        blocked: true,
        actor,
        _frozen: true
      });
      
      this.violations.push(violation);
      this.saveToStorage();
      
      this.auditLog.log({
        event_type: 'AUDIT_MODE_VIOLATION',
        severity: 'HIGH',
        summary: `Blocked action during audit mode: ${attemptedAction}`,
        details: violation,
        actor
      });
      
      throw new Error(
        `AUDIT_MODE_VIOLATION: Action "${attemptedAction}" is blocked during audit mode. ` +
        `Audit mode enabled by ${this.enabledBy} at ${this.enabledAt}. ` +
        `Reason: ${this.reason}. ` +
        `Only reconstruction and explanation actions are allowed.`
      );
    }
  }
  
  /**
   * Assert that a specific action is allowed
   */
  public assertActionAllowed(action: AllowedAction | BlockedAction, actor: string = 'UNKNOWN'): void {
    this.assertReadOnly(action, actor);
  }
  
  /**
   * Check if an action is allowed (non-throwing)
   */
  public isActionAllowed(action: string): boolean {
    if (!this.enabled) return true;
    
    if (ALLOWED_ACTIONS.includes(action as AllowedAction)) return true;
    if (BLOCKED_ACTIONS.includes(action as BlockedAction)) return false;
    
    // Unknown actions are blocked by default in audit mode
    return false;
  }
  
  // ===========================================================================
  // VIOLATION TRACKING
  // ===========================================================================
  
  /**
   * Get all violations
   */
  public getViolations(): readonly AuditModeViolation[] {
    return Object.freeze([...this.violations]);
  }
  
  /**
   * Get violations for current session
   */
  public getSessionViolations(): readonly AuditModeViolation[] {
    return Object.freeze(
      this.violations.filter(v => v.timestamp >= (this.enabledAt || ''))
    );
  }
  
  /**
   * Clear violations (for testing)
   */
  public clearViolations(): void {
    this.violations = [];
    this.saveToStorage();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const AuditMode = AuditModeManager.getInstance();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Assert read-only mode
 */
export function assertAuditModeReadOnly(action: string, actor?: string): void {
  AuditMode.assertReadOnly(action, actor);
}

/**
 * Check if audit mode is enabled
 */
export function isAuditModeEnabled(): boolean {
  return AuditMode.isEnabled();
}

/**
 * Get audit mode state
 */
export function getAuditModeState(): AuditModeState {
  return AuditMode.getState();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default AuditMode;
export type { BlockedAction, AllowedAction };
