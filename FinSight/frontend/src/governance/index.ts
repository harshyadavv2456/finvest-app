/**
 * Governance Module Index
 * 
 * PHASE 28: Confidence Governance
 * 
 * Exports:
 * - ConfidenceDisciplinePolicy: Hard thresholds (immutable)
 * - ConfidenceGovernor: Caps and throttles confidence
 * - FinBotConfidenceFilter: Filters FinBot responses
 */

// ConfidenceDisciplinePolicy
export {
  CONFIDENCE_DISCIPLINE_POLICY,
  DISCIPLINE_STATE_DESCRIPTIONS,
  STATE_TRANSITIONS,
  ADJUSTMENT_REASONS,
  type ConfidenceDisciplinePolicy,
  type DisciplineState
} from './ConfidenceDisciplinePolicy';

// ConfidenceGovernor
export {
  ConfidenceGovernor,
  getConfidenceGovernor,
  type GovernedConfidence,
  type GovernorState,
  type GovernanceHistoryEntry
} from './ConfidenceGovernor';

// FinBotConfidenceFilter
export {
  FinBotConfidenceFilter,
  getFinBotConfidenceFilter,
  type FilteredResponse,
  type ConfidenceLanguage
} from './FinBotConfidenceFilter';

