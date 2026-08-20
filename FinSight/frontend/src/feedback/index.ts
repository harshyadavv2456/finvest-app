/**
 * Feedback Module Index
 * 
 * PHASE 27: Market-Reality Feedback Loop (MRFL)
 * 
 * Exports:
 * - DecisionAgingEngine: Tracks how decisions age
 * - ThesisValidator: Evaluates why decisions aged as they did
 * - ConfidenceHonestyIndex: Measures confidence calibration honesty
 */

// DecisionAgingEngine
export {
  DecisionAgingEngine,
  getDecisionAgingEngine,
  type DecisionAging,
  type ThesisStatus,
  type AgingTimeSeriesPoint,
  type AgingConfig
} from './DecisionAgingEngine';

// ThesisValidator
export {
  ThesisValidator,
  getThesisValidator,
  type ThesisAssessment,
  type FailureMode,
  type ExternalEventImpact
} from './ThesisValidator';

// ConfidenceHonestyIndex
export {
  ConfidenceHonestyIndexEngine,
  getConfidenceHonestyIndex,
  type HonestyIndex,
  type HonestyMetrics,
  type ConfidenceOutcome,
  type HonestyBucket
} from './ConfidenceHonestyIndex';

