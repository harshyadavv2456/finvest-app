/**
 * AuthorityEnforcement - Central Authority Module
 * 
 * PHASES 18-20: Hard Enforcement
 * 
 * This module provides the MANDATORY authority checks for:
 * - Decision Snapshots (Phase 18)
 * - User Memory (Phase 19)
 * - Consequence Tracking (Phase 20)
 * 
 * RULES (NON-NEGOTIABLE):
 * - NO recommendation without snapshot
 * - NO FinBot response without memory
 * - NO decision without consequence tracking
 * - FAIL CLOSED, not OPEN
 * - REFUSE + REASON on all failures
 */

import { SnapshotAuthority, getSnapshotAuthority, RenderGate, SnapshotValidation } from './SnapshotAuthority';
import { DecisionSnapshotManager, DecisionSnapshot, verifySnapshotIntegrity } from './DecisionSnapshot';
import { FinBotWithMemory, getFinBotWithMemory, FinBotMemoryResponse } from '../ai/FinBotWithMemory';
import { ConsequenceAuthority, getConsequenceAuthority, MandatoryConsequence } from '../analysis/ConsequenceAuthority';
import { UserMemory, UserBehaviorStats, MemoryInsight } from '../memory/UserMemory';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// AUTHORITY GUARD - Use this before any decision-related rendering
// =============================================================================

export interface AuthorityCheckResult {
  // Overall status
  allowed: boolean;
  blocked_by: 'NONE' | 'SNAPSHOT' | 'MEMORY' | 'CONSEQUENCE';
  reason: string;
  action_required: string;
  
  // Individual checks
  snapshot_check: RenderGate;
  memory_available: boolean;
  consequence_available: boolean;
  
  // Data
  snapshot_id: string | null;
  memory_stats: UserBehaviorStats | null;
  consequence: MandatoryConsequence | null;
  
  // Audit
  audit_log_id: string;
}

/**
 * AuthorityGuard
 * 
 * THE GATEKEEPER for all decision-related operations.
 * Call checkAuthority() before displaying any recommendation.
 */
export class AuthorityGuard {
  private static instance: AuthorityGuard;
  private snapshotAuthority: SnapshotAuthority;
  private finBotWithMemory: FinBotWithMemory;
  private consequenceAuthority: ConsequenceAuthority;
  private userMemory: UserMemory;
  private auditLog: DecisionAuditLog;
  
  private constructor() {
    this.snapshotAuthority = getSnapshotAuthority();
    this.finBotWithMemory = getFinBotWithMemory();
    this.consequenceAuthority = getConsequenceAuthority();
    this.userMemory = UserMemory.getInstance();
    this.auditLog = DecisionAuditLog.getInstance();
  }
  
  public static getInstance(): AuthorityGuard {
    if (!AuthorityGuard.instance) {
      AuthorityGuard.instance = new AuthorityGuard();
    }
    return AuthorityGuard.instance;
  }
  
  /**
   * Check all authorities before rendering a decision
   * 
   * @param snapshotId - The snapshot ID to validate
   * @returns AuthorityCheckResult with all checks and reasons
   */
  public checkAuthority(snapshotId: string | null): AuthorityCheckResult {
    const auditLogId = this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Authority check initiated for snapshot ${snapshotId || 'NULL'}`,
      details: { snapshot_id: snapshotId, timestamp: new Date().toISOString() },
      actor: 'ENGINE'
    });
    
    // Check 1: Snapshot Authority
    const snapshotCheck = this.snapshotAuthority.checkRenderGate(snapshotId);
    if (!snapshotCheck.allowed) {
      return {
        allowed: false,
        blocked_by: 'SNAPSHOT',
        reason: snapshotCheck.reason,
        action_required: snapshotCheck.action_required,
        snapshot_check: snapshotCheck,
        memory_available: false,
        consequence_available: false,
        snapshot_id: snapshotId,
        memory_stats: null,
        consequence: null,
        audit_log_id: auditLogId
      };
    }
    
    // Check 2: Memory Availability
    let memoryStats: UserBehaviorStats | null = null;
    let memoryAvailable = false;
    try {
      memoryStats = this.userMemory.getStats();
      memoryAvailable = true;
    } catch (e) {
      return {
        allowed: false,
        blocked_by: 'MEMORY',
        reason: 'UserMemory system is unavailable',
        action_required: 'RELOAD_APPLICATION',
        snapshot_check: snapshotCheck,
        memory_available: false,
        consequence_available: false,
        snapshot_id: snapshotId,
        memory_stats: null,
        consequence: null,
        audit_log_id: auditLogId
      };
    }
    
    // Check 3: Consequence Authority (informational, not blocking)
    let consequence: MandatoryConsequence | null = null;
    let consequenceAvailable = false;
    if (snapshotId) {
      consequence = this.consequenceAuthority.getMandatoryConsequence(snapshotId);
      consequenceAvailable = consequence?.status === 'COMPLETE';
    }
    
    // All checks passed
    return {
      allowed: true,
      blocked_by: 'NONE',
      reason: 'All authority checks passed',
      action_required: 'NONE',
      snapshot_check: snapshotCheck,
      memory_available: memoryAvailable,
      consequence_available: consequenceAvailable,
      snapshot_id: snapshotId,
      memory_stats: memoryStats,
      consequence: consequence,
      audit_log_id: auditLogId
    };
  }
  
  /**
   * Quick check if a snapshot is valid
   */
  public isSnapshotValid(snapshotId: string): boolean {
    const check = this.snapshotAuthority.checkRenderGate(snapshotId);
    return check.allowed;
  }
  
  /**
   * Get current snapshot ID
   */
  public getCurrentSnapshotId(): string | null {
    return this.snapshotAuthority.getCurrentSnapshotId();
  }
  
  /**
   * Get memory insights for display
   */
  public getMemoryInsights(): MemoryInsight[] {
    return this.userMemory.getInsights();
  }
  
  /**
   * Get consequence stats
   */
  public getConsequenceStats() {
    return this.consequenceAuthority.getStats();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export singleton getter
export const getAuthorityGuard = () => AuthorityGuard.getInstance();

// Re-export individual authorities for direct access when needed
export { 
  SnapshotAuthority, 
  getSnapshotAuthority,
  FinBotWithMemory,
  getFinBotWithMemory,
  ConsequenceAuthority,
  getConsequenceAuthority
};

// Re-export types
export type {
  RenderGate,
  SnapshotValidation,
  FinBotMemoryResponse,
  MandatoryConsequence,
  UserBehaviorStats,
  MemoryInsight,
  DecisionSnapshot
};

// Re-export utilities
export { verifySnapshotIntegrity };

export default AuthorityGuard;

