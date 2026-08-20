/**
 * Audit Module Index
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * EXPORTS:
 * - DecisionAuditLog - Core audit logging
 * - DecisionForensicsPack - Immutable forensic artifacts
 * - DecisionReconstructionEngine - Deterministic reconstruction
 * - AuditMode - Kill switch for audit mode
 */

// Core audit logging
export {
  DecisionAuditLog,
  auditLog,
  type AuditEventType,
  type AuditSeverity,
  type AuditLogEntry,
  type AuditQueryOptions,
  type AuditStats
} from './DecisionAuditLog';

// Forensics Pack
export {
  ForensicsPackBuilder,
  validateForensicsPack,
  computeHash,
  computeHashSync,
  type DecisionForensicsPack,
  type LifecycleTransition,
  type SilenceEvent,
  type TrustDelta,
  type GovernanceHistoryEntry,
  type AuditEvent,
  type ReservationSnapshot,
  type AlternativeHistoryProof,
  type ResponsibilityAssignment,
  type ForensicsPackValidation
} from './DecisionForensicsPack';

// Reconstruction Engine
export {
  DecisionReconstructionEngine,
  getDecisionReconstructionEngine,
  type ReconstructionResult,
  type DataSourceStatus
} from './DecisionReconstructionEngine';

// Audit Mode
export {
  AuditMode,
  assertAuditModeReadOnly,
  isAuditModeEnabled,
  getAuditModeState,
  type AuditModeState,
  type AuditModeViolation,
  type BlockedAction,
  type AllowedAction
} from './AuditMode';
