/**
 * ShadowExecution - Pre-Trade Simulation Engine
 * 
 * PHASE 17: Let users act without financial risk
 * 
 * RULES (NON-NEGOTIABLE):
 * - No actual broker calls
 * - All shadow executions are audited
 * - Tracks hypothetical P&L over time
 * - Replayable and reversible
 */

import { DecisionContext, PriceData } from '../core/DecisionContext';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getMarketTimeline, MarketTimeline } from '../core/MarketTimeline';
import { MarketEventFactory } from '../core/MarketEvent';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { DecisionOutput } from '../core/DecisionSnapshot';

// =============================================================================
// TYPES
// =============================================================================

export type ShadowOrderType = 'MARKET' | 'LIMIT';
export type ShadowOrderSide = 'BUY' | 'SELL';
export type ShadowOrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'EXPIRED';

export interface ShadowOrder {
  id: string;
  created_at: string;
  filled_at?: string;
  
  // Order details
  symbol: string;
  market: 'US' | 'IN';
  side: ShadowOrderSide;
  quantity: number;
  order_type: ShadowOrderType;
  limit_price?: number;
  
  // Execution
  status: ShadowOrderStatus;
  fill_price?: number;
  fill_quantity?: number;
  
  // Context
  decision_context_id: string;
  reasoning: string;
  
  // Tracking
  entry_value: number;     // Value at time of order
  current_value?: number;  // Current value (if tracking)
  pnl?: number;            // Profit/Loss
  pnl_percent?: number;    // P&L percentage
  
  // Audit
  audit_log_id: string;
}

export interface ShadowPortfolio {
  created_at: string;
  last_updated: string;
  orders: ShadowOrder[];
  total_invested: number;
  current_value: number;
  total_pnl: number;
  total_pnl_percent: number;
}

export interface ShadowExecutionResult {
  success: boolean;
  order?: ShadowOrder;
  error?: string;
  comparison?: {
    if_executed_at: string;
    vs_holding: {
      executed_value: number;
      holding_value: number;
      delta: number;
      delta_percent: number;
    };
    tax_adjusted: {
      executed_after_tax: number;
      holding_after_tax: number;
      delta: number;
    };
  };
}

// =============================================================================
// SHADOW EXECUTION ENGINE
// =============================================================================

export class ShadowExecutionEngine {
  private static instance: ShadowExecutionEngine;
  private orders: Map<string, ShadowOrder> = new Map();
  private auditLog: DecisionAuditLog;
  private timeline: MarketTimeline;
  private dryRunMode: boolean = true; // Always on for shadow
  
  private snapshotAuthority = getSnapshotAuthority();
  
  private constructor() {
    this.auditLog = DecisionAuditLog.getInstance();
    this.timeline = getMarketTimeline();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): ShadowExecutionEngine {
    if (!ShadowExecutionEngine.instance) {
      ShadowExecutionEngine.instance = new ShadowExecutionEngine();
    }
    return ShadowExecutionEngine.instance;
  }
  
  /**
   * Execute a shadow order (no real broker call)
   * PHASE 20: Now creates mandatory snapshot before execution
   */
  public executeShadowOrder(
    symbol: string,
    market: 'US' | 'IN',
    side: ShadowOrderSide,
    quantity: number,
    currentPrice: number,
    context: DecisionContext,
    reasoning: string,
    orderType: ShadowOrderType = 'MARKET',
    limitPrice?: number
  ): ShadowExecutionResult {
    // GATE 1: Context must be valid (MANDATORY)
    if (context.status !== 'VALID') {
      this.auditLog.log({
        event_type: 'EXECUTION_BLOCKED',
        severity: 'WARNING',
        summary: `Shadow execution blocked: Invalid context`,
        details: { symbol, side, quantity, context_status: context.status },
        actor: 'ENGINE'
      });
      return {
        success: false,
        error: 'Cannot execute shadow order: DecisionContext is invalid'
      };
    }
    
    // GATE 2: Create mandatory snapshot BEFORE execution (PHASE 18)
    const outputs: DecisionOutput[] = [{
      action: side,
      symbol: symbol,
      quantity: quantity,
      reasoning: [reasoning],
      confidence: 70, // Default for shadow executions
      expected_return: undefined,
      expected_tax_impact: undefined,
      post_tax_return: undefined
    }];
    
    const snapshotResult = this.snapshotAuthority.createShadowExecutionSnapshot(context, outputs);
    if (!snapshotResult.valid) {
      this.auditLog.log({
        event_type: 'EXECUTION_BLOCKED',
        severity: 'WARNING',
        summary: `Shadow execution blocked: Snapshot creation failed`,
        details: { symbol, side, quantity, reason: snapshotResult.reason },
        actor: 'ENGINE'
      });
      return {
        success: false,
        error: `Cannot execute shadow order: ${snapshotResult.reason}`
      };
    }
    
    const now = new Date().toISOString();
    const orderId = `SHADOW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Log intended execution
    const auditLogId = this.auditLog.logExecutionAttempt({
      action: side,
      symbol,
      quantity,
      is_dry_run: true,
      result: 'SUCCESS',
      reason: `Shadow order at price ${currentPrice.toFixed(2)}`
    });
    
    // Simulate fill (instant for market orders)
    const fillPrice = orderType === 'MARKET' ? currentPrice : (limitPrice || currentPrice);
    const entryValue = quantity * fillPrice;
    
    const order: ShadowOrder = {
      id: orderId,
      created_at: now,
      filled_at: now,
      symbol,
      market,
      side,
      quantity,
      order_type: orderType,
      limit_price: limitPrice,
      status: 'FILLED',
      fill_price: fillPrice,
      fill_quantity: quantity,
      decision_context_id: snapshotResult.snapshot.id, // Use snapshot ID for consequence tracking
      reasoning,
      entry_value: entryValue,
      current_value: entryValue,
      pnl: 0,
      pnl_percent: 0,
      audit_log_id: auditLogId
    };
    
    // Store order
    this.orders.set(orderId, order);
    
    // Add to timeline
    this.timeline.addEvent(
      MarketEventFactory.scenarioSimulated(
        [symbol],
        market,
        orderId,
        `SHADOW ${side} ${quantity} @ ${fillPrice.toFixed(2)}`,
        `Shadow execution: ${side} ${quantity} ${symbol} at ${fillPrice.toFixed(2)}. Reason: ${reasoning}`
      )
    );
    
    // Log result (order filled) with snapshot reference
    this.auditLog.logExecutionAttempt({
      action: `${side}_FILLED`,
      symbol,
      quantity,
      is_dry_run: true,
      result: 'SUCCESS',
      reason: `Filled at ${fillPrice.toFixed(2)}. Snapshot: ${snapshotResult.snapshot.id}`
    });
    
    // NOTE: Consequence will be created when updateWithPrices is called
    // or manually via ConsequenceAuthority.createConsequenceFromShadow
    
    return {
      success: true,
      order
    };
  }
  
  /**
   * Update shadow orders with current prices
   */
  public updateWithPrices(prices: Map<string, PriceData>): void {
    const priceMap = new Map<string, number>();
    prices.forEach((data, symbol) => {
      priceMap.set(symbol.toUpperCase(), data.price);
    });
    
    for (const [orderId, order] of this.orders) {
      const currentPrice = priceMap.get(order.symbol.toUpperCase());
      if (currentPrice) {
        const currentValue = order.fill_quantity! * currentPrice;
        const entryValue = order.entry_value;
        
        // For SELL orders, PnL is inverted
        let pnl: number;
        if (order.side === 'BUY') {
          pnl = currentValue - entryValue;
        } else {
          // For SELL, we compare entry price to current (what we would buy back at)
          pnl = entryValue - currentValue;
        }
        
        const pnlPercent = entryValue > 0 ? (pnl / entryValue) * 100 : 0;
        
        this.orders.set(orderId, {
          ...order,
          current_value: currentValue,
          pnl,
          pnl_percent: pnlPercent
        });
      }
    }
  }
  
  /**
   * Get shadow portfolio summary
   */
  public getPortfolio(): ShadowPortfolio {
    const orders = Array.from(this.orders.values());
    
    let totalInvested = 0;
    let currentValue = 0;
    
    for (const order of orders) {
      if (order.side === 'BUY') {
        totalInvested += order.entry_value;
        currentValue += order.current_value || order.entry_value;
      } else {
        // SELL orders: we "freed" capital
        totalInvested -= order.entry_value;
        currentValue -= order.current_value || order.entry_value;
      }
    }
    
    const totalPnl = currentValue - totalInvested;
    const totalPnlPercent = totalInvested !== 0 ? (totalPnl / Math.abs(totalInvested)) * 100 : 0;
    
    return {
      created_at: orders.length > 0 ? orders[0].created_at : new Date().toISOString(),
      last_updated: new Date().toISOString(),
      orders: orders.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      total_invested: totalInvested,
      current_value: currentValue,
      total_pnl: totalPnl,
      total_pnl_percent: totalPnlPercent
    };
  }
  
  /**
   * Get comparison: "If you had executed..."
   */
  public getComparison(
    orderId: string,
    currentPrice: number,
    holdingPrice: number, // Price if held original position
    taxRate: number = 0.15 // STCG rate
  ): ShadowExecutionResult['comparison'] | null {
    const order = this.orders.get(orderId);
    if (!order) return null;
    
    const executedValue = order.fill_quantity! * currentPrice;
    const holdingValue = order.fill_quantity! * holdingPrice;
    const delta = executedValue - holdingValue;
    const deltaPercent = holdingValue > 0 ? (delta / holdingValue) * 100 : 0;
    
    // Tax-adjusted calculations
    const executedGain = executedValue - order.entry_value;
    const executedTax = executedGain > 0 ? executedGain * taxRate : 0;
    const executedAfterTax = executedValue - executedTax;
    
    const holdingGain = holdingValue - order.entry_value;
    const holdingTax = holdingGain > 0 ? holdingGain * taxRate : 0;
    const holdingAfterTax = holdingValue - holdingTax;
    
    return {
      if_executed_at: order.filled_at || order.created_at,
      vs_holding: {
        executed_value: executedValue,
        holding_value: holdingValue,
        delta,
        delta_percent: deltaPercent
      },
      tax_adjusted: {
        executed_after_tax: executedAfterTax,
        holding_after_tax: holdingAfterTax,
        delta: executedAfterTax - holdingAfterTax
      }
    };
  }
  
  /**
   * Get all shadow orders for a symbol
   */
  public getOrdersBySymbol(symbol: string): ShadowOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Cancel a pending shadow order
   */
  public cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'PENDING') {
      return false;
    }
    
    this.orders.set(orderId, {
      ...order,
      status: 'CANCELLED'
    });
    
    this.auditLog.logExecutionAttempt({
      action: 'CANCEL',
      symbol: order.symbol,
      quantity: order.quantity,
      is_dry_run: true,
      result: 'SUCCESS',
      reason: 'Order cancelled by user'
    });
    
    return true;
  }
  
  /**
   * Replay shadow execution history
   */
  public replayHistory(symbol?: string): ShadowOrder[] {
    let orders = Array.from(this.orders.values());
    
    if (symbol) {
      orders = orders.filter(o => o.symbol.toUpperCase() === symbol.toUpperCase());
    }
    
    return orders.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  
  /**
   * Clear all shadow orders (reset)
   */
  public clear(): void {
    this.orders.clear();
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: 'Shadow portfolio cleared',
      details: { timestamp: new Date().toISOString() },
      actor: 'SYSTEM'
    });
  }
  
  /**
   * Get order by ID
   */
  public getOrder(orderId: string): ShadowOrder | undefined {
    return this.orders.get(orderId);
  }
  
  /**
   * Check if shadow execution is enabled
   */
  public isEnabled(): boolean {
    return this.dryRunMode;
  }
  
  /**
   * Get summary stats
   */
  public getSummaryStats(): {
    totalOrders: number;
    buyOrders: number;
    sellOrders: number;
    totalPnl: number;
    winRate: number;
  } {
    const orders = Array.from(this.orders.values());
    const buyOrders = orders.filter(o => o.side === 'BUY').length;
    const sellOrders = orders.filter(o => o.side === 'SELL').length;
    
    let totalPnl = 0;
    let wins = 0;
    
    for (const order of orders) {
      if (order.pnl !== undefined) {
        totalPnl += order.pnl;
        if (order.pnl > 0) wins++;
      }
    }
    
    const winRate = orders.length > 0 ? (wins / orders.length) * 100 : 0;
    
    return {
      totalOrders: orders.length,
      buyOrders,
      sellOrders,
      totalPnl,
      winRate
    };
  }
}

// Export singleton getter
export const getShadowExecutionEngine = () => ShadowExecutionEngine.getInstance();

export default ShadowExecutionEngine;

