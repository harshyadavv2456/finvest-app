/**
 * ConsequenceEngine - Decision Outcome Analysis
 * 
 * PHASE 20: Consequence View
 * 
 * For every shadow execution, compare against:
 *   a) Do nothing
 *   b) Follow FinVest
 *   c) User actual action
 * 
 * RULES (NON-NEGOTIABLE):
 * - No consequence view without numbers
 * - No confidence inflation
 * - Truth > Comfort
 * - All consequences must be auditable
 */

import { DecisionSnapshot } from '../core/DecisionSnapshot';
import { ShadowOrder } from '../execution/ShadowExecution';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { PriceData } from '../core/DecisionContext';

// =============================================================================
// TYPES
// =============================================================================

export type ConsequenceScenario = 
  | 'DO_NOTHING'        // User did nothing
  | 'FOLLOW_FINVEST'    // User followed FinVest advice
  | 'USER_ACTUAL';      // What user actually did

export interface ScenarioOutcome {
  scenario: ConsequenceScenario;
  description: string;
  
  // Values
  initial_value: number;
  final_value: number;
  absolute_change: number;
  percent_change: number;
  
  // Tax impact (if applicable)
  tax_incurred: number;
  after_tax_value: number;
  after_tax_return: number;
}

export interface ConsequenceAnalysis {
  id: string;
  decision_id: string;         // Reference to DecisionSnapshot or ShadowOrder
  symbol: string;
  analysis_date: string;
  holding_period_days: number;
  
  // Scenarios
  do_nothing: ScenarioOutcome;
  follow_finvest: ScenarioOutcome;
  user_actual: ScenarioOutcome;
  
  // Summary
  best_outcome: ConsequenceScenario;
  worst_outcome: ConsequenceScenario;
  regret_index: number;         // 0-100, how much user should regret their choice
  
  // Verdict
  who_was_right: 'FINVEST' | 'USER' | 'TIE' | 'BOTH_WRONG';
  verdict_explanation: string;
  
  // Context at decision time
  finvest_recommendation: string;
  finvest_confidence: number;
  user_action: string;
  
  // Audit
  created_at: string;
  audit_log_id: string;
}

/**
 * TimeSeriesPoint - Daily tracking point for consequence
 * PHASE 22: Daily Consequence Tracking
 */
export interface TimeSeriesPoint {
  date: string;
  price: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  tax_adjusted_delta: number;
  regret_index: number;
  opportunity_cost: number;
}

/**
 * ConsequenceTimeSeries - Time series tracking for a decision
 */
export interface ConsequenceTimeSeries {
  decision_id: string;
  symbol: string;
  created_at: string;
  last_updated: string;
  points: TimeSeriesPoint[];
  
  // Running stats
  peak_value: number;
  peak_date: string;
  trough_value: number;
  trough_date: string;
  max_regret: number;
  max_opportunity_cost: number;
}

// =============================================================================
// CONSEQUENCE ENGINE
// =============================================================================

export class ConsequenceEngine {
  private static instance: ConsequenceEngine;
  private analyses: Map<string, ConsequenceAnalysis> = new Map();
  private timeSeries: Map<string, ConsequenceTimeSeries> = new Map();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {
    this.loadFromStorage();
    this.loadTimeSeriesFromStorage();
  }
  
  public static getInstance(): ConsequenceEngine {
    if (!ConsequenceEngine.instance) {
      ConsequenceEngine.instance = new ConsequenceEngine();
    }
    return ConsequenceEngine.instance;
  }
  
  /**
   * Load from storage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_consequences');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, analysis] of Object.entries(parsed)) {
          this.analyses.set(id, analysis as ConsequenceAnalysis);
        }
      }
    } catch (e) {
      console.error('Failed to load consequences:', e);
    }
  }
  
  /**
   * Save to storage
   */
  private saveToStorage(): void {
    try {
      const toStore: Record<string, ConsequenceAnalysis> = {};
      const recent = Array.from(this.analyses.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);
      
      for (const analysis of recent) {
        toStore[analysis.id] = analysis;
      }
      
      localStorage.setItem('finvest_consequences', JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save consequences:', e);
    }
  }
  
  /**
   * Analyze shadow execution consequences
   */
  public analyzeFromShadowExecution(
    order: ShadowOrder,
    currentPrice: number,
    taxRate: number = 0.15
  ): ConsequenceAnalysis {
    const id = `CONS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const decisionDate = new Date(order.created_at);
    const holdingPeriodDays = Math.floor((Date.now() - decisionDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const entryPrice = order.fill_price || order.entry_value / order.quantity;
    const quantity = order.quantity;
    const initialValue = order.entry_value;
    
    // Scenario 1: Do Nothing
    const doNothing: ScenarioOutcome = {
      scenario: 'DO_NOTHING',
      description: 'If you had not taken any action',
      initial_value: initialValue,
      final_value: order.side === 'BUY' ? initialValue : quantity * currentPrice, // What you'd have if you held
      absolute_change: order.side === 'BUY' ? 0 : (currentPrice - entryPrice) * quantity,
      percent_change: order.side === 'BUY' ? 0 : ((currentPrice - entryPrice) / entryPrice) * 100,
      tax_incurred: 0,
      after_tax_value: order.side === 'BUY' ? initialValue : quantity * currentPrice,
      after_tax_return: order.side === 'BUY' ? 0 : ((currentPrice - entryPrice) / entryPrice) * 100
    };
    
    // Scenario 2: Follow FinVest (the shadow execution)
    const followFinal = quantity * currentPrice;
    const followChange = order.side === 'BUY' 
      ? followFinal - initialValue
      : initialValue - (quantity * currentPrice);  // Profit from selling
    const followTax = followChange > 0 && holdingPeriodDays < 365 ? followChange * taxRate : 0;
    
    const followFinvest: ScenarioOutcome = {
      scenario: 'FOLLOW_FINVEST',
      description: `If you followed the ${order.side} recommendation`,
      initial_value: initialValue,
      final_value: followFinal,
      absolute_change: followChange,
      percent_change: (followChange / initialValue) * 100,
      tax_incurred: followTax,
      after_tax_value: followFinal - followTax,
      after_tax_return: ((followFinal - followTax - initialValue) / initialValue) * 100
    };
    
    // Scenario 3: User Actual (from UserMemory if available)
    // For shadow executions, user's "actual" is what they did with the shadow
    const userActual: ScenarioOutcome = {
      scenario: 'USER_ACTUAL',
      description: 'What actually happened',
      initial_value: initialValue,
      final_value: order.current_value || followFinal,
      absolute_change: (order.current_value || followFinal) - initialValue,
      percent_change: (((order.current_value || followFinal) - initialValue) / initialValue) * 100,
      tax_incurred: followTax, // Assuming same tax treatment
      after_tax_value: (order.current_value || followFinal) - followTax,
      after_tax_return: (((order.current_value || followFinal) - followTax - initialValue) / initialValue) * 100
    };
    
    // Determine best/worst outcomes
    const outcomes = [doNothing, followFinvest, userActual];
    const sorted = [...outcomes].sort((a, b) => b.after_tax_return - a.after_tax_return);
    const bestOutcome = sorted[0].scenario;
    const worstOutcome = sorted[sorted.length - 1].scenario;
    
    // Calculate regret index (0-100)
    const bestReturn = sorted[0].after_tax_return;
    const userReturn = userActual.after_tax_return;
    const regretIndex = Math.max(0, Math.min(100, (bestReturn - userReturn) * 5));
    
    // Determine who was right
    let whoWasRight: 'FINVEST' | 'USER' | 'TIE' | 'BOTH_WRONG';
    let verdictExplanation: string;
    
    const finvestReturn = followFinvest.after_tax_return;
    const doNothingReturn = doNothing.after_tax_return;
    
    if (Math.abs(finvestReturn - userReturn) < 1) {
      whoWasRight = 'TIE';
      verdictExplanation = 'Both approaches yielded similar results.';
    } else if (finvestReturn > userReturn && finvestReturn > doNothingReturn) {
      whoWasRight = 'FINVEST';
      verdictExplanation = `Following FinVest would have yielded ${(finvestReturn - userReturn).toFixed(1)}% more.`;
    } else if (userReturn > finvestReturn && userReturn > doNothingReturn) {
      whoWasRight = 'USER';
      verdictExplanation = `Your approach beat FinVest by ${(userReturn - finvestReturn).toFixed(1)}%.`;
    } else if (doNothingReturn > finvestReturn && doNothingReturn > userReturn) {
      whoWasRight = 'BOTH_WRONG';
      verdictExplanation = `Doing nothing would have been better than both approaches.`;
    } else {
      whoWasRight = 'TIE';
      verdictExplanation = 'Results were mixed.';
    }
    
    // Create analysis
    const analysis: ConsequenceAnalysis = {
      id,
      decision_id: order.id,
      symbol: order.symbol,
      analysis_date: now,
      holding_period_days: holdingPeriodDays,
      do_nothing: doNothing,
      follow_finvest: followFinvest,
      user_actual: userActual,
      best_outcome: bestOutcome,
      worst_outcome: worstOutcome,
      regret_index: regretIndex,
      who_was_right: whoWasRight,
      verdict_explanation: verdictExplanation,
      finvest_recommendation: `${order.side} ${order.symbol}`,
      finvest_confidence: 70, // Default confidence for shadow orders
      user_action: `Shadow ${order.side} ${order.quantity} @ ${entryPrice.toFixed(2)}`,
      created_at: now,
      audit_log_id: order.audit_log_id
    };
    
    // Store and audit
    this.analyses.set(id, analysis);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'TAX_CALCULATION', // Using available type
      severity: 'INFO',
      summary: `Consequence analysis: ${whoWasRight} was right for ${order.symbol}`,
      details: {
        analysis_id: id,
        decision_id: order.id,
        who_was_right: whoWasRight,
        regret_index: regretIndex,
        finvest_return: finvestReturn,
        user_return: userReturn
      },
      actor: 'ENGINE'
    });
    
    return analysis;
  }
  
  /**
   * Analyze from decision snapshot
   */
  public analyzeFromSnapshot(
    snapshot: DecisionSnapshot,
    currentPrices: Map<string, PriceData>,
    userActions: Map<string, { action: string; quantity: number; price: number }>,
    _taxRate: number = 0.15
  ): ConsequenceAnalysis[] {
    const analyses: ConsequenceAnalysis[] = [];
    
    for (const output of snapshot.outputs) {
      if (!output.symbol) continue;
      
      const currentPriceData = currentPrices.get(output.symbol);
      if (!currentPriceData) continue;
      
      const userAction = userActions.get(output.symbol);
      
      // Create analysis similar to shadow execution
      // This is a simplified version - full implementation would mirror analyzeFromShadowExecution
      const id = `CONS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      const decisionDate = new Date(snapshot.created_at);
      const holdingPeriodDays = Math.floor((Date.now() - decisionDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const analysis: ConsequenceAnalysis = {
        id,
        decision_id: snapshot.id,
        symbol: output.symbol,
        analysis_date: now,
        holding_period_days: holdingPeriodDays,
        do_nothing: {
          scenario: 'DO_NOTHING',
          description: 'If you had not taken any action',
          initial_value: 0,
          final_value: 0,
          absolute_change: 0,
          percent_change: 0,
          tax_incurred: 0,
          after_tax_value: 0,
          after_tax_return: 0
        },
        follow_finvest: {
          scenario: 'FOLLOW_FINVEST',
          description: `If you followed the ${output.action} recommendation`,
          initial_value: 0,
          final_value: 0,
          absolute_change: 0,
          percent_change: output.expected_return || 0,
          tax_incurred: 0,
          after_tax_value: 0,
          after_tax_return: output.post_tax_return || 0
        },
        user_actual: {
          scenario: 'USER_ACTUAL',
          description: userAction ? `${userAction.action} at ${userAction.price}` : 'No action taken',
          initial_value: 0,
          final_value: 0,
          absolute_change: 0,
          percent_change: 0,
          tax_incurred: 0,
          after_tax_value: 0,
          after_tax_return: 0
        },
        best_outcome: 'DO_NOTHING',
        worst_outcome: 'DO_NOTHING',
        regret_index: 0,
        who_was_right: 'TIE',
        verdict_explanation: 'Analysis requires actual trade data.',
        finvest_recommendation: `${output.action} ${output.symbol}`,
        finvest_confidence: output.confidence,
        user_action: userAction ? `${userAction.action} ${userAction.quantity} @ ${userAction.price}` : 'No action',
        created_at: now,
        audit_log_id: ''
      };
      
      this.analyses.set(id, analysis);
      analyses.push(analysis);
    }
    
    this.saveToStorage();
    return analyses;
  }
  
  /**
   * Get analysis by ID
   */
  public getAnalysis(id: string): ConsequenceAnalysis | null {
    return this.analyses.get(id) || null;
  }
  
  /**
   * Get analyses for a decision
   */
  public getAnalysesForDecision(decisionId: string): ConsequenceAnalysis[] {
    return Array.from(this.analyses.values())
      .filter(a => a.decision_id === decisionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Get analyses for a symbol
   */
  public getAnalysesForSymbol(symbol: string): ConsequenceAnalysis[] {
    return Array.from(this.analyses.values())
      .filter(a => a.symbol === symbol)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Get overall stats
   */
  public getStats(): {
    total_analyses: number;
    finvest_wins: number;
    user_wins: number;
    ties: number;
    both_wrong: number;
    average_regret: number;
    finvest_accuracy: number;
  } {
    const all = Array.from(this.analyses.values());
    const total = all.length;
    
    const finvestWins = all.filter(a => a.who_was_right === 'FINVEST').length;
    const userWins = all.filter(a => a.who_was_right === 'USER').length;
    const ties = all.filter(a => a.who_was_right === 'TIE').length;
    const bothWrong = all.filter(a => a.who_was_right === 'BOTH_WRONG').length;
    
    const avgRegret = total > 0 
      ? all.reduce((sum, a) => sum + a.regret_index, 0) / total 
      : 0;
    
    const finvestAccuracy = total > 0 
      ? (finvestWins + ties * 0.5) / total 
      : 0;
    
    return {
      total_analyses: total,
      finvest_wins: finvestWins,
      user_wins: userWins,
      ties,
      both_wrong: bothWrong,
      average_regret: avgRegret,
      finvest_accuracy: finvestAccuracy
    };
  }
  
  /**
   * Get recent analyses for dashboard
   */
  public getRecentAnalyses(limit: number = 10): ConsequenceAnalysis[] {
    return Array.from(this.analyses.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }
  
  // ===========================================================================
  // PHASE 22: DAILY CONSEQUENCE TRACKING
  // ===========================================================================
  
  /**
   * Load time series from storage
   */
  private loadTimeSeriesFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_consequence_timeseries');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, series] of Object.entries(parsed)) {
          this.timeSeries.set(id, series as ConsequenceTimeSeries);
        }
      }
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to load consequence time series',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  /**
   * Save time series to storage
   */
  private saveTimeSeriesToStorage(): void {
    try {
      const toStore: Record<string, ConsequenceTimeSeries> = {};
      for (const [id, series] of this.timeSeries) {
        toStore[id] = series;
      }
      localStorage.setItem('finvest_consequence_timeseries', JSON.stringify(toStore));
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to save consequence time series',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  /**
   * Record daily tracking point for a decision
   * Call this daily (or when prices update)
   */
  public recordDailyPoint(
    decisionId: string,
    symbol: string,
    currentPrice: number,
    entryPrice: number,
    quantity: number,
    taxRate: number = 0.15
  ): TimeSeriesPoint | null {
    const today = new Date().toISOString().split('T')[0];
    
    // Get or create time series
    let series = this.timeSeries.get(decisionId);
    if (!series) {
      series = {
        decision_id: decisionId,
        symbol,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        points: [],
        peak_value: entryPrice * quantity,
        peak_date: today,
        trough_value: entryPrice * quantity,
        trough_date: today,
        max_regret: 0,
        max_opportunity_cost: 0
      };
    }
    
    // Check if we already have a point for today
    const existingPoint = series.points.find(p => p.date === today);
    if (existingPoint) {
      // Update existing point
      const idx = series.points.indexOf(existingPoint);
      series.points[idx] = this.calculatePoint(
        today, currentPrice, entryPrice, quantity, taxRate
      );
    } else {
      // Add new point
      const point = this.calculatePoint(today, currentPrice, entryPrice, quantity, taxRate);
      series.points.push(point);
      
      // Keep last 365 points (1 year)
      if (series.points.length > 365) {
        series.points = series.points.slice(-365);
      }
    }
    
    // Update running stats
    const currentValue = currentPrice * quantity;
    if (currentValue > series.peak_value) {
      series.peak_value = currentValue;
      series.peak_date = today;
    }
    if (currentValue < series.trough_value) {
      series.trough_value = currentValue;
      series.trough_date = today;
    }
    
    const latestPoint = series.points[series.points.length - 1];
    if (latestPoint.regret_index > series.max_regret) {
      series.max_regret = latestPoint.regret_index;
    }
    if (latestPoint.opportunity_cost > series.max_opportunity_cost) {
      series.max_opportunity_cost = latestPoint.opportunity_cost;
    }
    
    series.last_updated = new Date().toISOString();
    
    // Store
    this.timeSeries.set(decisionId, series);
    this.saveTimeSeriesToStorage();
    
    return latestPoint;
  }
  
  /**
   * Calculate a time series point
   */
  private calculatePoint(
    date: string,
    currentPrice: number,
    entryPrice: number,
    quantity: number,
    taxRate: number
  ): TimeSeriesPoint {
    const currentValue = currentPrice * quantity;
    const entryValue = entryPrice * quantity;
    const unrealizedPnl = currentValue - entryValue;
    const unrealizedPnlPercent = (unrealizedPnl / entryValue) * 100;
    
    // Tax-adjusted delta (if selling now)
    const taxIfSold = unrealizedPnl > 0 ? unrealizedPnl * taxRate : 0;
    const taxAdjustedDelta = unrealizedPnl - taxIfSold;
    
    // Simplified regret calculation
    const regretIndex = unrealizedPnl < 0 
      ? Math.min(100, Math.abs(unrealizedPnlPercent) * 2)
      : 0;
    
    // Opportunity cost (if positive, there was a missed gain)
    const opportunityCost = unrealizedPnl > 0 ? unrealizedPnl : 0;
    
    return {
      date,
      price: currentPrice,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_percent: unrealizedPnlPercent,
      tax_adjusted_delta: taxAdjustedDelta,
      regret_index: regretIndex,
      opportunity_cost: opportunityCost
    };
  }
  
  /**
   * Get time series for a decision
   */
  public getTimeSeries(decisionId: string): ConsequenceTimeSeries | null {
    return this.timeSeries.get(decisionId) || null;
  }
  
  /**
   * Get all time series
   */
  public getAllTimeSeries(): ConsequenceTimeSeries[] {
    return Array.from(this.timeSeries.values())
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());
  }
  
  /**
   * Get time series stats
   */
  public getTimeSeriesStats(): {
    total_tracked: number;
    total_regret: number;
    total_opportunity_cost: number;
    avg_unrealized_pnl_percent: number;
    symbols: string[];
  } {
    const allSeries = Array.from(this.timeSeries.values());
    const total = allSeries.length;
    
    if (total === 0) {
      return {
        total_tracked: 0,
        total_regret: 0,
        total_opportunity_cost: 0,
        avg_unrealized_pnl_percent: 0,
        symbols: []
      };
    }
    
    let totalRegret = 0;
    let totalOpportunityCost = 0;
    let totalPnlPercent = 0;
    const symbols: string[] = [];
    
    for (const series of allSeries) {
      totalRegret += series.max_regret;
      totalOpportunityCost += series.max_opportunity_cost;
      symbols.push(series.symbol);
      
      const latestPoint = series.points[series.points.length - 1];
      if (latestPoint) {
        totalPnlPercent += latestPoint.unrealized_pnl_percent;
      }
    }
    
    return {
      total_tracked: total,
      total_regret: totalRegret,
      total_opportunity_cost: totalOpportunityCost,
      avg_unrealized_pnl_percent: totalPnlPercent / total,
      symbols: [...new Set(symbols)]
    };
  }
  
  /**
   * Update all time series with current prices
   * Call this daily
   */
  public updateAllTimeSeries(
    currentPrices: Map<string, number>,
    entryPrices: Map<string, { price: number; quantity: number }>,
    taxRate: number = 0.15
  ): number {
    let updated = 0;
    
    for (const [decisionId, series] of this.timeSeries) {
      const currentPrice = currentPrices.get(series.symbol);
      const entryData = entryPrices.get(series.symbol);
      
      if (currentPrice && entryData) {
        this.recordDailyPoint(
          decisionId,
          series.symbol,
          currentPrice,
          entryData.price,
          entryData.quantity,
          taxRate
        );
        updated++;
      }
    }
    
    if (updated > 0) {
      this.auditLog.log({
        event_type: 'PRICE_UPDATE',
        severity: 'INFO',
        summary: `Updated ${updated} consequence time series`,
        details: { updated_count: updated, timestamp: new Date().toISOString() },
        actor: 'ENGINE'
      });
    }
    
    return updated;
  }
}

// Export singleton getter
export const getConsequenceEngine = () => ConsequenceEngine.getInstance();

export default ConsequenceEngine;

