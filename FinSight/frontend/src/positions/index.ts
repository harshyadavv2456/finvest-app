/**
 * Positions Module Index
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * This module provides:
 * - Position entity and lifecycle
 * - Daily assessments and timeline
 * - Reconciliation engine
 * - Execution orchestrator
 * - FinBot daily narrative
 */

export { PositionFactory } from './Position';
export type {
  Position,
  PositionLifecycleState,
  PositionDecision,
  TaxLotInfo,
  PositionRiskAllocation,
  CreatePositionInput,
  UpdatePositionInput
} from './Position';

export { PositionTimeline, getPositionTimeline, createAssessmentId } from './PositionTimeline';
export type {
  PositionDailyAssessment,
  DayMarketContext,
  DaySignalEvaluation,
  DayTaxEvaluation,
  DayRiskEvaluation,
  PositionStateSnapshot,
  DecisionExpectedImpact
} from './PositionTimeline';

export { PositionReconciliationEngine, getPositionReconciliationEngine } from './PositionReconciliationEngine';
export type {
  SignalData,
  MarketContextInput,
  ReconciliationInput,
  PositionReconciliationResult,
  DailyReconciliationResult
} from './PositionReconciliationEngine';

export { ExecutionOrchestrator, getExecutionOrchestrator } from './ExecutionOrchestrator';
export type {
  ExecutionMode,
  OrderType,
  OrderSide,
  DematAccount,
  ExecutionOrder,
  ExecutionResult,
  DailyExecutionSummary
} from './ExecutionOrchestrator';

export { FinBotDailyNarrative, createFinBotDailyNarrative } from './FinBotDailyNarrative';
export type {
  PositionNarrativeSummary,
  YesterdayOutcome,
  SystemStatusSummary,
  DailyNarrative
} from './FinBotDailyNarrative';

