/**
 * DecisionLifecycle Tests - Phase 31 DLSM
 * 
 * MANDATORY TESTS (BUILD MUST FAIL WITHOUT THESE):
 * - Illegal transitions throw
 * - SUPPRESSED never reactivates
 * - HISTORICAL_ONLY is terminal
 * - Rendering blocked unless ACTIVE
 * - MDCR suppression creates lifecycle entry
 * - Missing lifecycle = hard failure
 * - All lifecycle objects immutable
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDecisionLifecycleEngine,
  DecisionLifecycleEngine,
  DecisionLifecycleState,
  DecisionLifecycle
} from '../../lifecycle/DecisionLifecycleEngine';
import { LifecycleGuard } from '../../lifecycle/LifecycleGuard';

// =============================================================================
// TEST HELPERS
// =============================================================================

const generateSnapshotId = (): string => {
  return `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

// =============================================================================
// LIFECYCLE CREATION TESTS
// =============================================================================

describe('Lifecycle Creation', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('creates lifecycle with CREATED state', () => {
    const snapshotId = generateSnapshotId();
    const lifecycle = engine.createLifecycle(snapshotId, 'Test creation');
    
    expect(lifecycle.state).toBe('CREATED');
    expect(lifecycle.snapshot_id).toBe(snapshotId);
    expect(lifecycle._frozen).toBe(true);
    
    console.log('✓ Lifecycle created with CREATED state');
  });
  
  it('throws on duplicate lifecycle creation', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    expect(() => engine.createLifecycle(snapshotId)).toThrow('already exists');
    
    console.log('✓ Duplicate lifecycle creation blocked');
  });
  
  it('lifecycle is immutable (frozen)', () => {
    const snapshotId = generateSnapshotId();
    const lifecycle = engine.createLifecycle(snapshotId);
    
    expect(Object.isFrozen(lifecycle)).toBe(true);
    
    console.log('✓ Lifecycle is frozen');
  });
});

// =============================================================================
// VALID TRANSITIONS TESTS
// =============================================================================

describe('Valid Transitions', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('CREATED → ELIGIBLE', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    const lifecycle = engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Passed validation', 'SYSTEM');
    
    expect(lifecycle.state).toBe('ELIGIBLE');
    expect(lifecycle.previous_state).toBe('CREATED');
    
    console.log('✓ CREATED → ELIGIBLE');
  });
  
  it('ELIGIBLE → CONFLICTED', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Validation', 'SYSTEM');
    
    const lifecycle = engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'Entered MDCR', 'MDCR');
    
    expect(lifecycle.state).toBe('CONFLICTED');
    
    console.log('✓ ELIGIBLE → CONFLICTED');
  });
  
  it('CONFLICTED → ACTIVE', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Validation', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'MDCR', 'MDCR');
    
    const lifecycle = engine.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'Survived', 'MDCR');
    
    expect(lifecycle.state).toBe('ACTIVE');
    
    console.log('✓ CONFLICTED → ACTIVE');
  });
  
  it('CONFLICTED → SUPPRESSED', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'Validation', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'MDCR', 'MDCR');
    
    const lifecycle = engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'Killed', 'MDCR');
    
    expect(lifecycle.state).toBe('SUPPRESSED');
    
    console.log('✓ CONFLICTED → SUPPRESSED');
  });
  
  it('SUPPRESSED → HISTORICAL_ONLY', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    const lifecycle = engine.transition(snapshotId, 'SUPPRESSED', 'HISTORICAL_ONLY', 'Archived', 'TIME');
    
    expect(lifecycle.state).toBe('HISTORICAL_ONLY');
    
    console.log('✓ SUPPRESSED → HISTORICAL_ONLY');
  });
});

// =============================================================================
// ILLEGAL TRANSITIONS TESTS (MUST THROW)
// =============================================================================

describe('Illegal Transitions (Must Throw)', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('❌ SUPPRESSED → ACTIVE throws', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    expect(() => {
      engine.transition(snapshotId, 'SUPPRESSED', 'ACTIVE', 'Revive', 'SYSTEM');
    }).toThrow('ILLEGAL');
    
    console.log('✓ SUPPRESSED → ACTIVE throws');
  });
  
  it('❌ HISTORICAL_ONLY → ANY throws', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    engine.transition(snapshotId, 'SUPPRESSED', 'HISTORICAL_ONLY', 'A', 'TIME');
    
    expect(() => {
      engine.transition(snapshotId, 'HISTORICAL_ONLY', 'ACTIVE', 'Revive', 'SYSTEM');
    }).toThrow('terminal');
    
    console.log('✓ HISTORICAL_ONLY is terminal');
  });
  
  it('❌ EXPIRED → ACTIVE throws', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'S', 'MDCR');
    engine.transition(snapshotId, 'ACTIVE', 'EXPIRED', 'E', 'TIME');
    
    expect(() => {
      engine.transition(snapshotId, 'EXPIRED', 'ACTIVE', 'Revive', 'SYSTEM');
    }).toThrow('ILLEGAL');
    
    console.log('✓ EXPIRED → ACTIVE throws');
  });
  
  it('❌ INVALIDATED → ACTIVE throws', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'S', 'MDCR');
    engine.transition(snapshotId, 'ACTIVE', 'INVALIDATED', 'I', 'MARKET_EVENT');
    
    expect(() => {
      engine.transition(snapshotId, 'INVALIDATED', 'ACTIVE', 'Revive', 'SYSTEM');
    }).toThrow('ILLEGAL');
    
    console.log('✓ INVALIDATED → ACTIVE throws');
  });
  
  it('❌ CREATED → ACTIVE throws (skip states)', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    expect(() => {
      engine.transition(snapshotId, 'CREATED', 'ACTIVE', 'Skip', 'SYSTEM');
    }).toThrow('ILLEGAL');
    
    console.log('✓ CREATED → ACTIVE (skip) throws');
  });
  
  it('❌ Backward transition throws', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    
    expect(() => {
      engine.transition(snapshotId, 'ELIGIBLE', 'CREATED', 'Back', 'SYSTEM');
    }).toThrow('ILLEGAL');
    
    console.log('✓ Backward transition throws');
  });
});

// =============================================================================
// LIFECYCLE GUARD TESTS
// =============================================================================

describe('LifecycleGuard', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('assertActive passes for ACTIVE state', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'S', 'MDCR');
    
    expect(() => LifecycleGuard.assertActive(snapshotId)).not.toThrow();
    
    console.log('✓ assertActive passes for ACTIVE');
  });
  
  it('assertActive throws for non-ACTIVE state', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    expect(() => LifecycleGuard.assertActive(snapshotId)).toThrow('NOT_ACTIVE');
    
    console.log('✓ assertActive throws for non-ACTIVE');
  });
  
  it('assertActive throws for missing lifecycle', () => {
    expect(() => LifecycleGuard.assertActive('nonexistent')).toThrow('LIFECYCLE_MISSING');
    
    console.log('✓ assertActive throws for missing lifecycle');
  });
  
  it('assertNotSuppressed throws for SUPPRESSED', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    expect(() => LifecycleGuard.assertNotSuppressed(snapshotId)).toThrow('SUPPRESSED');
    
    console.log('✓ assertNotSuppressed throws for SUPPRESSED');
  });
  
  it('assertHistoricalOnly throws for non-HISTORICAL state', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    expect(() => LifecycleGuard.assertHistoricalOnly(snapshotId)).toThrow('NOT_HISTORICAL');
    
    console.log('✓ assertHistoricalOnly throws for non-HISTORICAL');
  });
});

// =============================================================================
// RENDERING BLOCKED TESTS
// =============================================================================

describe('Rendering Blocked Unless ACTIVE', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('assertRenderable passes only for ACTIVE', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    // CREATED - should throw
    expect(() => engine.assertRenderable(snapshotId)).toThrow('RENDER_BLOCKED');
    
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    // ELIGIBLE - should throw
    expect(() => engine.assertRenderable(snapshotId)).toThrow('RENDER_BLOCKED');
    
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    // CONFLICTED - should throw
    expect(() => engine.assertRenderable(snapshotId)).toThrow('RENDER_BLOCKED');
    
    engine.transition(snapshotId, 'CONFLICTED', 'ACTIVE', 'S', 'MDCR');
    // ACTIVE - should pass
    expect(() => engine.assertRenderable(snapshotId)).not.toThrow();
    
    console.log('✓ Rendering blocked unless ACTIVE');
  });
  
  it('assertRenderable throws for SUPPRESSED', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    expect(() => engine.assertRenderable(snapshotId)).toThrow('RENDER_BLOCKED');
    
    console.log('✓ Rendering blocked for SUPPRESSED');
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

describe('Immutability', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('all lifecycle objects are frozen', () => {
    const snapshotId = generateSnapshotId();
    const lifecycle = engine.createLifecycle(snapshotId);
    
    expect(lifecycle._frozen).toBe(true);
    expect(Object.isFrozen(lifecycle)).toBe(true);
    
    console.log('✓ Lifecycle objects frozen');
  });
  
  it('transitions return frozen objects', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    const lifecycle = engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    
    expect(lifecycle._frozen).toBe(true);
    expect(Object.isFrozen(lifecycle)).toBe(true);
    
    console.log('✓ Transition results frozen');
  });
  
  it('transition history entries are frozen', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    
    const history = engine.getTransitionHistory(snapshotId);
    for (const entry of history) {
      expect(entry._frozen).toBe(true);
    }
    
    console.log('✓ History entries frozen');
  });
});

// =============================================================================
// MISSING LIFECYCLE TESTS
// =============================================================================

describe('Missing Lifecycle = Hard Failure', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('getCurrentState throws for missing lifecycle', () => {
    expect(() => engine.getCurrentState('nonexistent')).toThrow('No lifecycle exists');
    
    console.log('✓ getCurrentState throws for missing');
  });
  
  it('transition throws for missing lifecycle', () => {
    expect(() => engine.transition('nonexistent', 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM'))
      .toThrow('No lifecycle exists');
    
    console.log('✓ transition throws for missing');
  });
  
  it('assertRenderable throws for missing lifecycle', () => {
    expect(() => engine.assertRenderable('nonexistent')).toThrow('No lifecycle exists');
    
    console.log('✓ assertRenderable throws for missing');
  });
});

// =============================================================================
// AUDIT LOGGING TESTS
// =============================================================================

describe('Audit Logging', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('transitions create audit trail', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    
    const lifecycle = engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    
    expect(lifecycle.audit_trail_id).toBeTruthy();
    expect(lifecycle.audit_trail_id.startsWith('LC-AUDIT-')).toBe(true);
    
    console.log('✓ Transitions have audit trail ID');
  });
  
  it('transition history is preserved', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    
    const history = engine.getTransitionHistory(snapshotId);
    expect(history.length).toBe(2);
    
    console.log('✓ Transition history preserved');
  });
});

// =============================================================================
// SUPPRESSED NEVER REACTIVATES TESTS
// =============================================================================

describe('SUPPRESSED Never Reactivates', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('SUPPRESSED cannot become ACTIVE', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    // Try every possible way to get back to ACTIVE
    expect(() => engine.transition(snapshotId, 'SUPPRESSED', 'ACTIVE', 'R', 'SYSTEM')).toThrow();
    expect(() => engine.transition(snapshotId, 'SUPPRESSED', 'ELIGIBLE', 'R', 'SYSTEM')).toThrow();
    expect(() => engine.transition(snapshotId, 'SUPPRESSED', 'CONFLICTED', 'R', 'SYSTEM')).toThrow();
    expect(() => engine.transition(snapshotId, 'SUPPRESSED', 'CREATED', 'R', 'SYSTEM')).toThrow();
    
    // Only valid transition is to HISTORICAL_ONLY
    expect(() => engine.transition(snapshotId, 'SUPPRESSED', 'HISTORICAL_ONLY', 'A', 'TIME')).not.toThrow();
    
    console.log('✓ SUPPRESSED can only go to HISTORICAL_ONLY');
  });
});

// =============================================================================
// HISTORICAL_ONLY IS TERMINAL
// =============================================================================

describe('HISTORICAL_ONLY is Terminal', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('HISTORICAL_ONLY has no valid transitions', () => {
    const snapshotId = generateSnapshotId();
    engine.createLifecycle(snapshotId);
    engine.transition(snapshotId, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(snapshotId, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(snapshotId, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    engine.transition(snapshotId, 'SUPPRESSED', 'HISTORICAL_ONLY', 'A', 'TIME');
    
    const allStates: DecisionLifecycleState[] = [
      'CREATED', 'ELIGIBLE', 'CONFLICTED', 'ACTIVE', 
      'SUPPRESSED', 'EXECUTED_SHADOW', 'EXPIRED', 
      'INVALIDATED', 'HISTORICAL_ONLY'
    ];
    
    for (const state of allStates) {
      expect(() => engine.transition(snapshotId, 'HISTORICAL_ONLY', state, 'R', 'SYSTEM')).toThrow();
    }
    
    console.log('✓ HISTORICAL_ONLY is terminal');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 31 BUILD GATE', () => {
  let engine: DecisionLifecycleEngine;
  
  beforeEach(() => {
    engine = getDecisionLifecycleEngine();
  });
  
  it('🔒 Engine is singleton', () => {
    const e1 = getDecisionLifecycleEngine();
    const e2 = getDecisionLifecycleEngine();
    expect(e1).toBe(e2);
    console.log('✓ Engine is singleton');
  });
  
  it('🔒 Illegal transitions throw', () => {
    const id = generateSnapshotId();
    engine.createLifecycle(id);
    expect(() => engine.transition(id, 'CREATED', 'ACTIVE', 'X', 'SYSTEM')).toThrow();
    console.log('✓ Illegal transitions throw');
  });
  
  it('🔒 SUPPRESSED never reactivates', () => {
    const id = generateSnapshotId();
    engine.createLifecycle(id);
    engine.transition(id, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(id, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(id, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    
    expect(() => engine.transition(id, 'SUPPRESSED', 'ACTIVE', 'R', 'SYSTEM')).toThrow();
    console.log('✓ SUPPRESSED never reactivates');
  });
  
  it('🔒 HISTORICAL_ONLY is terminal', () => {
    const id = generateSnapshotId();
    engine.createLifecycle(id);
    engine.transition(id, 'CREATED', 'ELIGIBLE', 'V', 'SYSTEM');
    engine.transition(id, 'ELIGIBLE', 'CONFLICTED', 'M', 'MDCR');
    engine.transition(id, 'CONFLICTED', 'SUPPRESSED', 'K', 'MDCR');
    engine.transition(id, 'SUPPRESSED', 'HISTORICAL_ONLY', 'A', 'TIME');
    
    expect(() => engine.transition(id, 'HISTORICAL_ONLY', 'ACTIVE', 'R', 'SYSTEM')).toThrow();
    console.log('✓ HISTORICAL_ONLY is terminal');
  });
  
  it('🔒 Rendering blocked unless ACTIVE', () => {
    const id = generateSnapshotId();
    engine.createLifecycle(id);
    
    expect(() => engine.assertRenderable(id)).toThrow();
    console.log('✓ Rendering blocked unless ACTIVE');
  });
  
  it('🔒 Missing lifecycle = hard failure', () => {
    expect(() => engine.getCurrentState('missing')).toThrow();
    expect(() => LifecycleGuard.assertActive('missing')).toThrow();
    console.log('✓ Missing lifecycle = hard failure');
  });
  
  it('🔒 All lifecycle objects immutable', () => {
    const id = generateSnapshotId();
    const lc = engine.createLifecycle(id);
    expect(lc._frozen).toBe(true);
    expect(Object.isFrozen(lc)).toBe(true);
    console.log('✓ All lifecycle objects immutable');
  });
  
  it('🔒 LifecycleGuard.assertActive throws for non-ACTIVE', () => {
    const id = generateSnapshotId();
    engine.createLifecycle(id);
    expect(() => LifecycleGuard.assertActive(id)).toThrow();
    console.log('✓ LifecycleGuard works');
  });
});

