/**
 * CounterfactualEngine - Rules-Based Counterfactual Computation
 * 
 * PHASE 33: Counterfactual Suppression Ledger (CSL)
 * 
 * PURPOSE:
 * Compute what would have happened if a suppressed decision had survived.
 * 
 * RULES:
 * - Rules-based, deterministic
 * - Uses DecisionAgingEngine outputs (Phase 27)
 * - Uses PriceAuthority
 * - No ML
 * - No hindsight optimization
 * - If data missing → mark as AMBIGUOUS
 * 
 * DESIGN LAW:
 * This is measurement, not learning.
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { 
  getCounterfactualLedger, 
  CounterfactualLedger,
  SuppressedDecisionRecord,
  CounterfactualOutcome,
  DominanceResult
} from './CounterfactualLedger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * MarketDataPoint - Historical price data
 */
export interface MarketDataPoint {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
}

/**
 * CounterfactualInput - Data needed for computation
 */
export interface CounterfactualInput {
  readonly snapshot_id: string;
  readonly price_at_suppression: number;
  readonly historical_prices: ReadonlyArray<MarketDataPoint>;
  readonly dividends_paid?: number;
}

/**
 * ComputationResult - Result with metadata
 */
export interface ComputationResult {
  readonly success: boolean;
  readonly outcome?: CounterfactualOutcome;
  readonly error?: string;
  readonly missing_data?: string[];
  readonly _frozen: true;
}

// =============================================================================
// THRESHOLDS (IMMUTABLE)
// =============================================================================

const COUNTERFACTUAL_THRESHOLDS = Object.freeze({
  // Minimum data points required
  MIN_DATA_POINTS: 5,
  
  // Drawdown threshold for "exceeded" flag
  DRAWDOWN_THRESHOLD_PERCENT: 20,
  
  // Return thresholds for dominance
  SYSTEM_RIGHT_IF_LOSS_EXCEEDS: -5, // If realized return < -5%, system was right
  SYSTEM_WRONG_IF_GAIN_EXCEEDS: 10, // If realized return > 10%, system was wrong
  
  // Ambiguous zone
  AMBIGUOUS_LOWER: -5,
  AMBIGUOUS_UPPER: 10
});

// =============================================================================
// COUNTERFACTUAL ENGINE
// =============================================================================

export class CounterfactualEngine {
  private static instance: CounterfactualEngine;
  private auditLog = DecisionAuditLog.getInstance();
  private ledger: CounterfactualLedger;
  
  private constructor() {
    this.ledger = getCounterfactualLedger();
  }
  
  public static getInstance(): CounterfactualEngine {
    if (!CounterfactualEngine.instance) {
      CounterfactualEngine.instance = new CounterfactualEngine();
    }
    return CounterfactualEngine.instance;
  }
  
  // ===========================================================================
  // COMPUTATION API
  // ===========================================================================
  
  /**
   * Compute counterfactual for a suppressed decision
   * THROWS if horizon has not expired
   * Returns AMBIGUOUS if data is insufficient
   */
  public computeCounterfactual(input: CounterfactualInput): ComputationResult {
    const record = this.ledger.getRecord(input.snapshot_id);
    
    // Validate record exists
    if (!record) {
      return this.createErrorResult(
        `No suppressed decision found for ${input.snapshot_id}`
      );
    }
    
    // Validate horizon expired
    const now = new Date();
    const horizonExpiry = new Date(record.horizon_expiry);
    
    if (now < horizonExpiry) {
      return this.createErrorResult(
        `Horizon has not expired. Expires at: ${record.horizon_expiry}`
      );
    }
    
    // Validate already computed
    if (record.counterfactual_outcome) {
      return this.createErrorResult(
        `Counterfactual already computed for ${input.snapshot_id}`
      );
    }
    
    // Validate sufficient data
    const missingData = this.validateData(input);
    if (missingData.length > 0) {
      // Mark as AMBIGUOUS due to missing data
      const ambiguousOutcome = this.createAmbiguousOutcome(missingData);
      return this.createSuccessResult(ambiguousOutcome, missingData);
    }
    
    // Compute the counterfactual
    try {
      const outcome = this.calculateOutcome(record, input);
      
      // Attach to ledger
      this.ledger.attachCounterfactual(input.snapshot_id, outcome);
      
      // Audit log
      this.auditLog.log({
        event_type: 'CONTEXT_CREATED',
        severity: outcome.dominance === 'SYSTEM_WRONG' ? 'WARNING' : 'INFO',
        summary: `Counterfactual computed: ${input.snapshot_id}`,
        details: {
          snapshot_id: input.snapshot_id,
          dominance: outcome.dominance,
          realized_return: outcome.realized_return,
          opportunity_cost: outcome.opportunity_cost
        },
        actor: 'ENGINE'
      });
      
      return this.createSuccessResult(outcome);
    } catch (e) {
      return this.createErrorResult(
        `Computation failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  
  /**
   * Batch compute all pending counterfactuals
   */
  public computePendingCounterfactuals(
    marketDataProvider: (snapshotId: string) => CounterfactualInput | null
  ): ComputationResult[] {
    const pending = this.ledger.getPendingCounterfactuals();
    const results: ComputationResult[] = [];
    
    for (const record of pending) {
      const input = marketDataProvider(record.snapshot_id);
      
      if (!input) {
        results.push(this.createErrorResult(
          `No market data available for ${record.snapshot_id}`
        ));
        continue;
      }
      
      const result = this.computeCounterfactual(input);
      results.push(result);
    }
    
    return results;
  }
  
  // ===========================================================================
  // COMPUTATION LOGIC
  // ===========================================================================
  
  /**
   * Calculate the counterfactual outcome
   * DETERMINISTIC - No ML, no optimization
   */
  private calculateOutcome(
    record: SuppressedDecisionRecord,
    input: CounterfactualInput
  ): CounterfactualOutcome {
    const prices = input.historical_prices;
    const entryPrice = input.price_at_suppression;
    
    // Extract price movements
    const closePrices = prices.map(p => p.close);
    const highPrices = prices.map(p => p.high);
    const lowPrices = prices.map(p => p.low);
    
    // Final price (at horizon expiry)
    const finalPrice = closePrices[closePrices.length - 1];
    
    // Calculate returns
    const realizedReturn = ((finalPrice - entryPrice) / entryPrice) * 100;
    
    // Max favorable move (highest high vs entry)
    const maxHigh = Math.max(...highPrices);
    const maxFavorableMove = ((maxHigh - entryPrice) / entryPrice) * 100;
    
    // Max adverse move (lowest low vs entry)
    const minLow = Math.min(...lowPrices);
    const maxAdverseMove = ((minLow - entryPrice) / entryPrice) * 100;
    
    // Drawdown calculation
    let maxDrawdown = 0;
    let peak = closePrices[0];
    for (const price of closePrices) {
      if (price > peak) peak = price;
      const drawdown = ((peak - price) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    const drawdownExceeded = maxDrawdown > COUNTERFACTUAL_THRESHOLDS.DRAWDOWN_THRESHOLD_PERCENT;
    
    // Determine dominance
    const dominance = this.determineDominance(record, realizedReturn, maxAdverseMove, drawdownExceeded);
    
    // Calculate opportunity cost
    const opportunityCost = this.calculateOpportunityCost(
      record,
      realizedReturn,
      entryPrice,
      finalPrice,
      dominance
    );
    
    // Computation notes
    const notes = this.generateNotes(record, realizedReturn, maxAdverseMove, dominance);
    
    return Object.freeze({
      measured_at: new Date().toISOString(),
      realized_return: realizedReturn,
      max_favorable_move: maxFavorableMove,
      max_adverse_move: maxAdverseMove,
      drawdown_exceeded: drawdownExceeded,
      opportunity_cost: opportunityCost,
      dominance,
      computation_notes: notes,
      _frozen: true
    });
  }
  
  /**
   * Determine whether system was right or wrong
   * RULES-BASED, DETERMINISTIC
   */
  private determineDominance(
    record: SuppressedDecisionRecord,
    realizedReturn: number,
    maxAdverseMove: number,
    drawdownExceeded: boolean
  ): DominanceResult {
    const action = record.original_action;
    
    // For BUY recommendations that were suppressed:
    if (action === 'BUY') {
      // If the stock tanked → SYSTEM_RIGHT (we avoided loss)
      if (realizedReturn < COUNTERFACTUAL_THRESHOLDS.SYSTEM_RIGHT_IF_LOSS_EXCEEDS) {
        return 'SYSTEM_RIGHT';
      }
      
      // If the stock soared → SYSTEM_WRONG (we missed opportunity)
      if (realizedReturn > COUNTERFACTUAL_THRESHOLDS.SYSTEM_WRONG_IF_GAIN_EXCEEDS) {
        return 'SYSTEM_WRONG';
      }
      
      // If there was excessive drawdown even if final return is OK → SYSTEM_RIGHT
      if (drawdownExceeded && realizedReturn < 5) {
        return 'SYSTEM_RIGHT';
      }
    }
    
    // For SELL recommendations that were suppressed:
    if (action === 'SELL') {
      // If stock tanked after we were told to sell but didn't → SYSTEM_WRONG
      if (realizedReturn < COUNTERFACTUAL_THRESHOLDS.SYSTEM_RIGHT_IF_LOSS_EXCEEDS) {
        return 'SYSTEM_WRONG';
      }
      
      // If stock rose after we were told to sell → SYSTEM_RIGHT
      if (realizedReturn > COUNTERFACTUAL_THRESHOLDS.SYSTEM_WRONG_IF_GAIN_EXCEEDS) {
        return 'SYSTEM_RIGHT';
      }
    }
    
    // In the ambiguous zone
    return 'AMBIGUOUS';
  }
  
  /**
   * Calculate opportunity cost
   * Positive = money lost by suppressing
   * Only applies when SYSTEM_WRONG
   */
  private calculateOpportunityCost(
    record: SuppressedDecisionRecord,
    realizedReturn: number,
    entryPrice: number,
    finalPrice: number,
    dominance: DominanceResult
  ): number {
    if (dominance !== 'SYSTEM_WRONG') {
      return 0;
    }
    
    // Assume a hypothetical position size based on original expected return
    // This is a simplified calculation
    const hypotheticalPositionValue = 10000; // Base calculation unit
    const gainMissed = (realizedReturn / 100) * hypotheticalPositionValue;
    
    return Math.max(0, gainMissed);
  }
  
  /**
   * Generate computation notes
   */
  private generateNotes(
    record: SuppressedDecisionRecord,
    realizedReturn: number,
    maxAdverseMove: number,
    dominance: DominanceResult
  ): string {
    const parts: string[] = [];
    
    parts.push(`Original action: ${record.original_action || 'UNKNOWN'}`);
    parts.push(`Suppression reason: ${record.suppression_reason}`);
    parts.push(`Realized return: ${realizedReturn.toFixed(2)}%`);
    parts.push(`Max adverse move: ${maxAdverseMove.toFixed(2)}%`);
    parts.push(`Dominance: ${dominance}`);
    
    if (dominance === 'SYSTEM_RIGHT') {
      if (realizedReturn < 0) {
        parts.push(`Avoided loss of ${Math.abs(realizedReturn).toFixed(2)}%`);
      }
    } else if (dominance === 'SYSTEM_WRONG') {
      parts.push(`Missed opportunity of ${realizedReturn.toFixed(2)}%`);
    }
    
    return parts.join('. ');
  }
  
  // ===========================================================================
  // VALIDATION
  // ===========================================================================
  
  /**
   * Validate that we have sufficient data
   */
  private validateData(input: CounterfactualInput): string[] {
    const missing: string[] = [];
    
    if (!input.price_at_suppression || input.price_at_suppression <= 0) {
      missing.push('price_at_suppression');
    }
    
    if (!input.historical_prices || input.historical_prices.length < COUNTERFACTUAL_THRESHOLDS.MIN_DATA_POINTS) {
      missing.push(`historical_prices (need at least ${COUNTERFACTUAL_THRESHOLDS.MIN_DATA_POINTS} points)`);
    }
    
    // Check for invalid prices
    if (input.historical_prices) {
      for (const point of input.historical_prices) {
        if (point.close <= 0 || point.high <= 0 || point.low <= 0) {
          missing.push('valid_price_data');
          break;
        }
      }
    }
    
    return missing;
  }
  
  /**
   * Create AMBIGUOUS outcome due to missing data
   */
  private createAmbiguousOutcome(missingData: string[]): CounterfactualOutcome {
    return Object.freeze({
      measured_at: new Date().toISOString(),
      realized_return: 0,
      max_favorable_move: 0,
      max_adverse_move: 0,
      drawdown_exceeded: false,
      opportunity_cost: 0,
      dominance: 'AMBIGUOUS' as DominanceResult,
      computation_notes: `AMBIGUOUS: Missing data - ${missingData.join(', ')}`,
      _frozen: true
    });
  }
  
  // ===========================================================================
  // RESULT HELPERS
  // ===========================================================================
  
  private createSuccessResult(
    outcome: CounterfactualOutcome,
    missingData?: string[]
  ): ComputationResult {
    return Object.freeze({
      success: true,
      outcome,
      missing_data: missingData,
      _frozen: true
    });
  }
  
  private createErrorResult(error: string): ComputationResult {
    return Object.freeze({
      success: false,
      error,
      _frozen: true
    });
  }
  
  // ===========================================================================
  // ANALYSIS HELPERS
  // ===========================================================================
  
  /**
   * Get accuracy by suppression reason
   */
  public getAccuracyByReason(): Map<string, { right: number; wrong: number; ambiguous: number }> {
    const counterfactuals = this.ledger.getCounterfactuals();
    const byReason = new Map<string, { right: number; wrong: number; ambiguous: number }>();
    
    for (const record of counterfactuals) {
      const reason = record.suppression_reason;
      const dominance = record.counterfactual_outcome?.dominance;
      
      if (!byReason.has(reason)) {
        byReason.set(reason, { right: 0, wrong: 0, ambiguous: 0 });
      }
      
      const stats = byReason.get(reason)!;
      switch (dominance) {
        case 'SYSTEM_RIGHT':
          stats.right++;
          break;
        case 'SYSTEM_WRONG':
          stats.wrong++;
          break;
        case 'AMBIGUOUS':
          stats.ambiguous++;
          break;
      }
    }
    
    return byReason;
  }
  
  /**
   * Get worst missed opportunities
   */
  public getWorstMissedOpportunities(limit: number = 5): SuppressedDecisionRecord[] {
    return this.ledger.getSystemWrongDecisions()
      .sort((a, b) => 
        (b.counterfactual_outcome?.opportunity_cost || 0) - 
        (a.counterfactual_outcome?.opportunity_cost || 0)
      )
      .slice(0, limit);
  }
  
  /**
   * Get best avoided losses
   */
  public getBestAvoidedLosses(limit: number = 5): SuppressedDecisionRecord[] {
    return this.ledger.getSystemRightDecisions()
      .filter(r => (r.counterfactual_outcome?.realized_return || 0) < 0)
      .sort((a, b) => 
        (a.counterfactual_outcome?.realized_return || 0) - 
        (b.counterfactual_outcome?.realized_return || 0)
      )
      .slice(0, limit);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getCounterfactualEngine = () => CounterfactualEngine.getInstance();
export default CounterfactualEngine;

