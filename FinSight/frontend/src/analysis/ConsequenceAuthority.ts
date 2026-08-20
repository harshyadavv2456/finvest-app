/**
 * ConsequenceAuthority - Mandatory Consequence Tracking
 * 
 * PHASE 20: Consequence Engine (HARD ENFORCEMENT)
 * 
 * RULES (NON-NEGOTIABLE):
 * - Every DecisionSnapshot MUST have consequence tracking
 * - MUST include: Baseline (do nothing), FinVest recommendation, User action
 * - NO escape from consequence view
 * - ShadowExecution MUST feed into ConsequenceEngine
 * - All consequences are auditable
 */

import { DecisionSnapshot, DecisionSnapshotManager } from '../core/DecisionSnapshot';
import { ConsequenceEngine, ConsequenceAnalysis, ScenarioOutcome } from './ConsequenceEngine';
import { ShadowOrder, ShadowExecutionEngine } from '../execution/ShadowExecution';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { PriceData } from '../core/DecisionContext';

// =============================================================================
// TYPES
// =============================================================================

export interface MandatoryConsequence {
  snapshot_id: string;
  snapshot_created_at: string;
  consequence_id: string | null;
  consequence_created_at: string | null;
  
  // Three scenarios (MANDATORY)
  baseline: ScenarioOutcome | null;        // Do nothing
  finvest_recommendation: ScenarioOutcome | null;  // FinVest advice
  user_action: ScenarioOutcome | null;     // What user actually did
  
  // Computed values
  regret_index: number;           // 0-100
  who_was_right: 'FINVEST' | 'USER' | 'TIE' | 'BOTH_WRONG' | 'PENDING';
  verdict: string;
  
  // Status
  status: 'PENDING' | 'COMPLETE' | 'INSUFFICIENT_DATA';
  missing_data: string[];
}

export interface ConsequenceGate {
  allowed: boolean;
  reason: string;
  consequence: MandatoryConsequence | null;
}

// =============================================================================
// CONSEQUENCE AUTHORITY
// =============================================================================

/**
 * ConsequenceAuthority
 * 
 * Ensures EVERY decision has consequence tracking.
 * No decision can escape consequence view.
 */
export class ConsequenceAuthority {
  private static instance: ConsequenceAuthority;
  private snapshotManager: DecisionSnapshotManager;
  private consequenceEngine: ConsequenceEngine;
  private shadowEngine: ShadowExecutionEngine;
  private auditLog: DecisionAuditLog;
  
  // Track which snapshots have consequences
  private snapshotConsequences: Map<string, string> = new Map(); // snapshot_id -> consequence_id
  
  private constructor() {
    this.snapshotManager = DecisionSnapshotManager.getInstance();
    this.consequenceEngine = ConsequenceEngine.getInstance();
    this.shadowEngine = ShadowExecutionEngine.getInstance();
    this.auditLog = DecisionAuditLog.getInstance();
    
    this.loadFromStorage();
  }
  
  public static getInstance(): ConsequenceAuthority {
    if (!ConsequenceAuthority.instance) {
      ConsequenceAuthority.instance = new ConsequenceAuthority();
    }
    return ConsequenceAuthority.instance;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_snapshot_consequences');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [key, value] of Object.entries(parsed)) {
          this.snapshotConsequences.set(key, value as string);
        }
      }
    } catch (e) {
      console.error('Failed to load consequence mappings:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const toStore: Record<string, string> = {};
      for (const [key, value] of this.snapshotConsequences) {
        toStore[key] = value;
      }
      localStorage.setItem('finvest_snapshot_consequences', JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save consequence mappings:', e);
    }
  }
  
  // ===========================================================================
  // MANDATORY CONSEQUENCE CREATION
  // ===========================================================================
  
  /**
   * Create consequence from shadow execution
   * MANDATORY - called automatically when shadow execution completes
   */
  createConsequenceFromShadow(
    shadowOrder: ShadowOrder,
    currentPrice: number,
    taxRate: number = 0.15
  ): ConsequenceAnalysis | null {
    // Get the snapshot for this shadow order
    const snapshotId = shadowOrder.decision_context_id;
    
    // Create consequence analysis
    const analysis = this.consequenceEngine.analyzeFromShadowExecution(
      shadowOrder,
      currentPrice,
      taxRate
    );
    
    // Map snapshot to consequence
    this.snapshotConsequences.set(snapshotId, analysis.id);
    this.saveToStorage();
    
    // Log
    this.auditLog.log({
      event_type: 'TAX_CALCULATION',
      severity: 'INFO',
      summary: `Consequence created for shadow ${shadowOrder.id}`,
      details: {
        shadow_order_id: shadowOrder.id,
        consequence_id: analysis.id,
        snapshot_id: snapshotId,
        who_was_right: analysis.who_was_right,
        regret_index: analysis.regret_index
      },
      actor: 'ENGINE'
    });
    
    return analysis;
  }
  
  /**
   * Create consequence from decision snapshot
   * MANDATORY for all snapshots with user actions
   */
  createConsequenceFromSnapshot(
    snapshot: DecisionSnapshot,
    currentPrices: Map<string, PriceData>,
    userActions: Map<string, { action: string; quantity: number; price: number }>,
    taxRate: number = 0.15
  ): ConsequenceAnalysis[] {
    const analyses = this.consequenceEngine.analyzeFromSnapshot(
      snapshot,
      currentPrices,
      userActions,
      taxRate
    );
    
    // Map snapshot to first consequence
    if (analyses.length > 0) {
      this.snapshotConsequences.set(snapshot.id, analyses[0].id);
      this.saveToStorage();
    }
    
    return analyses;
  }
  
  // ===========================================================================
  // CONSEQUENCE GATE - Check before displaying decisions
  // ===========================================================================
  
  /**
   * Check if consequence is available for a snapshot
   * Used to show/block consequence view
   */
  checkConsequenceGate(snapshotId: string): ConsequenceGate {
    // Get snapshot
    const snapshot = this.snapshotManager.getSnapshot(snapshotId);
    if (!snapshot) {
      return {
        allowed: false,
        reason: `Snapshot ${snapshotId} not found`,
        consequence: null
      };
    }
    
    // Get consequence
    const consequenceId = this.snapshotConsequences.get(snapshotId);
    const consequence = consequenceId 
      ? this.consequenceEngine.getAnalysis(consequenceId)
      : null;
    
    // Build mandatory consequence structure
    const mandatoryConsequence = this.buildMandatoryConsequence(snapshot, consequence);
    
    return {
      allowed: true,
      reason: mandatoryConsequence.status === 'COMPLETE' 
        ? 'Full consequence analysis available'
        : `Consequence ${mandatoryConsequence.status}: ${mandatoryConsequence.missing_data.join(', ')}`,
      consequence: mandatoryConsequence
    };
  }
  
  /**
   * Get mandatory consequence for a snapshot
   */
  getMandatoryConsequence(snapshotId: string): MandatoryConsequence | null {
    const gate = this.checkConsequenceGate(snapshotId);
    return gate.consequence;
  }
  
  /**
   * Get all snapshots missing consequences
   */
  getSnapshotsWithoutConsequences(): DecisionSnapshot[] {
    const allSnapshots = this.snapshotManager.getRecentSnapshots(100);
    return allSnapshots.filter(s => !this.snapshotConsequences.has(s.id));
  }
  
  /**
   * Get consequence stats
   */
  getStats(): {
    total_snapshots: number;
    with_consequences: number;
    without_consequences: number;
    finvest_wins: number;
    user_wins: number;
    ties: number;
    average_regret: number;
  } {
    const consequenceStats = this.consequenceEngine.getStats();
    const allSnapshots = this.snapshotManager.getRecentSnapshots(100);
    
    return {
      total_snapshots: allSnapshots.length,
      with_consequences: this.snapshotConsequences.size,
      without_consequences: allSnapshots.length - this.snapshotConsequences.size,
      finvest_wins: consequenceStats.finvest_wins,
      user_wins: consequenceStats.user_wins,
      ties: consequenceStats.ties,
      average_regret: consequenceStats.average_regret
    };
  }
  
  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  
  private buildMandatoryConsequence(
    snapshot: DecisionSnapshot,
    consequence: ConsequenceAnalysis | null
  ): MandatoryConsequence {
    const missingData: string[] = [];
    
    // Check what's missing
    if (!consequence) {
      missingData.push('No consequence analysis yet');
    } else {
      if (!consequence.do_nothing.final_value) {
        missingData.push('Baseline outcome incomplete');
      }
      if (!consequence.follow_finvest.final_value) {
        missingData.push('FinVest outcome incomplete');
      }
      if (!consequence.user_actual.final_value) {
        missingData.push('User action outcome incomplete');
      }
    }
    
    const status = !consequence 
      ? 'PENDING' 
      : missingData.length > 0 
        ? 'INSUFFICIENT_DATA' 
        : 'COMPLETE';
    
    return {
      snapshot_id: snapshot.id,
      snapshot_created_at: snapshot.created_at,
      consequence_id: consequence?.id || null,
      consequence_created_at: consequence?.created_at || null,
      baseline: consequence?.do_nothing || null,
      finvest_recommendation: consequence?.follow_finvest || null,
      user_action: consequence?.user_actual || null,
      regret_index: consequence?.regret_index || 0,
      who_was_right: consequence?.who_was_right || 'PENDING',
      verdict: consequence?.verdict_explanation || 'Consequence analysis pending',
      status,
      missing_data: missingData
    };
  }
}

// Export singleton getter
export const getConsequenceAuthority = () => ConsequenceAuthority.getInstance();

export default ConsequenceAuthority;

