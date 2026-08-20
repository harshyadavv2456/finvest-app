/**
 * ConfidenceGovernor - Confidence Cap and Throttle Engine
 * 
 * PHASE 28: Confidence Governance
 * 
 * PURPOSE:
 * Cap and throttle confidence based on historical honesty.
 * Answer: "Should FinVest be allowed to speak with this level of confidence?"
 * 
 * RULES:
 * - Confidence can NEVER increase above original
 * - If overconfident → cap (not "learn")
 * - Recovery requires TIME + honest calibration, NOT wins
 * 
 * FORBIDDEN:
 * - Confidence inflation
 * - ML / exponential smoothing
 * - Silent normalization
 * - Feeding governed confidence back to TrustLedger
 */

import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { getConfidenceHonestyIndex, HonestyIndex, HonestyMetrics } from '../feedback/ConfidenceHonestyIndex';
import { getTrustLedger, TrustEntry } from '../trust/TrustLedger';
import { 
  CONFIDENCE_DISCIPLINE_POLICY,
  DisciplineState,
  ADJUSTMENT_REASONS,
  DISCIPLINE_STATE_DESCRIPTIONS
} from './ConfidenceDisciplinePolicy';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * GovernedConfidence - The output of confidence governance
 */
export interface GovernedConfidence {
  readonly original_confidence: number;
  readonly max_allowed_confidence: number;
  readonly applied_confidence: number;
  readonly adjustment_reason: string;
  readonly adjustment_amount: number;
  readonly discipline_state: DisciplineState;
  readonly state_entered_at?: string;
  readonly recovery_eligible_at?: string;
  readonly mute_explicit_message?: string;
  readonly _frozen: true;
}

/**
 * GovernorState - Internal state tracking
 */
export interface GovernorState {
  current_state: DisciplineState;
  state_entered_at: string;
  consecutive_overconfidence: number;
  current_overconfidence_penalty: number;
  last_calibration_score: number;
  days_in_current_state: number;
  recovery_progress: number;
}

/**
 * GovernanceHistory - Historical record
 */
export interface GovernanceHistoryEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly snapshot_id?: string;
  readonly original_confidence: number;
  readonly governed_confidence: number;
  readonly state_at_time: DisciplineState;
  readonly reason: string;
  readonly _frozen: true;
}

// =============================================================================
// CONFIDENCE GOVERNOR
// =============================================================================

export class ConfidenceGovernor {
  private static instance: ConfidenceGovernor;
  private snapshotAuthority = getSnapshotAuthority();
  private honestyIndex = getConfidenceHonestyIndex();
  private trustLedger = getTrustLedger();
  private auditLog = DecisionAuditLog.getInstance();
  private policy = CONFIDENCE_DISCIPLINE_POLICY;
  
  // State
  private state: GovernorState;
  
  // History (immutable records)
  private history: GovernanceHistoryEntry[] = [];
  
  private constructor() {
    this.state = this.createInitialState();
    this.loadFromStorage();
  }
  
  public static getInstance(): ConfidenceGovernor {
    if (!ConfidenceGovernor.instance) {
      ConfidenceGovernor.instance = new ConfidenceGovernor();
    }
    return ConfidenceGovernor.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_confidence_governor');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = parsed.state || this.createInitialState();
        this.history = (parsed.history || []).map((h: GovernanceHistoryEntry) => Object.freeze(h));
      }
    } catch (e) {
      console.error('Failed to load governor state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('finvest_confidence_governor', JSON.stringify({
        state: this.state,
        history: this.history
      }));
    } catch (e) {
      console.error('Failed to save governor state:', e);
    }
  }
  
  private createInitialState(): GovernorState {
    return {
      current_state: 'NORMAL',
      state_entered_at: new Date().toISOString(),
      consecutive_overconfidence: 0,
      current_overconfidence_penalty: 0,
      last_calibration_score: 50,
      days_in_current_state: 0,
      recovery_progress: 0
    };
  }
  
  // ===========================================================================
  // CORE GOVERNANCE API
  // ===========================================================================
  
  /**
   * Govern confidence for a given value
   * Confidence can NEVER exceed original
   */
  public governConfidence(
    originalConfidence: number,
    snapshotId?: string
  ): GovernedConfidence {
    // Update state from honesty data
    this.updateStateFromHonesty();
    
    // Calculate max allowed based on current state
    const maxAllowed = this.calculateMaxAllowed();
    
    // Apply governance - NEVER inflate
    const applied = Math.min(originalConfidence, maxAllowed);
    
    // Determine adjustment reason
    const { reason, message } = this.determineAdjustmentReason(
      originalConfidence,
      applied,
      maxAllowed
    );
    
    // Build result (frozen)
    const result: GovernedConfidence = Object.freeze({
      original_confidence: originalConfidence,
      max_allowed_confidence: maxAllowed,
      applied_confidence: applied,
      adjustment_reason: reason,
      adjustment_amount: originalConfidence - applied,
      discipline_state: this.state.current_state,
      state_entered_at: this.state.state_entered_at,
      recovery_eligible_at: this.calculateRecoveryEligibleAt(),
      mute_explicit_message: message,
      _frozen: true
    });
    
    // Record to history
    this.recordHistory(result, snapshotId);
    
    // Audit log (always)
    this.auditLog.log({
      event_type: result.adjustment_amount > 0 ? 'POLICY_UPDATE' : 'CONTEXT_CREATED',
      severity: result.adjustment_amount > 0 ? 'WARNING' : 'INFO',
      summary: `Confidence governed: ${originalConfidence} → ${applied} (${this.state.current_state})`,
      details: {
        original: originalConfidence,
        governed: applied,
        max_allowed: maxAllowed,
        state: this.state.current_state,
        reason,
        snapshot_id: snapshotId
      },
      actor: 'ENGINE'
    });
    
    this.saveToStorage();
    
    return result;
  }
  
  /**
   * Govern confidence from a DecisionSnapshot
   */
  public governFromSnapshot(snapshotId: string, outputIndex: number = 0): GovernedConfidence {
    const snapshot = this.snapshotAuthority.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`GOVERNOR_FAIL_CLOSED: Snapshot ${snapshotId} not found`);
    }
    
    const output = snapshot.outputs[outputIndex];
    if (!output) {
      throw new Error(`GOVERNOR_FAIL_CLOSED: Output at index ${outputIndex} not found`);
    }
    
    return this.governConfidence(output.confidence, snapshotId);
  }
  
  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================
  
  /**
   * Update state from honesty index
   */
  private updateStateFromHonesty(): void {
    try {
      const honesty = this.honestyIndex.getLatestIndex();
      if (!honesty) return;
      
      // Update metrics
      this.state.current_overconfidence_penalty = honesty.overconfidence_penalty;
      this.state.last_calibration_score = honesty.calibration_score;
      
      // Count consecutive overconfidence
      const highBucket = honesty.by_bucket['HIGH'];
      if (highBucket && highBucket.is_overconfident) {
        this.state.consecutive_overconfidence++;
      } else {
        this.state.consecutive_overconfidence = 0;
      }
      
      // Calculate days in current state
      const stateEntered = new Date(this.state.state_entered_at);
      const now = new Date();
      this.state.days_in_current_state = Math.floor(
        (now.getTime() - stateEntered.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Evaluate state transitions
      this.evaluateStateTransitions();
      
    } catch (e) {
      // No honesty data yet - stay in current state
    }
  }
  
  /**
   * Evaluate and apply state transitions
   */
  private evaluateStateTransitions(): void {
    const prevState = this.state.current_state;
    
    // NORMAL → RESTRAINED
    if (this.state.current_state === 'NORMAL') {
      if (
        this.state.current_overconfidence_penalty > this.policy.overconfidence_penalty_limit ||
        this.state.last_calibration_score < 50
      ) {
        this.transitionToState('RESTRAINED');
      }
    }
    
    // RESTRAINED → MUTED
    if (this.state.current_state === 'RESTRAINED') {
      if (
        this.state.consecutive_overconfidence >= this.policy.consecutive_overconfidence_limit ||
        this.state.current_overconfidence_penalty > this.policy.overconfidence_penalty_limit * 2
      ) {
        this.transitionToState('MUTED');
      }
    }
    
    // MUTED → RESTRAINED (recovery)
    if (this.state.current_state === 'MUTED') {
      if (
        this.state.days_in_current_state >= this.policy.mute_duration_days &&
        this.state.last_calibration_score >= this.policy.recovery_calibration_threshold
      ) {
        // Time-based recovery (not win-based)
        this.transitionToState('RESTRAINED');
      }
    }
    
    // RESTRAINED → NORMAL (recovery)
    if (this.state.current_state === 'RESTRAINED') {
      if (
        this.state.days_in_current_state >= this.policy.recovery_waiting_period_days &&
        this.state.current_overconfidence_penalty <= 0 &&
        this.state.last_calibration_score >= this.policy.recovery_calibration_threshold
      ) {
        this.transitionToState('NORMAL');
      }
    }
    
    // Log transition
    if (prevState !== this.state.current_state) {
      this.auditLog.log({
        event_type: 'POLICY_UPDATE',
        severity: this.state.current_state === 'MUTED' ? 'ERROR' : 'WARNING',
        summary: `Discipline state transition: ${prevState} → ${this.state.current_state}`,
        details: {
          from: prevState,
          to: this.state.current_state,
          overconfidence_penalty: this.state.current_overconfidence_penalty,
          calibration_score: this.state.last_calibration_score,
          days_in_prev_state: this.state.days_in_current_state
        },
        actor: 'ENGINE'
      });
    }
  }
  
  private transitionToState(newState: DisciplineState): void {
    this.state.current_state = newState;
    this.state.state_entered_at = new Date().toISOString();
    this.state.days_in_current_state = 0;
    this.state.recovery_progress = 0;
  }
  
  // ===========================================================================
  // CALCULATIONS
  // ===========================================================================
  
  /**
   * Calculate maximum allowed confidence based on current state
   * This can NEVER exceed absolute ceiling
   */
  private calculateMaxAllowed(): number {
    let ceiling: number;
    
    switch (this.state.current_state) {
      case 'MUTED':
        ceiling = this.policy.muted_confidence_ceiling;
        break;
      case 'RESTRAINED':
        // Restrained ceiling, possibly with recovery progress
        ceiling = this.policy.restrained_confidence_ceiling + this.calculateRecoveryBonus();
        break;
      case 'NORMAL':
      default:
        // Normal ceiling, never exceeds absolute
        ceiling = this.policy.absolute_confidence_ceiling;
    }
    
    // NEVER exceed absolute ceiling
    return Math.min(ceiling, this.policy.absolute_confidence_ceiling);
  }
  
  /**
   * Calculate recovery bonus based on time and calibration
   * NOT based on wins
   */
  private calculateRecoveryBonus(): number {
    if (this.state.current_state !== 'RESTRAINED') return 0;
    
    // Must wait minimum period
    if (this.state.days_in_current_state < this.policy.recovery_waiting_period_days) {
      return 0;
    }
    
    // Must have good calibration
    if (this.state.last_calibration_score < this.policy.recovery_calibration_threshold) {
      return 0;
    }
    
    // Time-based recovery only
    const periodsElapsed = Math.floor(
      (this.state.days_in_current_state - this.policy.recovery_waiting_period_days) / 30
    );
    
    return Math.min(
      periodsElapsed * this.policy.recovery_rate_per_30_days,
      this.policy.absolute_confidence_ceiling - this.policy.restrained_confidence_ceiling
    );
  }
  
  private calculateRecoveryEligibleAt(): string | undefined {
    if (this.state.current_state === 'NORMAL') return undefined;
    
    const stateEntered = new Date(this.state.state_entered_at);
    const waitDays = this.state.current_state === 'MUTED'
      ? this.policy.mute_duration_days
      : this.policy.recovery_waiting_period_days;
    
    const eligibleDate = new Date(stateEntered);
    eligibleDate.setDate(eligibleDate.getDate() + waitDays);
    
    return eligibleDate.toISOString();
  }
  
  // ===========================================================================
  // ADJUSTMENT REASONS
  // ===========================================================================
  
  private determineAdjustmentReason(
    original: number,
    applied: number,
    maxAllowed: number
  ): { reason: string; message?: string } {
    if (original <= applied) {
      return { reason: ADJUSTMENT_REASONS.NO_ADJUSTMENT };
    }
    
    if (this.state.current_state === 'MUTED') {
      return {
        reason: ADJUSTMENT_REASONS.MUTED_STATE,
        message: 'My confidence is restricted due to past overconfidence.'
      };
    }
    
    if (this.state.current_state === 'RESTRAINED') {
      return {
        reason: ADJUSTMENT_REASONS.RESTRAINED_STATE,
        message: 'My confidence is moderated due to calibration concerns.'
      };
    }
    
    if (original > this.policy.absolute_confidence_ceiling) {
      return { reason: ADJUSTMENT_REASONS.ABSOLUTE_CEILING };
    }
    
    if (this.state.current_overconfidence_penalty > this.policy.overconfidence_penalty_limit) {
      return { reason: ADJUSTMENT_REASONS.OVERCONFIDENCE_PENALTY };
    }
    
    return { reason: ADJUSTMENT_REASONS.NO_ADJUSTMENT };
  }
  
  // ===========================================================================
  // HISTORY
  // ===========================================================================
  
  private recordHistory(governed: GovernedConfidence, snapshotId?: string): void {
    const entry: GovernanceHistoryEntry = Object.freeze({
      id: `GOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      snapshot_id: snapshotId,
      original_confidence: governed.original_confidence,
      governed_confidence: governed.applied_confidence,
      state_at_time: governed.discipline_state,
      reason: governed.adjustment_reason,
      _frozen: true
    });
    
    this.history.push(entry);
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  public getCurrentState(): GovernorState {
    return { ...this.state };
  }
  
  public getHistory(): GovernanceHistoryEntry[] {
    return [...this.history];
  }
  
  public getStateDescription(): string {
    return DISCIPLINE_STATE_DESCRIPTIONS[this.state.current_state];
  }
  
  public getStats(): {
    current_state: DisciplineState;
    days_in_state: number;
    overconfidence_penalty: number;
    calibration_score: number;
    max_allowed: number;
    total_governed: number;
    total_adjusted: number;
  } {
    const adjusted = this.history.filter(
      h => h.original_confidence > h.governed_confidence
    ).length;
    
    return {
      current_state: this.state.current_state,
      days_in_state: this.state.days_in_current_state,
      overconfidence_penalty: this.state.current_overconfidence_penalty,
      calibration_score: this.state.last_calibration_score,
      max_allowed: this.calculateMaxAllowed(),
      total_governed: this.history.length,
      total_adjusted: adjusted
    };
  }
  
  // ===========================================================================
  // VERIFICATION
  // ===========================================================================
  
  /**
   * Verify that confidence was NEVER inflated
   * Returns true if invariant holds
   */
  public verifyNoInflation(): boolean {
    for (const entry of this.history) {
      if (entry.governed_confidence > entry.original_confidence) {
        return false;
      }
    }
    return true;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getConfidenceGovernor = () => ConfidenceGovernor.getInstance();
export default ConfidenceGovernor;

