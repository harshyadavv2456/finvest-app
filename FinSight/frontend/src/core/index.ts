/**
 * Core Module
 * 
 * Central data management for FinVest.
 * 
 * - DataCore: Market intelligence data (FinSight, FinDash integration)
 * - PortfolioCore: Portfolio data orchestrator (demat integration only)
 */

export { DataCoreProvider, useDataCore } from './DataCore';
export { 
  PortfolioCoreProvider, 
  usePortfolioCore,
  type PortfolioStatus,
  type PortfolioState,
} from './PortfolioCore';
