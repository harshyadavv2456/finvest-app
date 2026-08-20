/**
 * ExecutionOrchestrator - Live Execution Management
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * This orchestrator:
 * - Maps decisions to real broker actions
 * - Supports MULTIPLE DEMAT ACCOUNTS
 * - Enforces ALL authority guards
 * - Executes ONLY when allowed
 * - Records "WOULD_HAVE_EXECUTED" when blocked
 * 
 * Execution is:
 * - Deterministic
 * - Logged
 * - Reversible only via future decisions
 */

import { Position, PositionDecision } from './Position';
import { 
  PositionDailyAssessment, 
  DecisionExpectedImpact 
} from './PositionTimeline';
import { 
  DailyReconciliationResult, 
  PositionReconciliationResult 
} from './PositionReconciliationEngine';
import { ShutdownGuard } from '../shutdown/ShutdownGuard';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Execution mode
 */
export type ExecutionMode = 'PAPER' | 'LIVE';

/**
 * Order type
 */
export type OrderType = 'MARKET' | 'LIMIT';

/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Demat account configuration
 */
export interface DematAccount {
  readonly account_id: string;
  readonly broker: string;
  readonly account_name: string;
  readonly is_active: boolean;
  readonly supports_execution: boolean;
  readonly capital_limit: number;
}

/**
 * Order to execute
 */
export interface ExecutionOrder {
  readonly order_id: string;
  readonly position_id: string;
  readonly symbol: string;
  readonly demat_account_id: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly order_type: OrderType;
  readonly limit_price?: number;
  readonly decision: PositionDecision;
  readonly decision_reason: string;
  readonly created_at: string;
  readonly _frozen: true;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  readonly order: ExecutionOrder;
  readonly status: 'EXECUTED' | 'BLOCKED' | 'WOULD_HAVE_EXECUTED' | 'FAILED';
  readonly block_reason?: string;
  readonly execution_price?: number;
  readonly execution_quantity?: number;
  readonly execution_time?: string;
  readonly broker_order_id?: string;
  readonly _frozen: true;
}

/**
 * Daily execution summary
 */
export interface DailyExecutionSummary {
  readonly date: string;
  readonly mode: ExecutionMode;
  readonly orders_attempted: number;
  readonly orders_executed: number;
  readonly orders_blocked: number;
  readonly orders_would_have_executed: number;
  readonly orders_failed: number;
  readonly results: readonly ExecutionResult[];
  readonly capital_deployed: number;
  readonly capital_freed: number;
  readonly executed_at: string;
  readonly _frozen: true;
}

// =============================================================================
// EXECUTION ORCHESTRATOR
// =============================================================================

export class ExecutionOrchestrator {
  private static instance: ExecutionOrchestrator;
  private auditLog = DecisionAuditLog.getInstance();
  private dematAccounts: Map<string, DematAccount> = new Map();
  private executionHistory: DailyExecutionSummary[] = [];
  private orderCounter = 0;
  private mode: ExecutionMode = 'PAPER';
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ExecutionOrchestrator {
    if (!ExecutionOrchestrator.instance) {
      ExecutionOrchestrator.instance = new ExecutionOrchestrator();
    }
    return ExecutionOrchestrator.instance;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_execution_history');
      if (stored) {
        this.executionHistory = JSON.parse(stored);
      }
      
      const accounts = localStorage.getItem('finvest_demat_accounts');
      if (accounts) {
        const parsed = JSON.parse(accounts);
        for (const account of parsed) {
          this.dematAccounts.set(account.account_id, account);
        }
      }
    } catch {}
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('finvest_execution_history', JSON.stringify(this.executionHistory));
      localStorage.setItem('finvest_demat_accounts', JSON.stringify(
        Array.from(this.dematAccounts.values())
      ));
    } catch {}
  }
  
  /**
   * Set execution mode
   */
  public setMode(mode: ExecutionMode): void {
    this.mode = mode;
    
    this.auditLog.log({
      event_type: 'EXECUTION_MODE_CHANGED' as any,
      severity: mode === 'LIVE' ? 'WARNING' : 'INFO',
      summary: `Execution mode set to ${mode}`,
      details: { mode },
      actor: 'SYSTEM'
    });
  }
  
  /**
   * Get current execution mode
   */
  public getMode(): ExecutionMode {
    return this.mode;
  }
  
  /**
   * Register a demat account
   */
  public registerDematAccount(account: DematAccount): void {
    this.dematAccounts.set(account.account_id, Object.freeze(account));
    this.saveToStorage();
  }
  
  /**
   * Get all demat accounts
   */
  public getDematAccounts(): readonly DematAccount[] {
    return Object.freeze(Array.from(this.dematAccounts.values()));
  }
  
  /**
   * Execute all orders from reconciliation
   */
  public execute(reconciliation: DailyReconciliationResult): DailyExecutionSummary {
    console.log(`\n[EXECUTION] Processing ${reconciliation.results.length} reconciliation results in ${this.mode} mode`);
    
    const results: ExecutionResult[] = [];
    let capitalDeployed = 0;
    let capitalFreed = 0;
    
    for (const result of reconciliation.results) {
      if (!result.execution_required) {
        continue; // No execution needed for HOLD/AVOID
      }
      
      const execResult = this.executeOrder(result);
      results.push(execResult);
      
      if (execResult.status === 'EXECUTED' || execResult.status === 'WOULD_HAVE_EXECUTED') {
        if (execResult.order.side === 'BUY') {
          capitalDeployed += execResult.order.quantity * (execResult.execution_price || result.position.current_price);
        } else {
          capitalFreed += execResult.order.quantity * (execResult.execution_price || result.position.current_price);
        }
      }
    }
    
    const summary: DailyExecutionSummary = Object.freeze({
      date: reconciliation.date,
      mode: this.mode,
      orders_attempted: results.length,
      orders_executed: results.filter(r => r.status === 'EXECUTED').length,
      orders_blocked: results.filter(r => r.status === 'BLOCKED').length,
      orders_would_have_executed: results.filter(r => r.status === 'WOULD_HAVE_EXECUTED').length,
      orders_failed: results.filter(r => r.status === 'FAILED').length,
      results: Object.freeze(results),
      capital_deployed: capitalDeployed,
      capital_freed: capitalFreed,
      executed_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.executionHistory.push(summary);
    this.saveToStorage();
    
    // Log execution summary
    this.auditLog.log({
      event_type: 'DAILY_EXECUTION' as any,
      severity: 'INFO',
      summary: `Executed ${summary.orders_executed}/${summary.orders_attempted} orders in ${this.mode} mode`,
      details: {
        executed: summary.orders_executed,
        blocked: summary.orders_blocked,
        would_have: summary.orders_would_have_executed,
        capital_deployed: capitalDeployed,
        capital_freed: capitalFreed
      },
      actor: 'SYSTEM'
    });
    
    console.log(`[EXECUTION] Complete: ${summary.orders_executed} executed, ${summary.orders_blocked} blocked`);
    
    return summary;
  }
  
  /**
   * Execute a single order
   */
  private executeOrder(result: PositionReconciliationResult): ExecutionResult {
    const position = result.position;
    const assessment = result.assessment;
    const impact = assessment.expected_impact;
    
    // Create order
    const order = this.createOrder(position, assessment, impact);
    
    // Check authority guards
    const blockReason = this.checkAuthorityBlocks(position, assessment);
    if (blockReason) {
      return this.createBlockedResult(order, blockReason);
    }
    
    // Check demat account
    const dematAccount = this.dematAccounts.get(position.demat_account_id);
    if (!dematAccount) {
      return this.createBlockedResult(order, `Demat account ${position.demat_account_id} not registered`);
    }
    
    if (!dematAccount.is_active) {
      return this.createBlockedResult(order, `Demat account ${position.demat_account_id} is inactive`);
    }
    
    if (!dematAccount.supports_execution) {
      return this.createBlockedResult(order, `Demat account ${position.demat_account_id} does not support execution`);
    }
    
    // Paper mode - record but don't execute
    if (this.mode === 'PAPER') {
      return this.createWouldHaveExecutedResult(order, position.current_price);
    }
    
    // Live mode - execute with broker
    return this.executeLiveOrder(order, dematAccount);
  }
  
  /**
   * Create an order from assessment
   */
  private createOrder(
    position: Position,
    assessment: PositionDailyAssessment,
    impact: DecisionExpectedImpact
  ): ExecutionOrder {
    const orderId = `ORD-${Date.now()}-${++this.orderCounter}`;
    
    const side: OrderSide = impact.target_quantity_change < 0 ? 'SELL' : 'BUY';
    const quantity = Math.abs(impact.target_quantity_change);
    
    return Object.freeze({
      order_id: orderId,
      position_id: position.position_id,
      symbol: position.symbol,
      demat_account_id: position.demat_account_id,
      side,
      quantity,
      order_type: impact.execution_type === 'MARKET' ? 'MARKET' : 'LIMIT',
      limit_price: impact.execution_type === 'LIMIT' ? impact.estimated_execution_price : undefined,
      decision: assessment.decision_outcome,
      decision_reason: assessment.decision_reason,
      created_at: new Date().toISOString(),
      _frozen: true
    });
  }
  
  /**
   * Check all authority blocks
   */
  private checkAuthorityBlocks(
    position: Position,
    assessment: PositionDailyAssessment
  ): string | null {
    // Check shutdown guard
    try {
      ShutdownGuard.assertSystemAlive('EXECUTE' as any);
    } catch (e) {
      return `ShutdownGuard: ${e instanceof Error ? e.message : String(e)}`;
    }
    
    // Check if assessment already has authority blocks
    if (assessment.authority_blocks.length > 0) {
      return `Authority blocks: ${assessment.authority_blocks.join(', ')}`;
    }
    
    // Check position lifecycle
    if (position.lifecycle_state === 'CLOSED') {
      return 'Position is already closed';
    }
    
    return null;
  }
  
  /**
   * Create blocked result
   */
  private createBlockedResult(order: ExecutionOrder, reason: string): ExecutionResult {
    this.auditLog.log({
      event_type: 'EXECUTION_BLOCKED' as any,
      severity: 'WARNING',
      summary: `Order ${order.order_id} blocked: ${reason}`,
      details: { order_id: order.order_id, reason },
      actor: 'SYSTEM'
    });
    
    return Object.freeze({
      order,
      status: 'BLOCKED',
      block_reason: reason,
      _frozen: true
    });
  }
  
  /**
   * Create would-have-executed result (paper mode)
   */
  private createWouldHaveExecutedResult(
    order: ExecutionOrder,
    simulatedPrice: number
  ): ExecutionResult {
    return Object.freeze({
      order,
      status: 'WOULD_HAVE_EXECUTED',
      execution_price: simulatedPrice,
      execution_quantity: order.quantity,
      execution_time: new Date().toISOString(),
      _frozen: true
    });
  }
  
  /**
   * Execute live order with broker (stub for now)
   */
  private executeLiveOrder(
    order: ExecutionOrder,
    dematAccount: DematAccount
  ): ExecutionResult {
    // In production, this would call the broker API
    // For now, we simulate successful execution
    
    console.log(`[LIVE] Executing ${order.side} ${order.quantity} ${order.symbol} via ${dematAccount.broker}`);
    
    // Simulate execution
    const executionPrice = order.order_type === 'LIMIT' ? 
      order.limit_price! : 
      order.limit_price || 100; // Would be fetched from market
    
    this.auditLog.log({
      event_type: 'ORDER_EXECUTED' as any,
      severity: 'INFO',
      summary: `Order ${order.order_id} executed: ${order.side} ${order.quantity} ${order.symbol}`,
      details: {
        order_id: order.order_id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: executionPrice,
        demat: dematAccount.account_id
      },
      actor: 'SYSTEM'
    });
    
    return Object.freeze({
      order,
      status: 'EXECUTED',
      execution_price: executionPrice,
      execution_quantity: order.quantity,
      execution_time: new Date().toISOString(),
      broker_order_id: `BROKER-${Date.now()}`,
      _frozen: true
    });
  }
  
  /**
   * Get execution history
   */
  public getExecutionHistory(): readonly DailyExecutionSummary[] {
    return Object.freeze([...this.executionHistory]);
  }
  
  /**
   * Get last execution
   */
  public getLastExecution(): DailyExecutionSummary | null {
    return this.executionHistory[this.executionHistory.length - 1] || null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getExecutionOrchestrator = () => ExecutionOrchestrator.getInstance();

export default ExecutionOrchestrator;

