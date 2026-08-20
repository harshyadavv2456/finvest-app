/**
 * Override Module Index
 * 
 * PHASE 35: Human Override Protocol (HOP)
 * 
 * EXPORTS:
 * - HumanOverrideProtocol
 * - OverrideGuard
 */

export {
  HumanOverrideProtocol,
  getHumanOverrideProtocol,
  type HumanOverrideRecord,
  type OverrideRequest,
  type OverrideResult,
  type HumanAction,
  type OverrideOutcome,
  type AcknowledgedRisk
} from './HumanOverrideProtocol';

export {
  OverrideGuard,
  overrideGuard,
  type OverrideEligibility,
  type SystemAssistanceBlock
} from './OverrideGuard';

