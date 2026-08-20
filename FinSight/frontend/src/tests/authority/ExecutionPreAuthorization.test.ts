/**
 * ExecutionPreAuthorization Tests
 * 
 * PHASE 26: Execution Pre-Authorization (NO REAL TRADES)
 * 
 * HARD RULES TO TEST:
 * - Pre-authorization ≠ execution
 * - No path may place trades
 * - One-time ask only (never repeated)
 * - Fully auditable
 * - Revocable by user
 * - NO broker APIs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getExecutionPreAuthorization, 
  ExecutionPreAuthorization,
  PreAuthStatus,
  PreAuthGrant,
  DecisionPatternType
} from '../../execution/ExecutionPreAuthorization';

// =============================================================================
// TEST: EXECUTION IS ALWAYS BLOCKED
// =============================================================================

describe('CRITICAL: Execution is ALWAYS blocked', () => {
  let preAuth: ExecutionPreAuthorization;
  
  beforeEach(() => {
    preAuth = getExecutionPreAuthorization();
  });
  
  it('ExecutionPreAuthorization is singleton', () => {
    const p1 = getExecutionPreAuthorization();
    const p2 = getExecutionPreAuthorization();
    expect(p1).toBe(p2);
  });
  
  it('EXECUTION_BLOCKED is always true', () => {
    expect(preAuth.EXECUTION_BLOCKED).toBe(true);
  });
  
  it('isExecutionAllowed() always returns false', () => {
    const result = preAuth.isExecutionAllowed();
    expect(result).toBe(false);
    
    // Type check: return type is 'false', not 'boolean'
    const check: false = result;
    expect(check).toBe(false);
  });
  
  it('attemptExecution() always throws', () => {
    expect(() => preAuth.attemptExecution()).toThrow('EXECUTION_BLOCKED');
  });
  
  it('No broker API methods exist', () => {
    // Verify no execution methods
    expect((preAuth as any).placeOrder).toBeUndefined();
    expect((preAuth as any).executeTrade).toBeUndefined();
    expect((preAuth as any).sendToBroker).toBeUndefined();
    expect((preAuth as any).executeOrder).toBeUndefined();
  });
});

// =============================================================================
// TEST: PRE-AUTH CONDITIONS
// =============================================================================

describe('Pre-Authorization Conditions', () => {
  let preAuth: ExecutionPreAuthorization;
  
  beforeEach(() => {
    preAuth = getExecutionPreAuthorization();
  });
  
  it('checkPreAuth returns PreAuthStatus', () => {
    const status = preAuth.checkPreAuth({
      user_id: 'test-user',
      pattern_type: 'BUY_HIGH_CONFIDENCE',
      current_confidence: 85
    });
    
    expect(status).toHaveProperty('allowed');
    expect(status).toHaveProperty('reason');
    expect(status).toHaveProperty('conditions_met');
    expect(status).toHaveProperty('pattern_id');
    expect(status).toHaveProperty('user_id');
  });
  
  it('PreAuthConditions contains all required fields', () => {
    const status = preAuth.checkPreAuth({
      user_id: 'test-user',
      pattern_type: 'BUY_HIGH_CONFIDENCE',
      current_confidence: 85
    });
    
    const conditions = status.conditions_met;
    expect(conditions).toHaveProperty('min_confidence');
    expect(conditions).toHaveProperty('min_trust_score');
    expect(conditions).toHaveProperty('min_adoption_score');
    expect(conditions).toHaveProperty('confidence_met');
    expect(conditions).toHaveProperty('trust_met');
    expect(conditions).toHaveProperty('adoption_met');
    expect(conditions).toHaveProperty('all_met');
  });
  
  it('Default thresholds are reasonable', () => {
    const status = preAuth.checkPreAuth({
      user_id: 'test-user',
      pattern_type: 'BUY_HIGH_CONFIDENCE',
      current_confidence: 85
    });
    
    const conditions = status.conditions_met;
    expect(conditions.min_confidence).toBe(75);
    expect(conditions.min_trust_score).toBe(60);
    expect(conditions.min_adoption_score).toBe(50);
  });
});

// =============================================================================
// TEST: ONE-TIME ASK ONLY
// =============================================================================

describe('One-Time Ask Only', () => {
  let preAuth: ExecutionPreAuthorization;
  
  beforeEach(() => {
    preAuth = getExecutionPreAuthorization();
  });
  
  it('wasPatternAsked returns boolean', () => {
    const result = preAuth.wasPatternAsked('test-user', 'BUY_HIGH_CONFIDENCE');
    expect(typeof result).toBe('boolean');
  });
  
  it('recordAsked prevents future asks', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'SELL_TAX_OPTIMIZED';
    
    // Before asking
    expect(preAuth.wasPatternAsked(userId, pattern)).toBe(false);
    
    // Record as asked
    preAuth.recordAsked(userId, pattern);
    
    // After asking
    expect(preAuth.wasPatternAsked(userId, pattern)).toBe(true);
  });
  
  it('shouldAskForPreAuth returns false if already asked', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'REBALANCE';
    
    // Record as asked
    preAuth.recordAsked(userId, pattern);
    
    // Should not ask again
    expect(preAuth.shouldAskForPreAuth(userId, pattern)).toBe(false);
  });
});

// =============================================================================
// TEST: REVOCABLE BY USER
// =============================================================================

describe('Revocable by User', () => {
  let preAuth: ExecutionPreAuthorization;
  
  beforeEach(() => {
    preAuth = getExecutionPreAuthorization();
  });
  
  it('grantPreAuth creates frozen grant', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'STOP_LOSS';
    
    const grant = preAuth.grantPreAuth(userId, pattern, 85);
    
    expect(grant).toHaveProperty('id');
    expect(grant).toHaveProperty('granted_at');
    expect(grant).toHaveProperty('is_active', true);
    expect(grant).toHaveProperty('_frozen', true);
    expect(grant).toHaveProperty('consent_text');
    expect(grant.consent_text).toContain('I authorize');
  });
  
  it('revokePreAuth deactivates grant', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'PROFIT_TAKING';
    
    // Grant
    const grant = preAuth.grantPreAuth(userId, pattern, 85);
    expect(grant.is_active).toBe(true);
    
    // Revoke
    const revoked = preAuth.revokePreAuth(grant.id);
    expect(revoked).not.toBeNull();
    expect(revoked!.is_active).toBe(false);
    expect(revoked!.revoked_at).toBeDefined();
  });
  
  it('getActiveGrant returns null after revocation', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'BUY_HIGH_CONFIDENCE';
    
    // Grant
    const grant = preAuth.grantPreAuth(userId, pattern, 85);
    
    // Active
    expect(preAuth.getActiveGrant(userId, pattern)).not.toBeNull();
    
    // Revoke
    preAuth.revokePreAuth(grant.id);
    
    // No longer active
    expect(preAuth.getActiveGrant(userId, pattern)).toBeNull();
  });
});

// =============================================================================
// TEST: AUDITABILITY
// =============================================================================

describe('Full Auditability', () => {
  let preAuth: ExecutionPreAuthorization;
  
  beforeEach(() => {
    preAuth = getExecutionPreAuthorization();
  });
  
  it('Grant includes conditions_at_grant', () => {
    const userId = `test-user-${Date.now()}`;
    const pattern: DecisionPatternType = 'BUY_HIGH_CONFIDENCE';
    
    const grant = preAuth.grantPreAuth(userId, pattern, 85);
    
    expect(grant.conditions_at_grant).toBeDefined();
    expect(grant.conditions_at_grant.actual_confidence).toBe(85);
  });
  
  it('PreAuthStatus includes conditions_met details', () => {
    const status = preAuth.checkPreAuth({
      user_id: 'test-user',
      pattern_type: 'BUY_HIGH_CONFIDENCE',
      current_confidence: 85
    });
    
    expect(status.conditions_met.actual_confidence).toBe(85);
  });
  
  it('getStats returns audit summary', () => {
    const stats = preAuth.getStats();
    
    expect(stats).toHaveProperty('total_grants');
    expect(stats).toHaveProperty('active_grants');
    expect(stats).toHaveProperty('revoked_grants');
    expect(stats).toHaveProperty('patterns_asked');
    expect(stats).toHaveProperty('execution_blocked', true);
  });
});

// =============================================================================
// TEST: PATTERN TYPES
// =============================================================================

describe('Decision Pattern Types', () => {
  it('All pattern types have consent templates', () => {
    const patterns: DecisionPatternType[] = [
      'BUY_HIGH_CONFIDENCE',
      'SELL_TAX_OPTIMIZED',
      'REBALANCE',
      'STOP_LOSS',
      'PROFIT_TAKING'
    ];
    
    const preAuth = getExecutionPreAuthorization();
    
    for (const pattern of patterns) {
      const userId = `test-${pattern}-${Date.now()}`;
      const grant = preAuth.grantPreAuth(userId, pattern, 85);
      
      expect(grant.consent_text).toBeTruthy();
      expect(grant.consent_text).toContain('I authorize');
    }
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 26 BUILD GATE', () => {
  it('🔒 Pre-auth ≠ execution: EXECUTION_BLOCKED is true', () => {
    const preAuth = getExecutionPreAuthorization();
    expect(preAuth.EXECUTION_BLOCKED).toBe(true);
    console.log('✓ EXECUTION_BLOCKED is true');
  });
  
  it('🔒 isExecutionAllowed returns false type literal', () => {
    const preAuth = getExecutionPreAuthorization();
    const result = preAuth.isExecutionAllowed();
    
    // Must be false (type literal), not boolean
    expect(result).toBe(false);
    console.log('✓ isExecutionAllowed() returns false');
  });
  
  it('🔒 attemptExecution throws EXECUTION_BLOCKED', () => {
    const preAuth = getExecutionPreAuthorization();
    expect(() => preAuth.attemptExecution()).toThrow('EXECUTION_BLOCKED');
    console.log('✓ attemptExecution() throws');
  });
  
  it('🔒 Grants are frozen (immutable)', () => {
    const preAuth = getExecutionPreAuthorization();
    const grant = preAuth.grantPreAuth(`freeze-test-${Date.now()}`, 'REBALANCE', 85);
    
    expect(grant._frozen).toBe(true);
    expect(Object.isFrozen(grant)).toBe(true);
    console.log('✓ Grants are frozen');
  });
  
  it('🔒 One-time ask enforced', () => {
    const preAuth = getExecutionPreAuthorization();
    const userId = `onetime-test-${Date.now()}`;
    
    preAuth.recordAsked(userId, 'STOP_LOSS');
    expect(preAuth.shouldAskForPreAuth(userId, 'STOP_LOSS')).toBe(false);
    console.log('✓ One-time ask enforced');
  });
  
  it('🔒 Revocation works', () => {
    const preAuth = getExecutionPreAuthorization();
    const userId = `revoke-test-${Date.now()}`;
    
    const grant = preAuth.grantPreAuth(userId, 'PROFIT_TAKING', 85);
    const revoked = preAuth.revokePreAuth(grant.id);
    
    expect(revoked!.is_active).toBe(false);
    expect(revoked!.revoked_at).toBeDefined();
    console.log('✓ Revocation works');
  });
});

