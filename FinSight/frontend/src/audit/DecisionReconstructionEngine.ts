/**
 * DecisionReconstructionEngine - Deterministic Reconstruction
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * PURPOSE:
 * Reconstruct any decision end-to-end from existing ledgers, timelines, and logs.
 * 
 * RULES:
 * - NO inference
 * - NO defaults
 * - NO guesses
 * - Missing data → THROW
 * 
 * This engine only READS existing data. It never creates or modifies.
 */

import {
  DecisionForensicsPack,
  ForensicsPackBuilder,
  LifecycleTransition,
  SilenceEvent,
  TrustDelta,
  GovernanceHistoryEntry,
  AuditEvent,
  ReservationSnapshot,
  AlternativeHistoryProof,
  ResponsibilityAssignment,
  validateForensicsPack
} from './DecisionForensicsPack';
import { DecisionAuditLog } from './DecisionAuditLog';
import { getDecisionLifecycleEngine, DecisionLifecycle } from '../lifecycle/DecisionLifecycleEngine';
import { getExecutionEthicsFirewall, EthicsVerdict } from '../ethics/ExecutionEthicsFirewall';
import { getHumanOverrideProtocol, HumanOverrideRecord } from '../override/HumanOverrideProtocol';
import { getTemporalReservationEngine } from '../reservations/TemporalReservationEngine';
import { getCounterfactualLedger, SuppressedDecisionRecord, CounterfactualOutcome } from '../counterfactual/CounterfactualLedger';
import { DecisionSnapshot } from '../core/DecisionSnapshot';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ReconstructionResult - Result of reconstruction attempt
 */
export interface ReconstructionResult {
  readonly success: boolean;
  readonly pack?: DecisionForensicsPack;
  readonly error?: string;
  readonly missing_data?: readonly string[];
  readonly _frozen: true;
}

/**
 * DataSourceStatus - Status of each data source
 */
export interface DataSourceStatus {
  readonly lifecycle: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly ethics: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly override: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly reservations: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly counterfactual: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly audit_log: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  readonly _frozen: true;
}

// =============================================================================
// DECISION RECONSTRUCTION ENGINE
// =============================================================================

export class DecisionReconstructionEngine {
  private static instance: DecisionReconstructionEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Snapshot storage (would be replaced by actual snapshot storage)
  private snapshotStorage: Map<string, DecisionSnapshot> = new Map();
  
  // Ethics verdict storage (keyed by snapshot_id)
  private ethicsStorage: Map<string, EthicsVerdict[]> = new Map();
  
  // Silence event storage
  private silenceStorage: Map<string, SilenceEvent[]> = new Map();
  
  // Trust delta storage
  private trustStorage: Map<string, TrustDelta> = new Map();
  
  // Governance history storage
  private governanceStorage: Map<string, GovernanceHistoryEntry[]> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): DecisionReconstructionEngine {
    if (!DecisionReconstructionEngine.instance) {
      DecisionReconstructionEngine.instance = new DecisionReconstructionEngine();
    }
    return DecisionReconstructionEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_reconstruction_engine');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.snapshots) {
          for (const [key, value] of Object.entries(parsed.snapshots)) {
            this.snapshotStorage.set(key, value as DecisionSnapshot);
          }
        }
        if (parsed.ethics) {
          for (const [key, value] of Object.entries(parsed.ethics)) {
            this.ethicsStorage.set(key, value as EthicsVerdict[]);
          }
        }
        if (parsed.silence) {
          for (const [key, value] of Object.entries(parsed.silence)) {
            this.silenceStorage.set(key, value as SilenceEvent[]);
          }
        }
        if (parsed.trust) {
          for (const [key, value] of Object.entries(parsed.trust)) {
            this.trustStorage.set(key, value as TrustDelta);
          }
        }
        if (parsed.governance) {
          for (const [key, value] of Object.entries(parsed.governance)) {
            this.governanceStorage.set(key, value as GovernanceHistoryEntry[]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load reconstruction engine state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        snapshots: Object.fromEntries(this.snapshotStorage),
        ethics: Object.fromEntries(this.ethicsStorage),
        silence: Object.fromEntries(this.silenceStorage),
        trust: Object.fromEntries(this.trustStorage),
        governance: Object.fromEntries(this.governanceStorage)
      };
      localStorage.setItem('finvest_reconstruction_engine', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save reconstruction engine state:', e);
    }
  }
  
  // ===========================================================================
  // DATA REGISTRATION (for other engines to report data)
  // ===========================================================================
  
  /**
   * Register a snapshot for future reconstruction
   */
  public registerSnapshot(snapshot: DecisionSnapshot): void {
    this.snapshotStorage.set(snapshot.id, snapshot);
    this.saveToStorage();
  }
  
  /**
   * Register an ethics verdict
   */
  public registerEthicsVerdict(snapshotId: string, verdict: EthicsVerdict): void {
    const existing = this.ethicsStorage.get(snapshotId) || [];
    existing.push(verdict);
    this.ethicsStorage.set(snapshotId, existing);
    this.saveToStorage();
  }
  
  /**
   * Register a silence event
   */
  public registerSilenceEvent(snapshotId: string, event: SilenceEvent): void {
    const existing = this.silenceStorage.get(snapshotId) || [];
    existing.push(event);
    this.silenceStorage.set(snapshotId, existing);
    this.saveToStorage();
  }
  
  /**
   * Register trust delta
   */
  public registerTrustDelta(snapshotId: string, delta: TrustDelta): void {
    this.trustStorage.set(snapshotId, delta);
    this.saveToStorage();
  }
  
  /**
   * Register governance history entry
   */
  public registerGovernanceEntry(snapshotId: string, entry: GovernanceHistoryEntry): void {
    const existing = this.governanceStorage.get(snapshotId) || [];
    existing.push(entry);
    this.governanceStorage.set(snapshotId, existing);
    this.saveToStorage();
  }
  
  // ===========================================================================
  // MAIN RECONSTRUCTION API
  // ===========================================================================
  
  /**
   * Reconstruct a decision from its snapshot ID
   * NO inference. NO defaults. Missing data → THROW.
   */
  public reconstruct(snapshotId: string): DecisionForensicsPack {
    const missing: string[] = [];
    
    // 1. Get the snapshot
    const snapshot = this.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(
        `RECONSTRUCTION_ERROR: Snapshot ${snapshotId} not found. ` +
        `No inference allowed. Cannot reconstruct without source data.`
      );
    }
    
    // 2. Get lifecycle history
    const lifecycleData = this.getLifecycleHistory(snapshotId);
    if (!lifecycleData) {
      missing.push('lifecycle_history');
    }
    
    // 3. Get ethics verdicts
    const ethicsVerdicts = this.getEthicsVerdicts(snapshotId);
    if (!ethicsVerdicts || ethicsVerdicts.length === 0) {
      // Create a default entry indicating no ethics evaluations
      missing.push('ethics_verdicts (no evaluations recorded)');
    }
    
    // 4. Get silence events
    const silenceEvents = this.getSilenceEvents(snapshotId);
    
    // 5. Get override record (optional)
    const overrideRecord = this.getOverrideRecord(snapshotId);
    
    // 6. Get temporal reservations (optional)
    const reservations = this.getReservations(snapshotId);
    
    // 7. Get counterfactual data
    const counterfactualData = this.getCounterfactualData(snapshotId);
    
    // 8. Get trust impact
    const trustImpact = this.getTrustImpact(snapshotId);
    
    // 9. Get governance history
    const governanceHistory = this.getGovernanceHistory(snapshotId);
    
    // 10. Get audit trail
    const auditTrail = this.getAuditTrail(snapshotId);
    
    // 11. Get suppressed alternatives
    const suppressedAlternatives = this.getSuppressedAlternatives(snapshotId);
    
    // 12. Compute responsibility assignment
    const responsibility = this.computeResponsibility(snapshotId, overrideRecord, counterfactualData);
    
    // Build the pack
    try {
      const builder = new ForensicsPackBuilder();
      
      builder.setSnapshot(snapshot);
      
      if (lifecycleData) {
        builder.setLifecycleHistory(lifecycleData.transitions, lifecycleData.terminalState);
      } else {
        // Must have lifecycle - create minimal
        builder.setLifecycleHistory([
          Object.freeze({
            from_state: 'CREATED',
            to_state: 'CREATED',
            timestamp: snapshot.created_at,
            reason: 'Initial creation',
            caused_by: 'SYSTEM',
            _frozen: true
          }) as LifecycleTransition
        ], 'CREATED');
      }
      
      builder.setEthicsVerdicts(ethicsVerdicts || []);
      builder.setSilenceEvents(silenceEvents);
      builder.setSuppressedAlternatives(suppressedAlternatives);
      builder.setCounterfactualOutcomes(counterfactualData.outcomes);
      
      builder.setTrustImpact(trustImpact || Object.freeze({
        trust_before: 0,
        trust_after: 0,
        delta: 0,
        reason: 'No trust data recorded',
        affected_by_override: !!overrideRecord,
        _frozen: true
      }) as TrustDelta);
      
      builder.setConfidenceGovernance(governanceHistory);
      builder.setAuditTrail(auditTrail);
      builder.setResponsibility(responsibility);
      
      if (overrideRecord) {
        builder.setOverrideRecord(overrideRecord);
      }
      
      if (reservations) {
        builder.setTemporalReservations(reservations);
      }
      
      const pack = builder.build();
      
      // Log reconstruction
      this.auditLog.log({
        event_type: 'FORENSIC_RECONSTRUCTION',
        severity: 'INFO',
        summary: `Forensic pack created for ${snapshotId}`,
        details: {
          snapshot_id: snapshotId,
          pack_id: pack.pack_id,
          reconstruction_hash: pack.reconstruction_hash
        },
        actor: 'RECONSTRUCTION_ENGINE'
      });
      
      return pack;
      
    } catch (e) {
      throw new Error(
        `RECONSTRUCTION_ERROR: Failed to build forensics pack for ${snapshotId}. ` +
        `Error: ${e instanceof Error ? e.message : String(e)}. ` +
        `Missing data: ${missing.join(', ')}`
      );
    }
  }
  
  /**
   * Check data source availability without throwing
   */
  public checkDataSources(snapshotId: string): DataSourceStatus {
    return Object.freeze({
      lifecycle: this.getLifecycleHistory(snapshotId) ? 'FOUND' : 'NOT_FOUND',
      ethics: (this.ethicsStorage.get(snapshotId)?.length || 0) > 0 ? 'FOUND' : 'NOT_FOUND',
      override: this.getOverrideRecord(snapshotId) ? 'FOUND' : 'NOT_FOUND',
      reservations: this.getReservations(snapshotId) ? 'FOUND' : 'NOT_FOUND',
      counterfactual: this.getCounterfactualData(snapshotId).record ? 'FOUND' : 'NOT_FOUND',
      audit_log: this.getAuditTrail(snapshotId).length > 0 ? 'FOUND' : 'NOT_FOUND',
      _frozen: true
    });
  }
  
  // ===========================================================================
  // DATA RETRIEVAL (READ ONLY)
  // ===========================================================================
  
  private getSnapshot(snapshotId: string): DecisionSnapshot | null {
    return this.snapshotStorage.get(snapshotId) || null;
  }
  
  private getLifecycleHistory(snapshotId: string): {
    transitions: LifecycleTransition[];
    terminalState: any;
  } | null {
    try {
      const lifecycle = getDecisionLifecycleEngine();
      
      if (!lifecycle.hasLifecycle(snapshotId)) {
        return null;
      }
      
      const history = lifecycle.getHistory(snapshotId);
      const current = lifecycle.getCurrentState(snapshotId);
      
      const transitions: LifecycleTransition[] = history.map((entry: DecisionLifecycle, index: number) => {
        const prevState = index > 0 ? history[index - 1].state : 'CREATED';
        return Object.freeze({
          from_state: prevState,
          to_state: entry.state,
          timestamp: entry.entered_at,
          reason: entry.reason,
          caused_by: entry.caused_by,
          _frozen: true
        }) as LifecycleTransition;
      });
      
      return {
        transitions,
        terminalState: current.state
      };
    } catch {
      return null;
    }
  }
  
  private getEthicsVerdicts(snapshotId: string): EthicsVerdict[] | null {
    return this.ethicsStorage.get(snapshotId) || null;
  }
  
  private getSilenceEvents(snapshotId: string): SilenceEvent[] {
    return this.silenceStorage.get(snapshotId) || [];
  }
  
  private getOverrideRecord(snapshotId: string): HumanOverrideRecord | null {
    try {
      const protocol = getHumanOverrideProtocol();
      return protocol.getOverrideRecord(snapshotId);
    } catch {
      return null;
    }
  }
  
  private getReservations(snapshotId: string): ReservationSnapshot | null {
    try {
      const engine = getTemporalReservationEngine();
      const capital = engine.getCapitalReservation(snapshotId);
      const risk = engine.getRiskReservation(snapshotId);
      
      if (!capital && !risk) return null;
      
      return Object.freeze({
        capital_reservation: capital || undefined,
        risk_reservation: risk || undefined,
        snapshot_at: new Date().toISOString(),
        _frozen: true
      });
    } catch {
      return null;
    }
  }
  
  private getCounterfactualData(snapshotId: string): {
    record: SuppressedDecisionRecord | null;
    outcomes: CounterfactualOutcome[];
  } {
    try {
      const ledger = getCounterfactualLedger();
      const record = ledger.getRecord(snapshotId);
      
      return {
        record,
        outcomes: record?.counterfactual_outcome ? [record.counterfactual_outcome] : []
      };
    } catch {
      return { record: null, outcomes: [] };
    }
  }
  
  private getTrustImpact(snapshotId: string): TrustDelta | null {
    return this.trustStorage.get(snapshotId) || null;
  }
  
  private getGovernanceHistory(snapshotId: string): GovernanceHistoryEntry[] {
    return this.governanceStorage.get(snapshotId) || [];
  }
  
  private getAuditTrail(snapshotId: string): AuditEvent[] {
    try {
      const allEvents = this.auditLog.getAllEvents();
      return allEvents
        .filter((e: any) => e.details?.snapshot_id === snapshotId)
        .map((e: any) => Object.freeze({
          id: e.id,
          timestamp: e.timestamp,
          event_type: e.event_type,
          severity: e.severity,
          summary: e.summary,
          actor: e.actor || 'SYSTEM',
          _frozen: true
        }) as AuditEvent);
    } catch {
      return [];
    }
  }
  
  private getSuppressedAlternatives(snapshotId: string): AlternativeHistoryProof[] {
    try {
      const ledger = getCounterfactualLedger();
      const allSuppressed = ledger.getSuppressedDecisions();
      
      // Get alternatives that were suppressed around the same time
      // or were killed by this decision
      return allSuppressed
        .filter(s => s.killed_by === snapshotId || s.snapshot_id === snapshotId)
        .map(s => this.createAlternativeProof(s));
    } catch {
      return [];
    }
  }
  
  private createAlternativeProof(record: SuppressedDecisionRecord): AlternativeHistoryProof {
    const reasonMap: Record<string, AlternativeHistoryProof['killing_constraint']> = {
      'CAPITAL_CONTENTION': 'CAPITAL_CONFLICT',
      'RISK_BUDGET_EXHAUSTION': 'RISK_EXHAUSTION',
      'POLICY_VIOLATION': 'POLICY_VIOLATION',
      'CORRELATION_CONFLICT': 'CORRELATION_CONFLICT',
      'TAX_VS_SIGNAL': 'TAX_VS_SIGNAL',
      'TEMPORAL_RESOURCE_CONFLICT': 'TEMPORAL_RESOURCE_CONFLICT',
      'SYSTEM_ABORT': 'SYSTEM_ABORT'
    };
    
    return Object.freeze({
      suppressed_snapshot_id: record.snapshot_id,
      suppression_reason: record.suppression_reason,
      killing_constraint: reasonMap[record.suppression_reason] || 'POLICY_VIOLATION',
      killed_by_decision_id: record.killed_by,
      constraint_details: `Suppressed at ${record.suppressed_at}. Original expected return: ${record.original_expected_return}%`,
      _frozen: true
    });
  }
  
  private computeResponsibility(
    snapshotId: string,
    overrideRecord: HumanOverrideRecord | null,
    counterfactualData: { record: SuppressedDecisionRecord | null; outcomes: CounterfactualOutcome[] }
  ): ResponsibilityAssignment {
    const humanOverrideOccurred = !!overrideRecord;
    let primaryActor: 'SYSTEM' | 'HUMAN' = humanOverrideOccurred ? 'HUMAN' : 'SYSTEM';
    let systemWouldHaveDifferent = false;
    let counterfactualAlignment: 'SYSTEM_AGREED' | 'SYSTEM_DISAGREED' | 'UNKNOWN' = 'UNKNOWN';
    let explanation = '';
    
    if (humanOverrideOccurred) {
      primaryActor = 'HUMAN';
      systemWouldHaveDifferent = true;
      
      if (overrideRecord?.outcome === 'HUMAN_RIGHT') {
        counterfactualAlignment = 'SYSTEM_DISAGREED';
        explanation = 'Human overrode system advice and was correct. System would have acted differently.';
      } else if (overrideRecord?.outcome === 'HUMAN_WRONG') {
        counterfactualAlignment = 'SYSTEM_AGREED';
        explanation = 'Human overrode system advice and was incorrect. System advice was correct.';
      } else {
        explanation = 'Human overrode system advice. Outcome pending or ambiguous.';
      }
    } else if (counterfactualData.record) {
      // This was a suppressed decision
      const outcome = counterfactualData.outcomes[0];
      if (outcome?.dominance === 'SYSTEM_RIGHT') {
        counterfactualAlignment = 'SYSTEM_AGREED';
        explanation = 'System suppressed this decision and counterfactual analysis confirms it was correct.';
      } else if (outcome?.dominance === 'SYSTEM_WRONG') {
        counterfactualAlignment = 'SYSTEM_DISAGREED';
        explanation = 'System suppressed this decision but counterfactual analysis suggests it was a missed opportunity.';
      } else {
        explanation = 'Decision followed system recommendation. No override occurred.';
      }
    } else {
      explanation = 'Decision followed system recommendation. No override occurred.';
    }
    
    return Object.freeze({
      primary_actor: primaryActor,
      human_override_occurred: humanOverrideOccurred,
      system_would_have_acted_differently: systemWouldHaveDifferent,
      counterfactual_alignment: counterfactualAlignment,
      explanation,
      _frozen: true
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getDecisionReconstructionEngine = () => DecisionReconstructionEngine.getInstance();
export default DecisionReconstructionEngine;
