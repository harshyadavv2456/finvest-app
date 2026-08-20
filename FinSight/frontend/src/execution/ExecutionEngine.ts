/**
 * Execution Engine (LOCKED)
 * 
 * Execution exists but is NEVER automatic.
 * 
 * Safety Rules:
 * - Requires explicit user confirmation
 * - Uses broker SDKs only (no scraping)
 * - Supports only CNC equity orders (Market / Limit)
 * - Cannot execute without TaxAwareAllocator output
 * - Cannot execute if price deviates > X%
 * - Dry-run mode default ON
 * 
 * Supported brokers (STUB ONLY):
 * - Zerodha
 * - Angel One
 * - Upstox
 * 
 * NO EXECUTION IS ACTUALLY PERFORMED.
 * This is a planning and validation layer only.
 */

import { AllocationRecommendation, AllocationPlan } from '../engines/TaxAwareAllocator';

// Execution status
export type ExecutionStatus = 
  | 'DISABLED'          // Default state
  | 'PENDING_APPROVAL'  // Awaiting user confirmation
  | 'APPROVED'          // User approved, ready to execute
  | 'DRY_RUN'          // Simulating execution
  | 'EXECUTING'        // Actually executing (LOCKED)
  | 'COMPLETED'        // Execution done
  | 'FAILED'           // Execution failed
  | 'CANCELLED';       // User cancelled

// Order types
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderSide = 'BUY' | 'SELL';
export type ProductType = 'CNC' | 'MIS'; // Only CNC supported

// Broker types
export type BrokerType = 'ZERODHA' | 'ANGEL_ONE' | 'UPSTOX' | 'NOT_CONNECTED';

/**
 * Broker connection status
 */
export interface BrokerConnection {
  broker: BrokerType;
  is_connected: boolean;
  connection_status: 'NOT_CONNECTED' | 'CONNECTED' | 'EXPIRED' | 'ERROR';
  last_connected?: string;
  error_message?: string;
  capabilities: {
    can_place_orders: boolean;
    can_modify_orders: boolean;
    can_cancel_orders: boolean;
  };
}

/**
 * Order request (not executed, just validated)
 */
export interface OrderRequest {
  id: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  side: OrderSide;
  quantity: number;
  order_type: OrderType;
  limit_price?: number;
  product_type: ProductType;
  recommendation_id?: string;
  
  // Validation
  is_valid: boolean;
  validation_errors: string[];
  
  // Tax impact
  estimated_tax: number;
  tax_reasoning: string[];
}

/**
 * Execution plan (validated, not executed)
 */
export interface ExecutionPlan {
  id: string;
  created_at: string;
  status: ExecutionStatus;
  
  // Source
  allocation_plan: AllocationPlan;
  
  // Orders
  orders: OrderRequest[];
  
  // Summary
  total_buy_value: number;
  total_sell_value: number;
  estimated_tax: number;
  
  // Validation
  is_valid: boolean;
  validation_errors: string[];
  warnings: string[];
  
  // Confirmation
  requires_otp: boolean;
  requires_confirmation: boolean;
  confirmation_message: string;
}

/**
 * Execution result (always a simulation in current phase)
 */
export interface ExecutionResult {
  plan_id: string;
  executed_at: string;
  status: 'DRY_RUN' | 'NOT_EXECUTED';
  reason: string;
  orders_simulated: number;
  simulated_cost: number;
  simulated_tax: number;
}

/**
 * Execution Engine
 * 
 * IMPORTANT: All execution is LOCKED.
 * This engine validates and simulates but does NOT execute.
 */
export class ExecutionEngine {
  private static instance: ExecutionEngine;
  
  // LOCKED: Execution is disabled by default
  private isExecutionEnabled: boolean = false;
  private isDryRunMode: boolean = true;
  // Price deviation threshold for validation (not used currently)
  // private priceDeviationThreshold: number = 0.02; // 2%
  
  // Broker connection
  private brokerConnection: BrokerConnection = {
    broker: 'NOT_CONNECTED',
    is_connected: false,
    connection_status: 'NOT_CONNECTED',
    capabilities: {
      can_place_orders: false,
      can_modify_orders: false,
      can_cancel_orders: false
    }
  };

  private constructor() {}

  static getInstance(): ExecutionEngine {
    if (!ExecutionEngine.instance) {
      ExecutionEngine.instance = new ExecutionEngine();
    }
    return ExecutionEngine.instance;
  }

  /**
   * Get execution status
   * Always returns DISABLED in current phase
   */
  getStatus(): ExecutionStatus {
    if (!this.isExecutionEnabled) {
      return 'DISABLED';
    }
    if (this.isDryRunMode) {
      return 'DRY_RUN';
    }
    return 'DISABLED'; // Always disabled for safety
  }

  /**
   * Get broker connection status
   */
  getBrokerConnection(): BrokerConnection {
    return { ...this.brokerConnection };
  }

  /**
   * Check if execution is available
   * Always returns false in current phase
   */
  isExecutionAvailable(): boolean {
    return false; // LOCKED
  }

  /**
   * Get reason why execution is disabled
   */
  getDisabledReason(): string {
    return 'Execution is currently disabled. FinVest is in read-only mode. ' +
           'All recommendations are for informational purposes only. ' +
           'Please execute trades manually through your broker.';
  }

  /**
   * Create execution plan from allocation plan
   * This validates but does NOT execute
   */
  createExecutionPlan(allocationPlan: AllocationPlan): ExecutionPlan {
    const orders: OrderRequest[] = [];
    const warnings: string[] = [];
    const validationErrors: string[] = [];

    // Always add the disabled warning
    warnings.push('EXECUTION DISABLED: All orders are simulated only');

    // Convert recommendations to order requests
    for (const rec of allocationPlan.recommendations) {
      if (rec.action === 'HOLD') continue; // No order for HOLD

      const order = this.createOrderRequest(rec);
      orders.push(order);

      if (!order.is_valid) {
        validationErrors.push(...order.validation_errors);
      }
    }

    const totalBuy = orders
      .filter(o => o.side === 'BUY')
      .reduce((sum, o) => sum + (o.quantity * (o.limit_price || 0)), 0);

    const totalSell = orders
      .filter(o => o.side === 'SELL')
      .reduce((sum, o) => sum + (o.quantity * (o.limit_price || 0)), 0);

    const estimatedTax = allocationPlan.recommendations
      .reduce((sum, r) => sum + r.expected_tax, 0);

    return {
      id: `PLAN-${Date.now()}`,
      created_at: new Date().toISOString(),
      status: 'DISABLED',
      allocation_plan: allocationPlan,
      orders,
      total_buy_value: totalBuy,
      total_sell_value: totalSell,
      estimated_tax: estimatedTax,
      is_valid: validationErrors.length === 0,
      validation_errors: validationErrors,
      warnings,
      requires_otp: true,
      requires_confirmation: true,
      confirmation_message: 
        `This will simulate ${orders.length} orders. ` +
        `Buy: ₹${totalBuy.toFixed(0)}, Sell: ₹${totalSell.toFixed(0)}. ` +
        `Estimated tax: ₹${estimatedTax.toFixed(0)}. ` +
        `NOTE: Execution is DISABLED. Orders will NOT be placed.`
    };
  }

  /**
   * Simulate execution of a plan
   * This does NOT actually execute anything
   */
  simulateExecution(plan: ExecutionPlan): ExecutionResult {
    return {
      plan_id: plan.id,
      executed_at: new Date().toISOString(),
      status: 'DRY_RUN',
      reason: 'Execution is disabled. This is a simulation only. ' +
              'No orders were placed with any broker.',
      orders_simulated: plan.orders.length,
      simulated_cost: plan.total_buy_value - plan.total_sell_value,
      simulated_tax: plan.estimated_tax
    };
  }

  /**
   * Attempt to connect to broker
   * Returns NOT_AVAILABLE in current phase
   */
  async connectBroker(broker: BrokerType): Promise<{ success: false; reason: string }> {
    return {
      success: false,
      reason: `Broker connection is NOT_AVAILABLE. ${broker} integration is not implemented. ` +
              `Please use your broker's app/website to execute trades.`
    };
  }

  // Private methods

  private createOrderRequest(recommendation: AllocationRecommendation): OrderRequest {
    const side: OrderSide = recommendation.action === 'BUY' ? 'BUY' : 'SELL';
    const validationErrors: string[] = [];

    // Validate
    if (recommendation.quantity <= 0) {
      validationErrors.push('Invalid quantity: must be greater than 0');
    }

    if (side === 'SELL' && recommendation.quantity > recommendation.current_quantity) {
      validationErrors.push(`Cannot sell ${recommendation.quantity} shares, only ${recommendation.current_quantity} held`);
    }

    // All orders are invalid because execution is disabled
    validationErrors.push('Execution is disabled - order cannot be placed');

    return {
      id: `ORD-${Date.now()}-${recommendation.symbol}`,
      symbol: recommendation.symbol,
      exchange: 'NSE',
      side,
      quantity: recommendation.quantity,
      order_type: 'MARKET',
      product_type: 'CNC',
      recommendation_id: recommendation.symbol,
      is_valid: false, // Always invalid - execution disabled
      validation_errors: validationErrors,
      estimated_tax: recommendation.expected_tax,
      tax_reasoning: recommendation.reasoning.filter(r => r.startsWith('TAX:'))
    };
  }
}

// Export singleton
export const executionEngine = ExecutionEngine.getInstance();

/**
 * Broker SDK stubs (NOT IMPLEMENTED)
 * These are placeholders for future broker integrations
 */
export const BrokerSDKs = {
  Zerodha: {
    name: 'Zerodha',
    status: 'NOT_AVAILABLE',
    reason: 'Zerodha Kite Connect integration requires API subscription and approval'
  },
  AngelOne: {
    name: 'Angel One',
    status: 'NOT_AVAILABLE',
    reason: 'Angel One SmartAPI integration not implemented'
  },
  Upstox: {
    name: 'Upstox',
    status: 'NOT_AVAILABLE',
    reason: 'Upstox API integration not implemented'
  }
};

export default ExecutionEngine;

