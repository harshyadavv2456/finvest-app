/**
 * Engines Module
 * 
 * Real computation engines for FinVest.
 * All engines require valid data from connected demat providers.
 * 
 * RULES:
 * - NO mock data
 * - NO fallback computations
 * - Explicit unavailable state when no demat connected
 */

export { 
  TaxEngine, 
  taxEngine,
  TAX_CONFIG,
  TaxEngineError,
  type TaxComputationResult,
  type TaxLotAnalysis,
  type DematTaxSummary,
  type SellPlan,
  type SellStrategy,
  type GainType,
  type TaxJurisdiction,
} from './TaxEngine';

export {
  CapitalAllocator,
  capitalAllocator,
  type AllocationPlan,
  type AllocationRequest,
  type DematAllocation,
  type PortfolioAnalysis,
  type AllocationAction,
  type OptimizationGoal,
} from './CapitalAllocator';
