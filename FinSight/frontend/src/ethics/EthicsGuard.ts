/**
 * EthicsGuard - Convenience Guards for Ethics Firewall
 * 
 * PHASE 34: Execution Ethics Firewall (EEF)
 * 
 * PURPOSE:
 * Provide throwing and non-throwing guards for ethics checks.
 * 
 * DESIGN LAW:
 * These guards are fail-closed.
 * If ethics cannot be verified, execution is blocked.
 */

import { 
  getExecutionEthicsFirewall,
  EthicsVerdict,
  EthicsContext,
  EthicsPrinciple
} from './ExecutionEthicsFirewall';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build ethics context from available system data
 * This aggregates data from multiple phases
 */
export class EthicsContextBuilder {
  private context: Partial<EthicsContext> = {};
  
  public withTrustMetrics(trustScore: number, sandboxDecisions: number): this {
    this.context.trust_score = trustScore;
    this.context.sandbox_decisions = sandboxDecisions;
    return this;
  }
  
  public withConfidenceGovernance(
    disciplineState: 'NORMAL' | 'RESTRAINED' | 'MUTED',
    overconfidencePenalty90d: number
  ): this {
    this.context.discipline_state = disciplineState;
    this.context.overconfidence_penalty_90d = overconfidencePenalty90d;
    return this;
  }
  
  public withCounterfactualData(
    suppressedWins: number,
    suppressedLosses: number,
    systemWrongLast10: number
  ): this {
    this.context.suppressed_wins = suppressedWins;
    this.context.suppressed_losses = suppressedLosses;
    this.context.system_wrong_last_10 = systemWrongLast10;
    return this;
  }
  
  public withAdoptionMetrics(
    adoptionRate: number,
    convictionGap: number,
    userAcceptsRateLast20: number
  ): this {
    this.context.adoption_rate = adoptionRate;
    this.context.conviction_gap = convictionGap;
    this.context.user_accepts_rate_last_20 = userAcceptsRateLast20;
    return this;
  }
  
  public withSilenceState(wouldQuestionFirst: boolean): this {
    this.context.would_question_first = wouldQuestionFirst;
    return this;
  }
  
  public withMarketUncertainty(uncertaintyIndex: number): this {
    this.context.market_uncertainty_index = uncertaintyIndex;
    return this;
  }
  
  public build(): EthicsContext {
    // Validate all required fields are present
    const required: (keyof EthicsContext)[] = [
      'trust_score',
      'sandbox_decisions',
      'discipline_state',
      'overconfidence_penalty_90d',
      'suppressed_wins',
      'suppressed_losses',
      'system_wrong_last_10',
      'adoption_rate',
      'conviction_gap',
      'user_accepts_rate_last_20',
      'would_question_first'
    ];
    
    for (const field of required) {
      if (this.context[field] === undefined) {
        throw new Error(
          `ETHICS_CONTEXT_ERROR: Missing required field: ${field}. ` +
          `All context fields must be explicitly provided.`
        );
      }
    }
    
    return Object.freeze({
      ...this.context,
      _frozen: true
    } as EthicsContext);
  }
  
  /**
   * Create a default restrictive context when data is unavailable
   * This BLOCKS execution by default
   */
  public static createRestrictiveDefault(): EthicsContext {
    return Object.freeze({
      trust_score: 0,
      sandbox_decisions: 0,
      discipline_state: 'MUTED' as const,
      overconfidence_penalty_90d: 100,
      suppressed_wins: 0,
      suppressed_losses: 100,
      system_wrong_last_10: 10,
      adoption_rate: 0,
      conviction_gap: 100,
      user_accepts_rate_last_20: 0,
      would_question_first: true,
      market_uncertainty_index: 100,
      _frozen: true
    });
  }
}

// =============================================================================
// ETHICS GUARD
// =============================================================================

export class EthicsGuard {
  private static auditLog = DecisionAuditLog.getInstance();
  
  // ===========================================================================
  // THROWING GUARDS
  // ===========================================================================
  
  /**
   * Assert that execution is ethically allowed
   * THROWS if not allowed
   */
  public static assertEthicallyAllowed(
    context: EthicsContext,
    snapshotId?: string
  ): void {
    const firewall = getExecutionEthicsFirewall();
    const verdict = firewall.evaluate(context, snapshotId);
    
    if (!verdict.allowed) {
      EthicsGuard.logGuardViolation(verdict);
      throw new Error(
        `ETHICS_BLOCKED: ${verdict.reason}\n` +
        `Violated Principles: ${verdict.violated_principles.join(', ')}\n` +
        `Severity: ${verdict.severity}`
      );
    }
  }
  
  /**
   * Assert using restrictive defaults when context is unavailable
   * This will ALWAYS throw because defaults are designed to block
   */
  public static assertWithRestrictiveDefaults(snapshotId?: string): void {
    const context = EthicsContextBuilder.createRestrictiveDefault();
    EthicsGuard.assertEthicallyAllowed(context, snapshotId);
  }
  
  // ===========================================================================
  // NON-THROWING GUARDS
  // ===========================================================================
  
  /**
   * Check if execution is ethically allowed (non-throwing)
   */
  public static isEthicallyAllowed(
    context: EthicsContext,
    snapshotId?: string
  ): EthicsVerdict {
    const firewall = getExecutionEthicsFirewall();
    return firewall.evaluate(context, snapshotId);
  }
  
  /**
   * Check if a specific principle would be violated
   */
  public static wouldViolatePrinciple(
    context: EthicsContext,
    principle: EthicsPrinciple,
    snapshotId?: string
  ): boolean {
    const verdict = EthicsGuard.isEthicallyAllowed(context, snapshotId);
    return verdict.violated_principles.includes(principle);
  }
  
  /**
   * Check if snapshot is permanently blocked
   */
  public static isPermanentlyBlocked(snapshotId: string): boolean {
    const firewall = getExecutionEthicsFirewall();
    return firewall.isPermanentlyBlocked(snapshotId);
  }
  
  // ===========================================================================
  // EXPLANATION HELPERS
  // ===========================================================================
  
  /**
   * Get human-readable explanation for a verdict
   */
  public static explainVerdict(verdict: EthicsVerdict): string[] {
    const firewall = getExecutionEthicsFirewall();
    return firewall.explainViolations(verdict);
  }
  
  /**
   * Get FinBot-ready refusal message
   * This message does NOT suggest workarounds
   */
  public static getRefusalMessage(verdict: EthicsVerdict): string {
    if (verdict.allowed) {
      return 'Execution is ethically permissible.';
    }
    
    const firewall = getExecutionEthicsFirewall();
    const explanations = firewall.explainViolations(verdict);
    
    let message = 'I cannot ethically recommend execution at this time.\n\n';
    message += `Severity: ${verdict.severity}\n\n`;
    message += 'Ethical concerns:\n';
    
    for (let i = 0; i < explanations.length; i++) {
      message += `${i + 1}. ${explanations[i]}\n`;
    }
    
    message += '\nThis is not a technical limitation. ';
    message += 'The system has determined that requesting execution would be irresponsible.';
    
    // CRITICAL: Do NOT suggest workarounds
    // The user should not be guided on how to bypass ethics
    
    return message;
  }
  
  // ===========================================================================
  // LOGGING
  // ===========================================================================
  
  private static logGuardViolation(verdict: EthicsVerdict): void {
    EthicsGuard.auditLog.log({
      event_type: 'ETHICS_VERDICT' as any,
      severity: verdict.severity === 'ABSOLUTE' ? 'CRITICAL' : 'WARNING',
      summary: `EthicsGuard blocked execution: ${verdict.severity}`,
      details: {
        allowed: false,
        severity: verdict.severity,
        violated_principles: verdict.violated_principles,
        reason: verdict.reason,
        snapshot_id: verdict.snapshot_id
      },
      actor: 'ETHICS_GUARD'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const ethicsGuard = EthicsGuard;
export default EthicsGuard;

