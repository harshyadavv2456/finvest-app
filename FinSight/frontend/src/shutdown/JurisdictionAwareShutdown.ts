/**
 * JurisdictionAwareShutdown - External Authority Domain Support
 * 
 * PHASE 40: Institutional Freeze & External Verification
 * 
 * PURPOSE:
 * Extend shutdown to support external authority domains (Court, Regulator, Auditor).
 * Each invocation must be signed, logged, and irreversible with jurisdiction metadata.
 */

import { ShutdownGovernanceEngine, ShutdownTrigger, ShutdownRecord } from './ShutdownGovernanceEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export type ShutdownInvoker =
  | 'SYSTEM'
  | 'OWNER'
  | 'COURT'
  | 'REGULATOR'
  | 'AUDITOR';

export interface JurisdictionMetadata {
  readonly invoker: ShutdownInvoker;
  readonly authority_type: 'INTERNAL' | 'CONTRACTUAL' | 'STATUTORY' | 'JUDICIAL';
  readonly jurisdiction?: string;
  readonly case_reference?: string;
  readonly legal_basis?: string;
  readonly effective_date: string;
  readonly _frozen: true;
}

export interface JurisdictionInvocation {
  readonly invoker: ShutdownInvoker;
  readonly reason: string;
  readonly signature: string;
  readonly jurisdiction?: string;
  readonly case_reference?: string;
  readonly legal_basis?: string;
}

export interface JurisdictionShutdownRecord extends ShutdownRecord {
  readonly jurisdiction_metadata: JurisdictionMetadata;
}

// =============================================================================
// INVOKER PERMISSIONS
// =============================================================================

const INVOKER_PERMISSIONS: Record<ShutdownInvoker, {
  authority_type: 'INTERNAL' | 'CONTRACTUAL' | 'STATUTORY' | 'JUDICIAL';
  can_invoke: readonly ('SOFT_SHUTDOWN' | 'HARD_SHUTDOWN' | 'ABSOLUTE_SHUTDOWN')[];
  requires_signature: boolean;
  requires_jurisdiction: boolean;
}> = {
  'SYSTEM': {
    authority_type: 'INTERNAL',
    can_invoke: ['SOFT_SHUTDOWN', 'HARD_SHUTDOWN', 'ABSOLUTE_SHUTDOWN'],
    requires_signature: false,
    requires_jurisdiction: false
  },
  'OWNER': {
    authority_type: 'CONTRACTUAL',
    can_invoke: ['SOFT_SHUTDOWN', 'HARD_SHUTDOWN', 'ABSOLUTE_SHUTDOWN'],
    requires_signature: true,
    requires_jurisdiction: false
  },
  'REGULATOR': {
    authority_type: 'STATUTORY',
    can_invoke: ['ABSOLUTE_SHUTDOWN'],
    requires_signature: true,
    requires_jurisdiction: true
  },
  'COURT': {
    authority_type: 'JUDICIAL',
    can_invoke: ['ABSOLUTE_SHUTDOWN'],
    requires_signature: true,
    requires_jurisdiction: true
  },
  'AUDITOR': {
    authority_type: 'CONTRACTUAL',
    can_invoke: [],
    requires_signature: true,
    requires_jurisdiction: false
  }
};

// =============================================================================
// JURISDICTION-AWARE SHUTDOWN
// =============================================================================

class JurisdictionAwareShutdownClass {
  private static instance: JurisdictionAwareShutdownClass;
  private auditLog = DecisionAuditLog.getInstance();
  private invocationHistory: JurisdictionShutdownRecord[] = [];
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): JurisdictionAwareShutdownClass {
    if (!JurisdictionAwareShutdownClass.instance) {
      JurisdictionAwareShutdownClass.instance = new JurisdictionAwareShutdownClass();
    }
    return JurisdictionAwareShutdownClass.instance;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_jurisdiction_history');
      if (stored) {
        this.invocationHistory = JSON.parse(stored);
      }
    } catch {}
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('finvest_jurisdiction_history', JSON.stringify(this.invocationHistory));
    } catch {}
  }
  
  /**
   * Invoke shutdown with jurisdiction metadata
   */
  public invokeShutdown(invocation: JurisdictionInvocation): JurisdictionShutdownRecord {
    const permissions = INVOKER_PERMISSIONS[invocation.invoker];
    
    // Validate invoker exists
    if (!permissions) {
      throw new Error(`JURISDICTION_ERROR: Unknown invoker "${invocation.invoker}"`);
    }
    
    // Validate signature requirement
    if (permissions.requires_signature && (!invocation.signature || invocation.signature.length < 10)) {
      throw new Error(`JURISDICTION_ERROR: ${invocation.invoker} requires valid signature`);
    }
    
    // Validate jurisdiction requirement
    if (permissions.requires_jurisdiction && !invocation.jurisdiction) {
      throw new Error(`JURISDICTION_ERROR: ${invocation.invoker} requires jurisdiction metadata`);
    }
    
    // Determine trigger type
    let trigger: ShutdownTrigger;
    switch (invocation.invoker) {
      case 'COURT':
        trigger = 'COURT_ORDER';
        break;
      case 'REGULATOR':
        trigger = 'REGULATOR_INVOCATION';
        break;
      case 'OWNER':
        trigger = 'OWNER_INVOCATION';
        break;
      default:
        trigger = 'MANUAL_SHUTDOWN';
    }
    
    // Create jurisdiction metadata
    const jurisdictionMetadata: JurisdictionMetadata = Object.freeze({
      invoker: invocation.invoker,
      authority_type: permissions.authority_type,
      jurisdiction: invocation.jurisdiction,
      case_reference: invocation.case_reference,
      legal_basis: invocation.legal_basis,
      effective_date: new Date().toISOString(),
      _frozen: true
    });
    
    // Execute shutdown via main engine
    let baseRecord: ShutdownRecord;
    
    if (invocation.invoker === 'COURT' || invocation.invoker === 'REGULATOR') {
      // COURT and REGULATOR always trigger ABSOLUTE
      baseRecord = ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger,
        triggeredBy: invocation.invoker,
        reason: invocation.reason,
        signature: invocation.signature
      });
    } else {
      baseRecord = ShutdownGovernanceEngine.initiateShutdown({
        trigger,
        triggeredBy: invocation.invoker,
        reason: invocation.reason,
        signature: invocation.signature
      });
    }
    
    // Create extended record with jurisdiction
    const record: JurisdictionShutdownRecord = Object.freeze({
      ...baseRecord,
      jurisdiction_metadata: jurisdictionMetadata
    }) as JurisdictionShutdownRecord;
    
    // Store in history
    this.invocationHistory.push(record);
    this.saveToStorage();
    
    // Log the invocation
    this.auditLog.log({
      event_type: 'JURISDICTION_SHUTDOWN' as any,
      severity: 'CRITICAL',
      summary: `${invocation.invoker} invoked shutdown: ${baseRecord.new_mode}`,
      details: {
        invoker: invocation.invoker,
        authority_type: permissions.authority_type,
        jurisdiction: invocation.jurisdiction,
        case_reference: invocation.case_reference,
        mode: baseRecord.new_mode
      },
      actor: invocation.invoker
    });
    
    return record;
  }
  
  /**
   * Get invoker permissions
   */
  public getInvokerPermissions(invoker: ShutdownInvoker): typeof INVOKER_PERMISSIONS[ShutdownInvoker] | null {
    return INVOKER_PERMISSIONS[invoker] || null;
  }
  
  /**
   * Get all invocation history
   */
  public getInvocationHistory(): readonly JurisdictionShutdownRecord[] {
    return Object.freeze([...this.invocationHistory]);
  }
  
  /**
   * Check if invoker can trigger specific mode
   */
  public canInvokerTrigger(invoker: ShutdownInvoker, mode: 'SOFT_SHUTDOWN' | 'HARD_SHUTDOWN' | 'ABSOLUTE_SHUTDOWN'): boolean {
    const permissions = INVOKER_PERMISSIONS[invoker];
    return permissions ? permissions.can_invoke.includes(mode) : false;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const JurisdictionAwareShutdown = JurisdictionAwareShutdownClass.getInstance();

Object.freeze(JurisdictionAwareShutdown);

export const getJurisdictionAwareShutdown = () => JurisdictionAwareShutdown;

export default JurisdictionAwareShutdown;

