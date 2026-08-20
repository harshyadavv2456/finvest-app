/**
 * PositionTimeline - Daily Position Assessments
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * For every trading day, the system produces a PositionDailyAssessment
 * that documents:
 * - Yesterday's state
 * - Today's context
 * - Today's decision
 * - Expected impact
 * 
 * This creates an auditable timeline for every position.
 */

import { Position, PositionDecision, PositionLifecycleState } from './Position';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// ASSESSMENT TYPES
// =============================================================================

/**
 * Market context for the day
 */
export interface DayMarketContext {
  readonly date: string;                    // ISO date
  readonly market_regime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  readonly sector_sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  readonly volatility_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  readonly nifty_change_percent: number;
  readonly sector_change_percent: number;
  readonly _frozen: true;
}

/**
 * Signal evaluation for the day
 */
export interface DaySignalEvaluation {
  readonly composite_score: number;         // 0-100
  readonly momentum_score: number;
  readonly value_score: number;
  readonly quality_score: number;
  readonly thesis_status: 'INTACT' | 'WEAKENING' | 'BROKEN';
  readonly signal_change_from_entry: 'IMPROVED' | 'UNCHANGED' | 'DEGRADED';
  readonly _frozen: true;
}

/**
 * Tax evaluation for the day
 */
export interface DayTaxEvaluation {
  readonly days_to_ltcg: number;
  readonly tax_cost_if_sold_now: number;
  readonly tax_cost_if_sold_after_ltcg: number;
  readonly tax_savings_by_waiting: number;
  readonly recommendation: 'HOLD_FOR_TAX' | 'TAX_NEUTRAL' | 'HARVEST_LOSS';
  readonly _frozen: true;
}

/**
 * Risk evaluation for the day
 */
export interface DayRiskEvaluation {
  readonly current_drawdown: number;        // %
  readonly max_drawdown_limit: number;      // %
  readonly stop_loss_triggered: boolean;
  readonly position_size_vs_limit: number;  // Ratio (1.0 = at limit)
  readonly portfolio_correlation: number;   // With rest of portfolio
  readonly recommendation: 'ACCEPTABLE' | 'ELEVATED' | 'REDUCE' | 'EXIT';
  readonly _frozen: true;
}

/**
 * Position state snapshot (yesterday)
 */
export interface PositionStateSnapshot {
  readonly position_id: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly average_cost: number;
  readonly price: number;
  readonly unrealized_pnl: number;
  readonly unrealized_pnl_percent: number;
  readonly lifecycle_state: PositionLifecycleState;
  readonly last_decision: PositionDecision;
  readonly _frozen: true;
}

/**
 * Expected impact of today's decision
 */
export interface DecisionExpectedImpact {
  readonly action_required: boolean;
  readonly execution_type: 'MARKET' | 'LIMIT' | 'NONE';
  readonly target_quantity_change: number;   // Positive = buy, negative = sell
  readonly estimated_execution_price: number;
  readonly estimated_tax_impact: number;
  readonly estimated_pnl_impact: number;
  readonly risk_freed: number;
  readonly capital_freed: number;
  readonly _frozen: true;
}

/**
 * Daily assessment for a single position
 */
export interface PositionDailyAssessment {
  readonly assessment_id: string;
  readonly position_id: string;
  readonly symbol: string;
  readonly date: string;                    // ISO date
  
  // Yesterday
  readonly yesterday_state: PositionStateSnapshot;
  
  // Today's evaluations
  readonly today_market_context: DayMarketContext;
  readonly today_signal_evaluation: DaySignalEvaluation;
  readonly today_tax_evaluation: DayTaxEvaluation;
  readonly today_risk_evaluation: DayRiskEvaluation;
  
  // Decision
  readonly decision_outcome: PositionDecision;
  readonly decision_reason: string;
  readonly decision_confidence: number;     // 0-100
  readonly authority_blocks: readonly string[];  // Any authority that blocked action
  
  // Impact
  readonly expected_impact: DecisionExpectedImpact;
  
  // Audit
  readonly assessed_at: string;
  readonly _frozen: true;
}

// =============================================================================
// POSITION TIMELINE
// =============================================================================

export class PositionTimeline {
  private static instance: PositionTimeline;
  private auditLog = DecisionAuditLog.getInstance();
  private assessments: Map<string, PositionDailyAssessment[]> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): PositionTimeline {
    if (!PositionTimeline.instance) {
      PositionTimeline.instance = new PositionTimeline();
    }
    return PositionTimeline.instance;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_position_timeline');
      if (stored) {
        const data = JSON.parse(stored);
        for (const [key, value] of Object.entries(data)) {
          this.assessments.set(key, value as PositionDailyAssessment[]);
        }
      }
    } catch {}
  }
  
  private saveToStorage(): void {
    try {
      const data: Record<string, PositionDailyAssessment[]> = {};
      for (const [key, value] of this.assessments.entries()) {
        data[key] = value;
      }
      localStorage.setItem('finvest_position_timeline', JSON.stringify(data));
    } catch {}
  }
  
  /**
   * Record a daily assessment for a position
   */
  public recordAssessment(assessment: PositionDailyAssessment): void {
    const existing = this.assessments.get(assessment.position_id) || [];
    
    // Check for duplicate date
    const hasDuplicate = existing.some(a => a.date === assessment.date);
    if (hasDuplicate) {
      throw new Error(
        `DUPLICATE_ASSESSMENT: Position ${assessment.position_id} already has assessment for ${assessment.date}`
      );
    }
    
    // Freeze and store
    const frozen = Object.freeze(assessment);
    existing.push(frozen);
    this.assessments.set(assessment.position_id, existing);
    
    // Log to audit
    this.auditLog.log({
      event_type: 'POSITION_ASSESSED' as any,
      severity: 'INFO',
      summary: `Position ${assessment.symbol} assessed: ${assessment.decision_outcome}`,
      details: {
        position_id: assessment.position_id,
        symbol: assessment.symbol,
        date: assessment.date,
        decision: assessment.decision_outcome,
        reason: assessment.decision_reason
      },
      actor: 'SYSTEM'
    });
    
    this.saveToStorage();
  }
  
  /**
   * Get timeline for a position
   */
  public getTimeline(positionId: string): readonly PositionDailyAssessment[] {
    return Object.freeze(this.assessments.get(positionId) || []);
  }
  
  /**
   * Get yesterday's assessment for a position
   */
  public getYesterdayAssessment(positionId: string): PositionDailyAssessment | null {
    const timeline = this.assessments.get(positionId) || [];
    if (timeline.length === 0) return null;
    return timeline[timeline.length - 1];
  }
  
  /**
   * Get all assessments for a date
   */
  public getAssessmentsForDate(date: string): readonly PositionDailyAssessment[] {
    const result: PositionDailyAssessment[] = [];
    
    for (const timeline of this.assessments.values()) {
      const assessment = timeline.find(a => a.date === date);
      if (assessment) {
        result.push(assessment);
      }
    }
    
    return Object.freeze(result);
  }
  
  /**
   * Get all assessments (for replay bundle)
   */
  public getAllAssessments(): readonly PositionDailyAssessment[] {
    const result: PositionDailyAssessment[] = [];
    
    for (const timeline of this.assessments.values()) {
      result.push(...timeline);
    }
    
    return Object.freeze(result.sort((a, b) => 
      new Date(a.assessed_at).getTime() - new Date(b.assessed_at).getTime()
    ));
  }
  
  /**
   * Create a state snapshot from a position
   */
  public static createStateSnapshot(position: Position): PositionStateSnapshot {
    return Object.freeze({
      position_id: position.position_id,
      symbol: position.symbol,
      quantity: position.quantity,
      average_cost: position.average_cost,
      price: position.current_price,
      unrealized_pnl: position.unrealized_pnl,
      unrealized_pnl_percent: position.unrealized_pnl_percent,
      lifecycle_state: position.lifecycle_state,
      last_decision: position.last_decision,
      _frozen: true
    });
  }
}

// =============================================================================
// ASSESSMENT FACTORY
// =============================================================================

let assessmentCounter = 0;

export function createAssessmentId(): string {
  return `ASSESS-${Date.now()}-${++assessmentCounter}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getPositionTimeline = () => PositionTimeline.getInstance();

export default PositionTimeline;

