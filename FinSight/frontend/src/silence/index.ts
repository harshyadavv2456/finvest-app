/**
 * Silence Module Index
 * 
 * PHASE 29: Selective Silence & Question-First Mode (QFM)
 * 
 * Exports:
 * - QuestionFirstGovernor: Determines when advice is allowed
 * - NeutralQuestionGenerator: Generates non-manipulative questions
 * - FinBotQuestionMode: Overrides FinBot when gate triggers
 * - QuestionOutcomeTracker: Tracks question effectiveness
 */

// QuestionFirstGovernor
export {
  QuestionFirstGovernor,
  getQuestionFirstGovernor,
  QUESTION_GATE_THRESHOLDS,
  type QuestionGate,
  type QuestionGateMode,
  type BlockingFactor,
  type GateContext
} from './QuestionFirstGovernor';

// NeutralQuestionGenerator
export {
  NeutralQuestionGenerator,
  getNeutralQuestionGenerator,
  type NeutralQuestion
} from './NeutralQuestionGenerator';

// FinBotQuestionMode
export {
  FinBotQuestionMode,
  getFinBotQuestionMode,
  type QuestionModeResponse,
  type SilenceResponse
} from './FinBotQuestionMode';

// QuestionOutcomeTracker
export {
  QuestionOutcomeTracker,
  getQuestionOutcomeTracker,
  type QuestionOutcome,
  type QuestionEffectivenessStats
} from './QuestionOutcomeTracker';

