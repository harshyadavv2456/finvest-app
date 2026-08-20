/**
 * Trust Module Index
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * Exports:
 * - TrustLedger: Immutable trust tracking
 * - ConfidenceCalibration: Calibration engine
 * - ExecutionPermission: Permission gates
 */

// TrustLedger
export { 
  TrustLedger, 
  getTrustLedger,
  type TrustEntry,
  type TrustEntryType,
  type TrustScore,
  type LedgerIntegrity
} from './TrustLedger';

// ConfidenceCalibration
export {
  ConfidenceCalibrationEngine,
  getConfidenceCalibration,
  type ConfidenceBucket,
  type BucketStats,
  type CalibrationReport,
  type CalibrationInsight
} from './ConfidenceCalibration';

// ExecutionPermission
export {
  ExecutionPermissionManager,
  getExecutionPermission,
  type PermissionLevel,
  type PermissionRequirements,
  type PermissionStatus,
  type PermissionProgress,
  type PermissionGate
} from './ExecutionPermission';

