/**
 * OverrideGuard - Guards for Override Protocol
 * 
 * PHASE 35: Human Override Protocol (HOP)
 * 
 * PURPOSE:
 * Enforce override rules and system silence after override.
 * 
 * KEY RULE:
 * After override, the system steps away FOREVER.
 * - FinBot may NOT help execute
 * - FinBot may NOT suggest improvements
 * - FinBot may NOT optimize entry/exit
 * - FinBot may NOT comment until outcome is known
 * - Only post-mortem analysis is allowed
 */

import { getHumanOverrideProtocol, HumanOverrideRecord } from './HumanOverrideProtocol';
import { EthicsVerdict } from '../ethics/ExecutionEthicsFirewall';
import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * OverrideEligibility - Can this decision be overridden?
 */
export interface OverrideEligibility {
  readonly eligible: boolean;
  readonly reason: string;
  readonly blocking_factors: string[];
  readonly _frozen: true;
}

/**
 * SystemAssistanceBlock - Why system assistance is blocked
 */
export interface SystemAssistanceBlock {
  readonly blocked: boolean;
  readonly snapshot_id: string;
  readonly override_timestamp: string;
  readonly reason: string;
  readonly allowed_actions: readonly string[];
  readonly _frozen: true;
}

// =============================================================================
// OVERRIDE GUARD
// =============================================================================

export class OverrideGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  // ===========================================================================
  // OVERRIDE ELIGIBILITY GUARDS
  // ===========================================================================
  
  /**
   * Assert that override is allowed
   * THROWS if not allowed
   */
  public static assertOverrideAllowed(
    snapshotId: string,
    verdict: EthicsVerdict
  ): void {
    const eligibility = OverrideGuard.checkOverrideEligibility(snapshotId, verdict);
    
    if (!eligibility.eligible) {
      OverrideGuard.logGuardViolation('OVERRIDE_BLOCKED', snapshotId, eligibility.reason);
      throw new Error(
        `OVERRIDE_BLOCKED: ${eligibility.reason}\n` +
        `Blocking factors: ${eligibility.blocking_factors.join(', ')}`
      );
    }
  }
  
  /**
   * Check if override is eligible (non-throwing)
   */
  public static checkOverrideEligibility(
    snapshotId: string,
    verdict: EthicsVerdict
  ): OverrideEligibility {
    const blockingFactors: string[] = [];
    let reason = '';
    
    // 1. Check if ethics verdict allows override
    if (verdict.allowed) {
      blockingFactors.push('VERDICT_ALLOWED');
      reason = 'System did not refuse. Override not applicable.';
    }
    
    // 2. Check if severity is ABSOLUTE
    if (verdict.severity === 'ABSOLUTE') {
      blockingFactors.push('ABSOLUTE_SEVERITY');
      reason = 'ABSOLUTE severity cannot be overridden by any human.';
    }
    
    // 3. Check if already overridden
    const protocol = getHumanOverrideProtocol();
    if (protocol.isOverridden(snapshotId)) {
      blockingFactors.push('ALREADY_OVERRIDDEN');
      reason = 'This decision has already been overridden. Overrides are irreversible.';
    }
    
    // 4. Check lifecycle state
    try {
      const lifecycle = getDecisionLifecycleEngine();
      if (lifecycle.hasLifecycle(snapshotId)) {
        const state = lifecycle.getCurrentState(snapshotId);
        if (state.state !== 'ACTIVE') {
          blockingFactors.push('INVALID_LIFECYCLE_STATE');
          reason = `Snapshot is in state ${state.state}. Only ACTIVE decisions can be overridden.`;
        }
      }
    } catch {
      // Lifecycle may not exist
    }
    
    const eligible = blockingFactors.length === 0;
    
    return Object.freeze({
      eligible,
      reason: eligible ? 'Override is allowed' : reason,
      blocking_factors: Object.freeze(blockingFactors) as unknown as string[],
      _frozen: true
    });
  }
  
  // ===========================================================================
  // SYSTEM ASSISTANCE GUARDS
  // ===========================================================================
  
  /**
   * Assert that system assistance is NOT being provided for an overridden decision
   * THROWS if system is trying to assist
   */
  public static assertNoSystemAssistance(snapshotId: string): void {
    const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
    
    if (block.blocked) {
      OverrideGuard.logGuardViolation('SYSTEM_ASSISTANCE_BLOCKED', snapshotId, block.reason);
      throw new Error(
        `SYSTEM_ASSISTANCE_BLOCKED: ${block.reason}\n` +
        `Allowed actions: ${block.allowed_actions.join(', ')}`
      );
    }
  }
  
  /**
   * Check if system assistance is blocked (non-throwing)
   */
  public static checkSystemAssistanceBlock(snapshotId: string): SystemAssistanceBlock {
    const protocol = getHumanOverrideProtocol();
    
    if (!protocol.isOverridden(snapshotId)) {
      return Object.freeze({
        blocked: false,
        snapshot_id: snapshotId,
        override_timestamp: '',
        reason: 'No override exists for this snapshot',
        allowed_actions: ['ALL'] as readonly string[],
        _frozen: true
      });
    }
    
    const record = protocol.getOverrideRecord(snapshotId);
    
    // System assistance is ALWAYS blocked for overridden decisions
    // Only post-mortem analysis is allowed
    return Object.freeze({
      blocked: true,
      snapshot_id: snapshotId,
      override_timestamp: record?.timestamp || '',
      reason: 'This decision was overridden by the human. System assistance is permanently blocked.',
      allowed_actions: Object.freeze([
        'POST_MORTEM_ANALYSIS',
        'OUTCOME_RECORDING',
        'HISTORICAL_VIEWING'
      ]) as readonly string[],
      _frozen: true
    });
  }
  
  /**
   * Check if FinBot can speak about a snapshot
   * Returns false if overridden and outcome is pending
   */
  public static canFinBotSpeak(snapshotId: string): boolean {
    const protocol = getHumanOverrideProtocol();
    
    if (!protocol.isOverridden(snapshotId)) {
      return true;
    }
    
    const record = protocol.getOverrideRecord(snapshotId);
    
    // FinBot may NOT comment until outcome is known
    if (record?.outcome === 'PENDING') {
      return false;
    }
    
    // After outcome is known, only post-mortem is allowed
    return true; // But content is restricted
  }
  
  /**
   * Get FinBot silence message for overridden decision
   */
  public static getFinBotSilenceMessage(snapshotId: string): string {
    const protocol = getHumanOverrideProtocol();
    const record = protocol.getOverrideRecord(snapshotId);
    
    if (!record) {
      return '';
    }
    
    if (record.outcome === 'PENDING') {
      return 'This decision was overridden by you. ' +
             'I cannot provide assistance, suggestions, or commentary until the outcome is known. ' +
             'This is by design - when you override, I step away completely.';
    }
    
    // Outcome is known - can provide post-mortem
    return 'This decision was overridden. I can only provide post-mortem analysis.';
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  /**
   * Check if a snapshot is safe from override interference
   * Returns true if the snapshot has NOT been overridden
   */
  public static isNotOverridden(snapshotId: string): boolean {
    const protocol = getHumanOverrideProtocol();
    return !protocol.isOverridden(snapshotId);
  }
  
  /**
   * Get override record if exists
   */
  public static getOverrideRecord(snapshotId: string): HumanOverrideRecord | null {
    const protocol = getHumanOverrideProtocol();
    return protocol.getOverrideRecord(snapshotId);
  }
  
  /**
   * Check if human was right about override
   */
  public static wasHumanRight(snapshotId: string): boolean | null {
    const record = OverrideGuard.getOverrideRecord(snapshotId);
    
    if (!record || record.outcome === 'PENDING' || record.outcome === 'AMBIGUOUS') {
      return null;
    }
    
    return record.outcome === 'HUMAN_RIGHT';
  }
  
  // ===========================================================================
  // LOGGING
  // ===========================================================================
  
  private static logGuardViolation(
    guardType: string,
    snapshotId: string,
    reason: string
  ): void {
    OverrideGuard.auditLog.log({
      event_type: guardType as any,
      severity: 'WARNING',
      summary: `OverrideGuard: ${guardType}`,
      details: {
        guard: guardType,
        snapshot_id: snapshotId,
        reason,
        timestamp: new Date().toISOString()
      },
      actor: 'OVERRIDE_GUARD'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const overrideGuard = OverrideGuard;
export default OverrideGuard;

