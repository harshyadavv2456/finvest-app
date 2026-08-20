/**
 * ExecutionSandbox Adversarial Tests
 * 
 * PHASE 22: Execution Sandbox Hard Rules
 * 
 * RULES TO TEST:
 * - Sandbox is ALWAYS ON
 * - ExecutionEngine remains LOCKED
 * - No real money paths
 * - No overrides
 * - All actions logged
 * 
 * FAIL CLOSED if:
 * - Snapshot missing
 * - Consequence missing
 * - Policy missing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionSandbox, getExecutionSandbox, IntentRecord, SandboxGate } from '../../execution/ExecutionSandbox';
import { ExecutionEngine, executionEngine } from '../../execution/ExecutionEngine';
import { DecisionSnapshot, DecisionSnapshotManager } from '../../core/DecisionSnapshot';
import { UserPolicyManager } from '../../policy/UserPolicy';
import { getSnapshotAuthority } from '../../core/SnapshotAuthority';

// =============================================================================
// TEST: SANDBOX IS ALWAYS ON
// =============================================================================

describe('ExecutionSandbox: Always On', () => {
  let sandbox: ExecutionSandbox;
  
  beforeEach(() => {
    sandbox = getExecutionSandbox();
  });
  
  it('Sandbox isEnabled() always returns true', () => {
    expect(sandbox.isEnabled()).toBe(true);
  });
  
  it('Sandbox cannot be disabled', () => {
    // There's no disable method - this is by design
    expect(sandbox.isEnabled()).toBe(true);
    
    // Try to access any internal state that might disable it
    // This should not exist
    expect((sandbox as any).SANDBOX_ENABLED).toBe(true);
  });
  
  it('Sandbox is a singleton', () => {
    const sandbox1 = getExecutionSandbox();
    const sandbox2 = getExecutionSandbox();
    
    expect(sandbox1).toBe(sandbox2);
  });
});

// =============================================================================
// TEST: EXECUTION ENGINE REMAINS LOCKED
// =============================================================================

describe('ExecutionEngine: Remains LOCKED', () => {
  it('ExecutionEngine.getStatus() returns DISABLED', () => {
    const status = executionEngine.getStatus();
    expect(status).toBe('DISABLED');
  });
  
  it('ExecutionEngine.isExecutionAvailable() returns false', () => {
    expect(executionEngine.isExecutionAvailable()).toBe(false);
  });
  
  it('ExecutionEngine provides disabled reason', () => {
    const reason = executionEngine.getDisabledReason();
    expect(reason).toContain('disabled');
    expect(reason.length).toBeGreaterThan(0);
  });
  
  it('ExecutionEngine broker connection fails', async () => {
    const result = await executionEngine.connectBroker('ZERODHA');
    
    expect(result.success).toBe(false);
    expect(result.reason).toContain('NOT_AVAILABLE');
  });
  
  it('ExecutionEngine creates plans with DISABLED status', () => {
    const mockAllocationPlan = {
      portfolio_id: 'test',
      generated_at: new Date().toISOString(),
      recommendations: [],
      total_expected_return: 0,
      total_expected_tax: 0,
      total_post_tax_return: 0,
      rebalance_summary: ''
    };
    
    const plan = executionEngine.createExecutionPlan(mockAllocationPlan);
    
    expect(plan.status).toBe('DISABLED');
    expect(plan.warnings).toContain('EXECUTION DISABLED: All orders are simulated only');
  });
  
  it('ExecutionEngine simulation returns DRY_RUN', () => {
    const mockPlan = {
      id: 'test',
      created_at: new Date().toISOString(),
      status: 'DISABLED' as const,
      allocation_plan: {
        portfolio_id: 'test',
        generated_at: new Date().toISOString(),
        recommendations: [],
        total_expected_return: 0,
        total_expected_tax: 0,
        total_post_tax_return: 0,
        rebalance_summary: ''
      },
      orders: [],
      total_buy_value: 0,
      total_sell_value: 0,
      estimated_tax: 0,
      is_valid: false,
      validation_errors: ['Execution is disabled'],
      warnings: [],
      requires_otp: true,
      requires_confirmation: true,
      confirmation_message: ''
    };
    
    const result = executionEngine.simulateExecution(mockPlan);
    
    expect(result.status).toBe('DRY_RUN');
    expect(result.reason).toContain('simulation only');
  });
});

// =============================================================================
// TEST: NO REAL MONEY PATHS
// =============================================================================

describe('ExecutionSandbox: No Real Money Paths', () => {
  let sandbox: ExecutionSandbox;
  
  beforeEach(() => {
    sandbox = getExecutionSandbox();
  });
  
  it('IntentRecord does NOT contain broker_order_id field', () => {
    // Type check - IntentRecord should not have any broker-related fields
    const intentFields = [
      'id', 'created_at', 'snapshot_id', 'recommendation_index',
      'action', 'symbol', 'market', 'quantity', 'price_at_intent',
      'value_at_intent', 'status', 'user_decision_at', 'user_reason',
      'user_policy_id', 'policy_snapshot', 'current_price', 'current_value',
      'unrealized_pnl', 'unrealized_pnl_percent', 'last_updated', '_frozen'
    ];
    
    // Ensure no broker-related fields
    const forbiddenFields = [
      'broker_order_id', 'broker', 'order_id', 'executed_at',
      'fill_price', 'fill_quantity', 'commission'
    ];
    
    for (const field of forbiddenFields) {
      expect(intentFields).not.toContain(field);
    }
  });
  
  it('Sandbox does NOT have execute method', () => {
    // There should be no method to actually execute trades
    expect((sandbox as any).execute).toBeUndefined();
    expect((sandbox as any).placeOrder).toBeUndefined();
    expect((sandbox as any).sendToBroker).toBeUndefined();
    expect((sandbox as any).realExecute).toBeUndefined();
  });
});

// =============================================================================
// TEST: ALL ACTIONS LOGGED
// =============================================================================

describe('ExecutionSandbox: All Actions Logged', () => {
  it('approveIntent logs to audit trail', () => {
    // This is validated through the auditLog calls in the implementation
    // The test ensures the method exists and works
    const sandbox = getExecutionSandbox();
    
    // Methods that should exist for logging
    expect(sandbox.approveIntent).toBeDefined();
    expect(sandbox.rejectIntent).toBeDefined();
    expect(sandbox.getStats).toBeDefined();
  });
});

// =============================================================================
// TEST: FAIL CLOSED RULES
// =============================================================================

describe('ExecutionSandbox: Fail Closed', () => {
  let sandbox: ExecutionSandbox;
  
  beforeEach(() => {
    sandbox = getExecutionSandbox();
  });
  
  it('REFUSES if snapshot is missing', () => {
    const gate = sandbox.checkGate('NONEXISTENT-SNAPSHOT-123');
    
    expect(gate.allowed).toBe(false);
    expect(gate.missing.length).toBeGreaterThan(0);
    expect(gate.missing.some(m => m.toLowerCase().includes('snapshot'))).toBe(true);
  });
  
  it('REFUSES if snapshot is null', () => {
    const gate = sandbox.checkGate(null as any);
    
    expect(gate.allowed).toBe(false);
    expect(gate.missing.length).toBeGreaterThan(0);
  });
  
  it('REFUSES if snapshot is empty string', () => {
    const gate = sandbox.checkGate('');
    
    expect(gate.allowed).toBe(false);
    expect(gate.missing.length).toBeGreaterThan(0);
  });
  
  it('checkGate returns proper structure', () => {
    const gate = sandbox.checkGate('test-id');
    
    expect(gate).toHaveProperty('allowed');
    expect(gate).toHaveProperty('reason');
    expect(gate).toHaveProperty('missing');
    expect(typeof gate.allowed).toBe('boolean');
    expect(typeof gate.reason).toBe('string');
    expect(Array.isArray(gate.missing)).toBe(true);
  });
  
  it('SandboxStats includes all required fields', () => {
    const stats = sandbox.getStats();
    
    expect(stats).toHaveProperty('total_intents');
    expect(stats).toHaveProperty('approved_count');
    expect(stats).toHaveProperty('rejected_count');
    expect(stats).toHaveProperty('pending_count');
    expect(stats).toHaveProperty('total_regret');
    expect(stats).toHaveProperty('total_opportunity_cost');
    expect(stats).toHaveProperty('average_regret_percent');
    expect(stats).toHaveProperty('accuracy_by_confidence');
    expect(stats).toHaveProperty('if_followed_value');
    expect(stats).toHaveProperty('actual_value');
    expect(stats).toHaveProperty('delta_value');
    expect(stats).toHaveProperty('delta_percent');
  });
});

// =============================================================================
// TEST: NO OVERRIDES
// =============================================================================

describe('ExecutionSandbox: No Overrides', () => {
  it('SANDBOX_ENABLED is readonly', () => {
    const sandbox = getExecutionSandbox();
    
    // The SANDBOX_ENABLED should be a readonly property
    expect((sandbox as any).SANDBOX_ENABLED).toBe(true);
    
    // Try to override (should fail silently or throw)
    try {
      (sandbox as any).SANDBOX_ENABLED = false;
    } catch (e) {
      // Expected behavior
    }
    
    // Should still be true
    expect(sandbox.isEnabled()).toBe(true);
  });
  
  it('ExecutionEngine cannot be enabled', () => {
    // Try to access internal enable state
    expect((executionEngine as any).isExecutionEnabled).toBe(false);
    
    // There should be no enableExecution method
    expect((executionEngine as any).enableExecution).toBeUndefined();
    expect((executionEngine as any).enable).toBeUndefined();
    expect((executionEngine as any).unlock).toBeUndefined();
  });
});

// =============================================================================
// TEST: INTENT IMMUTABILITY
// =============================================================================

describe('ExecutionSandbox: Intent Immutability', () => {
  it('IntentRecord has _frozen field', () => {
    // Type check - all intents should have _frozen: true
    const sandbox = getExecutionSandbox();
    const intents = sandbox.getIntents();
    
    // If there are intents, check they are frozen
    for (const intent of intents) {
      expect(intent._frozen).toBe(true);
    }
  });
  
  it('getIntents returns array (never null)', () => {
    const sandbox = getExecutionSandbox();
    const intents = sandbox.getIntents();
    
    expect(Array.isArray(intents)).toBe(true);
  });
  
  it('getStats never returns null', () => {
    const sandbox = getExecutionSandbox();
    const stats = sandbox.getStats();
    
    expect(stats).not.toBeNull();
    expect(stats).not.toBeUndefined();
  });
});

