/**
 * Demat Integration Module
 * 
 * This module provides:
 * - Demat provider interfaces and types
 * - Provider implementations (CSV available, others coming soon)
 * - Provider manager for orchestrating connections
 * 
 * RULES:
 * - READ-ONLY: No execution capabilities
 * - NO MOCK DATA: Empty portfolio if no demat connected
 * - EXPLICIT STATES: Clear feedback on connection status
 */

// Types
export * from './types';

// Provider management
export { 
  BaseDematProvider,
  dematProviderManager,
  PROVIDER_REGISTRY,
  type ProviderInfo,
  type ProviderStatus,
} from './DematProvider';

// Provider implementations
export {
  csvProvider,
  CSVProvider,
  zerodhaProvider,
  ZerodhaProvider,
  growwProvider,
  GrowwProvider,
  upstoxProvider,
  UpstoxProvider,
  angelOneProvider,
  AngelOneProvider,
} from './providers';

