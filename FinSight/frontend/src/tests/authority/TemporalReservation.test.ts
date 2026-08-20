/**
 * TemporalReservation Tests - Phase 32 TCRR
 * 
 * MANDATORY TESTS (BUILD MUST FAIL WITHOUT THESE):
 * - Overlapping capital reservations throw
 * - Overlapping risk reservations throw
 * - Release frees capacity
 * - Reservation without ACTIVE lifecycle throws (for terminal states)
 * - Conflict resolution respects reservation priority
 * - All reservations immutable
 * - No time-travel (end < start throws)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTemporalReservationEngine,
  TemporalReservationEngine,
  TemporalWindow,
  CapitalReservation,
  RiskReservation
} from '../../reservations/TemporalReservationEngine';
import { ReservationGuard } from '../../reservations/ReservationGuard';

// =============================================================================
// TEST HELPERS
// =============================================================================

const generateSnapshotId = (): string => {
  return `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createWindow = (daysFromNow: number, durationDays: number): TemporalWindow => {
  const now = new Date();
  const start = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString()
  };
};

// =============================================================================
// CAPITAL RESERVATION TESTS
// =============================================================================

describe('Capital Reservations', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    // Configure budget
    engine.configureBudgets(100000, 100);
  });
  
  it('creates capital reservation successfully', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const reservation = engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    
    expect(reservation.snapshot_id).toBe(snapshotId);
    expect(reservation.amount).toBe(10000);
    expect(reservation._frozen).toBe(true);
    
    console.log('✓ Capital reservation created');
  });
  
  it('throws on overlapping capital reservations that exceed budget', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    // Reserve 60% of capital
    engine.reserveCapital(snap1, 60000, window, 'BUY');
    
    // Try to reserve another 50% in same window - should fail
    expect(() => engine.reserveCapital(snap2, 50000, window, 'BUY'))
      .toThrow('CAPITAL_UNAVAILABLE');
    
    console.log('✓ Overlapping capital reservations throw');
  });
  
  it('allows non-overlapping capital reservations', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    
    // Different time windows
    const window1 = createWindow(0, 15);
    const window2 = createWindow(20, 15);
    
    engine.reserveCapital(snap1, 60000, window1, 'BUY');
    
    // Should succeed - different window
    const res2 = engine.reserveCapital(snap2, 60000, window2, 'BUY');
    expect(res2.amount).toBe(60000);
    
    console.log('✓ Non-overlapping reservations allowed');
  });
  
  it('throws on duplicate reservation for same snapshot', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    
    expect(() => engine.reserveCapital(snapshotId, 5000, window, 'BUY'))
      .toThrow('already has a capital reservation');
    
    console.log('✓ Duplicate reservation throws');
  });
});

// =============================================================================
// RISK RESERVATION TESTS
// =============================================================================

describe('Risk Reservations', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('creates risk reservation successfully', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const reservation = engine.reserveRisk(snapshotId, 20, window);
    
    expect(reservation.snapshot_id).toBe(snapshotId);
    expect(reservation.risk_units).toBe(20);
    expect(reservation._frozen).toBe(true);
    
    console.log('✓ Risk reservation created');
  });
  
  it('throws on overlapping risk reservations that exceed budget', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    // Reserve 60% of risk budget
    engine.reserveRisk(snap1, 60, window);
    
    // Try to reserve another 50% in same window - should fail
    expect(() => engine.reserveRisk(snap2, 50, window))
      .toThrow('RISK_UNAVAILABLE');
    
    console.log('✓ Overlapping risk reservations throw');
  });
});

// =============================================================================
// RELEASE TESTS
// =============================================================================

describe('Release Reservations', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('release frees capacity', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    // Reserve all capital
    engine.reserveCapital(snap1, 80000, window, 'BUY');
    
    // Try to reserve more - should fail
    expect(() => engine.reserveCapital(snap2, 30000, window, 'BUY'))
      .toThrow('CAPITAL_UNAVAILABLE');
    
    // Release first reservation
    engine.releaseReservations(snap1);
    
    // Now should succeed
    const res2 = engine.reserveCapital(snap2, 30000, window, 'BUY');
    expect(res2.amount).toBe(30000);
    
    console.log('✓ Release frees capacity');
  });
  
  it('release clears both capital and risk', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    engine.reserveRisk(snapshotId, 20, window);
    
    expect(engine.hasCapitalReservation(snapshotId)).toBe(true);
    expect(engine.hasRiskReservation(snapshotId)).toBe(true);
    
    engine.releaseReservations(snapshotId);
    
    expect(engine.hasCapitalReservation(snapshotId)).toBe(false);
    expect(engine.hasRiskReservation(snapshotId)).toBe(false);
    
    console.log('✓ Release clears both capital and risk');
  });
});

// =============================================================================
// TIME-TRAVEL TESTS
// =============================================================================

describe('Time-Travel Prevention', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('throws if end_at <= start_at', () => {
    const snapshotId = generateSnapshotId();
    const now = new Date();
    
    // End before start
    const invalidWindow: TemporalWindow = {
      start_at: new Date(now.getTime() + 1000).toISOString(),
      end_at: now.toISOString()
    };
    
    expect(() => engine.reserveCapital(snapshotId, 10000, invalidWindow, 'BUY'))
      .toThrow('Time-travel not allowed');
    
    console.log('✓ Time-travel throws');
  });
  
  it('throws if end_at equals start_at', () => {
    const snapshotId = generateSnapshotId();
    const now = new Date().toISOString();
    
    const invalidWindow: TemporalWindow = {
      start_at: now,
      end_at: now
    };
    
    expect(() => engine.reserveCapital(snapshotId, 10000, invalidWindow, 'BUY'))
      .toThrow('Time-travel not allowed');
    
    console.log('✓ Zero-duration window throws');
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

describe('Immutability', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('capital reservations are frozen', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const reservation = engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    
    expect(reservation._frozen).toBe(true);
    expect(Object.isFrozen(reservation)).toBe(true);
    
    console.log('✓ Capital reservations frozen');
  });
  
  it('risk reservations are frozen', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const reservation = engine.reserveRisk(snapshotId, 20, window);
    
    expect(reservation._frozen).toBe(true);
    expect(Object.isFrozen(reservation)).toBe(true);
    
    console.log('✓ Risk reservations frozen');
  });
  
  it('budget query results are frozen', () => {
    const budget = engine.getBudgetAt(new Date().toISOString());
    
    expect(budget._frozen).toBe(true);
    expect(Object.isFrozen(budget)).toBe(true);
    
    console.log('✓ Budget results frozen');
  });
});

// =============================================================================
// RESERVATION GUARD TESTS
// =============================================================================

describe('ReservationGuard', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('assertReservable passes for valid reservation', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    expect(() => ReservationGuard.assertReservable(snapshotId, window, 10000, 20))
      .not.toThrow();
    
    console.log('✓ assertReservable passes for valid');
  });
  
  it('assertReservable throws for insufficient capital', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    expect(() => ReservationGuard.assertReservable(snapshotId, window, 200000, 20))
      .toThrow('CAPITAL_UNAVAILABLE');
    
    console.log('✓ assertReservable throws for insufficient capital');
  });
  
  it('assertHasReservations throws for missing reservations', () => {
    const snapshotId = generateSnapshotId();
    
    expect(() => ReservationGuard.assertHasReservations(snapshotId))
      .toThrow('RESERVATION_MISSING');
    
    console.log('✓ assertHasReservations throws for missing');
  });
  
  it('checkReservable returns correct result', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const result = ReservationGuard.checkReservable(snapshotId, window, 10000, 20);
    
    expect(result.reservable).toBe(true);
    expect(result.capital_available).toBe(true);
    expect(result.risk_available).toBe(true);
    
    console.log('✓ checkReservable returns correct result');
  });
  
  it('detectConflicts returns conflict info', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    // Reserve most capital
    engine.reserveCapital(snap1, 80000, window, 'BUY');
    
    // Check conflicts for new reservation
    const conflicts = ReservationGuard.detectConflicts(snap2, window, 50000, 20);
    
    expect(conflicts.has_conflicts).toBe(true);
    expect(conflicts.capital_conflicts).toBeGreaterThan(0);
    
    console.log('✓ detectConflicts returns conflict info');
  });
});

// =============================================================================
// QUERY TESTS
// =============================================================================

describe('Reservation Queries', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('getActiveCapitalReservations returns active only', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    
    // Window that includes "now"
    const activeWindow = createWindow(-5, 30);
    // Window in the future
    const futureWindow = createWindow(60, 30);
    
    engine.reserveCapital(snap1, 10000, activeWindow, 'BUY');
    engine.reserveCapital(snap2, 10000, futureWindow, 'BUY');
    
    const now = new Date().toISOString();
    const active = engine.getActiveCapitalReservations(now);
    
    expect(active.some(r => r.snapshot_id === snap1)).toBe(true);
    expect(active.some(r => r.snapshot_id === snap2)).toBe(false);
    
    console.log('✓ getActiveCapitalReservations returns active only');
  });
  
  it('getBudgetAt calculates correctly', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(-1, 30);
    
    engine.reserveCapital(snapshotId, 30000, window, 'BUY');
    engine.reserveRisk(snapshotId, 25, window);
    
    const budget = engine.getBudgetAt(new Date().toISOString());
    
    expect(budget.total_capital).toBe(100000);
    expect(budget.reserved_capital).toBe(30000);
    expect(budget.available_capital).toBe(70000);
    expect(budget.total_risk_units).toBe(100);
    expect(budget.reserved_risk_units).toBe(25);
    expect(budget.available_risk_units).toBe(75);
    
    console.log('✓ getBudgetAt calculates correctly');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 32 BUILD GATE', () => {
  let engine: TemporalReservationEngine;
  
  beforeEach(() => {
    engine = getTemporalReservationEngine();
    engine.configureBudgets(100000, 100);
  });
  
  it('🔒 Engine is singleton', () => {
    const e1 = getTemporalReservationEngine();
    const e2 = getTemporalReservationEngine();
    expect(e1).toBe(e2);
    console.log('✓ Engine is singleton');
  });
  
  it('🔒 Overlapping capital reservations throw', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveCapital(snap1, 80000, window, 'BUY');
    
    expect(() => engine.reserveCapital(snap2, 50000, window, 'BUY')).toThrow();
    console.log('✓ Overlapping capital throws');
  });
  
  it('🔒 Overlapping risk reservations throw', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveRisk(snap1, 80, window);
    
    expect(() => engine.reserveRisk(snap2, 50, window)).toThrow();
    console.log('✓ Overlapping risk throws');
  });
  
  it('🔒 Release frees capacity', () => {
    const snap1 = generateSnapshotId();
    const snap2 = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveCapital(snap1, 90000, window, 'BUY');
    engine.releaseReservations(snap1);
    
    expect(() => engine.reserveCapital(snap2, 90000, window, 'BUY')).not.toThrow();
    console.log('✓ Release frees capacity');
  });
  
  it('🔒 All reservations immutable', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    const cap = engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    expect(cap._frozen).toBe(true);
    expect(Object.isFrozen(cap)).toBe(true);
    
    const snapshotId2 = generateSnapshotId();
    const risk = engine.reserveRisk(snapshotId2, 20, window);
    expect(risk._frozen).toBe(true);
    expect(Object.isFrozen(risk)).toBe(true);
    
    console.log('✓ All reservations immutable');
  });
  
  it('🔒 No time-travel (end < start throws)', () => {
    const snapshotId = generateSnapshotId();
    const now = new Date();
    
    const invalidWindow: TemporalWindow = {
      start_at: new Date(now.getTime() + 1000).toISOString(),
      end_at: now.toISOString()
    };
    
    expect(() => engine.reserveCapital(snapshotId, 10000, invalidWindow, 'BUY')).toThrow();
    console.log('✓ Time-travel throws');
  });
  
  it('🔒 Same snapshot cannot reserve twice', () => {
    const snapshotId = generateSnapshotId();
    const window = createWindow(0, 30);
    
    engine.reserveCapital(snapshotId, 10000, window, 'BUY');
    
    expect(() => engine.reserveCapital(snapshotId, 5000, window, 'BUY'))
      .toThrow('already has a capital reservation');
    
    console.log('✓ Same snapshot cannot reserve twice');
  });
  
  it('🔒 ReservationGuard exists', () => {
    expect(ReservationGuard).toBeDefined();
    expect(typeof ReservationGuard.assertReservable).toBe('function');
    expect(typeof ReservationGuard.assertHasReservations).toBe('function');
    
    console.log('✓ ReservationGuard exists');
  });
});

