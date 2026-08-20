/**
 * SelfLimitGuard - Enforcement Layer for Self-Limiting
 * 
 * PHASE 38: Self-Limiting Growth & Power Containment (SLG)
 * 
 * PURPOSE:
 * Integrate InfluenceBudgetEngine and CentralityRiskEngine with
 * QuestionFirstGovernor, ConfidenceGovernor, and EthicsFirewall.
 * 
 * INVARIANT:
 * A system with high trust + high centrality may not speak often.
 * This is non-negotiable. No user overrides. Ever.
 */

import { getInfluenceBudgetEngine, InfluenceBudget, SelfLimitEvent } from './InfluenceBudgetEngine';
import { getCentralityRiskEngine, CentralityRisk, CentralityAssessment } from './CentralityRiskEngine';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * SelfLimitCheck - Result of checking if self-limiting applies
 */
export interface SelfLimitCheck {
  readonly allowed: boolean;
  readonly reason: string;
  readonly budget_remaining: number;
  readonly centrality_state: CentralityRisk['state'];
  readonly force_silence: boolean;
  readonly _frozen: true;
}

/**
 * SelfLimitStatus - Full status for UI display
 */
export interface SelfLimitStatus {
  readonly budget: {
    readonly daily: InfluenceBudget;
    readonly weekly: InfluenceBudget;
    readonly monthly: InfluenceBudget;
  };
  readonly centrality: CentralityAssessment;
  readonly can_advise: boolean;
  readonly silence_reason?: string;
  readonly recent_self_limits: readonly SelfLimitEvent[];
  readonly _frozen: true;
}

// =============================================================================
// SELF LIMIT GUARD
// =============================================================================

export class SelfLimitGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  // ===========================================================================
  // ASSERTION API (THROWS ON VIOLATION)
  // ===========================================================================
  
  /**
   * Assert that advice is allowed
   * THROWS if budget exhausted or centrality is CRITICAL
   * 
   * NO USER OVERRIDES ALLOWED
   */
  public static assertCanAdvise(snapshotId?: string): void {
    const check = this.checkCanAdvise(snapshotId);
    
    if (!check.allowed) {
      throw new Error(
        `SELF_LIMIT_BLOCKED: Advice not allowed. ${check.reason}. ` +
        `This cannot be overridden. System must limit its own influence.`
      );
    }
  }
  
  /**
   * Check if advice is allowed (non-throwing)
   */
  public static checkCanAdvise(snapshotId?: string): SelfLimitCheck {
    const budget = getInfluenceBudgetEngine();
    const centrality = getCentralityRiskEngine();
    
    // Check budget
    const canBudget = budget.canAdvise();
    const budgetStatus = budget.getBudgetStatus();
    
    // Check centrality
    const centralityAssessment = centrality.assess();
    const forceSilence = centralityAssessment.force_silence;
    
    // Determine if allowed
    let allowed = true;
    let reason = 'Advice allowed';
    
    if (forceSilence) {
      allowed = false;
      reason = 'Centrality risk is CRITICAL - force silence enabled';
    } else if (!canBudget) {
      allowed = false;
      reason = 'Influence budget exhausted';
    } else if (centralityAssessment.risk.state === 'ELEVATED') {
      // Still allowed but with warning
      reason = 'Advice allowed with caution - centrality risk ELEVATED';
    }
    
    return Object.freeze({
      allowed,
      reason,
      budget_remaining: budgetStatus.daily.remaining_events,
      centrality_state: centralityAssessment.risk.state,
      force_silence: forceSilence,
      _frozen: true
    });
  }
  
  /**
   * Consume budget if allowed, otherwise throw
   */
  public static consumeIfAllowed(snapshotId?: string): void {
    this.assertCanAdvise(snapshotId);
    
    const budget = getInfluenceBudgetEngine();
    budget.consumeBudget(snapshotId);
  }
  
  // ===========================================================================
  // STATUS API
  // ===========================================================================
  
  /**
   * Get full self-limit status
   */
  public static getStatus(): SelfLimitStatus {
    const budget = getInfluenceBudgetEngine();
    const centrality = getCentralityRiskEngine();
    
    const budgetStatus = budget.getBudgetStatus();
    const centralityAssessment = centrality.assess();
    const check = this.checkCanAdvise();
    
    let silenceReason: string | undefined;
    if (!check.allowed) {
      silenceReason = check.reason;
    } else if (centralityAssessment.risk.state === 'ELEVATED') {
      silenceReason = centrality.getDependencyWarning() || undefined;
    }
    
    return Object.freeze({
      budget: Object.freeze({
        daily: budgetStatus.daily,
        weekly: budgetStatus.weekly,
        monthly: budgetStatus.monthly
      }),
      centrality: centralityAssessment,
      can_advise: check.allowed,
      silence_reason: silenceReason,
      recent_self_limits: budget.getSelfLimitEvents(10),
      _frozen: true
    });
  }
  
  /**
   * Get dependency warning for FinBot to display
   */
  public static getDependencyWarning(): string | null {
    const centrality = getCentralityRiskEngine();
    return centrality.getDependencyWarning();
  }
  
  /**
   * Answer "Why aren't you helping?"
   * Required response when self-limiting
   */
  public static getWhyNotHelpingResponse(): string {
    const status = this.getStatus();
    
    if (status.centrality.risk.state === 'CRITICAL') {
      return "Because helping too much would make you dependent. " +
             "My centrality risk is critical - I've become too central to your decisions. " +
             "You need to make more independent choices, seek external perspectives, " +
             "and take more time with decisions. This is not negotiable.";
    }
    
    if (!status.can_advise && status.budget.daily.exhausted) {
      return "I've reached my daily advice limit. " +
             "This limit exists because higher trust and adoption should mean less advice, not more. " +
             "If I'm too helpful, you become dependent. Wait for the limit to reset.";
    }
    
    if (status.centrality.risk.state === 'ELEVATED') {
      return "I'm reducing my advice frequency because you may be relying on me too heavily. " +
             "My centrality risk is elevated. Consider doing your own research, " +
             "taking more time, or consulting other sources.";
    }
    
    return "I'm limiting my influence intentionally. " +
           "Systems that are too helpful create dependency. This is by design.";
  }
  
  // ===========================================================================
  // INTEGRATION HELPERS
  // ===========================================================================
  
  /**
   * Update metrics from TrustLedger, AdoptionScore, etc.
   */
  public static updateMetrics(params: {
    trustScore?: number;
    adoptionRate?: number;
    acceptanceRate?: number;
    overrideOccurred?: boolean;
    decisionLatencySeconds?: number;
    externalReferenceUsed?: boolean;
    followedAdvice?: boolean;
  }): void {
    const budget = getInfluenceBudgetEngine();
    const centrality = getCentralityRiskEngine();
    
    // Update budget engine
    budget.updateMetrics({
      trustScore: params.trustScore,
      adoptionRate: params.adoptionRate,
      acceptanceRate: params.acceptanceRate
    });
    
    // Update centrality engine
    centrality.updateMetrics({
      acceptanceRate: params.acceptanceRate,
      overrideOccurred: params.overrideOccurred,
      decisionLatencySeconds: params.decisionLatencySeconds,
      externalReferenceUsed: params.externalReferenceUsed,
      followedAdvice: params.followedAdvice
    });
  }
  
  /**
   * Record a self-limit event
   */
  public static recordSelfLimit(
    reason: SelfLimitEvent['reason'],
    snapshotId?: string,
    details?: string
  ): void {
    const budget = getInfluenceBudgetEngine();
    budget.recordSelfLimit(reason, snapshotId, details);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SelfLimitGuard;
