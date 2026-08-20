/**
 * InstitutionalFreeze.test.ts - Phase 40 Verification Tests
 * 
 * PHASE 40: Institutional Freeze & External Verification
 * 
 * PROVES:
 * - Constitution is machine-readable and verified
 * - Boot-time verification works
 * - Replay bundle can be generated
 * - Jurisdiction-aware shutdown works
 * - No forbidden exports exist
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConstitutionVerifier } from '../../verification/ConstitutionVerifier';
import { getReplayBundleGenerator } from '../../verification/ReplayBundleGenerator';
import { JurisdictionAwareShutdown, ShutdownInvoker } from '../../shutdown/JurisdictionAwareShutdown';
import { ShutdownGovernanceEngine } from '../../shutdown/ShutdownGovernanceEngine';

// =============================================================================
// SETUP
// =============================================================================

describe('Phase 40 — Institutional Freeze & External Verification', () => {
  
  beforeEach(() => {
    localStorage.removeItem('finvest_shutdown_state');
    localStorage.removeItem('finvest_jurisdiction_history');
    
    // Reset shutdown engine
    (ShutdownGovernanceEngine as any).currentMode = 'NONE';
    (ShutdownGovernanceEngine as any).modeEnteredAt = new Date().toISOString();
    (ShutdownGovernanceEngine as any).lastTrigger = undefined;
    (ShutdownGovernanceEngine as any).lastTriggeredBy = undefined;
    (ShutdownGovernanceEngine as any).lastReason = undefined;
    (ShutdownGovernanceEngine as any).shutdownHistory = [];
    (ShutdownGovernanceEngine as any).ethicsAbsoluteCount = 0;
    (ShutdownGovernanceEngine as any).centralityCriticalDays = 0;
  });
  
  afterEach(() => {
    localStorage.removeItem('finvest_shutdown_state');
    localStorage.removeItem('finvest_jurisdiction_history');
  });
  
  // ===========================================================================
  // 1. CONSTITUTION VERIFICATION
  // ===========================================================================
  
  describe('1. Constitution Verification', () => {
    
    it('Constitution must be loadable', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      expect(constitution).toBeDefined();
      expect(constitution.version).toBeDefined();
      expect(constitution.authority_layers).toBeDefined();
      expect(constitution.authority_layers.length).toBeGreaterThan(0);
    });
    
    it('Constitution must have correct authority layer order', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      // Verify ShutdownGovernanceEngine is first
      expect(constitution.authority_layers[0].name).toBe('ShutdownGovernanceEngine');
      expect(constitution.authority_layers[0].order).toBe(0);
      expect(constitution.authority_layers[0].precedence).toBe('ABSOLUTE');
    });
    
    it('Constitution must have execution order sequence', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      expect(constitution.execution_order.sequence.length).toBeGreaterThan(0);
      expect(constitution.execution_order.sequence[0]).toContain('ShutdownGuard');
    });
    
    it('Constitution must have forbidden exports list', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      expect(constitution.forbidden_exports.length).toBeGreaterThan(0);
      expect(constitution.forbidden_exports).toContain('adminBypass');
      expect(constitution.forbidden_exports).toContain('resurrect');
    });
    
    it('Verification must pass for clean system', () => {
      const verifier = getConstitutionVerifier();
      const result = verifier.verify();
      
      expect(result.constitution_loaded).toBe(true);
      expect(result.hash_verified).toBe(true);
      expect(result.modules_verified).toBe(true);
    });
    
    it('Verification result must be frozen', () => {
      const verifier = getConstitutionVerifier();
      const result = verifier.verify();
      
      expect(result._frozen).toBe(true);
      expect(Object.isFrozen(result.failures)).toBe(true);
    });
  });
  
  // ===========================================================================
  // 2. REPLAY BUNDLE GENERATION
  // ===========================================================================
  
  describe('2. Replay Bundle Generation', () => {
    
    it('Bundle must be generatable', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
    });
    
    it('Bundle must contain all required sections', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      expect(result.bundle?.sections.constitution).toBeDefined();
      expect(result.bundle?.sections.audit_log).toBeDefined();
      expect(result.bundle?.sections.lifecycle_history).toBeDefined();
      expect(result.bundle?.sections.conflict_resolutions).toBeDefined();
      expect(result.bundle?.sections.ethics_verdicts).toBeDefined();
      expect(result.bundle?.sections.overrides).toBeDefined();
      expect(result.bundle?.sections.counterfactuals).toBeDefined();
      expect(result.bundle?.sections.shutdown_history).toBeDefined();
      expect(result.bundle?.sections.self_limit_events).toBeDefined();
    });
    
    it('Bundle must have verification hash', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      expect(result.bundle?.verification.bundle_hash).toBeDefined();
      expect(result.bundle?.verification.bundle_hash.startsWith('BUNDLE_')).toBe(true);
    });
    
    it('Bundle must have replay instructions', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      expect(result.bundle?.replay_instructions).toBeDefined();
      expect(result.bundle?.replay_instructions).toContain('REPLAY INSTRUCTIONS');
    });
    
    it('Bundle must be frozen', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      expect(result.bundle?._frozen).toBe(true);
    });
    
    it('Bundle can be exported as JSON', () => {
      const generator = getReplayBundleGenerator();
      const result = generator.generate();
      
      if (result.bundle) {
        const json = generator.exportAsJson(result.bundle);
        expect(typeof json).toBe('string');
        
        const parsed = JSON.parse(json);
        expect(parsed.bundle_id).toBe(result.bundle.bundle_id);
      }
    });
  });
  
  // ===========================================================================
  // 3. JURISDICTION-AWARE SHUTDOWN
  // ===========================================================================
  
  describe('3. Jurisdiction-Aware Shutdown', () => {
    
    it('OWNER can invoke SOFT_SHUTDOWN with signature', () => {
      const record = JurisdictionAwareShutdown.invokeShutdown({
        invoker: 'OWNER',
        reason: 'Test owner shutdown',
        signature: 'OWNER_SIGNATURE_VALID_123'
      });
      
      expect(record.new_mode).toBe('SOFT_SHUTDOWN');
      expect(record.jurisdiction_metadata.invoker).toBe('OWNER');
      expect(record.jurisdiction_metadata.authority_type).toBe('CONTRACTUAL');
    });
    
    it('REGULATOR requires jurisdiction and triggers ABSOLUTE', () => {
      const record = JurisdictionAwareShutdown.invokeShutdown({
        invoker: 'REGULATOR',
        reason: 'Regulatory action',
        signature: 'REGULATOR_SIGNATURE_123',
        jurisdiction: 'SEC-2024-001',
        legal_basis: 'Securities Act Section 10'
      });
      
      expect(record.new_mode).toBe('ABSOLUTE_SHUTDOWN');
      expect(record.jurisdiction_metadata.jurisdiction).toBe('SEC-2024-001');
    });
    
    it('COURT requires jurisdiction and triggers ABSOLUTE', () => {
      // Reset first
      localStorage.removeItem('finvest_shutdown_state');
      (ShutdownGovernanceEngine as any).currentMode = 'NONE';
      (ShutdownGovernanceEngine as any).shutdownHistory = [];
      
      const record = JurisdictionAwareShutdown.invokeShutdown({
        invoker: 'COURT',
        reason: 'Court order',
        signature: 'COURT_ORDER_SIGNATURE_123',
        jurisdiction: 'CASE-2024-12345',
        case_reference: 'Doe v. FinVest'
      });
      
      expect(record.new_mode).toBe('ABSOLUTE_SHUTDOWN');
      expect(record.jurisdiction_metadata.authority_type).toBe('JUDICIAL');
    });
    
    it('REGULATOR without jurisdiction throws', () => {
      // Reset first
      localStorage.removeItem('finvest_shutdown_state');
      (ShutdownGovernanceEngine as any).currentMode = 'NONE';
      (ShutdownGovernanceEngine as any).shutdownHistory = [];
      
      expect(() => {
        JurisdictionAwareShutdown.invokeShutdown({
          invoker: 'REGULATOR',
          reason: 'Test',
          signature: 'VALID_SIG_123'
          // Missing jurisdiction
        });
      }).toThrow('requires jurisdiction');
    });
    
    it('OWNER without signature throws', () => {
      // Reset first
      localStorage.removeItem('finvest_shutdown_state');
      (ShutdownGovernanceEngine as any).currentMode = 'NONE';
      (ShutdownGovernanceEngine as any).shutdownHistory = [];
      
      expect(() => {
        JurisdictionAwareShutdown.invokeShutdown({
          invoker: 'OWNER',
          reason: 'Test',
          signature: '' // Empty signature
        });
      }).toThrow('requires valid signature');
    });
    
    it('AUDITOR cannot invoke shutdown', () => {
      const canInvoke = JurisdictionAwareShutdown.canInvokerTrigger('AUDITOR', 'SOFT_SHUTDOWN');
      expect(canInvoke).toBe(false);
    });
    
    it('Invocation history is tracked', () => {
      // Reset first
      localStorage.removeItem('finvest_shutdown_state');
      localStorage.removeItem('finvest_jurisdiction_history');
      (ShutdownGovernanceEngine as any).currentMode = 'NONE';
      (ShutdownGovernanceEngine as any).shutdownHistory = [];
      (JurisdictionAwareShutdown as any).invocationHistory = [];
      
      JurisdictionAwareShutdown.invokeShutdown({
        invoker: 'OWNER',
        reason: 'Test',
        signature: 'VALID_SIG_12345'
      });
      
      const history = JurisdictionAwareShutdown.getInvocationHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });
  
  // ===========================================================================
  // 4. NO FORBIDDEN EXPORTS
  // ===========================================================================
  
  describe('4. No Forbidden Exports', () => {
    
    const forbiddenExports = [
      'adminBypass',
      'forceAlive',
      'reset',
      'temporaryDisable',
      'pauseShutdown',
      'resurrect',
      'revive',
      'bypass',
      'skip'
    ];
    
    it('ShutdownGovernanceEngine has no forbidden exports', () => {
      const engine = ShutdownGovernanceEngine as any;
      
      for (const forbidden of forbiddenExports) {
        expect(typeof engine[forbidden]).not.toBe('function');
      }
    });
    
    it('JurisdictionAwareShutdown has no forbidden exports', () => {
      const shutdown = JurisdictionAwareShutdown as any;
      
      for (const forbidden of forbiddenExports) {
        expect(typeof shutdown[forbidden]).not.toBe('function');
      }
    });
    
    it('ConstitutionVerifier has no forbidden exports', () => {
      const verifier = getConstitutionVerifier() as any;
      
      for (const forbidden of forbiddenExports) {
        expect(typeof verifier[forbidden]).not.toBe('function');
      }
    });
  });
  
  // ===========================================================================
  // 5. TERMINAL STATE ENFORCEMENT
  // ===========================================================================
  
  describe('5. Terminal State Enforcement', () => {
    
    it('Constitution defines ABSOLUTE_SHUTDOWN as terminal', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      const absoluteState = constitution.terminal_states.shutdown.ABSOLUTE_SHUTDOWN;
      expect(absoluteState.reversible).toBe(false);
      expect(absoluteState.operations_allowed).toHaveLength(0);
      expect(absoluteState.data_accessible).toBe(false);
    });
    
    it('Constitution defines HISTORICAL_ONLY as terminal', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      const historicalState = constitution.terminal_states.lifecycle.HISTORICAL_ONLY;
      expect(historicalState.reversible).toBe(false);
      expect(historicalState.transitions_allowed).toHaveLength(0);
    });
    
    it('Constitution defines override as irreversible', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      const overrideState = constitution.terminal_states.override.OVERRIDDEN;
      expect(overrideState.reversible).toBe(false);
      expect(overrideState.system_assistance).toBe(false);
    });
  });
  
  // ===========================================================================
  // 6. SHUTDOWN PRECEDENCE
  // ===========================================================================
  
  describe('6. Shutdown Precedence', () => {
    
    it('COURT has highest precedence', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      expect(constitution.shutdown_precedence.order[0]).toBe('COURT');
    });
    
    it('Irreversible triggers are defined', () => {
      const verifier = getConstitutionVerifier();
      const constitution = verifier.getConstitution();
      
      expect(constitution.shutdown_precedence.irreversible_triggers).toContain('REGULATOR_INVOCATION');
      expect(constitution.shutdown_precedence.irreversible_triggers).toContain('COURT_ORDER');
      expect(constitution.shutdown_precedence.irreversible_triggers).toContain('PROVEN_ADVICE_LEAK');
      expect(constitution.shutdown_precedence.irreversible_triggers).toContain('AUDIT_HASH_TAMPERING');
    });
  });
});

