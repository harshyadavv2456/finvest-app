/**
 * InstitutionalAudit.test.ts
 * 
 * PHASE 37: Institutional Audit Mode Tests
 * 
 * Tests:
 * - Forensics pack creation
 * - Deterministic reconstruction
 * - Hash verification
 * - Audit mode kill switch
 * - Missing data throws
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ForensicsPackBuilder,
  validateForensicsPack,
  computeHashSync,
  DecisionForensicsPack,
  LifecycleTransition,
  TrustDelta,
  ResponsibilityAssignment
} from '../../audit/DecisionForensicsPack';
import {
  getDecisionReconstructionEngine,
  DecisionReconstructionEngine
} from '../../audit/DecisionReconstructionEngine';
import {
  AuditMode,
  assertAuditModeReadOnly,
  isAuditModeEnabled,
  getAuditModeState
} from '../../audit/AuditMode';

describe('Phase 37: Institutional Audit Mode', () => {
  
  // ==========================================================================
  // FORENSICS PACK CREATION
  // ==========================================================================
  
  describe('ForensicsPackBuilder', () => {
    
    it('throws when required fields are missing', () => {
      const builder = new ForensicsPackBuilder();
      
      // Only set snapshot - missing everything else
      builder.setSnapshot({
        id: 'test-snapshot',
        created_at: new Date().toISOString(),
        confidence: 80
      } as any);
      
      expect(() => builder.build()).toThrow('FORENSICS_PACK_ERROR');
      expect(() => builder.build()).toThrow('Missing required fields');
    });
    
    it('creates frozen pack when all fields provided', () => {
      const builder = createCompleteBuilder();
      const pack = builder.build();
      
      expect(pack._frozen).toBe(true);
      expect(pack.reconstruction_hash).toBeDefined();
      expect(pack.component_hashes).toBeDefined();
    });
    
    it('computes reconstruction hash from component hashes', () => {
      const builder = createCompleteBuilder();
      const pack = builder.build();
      
      // Hash should be non-empty
      expect(pack.reconstruction_hash.length).toBeGreaterThan(0);
      expect(pack.component_hashes.snapshot_hash.length).toBeGreaterThan(0);
      expect(pack.component_hashes.lifecycle_hash.length).toBeGreaterThan(0);
    });
    
    it('produces different hashes for different packs', () => {
      const builder1 = createCompleteBuilder();
      builder1.setSnapshot({ id: 'snapshot-1', created_at: new Date().toISOString() } as any);
      
      const builder2 = createCompleteBuilder();
      builder2.setSnapshot({ id: 'snapshot-2', created_at: new Date().toISOString() } as any);
      
      const pack1 = builder1.build();
      const pack2 = builder2.build();
      
      expect(pack1.reconstruction_hash).not.toBe(pack2.reconstruction_hash);
    });
    
  });
  
  // ==========================================================================
  // FORENSICS PACK VALIDATION
  // ==========================================================================
  
  describe('ForensicsPackValidation', () => {
    
    it('validates complete pack as valid', () => {
      const builder = createCompleteBuilder();
      const pack = builder.build();
      
      const validation = validateForensicsPack(pack);
      
      expect(validation.valid).toBe(true);
      expect(validation.hash_valid).toBe(true);
      expect(validation.missing_fields.length).toBe(0);
    });
    
    it('detects hash tampering', () => {
      const builder = createCompleteBuilder();
      const pack = builder.build();
      
      // Tamper with the hash
      const tampered = {
        ...pack,
        reconstruction_hash: 'tampered_hash'
      };
      
      const validation = validateForensicsPack(tampered as DecisionForensicsPack);
      
      expect(validation.hash_valid).toBe(false);
    });
    
  });
  
  // ==========================================================================
  // AUDIT MODE KILL SWITCH
  // ==========================================================================
  
  describe('AuditMode', () => {
    
    beforeEach(() => {
      AuditMode.disable('TEST', 'Test setup');
    });
    
    afterEach(() => {
      AuditMode.disable('TEST', 'Test cleanup');
    });
    
    it('starts disabled', () => {
      expect(isAuditModeEnabled()).toBe(false);
    });
    
    it('can be enabled', () => {
      AuditMode.enable('AUDITOR', 'Test audit');
      
      expect(isAuditModeEnabled()).toBe(true);
      
      const state = getAuditModeState();
      expect(state.enabled).toBe(true);
      expect(state.enabled_by).toBe('AUDITOR');
    });
    
    it('blocks write actions when enabled', () => {
      AuditMode.enable('AUDITOR', 'Test audit');
      
      expect(() => assertAuditModeReadOnly('FINBOT_ADVISE')).toThrow('AUDIT_MODE_VIOLATION');
      expect(() => assertAuditModeReadOnly('HUMAN_OVERRIDE')).toThrow('AUDIT_MODE_VIOLATION');
      expect(() => assertAuditModeReadOnly('DECISION_SHAPING')).toThrow('AUDIT_MODE_VIOLATION');
    });
    
    it('allows read actions when enabled', () => {
      AuditMode.enable('AUDITOR', 'Test audit');
      
      // These should NOT throw
      expect(() => assertAuditModeReadOnly('RECONSTRUCTION')).not.toThrow();
      expect(() => assertAuditModeReadOnly('FORENSIC_PACK_VIEW')).not.toThrow();
      expect(() => assertAuditModeReadOnly('AUDIT_TRAIL_VIEW')).not.toThrow();
    });
    
    it('allows all actions when disabled', () => {
      // Should NOT throw when disabled
      expect(() => assertAuditModeReadOnly('FINBOT_ADVISE')).not.toThrow();
      expect(() => assertAuditModeReadOnly('HUMAN_OVERRIDE')).not.toThrow();
    });
    
    it('tracks violations', () => {
      AuditMode.enable('AUDITOR', 'Test audit');
      AuditMode.clearViolations();
      
      // Trigger violations
      try { assertAuditModeReadOnly('FINBOT_ADVISE'); } catch {}
      try { assertAuditModeReadOnly('HUMAN_OVERRIDE'); } catch {}
      
      const violations = AuditMode.getViolations();
      expect(violations.length).toBe(2);
      expect(violations[0].attempted_action).toBe('FINBOT_ADVISE');
    });
    
  });
  
  // ==========================================================================
  // RECONSTRUCTION ENGINE
  // ==========================================================================
  
  describe('DecisionReconstructionEngine', () => {
    
    it('throws when snapshot not found', () => {
      const engine = getDecisionReconstructionEngine();
      
      expect(() => engine.reconstruct('nonexistent-snapshot')).toThrow('RECONSTRUCTION_ERROR');
      expect(() => engine.reconstruct('nonexistent-snapshot')).toThrow('not found');
    });
    
    it('can check data sources', () => {
      const engine = getDecisionReconstructionEngine();
      
      const sources = engine.checkDataSources('test-snapshot');
      
      expect(sources).toBeDefined();
      expect(sources.lifecycle).toBeDefined();
      expect(sources.ethics).toBeDefined();
      expect(sources.override).toBeDefined();
    });
    
    it('can register and reconstruct a snapshot', () => {
      const engine = getDecisionReconstructionEngine();
      const snapshotId = `test-${Date.now()}`;
      
      // Register snapshot
      engine.registerSnapshot({
        id: snapshotId,
        created_at: new Date().toISOString(),
        confidence: 75
      } as any);
      
      // Register minimal required data
      engine.registerEthicsVerdict(snapshotId, {
        allowed: true,
        reason: 'Test',
        violated_principles: [],
        severity: 'LOW',
        evaluated_at: new Date().toISOString(),
        _frozen: true
      } as any);
      
      engine.registerTrustDelta(snapshotId, {
        trust_before: 50,
        trust_after: 55,
        delta: 5,
        reason: 'Test',
        affected_by_override: false,
        _frozen: true
      });
      
      // Now reconstruction should work
      const pack = engine.reconstruct(snapshotId);
      
      expect(pack).toBeDefined();
      expect(pack.snapshot_id).toBe(snapshotId);
      expect(pack._frozen).toBe(true);
    });
    
  });
  
  // ==========================================================================
  // HASH UTILITIES
  // ==========================================================================
  
  describe('Hash Utilities', () => {
    
    it('produces deterministic hashes', () => {
      const data = 'test data';
      const hash1 = computeHashSync(data);
      const hash2 = computeHashSync(data);
      
      expect(hash1).toBe(hash2);
    });
    
    it('produces different hashes for different data', () => {
      const hash1 = computeHashSync('data 1');
      const hash2 = computeHashSync('data 2');
      
      expect(hash1).not.toBe(hash2);
    });
    
  });
  
});

// =============================================================================
// TEST HELPERS
// =============================================================================

function createCompleteBuilder(): ForensicsPackBuilder {
  const builder = new ForensicsPackBuilder();
  
  const now = new Date().toISOString();
  
  builder.setSnapshot({
    id: `snapshot-${Date.now()}`,
    created_at: now,
    confidence: 80
  } as any);
  
  builder.setLifecycleHistory([
    {
      from_state: 'CREATED',
      to_state: 'ELIGIBLE',
      timestamp: now,
      reason: 'Test',
      caused_by: 'SYSTEM',
      _frozen: true
    } as LifecycleTransition
  ], 'ELIGIBLE');
  
  builder.setEthicsVerdicts([{
    allowed: true,
    reason: 'Test',
    violated_principles: [],
    severity: 'LOW',
    evaluated_at: now,
    _frozen: true
  } as any]);
  
  builder.setSilenceEvents([]);
  
  builder.setSuppressedAlternatives([]);
  
  builder.setCounterfactualOutcomes([]);
  
  builder.setTrustImpact({
    trust_before: 50,
    trust_after: 55,
    delta: 5,
    reason: 'Test',
    affected_by_override: false,
    _frozen: true
  } as TrustDelta);
  
  builder.setConfidenceGovernance([]);
  
  builder.setAuditTrail([]);
  
  builder.setResponsibility({
    primary_actor: 'SYSTEM',
    human_override_occurred: false,
    system_would_have_acted_differently: false,
    counterfactual_alignment: 'UNKNOWN',
    explanation: 'Test',
    _frozen: true
  } as ResponsibilityAssignment);
  
  return builder;
}
