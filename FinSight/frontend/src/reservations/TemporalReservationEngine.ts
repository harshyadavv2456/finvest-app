/**
 * TemporalReservationEngine - Single Authority for Temporal Reservations
 * 
 * PHASE 32: Temporal Capital & Risk Reservation (TCRR)
 * 
 * PURPOSE:
 * Make capital and risk scarce, temporal resources that cannot be double-counted.
 * 
 * DESIGN LAW:
 * - Capital reserved is capital unavailable — even if "unused"
 * - Risk reserved is risk spent — even if unrealized
 * - If the system lies here, everything else collapses
 * 
 * RULES:
 * - Reservations are time-bound
 * - Overlap is illegal unless explicitly allowed
 * - No partial reservations
 * - No auto-adjustment
 * - All reservations frozen
 * - No same snapshot reserving twice
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';

// =============================================================================
// TYPES
// =============================================================================

/**
 * TemporalWindow - A time interval
 */
export interface TemporalWindow {
  readonly start_at: string;  // ISODate
  readonly end_at: string;    // ISODate
}

/**
 * ReservationReason - Why capital is reserved
 */
export type ReservationReason = 'BUY' | 'HOLD' | 'REBALANCE' | 'HEDGE';

/**
 * CapitalReservation - Time-bound capital commitment
 */
export interface CapitalReservation {
  readonly reservation_id: string;
  readonly snapshot_id: string;
  readonly amount: number;              // currency normalized
  readonly window: TemporalWindow;
  readonly priority: number;            // derived, not user-set
  readonly reason: ReservationReason;
  readonly created_at: string;
  readonly _frozen: true;
}

/**
 * RiskReservation - Time-bound risk commitment
 */
export interface RiskReservation {
  readonly reservation_id: string;
  readonly snapshot_id: string;
  readonly risk_units: number;          // normalized risk score
  readonly window: TemporalWindow;
  readonly marginal_risk: number;
  readonly created_at: string;
  readonly _frozen: true;
}

/**
 * ReservationConflict - Detected overlap
 */
export interface ReservationConflict {
  readonly conflict_type: 'CAPITAL_OVERLAP' | 'RISK_OVERLAP' | 'INSUFFICIENT_CAPITAL' | 'INSUFFICIENT_RISK';
  readonly existing_reservation_id: string;
  readonly new_reservation_id: string;
  readonly overlap_window: TemporalWindow;
  readonly overlap_amount: number;
  readonly _frozen: true;
}

/**
 * ReservationBudget - Current available resources
 */
export interface ReservationBudget {
  readonly total_capital: number;
  readonly reserved_capital: number;
  readonly available_capital: number;
  readonly total_risk_units: number;
  readonly reserved_risk_units: number;
  readonly available_risk_units: number;
  readonly at_time: string;
  readonly _frozen: true;
}

// =============================================================================
// TEMPORAL RESERVATION ENGINE
// =============================================================================

export class TemporalReservationEngine {
  private static instance: TemporalReservationEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Active reservations
  private capitalReservations: Map<string, CapitalReservation> = new Map();
  private riskReservations: Map<string, RiskReservation> = new Map();
  
  // Budget configuration
  private totalCapitalBudget: number = 100000; // Default, can be configured
  private totalRiskBudget: number = 100;       // Normalized risk units
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): TemporalReservationEngine {
    if (!TemporalReservationEngine.instance) {
      TemporalReservationEngine.instance = new TemporalReservationEngine();
    }
    return TemporalReservationEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_reservations');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.capital) {
          for (const [key, value] of Object.entries(parsed.capital)) {
            this.capitalReservations.set(key, Object.freeze(value as CapitalReservation));
          }
        }
        if (parsed.risk) {
          for (const [key, value] of Object.entries(parsed.risk)) {
            this.riskReservations.set(key, Object.freeze(value as RiskReservation));
          }
        }
        if (parsed.totalCapital) this.totalCapitalBudget = parsed.totalCapital;
        if (parsed.totalRisk) this.totalRiskBudget = parsed.totalRisk;
      }
    } catch (e) {
      console.error('Failed to load reservations:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        capital: Object.fromEntries(this.capitalReservations),
        risk: Object.fromEntries(this.riskReservations),
        totalCapital: this.totalCapitalBudget,
        totalRisk: this.totalRiskBudget
      };
      localStorage.setItem('finvest_reservations', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save reservations:', e);
    }
  }
  
  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  
  /**
   * Configure total budgets
   */
  public configureBudgets(totalCapital: number, totalRisk: number): void {
    if (totalCapital <= 0 || totalRisk <= 0) {
      throw new Error('RESERVATION_ERROR: Budgets must be positive');
    }
    this.totalCapitalBudget = totalCapital;
    this.totalRiskBudget = totalRisk;
    this.saveToStorage();
  }
  
  // ===========================================================================
  // CORE RESERVATION API
  // ===========================================================================
  
  /**
   * Reserve capital for a decision
   * THROWS on overlap or insufficient capital
   */
  public reserveCapital(
    snapshotId: string,
    amount: number,
    window: TemporalWindow,
    reason: ReservationReason,
    priority: number = 50
  ): CapitalReservation {
    // 1. Validate window
    this.validateWindow(window);
    
    // 2. Check for duplicate reservation
    if (this.hasCapitalReservation(snapshotId)) {
      throw new Error(
        `RESERVATION_ERROR: Snapshot ${snapshotId} already has a capital reservation. ` +
        `No same snapshot can reserve twice.`
      );
    }
    
    // 3. Check lifecycle (optional - may not exist yet)
    this.checkLifecycleIfExists(snapshotId);
    
    // 4. Assert capital available
    this.assertCapitalAvailable(window, amount);
    
    // 5. Create reservation
    const reservation: CapitalReservation = Object.freeze({
      reservation_id: `CAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: snapshotId,
      amount,
      window: Object.freeze({ ...window }),
      priority,
      reason,
      created_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.capitalReservations.set(snapshotId, reservation);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Capital reserved: ${amount} for ${snapshotId}`,
      details: {
        reservation_id: reservation.reservation_id,
        snapshot_id: snapshotId,
        amount,
        window,
        reason
      },
      actor: 'ENGINE'
    });
    
    return reservation;
  }
  
  /**
   * Reserve risk for a decision
   * THROWS on overlap or insufficient risk budget
   */
  public reserveRisk(
    snapshotId: string,
    riskUnits: number,
    window: TemporalWindow,
    marginalRisk: number = 0
  ): RiskReservation {
    // 1. Validate window
    this.validateWindow(window);
    
    // 2. Check for duplicate reservation
    if (this.hasRiskReservation(snapshotId)) {
      throw new Error(
        `RESERVATION_ERROR: Snapshot ${snapshotId} already has a risk reservation. ` +
        `No same snapshot can reserve twice.`
      );
    }
    
    // 3. Check lifecycle (optional - may not exist yet)
    this.checkLifecycleIfExists(snapshotId);
    
    // 4. Assert risk available
    this.assertRiskAvailable(window, riskUnits);
    
    // 5. Create reservation
    const reservation: RiskReservation = Object.freeze({
      reservation_id: `RISK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: snapshotId,
      risk_units: riskUnits,
      window: Object.freeze({ ...window }),
      marginal_risk: marginalRisk,
      created_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.riskReservations.set(snapshotId, reservation);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Risk reserved: ${riskUnits} units for ${snapshotId}`,
      details: {
        reservation_id: reservation.reservation_id,
        snapshot_id: snapshotId,
        risk_units: riskUnits,
        window,
        marginal_risk: marginalRisk
      },
      actor: 'ENGINE'
    });
    
    return reservation;
  }
  
  /**
   * Release all reservations for a snapshot
   */
  public releaseReservations(snapshotId: string): void {
    const hadCapital = this.capitalReservations.has(snapshotId);
    const hadRisk = this.riskReservations.has(snapshotId);
    
    this.capitalReservations.delete(snapshotId);
    this.riskReservations.delete(snapshotId);
    this.saveToStorage();
    
    if (hadCapital || hadRisk) {
      this.auditLog.log({
        event_type: 'CONTEXT_CREATED',
        severity: 'INFO',
        summary: `Reservations released for ${snapshotId}`,
        details: {
          snapshot_id: snapshotId,
          capital_released: hadCapital,
          risk_released: hadRisk
        },
        actor: 'ENGINE'
      });
    }
  }
  
  // ===========================================================================
  // ASSERTIONS (THROW ON FAILURE)
  // ===========================================================================
  
  /**
   * Assert that capital is available in the given window
   * THROWS if not available
   */
  public assertCapitalAvailable(window: TemporalWindow, amount: number): void {
    this.validateWindow(window);
    
    // Check all overlapping reservations
    const overlapping = this.getOverlappingCapitalReservations(window);
    const reservedAmount = overlapping.reduce((sum, r) => sum + r.amount, 0);
    const availableCapital = this.totalCapitalBudget - reservedAmount;
    
    if (amount > availableCapital) {
      throw new Error(
        `CAPITAL_UNAVAILABLE: Requested ${amount}, but only ${availableCapital} available ` +
        `in window ${window.start_at} to ${window.end_at}. ` +
        `Total budget: ${this.totalCapitalBudget}, Reserved: ${reservedAmount}.`
      );
    }
  }
  
  /**
   * Assert that risk budget is available in the given window
   * THROWS if not available
   */
  public assertRiskAvailable(window: TemporalWindow, riskUnits: number): void {
    this.validateWindow(window);
    
    // Check all overlapping reservations
    const overlapping = this.getOverlappingRiskReservations(window);
    const reservedRisk = overlapping.reduce((sum, r) => sum + r.risk_units, 0);
    const availableRisk = this.totalRiskBudget - reservedRisk;
    
    if (riskUnits > availableRisk) {
      throw new Error(
        `RISK_UNAVAILABLE: Requested ${riskUnits} risk units, but only ${availableRisk} available ` +
        `in window ${window.start_at} to ${window.end_at}. ` +
        `Total budget: ${this.totalRiskBudget}, Reserved: ${reservedRisk}.`
      );
    }
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get all active capital reservations at a specific time
   */
  public getActiveCapitalReservations(at: string): CapitalReservation[] {
    const targetTime = new Date(at).getTime();
    const result: CapitalReservation[] = [];
    
    for (const reservation of this.capitalReservations.values()) {
      const startTime = new Date(reservation.window.start_at).getTime();
      const endTime = new Date(reservation.window.end_at).getTime();
      
      if (targetTime >= startTime && targetTime <= endTime) {
        result.push(reservation);
      }
    }
    
    return result;
  }
  
  /**
   * Get all active risk reservations at a specific time
   */
  public getActiveRiskReservations(at: string): RiskReservation[] {
    const targetTime = new Date(at).getTime();
    const result: RiskReservation[] = [];
    
    for (const reservation of this.riskReservations.values()) {
      const startTime = new Date(reservation.window.start_at).getTime();
      const endTime = new Date(reservation.window.end_at).getTime();
      
      if (targetTime >= startTime && targetTime <= endTime) {
        result.push(reservation);
      }
    }
    
    return result;
  }
  
  /**
   * Get overlapping capital reservations for a window
   */
  public getOverlappingCapitalReservations(window: TemporalWindow): CapitalReservation[] {
    const result: CapitalReservation[] = [];
    
    for (const reservation of this.capitalReservations.values()) {
      if (this.windowsOverlap(window, reservation.window)) {
        result.push(reservation);
      }
    }
    
    return result;
  }
  
  /**
   * Get overlapping risk reservations for a window
   */
  public getOverlappingRiskReservations(window: TemporalWindow): RiskReservation[] {
    const result: RiskReservation[] = [];
    
    for (const reservation of this.riskReservations.values()) {
      if (this.windowsOverlap(window, reservation.window)) {
        result.push(reservation);
      }
    }
    
    return result;
  }
  
  /**
   * Get capital reservation for a snapshot
   */
  public getCapitalReservation(snapshotId: string): CapitalReservation | null {
    return this.capitalReservations.get(snapshotId) || null;
  }
  
  /**
   * Get risk reservation for a snapshot
   */
  public getRiskReservation(snapshotId: string): RiskReservation | null {
    return this.riskReservations.get(snapshotId) || null;
  }
  
  /**
   * Check if snapshot has capital reservation
   */
  public hasCapitalReservation(snapshotId: string): boolean {
    return this.capitalReservations.has(snapshotId);
  }
  
  /**
   * Check if snapshot has risk reservation
   */
  public hasRiskReservation(snapshotId: string): boolean {
    return this.riskReservations.has(snapshotId);
  }
  
  /**
   * Get current budget state at a specific time
   */
  public getBudgetAt(at: string): ReservationBudget {
    const activeCapital = this.getActiveCapitalReservations(at);
    const activeRisk = this.getActiveRiskReservations(at);
    
    const reservedCapital = activeCapital.reduce((sum, r) => sum + r.amount, 0);
    const reservedRisk = activeRisk.reduce((sum, r) => sum + r.risk_units, 0);
    
    return Object.freeze({
      total_capital: this.totalCapitalBudget,
      reserved_capital: reservedCapital,
      available_capital: this.totalCapitalBudget - reservedCapital,
      total_risk_units: this.totalRiskBudget,
      reserved_risk_units: reservedRisk,
      available_risk_units: this.totalRiskBudget - reservedRisk,
      at_time: at,
      _frozen: true
    });
  }
  
  /**
   * Get all reservations summary
   */
  public getSummary(): {
    total_capital_reservations: number;
    total_risk_reservations: number;
    total_capital_reserved: number;
    total_risk_reserved: number;
    earliest_expiry: string | null;
    latest_expiry: string | null;
  } {
    let totalCapitalReserved = 0;
    let totalRiskReserved = 0;
    let earliest: Date | null = null;
    let latest: Date | null = null;
    
    for (const res of this.capitalReservations.values()) {
      totalCapitalReserved += res.amount;
      const end = new Date(res.window.end_at);
      if (!earliest || end < earliest) earliest = end;
      if (!latest || end > latest) latest = end;
    }
    
    for (const res of this.riskReservations.values()) {
      totalRiskReserved += res.risk_units;
      const end = new Date(res.window.end_at);
      if (!earliest || end < earliest) earliest = end;
      if (!latest || end > latest) latest = end;
    }
    
    return {
      total_capital_reservations: this.capitalReservations.size,
      total_risk_reservations: this.riskReservations.size,
      total_capital_reserved: totalCapitalReserved,
      total_risk_reserved: totalRiskReserved,
      earliest_expiry: earliest?.toISOString() || null,
      latest_expiry: latest?.toISOString() || null
    };
  }
  
  // ===========================================================================
  // CONFLICT DETECTION
  // ===========================================================================
  
  /**
   * Detect conflicts between reservations
   * Returns all conflicts that would occur if new reservation is added
   */
  public detectCapitalConflicts(
    snapshotId: string,
    amount: number,
    window: TemporalWindow
  ): ReservationConflict[] {
    const conflicts: ReservationConflict[] = [];
    const overlapping = this.getOverlappingCapitalReservations(window);
    
    const reservedAmount = overlapping.reduce((sum, r) => sum + r.amount, 0);
    if (reservedAmount + amount > this.totalCapitalBudget) {
      for (const existing of overlapping) {
        const overlapWindow = this.getOverlapWindow(window, existing.window);
        if (overlapWindow) {
          conflicts.push(Object.freeze({
            conflict_type: 'CAPITAL_OVERLAP' as const,
            existing_reservation_id: existing.reservation_id,
            new_reservation_id: `PENDING-${snapshotId}`,
            overlap_window: overlapWindow,
            overlap_amount: Math.min(amount, existing.amount),
            _frozen: true
          }));
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Detect risk conflicts
   */
  public detectRiskConflicts(
    snapshotId: string,
    riskUnits: number,
    window: TemporalWindow
  ): ReservationConflict[] {
    const conflicts: ReservationConflict[] = [];
    const overlapping = this.getOverlappingRiskReservations(window);
    
    const reservedRisk = overlapping.reduce((sum, r) => sum + r.risk_units, 0);
    if (reservedRisk + riskUnits > this.totalRiskBudget) {
      for (const existing of overlapping) {
        const overlapWindow = this.getOverlapWindow(window, existing.window);
        if (overlapWindow) {
          conflicts.push(Object.freeze({
            conflict_type: 'RISK_OVERLAP' as const,
            existing_reservation_id: existing.reservation_id,
            new_reservation_id: `PENDING-${snapshotId}`,
            overlap_window: overlapWindow,
            overlap_amount: Math.min(riskUnits, existing.risk_units),
            _frozen: true
          }));
        }
      }
    }
    
    return conflicts;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  /**
   * Validate temporal window
   * THROWS if invalid
   */
  private validateWindow(window: TemporalWindow): void {
    const start = new Date(window.start_at).getTime();
    const end = new Date(window.end_at).getTime();
    
    if (isNaN(start) || isNaN(end)) {
      throw new Error('RESERVATION_ERROR: Invalid date format in temporal window');
    }
    
    if (end <= start) {
      throw new Error(
        `RESERVATION_ERROR: Time-travel not allowed. ` +
        `end_at (${window.end_at}) must be after start_at (${window.start_at})`
      );
    }
  }
  
  /**
   * Check if two windows overlap
   */
  private windowsOverlap(a: TemporalWindow, b: TemporalWindow): boolean {
    const aStart = new Date(a.start_at).getTime();
    const aEnd = new Date(a.end_at).getTime();
    const bStart = new Date(b.start_at).getTime();
    const bEnd = new Date(b.end_at).getTime();
    
    // Overlap if one starts before the other ends
    return aStart < bEnd && bStart < aEnd;
  }
  
  /**
   * Get the overlapping portion of two windows
   */
  private getOverlapWindow(a: TemporalWindow, b: TemporalWindow): TemporalWindow | null {
    if (!this.windowsOverlap(a, b)) return null;
    
    const aStart = new Date(a.start_at).getTime();
    const aEnd = new Date(a.end_at).getTime();
    const bStart = new Date(b.start_at).getTime();
    const bEnd = new Date(b.end_at).getTime();
    
    return Object.freeze({
      start_at: new Date(Math.max(aStart, bStart)).toISOString(),
      end_at: new Date(Math.min(aEnd, bEnd)).toISOString()
    });
  }
  
  /**
   * Check lifecycle if it exists
   */
  private checkLifecycleIfExists(snapshotId: string): void {
    try {
      const lifecycle = getDecisionLifecycleEngine();
      if (lifecycle.hasLifecycle(snapshotId)) {
        const state = lifecycle.getCurrentState(snapshotId);
        // Only allow certain states to make reservations
        const allowedStates = ['CREATED', 'ELIGIBLE', 'CONFLICTED', 'ACTIVE'];
        if (!allowedStates.includes(state.state)) {
          throw new Error(
            `RESERVATION_ERROR: Snapshot ${snapshotId} is in state ${state.state}. ` +
            `Cannot reserve resources for decisions in terminal states.`
          );
        }
      }
    } catch (e) {
      // Lifecycle may not exist yet - that's OK for initial reservation
      if (e instanceof Error && e.message.includes('RESERVATION_ERROR')) {
        throw e;
      }
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getTemporalReservationEngine = () => TemporalReservationEngine.getInstance();
export default TemporalReservationEngine;

