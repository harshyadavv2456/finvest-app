/**
 * FinBotDailyNarrative - Position-Based Daily Narrative
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * FinBot now answers in THIS format:
 * 
 * "Yesterday:
 *  • Position A: HOLD → result +1.2%
 *  • Position B: INITIATED → entry success
 * 
 * Today:
 *  • Position A: HOLD (reason)
 *  • Position B: REDUCE (reason)
 *  • Position C: AVOID (reason)
 * 
 * System Status:
 *  • Risk used: X / Y
 *  • Capital deployed: X%
 *  • Taxes pending: ₹X"
 * 
 * NO generic advice.
 * NO opportunity dumps.
 * ONLY position-based explanations.
 */

import { Position, PositionDecision } from './Position';
import { 
  DailyReconciliationResult, 
  PositionReconciliationResult 
} from './PositionReconciliationEngine';
import { DailyExecutionSummary } from './ExecutionOrchestrator';
import { getPositionTimeline, PositionDailyAssessment } from './PositionTimeline';
import { ShutdownGuard } from '../shutdown/ShutdownGuard';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Position summary for narrative
 */
export interface PositionNarrativeSummary {
  readonly symbol: string;
  readonly position_id: string;
  readonly decision: PositionDecision;
  readonly reason: string;
  readonly pnl_percent?: number;
  readonly quantity: number;
  readonly current_value: number;
}

/**
 * Yesterday's outcome summary
 */
export interface YesterdayOutcome {
  readonly symbol: string;
  readonly decision_taken: PositionDecision;
  readonly result_pnl_percent: number;
  readonly result_description: string;
}

/**
 * System status summary
 */
export interface SystemStatusSummary {
  readonly risk_used_percent: number;
  readonly risk_limit_percent: number;
  readonly capital_deployed_percent: number;
  readonly total_capital: number;
  readonly taxes_pending: number;
  readonly positions_count: number;
  readonly mode: 'PAPER' | 'LIVE';
}

/**
 * Full daily narrative
 */
export interface DailyNarrative {
  readonly date: string;
  readonly yesterday_summary: readonly YesterdayOutcome[];
  readonly today_decisions: readonly PositionNarrativeSummary[];
  readonly system_status: SystemStatusSummary;
  readonly narrative_text: string;
  readonly generated_at: string;
  readonly _frozen: true;
}

// =============================================================================
// FINBOT DAILY NARRATIVE
// =============================================================================

export class FinBotDailyNarrative {
  private timeline = getPositionTimeline();
  
  /**
   * Generate daily narrative from reconciliation
   */
  public generateNarrative(
    reconciliation: DailyReconciliationResult,
    execution: DailyExecutionSummary,
    positions: readonly Position[],
    totalCapital: number,
    riskLimit: number
  ): DailyNarrative {
    // Check system is alive
    try {
      ShutdownGuard.assertSystemAlive('FINBOT_SPEAK');
    } catch (e) {
      return this.generateSilentNarrative(reconciliation.date, e);
    }
    
    // Get yesterday's outcomes
    const yesterday = this.getYesterdayOutcomes(reconciliation.results);
    
    // Build today's decisions
    const today = this.buildTodayDecisions(reconciliation.results);
    
    // Calculate system status
    const status = this.calculateSystemStatus(
      positions,
      totalCapital,
      riskLimit,
      execution.mode
    );
    
    // Generate narrative text
    const narrativeText = this.buildNarrativeText(yesterday, today, status);
    
    return Object.freeze({
      date: reconciliation.date,
      yesterday_summary: Object.freeze(yesterday),
      today_decisions: Object.freeze(today),
      system_status: Object.freeze(status),
      narrative_text: narrativeText,
      generated_at: new Date().toISOString(),
      _frozen: true
    });
  }
  
  /**
   * Generate silent narrative when system is blocked
   */
  private generateSilentNarrative(date: string, error: unknown): DailyNarrative {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return Object.freeze({
      date,
      yesterday_summary: Object.freeze([]),
      today_decisions: Object.freeze([]),
      system_status: Object.freeze({
        risk_used_percent: 0,
        risk_limit_percent: 0,
        capital_deployed_percent: 0,
        total_capital: 0,
        taxes_pending: 0,
        positions_count: 0,
        mode: 'PAPER' as const
      }),
      narrative_text: `**SYSTEM BLOCKED**\n\nI am unable to provide daily narrative due to system restrictions.\n\nReason: ${errorMessage}`,
      generated_at: new Date().toISOString(),
      _frozen: true
    });
  }
  
  /**
   * Get yesterday's outcomes for positions
   */
  private getYesterdayOutcomes(
    results: readonly PositionReconciliationResult[]
  ): YesterdayOutcome[] {
    const outcomes: YesterdayOutcome[] = [];
    
    for (const result of results) {
      const yesterdayState = result.assessment.yesterday_state;
      const currentPrice = result.position.current_price;
      const yesterdayPrice = yesterdayState.price;
      
      const pnlPercent = ((currentPrice - yesterdayPrice) / yesterdayPrice) * 100;
      
      let resultDescription: string;
      if (yesterdayState.last_decision === 'INITIATE') {
        resultDescription = pnlPercent >= 0 ? 'Entry success' : 'Entry challenged';
      } else if (yesterdayState.last_decision === 'HOLD') {
        resultDescription = pnlPercent >= 0 ? `Gained ${pnlPercent.toFixed(1)}%` : `Lost ${Math.abs(pnlPercent).toFixed(1)}%`;
      } else if (yesterdayState.last_decision === 'REDUCE') {
        resultDescription = 'Reduction executed';
      } else if (yesterdayState.last_decision === 'EXIT') {
        resultDescription = 'Position closed';
      } else {
        resultDescription = 'Avoided';
      }
      
      outcomes.push({
        symbol: result.position.symbol,
        decision_taken: yesterdayState.last_decision,
        result_pnl_percent: pnlPercent,
        result_description: resultDescription
      });
    }
    
    return outcomes;
  }
  
  /**
   * Build today's decision summaries
   */
  private buildTodayDecisions(
    results: readonly PositionReconciliationResult[]
  ): PositionNarrativeSummary[] {
    return results.map(result => ({
      symbol: result.position.symbol,
      position_id: result.position.position_id,
      decision: result.assessment.decision_outcome,
      reason: result.assessment.decision_reason,
      pnl_percent: result.position.unrealized_pnl_percent,
      quantity: result.position.quantity,
      current_value: result.position.current_value
    }));
  }
  
  /**
   * Calculate system status
   */
  private calculateSystemStatus(
    positions: readonly Position[],
    totalCapital: number,
    riskLimit: number,
    mode: 'PAPER' | 'LIVE'
  ): SystemStatusSummary {
    const totalDeployed = positions
      .filter(p => p.lifecycle_state !== 'CLOSED')
      .reduce((sum, p) => sum + p.current_value, 0);
    
    const totalRiskUsed = positions
      .filter(p => p.lifecycle_state !== 'CLOSED')
      .reduce((sum, p) => sum + p.risk_allocation.risk_units, 0);
    
    const taxesPending = positions
      .filter(p => p.lifecycle_state !== 'CLOSED')
      .reduce((sum, p) => sum + p.total_tax_liability_if_sold, 0);
    
    return {
      risk_used_percent: (totalRiskUsed / riskLimit) * 100,
      risk_limit_percent: 100,
      capital_deployed_percent: (totalDeployed / totalCapital) * 100,
      total_capital: totalCapital,
      taxes_pending: taxesPending,
      positions_count: positions.filter(p => p.lifecycle_state !== 'CLOSED').length,
      mode
    };
  }
  
  /**
   * Build human-readable narrative text
   */
  private buildNarrativeText(
    yesterday: YesterdayOutcome[],
    today: PositionNarrativeSummary[],
    status: SystemStatusSummary
  ): string {
    const lines: string[] = [];
    
    // Yesterday section
    lines.push('**Yesterday:**');
    if (yesterday.length === 0) {
      lines.push('• No positions tracked yesterday');
    } else {
      for (const outcome of yesterday) {
        const pnlStr = outcome.result_pnl_percent >= 0 
          ? `+${outcome.result_pnl_percent.toFixed(1)}%`
          : `${outcome.result_pnl_percent.toFixed(1)}%`;
        lines.push(`• ${outcome.symbol}: ${outcome.decision_taken} → ${outcome.result_description} (${pnlStr})`);
      }
    }
    
    lines.push('');
    
    // Today section
    lines.push('**Today:**');
    if (today.length === 0) {
      lines.push('• No positions to assess');
    } else {
      for (const decision of today) {
        const pnlStr = decision.pnl_percent !== undefined
          ? decision.pnl_percent >= 0 
            ? ` [+${decision.pnl_percent.toFixed(1)}%]`
            : ` [${decision.pnl_percent.toFixed(1)}%]`
          : '';
        lines.push(`• ${decision.symbol}: **${decision.decision}**${pnlStr}`);
        lines.push(`  └─ ${decision.reason}`);
      }
    }
    
    lines.push('');
    
    // System status section
    lines.push('**System Status:**');
    lines.push(`• Mode: ${status.mode}`);
    lines.push(`• Risk used: ${status.risk_used_percent.toFixed(0)}% / ${status.risk_limit_percent.toFixed(0)}%`);
    lines.push(`• Capital deployed: ${status.capital_deployed_percent.toFixed(0)}% (₹${this.formatCurrency(status.total_capital * status.capital_deployed_percent / 100)})`);
    lines.push(`• Positions: ${status.positions_count} open`);
    lines.push(`• Taxes pending: ₹${this.formatCurrency(status.taxes_pending)}`);
    
    return lines.join('\n');
  }
  
  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    if (amount >= 10000000) {
      return `${(amount / 10000000).toFixed(2)}Cr`;
    } else if (amount >= 100000) {
      return `${(amount / 100000).toFixed(2)}L`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K`;
    }
    return amount.toFixed(0);
  }
  
  /**
   * Answer position-related questions
   */
  public answerQuestion(
    question: string,
    positions: readonly Position[],
    lastReconciliation: DailyReconciliationResult | null
  ): string {
    // Check system is alive
    try {
      ShutdownGuard.assertSystemAlive('FINBOT_SPEAK');
    } catch (e) {
      return `I am unable to answer due to system restrictions: ${e instanceof Error ? e.message : String(e)}`;
    }
    
    const lowerQuestion = question.toLowerCase();
    
    // Handle specific question patterns
    if (lowerQuestion.includes('why') && lowerQuestion.includes('hold')) {
      return this.explainHoldDecisions(positions, lastReconciliation);
    }
    
    if (lowerQuestion.includes('why') && (lowerQuestion.includes('sell') || lowerQuestion.includes('exit'))) {
      return this.explainExitDecisions(positions, lastReconciliation);
    }
    
    if (lowerQuestion.includes('status') || lowerQuestion.includes('portfolio')) {
      return this.getPortfolioStatus(positions);
    }
    
    if (lowerQuestion.includes('risk')) {
      return this.getRiskStatus(positions);
    }
    
    if (lowerQuestion.includes('tax')) {
      return this.getTaxStatus(positions);
    }
    
    // Default: list positions
    return this.listPositions(positions);
  }
  
  private explainHoldDecisions(
    positions: readonly Position[],
    reconciliation: DailyReconciliationResult | null
  ): string {
    if (!reconciliation) {
      return 'No reconciliation data available for today.';
    }
    
    const holds = reconciliation.results.filter(r => r.assessment.decision_outcome === 'HOLD');
    
    if (holds.length === 0) {
      return 'No positions are being held today.';
    }
    
    const lines = ['**Positions being held today:**\n'];
    for (const hold of holds) {
      lines.push(`• **${hold.position.symbol}**: ${hold.assessment.decision_reason}`);
      lines.push(`  └─ Current P&L: ${hold.position.unrealized_pnl_percent.toFixed(1)}%`);
    }
    
    return lines.join('\n');
  }
  
  private explainExitDecisions(
    positions: readonly Position[],
    reconciliation: DailyReconciliationResult | null
  ): string {
    if (!reconciliation) {
      return 'No reconciliation data available for today.';
    }
    
    const exits = reconciliation.results.filter(
      r => r.assessment.decision_outcome === 'EXIT' || r.assessment.decision_outcome === 'REDUCE'
    );
    
    if (exits.length === 0) {
      return 'No exit or reduce decisions today.';
    }
    
    const lines = ['**Exit/Reduce decisions today:**\n'];
    for (const exit of exits) {
      lines.push(`• **${exit.position.symbol}**: ${exit.assessment.decision_outcome}`);
      lines.push(`  └─ Reason: ${exit.assessment.decision_reason}`);
      lines.push(`  └─ Impact: ₹${Math.abs(exit.assessment.expected_impact.estimated_pnl_impact).toFixed(0)}`);
    }
    
    return lines.join('\n');
  }
  
  private getPortfolioStatus(positions: readonly Position[]): string {
    const openPositions = positions.filter(p => p.lifecycle_state !== 'CLOSED');
    const totalValue = openPositions.reduce((sum, p) => sum + p.current_value, 0);
    const totalPnl = openPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
    
    const lines = [
      '**Portfolio Status:**\n',
      `• Open positions: ${openPositions.length}`,
      `• Total value: ₹${this.formatCurrency(totalValue)}`,
      `• Unrealized P&L: ₹${this.formatCurrency(totalPnl)} (${((totalPnl / (totalValue - totalPnl)) * 100).toFixed(1)}%)`,
      '',
      '**Position breakdown:**'
    ];
    
    for (const pos of openPositions.slice(0, 5)) {
      lines.push(`• ${pos.symbol}: ₹${this.formatCurrency(pos.current_value)} (${pos.unrealized_pnl_percent.toFixed(1)}%)`);
    }
    
    if (openPositions.length > 5) {
      lines.push(`• ... and ${openPositions.length - 5} more`);
    }
    
    return lines.join('\n');
  }
  
  private getRiskStatus(positions: readonly Position[]): string {
    const openPositions = positions.filter(p => p.lifecycle_state !== 'CLOSED');
    const totalRisk = openPositions.reduce((sum, p) => sum + p.risk_allocation.risk_units, 0);
    const avgDrawdown = openPositions.reduce((sum, p) => sum + p.risk_allocation.current_drawdown, 0) / openPositions.length;
    
    return [
      '**Risk Status:**\n',
      `• Total risk units: ${totalRisk.toFixed(1)}`,
      `• Average drawdown: ${avgDrawdown.toFixed(1)}%`,
      `• Positions at risk: ${openPositions.filter(p => p.risk_allocation.current_drawdown > 10).length}`
    ].join('\n');
  }
  
  private getTaxStatus(positions: readonly Position[]): string {
    const openPositions = positions.filter(p => p.lifecycle_state !== 'CLOSED');
    const stcgPositions = openPositions.filter(p => p.tax_lots.some(l => !l.is_ltcg_eligible));
    const ltcgPositions = openPositions.filter(p => p.tax_lots.every(l => l.is_ltcg_eligible));
    const totalTax = openPositions.reduce((sum, p) => sum + p.total_tax_liability_if_sold, 0);
    
    return [
      '**Tax Status:**\n',
      `• STCG positions: ${stcgPositions.length}`,
      `• LTCG eligible: ${ltcgPositions.length}`,
      `• Total tax if liquidated: ₹${this.formatCurrency(totalTax)}`
    ].join('\n');
  }
  
  private listPositions(positions: readonly Position[]): string {
    const openPositions = positions.filter(p => p.lifecycle_state !== 'CLOSED');
    
    if (openPositions.length === 0) {
      return 'No open positions.';
    }
    
    const lines = ['**Current Positions:**\n'];
    for (const pos of openPositions) {
      const pnlStr = pos.unrealized_pnl_percent >= 0 
        ? `+${pos.unrealized_pnl_percent.toFixed(1)}%`
        : `${pos.unrealized_pnl_percent.toFixed(1)}%`;
      lines.push(`• ${pos.symbol}: ${pos.quantity} shares @ ₹${pos.average_cost.toFixed(0)} → ${pnlStr}`);
    }
    
    return lines.join('\n');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createFinBotDailyNarrative = () => new FinBotDailyNarrative();

export default FinBotDailyNarrative;

