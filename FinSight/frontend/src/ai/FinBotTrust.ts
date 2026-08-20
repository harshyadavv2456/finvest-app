/**
 * FinBotTrust - Trust Query Handler
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * FinBot must answer:
 * - "Can I trust you?"
 * - "Why should I listen to you?"
 * - "Where were you wrong?"
 * 
 * ALL responses MUST cite TrustLedger + Calibration data.
 * NO vague claims. Numbers only.
 */

import { getTrustLedger, TrustScore, TrustEntry } from '../trust/TrustLedger';
import { getConfidenceCalibration, CalibrationReport, BucketStats } from '../trust/ConfidenceCalibration';
import { getExecutionPermission, PermissionStatus } from '../trust/ExecutionPermission';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export type TrustQueryType = 
  | 'CAN_I_TRUST'
  | 'WHY_LISTEN'
  | 'WHERE_WRONG'
  | 'TRACK_RECORD'
  | 'CONFIDENCE_ANALYSIS'
  | 'UNKNOWN';

export interface TrustQueryResult {
  query_type: TrustQueryType;
  answered: boolean;
  response: string;
  
  // Data citations
  trust_data: {
    score: TrustScore | null;
    calibration: CalibrationReport | null;
    permission: PermissionStatus | null;
  };
  
  // Key metrics cited
  metrics_cited: {
    accuracy_percent: number;
    trust_score: number;
    decisions_tracked: number;
    days_of_tracking: number;
    regret_avoided: number;
    regret_incurred: number;
    worst_mistake_amount: number;
    best_avoided_amount: number;
  };
  
  // Audit
  audit_log_id: string;
  timestamp: string;
}

// =============================================================================
// FINBOT TRUST HANDLER
// =============================================================================

export class FinBotTrust {
  private static instance: FinBotTrust;
  private trustLedger = getTrustLedger();
  private calibration = getConfidenceCalibration();
  private permissionManager = getExecutionPermission();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): FinBotTrust {
    if (!FinBotTrust.instance) {
      FinBotTrust.instance = new FinBotTrust();
    }
    return FinBotTrust.instance;
  }
  
  // ===========================================================================
  // QUERY DETECTION
  // ===========================================================================
  
  /**
   * Detect if a query is trust-related
   */
  public isTrustQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const trustKeywords = [
      'can i trust',
      'trust you',
      'should i trust',
      'why should i listen',
      'why listen',
      'prove yourself',
      'track record',
      'where were you wrong',
      'where you wrong',
      'your mistakes',
      'how accurate',
      'accuracy',
      'calibration',
      'confidence',
      'how reliable',
      'reliable',
      'trustworthy',
      'believe you',
      'prove it'
    ];
    
    return trustKeywords.some(keyword => lowerQuery.includes(keyword));
  }
  
  /**
   * Classify the type of trust query
   */
  public classifyQuery(query: string): TrustQueryType {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('can i trust') || lowerQuery.includes('trust you') || lowerQuery.includes('trustworthy')) {
      return 'CAN_I_TRUST';
    }
    
    if (lowerQuery.includes('why') && (lowerQuery.includes('listen') || lowerQuery.includes('believe'))) {
      return 'WHY_LISTEN';
    }
    
    if (lowerQuery.includes('wrong') || lowerQuery.includes('mistake')) {
      return 'WHERE_WRONG';
    }
    
    if (lowerQuery.includes('track record') || lowerQuery.includes('record') || lowerQuery.includes('history')) {
      return 'TRACK_RECORD';
    }
    
    if (lowerQuery.includes('confidence') || lowerQuery.includes('calibration')) {
      return 'CONFIDENCE_ANALYSIS';
    }
    
    return 'UNKNOWN';
  }
  
  // ===========================================================================
  // QUERY HANDLERS
  // ===========================================================================
  
  /**
   * Process a trust query
   */
  public processQuery(query: string): TrustQueryResult {
    const queryType = this.classifyQuery(query);
    const timestamp = new Date().toISOString();
    
    // Log query
    const auditLogId = this.auditLog.log({
      event_type: 'FINBOT_QUERY',
      severity: 'INFO',
      summary: `Trust query: ${queryType}`,
      details: { query, query_type: queryType },
      actor: 'USER'
    });
    
    // Get trust data
    this.trustLedger.sync();
    const trustScore = this.trustLedger.getTrustScore();
    const calibration = this.calibration.getCalibrationReport();
    const permission = this.permissionManager.evaluate();
    
    // Get key metrics
    const worstMistakes = this.trustLedger.getWorstMistakes(3);
    const bestAvoided = this.trustLedger.getBestAvoidedLosses(3);
    
    const metrics = {
      accuracy_percent: trustScore.overall_accuracy * 100,
      trust_score: trustScore.net_trust_score,
      decisions_tracked: trustScore.total_sandbox_decisions,
      days_of_tracking: trustScore.days_of_tracking,
      regret_avoided: trustScore.total_regret_avoided,
      regret_incurred: trustScore.total_regret_incurred,
      worst_mistake_amount: worstMistakes[0]?.regret_amount || 0,
      best_avoided_amount: bestAvoided[0]?.regret_amount || 0
    };
    
    let response = '';
    
    switch (queryType) {
      case 'CAN_I_TRUST':
        response = this.generateCanITrustResponse(trustScore, calibration, permission, metrics);
        break;
        
      case 'WHY_LISTEN':
        response = this.generateWhyListenResponse(trustScore, calibration, metrics);
        break;
        
      case 'WHERE_WRONG':
        response = this.generateWhereWrongResponse(trustScore, worstMistakes, metrics);
        break;
        
      case 'TRACK_RECORD':
        response = this.generateTrackRecordResponse(trustScore, metrics);
        break;
        
      case 'CONFIDENCE_ANALYSIS':
        response = this.generateConfidenceResponse(calibration, metrics);
        break;
        
      default:
        response = this.generateDefaultResponse(trustScore, metrics);
        break;
    }
    
    // Log response
    this.auditLog.log({
      event_type: 'FINBOT_RESPONSE',
      severity: 'INFO',
      summary: `Trust response: ${queryType}`,
      details: {
        query_type: queryType,
        metrics_cited: metrics
      },
      actor: 'FINBOT',
      parent_id: auditLogId
    });
    
    return {
      query_type: queryType,
      answered: true,
      response,
      trust_data: {
        score: trustScore,
        calibration,
        permission
      },
      metrics_cited: metrics,
      audit_log_id: auditLogId,
      timestamp
    };
  }
  
  // ===========================================================================
  // RESPONSE GENERATORS
  // ===========================================================================
  
  private generateCanITrustResponse(
    trust: TrustScore,
    calibration: CalibrationReport,
    permission: PermissionStatus,
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**Can you trust me? Here's the data:**\n\n`;
    
    // Honesty first
    response += `I've tracked **${trust.total_sandbox_decisions} decisions** over **${trust.days_of_tracking} days**.\n\n`;
    
    // Net trust score
    response += `**Trust Score: ${trust.net_trust_score}/100**\n`;
    if (trust.net_trust_score >= 70) {
      response += `This indicates strong reliability based on historical accuracy.\n\n`;
    } else if (trust.net_trust_score >= 50) {
      response += `This indicates moderate reliability. More tracking needed.\n\n`;
    } else {
      response += `This is below the threshold for high trust. I need to prove myself further.\n\n`;
    }
    
    // Accuracy breakdown
    response += `**Accuracy:**\n`;
    response += `- Overall: ${(trust.overall_accuracy * 100).toFixed(1)}%\n`;
    response += `- Correct approvals: ${trust.correct_approvals} / ${trust.approved_count}\n`;
    response += `- Correct rejections: ${trust.correct_rejections} / ${trust.rejected_count}\n`;
    response += `- Pending outcomes: ${trust.pending_outcomes}\n\n`;
    
    // Financial impact
    response += `**Financial Impact:**\n`;
    response += `- Regret avoided (good rejections): ₹${trust.total_regret_avoided.toLocaleString()}\n`;
    response += `- Regret incurred (missed opportunities): ₹${trust.total_regret_incurred.toLocaleString()}\n`;
    
    const netImpact = trust.total_regret_avoided - trust.total_regret_incurred;
    response += `- **Net: ${netImpact >= 0 ? '+' : ''}₹${netImpact.toLocaleString()}**\n\n`;
    
    // Calibration
    if (calibration.is_well_calibrated) {
      response += `✅ My confidence predictions are well-calibrated (error: ${calibration.overall_calibration_error.toFixed(1)}%)\n`;
    } else {
      response += `⚠️ My confidence predictions need improvement (error: ${calibration.overall_calibration_error.toFixed(1)}%)\n`;
    }
    
    // Current permission level
    response += `\n**Current Status:** ${permission.current_level}\n`;
    response += `Execution remains LOCKED until trust is proven.\n`;
    
    response += `\n*All data from sandbox tracking. No real trades.*`;
    
    return response;
  }
  
  private generateWhyListenResponse(
    trust: TrustScore,
    calibration: CalibrationReport,
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**Why should you listen to me? The numbers:**\n\n`;
    
    // If we have enough data
    if (trust.total_sandbox_decisions < 10) {
      response += `⚠️ I only have ${trust.total_sandbox_decisions} decisions tracked.\n`;
      response += `That's not enough to draw conclusions. Keep using sandbox.\n\n`;
      response += `**Minimum needed:** 10+ decisions, 2+ weeks of tracking.\n`;
      return response;
    }
    
    response += `Over **${trust.days_of_tracking} days**, I've made **${trust.total_sandbox_decisions} recommendations**.\n\n`;
    
    // Accuracy
    response += `**Track Record:**\n`;
    response += `- Overall accuracy: **${(trust.overall_accuracy * 100).toFixed(1)}%**\n`;
    
    // Compare to random
    const randomAccuracy = 50;
    const improvement = (trust.overall_accuracy * 100) - randomAccuracy;
    if (improvement > 0) {
      response += `- That's ${improvement.toFixed(1)}% better than random guessing\n`;
    }
    
    // High confidence performance
    response += `\n**High Confidence Recommendations (≥75):**\n`;
    response += `- Accuracy: ${calibration.high.accuracy_percent.toFixed(1)}%\n`;
    response += `- Decisions: ${calibration.high.total_decisions}\n`;
    
    // Financial proof
    response += `\n**Financial Proof:**\n`;
    const netImpact = trust.total_regret_avoided - trust.total_regret_incurred;
    if (netImpact > 0) {
      response += `- Following my advice would have saved you **₹${netImpact.toLocaleString()}**\n`;
    } else {
      response += `- Net impact: ₹${netImpact.toLocaleString()} (I've made mistakes)\n`;
    }
    
    // Honesty about wrong decisions
    const wrongTotal = trust.wrong_approvals + trust.wrong_rejections;
    if (wrongTotal > 0) {
      response += `\n**I was wrong ${wrongTotal} times.**\n`;
      response += `I'm not hiding my mistakes. Check /trust for full details.\n`;
    }
    
    response += `\n*No marketing language. These are real numbers.*`;
    
    return response;
  }
  
  private generateWhereWrongResponse(
    trust: TrustScore,
    worstMistakes: readonly TrustEntry[],
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**Where I was wrong:**\n\n`;
    
    const totalWrong = trust.wrong_approvals + trust.wrong_rejections;
    
    if (totalWrong === 0) {
      response += `I haven't been proven wrong yet.\n`;
      response += `But it's early - only ${trust.total_sandbox_decisions} decisions tracked.\n`;
      response += `My mistakes will be recorded here when they happen.\n`;
      return response;
    }
    
    response += `I was wrong **${totalWrong} times** out of ${trust.total_sandbox_decisions - trust.pending_outcomes} decided outcomes.\n\n`;
    
    response += `**Breakdown:**\n`;
    response += `- Wrong approvals (you followed, I was wrong): ${trust.wrong_approvals}\n`;
    response += `- Wrong rejections (you rejected, I was right): ${trust.wrong_rejections}\n\n`;
    
    if (worstMistakes.length > 0) {
      response += `**Top ${Math.min(3, worstMistakes.length)} Worst Mistakes:**\n\n`;
      
      worstMistakes.forEach((mistake, idx) => {
        response += `${idx + 1}. **${mistake.symbol}** - ${mistake.user_decision} my ${mistake.action_recommended}\n`;
        response += `   - Regret: ₹${Math.abs(mistake.regret_amount).toLocaleString()}\n`;
        response += `   - Expected: ${mistake.return_if_followed >= 0 ? '+' : ''}${mistake.return_if_followed.toFixed(1)}%\n`;
        response += `   - Actual: ${mistake.return_actual >= 0 ? '+' : ''}${mistake.return_actual.toFixed(1)}%\n\n`;
      });
    }
    
    response += `**Total Loss from Mistakes:** ₹${trust.total_loss_incurred.toLocaleString()}\n`;
    
    response += `\n*I own my mistakes. Transparency builds trust.*`;
    
    return response;
  }
  
  private generateTrackRecordResponse(
    trust: TrustScore,
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**My Track Record:**\n\n`;
    
    response += `**Duration:** ${trust.days_of_tracking} days\n`;
    response += `**First Decision:** ${trust.first_entry_date ? new Date(trust.first_entry_date).toLocaleDateString() : 'N/A'}\n`;
    response += `**Total Decisions:** ${trust.total_sandbox_decisions}\n\n`;
    
    response += `**Decision Breakdown:**\n`;
    response += `| Category | Count | Rate |\n`;
    response += `|----------|-------|------|\n`;
    response += `| Correct Approvals | ${trust.correct_approvals} | ${trust.approved_count > 0 ? ((trust.correct_approvals / trust.approved_count) * 100).toFixed(0) : 0}% |\n`;
    response += `| Wrong Approvals | ${trust.wrong_approvals} | ${trust.approved_count > 0 ? ((trust.wrong_approvals / trust.approved_count) * 100).toFixed(0) : 0}% |\n`;
    response += `| Correct Rejections | ${trust.correct_rejections} | ${trust.rejected_count > 0 ? ((trust.correct_rejections / trust.rejected_count) * 100).toFixed(0) : 0}% |\n`;
    response += `| Wrong Rejections | ${trust.wrong_rejections} | ${trust.rejected_count > 0 ? ((trust.wrong_rejections / trust.rejected_count) * 100).toFixed(0) : 0}% |\n`;
    response += `| Pending | ${trust.pending_outcomes} | — |\n\n`;
    
    response += `**Financial Summary:**\n`;
    response += `- Gains from correct calls: ₹${trust.total_loss_avoided.toLocaleString()}\n`;
    response += `- Losses from mistakes: ₹${trust.total_loss_incurred.toLocaleString()}\n`;
    response += `- Regret avoided: ₹${trust.total_regret_avoided.toLocaleString()}\n`;
    response += `- Regret incurred: ₹${trust.total_regret_incurred.toLocaleString()}\n`;
    
    const netRegret = trust.total_regret_avoided - trust.total_regret_incurred;
    response += `- **Net Regret Balance:** ${netRegret >= 0 ? '+' : ''}₹${netRegret.toLocaleString()}\n`;
    
    response += `\n*All from sandbox. No real money.*`;
    
    return response;
  }
  
  private generateConfidenceResponse(
    calibration: CalibrationReport,
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**Confidence Calibration Analysis:**\n\n`;
    
    response += `**Overall Status:** ${calibration.is_well_calibrated ? '✅ Well Calibrated' : '⚠️ Needs Improvement'}\n`;
    response += `**Calibration Error:** ${calibration.overall_calibration_error.toFixed(1)}%\n\n`;
    
    response += `**By Confidence Bucket:**\n\n`;
    
    const buckets = [
      { name: 'HIGH', data: calibration.high, desc: '≥75' },
      { name: 'MEDIUM', data: calibration.medium, desc: '50-74' },
      { name: 'LOW', data: calibration.low, desc: '<50' }
    ];
    
    for (const { name, data, desc } of buckets) {
      response += `**${name} (${desc}):**\n`;
      response += `- Decisions: ${data.total_decisions}\n`;
      response += `- Actual accuracy: ${data.accuracy_percent.toFixed(1)}%\n`;
      response += `- Expected accuracy: ${data.expected_accuracy_percent.toFixed(1)}%\n`;
      
      if (data.overconfidence_penalty > 0) {
        response += `- ⚠️ Overconfidence: ${data.overconfidence_penalty.toFixed(1)}%\n`;
      } else if (data.underconfidence_bonus > 0) {
        response += `- ✅ Underconfidence (good!): ${data.underconfidence_bonus.toFixed(1)}%\n`;
      }
      
      response += `- Avg regret: ₹${data.avg_regret_per_decision.toLocaleString()}\n\n`;
    }
    
    // Insights
    if (calibration.insights.length > 0) {
      response += `**Key Insights:**\n`;
      for (const insight of calibration.insights.slice(0, 3)) {
        const icon = insight.type === 'SUCCESS' ? '✅' : insight.type === 'WARNING' ? '⚠️' : 'ℹ️';
        response += `${icon} ${insight.message}\n`;
      }
    }
    
    return response;
  }
  
  private generateDefaultResponse(
    trust: TrustScore,
    metrics: TrustQueryResult['metrics_cited']
  ): string {
    let response = `**Trust Summary:**\n\n`;
    
    response += `- Trust Score: ${trust.net_trust_score}/100\n`;
    response += `- Accuracy: ${(trust.overall_accuracy * 100).toFixed(1)}%\n`;
    response += `- Decisions Tracked: ${trust.total_sandbox_decisions}\n`;
    response += `- Days of Tracking: ${trust.days_of_tracking}\n\n`;
    
    response += `**Try asking:**\n`;
    response += `- "Can I trust you?"\n`;
    response += `- "Why should I listen to you?"\n`;
    response += `- "Where were you wrong?"\n`;
    
    return response;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotTrust = () => FinBotTrust.getInstance();
export default FinBotTrust;

