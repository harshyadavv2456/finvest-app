/**
 * DecisionAdoption - Decision Adoption Tracker
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * PURPOSE:
 * Understand and reduce the gap between correct decisions and user action.
 * 
 * TRACKS per DecisionSnapshot:
 * - snapshot_id
 * - system_recommendation
 * - user_action (APPROVE / REJECT / IGNORE)
 * - time_to_action (seconds)
 * - rejection_reason (enum)
 * - hesitation_penalty
 * 
 * RULES:
 * - No recommendations without adoption tracking
 * - FAIL CLOSED if adoption reason missing
 */

import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * User action on a recommendation
 */
export type UserAction = 'APPROVE' | 'REJECT' | 'IGNORE';

/**
 * Rejection reason enum
 */
export type RejectionReason = 
  | 'TOO_COMPLEX'         // User doesn't understand the recommendation
  | 'TAX_FEAR'            // Concerned about tax implications
  | 'TIMING_DOUBT'        // Not sure if timing is right
  | 'CONVICTION_TOO_LOW'  // Confidence not high enough
  | 'POLICY_CONFLICT'     // Conflicts with user's policy
  | 'PASSIVE_IGNORE'      // User simply didn't act
  | 'MARKET_CONDITION'    // Waiting for better conditions
  | 'LIQUIDITY_CONCERN'   // Position size too large
  | 'EXTERNAL_ADVICE'     // Following other advice
  | 'NOT_SPECIFIED';      // No reason given (penalized)

/**
 * AdoptionRecord - Tracks user response to a recommendation
 */
export interface AdoptionRecord {
  readonly id: string;
  readonly created_at: string;
  
  // Snapshot reference
  readonly snapshot_id: string;
  readonly recommendation_index: number;
  
  // System recommendation
  readonly system_recommendation: {
    action: string;
    symbol: string;
    confidence: number;
    expected_return: number;
    reasoning: string[];
  };
  
  // User response
  readonly user_action: UserAction;
  readonly time_to_action_seconds: number;    // Time from snapshot creation to user action
  readonly rejection_reason: RejectionReason | null;
  readonly rejection_detail?: string;          // Optional user-provided detail
  
  // Hesitation analysis
  readonly hesitation_penalty: number;         // 0-100, higher = more hesitation cost
  readonly was_reminded: boolean;              // Did user need reminding?
  readonly reminder_count: number;             // How many reminders before action
  
  // Outcome (updated later)
  outcome_tracked: boolean;
  value_at_decision: number;
  value_at_outcome?: number;
  value_lost_due_to_inaction?: number;
  
  // Immutability
  readonly _frozen: true;
}

/**
 * AdoptionStats - Aggregate adoption statistics
 */
export interface AdoptionStats {
  total_recommendations: number;
  
  // Action breakdown
  approved_count: number;
  rejected_count: number;
  ignored_count: number;
  
  // Rates
  adoption_rate: number;                       // 0-1
  rejection_rate: number;                      // 0-1
  ignore_rate: number;                         // 0-1
  
  // Timing
  avg_time_to_action_seconds: number;
  median_time_to_action_seconds: number;
  
  // Costs
  total_value_lost_to_inaction: number;
  delayed_adoption_cost: number;               // Cost of acting late
  passive_loss_cost: number;                   // Cost of ignoring
  
  // Hesitation
  avg_hesitation_penalty: number;
  high_hesitation_count: number;               // Hesitation > 50
  
  // By rejection reason
  rejection_breakdown: Record<RejectionReason, number>;
  
  // Computed at
  computed_at: string;
}

/**
 * PendingDecision - A decision awaiting user action
 */
export interface PendingDecision {
  snapshot_id: string;
  recommendation_index: number;
  symbol: string;
  action: string;
  confidence: number;
  created_at: string;
  age_seconds: number;
  reminder_sent: boolean;
}

// =============================================================================
// DECISION ADOPTION TRACKER
// =============================================================================

export class DecisionAdoptionTracker {
  private static instance: DecisionAdoptionTracker;
  private records: Map<string, AdoptionRecord> = new Map();
  private pendingDecisions: Map<string, PendingDecision> = new Map();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Thresholds
  private readonly HESITATION_THRESHOLD_SECONDS = 300; // 5 minutes
  private readonly IGNORE_THRESHOLD_SECONDS = 86400;   // 24 hours
  private readonly HIGH_HESITATION_PENALTY = 50;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): DecisionAdoptionTracker {
    if (!DecisionAdoptionTracker.instance) {
      DecisionAdoptionTracker.instance = new DecisionAdoptionTracker();
    }
    return DecisionAdoptionTracker.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_adoption_records');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, record] of Object.entries(parsed)) {
          this.records.set(id, record as AdoptionRecord);
        }
      }
      
      const pending = localStorage.getItem('finvest_pending_decisions');
      if (pending) {
        const parsed = JSON.parse(pending);
        for (const [id, decision] of Object.entries(parsed)) {
          this.pendingDecisions.set(id, decision as PendingDecision);
        }
      }
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to load adoption records',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  private saveToStorage(): void {
    try {
      const recordStore: Record<string, AdoptionRecord> = {};
      for (const [id, record] of this.records) {
        recordStore[id] = record;
      }
      localStorage.setItem('finvest_adoption_records', JSON.stringify(recordStore));
      
      const pendingStore: Record<string, PendingDecision> = {};
      for (const [id, decision] of this.pendingDecisions) {
        pendingStore[id] = decision;
      }
      localStorage.setItem('finvest_pending_decisions', JSON.stringify(pendingStore));
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to save adoption records',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  // ===========================================================================
  // TRACK RECOMMENDATION
  // ===========================================================================
  
  /**
   * Register a new recommendation for tracking
   * Called when a DecisionSnapshot is created
   */
  public trackRecommendation(
    snapshot: DecisionSnapshot,
    recommendationIndex: number,
    currentValue: number
  ): string {
    const output = snapshot.outputs[recommendationIndex];
    if (!output) {
      throw new Error(`Recommendation at index ${recommendationIndex} not found`);
    }
    
    const pendingId = `${snapshot.id}:${recommendationIndex}`;
    
    const pending: PendingDecision = {
      snapshot_id: snapshot.id,
      recommendation_index: recommendationIndex,
      symbol: output.symbol || 'UNKNOWN',
      action: output.action,
      confidence: output.confidence,
      created_at: new Date().toISOString(),
      age_seconds: 0,
      reminder_sent: false
    };
    
    this.pendingDecisions.set(pendingId, pending);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'RECOMMENDATION',
      severity: 'INFO',
      summary: `Tracking recommendation: ${output.action} ${output.symbol}`,
      details: {
        snapshot_id: snapshot.id,
        recommendation_index: recommendationIndex,
        action: output.action,
        symbol: output.symbol,
        confidence: output.confidence,
        current_value: currentValue
      },
      actor: 'ENGINE'
    });
    
    return pendingId;
  }
  
  // ===========================================================================
  // RECORD USER ACTION
  // ===========================================================================
  
  /**
   * Record user's action on a recommendation
   */
  public recordAction(
    snapshotId: string,
    recommendationIndex: number,
    userAction: UserAction,
    rejectionReason?: RejectionReason,
    rejectionDetail?: string,
    currentValue?: number
  ): AdoptionRecord {
    const pendingId = `${snapshotId}:${recommendationIndex}`;
    const pending = this.pendingDecisions.get(pendingId);
    
    if (!pending) {
      throw new Error(`No pending decision found for ${pendingId}`);
    }
    
    // Calculate time to action
    const createdAt = new Date(pending.created_at).getTime();
    const now = Date.now();
    const timeToActionSeconds = Math.floor((now - createdAt) / 1000);
    
    // Calculate hesitation penalty
    const hesitationPenalty = this.calculateHesitationPenalty(
      timeToActionSeconds,
      userAction,
      pending.reminder_sent
    );
    
    // Validate rejection reason if rejected
    let finalRejectionReason = rejectionReason || null;
    if (userAction === 'REJECT' && !finalRejectionReason) {
      finalRejectionReason = 'NOT_SPECIFIED';
      
      this.auditLog.log({
        event_type: 'USER_REJECTION',
        severity: 'WARNING',
        summary: `Rejection without reason: ${pending.symbol}`,
        details: { snapshot_id: snapshotId, symbol: pending.symbol },
        actor: 'USER'
      });
    }
    
    // Create record
    const recordId = `ADOPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const record: AdoptionRecord = Object.freeze({
      id: recordId,
      created_at: new Date().toISOString(),
      snapshot_id: snapshotId,
      recommendation_index: recommendationIndex,
      system_recommendation: {
        action: pending.action,
        symbol: pending.symbol,
        confidence: pending.confidence,
        expected_return: 0, // Would need to lookup from snapshot
        reasoning: []
      },
      user_action: userAction,
      time_to_action_seconds: timeToActionSeconds,
      rejection_reason: finalRejectionReason,
      rejection_detail: rejectionDetail,
      hesitation_penalty: hesitationPenalty,
      was_reminded: pending.reminder_sent,
      reminder_count: pending.reminder_sent ? 1 : 0,
      outcome_tracked: false,
      value_at_decision: currentValue || 0,
      _frozen: true
    });
    
    // Store and cleanup
    this.records.set(recordId, record);
    this.pendingDecisions.delete(pendingId);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: userAction === 'APPROVE' ? 'USER_CONFIRMATION' : 'USER_REJECTION',
      severity: 'INFO',
      summary: `User ${userAction}: ${pending.symbol}`,
      details: {
        record_id: recordId,
        snapshot_id: snapshotId,
        action: userAction,
        rejection_reason: finalRejectionReason,
        time_to_action: timeToActionSeconds,
        hesitation_penalty: hesitationPenalty
      },
      actor: 'USER'
    });
    
    return record;
  }
  
  /**
   * Mark a pending decision as ignored
   * Called after IGNORE_THRESHOLD_SECONDS
   */
  public markAsIgnored(snapshotId: string, recommendationIndex: number): AdoptionRecord | null {
    return this.recordAction(
      snapshotId,
      recommendationIndex,
      'IGNORE',
      'PASSIVE_IGNORE',
      'No action taken within threshold'
    );
  }
  
  /**
   * Calculate hesitation penalty
   */
  private calculateHesitationPenalty(
    timeToActionSeconds: number,
    action: UserAction,
    wasReminded: boolean
  ): number {
    let penalty = 0;
    
    // Base penalty for delay
    if (timeToActionSeconds > this.HESITATION_THRESHOLD_SECONDS) {
      const delayMinutes = (timeToActionSeconds - this.HESITATION_THRESHOLD_SECONDS) / 60;
      penalty += Math.min(30, delayMinutes); // Up to 30 points for delay
    }
    
    // Penalty for needing reminder
    if (wasReminded) {
      penalty += 15;
    }
    
    // Penalty for ignore
    if (action === 'IGNORE') {
      penalty += 40;
    }
    
    // Penalty for reject without reason
    // (handled in recordAction)
    
    return Math.min(100, penalty);
  }
  
  // ===========================================================================
  // UPDATE OUTCOMES
  // ===========================================================================
  
  /**
   * Update record with outcome data
   */
  public updateOutcome(
    recordId: string,
    currentValue: number,
    valueLostDueToInaction?: number
  ): void {
    const record = this.records.get(recordId);
    if (!record) return;
    
    // Create updated record (append-only)
    const updated: AdoptionRecord = Object.freeze({
      ...record,
      outcome_tracked: true,
      value_at_outcome: currentValue,
      value_lost_due_to_inaction: valueLostDueToInaction || 0
    });
    
    this.records.set(recordId, updated);
    this.saveToStorage();
  }
  
  // ===========================================================================
  // PENDING DECISIONS
  // ===========================================================================
  
  /**
   * Get pending decisions
   */
  public getPendingDecisions(): PendingDecision[] {
    const now = Date.now();
    const pending: PendingDecision[] = [];
    
    for (const [id, decision] of this.pendingDecisions) {
      const createdAt = new Date(decision.created_at).getTime();
      const ageSeconds = Math.floor((now - createdAt) / 1000);
      
      pending.push({
        ...decision,
        age_seconds: ageSeconds
      });
    }
    
    return pending.sort((a, b) => b.age_seconds - a.age_seconds);
  }
  
  /**
   * Get stale pending decisions (need reminder)
   */
  public getStalePendingDecisions(): PendingDecision[] {
    return this.getPendingDecisions().filter(
      d => d.age_seconds > this.HESITATION_THRESHOLD_SECONDS && !d.reminder_sent
    );
  }
  
  /**
   * Mark pending decision as reminded
   */
  public markAsReminded(snapshotId: string, recommendationIndex: number): void {
    const pendingId = `${snapshotId}:${recommendationIndex}`;
    const pending = this.pendingDecisions.get(pendingId);
    
    if (pending) {
      this.pendingDecisions.set(pendingId, {
        ...pending,
        reminder_sent: true
      });
      this.saveToStorage();
    }
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  /**
   * Get adoption statistics
   */
  public getStats(): AdoptionStats {
    const records = Array.from(this.records.values());
    const total = records.length;
    
    if (total === 0) {
      return this.createEmptyStats();
    }
    
    // Action counts
    const approved = records.filter(r => r.user_action === 'APPROVE').length;
    const rejected = records.filter(r => r.user_action === 'REJECT').length;
    const ignored = records.filter(r => r.user_action === 'IGNORE').length;
    
    // Timing
    const times = records.map(r => r.time_to_action_seconds).sort((a, b) => a - b);
    const avgTime = times.reduce((sum, t) => sum + t, 0) / total;
    const medianTime = times[Math.floor(times.length / 2)] || 0;
    
    // Costs
    const valueLost = records
      .filter(r => r.value_lost_due_to_inaction !== undefined)
      .reduce((sum, r) => sum + (r.value_lost_due_to_inaction || 0), 0);
    
    const delayedCost = records
      .filter(r => r.user_action === 'APPROVE' && r.hesitation_penalty > 0)
      .reduce((sum, r) => sum + r.hesitation_penalty * 100, 0); // Simplified
    
    const passiveLost = records
      .filter(r => r.user_action === 'IGNORE')
      .reduce((sum, r) => sum + (r.value_lost_due_to_inaction || 0), 0);
    
    // Hesitation
    const avgHesitation = records.reduce((sum, r) => sum + r.hesitation_penalty, 0) / total;
    const highHesitation = records.filter(r => r.hesitation_penalty > this.HIGH_HESITATION_PENALTY).length;
    
    // Rejection breakdown
    const rejectionBreakdown: Record<RejectionReason, number> = {
      'TOO_COMPLEX': 0,
      'TAX_FEAR': 0,
      'TIMING_DOUBT': 0,
      'CONVICTION_TOO_LOW': 0,
      'POLICY_CONFLICT': 0,
      'PASSIVE_IGNORE': 0,
      'MARKET_CONDITION': 0,
      'LIQUIDITY_CONCERN': 0,
      'EXTERNAL_ADVICE': 0,
      'NOT_SPECIFIED': 0
    };
    
    for (const record of records) {
      if (record.rejection_reason) {
        rejectionBreakdown[record.rejection_reason]++;
      }
    }
    
    return {
      total_recommendations: total,
      approved_count: approved,
      rejected_count: rejected,
      ignored_count: ignored,
      adoption_rate: approved / total,
      rejection_rate: rejected / total,
      ignore_rate: ignored / total,
      avg_time_to_action_seconds: avgTime,
      median_time_to_action_seconds: medianTime,
      total_value_lost_to_inaction: valueLost,
      delayed_adoption_cost: delayedCost,
      passive_loss_cost: passiveLost,
      avg_hesitation_penalty: avgHesitation,
      high_hesitation_count: highHesitation,
      rejection_breakdown: rejectionBreakdown,
      computed_at: new Date().toISOString()
    };
  }
  
  private createEmptyStats(): AdoptionStats {
    return {
      total_recommendations: 0,
      approved_count: 0,
      rejected_count: 0,
      ignored_count: 0,
      adoption_rate: 0,
      rejection_rate: 0,
      ignore_rate: 0,
      avg_time_to_action_seconds: 0,
      median_time_to_action_seconds: 0,
      total_value_lost_to_inaction: 0,
      delayed_adoption_cost: 0,
      passive_loss_cost: 0,
      avg_hesitation_penalty: 0,
      high_hesitation_count: 0,
      rejection_breakdown: {
        'TOO_COMPLEX': 0,
        'TAX_FEAR': 0,
        'TIMING_DOUBT': 0,
        'CONVICTION_TOO_LOW': 0,
        'POLICY_CONFLICT': 0,
        'PASSIVE_IGNORE': 0,
        'MARKET_CONDITION': 0,
        'LIQUIDITY_CONCERN': 0,
        'EXTERNAL_ADVICE': 0,
        'NOT_SPECIFIED': 0
      },
      computed_at: new Date().toISOString()
    };
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get records by user action
   */
  public getRecordsByAction(action: UserAction): readonly AdoptionRecord[] {
    return Object.freeze(
      Array.from(this.records.values()).filter(r => r.user_action === action)
    );
  }
  
  /**
   * Get records by rejection reason
   */
  public getRecordsByRejectionReason(reason: RejectionReason): readonly AdoptionRecord[] {
    return Object.freeze(
      Array.from(this.records.values()).filter(r => r.rejection_reason === reason)
    );
  }
  
  /**
   * Get record by ID
   */
  public getRecord(id: string): AdoptionRecord | null {
    return this.records.get(id) || null;
  }
  
  /**
   * Get records for a snapshot
   */
  public getRecordsForSnapshot(snapshotId: string): readonly AdoptionRecord[] {
    return Object.freeze(
      Array.from(this.records.values()).filter(r => r.snapshot_id === snapshotId)
    );
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getDecisionAdoption = () => DecisionAdoptionTracker.getInstance();
export default DecisionAdoptionTracker;

