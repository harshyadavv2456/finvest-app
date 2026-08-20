/**
 * Limits Module Index
 * 
 * PHASE 38: Self-Limiting Growth & Power Containment (SLG)
 * 
 * EXPORTS:
 * - InfluenceBudgetEngine - Caps advice output
 * - CentralityRiskEngine - Detects power concentration
 * - SelfLimitGuard - Enforcement layer
 */

export {
  InfluenceBudgetEngine,
  getInfluenceBudgetEngine,
  type InfluenceBudget,
  type BudgetAllocation,
  type BudgetExhaustionEvent,
  type SelfLimitEvent
} from './InfluenceBudgetEngine';

export {
  CentralityRiskEngine,
  getCentralityRiskEngine,
  type CentralityRisk,
  type CentralitySignal,
  type CentralityAssessment,
  type CentralityHistoryEntry
} from './CentralityRiskEngine';

export {
  SelfLimitGuard,
  type SelfLimitCheck,
  type SelfLimitStatus
} from './SelfLimitGuard';
