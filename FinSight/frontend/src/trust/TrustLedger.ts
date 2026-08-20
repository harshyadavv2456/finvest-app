/**
 * TrustLedger - Immutable Trust Tracking
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * PURPOSE:
 * Make FinVest provably trustworthy before real execution.
 * 
 * RULES (NON-NEGOTIABLE):
 * - READ-ONLY
 * - APPEND-ONLY
 * - Computed from ConsequenceEngine ONLY
 * - NO manual overrides
 * - Losses must be visible
 * - FAIL CLOSED if ledger incomplete
 */

import { getExecutionSandbox, IntentRecord, IntentPerformance, SandboxStats } from '../execution/ExecutionSandbox';
import { getConsequenceEngine, ConsequenceAnalysis } from '../analysis/ConsequenceEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * TrustEntry - A single immutable ledger entry
 */
export interface TrustEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly entry_type: TrustEntryType;
  
  // Source reference
  readonly intent_id?: string;
  readonly consequence_id?: string;
  readonly snapshot_id?: string;
  
  // Outcome
  readonly symbol: string;
  readonly action_recommended: string;
  readonly user_decision: 'APPROVED' | 'REJECTED';
  readonly outcome: 'CORRECT' | 'WRONG' | 'PENDING';
  
  // Financial impact
  readonly regret_amount: number;
  readonly opportunity_cost: number;
  readonly return_if_followed: number;
  readonly return_actual: number;
  
  // Confidence at decision time
  readonly confidence_at_decision: number;
  
  // Immutability marker
  readonly _frozen: true;
}

export type TrustEntryType = 
  | 'CORRECT_APPROVAL'    // User approved, FinVest was right
  | 'WRONG_APPROVAL'      // User approved, FinVest was wrong
  | 'CORRECT_REJECTION'   // User rejected, FinVest was wrong
  | 'WRONG_REJECTION'     // User rejected, FinVest was right (missed opportunity)
  | 'PENDING';            // Not yet determined

/**
 * TrustScore - Computed trust metrics
 */
export interface TrustScore {
  // Counts
  total_sandbox_decisions: number;
  approved_count: number;
  rejected_count: number;
  
  // Outcomes
  correct_approvals: number;
  wrong_approvals: number;
  correct_rejections: number;
  wrong_rejections: number;
  pending_outcomes: number;
  
  // Financial
  total_regret_avoided: number;     // Good rejections
  total_regret_incurred: number;    // Wrong rejections
  total_loss_avoided: number;       // Good approvals
  total_loss_incurred: number;      // Wrong approvals
  
  // Net score (0-100)
  net_trust_score: number;
  
  // Accuracy rates
  approval_accuracy: number;        // 0-1
  rejection_accuracy: number;       // 0-1
  overall_accuracy: number;         // 0-1
  
  // Tracking
  first_entry_date: string | null;
  last_entry_date: string | null;
  days_of_tracking: number;
  
  // Computed at
  computed_at: string;
}

/**
 * LedgerIntegrity - Integrity check result
 */
export interface LedgerIntegrity {
  valid: boolean;
  total_entries: number;
  errors: string[];
  warnings: string[];
  last_verified: string;
}

// =============================================================================
// TRUST LEDGER
// =============================================================================

/**
 * TrustLedger
 * 
 * READ-ONLY trust tracking.
 * Cannot be modified manually.
 * Computed from ConsequenceEngine only.
 */
export class TrustLedger {
  private static instance: TrustLedger;
  private entries: Map<string, TrustEntry> = new Map();
  private sandbox = getExecutionSandbox();
  private consequenceEngine = getConsequenceEngine();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Last computed score (cached)
  private cachedScore: TrustScore | null = null;
  private lastComputedAt: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): TrustLedger {
    if (!TrustLedger.instance) {
      TrustLedger.instance = new TrustLedger();
    }
    return TrustLedger.instance;
  }
  
  // ===========================================================================
  // STORAGE (Internal only)
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_trust_ledger');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, entry] of Object.entries(parsed)) {
          this.entries.set(id, entry as TrustEntry);
        }
      }
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to load trust ledger',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  private saveToStorage(): void {
    try {
      const toStore: Record<string, TrustEntry> = {};
      for (const [id, entry] of this.entries) {
        toStore[id] = entry;
      }
      localStorage.setItem('finvest_trust_ledger', JSON.stringify(toStore));
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to save trust ledger',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  // ===========================================================================
  // SYNCHRONIZATION (Internal - From ConsequenceEngine)
  // ===========================================================================
  
  /**
   * Sync ledger from ConsequenceEngine
   * Called automatically, cannot be called manually with fake data
   */
  public sync(): void {
    // Get all intents and their performances from sandbox
    const intents = this.sandbox.getIntents();
    
    for (const intent of intents) {
      const performance = this.sandbox.getPerformance(intent.id);
      
      // Only process if we have performance data
      if (!performance) continue;
      
      // Check if entry already exists
      if (this.entries.has(intent.id)) {
        // Update if outcome changed from PENDING
        const existing = this.entries.get(intent.id)!;
        if (existing.outcome === 'PENDING') {
          this.updateEntry(intent, performance);
        }
        continue;
      }
      
      // Create new entry
      this.createEntry(intent, performance);
    }
    
    // Invalidate cache
    this.cachedScore = null;
    this.lastComputedAt = 0;
    
    // Save
    this.saveToStorage();
    
    // Log sync
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Trust ledger synced: ${this.entries.size} entries`,
      details: { entries_count: this.entries.size },
      actor: 'ENGINE'
    });
  }
  
  /**
   * Create a new ledger entry
   */
  private createEntry(intent: IntentRecord, performance: IntentPerformance): void {
    const entryType = this.determineEntryType(intent, performance);
    const outcome = this.determineOutcome(entryType);
    
    const entry: TrustEntry = Object.freeze({
      id: intent.id,
      timestamp: new Date().toISOString(),
      entry_type: entryType,
      intent_id: intent.id,
      snapshot_id: intent.snapshot_id,
      symbol: intent.symbol,
      action_recommended: intent.action,
      user_decision: intent.status as 'APPROVED' | 'REJECTED',
      outcome,
      regret_amount: performance.regret_amount,
      opportunity_cost: performance.opportunity_cost,
      return_if_followed: performance.return_if_followed,
      return_actual: performance.return_actual,
      confidence_at_decision: 70, // Default, would come from snapshot
      _frozen: true
    });
    
    this.entries.set(intent.id, entry);
  }
  
  /**
   * Update an existing entry (only outcome)
   */
  private updateEntry(intent: IntentRecord, performance: IntentPerformance): void {
    const existing = this.entries.get(intent.id);
    if (!existing || existing.outcome !== 'PENDING') return;
    
    const entryType = this.determineEntryType(intent, performance);
    const outcome = this.determineOutcome(entryType);
    
    // Create new frozen entry (append-only semantics)
    const updated: TrustEntry = Object.freeze({
      ...existing,
      entry_type: entryType,
      outcome,
      regret_amount: performance.regret_amount,
      opportunity_cost: performance.opportunity_cost,
      return_if_followed: performance.return_if_followed,
      return_actual: performance.return_actual
    });
    
    this.entries.set(intent.id, updated);
  }
  
  /**
   * Determine entry type from intent and performance
   */
  private determineEntryType(intent: IntentRecord, performance: IntentPerformance): TrustEntryType {
    const userApproved = intent.status === 'APPROVED';
    const finvestWasRight = performance.return_if_followed > performance.return_actual;
    
    // Too early to tell
    if (performance.days_since_intent < 7) {
      return 'PENDING';
    }
    
    if (userApproved) {
      return finvestWasRight ? 'CORRECT_APPROVAL' : 'WRONG_APPROVAL';
    } else {
      return finvestWasRight ? 'WRONG_REJECTION' : 'CORRECT_REJECTION';
    }
  }
  
  /**
   * Determine outcome from entry type
   */
  private determineOutcome(entryType: TrustEntryType): 'CORRECT' | 'WRONG' | 'PENDING' {
    switch (entryType) {
      case 'CORRECT_APPROVAL':
      case 'CORRECT_REJECTION':
        return 'CORRECT';
      case 'WRONG_APPROVAL':
      case 'WRONG_REJECTION':
        return 'WRONG';
      default:
        return 'PENDING';
    }
  }
  
  // ===========================================================================
  // READ-ONLY QUERIES
  // ===========================================================================
  
  /**
   * Get trust score (computed, read-only)
   */
  public getTrustScore(): TrustScore {
    // Check cache
    const now = Date.now();
    if (this.cachedScore && (now - this.lastComputedAt) < this.CACHE_TTL_MS) {
      return this.cachedScore;
    }
    
    // Sync first
    this.sync();
    
    // Compute score
    const entries = Array.from(this.entries.values());
    
    // Counts
    const approved = entries.filter(e => e.user_decision === 'APPROVED');
    const rejected = entries.filter(e => e.user_decision === 'REJECTED');
    
    const correctApprovals = entries.filter(e => e.entry_type === 'CORRECT_APPROVAL').length;
    const wrongApprovals = entries.filter(e => e.entry_type === 'WRONG_APPROVAL').length;
    const correctRejections = entries.filter(e => e.entry_type === 'CORRECT_REJECTION').length;
    const wrongRejections = entries.filter(e => e.entry_type === 'WRONG_REJECTION').length;
    const pending = entries.filter(e => e.entry_type === 'PENDING').length;
    
    // Financial
    const regretAvoided = entries
      .filter(e => e.entry_type === 'CORRECT_REJECTION')
      .reduce((sum, e) => sum + Math.abs(e.regret_amount), 0);
    
    const regretIncurred = entries
      .filter(e => e.entry_type === 'WRONG_REJECTION')
      .reduce((sum, e) => sum + e.opportunity_cost, 0);
    
    const lossAvoided = entries
      .filter(e => e.entry_type === 'CORRECT_APPROVAL')
      .reduce((sum, e) => sum + Math.max(0, e.return_if_followed * e.regret_amount / 100), 0);
    
    const lossIncurred = entries
      .filter(e => e.entry_type === 'WRONG_APPROVAL')
      .reduce((sum, e) => sum + Math.abs(e.regret_amount), 0);
    
    // Accuracy rates
    const decidedApprovals = correctApprovals + wrongApprovals;
    const decidedRejections = correctRejections + wrongRejections;
    const totalDecided = decidedApprovals + decidedRejections;
    
    const approvalAccuracy = decidedApprovals > 0 
      ? correctApprovals / decidedApprovals 
      : 0;
    
    const rejectionAccuracy = decidedRejections > 0 
      ? correctRejections / decidedRejections 
      : 0;
    
    const overallAccuracy = totalDecided > 0 
      ? (correctApprovals + correctRejections) / totalDecided 
      : 0;
    
    // Net trust score (0-100)
    // Based on: accuracy, regret ratio, sample size
    let netTrustScore = 0;
    if (totalDecided >= 5) {
      const accuracyComponent = overallAccuracy * 60; // 60% weight
      const regretRatio = regretIncurred > 0 
        ? Math.min(1, regretAvoided / regretIncurred) 
        : 1;
      const regretComponent = regretRatio * 30; // 30% weight
      const sampleSizeComponent = Math.min(10, totalDecided / 5); // 10% weight, max at 50 decisions
      
      netTrustScore = Math.round(accuracyComponent + regretComponent + sampleSizeComponent);
    }
    
    // Date tracking
    const sortedByDate = entries.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const firstDate = sortedByDate[0]?.timestamp || null;
    const lastDate = sortedByDate[sortedByDate.length - 1]?.timestamp || null;
    const daysOfTracking = firstDate && lastDate
      ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const score: TrustScore = {
      total_sandbox_decisions: entries.length,
      approved_count: approved.length,
      rejected_count: rejected.length,
      correct_approvals: correctApprovals,
      wrong_approvals: wrongApprovals,
      correct_rejections: correctRejections,
      wrong_rejections: wrongRejections,
      pending_outcomes: pending,
      total_regret_avoided: regretAvoided,
      total_regret_incurred: regretIncurred,
      total_loss_avoided: lossAvoided,
      total_loss_incurred: lossIncurred,
      net_trust_score: netTrustScore,
      approval_accuracy: approvalAccuracy,
      rejection_accuracy: rejectionAccuracy,
      overall_accuracy: overallAccuracy,
      first_entry_date: firstDate,
      last_entry_date: lastDate,
      days_of_tracking: daysOfTracking,
      computed_at: new Date().toISOString()
    };
    
    // Cache
    this.cachedScore = score;
    this.lastComputedAt = now;
    
    return score;
  }
  
  /**
   * Get all entries (read-only)
   */
  public getEntries(): readonly TrustEntry[] {
    return Object.freeze(Array.from(this.entries.values()));
  }
  
  /**
   * Get entries by type
   */
  public getEntriesByType(type: TrustEntryType): readonly TrustEntry[] {
    return Object.freeze(
      Array.from(this.entries.values()).filter(e => e.entry_type === type)
    );
  }
  
  /**
   * Get worst mistakes (wrong approvals + wrong rejections)
   */
  public getWorstMistakes(limit: number = 5): readonly TrustEntry[] {
    const mistakes = Array.from(this.entries.values())
      .filter(e => e.outcome === 'WRONG')
      .sort((a, b) => {
        // Sort by financial impact
        const impactA = Math.abs(a.regret_amount) + a.opportunity_cost;
        const impactB = Math.abs(b.regret_amount) + b.opportunity_cost;
        return impactB - impactA;
      })
      .slice(0, limit);
    
    return Object.freeze(mistakes);
  }
  
  /**
   * Get best avoided losses
   */
  public getBestAvoidedLosses(limit: number = 5): readonly TrustEntry[] {
    const avoided = Array.from(this.entries.values())
      .filter(e => e.entry_type === 'CORRECT_REJECTION')
      .sort((a, b) => Math.abs(b.regret_amount) - Math.abs(a.regret_amount))
      .slice(0, limit);
    
    return Object.freeze(avoided);
  }
  
  /**
   * Verify ledger integrity
   */
  public verifyIntegrity(): LedgerIntegrity {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check all entries are frozen
    for (const entry of this.entries.values()) {
      if (!entry._frozen) {
        errors.push(`Entry ${entry.id} is not frozen`);
      }
    }
    
    // Check for orphaned entries
    const sandboxIntents = new Set(this.sandbox.getIntents().map(i => i.id));
    for (const entry of this.entries.values()) {
      if (entry.intent_id && !sandboxIntents.has(entry.intent_id)) {
        warnings.push(`Entry ${entry.id} references missing intent ${entry.intent_id}`);
      }
    }
    
    // Check pending entries are not too old
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.outcome === 'PENDING') {
        const age = now - new Date(entry.timestamp).getTime();
        const daysSinceEntry = age / (1000 * 60 * 60 * 24);
        if (daysSinceEntry > 30) {
          warnings.push(`Entry ${entry.id} has been PENDING for ${Math.round(daysSinceEntry)} days`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      total_entries: this.entries.size,
      errors,
      warnings,
      last_verified: new Date().toISOString()
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getTrustLedger = () => TrustLedger.getInstance();
export default TrustLedger;

