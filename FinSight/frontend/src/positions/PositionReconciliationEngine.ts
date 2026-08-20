/**
 * PositionReconciliationEngine - Daily Position Reconciliation
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * Every trading day, this engine:
 * - Takes ALL open positions
 * - Takes today's new signals
 * - Takes today's tax & risk state
 * - Compares yesterday vs today
 * - Emits ONE decision per position
 * 
 * RULES:
 * - NO position can be skipped
 * - NO position can have multiple actions
 * - NO position can disappear silently
 */

import { 
  Position, 
  PositionDecision, 
  PositionFactory,
  UpdatePositionInput 
} from './Position';
import { 
  PositionTimeline, 
  PositionDailyAssessment,
  DayMarketContext,
  DaySignalEvaluation,
  DayTaxEvaluation,
  DayRiskEvaluation,
  DecisionExpectedImpact,
  getPositionTimeline,
  createAssessmentId
} from './PositionTimeline';
import { ShutdownGuard } from '../shutdown/ShutdownGuard';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Signal data for a symbol
 */
export interface SignalData {
  readonly symbol: string;
  readonly composite_score: number;
  readonly momentum_score: number;
  readonly value_score: number;
  readonly quality_score: number;
  readonly recommendation: 'BUY' | 'HOLD' | 'SELL' | 'AVOID';
}

/**
 * Market context input
 */
export interface MarketContextInput {
  readonly date: string;
  readonly market_regime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  readonly sector_sentiments: Record<string, 'BULLISH' | 'BEARISH' | 'NEUTRAL'>;
  readonly volatility_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  readonly nifty_change_percent: number;
  readonly sector_changes: Record<string, number>;
}

/**
 * Reconciliation input for the day
 */
export interface ReconciliationInput {
  readonly date: string;
  readonly positions: readonly Position[];
  readonly signals: readonly SignalData[];
  readonly market_context: MarketContextInput;
  readonly risk_budget_remaining: number;      // % of total
  readonly capital_available: number;          // ₹
}

/**
 * Reconciliation result for a single position
 */
export interface PositionReconciliationResult {
  readonly position: Position;
  readonly assessment: PositionDailyAssessment;
  readonly updated_position: Position | null;  // null if no change
  readonly execution_required: boolean;
}

/**
 * Full reconciliation result
 */
export interface DailyReconciliationResult {
  readonly date: string;
  readonly positions_processed: number;
  readonly results: readonly PositionReconciliationResult[];
  readonly summary: {
    readonly hold_count: number;
    readonly initiate_count: number;
    readonly reduce_count: number;
    readonly exit_count: number;
    readonly avoid_count: number;
    readonly execution_required_count: number;
    readonly authority_blocked_count: number;
  };
  readonly reconciled_at: string;
  readonly _frozen: true;
}

// =============================================================================
// RECONCILIATION ENGINE
// =============================================================================

export class PositionReconciliationEngine {
  private static instance: PositionReconciliationEngine;
  private auditLog = DecisionAuditLog.getInstance();
  private timeline = getPositionTimeline();
  
  private constructor() {}
  
  public static getInstance(): PositionReconciliationEngine {
    if (!PositionReconciliationEngine.instance) {
      PositionReconciliationEngine.instance = new PositionReconciliationEngine();
    }
    return PositionReconciliationEngine.instance;
  }
  
  /**
   * Reconcile all positions for the day
   * Emits ONE decision per position
   */
  public reconcile(input: ReconciliationInput): DailyReconciliationResult {
    // Check system is alive
    ShutdownGuard.assertSystemAlive('RECONCILE' as any);
    
    console.log(`\n[RECONCILIATION] Processing ${input.positions.length} positions for ${input.date}`);
    
    const results: PositionReconciliationResult[] = [];
    const signalMap = new Map(input.signals.map(s => [s.symbol, s]));
    
    // Process EVERY position - no skipping
    for (const position of input.positions) {
      if (position.lifecycle_state === 'CLOSED') {
        // Closed positions get AVOID (do not add)
        results.push(this.createAvoidResult(position, input, 'Position is closed'));
        continue;
      }
      
      const signal = signalMap.get(position.symbol);
      const result = this.reconcilePosition(position, signal, input);
      results.push(result);
    }
    
    // Compile summary
    const summary = {
      hold_count: results.filter(r => r.assessment.decision_outcome === 'HOLD').length,
      initiate_count: results.filter(r => r.assessment.decision_outcome === 'INITIATE').length,
      reduce_count: results.filter(r => r.assessment.decision_outcome === 'REDUCE').length,
      exit_count: results.filter(r => r.assessment.decision_outcome === 'EXIT').length,
      avoid_count: results.filter(r => r.assessment.decision_outcome === 'AVOID').length,
      execution_required_count: results.filter(r => r.execution_required).length,
      authority_blocked_count: results.filter(r => r.assessment.authority_blocks.length > 0).length
    };
    
    // Log reconciliation
    this.auditLog.log({
      event_type: 'DAILY_RECONCILIATION' as any,
      severity: 'INFO',
      summary: `Reconciled ${input.positions.length} positions: ${summary.execution_required_count} require execution`,
      details: summary,
      actor: 'SYSTEM'
    });
    
    const result: DailyReconciliationResult = Object.freeze({
      date: input.date,
      positions_processed: input.positions.length,
      results: Object.freeze(results),
      summary: Object.freeze(summary),
      reconciled_at: new Date().toISOString(),
      _frozen: true
    });
    
    console.log(`[RECONCILIATION] Complete: HOLD=${summary.hold_count}, REDUCE=${summary.reduce_count}, EXIT=${summary.exit_count}`);
    
    return result;
  }
  
  /**
   * Reconcile a single position
   */
  private reconcilePosition(
    position: Position,
    signal: SignalData | undefined,
    input: ReconciliationInput
  ): PositionReconciliationResult {
    const authorityBlocks: string[] = [];
    
    // Get yesterday's state
    const yesterdayAssessment = this.timeline.getYesterdayAssessment(position.position_id);
    const yesterdayState = PositionTimeline.createStateSnapshot(position);
    
    // Build today's context
    const marketContext = this.buildMarketContext(position, input);
    const signalEval = this.buildSignalEvaluation(position, signal);
    const taxEval = this.buildTaxEvaluation(position);
    const riskEval = this.buildRiskEvaluation(position, input);
    
    // Determine decision
    const { decision, reason, confidence } = this.determineDecision(
      position,
      signalEval,
      taxEval,
      riskEval,
      marketContext,
      authorityBlocks
    );
    
    // Build expected impact
    const impact = this.buildExpectedImpact(position, decision);
    
    // Create assessment
    const assessment: PositionDailyAssessment = Object.freeze({
      assessment_id: createAssessmentId(),
      position_id: position.position_id,
      symbol: position.symbol,
      date: input.date,
      yesterday_state: yesterdayState,
      today_market_context: marketContext,
      today_signal_evaluation: signalEval,
      today_tax_evaluation: taxEval,
      today_risk_evaluation: riskEval,
      decision_outcome: decision,
      decision_reason: reason,
      decision_confidence: confidence,
      authority_blocks: Object.freeze(authorityBlocks),
      expected_impact: impact,
      assessed_at: new Date().toISOString(),
      _frozen: true
    });
    
    // Record in timeline
    this.timeline.recordAssessment(assessment);
    
    // Update position if needed
    let updatedPosition: Position | null = null;
    if (decision !== 'HOLD' && decision !== 'AVOID') {
      const updateInput: UpdatePositionInput = {
        position_id: position.position_id,
        current_price: position.current_price,
        quantity: decision === 'EXIT' ? 0 : 
                  decision === 'REDUCE' ? Math.floor(position.quantity * 0.5) : 
                  position.quantity,
        lifecycle_state: decision === 'EXIT' ? 'CLOSED' : 
                         decision === 'REDUCE' ? 'REDUCING' : 
                         position.lifecycle_state,
        decision,
        decision_reason: reason
      };
      
      try {
        updatedPosition = PositionFactory.update(position, updateInput, position.current_price);
      } catch (e) {
        // Position update failed - likely already closed
        authorityBlocks.push(`Position update failed: ${e}`);
      }
    }
    
    return {
      position,
      assessment,
      updated_position: updatedPosition,
      execution_required: impact.action_required && authorityBlocks.length === 0
    };
  }
  
  /**
   * Create AVOID result for closed/invalid positions
   */
  private createAvoidResult(
    position: Position,
    input: ReconciliationInput,
    reason: string
  ): PositionReconciliationResult {
    const assessment: PositionDailyAssessment = Object.freeze({
      assessment_id: createAssessmentId(),
      position_id: position.position_id,
      symbol: position.symbol,
      date: input.date,
      yesterday_state: PositionTimeline.createStateSnapshot(position),
      today_market_context: this.buildMarketContext(position, input),
      today_signal_evaluation: this.buildSignalEvaluation(position, undefined),
      today_tax_evaluation: this.buildTaxEvaluation(position),
      today_risk_evaluation: this.buildRiskEvaluation(position, input),
      decision_outcome: 'AVOID',
      decision_reason: reason,
      decision_confidence: 100,
      authority_blocks: Object.freeze([]),
      expected_impact: Object.freeze({
        action_required: false,
        execution_type: 'NONE',
        target_quantity_change: 0,
        estimated_execution_price: 0,
        estimated_tax_impact: 0,
        estimated_pnl_impact: 0,
        risk_freed: 0,
        capital_freed: 0,
        _frozen: true
      }),
      assessed_at: new Date().toISOString(),
      _frozen: true
    });
    
    this.timeline.recordAssessment(assessment);
    
    return {
      position,
      assessment,
      updated_position: null,
      execution_required: false
    };
  }
  
  // ===========================================================================
  // DECISION LOGIC
  // ===========================================================================
  
  private determineDecision(
    position: Position,
    signal: DaySignalEvaluation,
    tax: DayTaxEvaluation,
    risk: DayRiskEvaluation,
    market: DayMarketContext,
    authorityBlocks: string[]
  ): { decision: PositionDecision; reason: string; confidence: number } {
    
    // Rule 1: Risk override - immediate exit if stop loss hit
    if (risk.stop_loss_triggered) {
      return {
        decision: 'EXIT',
        reason: 'Stop loss triggered - risk limit exceeded',
        confidence: 95
      };
    }
    
    // Rule 2: Risk-off regime with weak signal
    if (market.market_regime === 'RISK_OFF' && signal.thesis_status === 'BROKEN') {
      return {
        decision: 'EXIT',
        reason: 'Risk-off regime + broken thesis',
        confidence: 85
      };
    }
    
    // Rule 3: Risk evaluation says reduce/exit
    if (risk.recommendation === 'EXIT') {
      return {
        decision: 'EXIT',
        reason: 'Risk evaluation mandates exit',
        confidence: 90
      };
    }
    
    if (risk.recommendation === 'REDUCE') {
      return {
        decision: 'REDUCE',
        reason: 'Risk evaluation recommends reduction',
        confidence: 80
      };
    }
    
    // Rule 4: Thesis broken but tax says hold
    if (signal.thesis_status === 'BROKEN' && tax.recommendation === 'HOLD_FOR_TAX') {
      // In normal market, tax can override weak signal
      if (market.market_regime !== 'RISK_OFF') {
        return {
          decision: 'HOLD',
          reason: `Thesis weakening but holding for tax (${tax.days_to_ltcg} days to LTCG)`,
          confidence: 60
        };
      }
    }
    
    // Rule 5: Thesis broken, no tax benefit
    if (signal.thesis_status === 'BROKEN') {
      return {
        decision: 'EXIT',
        reason: 'Investment thesis broken',
        confidence: 75
      };
    }
    
    // Rule 6: Thesis weakening with elevated risk
    if (signal.thesis_status === 'WEAKENING' && risk.recommendation === 'ELEVATED') {
      return {
        decision: 'REDUCE',
        reason: 'Thesis weakening with elevated risk',
        confidence: 70
      };
    }
    
    // Rule 7: Loss harvesting opportunity
    if (tax.recommendation === 'HARVEST_LOSS' && position.unrealized_pnl < 0) {
      return {
        decision: 'EXIT',
        reason: 'Tax loss harvesting opportunity',
        confidence: 65
      };
    }
    
    // Rule 8: Default to HOLD
    return {
      decision: 'HOLD',
      reason: 'Position maintained - thesis intact, risk acceptable',
      confidence: 75
    };
  }
  
  // ===========================================================================
  // EVALUATION BUILDERS
  // ===========================================================================
  
  private buildMarketContext(position: Position, input: ReconciliationInput): DayMarketContext {
    const sector = this.getPositionSector(position.symbol);
    
    return Object.freeze({
      date: input.date,
      market_regime: input.market_context.market_regime,
      sector_sentiment: input.market_context.sector_sentiments[sector] || 'NEUTRAL',
      volatility_level: input.market_context.volatility_level,
      nifty_change_percent: input.market_context.nifty_change_percent,
      sector_change_percent: input.market_context.sector_changes[sector] || 0,
      _frozen: true
    });
  }
  
  private buildSignalEvaluation(position: Position, signal: SignalData | undefined): DaySignalEvaluation {
    if (!signal) {
      return Object.freeze({
        composite_score: 50,
        momentum_score: 50,
        value_score: 50,
        quality_score: 50,
        thesis_status: 'INTACT',
        signal_change_from_entry: 'UNCHANGED',
        _frozen: true
      });
    }
    
    // Determine thesis status based on score changes
    let thesisStatus: 'INTACT' | 'WEAKENING' | 'BROKEN' = 'INTACT';
    if (signal.composite_score < 30) {
      thesisStatus = 'BROKEN';
    } else if (signal.composite_score < 50) {
      thesisStatus = 'WEAKENING';
    }
    
    return Object.freeze({
      composite_score: signal.composite_score,
      momentum_score: signal.momentum_score,
      value_score: signal.value_score,
      quality_score: signal.quality_score,
      thesis_status: thesisStatus,
      signal_change_from_entry: signal.composite_score > 60 ? 'IMPROVED' : 
                                 signal.composite_score < 40 ? 'DEGRADED' : 'UNCHANGED',
      _frozen: true
    });
  }
  
  private buildTaxEvaluation(position: Position): DayTaxEvaluation {
    const minDaysToLtcg = Math.min(...position.tax_lots.map(l => l.days_to_ltcg));
    const taxNow = position.total_tax_liability_if_sold;
    
    // Estimate tax after LTCG eligibility (simplified)
    const taxAfterLtcg = taxNow * 0.67; // LTCG is roughly 2/3 of STCG rate
    
    let recommendation: 'HOLD_FOR_TAX' | 'TAX_NEUTRAL' | 'HARVEST_LOSS' = 'TAX_NEUTRAL';
    
    if (position.unrealized_pnl < 0) {
      recommendation = 'HARVEST_LOSS';
    } else if (minDaysToLtcg <= 30 && taxNow > taxAfterLtcg * 1.1) {
      recommendation = 'HOLD_FOR_TAX';
    }
    
    return Object.freeze({
      days_to_ltcg: minDaysToLtcg,
      tax_cost_if_sold_now: taxNow,
      tax_cost_if_sold_after_ltcg: taxAfterLtcg,
      tax_savings_by_waiting: taxNow - taxAfterLtcg,
      recommendation,
      _frozen: true
    });
  }
  
  private buildRiskEvaluation(position: Position, input: ReconciliationInput): DayRiskEvaluation {
    const drawdown = position.risk_allocation.current_drawdown;
    const maxDrawdown = position.risk_allocation.max_loss_allowed / (position.quantity * position.average_cost) * 100;
    const stopLossTriggered = position.current_price <= position.risk_allocation.stop_loss_price;
    
    let recommendation: 'ACCEPTABLE' | 'ELEVATED' | 'REDUCE' | 'EXIT' = 'ACCEPTABLE';
    
    if (stopLossTriggered) {
      recommendation = 'EXIT';
    } else if (drawdown > maxDrawdown * 0.8) {
      recommendation = 'REDUCE';
    } else if (drawdown > maxDrawdown * 0.5) {
      recommendation = 'ELEVATED';
    }
    
    return Object.freeze({
      current_drawdown: drawdown,
      max_drawdown_limit: maxDrawdown,
      stop_loss_triggered: stopLossTriggered,
      position_size_vs_limit: position.risk_allocation.position_size_percent / 10, // Assume 10% max
      portfolio_correlation: 0.5, // Simplified
      recommendation,
      _frozen: true
    });
  }
  
  private buildExpectedImpact(position: Position, decision: PositionDecision): DecisionExpectedImpact {
    if (decision === 'HOLD' || decision === 'AVOID') {
      return Object.freeze({
        action_required: false,
        execution_type: 'NONE',
        target_quantity_change: 0,
        estimated_execution_price: 0,
        estimated_tax_impact: 0,
        estimated_pnl_impact: 0,
        risk_freed: 0,
        capital_freed: 0,
        _frozen: true
      });
    }
    
    const quantityChange = decision === 'EXIT' ? -position.quantity :
                          decision === 'REDUCE' ? -Math.floor(position.quantity * 0.5) :
                          0;
    
    const capitalFreed = Math.abs(quantityChange) * position.current_price;
    const pnlImpact = (quantityChange / position.quantity) * position.unrealized_pnl;
    
    return Object.freeze({
      action_required: true,
      execution_type: 'MARKET',
      target_quantity_change: quantityChange,
      estimated_execution_price: position.current_price,
      estimated_tax_impact: (quantityChange / position.quantity) * position.total_tax_liability_if_sold,
      estimated_pnl_impact: pnlImpact,
      risk_freed: (Math.abs(quantityChange) / position.quantity) * position.risk_allocation.risk_units,
      capital_freed: capitalFreed,
      _frozen: true
    });
  }
  
  private getPositionSector(symbol: string): string {
    // Simplified sector mapping
    const sectorMap: Record<string, string> = {
      'RELIANCE': 'Energy',
      'TCS': 'IT',
      'INFY': 'IT',
      'HDFCBANK': 'Banking',
      'ICICIBANK': 'Banking',
      'SBIN': 'Banking'
    };
    return sectorMap[symbol] || 'General';
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getPositionReconciliationEngine = () => PositionReconciliationEngine.getInstance();

export default PositionReconciliationEngine;

