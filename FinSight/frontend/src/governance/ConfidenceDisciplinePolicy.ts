/**
 * ConfidenceDisciplinePolicy - Hard Thresholds for Confidence Governance
 * 
 * PHASE 28: Confidence Governance
 * 
 * PURPOSE:
 * Encode hard thresholds for confidence discipline.
 * NO runtime mutation allowed.
 * 
 * THIS IS:
 * - Deterministic
 * - Immutable
 * - Explainable
 * 
 * THIS IS NOT:
 * - Tunable at runtime
 * - ML-based
 * - Adjustable based on "wins"
 */

// =============================================================================
// POLICY (IMMUTABLE)
// =============================================================================

/**
 * ConfidenceDisciplinePolicy - Hard-coded thresholds
 * CANNOT be mutated at runtime
 */
export const CONFIDENCE_DISCIPLINE_POLICY = Object.freeze({
  /**
   * Maximum overconfidence penalty before entering RESTRAINED state
   * If penalty > this, confidence gets capped
   */
  overconfidence_penalty_limit: 20,
  
  /**
   * Maximum consecutive overconfident decisions before MUTED state
   */
  consecutive_overconfidence_limit: 3,
  
  /**
   * How long (days) the MUTED state lasts
   */
  mute_duration_days: 30,
  
  /**
   * How much confidence cap recovers per 30 days of good behavior
   * Note: This is RECOVERY only, not inflation
   */
  recovery_rate_per_30_days: 5,
  
  /**
   * Absolute maximum confidence allowed (even if everything is perfect)
   * Prevents arrogance
   */
  absolute_confidence_ceiling: 85,
  
  /**
   * Minimum confidence that MUTED state allows
   */
  muted_confidence_ceiling: 40,
  
  /**
   * Minimum confidence that RESTRAINED state allows
   */
  restrained_confidence_ceiling: 60,
  
  /**
   * Days of honest behavior required before recovery begins
   */
  recovery_waiting_period_days: 14,
  
  /**
   * Minimum calibration score required for recovery
   */
  recovery_calibration_threshold: 60,
  
  /**
   * Minimum decisions required to calculate overconfidence
   */
  min_decisions_for_discipline: 5
});

/**
 * Type for the policy
 */
export type ConfidenceDisciplinePolicy = typeof CONFIDENCE_DISCIPLINE_POLICY;

// =============================================================================
// DISCIPLINE STATES
// =============================================================================

/**
 * DisciplineState - Current confidence expression state
 */
export type DisciplineState = 'NORMAL' | 'RESTRAINED' | 'MUTED';

/**
 * State descriptions
 */
export const DISCIPLINE_STATE_DESCRIPTIONS: Record<DisciplineState, string> = Object.freeze({
  NORMAL: 'Confidence may be expressed as calculated.',
  RESTRAINED: 'Confidence is capped due to recent overconfidence.',
  MUTED: 'Confidence is severely limited due to repeated overconfidence.'
});

// =============================================================================
// TRANSITIONS
// =============================================================================

/**
 * Transition rules between states
 * These are deterministic, not learned
 */
export const STATE_TRANSITIONS = Object.freeze({
  /**
   * NORMAL → RESTRAINED when:
   * - overconfidence_penalty > limit
   * - OR calibration_score < 50
   */
  to_restrained: {
    from: 'NORMAL' as DisciplineState,
    to: 'RESTRAINED' as DisciplineState,
    condition: 'overconfidence_penalty > 20 OR calibration_score < 50'
  },
  
  /**
   * RESTRAINED → MUTED when:
   * - consecutive_overconfidence >= limit
   * - OR overconfidence_penalty > 2x limit
   */
  to_muted: {
    from: 'RESTRAINED' as DisciplineState,
    to: 'MUTED' as DisciplineState,
    condition: 'consecutive_overconfidence >= 3 OR overconfidence_penalty > 40'
  },
  
  /**
   * MUTED → RESTRAINED when:
   * - mute_duration_days passed
   * - AND calibration_score >= recovery_threshold
   * - Wins alone do NOT trigger this
   */
  muted_to_restrained: {
    from: 'MUTED' as DisciplineState,
    to: 'RESTRAINED' as DisciplineState,
    condition: 'days_since_mute >= 30 AND calibration_score >= 60'
  },
  
  /**
   * RESTRAINED → NORMAL when:
   * - recovery_waiting_period passed
   * - AND overconfidence_penalty <= 0
   * - AND calibration_score >= recovery_threshold
   */
  restrained_to_normal: {
    from: 'RESTRAINED' as DisciplineState,
    to: 'NORMAL' as DisciplineState,
    condition: 'days_since_restrained >= 14 AND overconfidence_penalty <= 0 AND calibration_score >= 60'
  }
});

// =============================================================================
// ADJUSTMENT REASONS
// =============================================================================

/**
 * Standard adjustment reasons
 * These are the ONLY valid reasons for confidence adjustment
 */
export const ADJUSTMENT_REASONS = Object.freeze({
  NO_ADJUSTMENT: 'No adjustment required',
  OVERCONFIDENCE_PENALTY: 'Capped due to overconfidence penalty',
  CONSECUTIVE_OVERCONFIDENCE: 'Muted due to repeated overconfidence',
  CALIBRATION_POOR: 'Restrained due to poor calibration',
  MUTED_STATE: 'Muted state active',
  RESTRAINED_STATE: 'Restrained state active',
  ABSOLUTE_CEILING: 'Capped at absolute ceiling (85)',
  TIME_DECAY: 'Adjusted due to time-based recovery',
  INSUFFICIENT_DATA: 'Insufficient data for full confidence'
});

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that policy is correctly frozen
 * Called at module load
 */
function validatePolicy(): void {
  // Ensure policy is frozen
  if (!Object.isFrozen(CONFIDENCE_DISCIPLINE_POLICY)) {
    throw new Error('POLICY_VIOLATION: ConfidenceDisciplinePolicy must be frozen');
  }
  
  // Validate bounds
  const p = CONFIDENCE_DISCIPLINE_POLICY;
  
  if (p.muted_confidence_ceiling >= p.restrained_confidence_ceiling) {
    throw new Error('POLICY_VIOLATION: muted_ceiling must be < restrained_ceiling');
  }
  
  if (p.restrained_confidence_ceiling >= p.absolute_confidence_ceiling) {
    throw new Error('POLICY_VIOLATION: restrained_ceiling must be < absolute_ceiling');
  }
  
  if (p.overconfidence_penalty_limit <= 0) {
    throw new Error('POLICY_VIOLATION: overconfidence_penalty_limit must be > 0');
  }
}

// Validate on load
validatePolicy();

// =============================================================================
// EXPORTS
// =============================================================================

export default CONFIDENCE_DISCIPLINE_POLICY;

