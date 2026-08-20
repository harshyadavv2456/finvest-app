/**
 * Lifecycle Module Index
 * 
 * PHASE 31: Decision Lifecycle State Machine (DLSM)
 * 
 * EXPORTS ONLY:
 * - DecisionLifecycleEngine
 * - LifecycleGuard
 * - DecisionLifecycleState
 */

export {
  DecisionLifecycleEngine,
  getDecisionLifecycleEngine,
  type DecisionLifecycleState,
  type DecisionLifecycle,
  type LifecycleTransition,
  type LifecycleCause
} from './DecisionLifecycleEngine';

export {
  LifecycleGuard,
  lifecycleGuard
} from './LifecycleGuard';

