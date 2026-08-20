/**
 * Adoption Module Index
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * Exports:
 * - DecisionAdoption: Adoption tracking
 * - ConvictionGap: Gap analyzer
 * - FrictionMap: Friction heatmap
 * - AdoptionScore: Score calculator
 */

// DecisionAdoption
export {
  DecisionAdoptionTracker,
  getDecisionAdoption,
  type AdoptionRecord,
  type AdoptionStats,
  type RejectionReason,
  type UserAction,
  type PendingDecision
} from './DecisionAdoption';

// ConvictionGap
export {
  ConvictionGapAnalyzer,
  getConvictionGap,
  type ConvictionAnalysis,
  type ConvictionGapReport,
  type ConvictionBucketStats,
  type ConvictionInsight
} from './ConvictionGap';

// FrictionMap
export {
  FrictionMapEngine,
  getFrictionMap,
  type FrictionPoint,
  type FailedExplanation,
  type FrictionHeatmap,
  type FrictionInsight
} from './FrictionMap';

// AdoptionScore
export {
  AdoptionScoreCalculator,
  getAdoptionScore,
  type AdoptionScore,
  type AdoptionTrustComparison,
  type AdoptionTrend
} from './AdoptionScore';

