/**
 * ReservationGuard - Global Guard for Temporal Reservations
 * 
 * PHASE 32: Temporal Capital & Risk Reservation (TCRR)
 * 
 * PURPOSE:
 * Enforce reservation constraints before operations proceed.
 * All guards THROW on failure - no booleans returned.
 * 
 * RULES:
 * - Lifecycle state must be ACTIVE
 * - No overlapping violations
 * - Risk budget not exceeded
 * - Capital not double-booked
 */

import { 
  getTemporalReservationEngine, 
  TemporalWindow,
  CapitalReservation,
  RiskReservation
} from './TemporalReservationEngine';
import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ReservationCheckResult - Result of a reservation check
 */
export interface ReservationCheckResult {
  readonly reservable: boolean;
  readonly capital_available: boolean;
  readonly risk_available: boolean;
  readonly lifecycle_valid: boolean;
  readonly blocking_reason?: string;
  readonly _frozen: true;
}

// =============================================================================
// RESERVATION GUARD
// =============================================================================

export class ReservationGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  // ===========================================================================
  // PRIMARY GUARDS (THROW ON FAILURE)
  // ===========================================================================
  
  /**
   * Assert that a snapshot can make reservations
   * THROWS unless all conditions are met:
   * - Lifecycle state is ACTIVE (or pre-activation states)
   * - No overlapping violations
   * - Risk budget not exceeded
   * - Capital not double-booked
   */
  public static assertReservable(
    snapshotId: string,
    window: TemporalWindow,
    capital: number,
    risk: number
  ): void {
    const engine = getTemporalReservationEngine();
    const lifecycleEngine = getDecisionLifecycleEngine();
    
    // 1. Check lifecycle state
    if (lifecycleEngine.hasLifecycle(snapshotId)) {
      const state = lifecycleEngine.getCurrentState(snapshotId);
      const allowedStates = ['CREATED', 'ELIGIBLE', 'CONFLICTED', 'ACTIVE'];
      
      if (!allowedStates.includes(state.state)) {
        ReservationGuard.logViolation('LIFECYCLE_INVALID', snapshotId, state.state);
        throw new Error(
          `RESERVATION_BLOCKED: Snapshot ${snapshotId} is in state ${state.state}. ` +
          `Only CREATED, ELIGIBLE, CONFLICTED, or ACTIVE states can reserve resources.`
        );
      }
    }
    
    // 2. Check for duplicate reservations
    if (engine.hasCapitalReservation(snapshotId)) {
      ReservationGuard.logViolation('DUPLICATE_CAPITAL', snapshotId, 'already reserved');
      throw new Error(
        `RESERVATION_BLOCKED: Snapshot ${snapshotId} already has a capital reservation.`
      );
    }
    
    if (engine.hasRiskReservation(snapshotId)) {
      ReservationGuard.logViolation('DUPLICATE_RISK', snapshotId, 'already reserved');
      throw new Error(
        `RESERVATION_BLOCKED: Snapshot ${snapshotId} already has a risk reservation.`
      );
    }
    
    // 3. Check capital availability
    try {
      engine.assertCapitalAvailable(window, capital);
    } catch (e) {
      ReservationGuard.logViolation('CAPITAL_UNAVAILABLE', snapshotId, String(e));
      throw e;
    }
    
    // 4. Check risk availability
    try {
      engine.assertRiskAvailable(window, risk);
    } catch (e) {
      ReservationGuard.logViolation('RISK_UNAVAILABLE', snapshotId, String(e));
      throw e;
    }
  }
  
  /**
   * Assert that a snapshot has valid reservations
   * THROWS if reservations are missing
   */
  public static assertHasReservations(snapshotId: string): void {
    const engine = getTemporalReservationEngine();
    
    if (!engine.hasCapitalReservation(snapshotId) && !engine.hasRiskReservation(snapshotId)) {
      ReservationGuard.logViolation('NO_RESERVATIONS', snapshotId, 'missing');
      throw new Error(
        `RESERVATION_MISSING: Snapshot ${snapshotId} has no reservations. ` +
        `No reservation = decision cannot activate.`
      );
    }
  }
  
  /**
   * Assert that a snapshot can activate (has reservations and lifecycle allows)
   * THROWS if activation is not allowed
   */
  public static assertCanActivate(snapshotId: string): void {
    const engine = getTemporalReservationEngine();
    const lifecycleEngine = getDecisionLifecycleEngine();
    
    // Must have lifecycle
    if (!lifecycleEngine.hasLifecycle(snapshotId)) {
      throw new Error(
        `ACTIVATION_BLOCKED: Snapshot ${snapshotId} has no lifecycle.`
      );
    }
    
    // Must be in CONFLICTED state to activate
    const state = lifecycleEngine.getCurrentState(snapshotId);
    if (state.state !== 'CONFLICTED') {
      throw new Error(
        `ACTIVATION_BLOCKED: Snapshot ${snapshotId} is in state ${state.state}. ` +
        `Must be in CONFLICTED state to activate.`
      );
    }
    
    // Must have at least one reservation type
    if (!engine.hasCapitalReservation(snapshotId) && !engine.hasRiskReservation(snapshotId)) {
      throw new Error(
        `ACTIVATION_BLOCKED: Snapshot ${snapshotId} has no reservations. ` +
        `No reservation = decision cannot activate.`
      );
    }
  }
  
  /**
   * Assert that capital is available without making a reservation
   */
  public static assertCapitalAvailable(window: TemporalWindow, amount: number): void {
    const engine = getTemporalReservationEngine();
    engine.assertCapitalAvailable(window, amount);
  }
  
  /**
   * Assert that risk is available without making a reservation
   */
  public static assertRiskAvailable(window: TemporalWindow, riskUnits: number): void {
    const engine = getTemporalReservationEngine();
    engine.assertRiskAvailable(window, riskUnits);
  }
  
  // ===========================================================================
  // CHECK METHODS (NON-THROWING)
  // ===========================================================================
  
  /**
   * Check if a snapshot can make reservations (non-throwing)
   */
  public static checkReservable(
    snapshotId: string,
    window: TemporalWindow,
    capital: number,
    risk: number
  ): ReservationCheckResult {
    const engine = getTemporalReservationEngine();
    const lifecycleEngine = getDecisionLifecycleEngine();
    
    let lifecycleValid = true;
    let capitalAvailable = true;
    let riskAvailable = true;
    let blockingReason: string | undefined;
    
    // Check lifecycle
    if (lifecycleEngine.hasLifecycle(snapshotId)) {
      const state = lifecycleEngine.getCurrentState(snapshotId);
      const allowedStates = ['CREATED', 'ELIGIBLE', 'CONFLICTED', 'ACTIVE'];
      if (!allowedStates.includes(state.state)) {
        lifecycleValid = false;
        blockingReason = `Invalid lifecycle state: ${state.state}`;
      }
    }
    
    // Check capital
    try {
      engine.assertCapitalAvailable(window, capital);
    } catch {
      capitalAvailable = false;
      blockingReason = blockingReason || 'Insufficient capital';
    }
    
    // Check risk
    try {
      engine.assertRiskAvailable(window, risk);
    } catch {
      riskAvailable = false;
      blockingReason = blockingReason || 'Insufficient risk budget';
    }
    
    // Check duplicates
    if (engine.hasCapitalReservation(snapshotId)) {
      capitalAvailable = false;
      blockingReason = blockingReason || 'Already has capital reservation';
    }
    
    if (engine.hasRiskReservation(snapshotId)) {
      riskAvailable = false;
      blockingReason = blockingReason || 'Already has risk reservation';
    }
    
    const reservable = lifecycleValid && capitalAvailable && riskAvailable;
    
    return Object.freeze({
      reservable,
      capital_available: capitalAvailable,
      risk_available: riskAvailable,
      lifecycle_valid: lifecycleValid,
      blocking_reason: reservable ? undefined : blockingReason,
      _frozen: true
    });
  }
  
  /**
   * Check if snapshot has reservations (non-throwing)
   */
  public static hasReservations(snapshotId: string): boolean {
    const engine = getTemporalReservationEngine();
    return engine.hasCapitalReservation(snapshotId) || engine.hasRiskReservation(snapshotId);
  }
  
  /**
   * Get reservation details for a snapshot
   */
  public static getReservations(snapshotId: string): {
    capital: CapitalReservation | null;
    risk: RiskReservation | null;
  } {
    const engine = getTemporalReservationEngine();
    return {
      capital: engine.getCapitalReservation(snapshotId),
      risk: engine.getRiskReservation(snapshotId)
    };
  }
  
  // ===========================================================================
  // CONFLICT DETECTION
  // ===========================================================================
  
  /**
   * Check for temporal conflicts without throwing
   */
  public static detectConflicts(
    snapshotId: string,
    window: TemporalWindow,
    capital: number,
    risk: number
  ): {
    has_conflicts: boolean;
    capital_conflicts: number;
    risk_conflicts: number;
    conflict_details: string[];
  } {
    const engine = getTemporalReservationEngine();
    
    const capitalConflicts = engine.detectCapitalConflicts(snapshotId, capital, window);
    const riskConflicts = engine.detectRiskConflicts(snapshotId, risk, window);
    
    const details: string[] = [];
    
    for (const c of capitalConflicts) {
      details.push(`Capital overlap with ${c.existing_reservation_id}: ${c.overlap_amount}`);
    }
    
    for (const c of riskConflicts) {
      details.push(`Risk overlap with ${c.existing_reservation_id}: ${c.overlap_amount}`);
    }
    
    return {
      has_conflicts: capitalConflicts.length > 0 || riskConflicts.length > 0,
      capital_conflicts: capitalConflicts.length,
      risk_conflicts: riskConflicts.length,
      conflict_details: details
    };
  }
  
  // ===========================================================================
  // LOGGING
  // ===========================================================================
  
  private static logViolation(
    guardType: string,
    snapshotId: string,
    reason: string
  ): void {
    ReservationGuard.auditLog.log({
      event_type: 'EXECUTION_BLOCKED',
      severity: 'WARNING',
      summary: `ReservationGuard violation: ${guardType}`,
      details: {
        guard: guardType,
        snapshot_id: snapshotId,
        reason,
        timestamp: new Date().toISOString()
      },
      actor: 'GUARD'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const reservationGuard = ReservationGuard;
export default ReservationGuard;

