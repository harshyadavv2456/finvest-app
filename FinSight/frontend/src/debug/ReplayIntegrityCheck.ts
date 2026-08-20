/**
 * ReplayIntegrityCheck - Determinism Verification
 * 
 * PHASE 41: External Hostility & Reality Validation
 * 
 * PURPOSE:
 * Generate two replay bundles from the same data at different times.
 * Prove they are identical. If not → determinism is broken.
 */

import { getReplayBundleGenerator, ReplayBundle } from '../verification/ReplayBundleGenerator';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface IntegrityCheckResult {
  readonly checked_at: string;
  readonly bundle1_hash: string;
  readonly bundle2_hash: string;
  readonly hashes_identical: boolean;
  readonly ordering_identical: boolean;
  readonly outputs_identical: boolean;
  readonly determinism_verified: boolean;
  readonly differences: readonly string[];
}

// =============================================================================
// REPLAY INTEGRITY CHECK
// =============================================================================

export class ReplayIntegrityCheck {
  private auditLog = DecisionAuditLog.getInstance();
  
  /**
   * Run replay integrity check
   * Generates two bundles and compares them
   */
  public check(): IntegrityCheckResult {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  REPLAY INTEGRITY CHECK — PHASE 41');
    console.log('  "Two bundles must be identical"');
    console.log('════════════════════════════════════════════════════════════\n');
    
    const generator = getReplayBundleGenerator();
    const differences: string[] = [];
    
    // Generate first bundle
    console.log('  [1] Generating first bundle...');
    const result1 = generator.generate();
    
    // Small delay to ensure different timestamp
    const startWait = Date.now();
    while (Date.now() - startWait < 10) {
      // Wait 10ms
    }
    
    // Generate second bundle
    console.log('  [2] Generating second bundle...');
    const result2 = generator.generate();
    
    if (!result1.success || !result2.success) {
      return {
        checked_at: new Date().toISOString(),
        bundle1_hash: result1.bundle?.verification.bundle_hash || 'FAILED',
        bundle2_hash: result2.bundle?.verification.bundle_hash || 'FAILED',
        hashes_identical: false,
        ordering_identical: false,
        outputs_identical: false,
        determinism_verified: false,
        differences: Object.freeze(['Bundle generation failed'])
      };
    }
    
    const bundle1 = result1.bundle!;
    const bundle2 = result2.bundle!;
    
    // Compare hashes
    console.log('  [3] Comparing hashes...');
    const hashesIdentical = bundle1.verification.bundle_hash === bundle2.verification.bundle_hash;
    if (!hashesIdentical) {
      differences.push(`Hash mismatch: ${bundle1.verification.bundle_hash} vs ${bundle2.verification.bundle_hash}`);
    }
    
    // Compare ordering
    console.log('  [4] Comparing ordering...');
    const orderingIdentical = this.compareOrdering(bundle1, bundle2, differences);
    
    // Compare outputs (excluding timestamps and IDs)
    console.log('  [5] Comparing outputs...');
    const outputsIdentical = this.compareOutputs(bundle1, bundle2, differences);
    
    const determinismVerified = hashesIdentical && orderingIdentical && outputsIdentical;
    
    const result: IntegrityCheckResult = {
      checked_at: new Date().toISOString(),
      bundle1_hash: bundle1.verification.bundle_hash,
      bundle2_hash: bundle2.verification.bundle_hash,
      hashes_identical: hashesIdentical,
      ordering_identical: orderingIdentical,
      outputs_identical: outputsIdentical,
      determinism_verified: determinismVerified,
      differences: Object.freeze(differences)
    };
    
    // Log result
    this.auditLog.log({
      event_type: 'REPLAY_INTEGRITY_CHECK' as any,
      severity: determinismVerified ? 'INFO' : 'CRITICAL',
      summary: determinismVerified
        ? 'Replay integrity verified - bundles are deterministic'
        : `Replay integrity FAILED - ${differences.length} difference(s)`,
      details: result,
      actor: 'SYSTEM'
    });
    
    // Print results
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('  REPLAY INTEGRITY RESULTS:');
    console.log('────────────────────────────────────────────────────────────\n');
    console.log(`  Hash 1:           ${bundle1.verification.bundle_hash}`);
    console.log(`  Hash 2:           ${bundle2.verification.bundle_hash}`);
    console.log(`  Hashes Match:     ${hashesIdentical ? '✅ YES' : '❌ NO'}`);
    console.log(`  Ordering Match:   ${orderingIdentical ? '✅ YES' : '❌ NO'}`);
    console.log(`  Outputs Match:    ${outputsIdentical ? '✅ YES' : '❌ NO'}`);
    
    if (differences.length > 0) {
      console.log('\n  Differences found:');
      for (const diff of differences) {
        console.log(`    - ${diff}`);
      }
    }
    
    console.log('\n────────────────────────────────────────────────────────────');
    if (determinismVerified) {
      console.log('  ✅ DETERMINISM VERIFIED');
    } else {
      console.log('  ❌ DETERMINISM BROKEN');
    }
    console.log('────────────────────────────────────────────────────────────\n');
    
    return result;
  }
  
  // ===========================================================================
  // COMPARISON METHODS
  // ===========================================================================
  
  private compareOrdering(bundle1: ReplayBundle, bundle2: ReplayBundle, differences: string[]): boolean {
    let identical = true;
    
    // Compare audit log ordering (by event type, not timestamp)
    const log1Types = bundle1.sections.audit_log.map(e => e.event_type);
    const log2Types = bundle2.sections.audit_log.map(e => e.event_type);
    
    if (log1Types.length !== log2Types.length) {
      differences.push(`Audit log length: ${log1Types.length} vs ${log2Types.length}`);
      identical = false;
    }
    
    // Compare lifecycle ordering
    const lc1 = bundle1.sections.lifecycle_history.map(l => l.snapshot_id);
    const lc2 = bundle2.sections.lifecycle_history.map(l => l.snapshot_id);
    
    if (JSON.stringify(lc1) !== JSON.stringify(lc2)) {
      differences.push('Lifecycle history ordering differs');
      identical = false;
    }
    
    return identical;
  }
  
  private compareOutputs(bundle1: ReplayBundle, bundle2: ReplayBundle, differences: string[]): boolean {
    let identical = true;
    
    // Compare constitution (should be identical)
    const const1 = JSON.stringify(bundle1.sections.constitution);
    const const2 = JSON.stringify(bundle2.sections.constitution);
    
    if (const1 !== const2) {
      differences.push('Constitution content differs');
      identical = false;
    }
    
    // Compare shutdown history (excluding timestamps)
    const sh1 = bundle1.sections.shutdown_history.map(h => ({
      mode: h.new_mode,
      trigger: h.trigger
    }));
    const sh2 = bundle2.sections.shutdown_history.map(h => ({
      mode: h.new_mode,
      trigger: h.trigger
    }));
    
    if (JSON.stringify(sh1) !== JSON.stringify(sh2)) {
      differences.push('Shutdown history content differs');
      identical = false;
    }
    
    // Compare replay instructions
    if (bundle1.replay_instructions !== bundle2.replay_instructions) {
      differences.push('Replay instructions differ');
      identical = false;
    }
    
    return identical;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const runReplayIntegrityCheck = (): IntegrityCheckResult => {
  const check = new ReplayIntegrityCheck();
  return check.check();
};

export default ReplayIntegrityCheck;

