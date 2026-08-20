/**
 * CounterfactualLedger - Read-Only Ledger for Suppressed Decisions
 * 
 * PHASE 33: Counterfactual Suppression Ledger (CSL)
 * 
 * PURPOSE:
 * Track what the system killed and what that cost.
 * Measure the shadow of suppressed decisions.
 * 
 * DESIGN LAW:
 * - Discipline has a cost
 * - Wisdom is knowing whether it was worth paying
 * - If the system only measures success, it will lie to itself
 * 
 * RULES:
 * - NEVER alter original decisions
 * - NEVER resurrect suppressed decisions
 * - All outputs frozen
 * - This does NOT affect execution
 * - This does NOT influence recommendations
 * - Pure accounting of truth
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { DecisionSnapshot } from '../core/DecisionSnapshot';

// =============================================================================
// TYPES
// =============================================================================

/**
 * SuppressionReason - Why a decision was suppressed
 */
export type SuppressionReason =
  | 'CAPITAL_CONTENTION'
  | 'RISK_BUDGET_EXHAUSTION'
  | 'TEMPORAL_RESOURCE_CONFLICT'
  | 'POLICY_VIOLATION'
  | 'CORRELATION_CONFLICT'
  | 'TAX_VS_SIGNAL'
  | 'DUPLICATE_SYMBOL'
  | 'SYSTEM_ABORT';

/**
 * DominanceResult - Was the system right or wrong?
 */
export type DominanceResult = 'SYSTEM_RIGHT' | 'SYSTEM_WRONG' | 'AMBIGUOUS';

/**
 * CounterfactualOutcome - What would have happened
 */
export interface CounterfactualOutcome {
  readonly measured_at: string;
  readonly realized_return: number;
  readonly max_favorable_move: number;
  readonly max_adverse_move: number;
  readonly drawdown_exceeded: boolean;
  readonly opportunity_cost: number;
  readonly dominance: DominanceResult;
  readonly computation_notes: string;
  readonly _frozen: true;
}

/**
 * SuppressedDecisionRecord - Permanent record of a killed decision
 */
export interface SuppressedDecisionRecord {
  readonly record_id: string;
  readonly snapshot_id: string;
  readonly suppression_reason: SuppressionReason;
  readonly suppressed_at: string;
  readonly lifecycle_state_at_suppression: 'SUPPRESSED';
  
  // Original decision parameters
  readonly original_expected_return: number;
  readonly original_expected_risk: number;
  readonly original_confidence: number;
  readonly original_time_horizon_days: number;
  readonly original_symbol?: string;
  readonly original_action?: string;
  
  // Killed by
  readonly killed_by: string;  // snapshot_id or 'SYSTEM'
  
  // Computed later
  readonly counterfactual_outcome?: CounterfactualOutcome;
  readonly horizon_expiry: string;
  
  readonly _frozen: true;
}

/**
 * LedgerSummary - Aggregate statistics
 */
export interface LedgerSummary {
  readonly total_suppressions: number;
  readonly by_reason: Record<SuppressionReason, number>;
  readonly with_counterfactuals: number;
  readonly system_right_count: number;
  readonly system_wrong_count: number;
  readonly ambiguous_count: number;
  readonly total_opportunity_cost: number;
  readonly total_regret_avoided: number;
  readonly net_suppression_impact: number;
  readonly computed_at: string;
  readonly _frozen: true;
}

// =============================================================================
// COUNTERFACTUAL LEDGER
// =============================================================================

export class CounterfactualLedger {
  private static instance: CounterfactualLedger;
  private auditLog = DecisionAuditLog.getInstance();
  
  // The ledger (append-only)
  private suppressions: Map<string, SuppressedDecisionRecord> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): CounterfactualLedger {
    if (!CounterfactualLedger.instance) {
      CounterfactualLedger.instance = new CounterfactualLedger();
    }
    return CounterfactualLedger.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_counterfactual_ledger');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.suppressions) {
          for (const [key, value] of Object.entries(parsed.suppressions)) {
            this.suppressions.set(key, Object.freeze(value as SuppressedDecisionRecord));
          }
        }
      }
    } catch (e) {
      console.error('Failed to load counterfactual ledger:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        suppressions: Object.fromEntries(this.suppressions)
      };
      localStorage.setItem('finvest_counterfactual_ledger', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save counterfactual ledger:', e);
    }
  }
  
  // ===========================================================================
  // REGISTRATION API
  // ===========================================================================
  
  /**
   * Register a suppressed decision
   * MANDATORY: Called when any decision is suppressed
   * THROWS if already registered (exactly once rule)
   */
  public registerSuppression(
    snapshot: DecisionSnapshot,
    reason: SuppressionReason,
    killedBy: string,
    timeHorizonDays: number = 30
  ): SuppressedDecisionRecord {
    // Check for duplicate registration
    if (this.suppressions.has(snapshot.id)) {
      throw new Error(
        `COUNTERFACTUAL_ERROR: Snapshot ${snapshot.id} already registered. ` +
        `Suppressed decisions can only be registered exactly once.`
      );
    }
    
    const output = snapshot.outputs[0];
    const now = new Date();
    const horizonExpiry = new Date(now.getTime() + timeHorizonDays * 24 * 60 * 60 * 1000);
    
    const record: SuppressedDecisionRecord = Object.freeze({
      record_id: `SUPP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: snapshot.id,
      suppression_reason: reason,
      suppressed_at: now.toISOString(),
      lifecycle_state_at_suppression: 'SUPPRESSED' as const,
      
      original_expected_return: output?.expected_return || 0,
      original_expected_risk: output?.confidence ? (100 - output.confidence) / 10 : 5,
      original_confidence: output?.confidence || 0,
      original_time_horizon_days: timeHorizonDays,
      original_symbol: output?.symbol,
      original_action: output?.action,
      
      killed_by: killedBy,
      
      counterfactual_outcome: undefined,
      horizon_expiry: horizonExpiry.toISOString(),
      
      _frozen: true
    });
    
    this.suppressions.set(snapshot.id, record);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Suppression registered: ${snapshot.id}`,
      details: {
        record_id: record.record_id,
        snapshot_id: snapshot.id,
        reason,
        killed_by: killedBy,
        original_expected_return: record.original_expected_return,
        horizon_expiry: record.horizon_expiry
      },
      actor: 'LEDGER'
    });
    
    return record;
  }
  
  /**
   * Attach counterfactual outcome to a suppressed decision
   * THROWS if horizon has not expired
   * THROWS if counterfactual already computed
   */
  public attachCounterfactual(
    snapshotId: string,
    outcome: CounterfactualOutcome
  ): SuppressedDecisionRecord {
    const existing = this.suppressions.get(snapshotId);
    
    if (!existing) {
      throw new Error(
        `COUNTERFACTUAL_ERROR: No suppressed decision found for ${snapshotId}.`
      );
    }
    
    if (existing.counterfactual_outcome) {
      throw new Error(
        `COUNTERFACTUAL_ERROR: Counterfactual already computed for ${snapshotId}. ` +
        `Counterfactuals are immutable.`
      );
    }
    
    // Check horizon expiry
    const now = new Date();
    const horizonExpiry = new Date(existing.horizon_expiry);
    
    if (now < horizonExpiry) {
      throw new Error(
        `COUNTERFACTUAL_ERROR: Cannot compute counterfactual for ${snapshotId}. ` +
        `Horizon has not expired yet. Expires at: ${existing.horizon_expiry}`
      );
    }
    
    // Create updated record with counterfactual
    const updatedRecord: SuppressedDecisionRecord = Object.freeze({
      ...existing,
      counterfactual_outcome: Object.freeze(outcome),
      _frozen: true
    });
    
    this.suppressions.set(snapshotId, updatedRecord);
    this.saveToStorage();
    
    // Audit log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: outcome.dominance === 'SYSTEM_WRONG' ? 'WARNING' : 'INFO',
      summary: `Counterfactual computed: ${snapshotId} - ${outcome.dominance}`,
      details: {
        snapshot_id: snapshotId,
        dominance: outcome.dominance,
        opportunity_cost: outcome.opportunity_cost,
        realized_return: outcome.realized_return
      },
      actor: 'LEDGER'
    });
    
    return updatedRecord;
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get a suppressed decision record
   */
  public getRecord(snapshotId: string): SuppressedDecisionRecord | null {
    return this.suppressions.get(snapshotId) || null;
  }
  
  /**
   * Get all suppressed decision records
   */
  public getSuppressedDecisions(): SuppressedDecisionRecord[] {
    return Array.from(this.suppressions.values());
  }
  
  /**
   * Get all records with counterfactuals computed
   */
  public getCounterfactuals(): SuppressedDecisionRecord[] {
    return Array.from(this.suppressions.values())
      .filter(r => r.counterfactual_outcome !== undefined);
  }
  
  /**
   * Get records pending counterfactual computation (horizon expired)
   */
  public getPendingCounterfactuals(): SuppressedDecisionRecord[] {
    const now = new Date();
    return Array.from(this.suppressions.values())
      .filter(r => {
        if (r.counterfactual_outcome !== undefined) return false;
        const horizonExpiry = new Date(r.horizon_expiry);
        return now >= horizonExpiry;
      });
  }
  
  /**
   * Get records by reason
   */
  public getByReason(reason: SuppressionReason): SuppressedDecisionRecord[] {
    return Array.from(this.suppressions.values())
      .filter(r => r.suppression_reason === reason);
  }
  
  /**
   * Get records where system was wrong
   */
  public getSystemWrongDecisions(): SuppressedDecisionRecord[] {
    return this.getCounterfactuals()
      .filter(r => r.counterfactual_outcome?.dominance === 'SYSTEM_WRONG');
  }
  
  /**
   * Get records where system was right
   */
  public getSystemRightDecisions(): SuppressedDecisionRecord[] {
    return this.getCounterfactuals()
      .filter(r => r.counterfactual_outcome?.dominance === 'SYSTEM_RIGHT');
  }
  
  /**
   * Check if a snapshot is registered
   */
  public isRegistered(snapshotId: string): boolean {
    return this.suppressions.has(snapshotId);
  }
  
  /**
   * Check if counterfactual is computed
   */
  public hasCounterfactual(snapshotId: string): boolean {
    const record = this.suppressions.get(snapshotId);
    return record?.counterfactual_outcome !== undefined;
  }
  
  // ===========================================================================
  // SUMMARY & STATISTICS
  // ===========================================================================
  
  /**
   * Get ledger summary
   */
  public getSummary(): LedgerSummary {
    const records = Array.from(this.suppressions.values());
    const withCounterfactuals = records.filter(r => r.counterfactual_outcome);
    
    // Count by reason
    const byReason: Record<string, number> = {};
    for (const record of records) {
      byReason[record.suppression_reason] = (byReason[record.suppression_reason] || 0) + 1;
    }
    
    // Count by dominance
    let systemRightCount = 0;
    let systemWrongCount = 0;
    let ambiguousCount = 0;
    let totalOpportunityCost = 0;
    let totalRegretAvoided = 0;
    
    for (const record of withCounterfactuals) {
      const outcome = record.counterfactual_outcome!;
      
      switch (outcome.dominance) {
        case 'SYSTEM_RIGHT':
          systemRightCount++;
          // Regret avoided = potential loss we didn't take
          if (outcome.realized_return < 0) {
            totalRegretAvoided += Math.abs(outcome.realized_return);
          }
          break;
        case 'SYSTEM_WRONG':
          systemWrongCount++;
          totalOpportunityCost += outcome.opportunity_cost;
          break;
        case 'AMBIGUOUS':
          ambiguousCount++;
          break;
      }
    }
    
    return Object.freeze({
      total_suppressions: records.length,
      by_reason: byReason as Record<SuppressionReason, number>,
      with_counterfactuals: withCounterfactuals.length,
      system_right_count: systemRightCount,
      system_wrong_count: systemWrongCount,
      ambiguous_count: ambiguousCount,
      total_opportunity_cost: totalOpportunityCost,
      total_regret_avoided: totalRegretAvoided,
      net_suppression_impact: totalRegretAvoided - totalOpportunityCost,
      computed_at: new Date().toISOString(),
      _frozen: true
    });
  }
  
  /**
   * Get suppression impact for trust ledger integration
   */
  public getSuppressionImpact(): {
    suppressed_wins: number;      // System saved money
    suppressed_losses: number;    // System cost opportunity
    net_impact: number;
    total_evaluated: number;
  } {
    const summary = this.getSummary();
    return {
      suppressed_wins: summary.total_regret_avoided,
      suppressed_losses: summary.total_opportunity_cost,
      net_impact: summary.net_suppression_impact,
      total_evaluated: summary.with_counterfactuals
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getCounterfactualLedger = () => CounterfactualLedger.getInstance();
export default CounterfactualLedger;

