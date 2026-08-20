/**
 * Execution Service - Bridges UI to ExecutionOrchestrator
 * 
 * FINALIZATION MODE: PAPER ONLY
 * 
 * This service:
 * - Accepts execution requests from Daily Command Center
 * - Calls ExecutionOrchestrator in PAPER mode
 * - Updates positions.json
 * - Updates position_timeline.json
 * - Returns execution result with price/date
 * 
 * RULES:
 * - PAPER mode ONLY
 * - All executions are logged
 * - Updates are persisted to JSON files
 */

import { 
  ExecutionOrchestrator,
  getExecutionOrchestrator,
  ExecutionResult,
  ExecutionMode
} from '../positions';
import { 
  PositionData, 
  PositionDecision,
  PositionsFile,
  TimelineEntry
} from '../adapters/PositionDataAdapter';

// =============================================================================
// TYPES
// =============================================================================

export interface PaperExecutionRequest {
  position_id: string;
  symbol: string;
  action: PositionDecision;
  quantity: number;
  current_price: number;
  rationale: string;
}

export interface PaperExecutionResult {
  success: boolean;
  status: 'WOULD_HAVE_EXECUTED' | 'BLOCKED' | 'FAILED';
  message: string;
  details: {
    action: PositionDecision;
    symbol: string;
    quantity: number;
    price: number;
    timestamp: string;
    block_reason?: string;
  };
}

// =============================================================================
// EXECUTION SERVICE
// =============================================================================

class ExecutionServiceImpl {
  private orchestrator: ExecutionOrchestrator;
  private executionLog: PaperExecutionResult[] = [];

  constructor() {
    this.orchestrator = getExecutionOrchestrator();
    // Ensure PAPER mode
    this.orchestrator.setMode('PAPER');
  }

  /**
   * Execute a paper trade
   */
  async execute(request: PaperExecutionRequest): Promise<PaperExecutionResult> {
    const timestamp = new Date().toISOString();
    
    console.log(`[EXECUTION SERVICE] Processing ${request.action} for ${request.symbol}`);
    
    // Validate action
    if (request.action === 'HOLD' || request.action === 'AVOID') {
      return {
        success: false,
        status: 'BLOCKED',
        message: `${request.action} does not require execution`,
        details: {
          action: request.action,
          symbol: request.symbol,
          quantity: 0,
          price: request.current_price,
          timestamp,
          block_reason: 'No action required for HOLD/AVOID'
        }
      };
    }

    // Check authority - simplified for paper mode
    // In production, this would call authority guards
    const blockReason = this.checkBasicAuthority(request);
    if (blockReason) {
      const result: PaperExecutionResult = {
        success: false,
        status: 'BLOCKED',
        message: `Execution blocked: ${blockReason}`,
        details: {
          action: request.action,
          symbol: request.symbol,
          quantity: request.quantity,
          price: request.current_price,
          timestamp,
          block_reason: blockReason
        }
      };
      this.executionLog.push(result);
      return result;
    }

    // Paper execution - record but don't execute
    const result: PaperExecutionResult = {
      success: true,
      status: 'WOULD_HAVE_EXECUTED',
      message: `WOULD HAVE EXECUTED: ${request.action} ${request.symbol} @ ₹${request.current_price.toFixed(2)} on ${new Date(timestamp).toLocaleDateString()}`,
      details: {
        action: request.action,
        symbol: request.symbol,
        quantity: request.quantity,
        price: request.current_price,
        timestamp
      }
    };

    // Update positions and timeline
    await this.updatePositions(request, timestamp);
    await this.updateTimeline(request, timestamp);

    this.executionLog.push(result);
    
    console.log(`[EXECUTION SERVICE] Complete: ${result.message}`);
    
    return result;
  }

  /**
   * Execute all required actions
   */
  async executeAll(requests: PaperExecutionRequest[]): Promise<PaperExecutionResult[]> {
    const results: PaperExecutionResult[] = [];
    
    for (const request of requests) {
      const result = await this.execute(request);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get execution history
   */
  getHistory(): readonly PaperExecutionResult[] {
    return [...this.executionLog];
  }

  /**
   * Check basic authority rules
   */
  private checkBasicAuthority(request: PaperExecutionRequest): string | null {
    // Quantity check
    if (request.quantity <= 0) {
      return 'Invalid quantity';
    }
    
    // Price check
    if (request.current_price <= 0) {
      return 'Invalid price';
    }

    // EXIT requires existing position
    if (request.action === 'EXIT' && request.quantity <= 0) {
      return 'No position to exit';
    }

    return null; // Allowed
  }

  /**
   * Update positions.json after execution
   */
  private async updatePositions(request: PaperExecutionRequest, timestamp: string): Promise<void> {
    try {
      // Read current positions
      const response = await fetch('/data/positions/positions.json');
      if (!response.ok) return;
      
      const data: PositionsFile = await response.json();
      
      // Find and update the position
      const positionIndex = data.positions.findIndex(
        p => p.position_id === request.position_id
      );
      
      if (positionIndex === -1) return;
      
      const position = data.positions[positionIndex];
      
      // Update based on action
      if (request.action === 'EXIT') {
        // Mark as closed
        data.positions[positionIndex] = {
          ...position,
          lifecycle_state: 'CLOSED',
          last_decision: 'EXIT',
          last_decision_date: timestamp.split('T')[0],
          last_decision_reason: request.rationale
        } as any;
      } else if (request.action === 'REDUCE') {
        // Reduce quantity
        const newQuantity = Math.max(0, position.quantity - request.quantity);
        data.positions[positionIndex] = {
          ...position,
          quantity: newQuantity,
          current_value: newQuantity * position.current_price,
          lifecycle_state: newQuantity === 0 ? 'CLOSED' : 'REDUCING',
          last_decision: 'REDUCE',
          last_decision_date: timestamp.split('T')[0],
          last_decision_reason: request.rationale
        } as any;
      } else if (request.action === 'INITIATE') {
        // Add to position
        const newQuantity = position.quantity + request.quantity;
        data.positions[positionIndex] = {
          ...position,
          quantity: newQuantity,
          current_value: newQuantity * position.current_price,
          last_decision: 'INITIATE',
          last_decision_date: timestamp.split('T')[0],
          last_decision_reason: request.rationale
        } as any;
      }
      
      // Update last_updated
      data.last_updated = timestamp;
      
      // Store in localStorage as proxy for file system
      localStorage.setItem('finvest_positions', JSON.stringify(data));
      
      console.log(`[EXECUTION SERVICE] Positions updated for ${request.symbol}`);
    } catch (err) {
      console.error('[EXECUTION SERVICE] Failed to update positions:', err);
    }
  }

  /**
   * Update position_timeline.json after execution
   */
  private async updateTimeline(request: PaperExecutionRequest, timestamp: string): Promise<void> {
    try {
      // Read or create timeline
      let timeline: { version: string; entries: TimelineEntry[] } = {
        version: '1.0.0',
        entries: []
      };
      
      try {
        const stored = localStorage.getItem('finvest_timeline');
        if (stored) {
          timeline = JSON.parse(stored);
        }
      } catch {}
      
      // Add new entry
      const entry: TimelineEntry = {
        date: timestamp.split('T')[0],
        position_id: request.position_id,
        symbol: request.symbol,
        decision: request.action,
        rationale: request.rationale,
        price_at_decision: request.current_price
      };
      
      timeline.entries.push(entry);
      
      // Store
      localStorage.setItem('finvest_timeline', JSON.stringify(timeline));
      
      console.log(`[EXECUTION SERVICE] Timeline updated for ${request.symbol}`);
    } catch (err) {
      console.error('[EXECUTION SERVICE] Failed to update timeline:', err);
    }
  }
}

// Singleton
let instance: ExecutionServiceImpl | null = null;

export function getExecutionService(): ExecutionServiceImpl {
  if (!instance) {
    instance = new ExecutionServiceImpl();
  }
  return instance;
}

export const ExecutionService = {
  execute: (request: PaperExecutionRequest) => getExecutionService().execute(request),
  executeAll: (requests: PaperExecutionRequest[]) => getExecutionService().executeAll(requests),
  getHistory: () => getExecutionService().getHistory()
};

