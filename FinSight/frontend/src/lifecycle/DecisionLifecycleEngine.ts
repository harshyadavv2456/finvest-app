/**
 * DecisionLifecycleEngine - Single Authority for Decision Lifecycle
 * 
 * PHASE 31: Decision Lifecycle State Machine (DLSM)
 * 
 * PURPOSE:
 * Make decisions mortal. No decision can render, speak, execute, simulate,
 * or influence logic unless its lifecycle state explicitly allows it.
 * 
 * RULES:
 * - Lifecycle is append-only
 * - All entries are immutable (Object.freeze)
 * - Illegal transitions THROW (no warnings)
 * - No decision without lifecycle
 * - No backward transitions
 * 
 * DESIGN LAW:
 * - A suppressed decision that speaks is a bug
 * - A historical decision that advises is malpractice
 * - A decision without a lifecycle is a lie
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * DecisionLifecycleState - All possible states a decision can be in
 */
export type DecisionLifecycleState =
  | 'CREATED'           // Snapshot created
  | 'ELIGIBLE'          // Passed validation
  | 'CONFLICTED'        // Entered MDCR
  | 'ACTIVE'            // Survived conflicts
  | 'SUPPRESSED'        // Killed by conflict resolution
  | 'EXECUTED_SHADOW'   // Used in sandbox execution
  | 'EXPIRED'           // Time horizon elapsed
  | 'INVALIDATED'       // Thesis / policy / market invalidation
  | 'HISTORICAL_ONLY';  // Terminal, inert, read-only

/**
 * CausedBy - What triggered the transition
 */
export type LifecycleCause = 
  | 'SYSTEM' 
  | 'MDCR' 
  | 'TIME' 
  | 'POLICY' 
  | 'MARKET_EVENT'
  | 'USER';

/**
 * DecisionLifecycle - Immutable lifecycle record
 */
export interface DecisionLifecycle {
  readonly lifecycle_id: string;
  readonly snapshot_id: string;
  readonly state: DecisionLifecycleState;
  readonly entered_at: string;
  readonly previous_state?: DecisionLifecycleState;
  readonly reason: string;
  readonly caused_by: LifecycleCause;
  readonly audit_trail_id: string;
  readonly _frozen: true;
}

/**
 * LifecycleTransition - A single transition event
 */
export interface LifecycleTransition {
  readonly transition_id: string;
  readonly snapshot_id: string;
  readonly from_state: DecisionLifecycleState;
  readonly to_state: DecisionLifecycleState;
  readonly reason: string;
  readonly caused_by: LifecycleCause;
  readonly timestamp: string;
  readonly audit_trail_id: string;
  readonly _frozen: true;
}

// =============================================================================
// ALLOWED TRANSITIONS (STRICT - IMMUTABLE)
// =============================================================================

/**
 * ALLOWED_TRANSITIONS - The only valid state transitions
 * Any other transition MUST throw
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<DecisionLifecycleState, readonly DecisionLifecycleState[]> = 
  Object.freeze(new Map<DecisionLifecycleState, readonly DecisionLifecycleState[]>([
    ['CREATED' as DecisionLifecycleState, ['ELIGIBLE'] as const],
    ['ELIGIBLE' as DecisionLifecycleState, ['CONFLICTED'] as const],
    ['CONFLICTED' as DecisionLifecycleState, ['ACTIVE', 'SUPPRESSED'] as const],
    ['ACTIVE' as DecisionLifecycleState, ['EXECUTED_SHADOW', 'EXPIRED', 'INVALIDATED'] as const],
    ['SUPPRESSED' as DecisionLifecycleState, ['HISTORICAL_ONLY'] as const],
    ['EXPIRED' as DecisionLifecycleState, ['HISTORICAL_ONLY'] as const],
    ['INVALIDATED' as DecisionLifecycleState, ['HISTORICAL_ONLY'] as const],
    ['EXECUTED_SHADOW' as DecisionLifecycleState, ['EXPIRED', 'INVALIDATED', 'HISTORICAL_ONLY'] as const],
    ['HISTORICAL_ONLY' as DecisionLifecycleState, [] as const] // TERMINAL - no transitions allowed
  ]));

/**
 * TERMINAL_STATES - States that cannot transition to anything
 */
const TERMINAL_STATES: ReadonlySet<DecisionLifecycleState> = Object.freeze(
  new Set<DecisionLifecycleState>(['HISTORICAL_ONLY'])
);

/**
 * DEAD_STATES - States that cannot be reactivated
 */
const DEAD_STATES: ReadonlySet<DecisionLifecycleState> = Object.freeze(
  new Set<DecisionLifecycleState>(['SUPPRESSED', 'EXPIRED', 'INVALIDATED', 'HISTORICAL_ONLY'])
);

/**
 * RENDERABLE_STATES - States where advice can be shown
 */
const RENDERABLE_STATES: ReadonlySet<DecisionLifecycleState> = Object.freeze(
  new Set<DecisionLifecycleState>(['ACTIVE'])
);

/**
 * SPEAKABLE_STATES - States where FinBot can speak about actively
 */
const SPEAKABLE_STATES: ReadonlySet<DecisionLifecycleState> = Object.freeze(
  new Set<DecisionLifecycleState>(['ACTIVE'])
);

/**
 * EXECUTABLE_STATES - States where sandbox execution is allowed
 * Note: Real execution is ALWAYS blocked
 */
const EXECUTABLE_STATES: ReadonlySet<DecisionLifecycleState> = Object.freeze(
  new Set<DecisionLifecycleState>(['ACTIVE'])
);

// =============================================================================
// DECISION LIFECYCLE ENGINE
// =============================================================================

export class DecisionLifecycleEngine {
  private static instance: DecisionLifecycleEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Current lifecycle state per snapshot
  private lifecycles: Map<string, DecisionLifecycle> = new Map();
  
  // Full history (append-only)
  private transitionHistory: LifecycleTransition[] = [];
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): DecisionLifecycleEngine {
    if (!DecisionLifecycleEngine.instance) {
      DecisionLifecycleEngine.instance = new DecisionLifecycleEngine();
    }
    return DecisionLifecycleEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_lifecycles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.lifecycles) {
          for (const [key, value] of Object.entries(parsed.lifecycles)) {
            this.lifecycles.set(key, Object.freeze(value as DecisionLifecycle));
          }
        }
        if (parsed.history) {
          this.transitionHistory = parsed.history.map((t: LifecycleTransition) => Object.freeze(t));
        }
      }
    } catch (e) {
      console.error('Failed to load lifecycles:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        lifecycles: Object.fromEntries(this.lifecycles),
        history: this.transitionHistory
      };
      localStorage.setItem('finvest_lifecycles', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save lifecycles:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Create a new lifecycle for a snapshot
   * Initial state is CREATED
   */
  public createLifecycle(snapshotId: string, reason: string = 'Snapshot created'): DecisionLifecycle {
    // Check if lifecycle already exists
    if (this.lifecycles.has(snapshotId)) {
      throw new Error(
        `LIFECYCLE_ERROR: Lifecycle already exists for snapshot ${snapshotId}. ` +
        `Cannot create duplicate lifecycle.`
      );
    }
    
    const auditId = this.generateAuditId();
    
    const lifecycle: DecisionLifecycle = Object.freeze({
      lifecycle_id: `LC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: snapshotId,
      state: 'CREATED',
      entered_at: new Date().toISOString(),
      previous_state: undefined,
      reason,
      caused_by: 'SYSTEM' as const,
      audit_trail_id: auditId,
      _frozen: true
    });
    
    this.lifecycles.set(snapshotId, lifecycle);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Lifecycle created: ${snapshotId}`,
      details: {
        lifecycle_id: lifecycle.lifecycle_id,
        snapshot_id: snapshotId,
        state: 'CREATED',
        reason
      },
      actor: 'ENGINE'
    });
    
    return lifecycle;
  }
  
  /**
   * Transition a lifecycle from one state to another
   * THROWS if transition is illegal
   */
  public transition(
    snapshotId: string,
    from: DecisionLifecycleState,
    to: DecisionLifecycleState,
    reason: string,
    causedBy: LifecycleCause
  ): DecisionLifecycle {
    // 1. Lifecycle must exist
    const current = this.lifecycles.get(snapshotId);
    if (!current) {
      throw new Error(
        `LIFECYCLE_ERROR: No lifecycle exists for snapshot ${snapshotId}. ` +
        `Cannot transition non-existent lifecycle.`
      );
    }
    
    // 2. Current state must match 'from'
    if (current.state !== from) {
      throw new Error(
        `LIFECYCLE_TRANSITION_ERROR: Snapshot ${snapshotId} is in state ${current.state}, ` +
        `not ${from}. Cannot transition from mismatched state.`
      );
    }
    
    // 3. Check if transition is allowed
    this.assertTransitionAllowed(from, to, snapshotId);
    
    // 4. Record transition
    const auditId = this.generateAuditId();
    const timestamp = new Date().toISOString();
    
    const transition: LifecycleTransition = Object.freeze({
      transition_id: `TR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: snapshotId,
      from_state: from,
      to_state: to,
      reason,
      caused_by: causedBy,
      timestamp,
      audit_trail_id: auditId,
      _frozen: true
    });
    
    this.transitionHistory.push(transition);
    
    // 5. Update current lifecycle
    const newLifecycle: DecisionLifecycle = Object.freeze({
      lifecycle_id: current.lifecycle_id,
      snapshot_id: snapshotId,
      state: to,
      entered_at: timestamp,
      previous_state: from,
      reason,
      caused_by: causedBy,
      audit_trail_id: auditId,
      _frozen: true
    });
    
    this.lifecycles.set(snapshotId, newLifecycle);
    this.saveToStorage();
    
    // 6. Audit log (MANDATORY)
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: to === 'SUPPRESSED' || to === 'INVALIDATED' ? 'WARNING' : 'INFO',
      summary: `Lifecycle transition: ${from} → ${to}`,
      details: {
        event_type: 'LIFECYCLE_TRANSITION',
        snapshot_id: snapshotId,
        from_state: from,
        to_state: to,
        reason,
        caused_by: causedBy,
        timestamp
      },
      actor: 'ENGINE'
    });
    
    return newLifecycle;
  }
  
  /**
   * Get current lifecycle state for a snapshot
   * THROWS if no lifecycle exists
   */
  public getCurrentState(snapshotId: string): DecisionLifecycle {
    const lifecycle = this.lifecycles.get(snapshotId);
    if (!lifecycle) {
      throw new Error(
        `LIFECYCLE_ERROR: No lifecycle exists for snapshot ${snapshotId}. ` +
        `Every decision MUST have a lifecycle.`
      );
    }
    return lifecycle;
  }
  
  /**
   * Check if lifecycle exists for a snapshot
   */
  public hasLifecycle(snapshotId: string): boolean {
    return this.lifecycles.has(snapshotId);
  }
  
  // ===========================================================================
  // ASSERTIONS (THROW ON FAILURE)
  // ===========================================================================
  
  /**
   * Assert that a decision is renderable (can show advice)
   * THROWS unless state is ACTIVE
   */
  public assertRenderable(snapshotId: string): void {
    const lifecycle = this.getCurrentState(snapshotId);
    
    if (!RENDERABLE_STATES.has(lifecycle.state)) {
      throw new Error(
        `RENDER_BLOCKED: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `Only ACTIVE decisions can render. ` +
        `Reason for current state: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is speakable (FinBot can actively advise)
   * THROWS unless state is ACTIVE
   */
  public assertSpeakable(snapshotId: string): void {
    const lifecycle = this.getCurrentState(snapshotId);
    
    if (!SPEAKABLE_STATES.has(lifecycle.state)) {
      throw new Error(
        `SPEAK_BLOCKED: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `FinBot cannot speak about non-ACTIVE decisions. ` +
        `Reason for current state: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is executable (sandbox execution)
   * ALWAYS THROWS for real execution
   * For sandbox: THROWS unless ACTIVE
   */
  public assertExecutable(snapshotId: string): void {
    // Real execution is ALWAYS blocked
    // This is a secondary check - ExecutionEngine already blocks
    throw new Error(
      `EXECUTION_BLOCKED: Real execution is permanently disabled. ` +
      `Decision ${snapshotId} cannot be executed. ` +
      `Use sandbox execution for simulation only.`
    );
  }
  
  /**
   * Assert that a decision can be shadow-executed
   * THROWS unless state is ACTIVE
   */
  public assertShadowExecutable(snapshotId: string): void {
    const lifecycle = this.getCurrentState(snapshotId);
    
    if (!EXECUTABLE_STATES.has(lifecycle.state)) {
      throw new Error(
        `SHADOW_EXECUTION_BLOCKED: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `Only ACTIVE decisions can be shadow-executed. ` +
        `Reason for current state: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is NOT suppressed
   * THROWS if state is SUPPRESSED
   */
  public assertNotSuppressed(snapshotId: string): void {
    const lifecycle = this.getCurrentState(snapshotId);
    
    if (lifecycle.state === 'SUPPRESSED') {
      throw new Error(
        `SUPPRESSED_ACCESS_BLOCKED: Decision ${snapshotId} was SUPPRESSED. ` +
        `Suppressed decisions cannot influence logic. ` +
        `Reason: ${lifecycle.reason}`
      );
    }
  }
  
  /**
   * Assert that a decision is historical only
   * THROWS if NOT in HISTORICAL_ONLY state
   */
  public assertHistoricalOnly(snapshotId: string): void {
    const lifecycle = this.getCurrentState(snapshotId);
    
    if (lifecycle.state !== 'HISTORICAL_ONLY') {
      throw new Error(
        `NOT_HISTORICAL: Decision ${snapshotId} is in state ${lifecycle.state}. ` +
        `Expected HISTORICAL_ONLY.`
      );
    }
  }
  
  // ===========================================================================
  // TRANSITION VALIDATION
  // ===========================================================================
  
  /**
   * Assert that a transition is allowed
   * THROWS if transition is illegal
   */
  private assertTransitionAllowed(
    from: DecisionLifecycleState,
    to: DecisionLifecycleState,
    snapshotId: string
  ): void {
    // Check terminal states
    if (TERMINAL_STATES.has(from)) {
      throw new Error(
        `ILLEGAL_TRANSITION: ${from} is a terminal state. ` +
        `No transitions are allowed from terminal states. ` +
        `Decision ${snapshotId} cannot leave ${from}.`
      );
    }
    
    // Check dead state reactivation
    if (DEAD_STATES.has(from) && to === 'ACTIVE') {
      throw new Error(
        `ILLEGAL_REACTIVATION: Cannot transition ${from} → ACTIVE. ` +
        `Dead decisions cannot be reactivated. ` +
        `Decision ${snapshotId} is permanently ${from}.`
      );
    }
    
    // Check allowed transitions
    const allowed = ALLOWED_TRANSITIONS.get(from);
    if (!allowed || !allowed.includes(to)) {
      throw new Error(
        `ILLEGAL_TRANSITION: ${from} → ${to} is not allowed. ` +
        `Valid transitions from ${from}: [${allowed?.join(', ') || 'NONE'}]. ` +
        `Decision ${snapshotId} cannot make this transition.`
      );
    }
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get all lifecycles in a specific state
   */
  public getByState(state: DecisionLifecycleState): DecisionLifecycle[] {
    const result: DecisionLifecycle[] = [];
    for (const lifecycle of this.lifecycles.values()) {
      if (lifecycle.state === state) {
        result.push(lifecycle);
      }
    }
    return result;
  }
  
  /**
   * Get active decisions
   */
  public getActiveDecisions(): DecisionLifecycle[] {
    return this.getByState('ACTIVE');
  }
  
  /**
   * Get suppressed decisions
   */
  public getSuppressedDecisions(): DecisionLifecycle[] {
    return this.getByState('SUPPRESSED');
  }
  
  /**
   * Get transition history for a snapshot
   */
  public getTransitionHistory(snapshotId: string): LifecycleTransition[] {
    return this.transitionHistory.filter(t => t.snapshot_id === snapshotId);
  }
  
  /**
   * Get all transition history
   */
  public getAllTransitionHistory(): LifecycleTransition[] {
    return [...this.transitionHistory];
  }
  
  /**
   * Check if a decision is in a dead state
   */
  public isDead(snapshotId: string): boolean {
    const lifecycle = this.lifecycles.get(snapshotId);
    if (!lifecycle) return false;
    return DEAD_STATES.has(lifecycle.state);
  }
  
  /**
   * Check if a decision is active
   */
  public isActive(snapshotId: string): boolean {
    const lifecycle = this.lifecycles.get(snapshotId);
    if (!lifecycle) return false;
    return lifecycle.state === 'ACTIVE';
  }
  
  /**
   * Get statistics
   */
  public getStats(): {
    total_lifecycles: number;
    by_state: Record<DecisionLifecycleState, number>;
    total_transitions: number;
    dead_count: number;
    active_count: number;
  } {
    const byState: Record<string, number> = {};
    
    for (const lifecycle of this.lifecycles.values()) {
      byState[lifecycle.state] = (byState[lifecycle.state] || 0) + 1;
    }
    
    let deadCount = 0;
    let activeCount = 0;
    
    for (const lifecycle of this.lifecycles.values()) {
      if (DEAD_STATES.has(lifecycle.state)) deadCount++;
      if (lifecycle.state === 'ACTIVE') activeCount++;
    }
    
    return {
      total_lifecycles: this.lifecycles.size,
      by_state: byState as Record<DecisionLifecycleState, number>,
      total_transitions: this.transitionHistory.length,
      dead_count: deadCount,
      active_count: activeCount
    };
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private generateAuditId(): string {
    return `LC-AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getDecisionLifecycleEngine = () => DecisionLifecycleEngine.getInstance();
export default DecisionLifecycleEngine;

