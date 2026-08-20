/**
 * Reservations Module Index
 * 
 * PHASE 32: Temporal Capital & Risk Reservation (TCRR)
 * 
 * EXPORTS ONLY:
 * - TemporalReservationEngine
 * - ReservationGuard
 */

export {
  TemporalReservationEngine,
  getTemporalReservationEngine,
  type TemporalWindow,
  type CapitalReservation,
  type RiskReservation,
  type ReservationConflict,
  type ReservationBudget,
  type ReservationReason
} from './TemporalReservationEngine';

export {
  ReservationGuard,
  reservationGuard,
  type ReservationCheckResult
} from './ReservationGuard';

