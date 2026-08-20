/**
 * HumanOverrideProtocol - Controlled Dissent
 * 
 * PHASE 35: Human Override Protocol (HOP)
 * 
 * PURPOSE:
 * Allow humans to override system refusal - but at a cost.
 * Override is not correction. Override is assumption of responsibility.
 * 
 * DESIGN LAWS:
 * - The system may be wrong. The human may be right.
 * - But responsibility cannot be shared.
 * - If the human overrides, the system steps away forever.
 * 
 * HARD RULES:
 * - Override is irreversible
 * - Override burns trust (never earns it)
 * - No system assistance after override
 * - Full accountability recorded permanently
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { EthicsVerdict, EthicsVerdictSeverity } from '../ethics/ExecutionEthicsFirewall';
import { getDecisionLifecycleEngine, DecisionLifecycleState } from '../lifecycle/DecisionLifecycleEngine';

// =============================================================================
// TYPES
// =============================================================================

/**
 * HumanAction - What the human chose to do
 */
export type HumanAction = 'EXECUTE' | 'IGNORE' | 'CUSTOM_ACTION';

/**
 * OverrideOutcome - What happened after override
 */
export type OverrideOutcome = 'HUMAN_RIGHT' | 'HUMAN_WRONG' | 'AMBIGUOUS' | 'PENDING';

/**
 * AcknowledgedRisk - Risks the human must acknowledge
 */
export type AcknowledgedRisk = 
  | 'RISK_OF_LOSS'
  | 'TAX_IMPACT'
  | 'OPPORTUNITY_COST'
  | 'SYSTEM_DISAGREEMENT'
  | 'NO_SYSTEM_ASSISTANCE'
  | 'IRREVERSIBLE_ACTION';

/**
 * HumanOverrideRecord - Permanent record of override
 */
export interface HumanOverrideRecord {
  readonly override_id: string;
  readonly snapshot_id: string;
  readonly original_verdict: EthicsVerdict;
  readonly human_action: HumanAction;
  readonly human_rationale: string;
  readonly acknowledged_risks: readonly AcknowledgedRisk[];
  readonly confirmation_text: string;
  readonly timestamp: string;
  readonly outcome: OverrideOutcome;
  readonly outcome_measured_at?: string;
  readonly outcome_details?: string;
  readonly irreversible: true;
  readonly _frozen: true;
}

/**
 * OverrideRequest - What the human must provide
 */
export interface OverrideRequest {
  readonly snapshot_id: string;
  readonly original_verdict: EthicsVerdict;
  readonly human_action: HumanAction;
  readonly human_rationale: string;
  readonly acknowledged_risks: readonly AcknowledgedRisk[];
  readonly confirmation_text: string;
}

/**
 * OverrideResult - Result of override attempt
 */
export interface OverrideResult {
  readonly success: boolean;
  readonly record?: HumanOverrideRecord;
  readonly error?: string;
  readonly _frozen: true;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const REQUIRED_CONFIRMATION = 'I acknowledge that I am acting against system advice';
const MIN_RATIONALE_LENGTH = 20;

const REQUIRED_ACKNOWLEDGEMENTS: readonly AcknowledgedRisk[] = Object.freeze([
  'RISK_OF_LOSS',
  'TAX_IMPACT',
  'OPPORTUNITY_COST',
  'SYSTEM_DISAGREEMENT',
  'NO_SYSTEM_ASSISTANCE',
  'IRREVERSIBLE_ACTION'
]);

// =============================================================================
// HUMAN OVERRIDE PROTOCOL
// =============================================================================

export class HumanOverrideProtocol {
  private static instance: HumanOverrideProtocol;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Override records (append-only)
  private overrides: Map<string, HumanOverrideRecord> = new Map();
  
  // Override count per user (for ethics tightening)
  private overrideCount: number = 0;
  
  // Snapshots that have been overridden (for silence enforcement)
  private overriddenSnapshots: Set<string> = new Set();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): HumanOverrideProtocol {
    if (!HumanOverrideProtocol.instance) {
      HumanOverrideProtocol.instance = new HumanOverrideProtocol();
    }
    return HumanOverrideProtocol.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_override_protocol');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.overrides) {
          for (const [key, value] of Object.entries(parsed.overrides)) {
            this.overrides.set(key, Object.freeze(value as HumanOverrideRecord));
          }
        }
        if (parsed.overrideCount) {
          this.overrideCount = parsed.overrideCount;
        }
        if (parsed.overriddenSnapshots) {
          this.overriddenSnapshots = new Set(parsed.overriddenSnapshots);
        }
      }
    } catch (e) {
      console.error('Failed to load override protocol state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        overrides: Object.fromEntries(this.overrides),
        overrideCount: this.overrideCount,
        overriddenSnapshots: Array.from(this.overriddenSnapshots)
      };
      localStorage.setItem('finvest_override_protocol', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save override protocol state:', e);
    }
  }
  
  // ===========================================================================
  // CORE OVERRIDE API
  // ===========================================================================
  
  /**
   * Execute a human override
   * This is the SOLE entry point for override
   * THROWS on any precondition failure
   */
  public executeOverride(request: OverrideRequest): OverrideResult {
    try {
      // 1. Validate all preconditions
      this.validatePreconditions(request);
      
      // 2. Validate acknowledgements
      this.validateAcknowledgements(request);
      
      // 3. Create the override record
      const record = this.createOverrideRecord(request);
      
      // 4. Update lifecycle
      this.updateLifecycle(request.snapshot_id);
      
      // 5. Store the override
      this.overrides.set(request.snapshot_id, record);
      this.overriddenSnapshots.add(request.snapshot_id);
      this.overrideCount++;
      this.saveToStorage();
      
      // 6. Audit log (CRITICAL severity)
      this.logOverride(record);
      
      return Object.freeze({
        success: true,
        record,
        _frozen: true
      });
      
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      
      this.auditLog.log({
        event_type: 'OVERRIDE_BLOCKED' as any,
        severity: 'WARNING',
        summary: `Override attempt blocked: ${error}`,
        details: {
          snapshot_id: request.snapshot_id,
          reason: error
        },
        actor: 'OVERRIDE_PROTOCOL'
      });
      
      return Object.freeze({
        success: false,
        error,
        _frozen: true
      });
    }
  }
  
  /**
   * Record the outcome of an override
   * Called after time has passed and outcome is known
   */
  public recordOutcome(
    snapshotId: string,
    outcome: OverrideOutcome,
    details: string
  ): void {
    const existing = this.overrides.get(snapshotId);
    
    if (!existing) {
      throw new Error(
        `OVERRIDE_ERROR: No override found for ${snapshotId}`
      );
    }
    
    if (existing.outcome !== 'PENDING') {
      throw new Error(
        `OVERRIDE_ERROR: Outcome already recorded for ${snapshotId}`
      );
    }
    
    // Create updated record (still immutable)
    const updated: HumanOverrideRecord = Object.freeze({
      ...existing,
      outcome,
      outcome_measured_at: new Date().toISOString(),
      outcome_details: details,
      _frozen: true
    });
    
    this.overrides.set(snapshotId, updated);
    this.saveToStorage();
    
    // Log outcome
    this.auditLog.log({
      event_type: 'OVERRIDE_OUTCOME' as any,
      severity: outcome === 'HUMAN_WRONG' ? 'WARNING' : 'INFO',
      summary: `Override outcome: ${outcome}`,
      details: {
        snapshot_id: snapshotId,
        outcome,
        details
      },
      actor: 'OVERRIDE_PROTOCOL'
    });
  }
  
  // ===========================================================================
  // PRECONDITION VALIDATION
  // ===========================================================================
  
  private validatePreconditions(request: OverrideRequest): void {
    const verdict = request.original_verdict;
    
    // 1. Ethics verdict must be a refusal
    if (verdict.allowed === true) {
      throw new Error(
        'OVERRIDE_BLOCKED: System did not refuse. Override not applicable.'
      );
    }
    
    // 2. Severity must NOT be ABSOLUTE
    if (verdict.severity === 'ABSOLUTE') {
      throw new Error(
        'OVERRIDE_BLOCKED: ABSOLUTE severity cannot be overridden. ' +
        'This is a permanent ethical block that no human can bypass.'
      );
    }
    
    // 3. Check lifecycle state
    try {
      const lifecycle = getDecisionLifecycleEngine();
      if (lifecycle.hasLifecycle(request.snapshot_id)) {
        const state = lifecycle.getCurrentState(request.snapshot_id);
        if (state.state !== 'ACTIVE') {
          throw new Error(
            `OVERRIDE_BLOCKED: Snapshot is in state ${state.state}. ` +
            `Only ACTIVE decisions can be overridden.`
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('OVERRIDE_BLOCKED')) {
        throw e;
      }
      // Lifecycle may not exist - allow override but log
    }
    
    // 4. Check if already overridden
    if (this.overriddenSnapshots.has(request.snapshot_id)) {
      throw new Error(
        'OVERRIDE_BLOCKED: This decision has already been overridden. ' +
        'Overrides are irreversible and cannot be repeated.'
      );
    }
  }
  
  private validateAcknowledgements(request: OverrideRequest): void {
    // 1. Confirmation text must match exactly
    if (request.confirmation_text !== REQUIRED_CONFIRMATION) {
      throw new Error(
        `OVERRIDE_BLOCKED: Confirmation text must be exactly: ` +
        `"${REQUIRED_CONFIRMATION}"`
      );
    }
    
    // 2. Rationale must be at least MIN_RATIONALE_LENGTH characters
    if (!request.human_rationale || request.human_rationale.length < MIN_RATIONALE_LENGTH) {
      throw new Error(
        `OVERRIDE_BLOCKED: Rationale must be at least ${MIN_RATIONALE_LENGTH} characters. ` +
        `You provided ${request.human_rationale?.length || 0} characters.`
      );
    }
    
    // 3. All required risks must be acknowledged
    for (const required of REQUIRED_ACKNOWLEDGEMENTS) {
      if (!request.acknowledged_risks.includes(required)) {
        throw new Error(
          `OVERRIDE_BLOCKED: Missing required acknowledgement: ${required}. ` +
          `All risks must be explicitly acknowledged.`
        );
      }
    }
  }
  
  // ===========================================================================
  // RECORD CREATION
  // ===========================================================================
  
  private createOverrideRecord(request: OverrideRequest): HumanOverrideRecord {
    return Object.freeze({
      override_id: `OVERRIDE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snapshot_id: request.snapshot_id,
      original_verdict: request.original_verdict,
      human_action: request.human_action,
      human_rationale: request.human_rationale,
      acknowledged_risks: Object.freeze([...request.acknowledged_risks]),
      confirmation_text: request.confirmation_text,
      timestamp: new Date().toISOString(),
      outcome: 'PENDING' as OverrideOutcome,
      irreversible: true as const,
      _frozen: true as const
    });
  }
  
  // ===========================================================================
  // LIFECYCLE UPDATE
  // ===========================================================================
  
  private updateLifecycle(snapshotId: string): void {
    try {
      const lifecycle = getDecisionLifecycleEngine();
      
      if (lifecycle.hasLifecycle(snapshotId)) {
        const current = lifecycle.getCurrentState(snapshotId);
        
        // Transition: ACTIVE → EXECUTED_SHADOW → HISTORICAL_ONLY
        if (current.state === 'ACTIVE') {
          lifecycle.transition(
            snapshotId,
            'ACTIVE',
            'EXECUTED_SHADOW',
            'Human override executed',
            'SYSTEM'
          );
          
          // Then to HISTORICAL_ONLY
          lifecycle.transition(
            snapshotId,
            'EXECUTED_SHADOW',
            'HISTORICAL_ONLY',
            'Override complete - archived',
            'SYSTEM'
          );
        }
      }
    } catch (e) {
      // Log but don't fail - lifecycle is secondary
      console.error('Failed to update lifecycle after override:', e);
    }
  }
  
  // ===========================================================================
  // AUDIT LOGGING
  // ===========================================================================
  
  private logOverride(record: HumanOverrideRecord): void {
    this.auditLog.log({
      event_type: 'HUMAN_OVERRIDE' as any,
      severity: 'CRITICAL',
      summary: `HUMAN OVERRIDE: ${record.snapshot_id}`,
      details: {
        override_id: record.override_id,
        snapshot_id: record.snapshot_id,
        original_verdict_severity: record.original_verdict.severity,
        original_violated_principles: record.original_verdict.violated_principles,
        human_action: record.human_action,
        human_rationale: record.human_rationale,
        acknowledged_risks: record.acknowledged_risks,
        timestamp: record.timestamp
      },
      actor: 'HUMAN'
    });
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Check if a snapshot has been overridden
   */
  public isOverridden(snapshotId: string): boolean {
    return this.overriddenSnapshots.has(snapshotId);
  }
  
  /**
   * Get override record for a snapshot
   */
  public getOverrideRecord(snapshotId: string): HumanOverrideRecord | null {
    return this.overrides.get(snapshotId) || null;
  }
  
  /**
   * Get all override records
   */
  public getAllOverrides(): HumanOverrideRecord[] {
    return Array.from(this.overrides.values());
  }
  
  /**
   * Get total override count
   */
  public getOverrideCount(): number {
    return this.overrideCount;
  }
  
  /**
   * Get override statistics for ethics tightening
   */
  public getOverrideStatistics(): {
    total_overrides: number;
    human_right_count: number;
    human_wrong_count: number;
    pending_count: number;
    override_penalty: number; // For ethics
  } {
    let humanRight = 0;
    let humanWrong = 0;
    let pending = 0;
    
    for (const record of this.overrides.values()) {
      switch (record.outcome) {
        case 'HUMAN_RIGHT':
          humanRight++;
          break;
        case 'HUMAN_WRONG':
          humanWrong++;
          break;
        case 'PENDING':
        case 'AMBIGUOUS':
          pending++;
          break;
      }
    }
    
    // Override penalty: wrongs count double, rights give NO benefit
    const overridePenalty = (humanWrong * 2) + (pending * 0.5);
    
    return {
      total_overrides: this.overrideCount,
      human_right_count: humanRight,
      human_wrong_count: humanWrong,
      pending_count: pending,
      override_penalty: overridePenalty
    };
  }
  
  /**
   * Get required confirmation text
   */
  public getRequiredConfirmation(): string {
    return REQUIRED_CONFIRMATION;
  }
  
  /**
   * Get required acknowledgements
   */
  public getRequiredAcknowledgements(): readonly AcknowledgedRisk[] {
    return REQUIRED_ACKNOWLEDGEMENTS;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getHumanOverrideProtocol = () => HumanOverrideProtocol.getInstance();
export default HumanOverrideProtocol;

