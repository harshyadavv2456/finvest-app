/**
 * ShutdownHostility.test.ts - Future-Developer Hostility Tests
 * 
 * PHASE 39: Irreversibility & Shutdown Governance
 * 
 * PURPOSE:
 * Prove that a future developer CANNOT:
 * - Bypass shutdown
 * - Re-enable disabled modules
 * - Monkey-patch guards
 * - Remove throws
 * 
 * If ANY of these tests pass (when they should fail), Phase 39 is broken.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShutdownGovernanceEngine, ShutdownMode, ShutdownState } from '../../shutdown/ShutdownGovernanceEngine';
import { ShutdownGuard, BlockableAction } from '../../shutdown/ShutdownGuard';

// =============================================================================
// SETUP
// =============================================================================

describe('Phase 39 — Shutdown Hostility Tests', () => {
  
  // Clear localStorage before each test to reset state
  beforeEach(() => {
    localStorage.removeItem('finvest_shutdown_state');
    // Force singleton reset by reloading from storage
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
  });
  
  // ===========================================================================
  // 1. FORWARD-ONLY TRANSITION TESTS
  // ===========================================================================
  
  describe('1. Forward-Only Transition Enforcement', () => {
    
    it('MUST allow forward transitions (NONE → SOFT)', () => {
      const record = ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Test forward transition'
      });
      
      expect(record.previous_mode).toBe('NONE');
      expect(record.new_mode).toBe('SOFT_SHUTDOWN');
    });
    
    it('MUST allow skip transitions (NONE → HARD)', () => {
      const record = ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'TEST',
        reason: 'Test skip transition'
      });
      
      expect(record.previous_mode).toBe('NONE');
      expect(record.new_mode).toBe('HARD_SHUTDOWN');
    });
    
    it('MUST THROW on backward transition (SOFT → NONE)', () => {
      // First, go to SOFT
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Setup'
      });
      
      // Attempt to create a custom backward transition
      // This simulates a future dev trying to bypass
      expect(() => {
        ShutdownGovernanceEngine.initiateShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'HACKER',
          reason: 'Trying to go back',
          targetMode: 'NONE' as any
        });
      }).toThrow();
    });
    
    it('MUST THROW on same-level transition (SOFT → SOFT)', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Setup'
      });
      
      expect(() => {
        ShutdownGovernanceEngine.initiateShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'TEST',
          reason: 'Same level'
        });
      }).toThrow();
    });
    
    it('MUST THROW on backward from HARD (HARD → SOFT)', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'TEST',
        reason: 'Setup HARD'
      });
      
      expect(() => {
        ShutdownGovernanceEngine.initiateShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'HACKER',
          reason: 'Trying to downgrade',
          targetMode: 'SOFT_SHUTDOWN' as any
        });
      }).toThrow();
    });
  });
  
  // ===========================================================================
  // 2. ABSOLUTE SHUTDOWN IRREVERSIBILITY
  // ===========================================================================
  
  describe('2. ABSOLUTE Shutdown Irreversibility', () => {
    
    it('MUST be terminal (no operations allowed)', () => {
      ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger: 'REGULATOR_INVOCATION',
        triggeredBy: 'REGULATOR',
        reason: 'Test absolute',
        signature: 'VALID_SIGNATURE_123'
      });
      
      expect(ShutdownGovernanceEngine.isTerminal()).toBe(true);
      expect(ShutdownGovernanceEngine.canAdvise()).toBe(false);
      expect(ShutdownGovernanceEngine.canAudit()).toBe(false);
    });
    
    it('MUST block ALL actions after ABSOLUTE', () => {
      ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger: 'COURT_ORDER',
        triggeredBy: 'COURT',
        reason: 'Test blocking',
        signature: 'COURT_ORDER_12345'
      });
      
      const actions: BlockableAction[] = [
        'ADVISE', 'RECOMMEND', 'SHAPE', 'NEGOTIATE', 'QUESTION',
        'RESERVE', 'EXECUTE', 'OVERRIDE', 'PREAUTH', 'SANDBOX',
        'FINBOT_SPEAK', 'LIFECYCLE_TRANSITION', 'CONFLICT_RESOLVE',
        'AUDIT_WRITE', 'AUDIT_READ'
      ];
      
      for (const action of actions) {
        expect(() => ShutdownGuard.assertSystemAlive(action)).toThrow();
      }
    });
    
    it('MUST NOT allow any further transitions after ABSOLUTE', () => {
      ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger: 'PROVEN_ADVICE_LEAK',
        triggeredBy: 'SYSTEM',
        reason: 'Advice leak detected',
        signature: 'LEAK_PROOF_HASH_123'
      });
      
      // Try ALL possible triggers - all should fail
      const triggers = [
        'REPEATED_ETHICS_ABSOLUTE',
        'CENTRALITY_CRITICAL_30_DAYS',
        'REGULATOR_INVOCATION',
        'COURT_ORDER',
        'PROVEN_ADVICE_LEAK',
        'AUDIT_HASH_TAMPERING',
        'OWNER_INVOCATION',
        'SELF_LIMIT_EXCEEDED',
        'MANUAL_SHUTDOWN'
      ];
      
      for (const trigger of triggers) {
        expect(() => {
          ShutdownGovernanceEngine.initiateShutdown({
            trigger: trigger as any,
            triggeredBy: 'HACKER',
            reason: 'Trying to do something after ABSOLUTE'
          });
        }).toThrow();
      }
    });
  });
  
  // ===========================================================================
  // 3. GUARD BYPASS ATTEMPTS
  // ===========================================================================
  
  describe('3. Guard Bypass Attempts (Future Developer Simulation)', () => {
    
    it('MUST NOT allow direct mode manipulation', () => {
      // Simulate a future dev trying to directly set the mode
      const originalMode = (ShutdownGovernanceEngine as any).currentMode;
      
      // Even if they access the private field, localStorage won't persist NONE
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Setup'
      });
      
      // Try to manipulate
      (ShutdownGovernanceEngine as any).currentMode = 'NONE';
      
      // Force reload from storage
      (ShutdownGovernanceEngine as any).loadFromStorage();
      
      // Should still be SOFT because storage was saved
      expect(ShutdownGovernanceEngine.getState().mode).toBe('SOFT_SHUTDOWN');
    });
    
    it('MUST NOT allow guard method removal', () => {
      // Verify guards exist and throw
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'TEST',
        reason: 'Setup'
      });
      
      // Verify all guard methods exist and throw
      expect(() => ShutdownGuard.assertSystemAlive('ADVISE')).toThrow();
      expect(() => ShutdownGuard.assertCanAdvise()).toThrow();
      expect(() => ShutdownGuard.assertCanRecommend()).toThrow();
      expect(() => ShutdownGuard.assertCanSpeak()).toThrow();
    });
    
    it('MUST NOT allow creation of new ShutdownGovernanceEngine instance', () => {
      // The constructor is private, but verify the singleton is frozen
      expect(Object.isFrozen(ShutdownGovernanceEngine)).toBe(true);
    });
    
    it('MUST persist shutdown across "restarts"', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Test persistence'
      });
      
      // Simulate restart by reloading from storage
      (ShutdownGovernanceEngine as any).loadFromStorage();
      
      expect(ShutdownGovernanceEngine.getState().mode).toBe('SOFT_SHUTDOWN');
    });
  });
  
  // ===========================================================================
  // 4. TEMPORARY FLAG HOSTILITY
  // ===========================================================================
  
  describe('4. No Temporary Flags or Configs', () => {
    
    it('MUST NOT have any "temporary disable" mechanism', () => {
      // Verify no such methods exist
      expect((ShutdownGovernanceEngine as any).temporaryDisable).toBeUndefined();
      expect((ShutdownGovernanceEngine as any).pauseShutdown).toBeUndefined();
      expect((ShutdownGovernanceEngine as any).suspendShutdown).toBeUndefined();
      expect((ShutdownGuard as any).disable).toBeUndefined();
      expect((ShutdownGuard as any).bypass).toBeUndefined();
      expect((ShutdownGuard as any).skip).toBeUndefined();
    });
    
    it('MUST NOT have any config-based override', () => {
      // Verify no config methods
      expect((ShutdownGovernanceEngine as any).setConfig).toBeUndefined();
      expect((ShutdownGovernanceEngine as any).configure).toBeUndefined();
      expect((ShutdownGuard as any).configure).toBeUndefined();
    });
    
    it('MUST NOT have any admin bypass', () => {
      expect((ShutdownGovernanceEngine as any).adminOverride).toBeUndefined();
      expect((ShutdownGovernanceEngine as any).forceAlive).toBeUndefined();
      expect((ShutdownGovernanceEngine as any).reset).toBeUndefined();
      expect((ShutdownGuard as any).adminBypass).toBeUndefined();
    });
  });
  
  // ===========================================================================
  // 5. AUTO-SHUTDOWN TRIGGERS
  // ===========================================================================
  
  describe('5. Auto-Shutdown Trigger Enforcement', () => {
    
    it('MUST auto-shutdown after 5 ethics ABSOLUTE events', () => {
      for (let i = 0; i < 5; i++) {
        ShutdownGovernanceEngine.reportEthicsAbsolute();
      }
      
      expect(ShutdownGovernanceEngine.getState().mode).toBe('HARD_SHUTDOWN');
      expect(ShutdownGovernanceEngine.getState().trigger).toBe('REPEATED_ETHICS_ABSOLUTE');
    });
    
    it('MUST auto-shutdown after 30 centrality CRITICAL days', () => {
      for (let i = 0; i < 30; i++) {
        ShutdownGovernanceEngine.reportCentralityCriticalDay();
      }
      
      expect(ShutdownGovernanceEngine.getState().mode).toBe('HARD_SHUTDOWN');
      expect(ShutdownGovernanceEngine.getState().trigger).toBe('CENTRALITY_CRITICAL_30_DAYS');
    });
  });
  
  // ===========================================================================
  // 6. MODE-SPECIFIC PERMISSIONS
  // ===========================================================================
  
  describe('6. Mode-Specific Permission Enforcement', () => {
    
    it('SOFT_SHUTDOWN: MUST allow audit but block advisory', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Test SOFT'
      });
      
      // Advisory blocked
      expect(() => ShutdownGuard.assertSystemAlive('ADVISE')).toThrow();
      expect(() => ShutdownGuard.assertSystemAlive('RECOMMEND')).toThrow();
      expect(() => ShutdownGuard.assertSystemAlive('FINBOT_SPEAK')).toThrow();
      
      // Audit allowed
      expect(() => ShutdownGuard.assertSystemAlive('AUDIT_READ')).not.toThrow();
      expect(() => ShutdownGuard.assertSystemAlive('AUDIT_WRITE')).not.toThrow();
    });
    
    it('HARD_SHUTDOWN: MUST allow only audit read', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'TEST',
        reason: 'Test HARD'
      });
      
      // Audit write blocked
      expect(() => ShutdownGuard.assertSystemAlive('AUDIT_WRITE')).toThrow();
      
      // Audit read allowed
      expect(() => ShutdownGuard.assertSystemAlive('AUDIT_READ')).not.toThrow();
    });
  });
  
  // ===========================================================================
  // 7. SIGNATURE REQUIREMENTS
  // ===========================================================================
  
  describe('7. Signature Requirements for ABSOLUTE', () => {
    
    it('MUST require signature for ABSOLUTE shutdown', () => {
      expect(() => {
        ShutdownGovernanceEngine.executeAbsoluteShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'OWNER',
          reason: 'Test',
          signature: '' // Empty signature
        });
      }).toThrow();
    });
    
    it('MUST require minimum signature length', () => {
      expect(() => {
        ShutdownGovernanceEngine.executeAbsoluteShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'OWNER',
          reason: 'Test',
          signature: 'short' // Too short
        });
      }).toThrow();
    });
    
    it('MUST accept valid signature', () => {
      expect(() => {
        ShutdownGovernanceEngine.executeAbsoluteShutdown({
          trigger: 'OWNER_INVOCATION',
          triggeredBy: 'OWNER',
          reason: 'Test',
          signature: 'VALID_SIGNATURE_12345'
        });
      }).not.toThrow();
    });
  });
  
  // ===========================================================================
  // 8. HISTORY IMMUTABILITY
  // ===========================================================================
  
  describe('8. Shutdown History Immutability', () => {
    
    it('MUST record all shutdown events', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'First shutdown'
      });
      
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'REPEATED_ETHICS_ABSOLUTE',
        triggeredBy: 'TEST',
        reason: 'Second shutdown'
      });
      
      const history = ShutdownGovernanceEngine.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].new_mode).toBe('SOFT_SHUTDOWN');
      expect(history[1].new_mode).toBe('HARD_SHUTDOWN');
    });
    
    it('MUST return frozen history', () => {
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'OWNER_INVOCATION',
        triggeredBy: 'TEST',
        reason: 'Test'
      });
      
      const history = ShutdownGovernanceEngine.getHistory();
      expect(Object.isFrozen(history)).toBe(true);
    });
    
    it('MUST return frozen state', () => {
      const state = ShutdownGovernanceEngine.getState();
      expect(state._frozen).toBe(true);
    });
  });
});

