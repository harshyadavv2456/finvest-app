/**
 * Shutdown Module Index
 * 
 * PHASE 39: Irreversibility & Shutdown Governance
 * PHASE 40: Institutional Freeze & External Verification
 * 
 * This module defines how the system dies safely.
 */

export {
  ShutdownGovernanceEngine,
  getShutdownState,
  isSystemAlive,
  canSystemAdvise,
  type ShutdownMode,
  type ShutdownTrigger,
  type ShutdownRecord,
  type ShutdownState
} from './ShutdownGovernanceEngine';

export {
  ShutdownGuard,
  type BlockableAction,
  type ShutdownGuardCheck
} from './ShutdownGuard';

export {
  JurisdictionAwareShutdown,
  getJurisdictionAwareShutdown,
  type ShutdownInvoker,
  type JurisdictionMetadata,
  type JurisdictionInvocation,
  type JurisdictionShutdownRecord
} from './JurisdictionAwareShutdown';

