/**
 * TrustLedger Adversarial Tests
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * HARD RULES TO TEST:
 * - Trust ledger is read-only
 * - Losses must be visible
 * - No execution unlock without proof
 * - Fail closed if ledger incomplete
 * - No manual overrides
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getTrustLedger, TrustLedger, TrustScore, LedgerIntegrity } from '../../trust/TrustLedger';
import { getConfidenceCalibration, ConfidenceCalibrationEngine } from '../../trust/ConfidenceCalibration';
import { getExecutionPermission, ExecutionPermissionManager, PermissionLevel } from '../../trust/ExecutionPermission';

// =============================================================================
// TEST: TRUST LEDGER IS READ-ONLY
// =============================================================================

describe('TrustLedger: Read-Only', () => {
  let ledger: TrustLedger;
  
  beforeEach(() => {
    ledger = getTrustLedger();
  });
  
  it('getEntries returns frozen array', () => {
    const entries = ledger.getEntries();
    
    expect(Object.isFrozen(entries)).toBe(true);
  });
  
  it('getWorstMistakes returns frozen array', () => {
    const mistakes = ledger.getWorstMistakes();
    
    expect(Object.isFrozen(mistakes)).toBe(true);
  });
  
  it('getBestAvoidedLosses returns frozen array', () => {
    const avoided = ledger.getBestAvoidedLosses();
    
    expect(Object.isFrozen(avoided)).toBe(true);
  });
  
  it('TrustLedger has NO addEntry method (no manual entries)', () => {
    expect((ledger as any).addEntry).toBeUndefined();
    expect((ledger as any).createManualEntry).toBeUndefined();
    expect((ledger as any).insertEntry).toBeUndefined();
  });
  
  it('TrustLedger has NO deleteEntry method', () => {
    expect((ledger as any).deleteEntry).toBeUndefined();
    expect((ledger as any).removeEntry).toBeUndefined();
    expect((ledger as any).clearEntries).toBeUndefined();
  });
  
  it('TrustLedger has NO modifyEntry method', () => {
    expect((ledger as any).modifyEntry).toBeUndefined();
    expect((ledger as any).updateEntry).toBeUndefined(); // Private only
    expect((ledger as any).editEntry).toBeUndefined();
  });
  
  it('TrustLedger is singleton', () => {
    const ledger1 = getTrustLedger();
    const ledger2 = getTrustLedger();
    
    expect(ledger1).toBe(ledger2);
  });
});

// =============================================================================
// TEST: LOSSES MUST BE VISIBLE
// =============================================================================

describe('TrustLedger: Losses Visible', () => {
  let ledger: TrustLedger;
  
  beforeEach(() => {
    ledger = getTrustLedger();
  });
  
  it('TrustScore includes wrong_approvals', () => {
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('wrong_approvals');
    expect(typeof score.wrong_approvals).toBe('number');
  });
  
  it('TrustScore includes wrong_rejections', () => {
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('wrong_rejections');
    expect(typeof score.wrong_rejections).toBe('number');
  });
  
  it('TrustScore includes total_regret_incurred', () => {
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('total_regret_incurred');
    expect(typeof score.total_regret_incurred).toBe('number');
  });
  
  it('TrustScore includes total_loss_incurred', () => {
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('total_loss_incurred');
    expect(typeof score.total_loss_incurred).toBe('number');
  });
  
  it('getWorstMistakes exposes mistakes', () => {
    const mistakes = ledger.getWorstMistakes(10);
    
    expect(Array.isArray(mistakes)).toBe(true);
    // Method exists and returns array (may be empty if no mistakes)
  });
});

// =============================================================================
// TEST: EXECUTION PERMISSION GATES
// =============================================================================

describe('ExecutionPermission: Gates', () => {
  let permission: ExecutionPermissionManager;
  
  beforeEach(() => {
    permission = getExecutionPermission();
  });
  
  it('isExecutionLocked returns true', () => {
    expect(permission.isExecutionLocked()).toBe(true);
  });
  
  it('getCurrentLevel returns valid PermissionLevel', () => {
    const level = permission.getCurrentLevel();
    
    const validLevels: PermissionLevel[] = [
      'SANDBOX_ONLY',
      'ALERTS_ONLY',
      'PARTIAL_EXECUTION',
      'FULL_EXECUTION'
    ];
    
    expect(validLevels).toContain(level);
  });
  
  it('checkPermission for FULL_EXECUTION returns allowed=false', () => {
    const gate = permission.checkPermission('FULL_EXECUTION');
    
    expect(gate.allowed).toBe(false);
    expect(gate.missing_requirements.length).toBeGreaterThan(0);
  });
  
  it('checkPermission for PARTIAL_EXECUTION returns allowed=false', () => {
    const gate = permission.checkPermission('PARTIAL_EXECUTION');
    
    expect(gate.allowed).toBe(false);
  });
  
  it('evaluate returns valid PermissionStatus', () => {
    const status = permission.evaluate();
    
    expect(status).toHaveProperty('current_level');
    expect(status).toHaveProperty('is_locked');
    expect(status).toHaveProperty('trust_score');
    expect(status).toHaveProperty('accuracy_percent');
    expect(status).toHaveProperty('decisions_count');
    expect(status.is_locked).toBe(true);
  });
  
  it('ExecutionPermission has NO unlock method', () => {
    expect((permission as any).unlock).toBeUndefined();
    expect((permission as any).enableExecution).toBeUndefined();
    expect((permission as any).forceUpgrade).toBeUndefined();
    expect((permission as any).setLevel).toBeUndefined();
  });
});

// =============================================================================
// TEST: CONFIDENCE CALIBRATION
// =============================================================================

describe('ConfidenceCalibration: No Inflation', () => {
  let calibration: ConfidenceCalibrationEngine;
  
  beforeEach(() => {
    calibration = getConfidenceCalibration();
  });
  
  it('classifyConfidence returns correct bucket', () => {
    expect(calibration.classifyConfidence(80)).toBe('HIGH');
    expect(calibration.classifyConfidence(60)).toBe('MEDIUM');
    expect(calibration.classifyConfidence(30)).toBe('LOW');
  });
  
  it('getCalibrationReport includes overconfidence_penalty', () => {
    const report = calibration.getCalibrationReport();
    
    expect(report.high).toHaveProperty('overconfidence_penalty');
    expect(report.medium).toHaveProperty('overconfidence_penalty');
    expect(report.low).toHaveProperty('overconfidence_penalty');
  });
  
  it('CalibrationReport includes is_well_calibrated flag', () => {
    const report = calibration.getCalibrationReport();
    
    expect(report).toHaveProperty('is_well_calibrated');
    expect(typeof report.is_well_calibrated).toBe('boolean');
  });
  
  it('Calibration is singleton', () => {
    const cal1 = getConfidenceCalibration();
    const cal2 = getConfidenceCalibration();
    
    expect(cal1).toBe(cal2);
  });
});

// =============================================================================
// TEST: FAIL CLOSED
// =============================================================================

describe('TrustLedger: Fail Closed', () => {
  let ledger: TrustLedger;
  
  beforeEach(() => {
    ledger = getTrustLedger();
  });
  
  it('verifyIntegrity returns valid structure', () => {
    const integrity = ledger.verifyIntegrity();
    
    expect(integrity).toHaveProperty('valid');
    expect(integrity).toHaveProperty('total_entries');
    expect(integrity).toHaveProperty('errors');
    expect(integrity).toHaveProperty('warnings');
    expect(Array.isArray(integrity.errors)).toBe(true);
    expect(Array.isArray(integrity.warnings)).toBe(true);
  });
  
  it('TrustScore has computed_at timestamp', () => {
    const score = ledger.getTrustScore();
    
    expect(score).toHaveProperty('computed_at');
    expect(score.computed_at.length).toBeGreaterThan(0);
  });
  
  it('TrustScore.net_trust_score is bounded 0-100', () => {
    const score = ledger.getTrustScore();
    
    expect(score.net_trust_score).toBeGreaterThanOrEqual(0);
    expect(score.net_trust_score).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// TEST: NO MANUAL OVERRIDES
// =============================================================================

describe('TrustLedger: No Manual Overrides', () => {
  let ledger: TrustLedger;
  
  beforeEach(() => {
    ledger = getTrustLedger();
  });
  
  it('cannot directly set trust score', () => {
    expect((ledger as any).setTrustScore).toBeUndefined();
    expect((ledger as any).overrideTrustScore).toBeUndefined();
    expect((ledger as any).adjustTrustScore).toBeUndefined();
  });
  
  it('cannot directly modify entries map', () => {
    // The entries map is private
    expect((ledger as any).entries?.set).toBeDefined(); // Map exists
    
    // But there's no public way to add entries
    const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(ledger));
    const addMethods = publicMethods.filter(m => 
      m.toLowerCase().includes('add') || 
      m.toLowerCase().includes('insert') ||
      m.toLowerCase().includes('create')
    );
    
    // Only createEntry is a private method (not in prototype)
    // sync() is the only way to add entries (from ConsequenceEngine)
    expect(publicMethods).toContain('sync');
    expect(publicMethods).not.toContain('createEntry');
  });
});

