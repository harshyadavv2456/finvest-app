/**
 * FinBotSandbox - Sandbox Query Handler
 * 
 * PHASE 22: Execution Sandbox Integration
 * 
 * FinBot must answer:
 * - "What if I had followed you?"
 * - "Which decisions hurt me?"
 * - "Where was I wrong ignoring you?"
 * 
 * ALL responses MUST cite sandbox data.
 * NO responses without numbers.
 */

import { getExecutionSandbox, SandboxStats, IntentRecord, IntentPerformance } from '../execution/ExecutionSandbox';
import { getConsequenceEngine } from '../analysis/ConsequenceEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export interface SandboxQueryResult {
  query_type: SandboxQueryType;
  answered: boolean;
  response: string;
  
  // Data citations
  data: {
    stats: SandboxStats | null;
    decisions: Array<{
      symbol: string;
      action: string;
      status: string;
      regret_amount: number;
      return_if_followed: number;
      return_actual: number;
    }>;
    totals: {
      total_decisions: number;
      followed_count: number;
      rejected_count: number;
      total_regret: number;
      opportunity_cost: number;
      if_followed_value: number;
      actual_value: number;
    };
  };
  
  // Audit
  audit_log_id: string;
  timestamp: string;
}

export type SandboxQueryType = 
  | 'WHAT_IF_FOLLOWED'
  | 'WHICH_HURT_ME'
  | 'WHERE_WAS_I_WRONG'
  | 'PERFORMANCE_SUMMARY'
  | 'UNKNOWN';

// =============================================================================
// FINBOT SANDBOX HANDLER
// =============================================================================

export class FinBotSandbox {
  private static instance: FinBotSandbox;
  private sandbox = getExecutionSandbox();
  private consequenceEngine = getConsequenceEngine();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): FinBotSandbox {
    if (!FinBotSandbox.instance) {
      FinBotSandbox.instance = new FinBotSandbox();
    }
    return FinBotSandbox.instance;
  }
  
  // ===========================================================================
  // QUERY DETECTION
  // ===========================================================================
  
  /**
   * Detect if a query is sandbox-related
   */
  public isSandboxQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const sandboxKeywords = [
      'what if i had followed',
      'what if i followed',
      'if i had followed you',
      'which decisions hurt',
      'decisions hurt me',
      'where was i wrong',
      'where i was wrong',
      'ignoring you',
      'missed opportunities',
      'sandbox',
      'regret',
      'should have followed',
      'performance vs finvest',
      'how much did i lose',
      'cost of ignoring'
    ];
    
    return sandboxKeywords.some(keyword => lowerQuery.includes(keyword));
  }
  
  /**
   * Classify the type of sandbox query
   */
  public classifyQuery(query: string): SandboxQueryType {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('what if') && (lowerQuery.includes('followed') || lowerQuery.includes('follow'))) {
      return 'WHAT_IF_FOLLOWED';
    }
    
    if (lowerQuery.includes('hurt') || lowerQuery.includes('lost') || lowerQuery.includes('cost')) {
      return 'WHICH_HURT_ME';
    }
    
    if (lowerQuery.includes('wrong') || lowerQuery.includes('ignoring')) {
      return 'WHERE_WAS_I_WRONG';
    }
    
    if (lowerQuery.includes('performance') || lowerQuery.includes('summary') || lowerQuery.includes('sandbox')) {
      return 'PERFORMANCE_SUMMARY';
    }
    
    return 'UNKNOWN';
  }
  
  // ===========================================================================
  // QUERY HANDLERS
  // ===========================================================================
  
  /**
   * Process a sandbox query
   */
  public processQuery(query: string): SandboxQueryResult {
    const queryType = this.classifyQuery(query);
    const timestamp = new Date().toISOString();
    
    // Log query
    const auditLogId = this.auditLog.log({
      event_type: 'FINBOT_QUERY',
      severity: 'INFO',
      summary: `Sandbox query: ${queryType}`,
      details: { query, query_type: queryType },
      actor: 'USER'
    });
    
    // Get sandbox data
    const stats = this.sandbox.getStats();
    const comparison = this.sandbox.getFollowedComparison();
    const hurtful = this.sandbox.getHurtfulDecisions();
    const wrongIgnores = this.sandbox.getWrongIgnores();
    
    // Build base response
    const baseData = {
      stats,
      decisions: [],
      totals: {
        total_decisions: comparison.total_recommendations,
        followed_count: comparison.followed_count,
        rejected_count: comparison.rejected_count,
        total_regret: stats.total_regret,
        opportunity_cost: stats.total_opportunity_cost,
        if_followed_value: comparison.if_followed_all_value,
        actual_value: comparison.actual_value
      }
    };
    
    let response = '';
    let decisions: SandboxQueryResult['data']['decisions'] = [];
    
    switch (queryType) {
      case 'WHAT_IF_FOLLOWED':
        response = this.generateWhatIfResponse(comparison, stats);
        decisions = hurtful.slice(0, 5).map(d => ({
          symbol: d.symbol,
          action: d.action_recommended,
          status: d.user_decision,
          regret_amount: d.regret_amount,
          return_if_followed: d.regret_percent,
          return_actual: 0
        }));
        break;
        
      case 'WHICH_HURT_ME':
        response = this.generateHurtfulResponse(hurtful, stats);
        decisions = hurtful.slice(0, 5).map(d => ({
          symbol: d.symbol,
          action: d.action_recommended,
          status: d.user_decision,
          regret_amount: d.regret_amount,
          return_if_followed: d.regret_percent,
          return_actual: 0
        }));
        break;
        
      case 'WHERE_WAS_I_WRONG':
        response = this.generateWrongIgnoresResponse(wrongIgnores, stats);
        decisions = wrongIgnores.slice(0, 5).map(d => ({
          symbol: d.symbol,
          action: d.ignored_action,
          status: 'REJECTED',
          regret_amount: d.opportunity_cost,
          return_if_followed: parseFloat(d.what_would_have_been.replace('%', '')),
          return_actual: parseFloat(d.current_outcome.replace('%', ''))
        }));
        break;
        
      case 'PERFORMANCE_SUMMARY':
        response = this.generateSummaryResponse(stats, comparison);
        break;
        
      default:
        response = this.generateDefaultResponse(stats);
        break;
    }
    
    // Log response
    this.auditLog.log({
      event_type: 'FINBOT_RESPONSE',
      severity: 'INFO',
      summary: `Sandbox response: ${queryType}`,
      details: {
        query_type: queryType,
        response_length: response.length,
        decisions_count: decisions.length
      },
      actor: 'FINBOT',
      parent_id: auditLogId
    });
    
    return {
      query_type: queryType,
      answered: true,
      response,
      data: {
        ...baseData,
        decisions
      },
      audit_log_id: auditLogId,
      timestamp
    };
  }
  
  // ===========================================================================
  // RESPONSE GENERATORS
  // ===========================================================================
  
  private generateWhatIfResponse(
    comparison: ReturnType<typeof this.sandbox.getFollowedComparison>,
    stats: SandboxStats
  ): string {
    const delta = comparison.if_followed_all_value - comparison.actual_value;
    const deltaPercent = comparison.actual_value > 0 
      ? (delta / comparison.actual_value) * 100 
      : 0;
    
    let response = `**If you had followed all my recommendations:**\n\n`;
    response += `- Total Recommendations: ${comparison.total_recommendations}\n`;
    response += `- You Followed: ${comparison.followed_count}\n`;
    response += `- You Rejected: ${comparison.rejected_count}\n\n`;
    
    response += `**Portfolio Value Comparison:**\n`;
    response += `- If Followed All: ₹${comparison.if_followed_all_value.toLocaleString()}\n`;
    response += `- Your Actual Value: ₹${comparison.actual_value.toLocaleString()}\n`;
    response += `- Difference: ${delta >= 0 ? '+' : ''}₹${delta.toLocaleString()} (${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(2)}%)\n\n`;
    
    if (delta > 0) {
      response += `📈 Following my advice would have generated **₹${delta.toLocaleString()}** more.\n`;
      response += `Missed gains: ₹${comparison.missed_gains.toLocaleString()}\n`;
    } else if (delta < 0) {
      response += `✅ Your rejections saved you **₹${Math.abs(delta).toLocaleString()}**.\n`;
      response += `Losses avoided: ₹${comparison.avoided_losses.toLocaleString()}\n`;
    } else {
      response += `⚖️ Following my advice would have yielded similar results.\n`;
    }
    
    response += `\n*Data from sandbox. No real trades executed.*`;
    
    return response;
  }
  
  private generateHurtfulResponse(
    hurtful: ReturnType<typeof this.sandbox.getHurtfulDecisions>,
    stats: SandboxStats
  ): string {
    let response = `**Decisions That Hurt You:**\n\n`;
    
    if (hurtful.length === 0) {
      response += `✅ No decisions hurt you! Your rejections have been accurate.\n\n`;
      response += `- Total Regret: ₹0\n`;
      response += `- Opportunity Cost: ₹0\n`;
    } else {
      response += `I found **${hurtful.length} decisions** where rejecting my advice cost you money:\n\n`;
      
      for (let i = 0; i < Math.min(5, hurtful.length); i++) {
        const d = hurtful[i];
        response += `${i + 1}. **${d.symbol}** - Rejected ${d.action_recommended}\n`;
        response += `   - Regret: ₹${d.regret_amount.toLocaleString()} (${d.regret_percent.toFixed(1)}%)\n`;
        response += `   - Reason: ${d.reason}\n\n`;
      }
      
      response += `**Totals:**\n`;
      response += `- Total Regret: ₹${stats.total_regret.toLocaleString()}\n`;
      response += `- Total Opportunity Cost: ₹${stats.total_opportunity_cost.toLocaleString()}\n`;
    }
    
    response += `\n*Data from sandbox. No real trades executed.*`;
    
    return response;
  }
  
  private generateWrongIgnoresResponse(
    wrongIgnores: ReturnType<typeof this.sandbox.getWrongIgnores>,
    stats: SandboxStats
  ): string {
    let response = `**Where You Were Wrong Ignoring Me:**\n\n`;
    
    if (wrongIgnores.length === 0) {
      response += `✅ You haven't been wrong ignoring me - yet!\n`;
      response += `Either you made great decisions, or it's too early to tell.\n`;
    } else {
      response += `I found **${wrongIgnores.length} cases** where ignoring me was a mistake:\n\n`;
      
      for (let i = 0; i < Math.min(5, wrongIgnores.length); i++) {
        const d = wrongIgnores[i];
        response += `${i + 1}. **${d.symbol}** - You ignored ${d.ignored_action}\n`;
        response += `   - Your outcome: ${d.current_outcome}\n`;
        response += `   - If followed me: ${d.what_would_have_been}\n`;
        response += `   - Cost: ₹${d.opportunity_cost.toLocaleString()}\n\n`;
      }
      
      response += `**Impact:**\n`;
      response += `- Average Regret: ${stats.average_regret_percent.toFixed(1)}%\n`;
      response += `- Total Opportunity Cost: ₹${stats.total_opportunity_cost.toLocaleString()}\n`;
    }
    
    response += `\n*Data from sandbox. No real trades executed.*`;
    
    return response;
  }
  
  private generateSummaryResponse(
    stats: SandboxStats,
    comparison: ReturnType<typeof this.sandbox.getFollowedComparison>
  ): string {
    let response = `**Sandbox Performance Summary:**\n\n`;
    
    response += `**Decision Stats:**\n`;
    response += `- Total Decisions: ${stats.total_intents}\n`;
    response += `- Approved: ${stats.approved_count}\n`;
    response += `- Rejected: ${stats.rejected_count}\n`;
    response += `- Pending: ${stats.pending_count}\n\n`;
    
    response += `**Financial Impact:**\n`;
    response += `- Total Regret: ₹${stats.total_regret.toLocaleString()}\n`;
    response += `- Opportunity Cost: ₹${stats.total_opportunity_cost.toLocaleString()}\n`;
    response += `- Average Regret: ${stats.average_regret_percent.toFixed(1)}%\n\n`;
    
    response += `**Portfolio Comparison:**\n`;
    response += `- If Followed All: ₹${comparison.if_followed_all_value.toLocaleString()}\n`;
    response += `- Actual Value: ₹${comparison.actual_value.toLocaleString()}\n`;
    response += `- Delta: ${stats.delta_value >= 0 ? '+' : ''}₹${stats.delta_value.toLocaleString()} (${stats.delta_percent >= 0 ? '+' : ''}${stats.delta_percent.toFixed(2)}%)\n\n`;
    
    response += `**Accuracy by Confidence:**\n`;
    response += `- High (80-100): ${(stats.accuracy_by_confidence.high.rate * 100).toFixed(0)}% (${stats.accuracy_by_confidence.high.correct}/${stats.accuracy_by_confidence.high.total})\n`;
    response += `- Medium (60-79): ${(stats.accuracy_by_confidence.medium.rate * 100).toFixed(0)}% (${stats.accuracy_by_confidence.medium.correct}/${stats.accuracy_by_confidence.medium.total})\n`;
    response += `- Low (0-59): ${(stats.accuracy_by_confidence.low.rate * 100).toFixed(0)}% (${stats.accuracy_by_confidence.low.correct}/${stats.accuracy_by_confidence.low.total})\n`;
    
    response += `\n*Data from sandbox. No real trades executed.*`;
    
    return response;
  }
  
  private generateDefaultResponse(stats: SandboxStats): string {
    let response = `I can help you analyze your sandbox performance.\n\n`;
    response += `**Try asking:**\n`;
    response += `- "What if I had followed you?"\n`;
    response += `- "Which decisions hurt me?"\n`;
    response += `- "Where was I wrong ignoring you?"\n\n`;
    
    response += `**Current Stats:**\n`;
    response += `- Total Decisions: ${stats.total_intents}\n`;
    response += `- Total Regret: ₹${stats.total_regret.toLocaleString()}\n`;
    response += `- Delta vs FinVest: ${stats.delta_percent >= 0 ? '+' : ''}${stats.delta_percent.toFixed(2)}%\n`;
    
    return response;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotSandbox = () => FinBotSandbox.getInstance();
export default FinBotSandbox;

