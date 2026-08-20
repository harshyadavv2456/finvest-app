/**
 * Execution Module Index
 * 
 * Exports all execution-related components.
 * 
 * CRITICAL RULES:
 * - ExecutionEngine is LOCKED (no real trades)
 * - ExecutionSandbox simulates decisions
 * - ShadowExecution tracks hypothetical outcomes
 * - ExecutionPreAuthorization is for consent only, NOT execution
 */

// ExecutionEngine (LOCKED)
export {
  ExecutionEngine,
  executionEngine,
  type ExecutionResult,
  type OrderRequest
} from './ExecutionEngine';

// ExecutionSandbox (Simulation)
export {
  ExecutionSandbox,
  getExecutionSandbox,
  type IntentRecord
} from './ExecutionSandbox';

// ShadowExecution (Hypothetical)
export {
  getShadowExecutionEngine,
  type ShadowOrder,
  type ShadowPortfolio
} from './ShadowExecution';

// ExecutionPreAuthorization (Consent Only)
export {
  ExecutionPreAuthorization,
  getExecutionPreAuthorization,
  type PreAuthStatus,
  type PreAuthGrant,
  type PreAuthConditions,
  type PreAuthRequest,
  type DecisionPatternType
} from './ExecutionPreAuthorization';

