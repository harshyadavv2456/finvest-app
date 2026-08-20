/**
 * Observability Module Index
 * 
 * PHASE 43: Real Deployment & Paper Mode Go-Live
 * 
 * This module provides UX observability tracking.
 * 
 * RULES:
 * - NO behavior modification
 * - NO nudging
 * - NO ranking changes
 * - Observation ONLY
 */

export {
  UsageTracker,
  getUsageTracker,
  type UserAction,
  type UsageEvent,
  type HesitationMetric,
  type NarrativeConsumption,
  type DailyUsageSummary
} from './UsageTracker';

