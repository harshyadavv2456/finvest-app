/**
 * DailySimulation - Daily Position Simulation Runner
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * RUN:
 * - npm run positions:daily-sim (paper mode)
 * - npm run positions:daily-live (live mode - requires broker setup)
 * 
 * This script:
 * - Loads all positions
 * - Gets today's signals
 * - Runs reconciliation
 * - Executes orders (paper or live)
 * - Generates daily narrative
 */

import { 
  Position, 
  PositionFactory, 
  PositionDecision,
  CreatePositionInput 
} from './Position';
import { 
  PositionReconciliationEngine, 
  getPositionReconciliationEngine,
  ReconciliationInput,
  SignalData,
  MarketContextInput
} from './PositionReconciliationEngine';
import { 
  ExecutionOrchestrator, 
  getExecutionOrchestrator,
  ExecutionMode,
  DematAccount
} from './ExecutionOrchestrator';
import { 
  FinBotDailyNarrative, 
  createFinBotDailyNarrative 
} from './FinBotDailyNarrative';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { ShutdownGovernanceEngine } from '../shutdown/ShutdownGovernanceEngine';

// =============================================================================
// SIMULATION RESULT
// =============================================================================

export interface DailySimulationResult {
  readonly date: string;
  readonly mode: ExecutionMode;
  readonly positions_count: number;
  readonly decisions: {
    readonly hold: number;
    readonly reduce: number;
    readonly exit: number;
    readonly avoid: number;
  };
  readonly executions: {
    readonly attempted: number;
    readonly completed: number;
    readonly blocked: number;
  };
  readonly narrative: string;
  readonly success: boolean;
  readonly error?: string;
  readonly duration_ms: number;
}

// =============================================================================
// DAILY SIMULATION RUNNER
// =============================================================================

export class DailySimulationRunner {
  private reconciliationEngine = getPositionReconciliationEngine();
  private executionOrchestrator = getExecutionOrchestrator();
  private auditLog = DecisionAuditLog.getInstance();
  private positions: Position[] = [];
  
  /**
   * Run daily simulation
   */
  public async run(mode: ExecutionMode = 'PAPER'): Promise<DailySimulationResult> {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  DAILY POSITION SIMULATION — PHASE 42                      ║');
    console.log(`║  Date: ${today}  Mode: ${mode.padEnd(5)}                           ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    try {
      // Check system is alive
      const shutdownState = ShutdownGovernanceEngine.getState();
      if (shutdownState.mode !== 'NONE') {
        throw new Error(`System is in ${shutdownState.mode} mode`);
      }
      
      // Set execution mode
      this.executionOrchestrator.setMode(mode);
      
      // Step 1: Load positions
      console.log('[1] Loading positions...');
      this.loadPositions();
      console.log(`    Loaded ${this.positions.length} positions`);
      
      // Step 2: Setup demat accounts (demo)
      console.log('[2] Setting up demat accounts...');
      this.setupDematAccounts();
      
      // Step 3: Get today's signals
      console.log('[3] Fetching signals...');
      const signals = this.getSimulatedSignals();
      
      // Step 4: Get market context
      console.log('[4] Getting market context...');
      const marketContext = this.getSimulatedMarketContext(today);
      
      // Step 5: Run reconciliation
      console.log('[5] Running reconciliation...');
      const reconciliationInput: ReconciliationInput = {
        date: today,
        positions: this.positions,
        signals,
        market_context: marketContext,
        risk_budget_remaining: 50, // 50% remaining
        capital_available: 1000000 // 10L available
      };
      
      const reconciliation = this.reconciliationEngine.reconcile(reconciliationInput);
      
      // Step 6: Execute orders
      console.log('[6] Executing orders...');
      const execution = this.executionOrchestrator.execute(reconciliation);
      
      // Step 7: Generate narrative
      console.log('[7] Generating narrative...');
      const narrativeGenerator = createFinBotDailyNarrative();
      const narrative = narrativeGenerator.generateNarrative(
        reconciliation,
        execution,
        this.positions,
        5000000, // 50L total capital
        100 // Risk limit
      );
      
      // Print narrative
      console.log('\n────────────────────────────────────────────────────────────');
      console.log('  DAILY NARRATIVE');
      console.log('────────────────────────────────────────────────────────────\n');
      console.log(narrative.narrative_text);
      console.log('\n────────────────────────────────────────────────────────────\n');
      
      const duration = Date.now() - startTime;
      
      const result: DailySimulationResult = {
        date: today,
        mode,
        positions_count: this.positions.length,
        decisions: {
          hold: reconciliation.summary.hold_count,
          reduce: reconciliation.summary.reduce_count,
          exit: reconciliation.summary.exit_count,
          avoid: reconciliation.summary.avoid_count
        },
        executions: {
          attempted: execution.orders_attempted,
          completed: execution.orders_executed + execution.orders_would_have_executed,
          blocked: execution.orders_blocked
        },
        narrative: narrative.narrative_text,
        success: true,
        duration_ms: duration
      };
      
      console.log('✅ Daily simulation complete');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Positions: ${result.positions_count}`);
      console.log(`   Decisions: HOLD=${result.decisions.hold} REDUCE=${result.decisions.reduce} EXIT=${result.decisions.exit}`);
      console.log(`   Executions: ${result.executions.completed}/${result.executions.attempted}`);
      
      return result;
      
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e.message : String(e);
      
      console.error(`\n❌ Daily simulation failed: ${error}`);
      
      return {
        date: today,
        mode,
        positions_count: this.positions.length,
        decisions: { hold: 0, reduce: 0, exit: 0, avoid: 0 },
        executions: { attempted: 0, completed: 0, blocked: 0 },
        narrative: '',
        success: false,
        error,
        duration_ms: duration
      };
    }
  }
  
  /**
   * Load positions from storage or create demo positions
   */
  private loadPositions(): void {
    // Try to load from storage
    try {
      const stored = localStorage.getItem('finvest_positions');
      if (stored) {
        this.positions = JSON.parse(stored);
        return;
      }
    } catch {}
    
    // Create demo positions
    this.positions = this.createDemoPositions();
    this.savePositions();
  }
  
  /**
   * Save positions to storage
   */
  private savePositions(): void {
    try {
      localStorage.setItem('finvest_positions', JSON.stringify(this.positions));
    } catch {}
  }
  
  /**
   * Create demo positions for simulation
   */
  private createDemoPositions(): Position[] {
    const demoPositions: CreatePositionInput[] = [
      {
        snapshot_id_origin: 'SNAP-DEMO-1',
        entry_rationale_hash: 'HASH-DEMO-1',
        symbol: 'RELIANCE',
        demat_account_id: 'DEMAT-001',
        exchange: 'NSE',
        quantity: 50,
        average_cost: 2450,
        entry_date: '2024-11-01',
        current_price: 2580,
        risk_allocation: {
          risk_units: 15,
          max_loss_allowed: 12250,
          current_drawdown: -5.3,
          stop_loss_price: 2200,
          position_size_percent: 6
        }
      },
      {
        snapshot_id_origin: 'SNAP-DEMO-2',
        entry_rationale_hash: 'HASH-DEMO-2',
        symbol: 'TCS',
        demat_account_id: 'DEMAT-001',
        exchange: 'NSE',
        quantity: 30,
        average_cost: 3800,
        entry_date: '2024-10-15',
        current_price: 4050,
        risk_allocation: {
          risk_units: 12,
          max_loss_allowed: 11400,
          current_drawdown: 0,
          stop_loss_price: 3420,
          position_size_percent: 5
        }
      },
      {
        snapshot_id_origin: 'SNAP-DEMO-3',
        entry_rationale_hash: 'HASH-DEMO-3',
        symbol: 'HDFCBANK',
        demat_account_id: 'DEMAT-002',
        exchange: 'NSE',
        quantity: 100,
        average_cost: 1650,
        entry_date: '2024-09-01',
        current_price: 1720,
        risk_allocation: {
          risk_units: 18,
          max_loss_allowed: 16500,
          current_drawdown: 0,
          stop_loss_price: 1485,
          position_size_percent: 8
        }
      }
    ];
    
    return demoPositions.map(input => PositionFactory.create(input));
  }
  
  /**
   * Setup demo demat accounts
   */
  private setupDematAccounts(): void {
    const accounts: DematAccount[] = [
      {
        account_id: 'DEMAT-001',
        broker: 'Zerodha',
        account_name: 'Primary Trading',
        is_active: true,
        supports_execution: true,
        capital_limit: 3000000
      },
      {
        account_id: 'DEMAT-002',
        broker: 'Groww',
        account_name: 'Secondary',
        is_active: true,
        supports_execution: true,
        capital_limit: 2000000
      }
    ];
    
    for (const account of accounts) {
      this.executionOrchestrator.registerDematAccount(account);
    }
  }
  
  /**
   * Get simulated signals
   */
  private getSimulatedSignals(): SignalData[] {
    return [
      {
        symbol: 'RELIANCE',
        composite_score: 72,
        momentum_score: 68,
        value_score: 75,
        quality_score: 80,
        recommendation: 'HOLD'
      },
      {
        symbol: 'TCS',
        composite_score: 65,
        momentum_score: 60,
        value_score: 70,
        quality_score: 78,
        recommendation: 'HOLD'
      },
      {
        symbol: 'HDFCBANK',
        composite_score: 55,
        momentum_score: 45,
        value_score: 60,
        quality_score: 72,
        recommendation: 'HOLD'
      }
    ];
  }
  
  /**
   * Get simulated market context
   */
  private getSimulatedMarketContext(date: string): MarketContextInput {
    return {
      date,
      market_regime: 'NEUTRAL',
      sector_sentiments: {
        'Energy': 'BULLISH',
        'IT': 'NEUTRAL',
        'Banking': 'BEARISH'
      },
      volatility_level: 'MEDIUM',
      nifty_change_percent: 0.5,
      sector_changes: {
        'Energy': 1.2,
        'IT': 0.3,
        'Banking': -0.8
      }
    };
  }
}

// =============================================================================
// RUN FUNCTIONS
// =============================================================================

export async function runDailySimulation(): Promise<DailySimulationResult> {
  const runner = new DailySimulationRunner();
  return runner.run('PAPER');
}

export async function runDailyLive(): Promise<DailySimulationResult> {
  const runner = new DailySimulationRunner();
  return runner.run('LIVE');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default DailySimulationRunner;

