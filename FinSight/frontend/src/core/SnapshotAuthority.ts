/**
 * SnapshotAuthority - Hard Enforcement for Decision Snapshots
 * 
 * PHASE 18: Decision Authority Lock (HARD ENFORCEMENT)
 * 
 * RULES (NON-NEGOTIABLE):
 * - NO recommendation without DecisionSnapshot
 * - NO FinBot response without snapshot reference
 * - NO rendering if snapshot is missing/invalid/stale
 * - REFUSE + REASON on all failures
 * - NO fallback behavior - FAIL CLOSED
 */

import { DecisionSnapshot, DecisionSnapshotManager, verifySnapshotIntegrity, DecisionOutput, SnapshotSource } from './DecisionSnapshot';
import { DecisionContext } from './DecisionContext';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getMarketTimeline } from './MarketTimeline';
import { MarketEventFactory } from './MarketEvent';

// =============================================================================
// TYPES
// =============================================================================

export type SnapshotValidation = 
  | { valid: true; snapshot: DecisionSnapshot }
  | { valid: false; reason: string; code: SnapshotErrorCode };

export type SnapshotErrorCode = 
  | 'SNAPSHOT_MISSING'
  | 'SNAPSHOT_EXPIRED'
  | 'INTEGRITY_MISMATCH'
  | 'CONTEXT_INVALID'
  | 'CONTEXT_STALE'
  | 'CONTEXT_INCOMPLETE';

export interface RenderGate {
  allowed: boolean;
  reason: string;
  snapshot_id: string | null;
  context_status: string;
  action_required: string;
}

export interface SnapshotRequirement {
  source: SnapshotSource;
  max_age_minutes: number;
  require_valid_context: boolean;
}

// =============================================================================
// DEFAULT REQUIREMENTS
// =============================================================================

const DEFAULT_REQUIREMENTS: Record<string, SnapshotRequirement> = {
  RECOMMENDATION: {
    source: 'TAX_AWARE_ALLOCATOR',
    max_age_minutes: 60,
    require_valid_context: true
  },
  FINBOT_RESPONSE: {
    source: 'FINBOT_CIO',
    max_age_minutes: 30,
    require_valid_context: true
  },
  SCENARIO: {
    source: 'SCENARIO_ENGINE',
    max_age_minutes: 120,
    require_valid_context: true
  },
  SHADOW_EXECUTION: {
    source: 'SHADOW_EXECUTION',
    max_age_minutes: 1440, // 24 hours
    require_valid_context: true
  }
};

// =============================================================================
// SNAPSHOT AUTHORITY
// =============================================================================

/**
 * SnapshotAuthority
 * 
 * THE GATEKEEPER. All decisions MUST pass through here.
 * No exceptions. No fallbacks. Fail CLOSED.
 */
export class SnapshotAuthority {
  private static instance: SnapshotAuthority;
  private snapshotManager: DecisionSnapshotManager;
  private auditLog: DecisionAuditLog;
  private timeline = getMarketTimeline();
  
  private constructor() {
    this.snapshotManager = DecisionSnapshotManager.getInstance();
    this.auditLog = DecisionAuditLog.getInstance();
  }
  
  public static getInstance(): SnapshotAuthority {
    if (!SnapshotAuthority.instance) {
      SnapshotAuthority.instance = new SnapshotAuthority();
    }
    return SnapshotAuthority.instance;
  }
  
  // ===========================================================================
  // MANDATORY SNAPSHOT CREATION
  // ===========================================================================
  
  /**
   * Create snapshot for a recommendation
   * MANDATORY before any recommendation is shown to user
   */
  public createRecommendationSnapshot(
    context: DecisionContext,
    outputs: DecisionOutput[]
  ): SnapshotValidation {
    // GATE 1: Context must be valid
    if (context.status === 'INVALID') {
      this.logRefusal('RECOMMENDATION', 'CONTEXT_INVALID', context.status_reason);
      return {
        valid: false,
        reason: `Cannot create recommendation: ${context.status_reason}`,
        code: 'CONTEXT_INVALID'
      };
    }
    
    // GATE 2: Context must not be incomplete for recommendations
    if (context.status === 'INCOMPLETE') {
      this.logRefusal('RECOMMENDATION', 'CONTEXT_INCOMPLETE', context.status_reason);
      return {
        valid: false,
        reason: `Cannot create recommendation: ${context.status_reason}`,
        code: 'CONTEXT_INCOMPLETE'
      };
    }
    
    // GATE 3: Must have outputs
    if (!outputs || outputs.length === 0) {
      this.logRefusal('RECOMMENDATION', 'SNAPSHOT_MISSING', 'No outputs provided');
      return {
        valid: false,
        reason: 'Cannot create snapshot without recommendation outputs',
        code: 'SNAPSHOT_MISSING'
      };
    }
    
    // Create snapshot
    const snapshot = this.snapshotManager.createSnapshot(
      context,
      outputs,
      'TAX_AWARE_ALLOCATOR'
    );
    
    // Add to timeline with snapshot reference ONLY
    this.timeline.addEvent(
      MarketEventFactory.signalChange(
        outputs[0].symbol || 'PORTFOLIO',
        'IN',
        'NONE',
        outputs[0].action,
        outputs[0].confidence / 100
      )
    );
    
    return { valid: true, snapshot };
  }
  
  /**
   * Create snapshot for FinBot response
   * MANDATORY before any FinBot response is shown
   */
  public createFinBotSnapshot(
    context: DecisionContext,
    outputs: DecisionOutput[]
  ): SnapshotValidation {
    // GATE 1: Context must exist
    if (!context) {
      this.logRefusal('FINBOT', 'CONTEXT_INVALID', 'No DecisionContext provided');
      return {
        valid: false,
        reason: 'FinBot cannot respond without DecisionContext',
        code: 'CONTEXT_INVALID'
      };
    }
    
    // GATE 2: Context must be at least STALE (not INVALID/INCOMPLETE)
    if (context.status === 'INVALID' || context.status === 'INCOMPLETE') {
      this.logRefusal('FINBOT', 'CONTEXT_INVALID', context.status_reason);
      return {
        valid: false,
        reason: `FinBot refuses: ${context.status_reason}`,
        code: 'CONTEXT_INVALID'
      };
    }
    
    // Create snapshot
    const snapshot = this.snapshotManager.createSnapshot(
      context,
      outputs,
      'FINBOT_CIO'
    );
    
    return { valid: true, snapshot };
  }
  
  /**
   * Create snapshot for scenario simulation
   * MANDATORY before any scenario is shown
   */
  public createScenarioSnapshot(
    context: DecisionContext,
    outputs: DecisionOutput[]
  ): SnapshotValidation {
    if (context.status === 'INVALID') {
      this.logRefusal('SCENARIO', 'CONTEXT_INVALID', context.status_reason);
      return {
        valid: false,
        reason: `Cannot simulate: ${context.status_reason}`,
        code: 'CONTEXT_INVALID'
      };
    }
    
    const snapshot = this.snapshotManager.createSnapshot(
      context,
      outputs,
      'SCENARIO_ENGINE'
    );
    
    return { valid: true, snapshot };
  }
  
  /**
   * Create snapshot for shadow execution
   * MANDATORY before any shadow execution is tracked
   */
  public createShadowExecutionSnapshot(
    context: DecisionContext,
    outputs: DecisionOutput[]
  ): SnapshotValidation {
    if (context.status === 'INVALID') {
      this.logRefusal('SHADOW', 'CONTEXT_INVALID', context.status_reason);
      return {
        valid: false,
        reason: `Cannot execute shadow: ${context.status_reason}`,
        code: 'CONTEXT_INVALID'
      };
    }
    
    const snapshot = this.snapshotManager.createSnapshot(
      context,
      outputs,
      'SHADOW_EXECUTION'
    );
    
    return { valid: true, snapshot };
  }
  
  // ===========================================================================
  // MANDATORY SNAPSHOT VALIDATION
  // ===========================================================================
  
  /**
   * Validate a snapshot before use
   * CALL THIS before rendering any decision
   */
  public validateSnapshot(snapshotId: string): SnapshotValidation {
    // GATE 1: Snapshot must exist
    const snapshot = this.snapshotManager.getSnapshot(snapshotId);
    if (!snapshot) {
      this.logRefusal('VALIDATE', 'SNAPSHOT_MISSING', `Snapshot ${snapshotId} not found`);
      return {
        valid: false,
        reason: `Snapshot ${snapshotId} not found. Decision cannot be displayed.`,
        code: 'SNAPSHOT_MISSING'
      };
    }
    
    // GATE 2: Integrity check
    if (!verifySnapshotIntegrity(snapshot)) {
      this.logRefusal('VALIDATE', 'INTEGRITY_MISMATCH', `Integrity check failed for ${snapshotId}`);
      return {
        valid: false,
        reason: `Snapshot integrity compromised. Decision cannot be trusted.`,
        code: 'INTEGRITY_MISMATCH'
      };
    }
    
    // GATE 3: Expiration check
    if (this.snapshotManager.isExpired(snapshot)) {
      this.logRefusal('VALIDATE', 'SNAPSHOT_EXPIRED', `Snapshot ${snapshotId} has expired`);
      return {
        valid: false,
        reason: `Snapshot has expired. Refresh required for current decision.`,
        code: 'SNAPSHOT_EXPIRED'
      };
    }
    
    // GATE 4: Context status at snapshot time
    if (snapshot.context_status === 'INVALID') {
      this.logRefusal('VALIDATE', 'CONTEXT_INVALID', 'Snapshot created with invalid context');
      return {
        valid: false,
        reason: `Snapshot was created with invalid context. Decision unreliable.`,
        code: 'CONTEXT_INVALID'
      };
    }
    
    return { valid: true, snapshot };
  }
  
  // ===========================================================================
  // RENDER GATE - Call before displaying ANY decision
  // ===========================================================================
  
  /**
   * Check if rendering is allowed
   * CALL THIS in every component that displays decisions
   */
  public checkRenderGate(snapshotId: string | null): RenderGate {
    // No snapshot = No rendering
    if (!snapshotId) {
      return {
        allowed: false,
        reason: 'No decision snapshot available. Connect portfolio and refresh data.',
        snapshot_id: null,
        context_status: 'UNKNOWN',
        action_required: 'CONNECT_PORTFOLIO'
      };
    }
    
    const validation = this.validateSnapshot(snapshotId);
    
    if (!validation.valid) {
      return {
        allowed: false,
        reason: validation.reason,
        snapshot_id: snapshotId,
        context_status: 'INVALID',
        action_required: this.getActionForError(validation.code)
      };
    }
    
    return {
      allowed: true,
      reason: 'Snapshot valid',
      snapshot_id: snapshotId,
      context_status: validation.snapshot.context_status,
      action_required: 'NONE'
    };
  }
  
  /**
   * Get the most recent valid snapshot for a symbol
   */
  public getLatestValidSnapshot(symbol: string): DecisionSnapshot | null {
    const snapshots = this.snapshotManager.getSnapshotsForSymbol(symbol);
    
    for (const snapshot of snapshots) {
      const validation = this.validateSnapshot(snapshot.id);
      if (validation.valid) {
        return snapshot;
      }
    }
    
    return null;
  }
  
  /**
   * Get current snapshot ID
   */
  public getCurrentSnapshotId(): string | null {
    return this.snapshotManager.getCurrentSnapshotId();
  }
  
  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  
  private logRefusal(
    component: string,
    code: SnapshotErrorCode,
    details: string
  ): void {
    this.auditLog.log({
      event_type: 'EXECUTION_BLOCKED',
      severity: 'WARNING',
      summary: `[SnapshotAuthority] ${component} blocked: ${code}`,
      details: { component, code, details, timestamp: new Date().toISOString() },
      actor: 'ENGINE'
    });
  }
  
  private getActionForError(code: SnapshotErrorCode): string {
    switch (code) {
      case 'SNAPSHOT_MISSING':
        return 'REFRESH_DATA';
      case 'SNAPSHOT_EXPIRED':
        return 'REFRESH_DATA';
      case 'INTEGRITY_MISMATCH':
        return 'REPORT_ERROR';
      case 'CONTEXT_INVALID':
        return 'CONNECT_PORTFOLIO';
      case 'CONTEXT_STALE':
        return 'REFRESH_DATA';
      case 'CONTEXT_INCOMPLETE':
        return 'COMPLETE_SETUP';
      default:
        return 'REFRESH_DATA';
    }
  }
}

// Export singleton getter
export const getSnapshotAuthority = () => SnapshotAuthority.getInstance();

export default SnapshotAuthority;

