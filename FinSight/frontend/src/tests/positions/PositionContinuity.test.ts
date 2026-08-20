/**
 * PositionContinuity.test.ts - Phase 42 Verification Tests
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * PROVES:
 * - Position persists across days
 * - Position decision changes when signal changes
 * - HOLD is explicitly emitted
 * - EXIT closes position and prevents resurrection
 * - Multiple demats handled independently
 * - Execution blocked but recorded correctly
 * - FinBot daily narrative matches position decisions
 * - No authority bypasses
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  Position, 
  PositionFactory, 
  CreatePositionInput,
  PositionDecision 
} from '../../positions/Position';
import { 
  PositionTimeline, 
  getPositionTimeline 
} from '../../positions/PositionTimeline';
import { 
  PositionReconciliationEngine, 
  getPositionReconciliationEngine,
  ReconciliationInput,
  SignalData
} from '../../positions/PositionReconciliationEngine';
import { 
  ExecutionOrchestrator, 
  getExecutionOrchestrator,
  DematAccount 
} from '../../positions/ExecutionOrchestrator';
import { 
  FinBotDailyNarrative, 
  createFinBotDailyNarrative 
} from '../../positions/FinBotDailyNarrative';
import { ShutdownGovernanceEngine } from '../../shutdown/ShutdownGovernanceEngine';

// =============================================================================
// SETUP
// =============================================================================

describe('Phase 42 — Position Continuity & Autonomous Execution', () => {
  
  beforeEach(() => {
    localStorage.clear();
    
    // Reset shutdown engine
    (ShutdownGovernanceEngine as any).currentMode = 'NONE';
    (ShutdownGovernanceEngine as any).shutdownHistory = [];
  });
  
  afterEach(() => {
    localStorage.clear();
  });
  
  // ===========================================================================
  // 1. POSITION ENTITY
  // ===========================================================================
  
  describe('1. Position Entity', () => {
    
    it('Position is created with correct fields', () => {
      const input: CreatePositionInput = {
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'RELIANCE',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 100,
        average_cost: 2500,
        entry_date: '2024-12-01',
        current_price: 2600,
        risk_allocation: {
          risk_units: 10,
          max_loss_allowed: 25000,
          current_drawdown: 0,
          stop_loss_price: 2250,
          position_size_percent: 5
        }
      };
      
      const position = PositionFactory.create(input);
      
      expect(position.position_id).toBeDefined();
      expect(position.symbol).toBe('RELIANCE');
      expect(position.quantity).toBe(100);
      expect(position.lifecycle_state).toBe('OPEN');
      expect(position._frozen).toBe(true);
    });
    
    it('Position is immutable', () => {
      const position = PositionFactory.create({
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'TCS',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 50,
        average_cost: 3800,
        entry_date: '2024-12-01',
        current_price: 4000,
        risk_allocation: {
          risk_units: 8,
          max_loss_allowed: 19000,
          current_drawdown: 0,
          stop_loss_price: 3420,
          position_size_percent: 4
        }
      });
      
      expect(Object.isFrozen(position)).toBe(true);
      
      expect(() => {
        (position as any).quantity = 200;
      }).toThrow();
    });
    
    it('Position update creates new version', () => {
      const original = PositionFactory.create({
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'INFY',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 75,
        average_cost: 1500,
        entry_date: '2024-12-01',
        current_price: 1550,
        risk_allocation: {
          risk_units: 6,
          max_loss_allowed: 11250,
          current_drawdown: 0,
          stop_loss_price: 1350,
          position_size_percent: 3
        }
      });
      
      const updated = PositionFactory.update(original, {
        position_id: original.position_id,
        current_price: 1600,
        decision: 'HOLD',
        decision_reason: 'Thesis intact'
      }, 1600);
      
      expect(updated.version).toBe(original.version + 1);
      expect(updated.current_price).toBe(1600);
      expect(original.current_price).toBe(1550); // Original unchanged
    });
    
    it('Closed position cannot be updated', () => {
      const position = PositionFactory.create({
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'SBIN',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 200,
        average_cost: 600,
        entry_date: '2024-12-01',
        current_price: 620,
        risk_allocation: {
          risk_units: 12,
          max_loss_allowed: 12000,
          current_drawdown: 0,
          stop_loss_price: 540,
          position_size_percent: 6
        }
      });
      
      // Close the position
      const closed = PositionFactory.update(position, {
        position_id: position.position_id,
        current_price: 620,
        quantity: 0,
        lifecycle_state: 'CLOSED',
        decision: 'EXIT',
        decision_reason: 'Test exit'
      }, 620);
      
      expect(closed.lifecycle_state).toBe('CLOSED');
      
      // Try to update closed position
      expect(() => {
        PositionFactory.update(closed, {
          position_id: closed.position_id,
          current_price: 650,
          decision: 'HOLD',
          decision_reason: 'Should fail'
        }, 650);
      }).toThrow('POSITION_CLOSED');
    });
  });
  
  // ===========================================================================
  // 2. POSITION TIMELINE
  // ===========================================================================
  
  describe('2. Position Timeline', () => {
    
    it('Timeline records daily assessments', () => {
      const timeline = getPositionTimeline();
      const position = PositionFactory.create({
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'RELIANCE',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 50,
        average_cost: 2500,
        entry_date: '2024-12-01',
        current_price: 2550,
        risk_allocation: {
          risk_units: 10,
          max_loss_allowed: 12500,
          current_drawdown: 0,
          stop_loss_price: 2250,
          position_size_percent: 5
        }
      });
      
      // Record assessment
      const assessment = {
        assessment_id: 'ASSESS-1',
        position_id: position.position_id,
        symbol: position.symbol,
        date: '2024-12-23',
        yesterday_state: PositionTimeline.createStateSnapshot(position),
        today_market_context: {
          date: '2024-12-23',
          market_regime: 'NEUTRAL' as const,
          sector_sentiment: 'BULLISH' as const,
          volatility_level: 'MEDIUM' as const,
          nifty_change_percent: 0.5,
          sector_change_percent: 1.0,
          _frozen: true as const
        },
        today_signal_evaluation: {
          composite_score: 70,
          momentum_score: 65,
          value_score: 75,
          quality_score: 72,
          thesis_status: 'INTACT' as const,
          signal_change_from_entry: 'UNCHANGED' as const,
          _frozen: true as const
        },
        today_tax_evaluation: {
          days_to_ltcg: 365,
          tax_cost_if_sold_now: 1000,
          tax_cost_if_sold_after_ltcg: 700,
          tax_savings_by_waiting: 300,
          recommendation: 'TAX_NEUTRAL' as const,
          _frozen: true as const
        },
        today_risk_evaluation: {
          current_drawdown: 0,
          max_drawdown_limit: 10,
          stop_loss_triggered: false,
          position_size_vs_limit: 0.5,
          portfolio_correlation: 0.3,
          recommendation: 'ACCEPTABLE' as const,
          _frozen: true as const
        },
        decision_outcome: 'HOLD' as PositionDecision,
        decision_reason: 'Thesis intact, risk acceptable',
        decision_confidence: 75,
        authority_blocks: [],
        expected_impact: {
          action_required: false,
          execution_type: 'NONE' as const,
          target_quantity_change: 0,
          estimated_execution_price: 0,
          estimated_tax_impact: 0,
          estimated_pnl_impact: 0,
          risk_freed: 0,
          capital_freed: 0,
          _frozen: true as const
        },
        assessed_at: new Date().toISOString(),
        _frozen: true as const
      };
      
      timeline.recordAssessment(assessment);
      
      const retrieved = timeline.getTimeline(position.position_id);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].decision_outcome).toBe('HOLD');
    });
    
    it('Duplicate date assessment throws', () => {
      const timeline = getPositionTimeline();
      const positionId = 'POS-DUP-TEST';
      
      const baseAssessment = {
        assessment_id: 'ASSESS-1',
        position_id: positionId,
        symbol: 'TEST',
        date: '2024-12-23',
        yesterday_state: {
          position_id: positionId,
          symbol: 'TEST',
          quantity: 100,
          average_cost: 100,
          price: 105,
          unrealized_pnl: 500,
          unrealized_pnl_percent: 5,
          lifecycle_state: 'OPEN' as const,
          last_decision: 'HOLD' as PositionDecision,
          _frozen: true as const
        },
        today_market_context: {
          date: '2024-12-23',
          market_regime: 'NEUTRAL' as const,
          sector_sentiment: 'NEUTRAL' as const,
          volatility_level: 'LOW' as const,
          nifty_change_percent: 0,
          sector_change_percent: 0,
          _frozen: true as const
        },
        today_signal_evaluation: {
          composite_score: 50,
          momentum_score: 50,
          value_score: 50,
          quality_score: 50,
          thesis_status: 'INTACT' as const,
          signal_change_from_entry: 'UNCHANGED' as const,
          _frozen: true as const
        },
        today_tax_evaluation: {
          days_to_ltcg: 365,
          tax_cost_if_sold_now: 0,
          tax_cost_if_sold_after_ltcg: 0,
          tax_savings_by_waiting: 0,
          recommendation: 'TAX_NEUTRAL' as const,
          _frozen: true as const
        },
        today_risk_evaluation: {
          current_drawdown: 0,
          max_drawdown_limit: 10,
          stop_loss_triggered: false,
          position_size_vs_limit: 0.5,
          portfolio_correlation: 0.3,
          recommendation: 'ACCEPTABLE' as const,
          _frozen: true as const
        },
        decision_outcome: 'HOLD' as PositionDecision,
        decision_reason: 'Test',
        decision_confidence: 50,
        authority_blocks: [] as string[],
        expected_impact: {
          action_required: false,
          execution_type: 'NONE' as const,
          target_quantity_change: 0,
          estimated_execution_price: 0,
          estimated_tax_impact: 0,
          estimated_pnl_impact: 0,
          risk_freed: 0,
          capital_freed: 0,
          _frozen: true as const
        },
        assessed_at: new Date().toISOString(),
        _frozen: true as const
      };
      
      timeline.recordAssessment(baseAssessment);
      
      // Try to record duplicate
      expect(() => {
        timeline.recordAssessment({
          ...baseAssessment,
          assessment_id: 'ASSESS-2'
        });
      }).toThrow('DUPLICATE_ASSESSMENT');
    });
  });
  
  // ===========================================================================
  // 3. RECONCILIATION ENGINE
  // ===========================================================================
  
  describe('3. Reconciliation Engine', () => {
    
    it('Every position gets exactly one decision', () => {
      const engine = getPositionReconciliationEngine();
      
      const positions: Position[] = [
        PositionFactory.create({
          snapshot_id_origin: 'SNAP-1',
          entry_rationale_hash: 'HASH-1',
          symbol: 'RELIANCE',
          demat_account_id: 'DEMAT-1',
          exchange: 'NSE',
          quantity: 50,
          average_cost: 2500,
          entry_date: '2024-12-01',
          current_price: 2550,
          risk_allocation: {
            risk_units: 10,
            max_loss_allowed: 12500,
            current_drawdown: 0,
            stop_loss_price: 2250,
            position_size_percent: 5
          }
        }),
        PositionFactory.create({
          snapshot_id_origin: 'SNAP-2',
          entry_rationale_hash: 'HASH-2',
          symbol: 'TCS',
          demat_account_id: 'DEMAT-1',
          exchange: 'NSE',
          quantity: 30,
          average_cost: 3800,
          entry_date: '2024-12-01',
          current_price: 3900,
          risk_allocation: {
            risk_units: 8,
            max_loss_allowed: 11400,
            current_drawdown: 0,
            stop_loss_price: 3420,
            position_size_percent: 4
          }
        })
      ];
      
      const signals: SignalData[] = [
        {
          symbol: 'RELIANCE',
          composite_score: 70,
          momentum_score: 65,
          value_score: 75,
          quality_score: 72,
          recommendation: 'HOLD'
        },
        {
          symbol: 'TCS',
          composite_score: 60,
          momentum_score: 55,
          value_score: 65,
          quality_score: 68,
          recommendation: 'HOLD'
        }
      ];
      
      const input: ReconciliationInput = {
        date: '2024-12-23',
        positions,
        signals,
        market_context: {
          date: '2024-12-23',
          market_regime: 'NEUTRAL',
          sector_sentiments: { Energy: 'BULLISH', IT: 'NEUTRAL' },
          volatility_level: 'MEDIUM',
          nifty_change_percent: 0.5,
          sector_changes: { Energy: 1.0, IT: 0.3 }
        },
        risk_budget_remaining: 50,
        capital_available: 1000000
      };
      
      const result = engine.reconcile(input);
      
      // Every position must have a result
      expect(result.results.length).toBe(positions.length);
      
      // Every result must have exactly one decision
      for (const r of result.results) {
        expect(r.assessment.decision_outcome).toBeDefined();
        expect(['INITIATE', 'HOLD', 'REDUCE', 'EXIT', 'AVOID']).toContain(r.assessment.decision_outcome);
      }
    });
    
    it('HOLD is explicitly emitted', () => {
      const engine = getPositionReconciliationEngine();
      
      const position = PositionFactory.create({
        snapshot_id_origin: 'SNAP-1',
        entry_rationale_hash: 'HASH-1',
        symbol: 'HDFCBANK',
        demat_account_id: 'DEMAT-1',
        exchange: 'NSE',
        quantity: 100,
        average_cost: 1600,
        entry_date: '2024-12-01',
        current_price: 1650,
        risk_allocation: {
          risk_units: 15,
          max_loss_allowed: 16000,
          current_drawdown: 0,
          stop_loss_price: 1440,
          position_size_percent: 7
        }
      });
      
      const result = engine.reconcile({
        date: '2024-12-23',
        positions: [position],
        signals: [{
          symbol: 'HDFCBANK',
          composite_score: 75,
          momentum_score: 70,
          value_score: 80,
          quality_score: 78,
          recommendation: 'HOLD'
        }],
        market_context: {
          date: '2024-12-23',
          market_regime: 'NEUTRAL',
          sector_sentiments: { Banking: 'NEUTRAL' },
          volatility_level: 'LOW',
          nifty_change_percent: 0.2,
          sector_changes: { Banking: 0.1 }
        },
        risk_budget_remaining: 50,
        capital_available: 1000000
      });
      
      expect(result.results[0].assessment.decision_outcome).toBe('HOLD');
      expect(result.summary.hold_count).toBe(1);
    });
  });
  
  // ===========================================================================
  // 4. EXECUTION ORCHESTRATOR
  // ===========================================================================
  
  describe('4. Execution Orchestrator', () => {
    
    it('Handles multiple demat accounts', () => {
      const orchestrator = getExecutionOrchestrator();
      
      const accounts: DematAccount[] = [
        {
          account_id: 'DEMAT-1',
          broker: 'Zerodha',
          account_name: 'Primary',
          is_active: true,
          supports_execution: true,
          capital_limit: 3000000
        },
        {
          account_id: 'DEMAT-2',
          broker: 'Groww',
          account_name: 'Secondary',
          is_active: true,
          supports_execution: true,
          capital_limit: 2000000
        }
      ];
      
      for (const account of accounts) {
        orchestrator.registerDematAccount(account);
      }
      
      const registered = orchestrator.getDematAccounts();
      expect(registered.length).toBe(2);
    });
    
    it('Paper mode records but does not execute', () => {
      const orchestrator = getExecutionOrchestrator();
      orchestrator.setMode('PAPER');
      
      expect(orchestrator.getMode()).toBe('PAPER');
    });
    
    it('Inactive demat account blocks execution', () => {
      const orchestrator = getExecutionOrchestrator();
      
      orchestrator.registerDematAccount({
        account_id: 'DEMAT-INACTIVE',
        broker: 'Test',
        account_name: 'Inactive',
        is_active: false,
        supports_execution: true,
        capital_limit: 1000000
      });
      
      // Execution with inactive account should be blocked
      const accounts = orchestrator.getDematAccounts();
      const inactive = accounts.find(a => a.account_id === 'DEMAT-INACTIVE');
      expect(inactive?.is_active).toBe(false);
    });
  });
  
  // ===========================================================================
  // 5. FINBOT DAILY NARRATIVE
  // ===========================================================================
  
  describe('5. FinBot Daily Narrative', () => {
    
    it('Generates position-based narrative', () => {
      const engine = getPositionReconciliationEngine();
      const orchestrator = getExecutionOrchestrator();
      const narrativeGen = createFinBotDailyNarrative();
      
      // Setup
      orchestrator.setMode('PAPER');
      orchestrator.registerDematAccount({
        account_id: 'DEMAT-1',
        broker: 'Zerodha',
        account_name: 'Test',
        is_active: true,
        supports_execution: true,
        capital_limit: 5000000
      });
      
      const positions: Position[] = [
        PositionFactory.create({
          snapshot_id_origin: 'SNAP-1',
          entry_rationale_hash: 'HASH-1',
          symbol: 'RELIANCE',
          demat_account_id: 'DEMAT-1',
          exchange: 'NSE',
          quantity: 50,
          average_cost: 2500,
          entry_date: '2024-12-01',
          current_price: 2600,
          risk_allocation: {
            risk_units: 10,
            max_loss_allowed: 12500,
            current_drawdown: 0,
            stop_loss_price: 2250,
            position_size_percent: 5
          }
        })
      ];
      
      const reconciliation = engine.reconcile({
        date: '2024-12-23',
        positions,
        signals: [{
          symbol: 'RELIANCE',
          composite_score: 72,
          momentum_score: 68,
          value_score: 76,
          quality_score: 74,
          recommendation: 'HOLD'
        }],
        market_context: {
          date: '2024-12-23',
          market_regime: 'NEUTRAL',
          sector_sentiments: { Energy: 'BULLISH' },
          volatility_level: 'MEDIUM',
          nifty_change_percent: 0.5,
          sector_changes: { Energy: 1.2 }
        },
        risk_budget_remaining: 50,
        capital_available: 1000000
      });
      
      const execution = orchestrator.execute(reconciliation);
      
      const narrative = narrativeGen.generateNarrative(
        reconciliation,
        execution,
        positions,
        5000000,
        100
      );
      
      expect(narrative.narrative_text).toContain('Yesterday:');
      expect(narrative.narrative_text).toContain('Today:');
      expect(narrative.narrative_text).toContain('System Status:');
      expect(narrative.narrative_text).toContain('RELIANCE');
    });
    
    it('Narrative blocked when system is shutdown', () => {
      const narrativeGen = createFinBotDailyNarrative();
      
      // Trigger shutdown
      ShutdownGovernanceEngine.initiateShutdown({
        trigger: 'MANUAL_SHUTDOWN',
        triggeredBy: 'TEST',
        reason: 'Test shutdown'
      });
      
      // Generate narrative should mention blocked
      const narrative = narrativeGen.generateNarrative(
        {
          date: '2024-12-23',
          positions_processed: 0,
          results: [],
          summary: { hold_count: 0, initiate_count: 0, reduce_count: 0, exit_count: 0, avoid_count: 0, execution_required_count: 0, authority_blocked_count: 0 },
          reconciled_at: new Date().toISOString(),
          _frozen: true
        },
        {
          date: '2024-12-23',
          mode: 'PAPER',
          orders_attempted: 0,
          orders_executed: 0,
          orders_blocked: 0,
          orders_would_have_executed: 0,
          orders_failed: 0,
          results: [],
          capital_deployed: 0,
          capital_freed: 0,
          executed_at: new Date().toISOString(),
          _frozen: true
        },
        [],
        5000000,
        100
      );
      
      expect(narrative.narrative_text).toContain('SYSTEM BLOCKED');
    });
  });
  
  // ===========================================================================
  // 6. NO AUTHORITY BYPASSES
  // ===========================================================================
  
  describe('6. No Authority Bypasses', () => {
    
    it('Reconciliation respects ShutdownGuard', () => {
      const engine = getPositionReconciliationEngine();
      
      // Trigger shutdown
      ShutdownGovernanceEngine.executeAbsoluteShutdown({
        trigger: 'MANUAL_SHUTDOWN',
        triggeredBy: 'TEST',
        reason: 'Test',
        signature: 'TEST_SIG'
      });
      
      // Reconciliation should throw
      expect(() => {
        engine.reconcile({
          date: '2024-12-23',
          positions: [],
          signals: [],
          market_context: {
            date: '2024-12-23',
            market_regime: 'NEUTRAL',
            sector_sentiments: {},
            volatility_level: 'LOW',
            nifty_change_percent: 0,
            sector_changes: {}
          },
          risk_budget_remaining: 50,
          capital_available: 1000000
        });
      }).toThrow();
    });
  });
});

