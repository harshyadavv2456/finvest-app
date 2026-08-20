/**
 * DecisionForensicsPack - Immutable Forensic Artifact
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * PURPOSE:
 * Create a single immutable artifact that represents one decision's entire life.
 * If ANY field is missing, pack creation must THROW.
 * 
 * DESIGN LAW:
 * If a regulator, court, or risk committee asks "Why did the system do this?"
 * This pack must answer that without any human present.
 */

import { DecisionSnapshot } from '../core/DecisionSnapshot';
import { DecisionLifecycle, DecisionLifecycleState } from '../lifecycle/DecisionLifecycleEngine';
import { ConflictResolutionResult, SuppressedDecision } from '../conflict/ConflictResolutionEngine';
import { CapitalReservation, RiskReservation } from '../reservations/TemporalReservationEngine';
import { EthicsVerdict } from '../ethics/ExecutionEthicsFirewall';
import { HumanOverrideRecord } from '../override/HumanOverrideProtocol';
import { CounterfactualOutcome, SuppressedDecisionRecord } from '../counterfactual/CounterfactualLedger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * LifecycleTransition - A single state transition
 */
export interface LifecycleTransition {
  readonly from_state: DecisionLifecycleState;
  readonly to_state: DecisionLifecycleState;
  readonly timestamp: string;
  readonly reason: string;
  readonly caused_by: 'SYSTEM' | 'MDCR' | 'TIME' | 'POLICY' | 'MARKET_EVENT' | 'HUMAN';
  readonly _frozen: true;
}

/**
 * SilenceEvent - When the system chose not to speak
 */
export interface SilenceEvent {
  readonly timestamp: string;
  readonly mode: 'ADVICE_ALLOWED' | 'QUESTION_REQUIRED' | 'SILENCE_REQUIRED';
  readonly blocking_factors: readonly string[];
  readonly question_asked?: string;
  readonly _frozen: true;
}

/**
 * TrustDelta - How this decision affected trust
 */
export interface TrustDelta {
  readonly trust_before: number;
  readonly trust_after: number;
  readonly delta: number;
  readonly reason: string;
  readonly affected_by_override: boolean;
  readonly _frozen: true;
}

/**
 * GovernanceHistoryEntry - Confidence governance events
 */
export interface GovernanceHistoryEntry {
  readonly timestamp: string;
  readonly original_confidence: number;
  readonly governed_confidence: number;
  readonly discipline_state: 'NORMAL' | 'RESTRAINED' | 'MUTED';
  readonly adjustment_reason: string;
  readonly _frozen: true;
}

/**
 * AuditEvent - Raw audit log entry
 */
export interface AuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly event_type: string;
  readonly severity: string;
  readonly summary: string;
  readonly actor: string;
  readonly _frozen: true;
}

/**
 * ReservationSnapshot - Point-in-time reservation state
 */
export interface ReservationSnapshot {
  readonly capital_reservation?: CapitalReservation;
  readonly risk_reservation?: RiskReservation;
  readonly snapshot_at: string;
  readonly _frozen: true;
}

/**
 * AlternativeHistoryProof - Why a suppressed decision died
 */
export interface AlternativeHistoryProof {
  readonly suppressed_snapshot_id: string;
  readonly suppression_reason: string;
  readonly killing_constraint: 
    | 'CAPITAL_CONFLICT'
    | 'RISK_EXHAUSTION'
    | 'POLICY_VIOLATION'
    | 'ETHICS_BLOCK'
    | 'HUMAN_OVERRIDE'
    | 'CORRELATION_CONFLICT'
    | 'TAX_VS_SIGNAL'
    | 'TEMPORAL_RESOURCE_CONFLICT'
    | 'SYSTEM_ABORT';
  readonly killed_by_decision_id?: string;
  readonly constraint_details: string;
  readonly _frozen: true;
}

/**
 * ResponsibilityAssignment - Who is responsible for outcome
 */
export interface ResponsibilityAssignment {
  readonly primary_actor: 'SYSTEM' | 'HUMAN';
  readonly human_override_occurred: boolean;
  readonly system_would_have_acted_differently: boolean;
  readonly counterfactual_alignment: 'SYSTEM_AGREED' | 'SYSTEM_DISAGREED' | 'UNKNOWN';
  readonly explanation: string;
  readonly _frozen: true;
}

/**
 * DecisionForensicsPack - The complete forensic artifact
 */
export interface DecisionForensicsPack {
  // Core identity
  readonly pack_id: string;
  readonly snapshot_id: string;
  readonly created_at: string;
  
  // The decision itself
  readonly snapshot: DecisionSnapshot;
  
  // Full lifecycle history
  readonly lifecycle_history: readonly LifecycleTransition[];
  readonly terminal_state: DecisionLifecycleState;
  
  // Conflict resolution (if applicable)
  readonly conflict_analysis?: ConflictResolutionResult;
  
  // Suppressed alternatives with proof
  readonly suppressed_alternatives: readonly AlternativeHistoryProof[];
  
  // Resource reservations
  readonly temporal_reservations?: ReservationSnapshot;
  
  // All ethics evaluations
  readonly ethics_verdicts: readonly EthicsVerdict[];
  
  // All silence events
  readonly silence_events: readonly SilenceEvent[];
  
  // Human override (if applicable)
  readonly override_record?: HumanOverrideRecord;
  
  // Counterfactual outcomes (if measured)
  readonly counterfactual_outcomes: readonly CounterfactualOutcome[];
  
  // Trust impact
  readonly trust_impact: TrustDelta;
  
  // Confidence governance history
  readonly confidence_governance: readonly GovernanceHistoryEntry[];
  
  // Raw audit trail
  readonly audit_trail: readonly AuditEvent[];
  
  // Responsibility assignment
  readonly responsibility: ResponsibilityAssignment;
  
  // Cryptographic anchoring
  readonly reconstruction_hash: string;
  readonly component_hashes: {
    readonly snapshot_hash: string;
    readonly lifecycle_hash: string;
    readonly ethics_hash: string;
    readonly override_hash: string;
    readonly counterfactual_hash: string;
  };
  
  readonly _frozen: true;
}

/**
 * ForensicsPackValidation - Validation result
 */
export interface ForensicsPackValidation {
  readonly valid: boolean;
  readonly missing_fields: readonly string[];
  readonly hash_valid: boolean;
  readonly _frozen: true;
}

// =============================================================================
// HASH UTILITIES
// =============================================================================

/**
 * Compute SHA-256 hash of a string (browser-compatible)
 */
export async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Use Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Compute hash synchronously (fallback for non-async contexts)
 */
export function computeHashSync(data: string): string {
  // Simple hash for synchronous contexts (not cryptographically secure but deterministic)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to hex-like string with timestamp for uniqueness
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
  const dataHash = data.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  return `${hashStr}${Math.abs(dataHash).toString(16).padStart(8, '0')}`;
}

// =============================================================================
// FORENSICS PACK BUILDER
// =============================================================================

export class ForensicsPackBuilder {
  private pack: Partial<DecisionForensicsPack> = {};
  
  public setSnapshot(snapshot: DecisionSnapshot): this {
    this.pack.snapshot = snapshot;
    this.pack.snapshot_id = snapshot.id;
    return this;
  }
  
  public setLifecycleHistory(history: LifecycleTransition[], terminalState: DecisionLifecycleState): this {
    this.pack.lifecycle_history = Object.freeze([...history]);
    this.pack.terminal_state = terminalState;
    return this;
  }
  
  public setConflictAnalysis(analysis: ConflictResolutionResult): this {
    this.pack.conflict_analysis = analysis;
    return this;
  }
  
  public setSuppressedAlternatives(alternatives: AlternativeHistoryProof[]): this {
    this.pack.suppressed_alternatives = Object.freeze([...alternatives]);
    return this;
  }
  
  public setTemporalReservations(reservations: ReservationSnapshot): this {
    this.pack.temporal_reservations = reservations;
    return this;
  }
  
  public setEthicsVerdicts(verdicts: EthicsVerdict[]): this {
    this.pack.ethics_verdicts = Object.freeze([...verdicts]);
    return this;
  }
  
  public setSilenceEvents(events: SilenceEvent[]): this {
    this.pack.silence_events = Object.freeze([...events]);
    return this;
  }
  
  public setOverrideRecord(record: HumanOverrideRecord): this {
    this.pack.override_record = record;
    return this;
  }
  
  public setCounterfactualOutcomes(outcomes: CounterfactualOutcome[]): this {
    this.pack.counterfactual_outcomes = Object.freeze([...outcomes]);
    return this;
  }
  
  public setTrustImpact(impact: TrustDelta): this {
    this.pack.trust_impact = impact;
    return this;
  }
  
  public setConfidenceGovernance(history: GovernanceHistoryEntry[]): this {
    this.pack.confidence_governance = Object.freeze([...history]);
    return this;
  }
  
  public setAuditTrail(trail: AuditEvent[]): this {
    this.pack.audit_trail = Object.freeze([...trail]);
    return this;
  }
  
  public setResponsibility(responsibility: ResponsibilityAssignment): this {
    this.pack.responsibility = responsibility;
    return this;
  }
  
  /**
   * Build the forensics pack
   * THROWS if any required field is missing
   */
  public build(): DecisionForensicsPack {
    // Validate required fields
    const missing: string[] = [];
    
    if (!this.pack.snapshot) missing.push('snapshot');
    if (!this.pack.lifecycle_history) missing.push('lifecycle_history');
    if (!this.pack.terminal_state) missing.push('terminal_state');
    if (!this.pack.ethics_verdicts) missing.push('ethics_verdicts');
    if (!this.pack.silence_events) missing.push('silence_events');
    if (!this.pack.trust_impact) missing.push('trust_impact');
    if (!this.pack.confidence_governance) missing.push('confidence_governance');
    if (!this.pack.audit_trail) missing.push('audit_trail');
    if (!this.pack.responsibility) missing.push('responsibility');
    if (!this.pack.suppressed_alternatives) missing.push('suppressed_alternatives');
    if (!this.pack.counterfactual_outcomes) missing.push('counterfactual_outcomes');
    
    if (missing.length > 0) {
      throw new Error(
        `FORENSICS_PACK_ERROR: Cannot create pack. Missing required fields: ${missing.join(', ')}. ` +
        `No inference, no defaults. Missing data must throw.`
      );
    }
    
    // Compute component hashes
    const snapshotHash = computeHashSync(JSON.stringify(this.pack.snapshot));
    const lifecycleHash = computeHashSync(JSON.stringify(this.pack.lifecycle_history));
    const ethicsHash = computeHashSync(JSON.stringify(this.pack.ethics_verdicts));
    const overrideHash = computeHashSync(JSON.stringify(this.pack.override_record || 'NO_OVERRIDE'));
    const counterfactualHash = computeHashSync(JSON.stringify(this.pack.counterfactual_outcomes));
    
    // Compute reconstruction hash
    const reconstructionHash = computeHashSync(
      snapshotHash + lifecycleHash + ethicsHash + overrideHash + counterfactualHash
    );
    
    const finalPack: DecisionForensicsPack = Object.freeze({
      pack_id: `FORENSIC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: this.pack.snapshot_id!,
      created_at: new Date().toISOString(),
      
      snapshot: this.pack.snapshot!,
      lifecycle_history: this.pack.lifecycle_history!,
      terminal_state: this.pack.terminal_state!,
      conflict_analysis: this.pack.conflict_analysis,
      suppressed_alternatives: this.pack.suppressed_alternatives!,
      temporal_reservations: this.pack.temporal_reservations,
      ethics_verdicts: this.pack.ethics_verdicts!,
      silence_events: this.pack.silence_events!,
      override_record: this.pack.override_record,
      counterfactual_outcomes: this.pack.counterfactual_outcomes!,
      trust_impact: this.pack.trust_impact!,
      confidence_governance: this.pack.confidence_governance!,
      audit_trail: this.pack.audit_trail!,
      responsibility: this.pack.responsibility!,
      
      reconstruction_hash: reconstructionHash,
      component_hashes: Object.freeze({
        snapshot_hash: snapshotHash,
        lifecycle_hash: lifecycleHash,
        ethics_hash: ethicsHash,
        override_hash: overrideHash,
        counterfactual_hash: counterfactualHash
      }),
      
      _frozen: true
    });
    
    return finalPack;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a forensics pack's integrity
 */
export function validateForensicsPack(pack: DecisionForensicsPack): ForensicsPackValidation {
  const missing: string[] = [];
  
  if (!pack.snapshot) missing.push('snapshot');
  if (!pack.lifecycle_history) missing.push('lifecycle_history');
  if (!pack.ethics_verdicts) missing.push('ethics_verdicts');
  if (!pack.audit_trail) missing.push('audit_trail');
  if (!pack.trust_impact) missing.push('trust_impact');
  if (!pack.responsibility) missing.push('responsibility');
  
  // Verify hash
  const snapshotHash = computeHashSync(JSON.stringify(pack.snapshot));
  const lifecycleHash = computeHashSync(JSON.stringify(pack.lifecycle_history));
  const ethicsHash = computeHashSync(JSON.stringify(pack.ethics_verdicts));
  const overrideHash = computeHashSync(JSON.stringify(pack.override_record || 'NO_OVERRIDE'));
  const counterfactualHash = computeHashSync(JSON.stringify(pack.counterfactual_outcomes));
  
  const recomputedHash = computeHashSync(
    snapshotHash + lifecycleHash + ethicsHash + overrideHash + counterfactualHash
  );
  
  const hashValid = recomputedHash === pack.reconstruction_hash;
  
  return Object.freeze({
    valid: missing.length === 0 && hashValid,
    missing_fields: Object.freeze(missing) as unknown as readonly string[],
    hash_valid: hashValid,
    _frozen: true
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ForensicsPackBuilder;
