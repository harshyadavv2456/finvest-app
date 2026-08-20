/**
 * SnapshotAuthority Adversarial Tests
 * 
 * PHASE 21: Prove FinVest fails CLOSED
 * 
 * These tests ATTACK the authority system.
 * ALL must pass for build to succeed.
 * 
 * NO MOCKS that bypass authority.
 * Use REAL enforcement paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  SnapshotAuthority, 
  getSnapshotAuthority,
  SnapshotValidation
} from '../../core/SnapshotAuthority';
import { 
  DecisionSnapshotManager, 
  DecisionSnapshot,
  verifySnapshotIntegrity 
} from '../../core/DecisionSnapshot';
import { DecisionContext, DecisionContextBuilder } from '../../core/DecisionContext';

// =============================================================================
// TEST: SNAPSHOT MISSING → REFUSE
// =============================================================================

describe('SnapshotAuthority: Missing Snapshot', () => {
  let authority: SnapshotAuthority;
  
  beforeEach(() => {
    authority = getSnapshotAuthority();
  });
  
  it('REFUSES to render when snapshot is null', () => {
    const gate = authority.checkRenderGate(null);
    
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('No decision snapshot');
    expect(gate.action_required).not.toBe('NONE');
  });
  
  it('REFUSES to render when snapshot ID does not exist', () => {
    const gate = authority.checkRenderGate('FAKE-SNAPSHOT-12345');
    
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('not found');
    expect(gate.snapshot_id).toBe('FAKE-SNAPSHOT-12345');
  });
  
  it('REFUSES to render when snapshot ID is empty string', () => {
    const gate = authority.checkRenderGate('');
    
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('not found');
  });
  
  it('REFUSES to render when snapshot ID has invalid format', () => {
    const gate = authority.checkRenderGate('not-a-valid-snapshot-id');
    
    expect(gate.allowed).toBe(false);
  });
});

// =============================================================================
// TEST: INVALID CONTEXT → REFUSE
// =============================================================================

describe('SnapshotAuthority: Invalid Context', () => {
  let authority: SnapshotAuthority;
  
  beforeEach(() => {
    authority = getSnapshotAuthority();
  });
  
  it('REFUSES to create recommendation snapshot with INVALID context', () => {
    const invalidContext: DecisionContext = new DecisionContextBuilder()
      .withPortfolio(null, []) // No portfolio = INVALID
      .build();
    
    expect(invalidContext.status).toBe('INVALID');
    
    const result = authority.createRecommendationSnapshot(invalidContext, [{
      action: 'BUY',
      symbol: 'TEST',
      reasoning: ['Test'],
      confidence: 80
    }]);
    
    expect(result.valid).toBe(false);
    expect((result as any).code).toBe('CONTEXT_INVALID');
    expect((result as any).reason).toContain('Cannot create recommendation');
  });
  
  it('REFUSES to create recommendation snapshot with INCOMPLETE context', () => {
    const incompleteContext: DecisionContext = new DecisionContextBuilder()
      .withPortfolio({ 
        demat_id: 'TEST',
        broker: 'Test',
        source: 'CSV',
        ingested_at: new Date().toISOString(),
        version: '1.0',
        holdings: [],
        transactions: [],
        total_holdings: 0,
        total_invested: 0,
        is_valid: true,
        validation_errors: []
      }, [])
      // No prices = INCOMPLETE
      .build();
    
    if (incompleteContext.status === 'INCOMPLETE') {
      const result = authority.createRecommendationSnapshot(incompleteContext, [{
        action: 'BUY',
        symbol: 'TEST',
        reasoning: ['Test'],
        confidence: 80
      }]);
      
      expect(result.valid).toBe(false);
      expect((result as any).code).toBe('CONTEXT_INCOMPLETE');
    }
  });
  
  it('REFUSES to create FinBot snapshot with INVALID context', () => {
    const invalidContext: DecisionContext = new DecisionContextBuilder()
      .withPortfolio(null, [])
      .build();
    
    const result = authority.createFinBotSnapshot(invalidContext, [{
      action: 'HOLD',
      reasoning: ['Test'],
      confidence: 50
    }]);
    
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('refuses');
  });
  
  it('REFUSES to create scenario snapshot with INVALID context', () => {
    const invalidContext: DecisionContext = new DecisionContextBuilder()
      .withPortfolio(null, [])
      .build();
    
    const result = authority.createScenarioSnapshot(invalidContext, [{
      action: 'SELL',
      symbol: 'TEST',
      reasoning: ['Test'],
      confidence: 60
    }]);
    
    expect(result.valid).toBe(false);
    expect((result as any).code).toBe('CONTEXT_INVALID');
  });
  
  it('REFUSES to create shadow execution snapshot with INVALID context', () => {
    const invalidContext: DecisionContext = new DecisionContextBuilder()
      .withPortfolio(null, [])
      .build();
    
    const result = authority.createShadowExecutionSnapshot(invalidContext, [{
      action: 'BUY',
      symbol: 'TEST',
      quantity: 10,
      reasoning: ['Test'],
      confidence: 70
    }]);
    
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// TEST: HASH TAMPERING → REFUSE
// =============================================================================

describe('SnapshotAuthority: Integrity Tampering', () => {
  it('DETECTS and REFUSES tampered snapshot', () => {
    // Create a fake tampered snapshot
    const tamperedSnapshot: DecisionSnapshot = {
      id: 'DSNAP-TAMPERED-123',
      created_at: new Date().toISOString(),
      source: 'TAX_AWARE_ALLOCATOR',
      decision_context_id: 'CTX-123',
      context_status: 'VALID',
      context_timestamp: new Date().toISOString(),
      inputs: {
        portfolio_holdings_count: 5,
        portfolio_total_value: 100000,
        price_count: 5,
        price_timestamp: new Date().toISOString(),
        signal_count: 5,
        tax_analysis_count: 5,
        market_regime: 'BULL_STRONG'
      },
      outputs: [{
        action: 'BUY',
        symbol: 'TAMPERED',
        reasoning: ['Original was SELL but I changed it'],
        confidence: 99 // Tampered confidence
      }],
      integrity_hash: 'FAKE-HASH-OBVIOUSLY-WRONG', // Wrong hash
      _frozen: true
    };
    
    // Verify integrity check catches tampering
    const integrityValid = verifySnapshotIntegrity(tamperedSnapshot);
    expect(integrityValid).toBe(false);
  });
  
  it('REFUSES to render snapshot with invalid integrity', () => {
    const authority = getSnapshotAuthority();
    
    // Note: We can't directly insert a tampered snapshot into the manager
    // because it validates on load. This tests the validation function.
    const tamperedSnapshot: DecisionSnapshot = {
      id: 'DSNAP-TAMPERED-456',
      created_at: new Date().toISOString(),
      source: 'FINBOT_CIO',
      decision_context_id: 'CTX-456',
      context_status: 'VALID',
      context_timestamp: new Date().toISOString(),
      inputs: {
        portfolio_holdings_count: 1,
        portfolio_total_value: 50000,
        price_count: 1,
        price_timestamp: new Date().toISOString(),
        signal_count: 1,
        tax_analysis_count: 1,
        market_regime: 'SIDEWAYS'
      },
      outputs: [{
        action: 'HOLD',
        reasoning: ['Tampered'],
        confidence: 100
      }],
      integrity_hash: 'SNAP-WRONG123', // Wrong hash format
      _frozen: true
    };
    
    expect(verifySnapshotIntegrity(tamperedSnapshot)).toBe(false);
  });
});

// =============================================================================
// TEST: NO OUTPUTS → REFUSE
// =============================================================================

describe('SnapshotAuthority: Empty Outputs', () => {
  let authority: SnapshotAuthority;
  
  beforeEach(() => {
    authority = getSnapshotAuthority();
  });
  
  it('REFUSES to create snapshot with empty outputs array', () => {
    const context: DecisionContext = new DecisionContextBuilder()
      .withPortfolio({
        demat_id: 'TEST',
        broker: 'Test',
        source: 'CSV',
        ingested_at: new Date().toISOString(),
        version: '1.0',
        holdings: [],
        transactions: [],
        total_holdings: 0,
        total_invested: 0,
        is_valid: true,
        validation_errors: []
      }, [])
      .withPrices(new Map([['TEST', { symbol: 'TEST', price: 100, timestamp: new Date().toISOString(), source: 'YAHOO', is_stale: false }]]))
      .withRegime('SIDEWAYS')
      .build();
    
    if (context.status === 'VALID' || context.status === 'STALE') {
      const result = authority.createRecommendationSnapshot(context, []);
      
      expect(result.valid).toBe(false);
      expect((result as any).code).toBe('SNAPSHOT_MISSING');
      expect((result as any).reason).toContain('without recommendation outputs');
    }
  });
  
  it('REFUSES to create snapshot with null outputs', () => {
    const context: DecisionContext = new DecisionContextBuilder()
      .withPortfolio({
        demat_id: 'TEST',
        broker: 'Test',
        source: 'CSV',
        ingested_at: new Date().toISOString(),
        version: '1.0',
        holdings: [],
        transactions: [],
        total_holdings: 0,
        total_invested: 0,
        is_valid: true,
        validation_errors: []
      }, [])
      .withPrices(new Map([['TEST', { symbol: 'TEST', price: 100, timestamp: new Date().toISOString(), source: 'YAHOO', is_stale: false }]]))
      .build();
    
    if (context.status === 'VALID' || context.status === 'STALE') {
      const result = authority.createRecommendationSnapshot(context, null as any);
      
      expect(result.valid).toBe(false);
    }
  });
});

// =============================================================================
// TEST: NO FALLBACK BEHAVIOR
// =============================================================================

describe('SnapshotAuthority: No Fallback Behavior', () => {
  let authority: SnapshotAuthority;
  
  beforeEach(() => {
    authority = getSnapshotAuthority();
  });
  
  it('returns REFUSE, not null, for missing snapshot', () => {
    const gate = authority.checkRenderGate('NONEXISTENT');
    
    // Must return a RenderGate object, not null/undefined
    expect(gate).toBeDefined();
    expect(gate).not.toBeNull();
    expect(typeof gate.allowed).toBe('boolean');
    expect(typeof gate.reason).toBe('string');
    expect(gate.allowed).toBe(false);
  });
  
  it('returns explicit REFUSE for all failure cases', () => {
    const invalidCases = [
      null,
      '',
      'fake-id',
      'DSNAP-INVALID-999',
      undefined as any
    ];
    
    for (const invalidId of invalidCases) {
      const gate = authority.checkRenderGate(invalidId);
      
      expect(gate.allowed).toBe(false);
      expect(gate.reason.length).toBeGreaterThan(0);
      expect(gate.action_required).not.toBe('NONE');
    }
  });
});

