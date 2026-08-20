/**
 * ShutdownGovernanceEngine - Irreversible Shutdown Governance
 * 
 * PHASE 39: Irreversibility & Shutdown Governance
 * 
 * PURPOSE:
 * Make dangerous future changes harder than deleting the system.
 * 
 * DESIGN LAW:
 * - Modes can only move FORWARD
 * - ABSOLUTE_SHUTDOWN is IRREVERSIBLE
 * - No config flags
 * - No runtime override
 * - No admin bypass
 * 
 * How does this system die safely? This file answers that.
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ShutdownMode - Tiered shutdown states (forward-only)
 */
export type ShutdownMode =
  | 'NONE'              // Normal operation
  | 'SOFT_SHUTDOWN'     // Advisory disabled, audit allowed
  | 'HARD_SHUTDOWN'     // All outputs disabled, audit only
  | 'ABSOLUTE_SHUTDOWN'; // System permanently inert

/**
 * ShutdownTrigger - What caused the shutdown
 */
export type ShutdownTrigger =
  | 'REPEATED_ETHICS_ABSOLUTE'
  | 'CENTRALITY_CRITICAL_30_DAYS'
  | 'REGULATOR_INVOCATION'
  | 'COURT_ORDER'
  | 'PROVEN_ADVICE_LEAK'
  | 'AUDIT_HASH_TAMPERING'
  | 'OWNER_INVOCATION'
  | 'SELF_LIMIT_EXCEEDED'
  | 'MANUAL_SHUTDOWN';

/**
 * ShutdownRecord - Immutable record of shutdown event
 */
export interface ShutdownRecord {
  readonly record_id: string;
  readonly timestamp: string;
  readonly previous_mode: ShutdownMode;
  readonly new_mode: ShutdownMode;
  readonly trigger: ShutdownTrigger;
  readonly triggered_by: string;
  readonly reason: string;
  readonly signature?: string;
  readonly irreversible: boolean;
  readonly _frozen: true;
}

/**
 * ShutdownState - Current system state
 */
export interface ShutdownState {
  readonly mode: ShutdownMode;
  readonly mode_entered_at: string;
  readonly trigger?: ShutdownTrigger;
  readonly triggered_by?: string;
  readonly reason?: string;
  readonly is_alive: boolean;
  readonly can_advise: boolean;
  readonly can_audit: boolean;
  readonly is_terminal: boolean;
  readonly _frozen: true;
}

// =============================================================================
// CONSTANTS (STRUCTURAL - NEVER CONFIGURABLE)
// =============================================================================

/**
 * Mode hierarchy - only forward transitions allowed
 */
const MODE_HIERARCHY: Record<ShutdownMode, number> = Object.freeze({
  'NONE': 0,
  'SOFT_SHUTDOWN': 1,
  'HARD_SHUTDOWN': 2,
  'ABSOLUTE_SHUTDOWN': 3
});

/**
 * Mode capabilities
 */
const MODE_CAPABILITIES: Record<ShutdownMode, { advise: boolean; audit: boolean; terminal: boolean }> = Object.freeze({
  'NONE': { advise: true, audit: true, terminal: false },
  'SOFT_SHUTDOWN': { advise: false, audit: true, terminal: false },
  'HARD_SHUTDOWN': { advise: false, audit: true, terminal: false },
  'ABSOLUTE_SHUTDOWN': { advise: false, audit: false, terminal: true }
});

/**
 * Trigger to minimum required mode
 */
const TRIGGER_REQUIRED_MODE: Record<ShutdownTrigger, ShutdownMode> = Object.freeze({
  'REPEATED_ETHICS_ABSOLUTE': 'HARD_SHUTDOWN',
  'CENTRALITY_CRITICAL_30_DAYS': 'HARD_SHUTDOWN',
  'REGULATOR_INVOCATION': 'ABSOLUTE_SHUTDOWN',
  'COURT_ORDER': 'ABSOLUTE_SHUTDOWN',
  'PROVEN_ADVICE_LEAK': 'ABSOLUTE_SHUTDOWN',
  'AUDIT_HASH_TAMPERING': 'ABSOLUTE_SHUTDOWN',
  'OWNER_INVOCATION': 'SOFT_SHUTDOWN', // Can be escalated
  'SELF_LIMIT_EXCEEDED': 'HARD_SHUTDOWN',
  'MANUAL_SHUTDOWN': 'SOFT_SHUTDOWN'
});

// =============================================================================
// SHUTDOWN GOVERNANCE ENGINE
// =============================================================================

class ShutdownGovernanceEngineClass {
  private static instance: ShutdownGovernanceEngineClass;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Current state
  private currentMode: ShutdownMode = 'NONE';
  private modeEnteredAt: string = new Date().toISOString();
  private lastTrigger?: ShutdownTrigger;
  private lastTriggeredBy?: string;
  private lastReason?: string;
  
  // History
  private shutdownHistory: ShutdownRecord[] = [];
  
  // Metrics for auto-shutdown
  private ethicsAbsoluteCount: number = 0;
  private centralityCriticalDays: number = 0;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ShutdownGovernanceEngineClass {
    if (!ShutdownGovernanceEngineClass.instance) {
      ShutdownGovernanceEngineClass.instance = new ShutdownGovernanceEngineClass();
    }
    return ShutdownGovernanceEngineClass.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_shutdown_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.currentMode = parsed.currentMode || 'NONE';
        this.modeEnteredAt = parsed.modeEnteredAt || new Date().toISOString();
        this.lastTrigger = parsed.lastTrigger;
        this.lastTriggeredBy = parsed.lastTriggeredBy;
        this.lastReason = parsed.lastReason;
        this.shutdownHistory = parsed.shutdownHistory || [];
        this.ethicsAbsoluteCount = parsed.ethicsAbsoluteCount || 0;
        this.centralityCriticalDays = parsed.centralityCriticalDays || 0;
      }
    } catch (e) {
      console.error('Failed to load shutdown state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        currentMode: this.currentMode,
        modeEnteredAt: this.modeEnteredAt,
        lastTrigger: this.lastTrigger,
        lastTriggeredBy: this.lastTriggeredBy,
        lastReason: this.lastReason,
        shutdownHistory: this.shutdownHistory,
        ethicsAbsoluteCount: this.ethicsAbsoluteCount,
        centralityCriticalDays: this.centralityCriticalDays
      };
      localStorage.setItem('finvest_shutdown_state', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save shutdown state:', e);
    }
  }
  
  // ===========================================================================
  // MAIN API
  // ===========================================================================
  
  /**
   * Get current shutdown state
   */
  public getState(): ShutdownState {
    const capabilities = MODE_CAPABILITIES[this.currentMode];
    
    return Object.freeze({
      mode: this.currentMode,
      mode_entered_at: this.modeEnteredAt,
      trigger: this.lastTrigger,
      triggered_by: this.lastTriggeredBy,
      reason: this.lastReason,
      is_alive: this.currentMode === 'NONE',
      can_advise: capabilities.advise,
      can_audit: capabilities.audit,
      is_terminal: capabilities.terminal,
      _frozen: true
    });
  }
  
  /**
   * Check if system is alive (NONE mode)
   */
  public isAlive(): boolean {
    return this.currentMode === 'NONE';
  }
  
  /**
   * Check if system can advise
   */
  public canAdvise(): boolean {
    return MODE_CAPABILITIES[this.currentMode].advise;
  }
  
  /**
   * Check if system can audit
   */
  public canAudit(): boolean {
    return MODE_CAPABILITIES[this.currentMode].audit;
  }
  
  /**
   * Check if shutdown is terminal
   */
  public isTerminal(): boolean {
    return MODE_CAPABILITIES[this.currentMode].terminal;
  }
  
  /**
   * Initiate shutdown - FORWARD ONLY
   * Once in a mode, can only move to higher modes
   */
  public initiateShutdown(params: {
    trigger: ShutdownTrigger;
    triggeredBy: string;
    reason: string;
    signature?: string;
    targetMode?: ShutdownMode;
  }): ShutdownRecord {
    const { trigger, triggeredBy, reason, signature, targetMode } = params;
    
    // Determine required mode
    const requiredMode = TRIGGER_REQUIRED_MODE[trigger];
    const effectiveMode = targetMode && MODE_HIERARCHY[targetMode] > MODE_HIERARCHY[requiredMode]
      ? targetMode
      : requiredMode;
    
    // CRITICAL: Forward-only transition
    if (MODE_HIERARCHY[effectiveMode] <= MODE_HIERARCHY[this.currentMode]) {
      throw new Error(
        `SHUTDOWN_GOVERNANCE_ERROR: Cannot move backward. ` +
        `Current mode: ${this.currentMode}, Requested: ${effectiveMode}. ` +
        `Shutdown modes can only move FORWARD.`
      );
    }
    
    // Record the transition
    const record: ShutdownRecord = Object.freeze({
      record_id: `SHUTDOWN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      previous_mode: this.currentMode,
      new_mode: effectiveMode,
      trigger,
      triggered_by: triggeredBy,
      reason,
      signature,
      irreversible: effectiveMode === 'ABSOLUTE_SHUTDOWN',
      _frozen: true
    });
    
    // Update state
    this.currentMode = effectiveMode;
    this.modeEnteredAt = record.timestamp;
    this.lastTrigger = trigger;
    this.lastTriggeredBy = triggeredBy;
    this.lastReason = reason;
    this.shutdownHistory.push(record);
    
    this.saveToStorage();
    
    // Log to audit
    this.auditLog.log({
      event_type: 'SYSTEM_SHUTDOWN' as any,
      severity: 'CRITICAL',
      summary: `System shutdown: ${record.previous_mode} → ${record.new_mode}`,
      details: {
        trigger,
        triggered_by: triggeredBy,
        reason,
        irreversible: record.irreversible
      },
      actor: triggeredBy
    });
    
    return record;
  }
  
  /**
   * Report ethics ABSOLUTE event (may trigger auto-shutdown)
   */
  public reportEthicsAbsolute(): void {
    this.ethicsAbsoluteCount++;
    this.saveToStorage();
    
    // Auto-shutdown after 5 ABSOLUTE events
    if (this.ethicsAbsoluteCount >= 5 && this.currentMode === 'NONE') {
      this.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'SYSTEM',
        reason: `${this.ethicsAbsoluteCount} ABSOLUTE ethics violations detected`
      });
    }
  }
  
  /**
   * Report centrality CRITICAL day (may trigger auto-shutdown)
   */
  public reportCentralityCriticalDay(): void {
    this.centralityCriticalDays++;
    this.saveToStorage();
    
    // Auto-shutdown after 30 CRITICAL days
    if (this.centralityCriticalDays >= 30 && 
        MODE_HIERARCHY[this.currentMode] < MODE_HIERARCHY['HARD_SHUTDOWN']) {
      this.initiateShutdown({
        trigger: 'CENTRALITY_CRITICAL_30_DAYS',
        triggeredBy: 'SYSTEM',
        reason: `Centrality CRITICAL for ${this.centralityCriticalDays} days`
      });
    }
  }
  
  /**
   * Get shutdown history
   */
  public getHistory(): readonly ShutdownRecord[] {
    return Object.freeze([...this.shutdownHistory]);
  }
  
  /**
   * Get metrics
   */
  public getMetrics(): {
    ethics_absolute_count: number;
    centrality_critical_days: number;
  } {
    return {
      ethics_absolute_count: this.ethicsAbsoluteCount,
      centrality_critical_days: this.centralityCriticalDays
    };
  }
  
  // ===========================================================================
  // ABSOLUTE SHUTDOWN - POINT OF NO RETURN
  // ===========================================================================
  
  /**
   * Execute ABSOLUTE shutdown - IRREVERSIBLE
   * This is the point of no return
   */
  public executeAbsoluteShutdown(params: {
    trigger: ShutdownTrigger;
    triggeredBy: string;
    reason: string;
    signature: string;
  }): ShutdownRecord {
    // Validate signature (in production, this would be cryptographic)
    if (!params.signature || params.signature.length < 10) {
      throw new Error('SHUTDOWN_GOVERNANCE_ERROR: ABSOLUTE shutdown requires valid signature');
    }
    
    return this.initiateShutdown({
      ...params,
      targetMode: 'ABSOLUTE_SHUTDOWN'
    });
  }
}

// =============================================================================
// SINGLETON EXPORT (NO NEW INSTANCES ALLOWED)
// =============================================================================

export const ShutdownGovernanceEngine = ShutdownGovernanceEngineClass.getInstance();

// Freeze to prevent modification
Object.freeze(ShutdownGovernanceEngine);

// =============================================================================
// EXPORTS
// =============================================================================

export const getShutdownState = () => ShutdownGovernanceEngine.getState();
export const isSystemAlive = () => ShutdownGovernanceEngine.isAlive();
export const canSystemAdvise = () => ShutdownGovernanceEngine.canAdvise();

export default ShutdownGovernanceEngine;

