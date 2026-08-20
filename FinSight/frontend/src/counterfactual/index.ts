/**
 * Counterfactual Module Index
 * 
 * PHASE 33: Counterfactual Suppression Ledger (CSL)
 * 
 * EXPORTS ONLY:
 * - CounterfactualLedger
 * - CounterfactualEngine
 */

export {
  CounterfactualLedger,
  getCounterfactualLedger,
  type SuppressedDecisionRecord,
  type CounterfactualOutcome,
  type SuppressionReason,
  type DominanceResult,
  type LedgerSummary
} from './CounterfactualLedger';

export {
  CounterfactualEngine,
  getCounterfactualEngine,
  type MarketDataPoint,
  type CounterfactualInput,
  type ComputationResult
} from './CounterfactualEngine';

