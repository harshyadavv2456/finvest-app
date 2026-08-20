/**
 * FinBotWithMemory - Mandatory Memory Consultation
 * 
 * PHASE 19: User Memory Engine (HARD ENFORCEMENT)
 * 
 * RULES (NON-NEGOTIABLE):
 * - FinBot MUST consult UserMemory on EVERY response
 * - NO memory → FinBot REFUSES to answer
 * - Ignored 3x → downgrade clarity
 * - Failed historically → add warning
 * - Successful historically → concise, NOT confident
 * - Log EVERY interaction to DecisionAuditLog
 * - NO generic advice without data backing
 */

import { FinBotCIO, CIOResponse } from './FinBotCIO';
import { UserMemory, AdviceRecord, UserBehaviorStats, MemoryInsight } from '../memory/UserMemory';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getSnapshotAuthority, SnapshotAuthority } from '../core/SnapshotAuthority';
import { DecisionOutput } from '../core/DecisionSnapshot';
import { decisionContextManager } from '../core/DecisionContext';

// =============================================================================
// TYPES
// =============================================================================

export interface MemoryAwareCIOResponse extends CIOResponse {
  // Memory context
  memory_consulted: true;
  memory_stats: {
    advice_shown: number;
    advice_ignored: number;
    advice_accepted: number;
    success_rate: number;
  };
  
  // Adjustments from memory
  confidence_adjustment: number;
  clarity_adjustment: number;
  memory_warnings: string[];
  memory_insights: MemoryInsight[];
  
  // Tracking
  advice_record_id: string;
  snapshot_id: string;
}

export interface MemoryRefusalResponse {
  refused: true;
  reason: string;
  memory_status: 'UNAVAILABLE' | 'CORRUPTED' | 'INSUFFICIENT';
  action_required: string;
  audit_log_id: string;
}

export type FinBotMemoryResponse = MemoryAwareCIOResponse | MemoryRefusalResponse;

// =============================================================================
// FINBOT WITH MEMORY
// =============================================================================

/**
 * FinBotWithMemory
 * 
 * Wraps FinBotCIO with MANDATORY memory consultation.
 * Will REFUSE to respond if memory cannot be consulted.
 */
export class FinBotWithMemory {
  private static instance: FinBotWithMemory;
  private finBotCIO: FinBotCIO;
  private userMemory: UserMemory;
  private auditLog: DecisionAuditLog;
  private snapshotAuthority: SnapshotAuthority;
  
  // Thresholds
  private readonly IGNORE_THRESHOLD = 3;
  private readonly MIN_HISTORY_FOR_ADJUSTMENT = 5;
  
  private constructor() {
    this.finBotCIO = FinBotCIO.getInstance();
    this.userMemory = UserMemory.getInstance();
    this.auditLog = DecisionAuditLog.getInstance();
    this.snapshotAuthority = getSnapshotAuthority();
  }
  
  public static getInstance(): FinBotWithMemory {
    if (!FinBotWithMemory.instance) {
      FinBotWithMemory.instance = new FinBotWithMemory();
    }
    return FinBotWithMemory.instance;
  }
  
  /**
   * Process query with MANDATORY memory consultation
   */
  async processQuery(query: string): Promise<FinBotMemoryResponse> {
    const now = new Date().toISOString();
    
    // GATE 1: Memory must be available
    let memoryStats: UserBehaviorStats;
    try {
      memoryStats = this.userMemory.getStats();
    } catch (e) {
      const auditId = this.auditLog.log({
        event_type: 'FINBOT_REFUSAL',
        severity: 'ERROR',
        summary: 'FinBot refused: UserMemory unavailable',
        details: { error: String(e), query },
        actor: 'FINBOT'
      });
      
      return {
        refused: true,
        reason: 'UserMemory system is unavailable. FinBot cannot respond without memory consultation.',
        memory_status: 'UNAVAILABLE',
        action_required: 'RELOAD_APPLICATION',
        audit_log_id: auditId
      };
    }
    
    // GATE 2: Get memory modifiers
    const symbol = this.extractSymbol(query);
    const modifiers = this.userMemory.getResponseModifiers(symbol || undefined);
    const insights = this.userMemory.getInsights();
    
    // GATE 3: Check for pattern that warrants refusal
    if (modifiers.confidence_adjustment <= -20) {
      // User has ignored advice too many times
      const auditId = this.auditLog.log({
        event_type: 'FINBOT_REFUSAL',
        severity: 'WARNING',
        summary: 'FinBot refused: User has ignored advice 3+ times',
        details: {
          query,
          confidence_adjustment: modifiers.confidence_adjustment,
          total_ignored: memoryStats.total_ignored
        },
        actor: 'FINBOT'
      });
      
      return {
        refused: true,
        reason: `Based on your history of not following advice (${memoryStats.total_ignored} ignored), FinBot's recommendations may not align with your investment approach. Consider reviewing your investment policy or resetting advice history.`,
        memory_status: 'INSUFFICIENT',
        action_required: 'REVIEW_POLICY_OR_RESET',
        audit_log_id: auditId
      };
    }
    
    // GATE 4: Log query with memory context
    const queryLogId = this.auditLog.log({
      event_type: 'FINBOT_QUERY',
      severity: 'INFO',
      summary: `FinBot query (memory consulted): "${query.slice(0, 50)}..."`,
      details: {
        query,
        memory_stats: {
          advice_shown: memoryStats.total_advice_shown,
          advice_accepted: memoryStats.total_accepted,
          advice_ignored: memoryStats.total_ignored,
          success_rate: memoryStats.success_rate
        },
        confidence_adjustment: modifiers.confidence_adjustment,
        clarity_adjustment: modifiers.clarity_multiplier
      },
      actor: 'USER'
    });
    
    // GATE 5: Get base response from FinBotCIO
    let baseResponse: CIOResponse;
    try {
      baseResponse = await this.finBotCIO.processQuery(query);
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'ERROR',
        summary: 'FinBotCIO processing failed',
        details: { error: String(e), query },
        actor: 'ENGINE'
      });
      
      return {
        refused: true,
        reason: 'FinBot processing failed. Please try again.',
        memory_status: 'UNAVAILABLE',
        action_required: 'RETRY',
        audit_log_id: queryLogId
      };
    }
    
    // GATE 6: Create snapshot for this response (MANDATORY)
    const context = decisionContextManager.getContext();
    if (!context) {
      return {
        refused: true,
        reason: 'No DecisionContext available. Connect portfolio first.',
        memory_status: 'UNAVAILABLE',
        action_required: 'CONNECT_PORTFOLIO',
        audit_log_id: queryLogId
      };
    }
    
    const outputs: DecisionOutput[] = [{
      action: baseResponse.recommendation.action,
      symbol: baseResponse.recommendation.symbol,
      quantity: baseResponse.recommendation.quantity,
      reasoning: baseResponse.recommendation.reasoning,
      confidence: this.applyConfidenceAdjustment(
        baseResponse.citations.confidence_score,
        modifiers.confidence_adjustment
      )
    }];
    
    const snapshotResult = this.snapshotAuthority.createFinBotSnapshot(context, outputs);
    if (!snapshotResult.valid) {
      return {
        refused: true,
        reason: snapshotResult.reason,
        memory_status: 'UNAVAILABLE',
        action_required: 'REFRESH_DATA',
        audit_log_id: queryLogId
      };
    }
    
    // GATE 7: Record advice shown
    const adviceRecordId = this.userMemory.recordAdviceShown(
      snapshotResult.snapshot.id,
      symbol || 'PORTFOLIO',
      baseResponse.recommendation.action,
      context.live_prices.get(symbol || '')?.price || 0
    );
    
    // GATE 8: Apply memory adjustments to response
    const adjustedResponse = this.applyMemoryAdjustments(
      baseResponse,
      modifiers,
      insights,
      memoryStats
    );
    
    // GATE 9: Build final response with memory context
    const finalResponse: MemoryAwareCIOResponse = {
      ...adjustedResponse,
      memory_consulted: true,
      memory_stats: {
        advice_shown: memoryStats.total_advice_shown,
        advice_ignored: memoryStats.total_ignored,
        advice_accepted: memoryStats.total_accepted,
        success_rate: memoryStats.success_rate
      },
      confidence_adjustment: modifiers.confidence_adjustment,
      clarity_adjustment: modifiers.clarity_multiplier,
      memory_warnings: modifiers.warnings,
      memory_insights: insights,
      advice_record_id: adviceRecordId,
      snapshot_id: snapshotResult.snapshot.id
    };
    
    // GATE 10: Log response
    this.auditLog.log({
      event_type: 'FINBOT_RESPONSE',
      severity: 'INFO',
      summary: `FinBot responded: ${baseResponse.recommendation.action}`,
      details: {
        query_log_id: queryLogId,
        snapshot_id: snapshotResult.snapshot.id,
        advice_record_id: adviceRecordId,
        original_confidence: baseResponse.citations.confidence_score,
        adjusted_confidence: outputs[0].confidence,
        memory_adjustments: {
          confidence_adjustment: modifiers.confidence_adjustment,
          clarity_adjustment: modifiers.clarity_multiplier,
          warnings_count: modifiers.warnings.length,
          insights_count: insights.length
        }
      },
      actor: 'FINBOT',
      parent_id: queryLogId
    });
    
    return finalResponse;
  }
  
  /**
   * Record user response to advice
   * CALL THIS when user accepts, rejects, or ignores advice
   */
  recordUserResponse(
    adviceRecordId: string,
    response: 'ACCEPTED' | 'IGNORED' | 'REJECTED' | 'PARTIAL',
    currentPrice: number
  ): void {
    this.userMemory.recordResponse(adviceRecordId, response, currentPrice);
    
    this.auditLog.log({
      event_type: response === 'ACCEPTED' ? 'USER_CONFIRMATION' : 'USER_REJECTION',
      severity: 'INFO',
      summary: `User ${response.toLowerCase()} advice`,
      details: {
        advice_record_id: adviceRecordId,
        response,
        price_at_response: currentPrice
      },
      actor: 'USER'
    });
  }
  
  /**
   * Get current memory stats
   */
  getMemoryStats(): UserBehaviorStats {
    return this.userMemory.getStats();
  }
  
  /**
   * Get memory insights
   */
  getInsights(): MemoryInsight[] {
    return this.userMemory.getInsights();
  }
  
  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================
  
  private applyMemoryAdjustments(
    response: CIOResponse,
    modifiers: { confidence_adjustment: number; clarity_multiplier: number; warnings: string[] },
    insights: MemoryInsight[],
    stats: UserBehaviorStats
  ): CIOResponse {
    // Apply confidence adjustment
    const adjustedConfidence = this.applyConfidenceAdjustment(
      response.citations.confidence_score,
      modifiers.confidence_adjustment
    );
    
    // Add memory-based warnings
    const additionalWarnings: string[] = [];
    
    // If user has historically ignored advice for this symbol
    const symbolInsight = insights.find(i => 
      i.type === 'SYMBOL_PATTERN' && 
      i.applies_to?.includes(response.recommendation.symbol || '')
    );
    if (symbolInsight) {
      additionalWarnings.push(symbolInsight.message);
    }
    
    // If success rate is high, add clarity (but NOT confidence)
    if (stats.success_rate > 0.7 && stats.outcomes_measured >= 5) {
      additionalWarnings.push(
        `Note: Your historical success rate when following advice is ${(stats.success_rate * 100).toFixed(0)}%.`
      );
    }
    
    // If user tends to ignore, add note
    if (stats.total_ignored >= this.IGNORE_THRESHOLD) {
      additionalWarnings.push(
        `You've ignored ${stats.total_ignored} recommendations. Consider why this advice might differ from your approach.`
      );
    }
    
    return {
      ...response,
      citations: {
        ...response.citations,
        confidence_score: adjustedConfidence
      },
      disclaimers: [
        ...response.disclaimers,
        ...additionalWarnings,
        'This recommendation factors in your historical interaction patterns.'
      ]
    };
  }
  
  private applyConfidenceAdjustment(base: number, adjustment: number): number {
    // Never inflate confidence - only decrease or maintain
    const adjusted = base + Math.min(0, adjustment);
    return Math.max(0, Math.min(100, adjusted));
  }
  
  private extractSymbol(query: string): string | null {
    const match = query.match(/\b([A-Z]{2,10}(?:\.[A-Z]{2})?)\b/);
    return match ? match[1] : null;
  }
}

// Export singleton getter
export const getFinBotWithMemory = () => FinBotWithMemory.getInstance();

export default FinBotWithMemory;

