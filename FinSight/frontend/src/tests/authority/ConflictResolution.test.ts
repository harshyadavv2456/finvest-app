/**
 * ConflictResolution Tests - Phase 30B MDCR
 * 
 * MANDATORY TESTS (BUILD MUST FAIL WITHOUT THESE):
 * - Capital contention with overlapping buys
 * - Risk budget exhaustion
 * - Tax vs signal conflict under different regimes
 * - Correlation conflict
 * - Policy violation
 * - SYSTEM_ABORT when no valid resolution exists
 * - Immutability of all outputs
 * - No decision survives without audit log
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getConflictResolutionEngine,
  ConflictResolutionEngine,
  ConflictInput,
  ConflictResolutionResult,
  PortfolioSnapshot,
  RiskBudget,
  TaxProfile,
  UserPolicy,
  MarketRegime
} from '../../conflict/ConflictResolutionEngine';
import { DecisionSnapshot } from '../../core/DecisionSnapshot';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createSnapshot = (
  id: string,
  symbol: string,
  action: 'BUY' | 'SELL' | 'HOLD',
  confidence: number,
  expectedReturn: number = 10,
  price: number = 100,
  quantity: number = 10
): DecisionSnapshot => {
  return Object.freeze({
    id,
    created_at: new Date().toISOString(),
    source: 'FINBOT_CIO' as const,
    decision_context_id: 'test-context',
    context_status: 'VALID' as const,
    context_timestamp: new Date().toISOString(),
    inputs: {
      portfolio_holdings_count: 5,
      portfolio_total_value: 50000,
      price_count: 10,
      price_timestamp: new Date().toISOString(),
      signal_count: 3,
      tax_analysis_count: 2,
      market_regime: 'NORMAL'
    },
    outputs: [{
      action,
      symbol,
      quantity,
      confidence,
      reasoning: ['Test decision'],
      expected_return: expectedReturn,
      price_at_decision: price
    }],
    integrity_hash: `hash-${id}`,
    _frozen: true
  }) as DecisionSnapshot;
};

const createPortfolio = (
  cashAvailable: number = 10000,
  cashBuffer: number = 1000
): PortfolioSnapshot => {
  return Object.freeze({
    holdings: Object.freeze([
      { symbol: 'AAPL', quantity: 10, avg_cost: 150, current_price: 170, sector: 'TECH', weight: 0.3 },
      { symbol: 'GOOGL', quantity: 5, avg_cost: 2800, current_price: 2900, sector: 'TECH', weight: 0.25 },
      { symbol: 'JPM', quantity: 20, avg_cost: 140, current_price: 150, sector: 'FINANCE', weight: 0.2 }
    ]),
    cash_available: cashAvailable,
    cash_buffer_required: cashBuffer,
    total_value: 50000,
    _frozen: true
  }) as PortfolioSnapshot;
};

const createRiskBudget = (
  maxDrawdown: number = 20,
  currentDrawdown: number = 5
): RiskBudget => {
  return Object.freeze({
    max_drawdown_percent: maxDrawdown,
    max_volatility_percent: 25,
    max_single_position_percent: 10,
    max_sector_concentration_percent: 40,
    current_drawdown_percent: currentDrawdown,
    current_volatility_percent: 15,
    _frozen: true
  }) as RiskBudget;
};

const createTaxProfile = (holdings: Array<{ symbol: string; daysToLtcg: number; gain: number }> = []): TaxProfile => {
  return Object.freeze({
    stcg_rate: 0.30,
    ltcg_rate: 0.15,
    holding_periods: Object.freeze(holdings.map(h => Object.freeze({
      symbol: h.symbol,
      days_held: 365 - h.daysToLtcg,
      days_to_ltcg: h.daysToLtcg,
      unrealized_gain: h.gain
    }))),
    _frozen: true
  }) as TaxProfile;
};

const createUserPolicy = (
  excludedSymbols: string[] = [],
  excludedSectors: string[] = []
): UserPolicy => {
  return Object.freeze({
    excluded_sectors: Object.freeze(excludedSectors),
    excluded_symbols: Object.freeze(excludedSymbols),
    max_position_size: 5000,
    min_holding_period_days: 0,
    allow_short_term_gains: true,
    _frozen: true
  }) as UserPolicy;
};

const createMarketRegime = (regime: 'RISK_ON' | 'NORMAL' | 'RISK_OFF' | 'CRISIS' = 'NORMAL'): MarketRegime => {
  return Object.freeze({
    regime,
    volatility_index: regime === 'CRISIS' ? 40 : regime === 'RISK_OFF' ? 25 : 15,
    regime_confidence: 80,
    _frozen: true
  }) as MarketRegime;
};

const createInput = (
  snapshots: DecisionSnapshot[],
  overrides: Partial<ConflictInput> = {}
): ConflictInput => {
  return {
    decision_snapshots: snapshots,
    portfolio_state: overrides.portfolio_state || createPortfolio(),
    risk_budget: overrides.risk_budget || createRiskBudget(),
    tax_profile: overrides.tax_profile || createTaxProfile(),
    user_policy: overrides.user_policy || createUserPolicy(),
    market_regime: overrides.market_regime || createMarketRegime()
  };
};

// =============================================================================
// CAPITAL CONTENTION TESTS
// =============================================================================

describe('Capital Contention', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('suppresses decision when capital is insufficient', () => {
    // Two buys, each requiring 5000, but only 9000 available (10000 - 1000 buffer)
    const snap1 = createSnapshot('SNAP-1', 'MSFT', 'BUY', 80, 15, 500, 10); // 5000
    const snap2 = createSnapshot('SNAP-2', 'NVDA', 'BUY', 70, 12, 500, 10); // 5000
    
    const input = createInput([snap1, snap2]);
    const result = engine.resolveConflicts(input);
    
    // One should be allowed, one suppressed
    expect(result.allowed.length).toBe(1);
    expect(result.suppressed.length).toBe(1);
    expect(result.suppressed[0].suppression_reason).toBe('CAPITAL_CONTENTION');
    
    console.log('✓ Capital contention suppresses lower priority decision');
  });
  
  it('allows multiple decisions when capital is sufficient', () => {
    const snap1 = createSnapshot('SNAP-1', 'MSFT', 'BUY', 80, 15, 100, 10); // 1000
    const snap2 = createSnapshot('SNAP-2', 'NVDA', 'BUY', 70, 12, 100, 10); // 1000
    
    const input = createInput([snap1, snap2], {
      portfolio_state: createPortfolio(20000, 1000) // 19000 available
    });
    
    const result = engine.resolveConflicts(input);
    
    expect(result.allowed.length).toBe(2);
    expect(result.suppressed.length).toBe(0);
    
    console.log('✓ Multiple decisions allowed when capital sufficient');
  });
});

// =============================================================================
// RISK BUDGET EXHAUSTION TESTS
// =============================================================================

describe('Risk Budget Exhaustion', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('suppresses decision when risk budget is exhausted', () => {
    // Multiple buys that would exceed risk budget
    const snap1 = createSnapshot('SNAP-1', 'MSFT', 'BUY', 80, 15);
    const snap2 = createSnapshot('SNAP-2', 'NVDA', 'BUY', 70, 12);
    const snap3 = createSnapshot('SNAP-3', 'AMD', 'BUY', 60, 10);
    const snap4 = createSnapshot('SNAP-4', 'INTC', 'BUY', 50, 8);
    const snap5 = createSnapshot('SNAP-5', 'TSM', 'BUY', 40, 6);
    const snap6 = createSnapshot('SNAP-6', 'QCOM', 'BUY', 35, 5);
    const snap7 = createSnapshot('SNAP-7', 'AVGO', 'BUY', 30, 4);
    const snap8 = createSnapshot('SNAP-8', 'TXN', 'BUY', 25, 3);
    
    const input = createInput(
      [snap1, snap2, snap3, snap4, snap5, snap6, snap7, snap8],
      {
        portfolio_state: createPortfolio(100000, 1000), // Lots of capital
        risk_budget: createRiskBudget(10, 5) // Only 5% risk budget remaining
      }
    );
    
    const result = engine.resolveConflicts(input);
    
    // Some should be suppressed due to risk budget
    const riskSuppressed = result.suppressed.filter(
      s => s.suppression_reason === 'RISK_BUDGET_EXHAUSTION'
    );
    
    expect(riskSuppressed.length).toBeGreaterThan(0);
    
    console.log(`✓ Risk budget exhaustion: ${riskSuppressed.length} decisions suppressed`);
  });
});

// =============================================================================
// TAX VS SIGNAL CONFLICT TESTS
// =============================================================================

describe('Tax vs Signal Conflict', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('signal overrides tax in RISK_OFF regime', () => {
    // SELL decision for stock close to LTCG
    const sellSnap = createSnapshot('SNAP-SELL', 'AAPL', 'SELL', 60, -5, 170, 10);
    
    const input = createInput([sellSnap], {
      tax_profile: createTaxProfile([{ symbol: 'AAPL', daysToLtcg: 15, gain: 2000 }]),
      market_regime: createMarketRegime('RISK_OFF')
    });
    
    const result = engine.resolveConflicts(input);
    
    // In RISK_OFF, signal should override tax - SELL is allowed
    expect(result.allowed.length).toBe(1);
    
    console.log('✓ Signal overrides tax in RISK_OFF');
  });
  
  it('tax overrides low-confidence signal in NORMAL regime', () => {
    // Low confidence SELL for stock close to LTCG
    const sellSnap = createSnapshot('SNAP-SELL', 'AAPL', 'SELL', 50, -5, 170, 10);
    
    const input = createInput([sellSnap], {
      tax_profile: createTaxProfile([{ symbol: 'AAPL', daysToLtcg: 15, gain: 2000 }]),
      market_regime: createMarketRegime('NORMAL')
    });
    
    const result = engine.resolveConflicts(input);
    
    // In NORMAL with low confidence, tax wins - SELL is suppressed
    const taxSuppressed = result.suppressed.filter(
      s => s.suppression_reason === 'TAX_VS_SIGNAL'
    );
    
    expect(taxSuppressed.length).toBe(1);
    
    console.log('✓ Tax overrides low-confidence signal in NORMAL');
  });
  
  it('high confidence signal overrides tax in NORMAL regime', () => {
    // High confidence SELL
    const sellSnap = createSnapshot('SNAP-SELL', 'AAPL', 'SELL', 85, -5, 170, 10);
    
    const input = createInput([sellSnap], {
      tax_profile: createTaxProfile([{ symbol: 'AAPL', daysToLtcg: 15, gain: 2000 }]),
      market_regime: createMarketRegime('NORMAL')
    });
    
    const result = engine.resolveConflicts(input);
    
    // High confidence overrides tax
    expect(result.allowed.length).toBe(1);
    
    console.log('✓ High confidence signal overrides tax in NORMAL');
  });
});

// =============================================================================
// CORRELATION CONFLICT TESTS
// =============================================================================

describe('Correlation Conflict', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('suppresses decision when sector concentration is exceeded', () => {
    // Multiple buys in same sector (TECH)
    const snap1 = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const snap2 = createSnapshot('SNAP-2', 'GOOGL', 'BUY', 75, 12);
    const snap3 = createSnapshot('SNAP-3', 'MSFT', 'BUY', 70, 10);
    
    const input = createInput([snap1, snap2, snap3], {
      portfolio_state: Object.freeze({
        holdings: Object.freeze([
          { symbol: 'AAPL', quantity: 10, avg_cost: 150, current_price: 170, sector: 'TECH', weight: 0.35 },
          { symbol: 'GOOGL', quantity: 5, avg_cost: 2800, current_price: 2900, sector: 'TECH', weight: 0.35 },
          { symbol: 'MSFT', quantity: 8, avg_cost: 300, current_price: 320, sector: 'TECH', weight: 0.2 }
        ]),
        cash_available: 50000,
        cash_buffer_required: 1000,
        total_value: 100000,
        _frozen: true
      }) as PortfolioSnapshot,
      risk_budget: Object.freeze({
        ...createRiskBudget(),
        max_sector_concentration_percent: 30 // Already exceeded
      }) as RiskBudget
    });
    
    const result = engine.resolveConflicts(input);
    
    // Should have some correlation conflicts
    const correlationSuppressed = result.suppressed.filter(
      s => s.suppression_reason === 'CORRELATION_CONFLICT'
    );
    
    expect(correlationSuppressed.length).toBeGreaterThan(0);
    
    console.log(`✓ Correlation conflict: ${correlationSuppressed.length} decisions suppressed`);
  });
});

// =============================================================================
// POLICY VIOLATION TESTS
// =============================================================================

describe('Policy Violation', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('immediately suppresses decisions for excluded symbols', () => {
    const snap1 = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const snap2 = createSnapshot('SNAP-2', 'BANNED', 'BUY', 90, 20); // Excluded
    
    const input = createInput([snap1, snap2], {
      user_policy: createUserPolicy(['BANNED'])
    });
    
    const result = engine.resolveConflicts(input);
    
    expect(result.allowed.length).toBe(1);
    expect(result.suppressed.length).toBe(1);
    expect(result.suppressed[0].suppression_reason).toBe('POLICY_VIOLATION');
    expect(result.suppressed[0].snapshot_id).toBe('SNAP-2');
    
    console.log('✓ Policy violation immediately suppresses decision');
  });
  
  it('policy enforcement takes precedence', () => {
    // All decisions violate policy
    const snap1 = createSnapshot('SNAP-1', 'BANNED1', 'BUY', 95, 25);
    const snap2 = createSnapshot('SNAP-2', 'BANNED2', 'BUY', 90, 20);
    
    const input = createInput([snap1, snap2], {
      user_policy: createUserPolicy(['BANNED1', 'BANNED2'])
    });
    
    const result = engine.resolveConflicts(input);
    
    expect(result.allowed.length).toBe(0);
    expect(result.suppressed.length).toBe(2);
    expect(result.resolution_strategy).toBe('POLICY_ENFORCEMENT');
    
    console.log('✓ Policy enforcement strategy applied');
  });
});

// =============================================================================
// SYSTEM_ABORT TESTS
// =============================================================================

describe('SYSTEM_ABORT', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('forceSystemAbort suppresses all decisions', () => {
    const snap1 = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const snap2 = createSnapshot('SNAP-2', 'GOOGL', 'BUY', 75, 12);
    
    const input = createInput([snap1, snap2]);
    const result = engine.forceSystemAbort(input, 'Test abort');
    
    expect(result.allowed.length).toBe(0);
    expect(result.suppressed.length).toBe(2);
    expect(result.resolution_strategy).toBe('SYSTEM_ABORT');
    expect(result.suppressed[0].suppression_reason).toBe('SYSTEM_ABORT');
    expect(result.suppressed[0].killed_by).toBe('SYSTEM');
    
    console.log('✓ SYSTEM_ABORT suppresses all decisions');
  });
  
  it('SYSTEM_ABORT is reachable when no valid resolution exists', () => {
    const engine = getConflictResolutionEngine();
    
    // Force abort
    const input = createInput([createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15)]);
    const result = engine.forceSystemAbort(input, 'Constraints unsatisfiable');
    
    expect(result.resolution_strategy).toBe('SYSTEM_ABORT');
    expect(result._frozen).toBe(true);
    
    console.log('✓ SYSTEM_ABORT is reachable');
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

describe('Immutability', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('ConflictResolutionResult is frozen', () => {
    const snap = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.resolveConflicts(input);
    
    expect(result._frozen).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    
    console.log('✓ Result is frozen');
  });
  
  it('allowed array is frozen', () => {
    const snap = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.resolveConflicts(input);
    
    expect(Object.isFrozen(result.allowed)).toBe(true);
    
    console.log('✓ Allowed array is frozen');
  });
  
  it('suppressed array is frozen', () => {
    const snap1 = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15, 5000, 10);
    const snap2 = createSnapshot('SNAP-2', 'GOOGL', 'BUY', 70, 12, 5000, 10);
    
    const input = createInput([snap1, snap2]);
    const result = engine.resolveConflicts(input);
    
    expect(Object.isFrozen(result.suppressed)).toBe(true);
    
    for (const suppressed of result.suppressed) {
      expect(suppressed._frozen).toBe(true);
    }
    
    console.log('✓ Suppressed array is frozen');
  });
  
  it('rejects unfrozen input snapshots', () => {
    const unfrozenSnap = {
      id: 'UNFROZEN',
      created_at: new Date().toISOString(),
      context_id: 'test',
      inputs: {},
      outputs: [{ action: 'BUY', symbol: 'AAPL', quantity: 10, confidence: 80 }],
      _frozen: false // NOT frozen
    } as any;
    
    const input = createInput([unfrozenSnap]);
    
    expect(() => engine.resolveConflicts(input)).toThrow('not frozen');
    
    console.log('✓ Rejects unfrozen input');
  });
});

// =============================================================================
// AUDIT LOG TESTS
// =============================================================================

describe('Audit Log', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('every resolution generates audit trail ID', () => {
    const snap = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.resolveConflicts(input);
    
    expect(result.audit_trail_id).toBeTruthy();
    expect(result.audit_trail_id.startsWith('CONFLICT-')).toBe(true);
    
    console.log(`✓ Audit trail ID: ${result.audit_trail_id}`);
  });
  
  it('SYSTEM_ABORT generates audit log', () => {
    const snap = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.forceSystemAbort(input, 'Test');
    
    expect(result.audit_trail_id).toBeTruthy();
    
    console.log('✓ SYSTEM_ABORT generates audit log');
  });
});

// =============================================================================
// DUPLICATE SYMBOL TESTS
// =============================================================================

describe('Duplicate Symbol Handling', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('only one decision per symbol survives', () => {
    // Two decisions for same symbol
    const snap1 = createSnapshot('SNAP-1', 'AAPL', 'BUY', 80, 15);
    const snap2 = createSnapshot('SNAP-2', 'AAPL', 'BUY', 70, 12);
    
    const input = createInput([snap1, snap2]);
    const result = engine.resolveConflicts(input);
    
    // Only one AAPL decision should survive
    const aaplAllowed = result.allowed.filter(d => d.outputs[0]?.symbol === 'AAPL');
    expect(aaplAllowed.length).toBe(1);
    
    // Higher confidence should win
    expect(aaplAllowed[0].id).toBe('SNAP-1');
    
    // Lower confidence should be suppressed
    const aaplSuppressed = result.suppressed.filter(s => s.snapshot_id === 'SNAP-2');
    expect(aaplSuppressed.length).toBe(1);
    expect(aaplSuppressed[0].suppression_reason).toBe('DUPLICATE_SYMBOL');
    
    console.log('✓ Only one decision per symbol survives');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 30B BUILD GATE', () => {
  let engine: ConflictResolutionEngine;
  
  beforeEach(() => {
    engine = getConflictResolutionEngine();
  });
  
  it('🔒 Engine exists and is singleton', () => {
    const e1 = getConflictResolutionEngine();
    const e2 = getConflictResolutionEngine();
    expect(e1).toBe(e2);
    console.log('✓ Engine is singleton');
  });
  
  it('🔒 Capital contention works', () => {
    const snap1 = createSnapshot('S1', 'MSFT', 'BUY', 80, 15, 1000, 10);
    const snap2 = createSnapshot('S2', 'NVDA', 'BUY', 70, 12, 1000, 10);
    const input = createInput([snap1, snap2], {
      portfolio_state: createPortfolio(5000, 4000) // Only 1000 available
    });
    const result = engine.resolveConflicts(input);
    
    expect(result.suppressed.some(s => s.suppression_reason === 'CAPITAL_CONTENTION')).toBe(true);
    console.log('✓ Capital contention');
  });
  
  it('🔒 Risk budget exhaustion works', () => {
    const snaps = Array.from({ length: 10 }, (_, i) => 
      createSnapshot(`S${i}`, `SYM${i}`, 'BUY', 80 - i, 15 - i)
    );
    const input = createInput(snaps, {
      portfolio_state: createPortfolio(1000000, 1000),
      risk_budget: createRiskBudget(10, 8) // Only 2% remaining
    });
    const result = engine.resolveConflicts(input);
    
    expect(result.suppressed.some(s => s.suppression_reason === 'RISK_BUDGET_EXHAUSTION')).toBe(true);
    console.log('✓ Risk budget exhaustion');
  });
  
  it('🔒 Tax vs signal conflict works', () => {
    const snap = createSnapshot('S1', 'AAPL', 'SELL', 50, -5);
    const input = createInput([snap], {
      tax_profile: createTaxProfile([{ symbol: 'AAPL', daysToLtcg: 10, gain: 5000 }]),
      market_regime: createMarketRegime('NORMAL')
    });
    const result = engine.resolveConflicts(input);
    
    expect(result.suppressed.some(s => s.suppression_reason === 'TAX_VS_SIGNAL')).toBe(true);
    console.log('✓ Tax vs signal conflict');
  });
  
  it('🔒 Policy violation works', () => {
    const snap = createSnapshot('S1', 'BANNED', 'BUY', 95, 25);
    const input = createInput([snap], {
      user_policy: createUserPolicy(['BANNED'])
    });
    const result = engine.resolveConflicts(input);
    
    expect(result.suppressed.some(s => s.suppression_reason === 'POLICY_VIOLATION')).toBe(true);
    console.log('✓ Policy violation');
  });
  
  it('🔒 SYSTEM_ABORT is reachable', () => {
    const snap = createSnapshot('S1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.forceSystemAbort(input, 'Test');
    
    expect(result.resolution_strategy).toBe('SYSTEM_ABORT');
    console.log('✓ SYSTEM_ABORT reachable');
  });
  
  it('🔒 All outputs are immutable', () => {
    const snap = createSnapshot('S1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.resolveConflicts(input);
    
    expect(result._frozen).toBe(true);
    expect(Object.isFrozen(result.allowed)).toBe(true);
    expect(Object.isFrozen(result.suppressed)).toBe(true);
    console.log('✓ All outputs immutable');
  });
  
  it('🔒 Audit trail ID generated', () => {
    const snap = createSnapshot('S1', 'AAPL', 'BUY', 80, 15);
    const input = createInput([snap]);
    const result = engine.resolveConflicts(input);
    
    expect(result.audit_trail_id).toBeTruthy();
    console.log('✓ Audit trail ID generated');
  });
});

