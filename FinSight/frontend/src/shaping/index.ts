/**
 * Shaping Module Index
 * 
 * PHASE 25: Adaptive Decision Shaping (ADS)
 * 
 * Exports:
 * - DecisionShaper: Shapes presentation without changing content
 * - CognitiveLoad: Tracks and enforces cognitive limits
 * - AdoptionLift: Measures shaping effectiveness
 */

// DecisionShaper
export {
  DecisionShaper,
  getDecisionShaper,
  type ShapedDecision,
  type ShapedMetric,
  type ShapingContext,
  type ShapingConfig,
  type PresentationVariant,
  type EmphasisFlag,
  type MetricOrder
} from './DecisionShaper';

// CognitiveLoad
export {
  CognitiveLoadManager,
  getCognitiveLoad,
  type CognitiveLoadProfile,
  type OverloadEvent,
  type OverloadEventType,
  type SimplificationLevel
} from './CognitiveLoad';

// AdoptionLift
export {
  AdoptionLiftTracker,
  getAdoptionLift,
  type LiftMeasurement,
  type LiftReport,
  type VariantLift,
  type StrategyStatus
} from './AdoptionLift';

