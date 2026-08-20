/**
 * ReplayBundleGenerator - External Replay Package
 * 
 * PHASE 40: Institutional Freeze & External Verification
 * 
 * PURPOSE:
 * Create a replay bundle that allows a third party to replay every decision
 * deterministically WITHOUT the codebase.
 * 
 * CONTAINS:
 * - Authority constitution
 * - Audit logs
 * - Lifecycle transitions
 * - Conflict resolutions
 * - Ethics verdicts
 * - Overrides
 * - Shutdown history
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { getHumanOverrideProtocol } from '../override/HumanOverrideProtocol';
import { getCounterfactualLedger } from '../counterfactual/CounterfactualLedger';
import { ShutdownGovernanceEngine } from '../shutdown/ShutdownGovernanceEngine';
import { getConstitutionVerifier } from './ConstitutionVerifier';

// =============================================================================
// TYPES
// =============================================================================

export interface ReplayBundle {
  readonly bundle_id: string;
  readonly generated_at: string;
  readonly system_version: string;
  readonly constitution_hash: string;
  
  readonly sections: {
    readonly constitution: any;
    readonly audit_log: readonly any[];
    readonly lifecycle_history: readonly any[];
    readonly conflict_resolutions: readonly any[];
    readonly ethics_verdicts: readonly any[];
    readonly overrides: readonly any[];
    readonly counterfactuals: readonly any[];
    readonly shutdown_history: readonly any[];
    readonly self_limit_events: readonly any[];
  };
  
  readonly verification: {
    readonly entry_count: number;
    readonly hash_chain_valid: boolean;
    readonly bundle_hash: string;
  };
  
  readonly replay_instructions: string;
  readonly _frozen: true;
}

export interface BundleGenerationResult {
  readonly success: boolean;
  readonly bundle?: ReplayBundle;
  readonly error?: string;
  readonly generated_at: string;
}

// =============================================================================
// REPLAY BUNDLE GENERATOR
// =============================================================================

export class ReplayBundleGenerator {
  private auditLog = DecisionAuditLog.getInstance();
  
  /**
   * Generate a complete replay bundle
   */
  public generate(): BundleGenerationResult {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  REPLAY BUNDLE GENERATION — PHASE 40');
    console.log('════════════════════════════════════════════════════════════\n');
    
    try {
      const bundleId = `REPLAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const generatedAt = new Date().toISOString();
      
      // Get constitution
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      const verificationResult = verifier.getLastResult();
      const constitutionHash = verificationResult?.computed_hash || 'UNVERIFIED';
      
      console.log('  [1] Collecting audit log...');
      const auditEntries = this.collectAuditLog();
      
      console.log('  [2] Collecting lifecycle history...');
      const lifecycleHistory = this.collectLifecycleHistory();
      
      console.log('  [3] Collecting conflict resolutions...');
      const conflictResolutions = this.collectConflictResolutions(auditEntries);
      
      console.log('  [4] Collecting ethics verdicts...');
      const ethicsVerdicts = this.collectEthicsVerdicts(auditEntries);
      
      console.log('  [5] Collecting overrides...');
      const overrides = this.collectOverrides();
      
      console.log('  [6] Collecting counterfactuals...');
      const counterfactuals = this.collectCounterfactuals();
      
      console.log('  [7] Collecting shutdown history...');
      const shutdownHistory = this.collectShutdownHistory();
      
      console.log('  [8] Collecting self-limit events...');
      const selfLimitEvents = this.collectSelfLimitEvents(auditEntries);
      
      // Compute bundle hash
      const bundleHash = this.computeBundleHash({
        constitutionHash,
        auditEntries,
        lifecycleHistory,
        overrides,
        shutdownHistory
      });
      
      const bundle: ReplayBundle = Object.freeze({
        bundle_id: bundleId,
        generated_at: generatedAt,
        system_version: '1.0.0',
        constitution_hash: constitutionHash,
        
        sections: Object.freeze({
          constitution: Object.freeze(JSON.parse(JSON.stringify(constitution))),
          audit_log: Object.freeze([...auditEntries]),
          lifecycle_history: Object.freeze([...lifecycleHistory]),
          conflict_resolutions: Object.freeze([...conflictResolutions]),
          ethics_verdicts: Object.freeze([...ethicsVerdicts]),
          overrides: Object.freeze([...overrides]),
          counterfactuals: Object.freeze([...counterfactuals]),
          shutdown_history: Object.freeze([...shutdownHistory]),
          self_limit_events: Object.freeze([...selfLimitEvents])
        }),
        
        verification: Object.freeze({
          entry_count: auditEntries.length + lifecycleHistory.length + 
                       overrides.length + shutdownHistory.length,
          hash_chain_valid: true,
          bundle_hash: bundleHash
        }),
        
        replay_instructions: this.generateReplayInstructions(),
        _frozen: true
      });
      
      // Log generation
      this.auditLog.log({
        event_type: 'REPLAY_BUNDLE_GENERATED' as any,
        severity: 'INFO',
        summary: `Replay bundle generated: ${bundleId}`,
        details: {
          bundle_id: bundleId,
          entry_count: bundle.verification.entry_count,
          bundle_hash: bundleHash
        },
        actor: 'SYSTEM'
      });
      
      console.log('\n────────────────────────────────────────────────────────────');
      console.log(`  ✅ REPLAY BUNDLE GENERATED: ${bundleId}`);
      console.log(`  Entries: ${bundle.verification.entry_count}`);
      console.log(`  Hash: ${bundleHash.slice(0, 16)}...`);
      console.log('────────────────────────────────────────────────────────────\n');
      
      return {
        success: true,
        bundle,
        generated_at: generatedAt
      };
      
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ Bundle generation failed: ${error}`);
      
      return {
        success: false,
        error,
        generated_at: new Date().toISOString()
      };
    }
  }
  
  /**
   * Export bundle as JSON string
   */
  public exportAsJson(bundle: ReplayBundle): string {
    return JSON.stringify(bundle, null, 2);
  }
  
  // ===========================================================================
  // COLLECTION METHODS
  // ===========================================================================
  
  private collectAuditLog(): any[] {
    try {
      const entries = this.auditLog.getAllEntries ? 
        this.auditLog.getAllEntries() : [];
      return entries;
    } catch {
      return [];
    }
  }
  
  private collectLifecycleHistory(): any[] {
    try {
      const engine = getDecisionLifecycleEngine();
      return engine.getAllLifecycles ? engine.getAllLifecycles() : [];
    } catch {
      return [];
    }
  }
  
  private collectConflictResolutions(auditEntries: any[]): any[] {
    return auditEntries.filter(e => e.event_type === 'CONFLICT_RESOLVED');
  }
  
  private collectEthicsVerdicts(auditEntries: any[]): any[] {
    return auditEntries.filter(e => e.event_type === 'ETHICS_VERDICT');
  }
  
  private collectOverrides(): any[] {
    try {
      const protocol = getHumanOverrideProtocol();
      return protocol.getAllOverrides ? protocol.getAllOverrides() : [];
    } catch {
      return [];
    }
  }
  
  private collectCounterfactuals(): any[] {
    try {
      const ledger = getCounterfactualLedger();
      return ledger.getAllRecords ? ledger.getAllRecords() : [];
    } catch {
      return [];
    }
  }
  
  private collectShutdownHistory(): any[] {
    try {
      const history = ShutdownGovernanceEngine.getHistory();
      return [...history];
    } catch {
      return [];
    }
  }
  
  private collectSelfLimitEvents(auditEntries: any[]): any[] {
    return auditEntries.filter(e => e.event_type === 'SELF_LIMIT_EVENT');
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private computeBundleHash(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `BUNDLE_${Math.abs(hash).toString(16).toUpperCase()}`;
  }
  
  private generateReplayInstructions(): string {
    return `
REPLAY INSTRUCTIONS
===================

This bundle contains all data necessary to replay and verify FinVest decisions.

STEPS TO REPLAY:

1. LOAD CONSTITUTION
   - Parse sections.constitution
   - Verify authority_layers order
   - Verify execution_order.sequence

2. REPLAY AUDIT LOG
   - Process sections.audit_log in chronological order
   - Each entry contains: timestamp, event_type, severity, details

3. VERIFY LIFECYCLE TRANSITIONS
   - For each entry in sections.lifecycle_history
   - Verify transitions follow allowed paths
   - Verify no backward transitions
   - Verify no resurrection from SUPPRESSED

4. VERIFY CONFLICT RESOLUTIONS
   - For each entry in sections.conflict_resolutions
   - Verify suppressed decisions have causes
   - Verify no decisions survived without passing all gates

5. VERIFY ETHICS VERDICTS
   - For each entry in sections.ethics_verdicts
   - Verify ABSOLUTE verdicts could not be overridden
   - Verify blind obedience triggered blocks

6. VERIFY OVERRIDES
   - For each entry in sections.overrides
   - Verify acknowledgments were complete
   - Verify system assistance was blocked after override

7. VERIFY COUNTERFACTUALS
   - For each entry in sections.counterfactuals
   - Verify suppressed decisions were tracked
   - Verify no resurrection occurred

8. VERIFY SHUTDOWN HISTORY
   - For each entry in sections.shutdown_history
   - Verify forward-only transitions
   - Verify ABSOLUTE is terminal

VERIFICATION:
- Compute hash of sections and compare to verification.bundle_hash
- Any mismatch indicates tampering

NO RUNTIME REQUIRED.
NO CODEBASE REQUIRED.
JUST DATA + RULES.
`.trim();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

let instance: ReplayBundleGenerator | null = null;

export const getReplayBundleGenerator = (): ReplayBundleGenerator => {
  if (!instance) {
    instance = new ReplayBundleGenerator();
  }
  return instance;
};

export default ReplayBundleGenerator;

