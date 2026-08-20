/**
 * FinBotNegotiator - Objection Handler
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * PURPOSE:
 * When decision is rejected/ignored:
 * - Ask ONE targeted question
 * - Cite lost value numerically
 * - Offer ONE simplified option
 * 
 * RULES (NON-NEGOTIABLE):
 * - NO persuasion
 * - NO pressure
 * - NO emotional language
 * - ONLY data-backed responses
 */

import { 
  getDecisionAdoption, 
  AdoptionRecord, 
  RejectionReason, 
  PendingDecision 
} from '../adoption/DecisionAdoption';
import { getConvictionGap, ConvictionAnalysis } from '../adoption/ConvictionGap';
import { getFrictionMap, FrictionPoint } from '../adoption/FrictionMap';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ObjectionResponse - Response to a rejected/ignored decision
 */
export interface ObjectionResponse {
  response_id: string;
  timestamp: string;
  
  // Context
  symbol: string;
  original_action: string;
  rejection_reason: RejectionReason | null;
  
  // ONE targeted question
  targeted_question: string;
  
  // Value citation (numerical only)
  value_citation: {
    current_value: number;
    potential_loss: number;
    opportunity_cost: number;
    tax_impact?: number;
  };
  
  // ONE simplified option
  simplified_option: {
    action: string;
    description: string;
    reduced_commitment: string;
  };
  
  // Metadata
  is_data_backed: boolean;
  data_sources: string[];
  
  // Audit
  audit_log_id: string;
}

/**
 * NegotiationResult - Outcome of negotiation attempt
 */
export interface NegotiationResult {
  response: ObjectionResponse;
  user_reconsidered: boolean;
  new_action?: 'APPROVE' | 'REJECT' | 'IGNORE';
  negotiation_successful: boolean;
}

// =============================================================================
// FINBOT NEGOTIATOR
// =============================================================================

export class FinBotNegotiator {
  private static instance: FinBotNegotiator;
  private adoption = getDecisionAdoption();
  private convictionGap = getConvictionGap();
  private frictionMap = getFrictionMap();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): FinBotNegotiator {
    if (!FinBotNegotiator.instance) {
      FinBotNegotiator.instance = new FinBotNegotiator();
    }
    return FinBotNegotiator.instance;
  }
  
  // ===========================================================================
  // OBJECTION HANDLING
  // ===========================================================================
  
  /**
   * Handle a rejection/ignore event
   * Returns ONE targeted response
   */
  public handleObjection(record: AdoptionRecord): ObjectionResponse {
    const responseId = `NEG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    
    // Get conviction analysis
    const analysis = this.convictionGap.analyzeRecord(record);
    
    // Get friction data for this reason
    const frictionPoint = record.rejection_reason 
      ? this.frictionMap.getFrictionForReason(record.rejection_reason)
      : null;
    
    // Generate targeted question
    const targetedQuestion = this.generateTargetedQuestion(record, analysis);
    
    // Build value citation (numbers only)
    const valueCitation = this.buildValueCitation(record, analysis);
    
    // Generate ONE simplified option
    const simplifiedOption = this.generateSimplifiedOption(record);
    
    // Log
    const auditLogId = this.auditLog.log({
      event_type: 'FINBOT_RESPONSE',
      severity: 'INFO',
      summary: `Negotiation response for ${record.system_recommendation.symbol}`,
      details: {
        response_id: responseId,
        rejection_reason: record.rejection_reason,
        conviction_gap: analysis.conviction_gap,
        targeted_question: targetedQuestion
      },
      actor: 'FINBOT'
    });
    
    return {
      response_id: responseId,
      timestamp,
      symbol: record.system_recommendation.symbol,
      original_action: record.system_recommendation.action,
      rejection_reason: record.rejection_reason,
      targeted_question: targetedQuestion,
      value_citation: valueCitation,
      simplified_option: simplifiedOption,
      is_data_backed: true,
      data_sources: ['AdoptionTracker', 'ConvictionGap', 'FrictionMap'],
      audit_log_id: auditLogId
    };
  }
  
  /**
   * Handle a pending decision that's getting stale
   */
  public handlePendingDecision(pending: PendingDecision): ObjectionResponse {
    const responseId = `NEG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    
    // Log
    const auditLogId = this.auditLog.log({
      event_type: 'FINBOT_RESPONSE',
      severity: 'INFO',
      summary: `Reminder for pending: ${pending.symbol}`,
      details: {
        response_id: responseId,
        pending_age_seconds: pending.age_seconds,
        confidence: pending.confidence
      },
      actor: 'FINBOT'
    });
    
    // Calculate opportunity cost
    const hoursPending = Math.floor(pending.age_seconds / 3600);
    
    return {
      response_id: responseId,
      timestamp,
      symbol: pending.symbol,
      original_action: pending.action,
      rejection_reason: 'PASSIVE_IGNORE',
      targeted_question: this.getPendingQuestion(pending),
      value_citation: {
        current_value: 0, // Would need price lookup
        potential_loss: 0,
        opportunity_cost: 0
      },
      simplified_option: {
        action: pending.action,
        description: `${pending.action} ${pending.symbol} with reduced size`,
        reduced_commitment: 'Start with 25% of recommended position'
      },
      is_data_backed: true,
      data_sources: ['PendingDecisions'],
      audit_log_id: auditLogId
    };
  }
  
  // ===========================================================================
  // QUESTION GENERATION
  // ===========================================================================
  
  /**
   * Generate ONE targeted question based on rejection reason
   * NO persuasion. Just clarification.
   */
  private generateTargetedQuestion(
    record: AdoptionRecord,
    analysis: ConvictionAnalysis
  ): string {
    const symbol = record.system_recommendation.symbol;
    const action = record.system_recommendation.action;
    const confidence = record.system_recommendation.confidence;
    
    switch (record.rejection_reason) {
      case 'TOO_COMPLEX':
        return `What specific part of the ${action} ${symbol} recommendation was unclear?`;
        
      case 'TAX_FEAR':
        return `Would seeing the after-tax return (accounting for STCG/LTCG) change your view on ${symbol}?`;
        
      case 'TIMING_DOUBT':
        return `At what price level would you consider ${action.toLowerCase()}ing ${symbol}?`;
        
      case 'CONVICTION_TOO_LOW':
        return `The signal has ${confidence}% confidence. What confidence level would you need to act?`;
        
      case 'POLICY_CONFLICT':
        return `Which of your investment rules does this ${action} conflict with?`;
        
      case 'PASSIVE_IGNORE':
        return `Is there a specific concern preventing you from acting on ${symbol}?`;
        
      case 'MARKET_CONDITION':
        return `What market condition would make you comfortable with ${action} ${symbol}?`;
        
      case 'LIQUIDITY_CONCERN':
        return `Would a smaller position size (e.g., 50%) address your concern about ${symbol}?`;
        
      case 'EXTERNAL_ADVICE':
        return `What does your other analysis suggest for ${symbol}?`;
        
      case 'NOT_SPECIFIED':
        return `What's the main factor holding you back from ${action.toLowerCase()}ing ${symbol}?`;
        
      default:
        if (analysis.conviction_gap > 40) {
          return `I had ${confidence}% confidence. What information would help close that gap?`;
        }
        return `What additional data would help you decide on ${symbol}?`;
    }
  }
  
  /**
   * Get question for pending decision
   */
  private getPendingQuestion(pending: PendingDecision): string {
    const hours = Math.floor(pending.age_seconds / 3600);
    
    if (hours < 24) {
      return `You have a pending ${pending.action} recommendation for ${pending.symbol}. Is there information missing?`;
    } else {
      return `It's been ${hours} hours since the ${pending.action} ${pending.symbol} recommendation. What's blocking your decision?`;
    }
  }
  
  // ===========================================================================
  // VALUE CITATION
  // ===========================================================================
  
  /**
   * Build value citation with ONLY numerical data
   * NO emotional language
   */
  private buildValueCitation(
    record: AdoptionRecord,
    analysis: ConvictionAnalysis
  ): ObjectionResponse['value_citation'] {
    return {
      current_value: record.value_at_decision,
      potential_loss: analysis.value_lost_due_to_inaction,
      opportunity_cost: analysis.value_lost_due_to_inaction,
      tax_impact: this.estimateTaxImpact(record)
    };
  }
  
  /**
   * Estimate tax impact
   */
  private estimateTaxImpact(record: AdoptionRecord): number {
    // Simplified estimation
    const value = record.value_at_decision;
    const expectedReturn = record.system_recommendation.expected_return;
    const gain = value * (expectedReturn / 100);
    
    // Assume STCG rate of 15%
    return gain > 0 ? gain * 0.15 : 0;
  }
  
  // ===========================================================================
  // SIMPLIFIED OPTIONS
  // ===========================================================================
  
  /**
   * Generate ONE simplified option
   * Reduce commitment, not arguments
   */
  private generateSimplifiedOption(record: AdoptionRecord): ObjectionResponse['simplified_option'] {
    const action = record.system_recommendation.action;
    const symbol = record.system_recommendation.symbol;
    
    switch (record.rejection_reason) {
      case 'LIQUIDITY_CONCERN':
        return {
          action: action,
          description: `${action} ${symbol} with 50% of recommended size`,
          reduced_commitment: 'Half position to manage liquidity'
        };
        
      case 'CONVICTION_TOO_LOW':
        return {
          action: action,
          description: `${action} ${symbol} with 25% of recommended size`,
          reduced_commitment: 'Starter position to track performance'
        };
        
      case 'TIMING_DOUBT':
        return {
          action: 'WAIT_WITH_ALERT',
          description: `Set alert for ${symbol} at 5% better price`,
          reduced_commitment: 'No commitment now, alert when conditions improve'
        };
        
      case 'TAX_FEAR':
        return {
          action: action,
          description: `${action} after LTCG eligibility (if applicable)`,
          reduced_commitment: 'Defer action to optimize tax'
        };
        
      default:
        return {
          action: action,
          description: `${action} ${symbol} with reduced position`,
          reduced_commitment: 'Start with 33% to build conviction'
        };
    }
  }
  
  // ===========================================================================
  // BATCH OPERATIONS
  // ===========================================================================
  
  /**
   * Get all stale pending decisions that need negotiation
   */
  public getStalePendingForNegotiation(): {
    pending: PendingDecision;
    response: ObjectionResponse;
  }[] {
    const stale = this.adoption.getStalePendingDecisions();
    
    return stale.map(pending => ({
      pending,
      response: this.handlePendingDecision(pending)
    }));
  }
  
  /**
   * Get recent rejections that could benefit from follow-up
   */
  public getRecentRejectionsForFollowUp(limit: number = 5): {
    record: AdoptionRecord;
    response: ObjectionResponse;
  }[] {
    const rejected = [...this.adoption.getRecordsByAction('REJECT')]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    
    return rejected.map(record => ({
      record,
      response: this.handleObjection(record)
    }));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotNegotiator = () => FinBotNegotiator.getInstance();
export default FinBotNegotiator;

