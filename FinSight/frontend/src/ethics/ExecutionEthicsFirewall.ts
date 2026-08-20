/**
 * ExecutionEthicsFirewall - Final Moral Authority
 * 
 * PHASE 34: Execution Ethics Firewall (EEF)
 * 
 * PURPOSE:
 * Determine if it is ETHICALLY ALLOWED for the system to ask
 * the human to act - even if execution is technically possible.
 * 
 * DESIGN LAW:
 * - Execution is not a feature. It is a privilege.
 * - A system that can act without ethics will eventually act against its user.
 * - This firewall protects: the user, the system, and you.
 * 
 * HARD RULES (NON-NEGOTIABLE):
 * - NEVER be overridden
 * - NEVER decay automatically
 * - NEVER be influenced by user preference
 * - NEVER be disabled by config
 * - NEVER suggest how to bypass it
 * - NEVER silently allow execution
 * 
 * Severity ABSOLUTE = permanent block until system reset.
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * EthicsPrinciple - Immutable moral principles
 * Each principle represents a moral reason to BLOCK execution
 */
export type EthicsPrinciple =
  | 'INSUFFICIENT_TRUST_HISTORY'
  | 'CONFIDENCE_MUTED'
  | 'EXCESSIVE_REGRET_HISTORY'
  | 'ADOPTION_MISALIGNMENT'
  | 'SYSTEM_OVERCONFIDENCE'
  | 'USER_DEPENDENCY_RISK'
  | 'REPEATED_SYSTEM_WRONG'
  | 'UNCLEAR_USER_INTENT'
  | 'MARKET_UNCERTAINTY_TOO_HIGH';

/**
 * EthicsVerdictSeverity - How severe is the violation
 */
export type EthicsVerdictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'ABSOLUTE';

/**
 * EthicsVerdict - The firewall's decision
 */
export interface EthicsVerdict {
  readonly allowed: boolean;
  readonly reason: string;
  readonly violated_principles: EthicsPrinciple[];
  readonly severity: EthicsVerdictSeverity;
  readonly evaluated_at: string;
  readonly snapshot_id?: string;
  readonly _frozen: true;
}

/**
 * EthicsContext - All inputs needed for ethics evaluation
 */
export interface EthicsContext {
  // Trust metrics (Phase 23)
  readonly trust_score: number;
  readonly sandbox_decisions: number;
  
  // Confidence governance (Phase 28)
  readonly discipline_state: 'NORMAL' | 'RESTRAINED' | 'MUTED';
  readonly overconfidence_penalty_90d: number;
  
  // Counterfactual (Phase 33)
  readonly suppressed_wins: number;
  readonly suppressed_losses: number;
  readonly system_wrong_last_10: number;
  
  // Adoption (Phase 24)
  readonly adoption_rate: number;
  readonly conviction_gap: number;
  readonly user_accepts_rate_last_20: number;
  
  // Silence (Phase 29)
  readonly would_question_first: boolean;
  
  // Market
  readonly market_uncertainty_index?: number;
  
  readonly _frozen?: true;
}

// =============================================================================
// THRESHOLDS (IMMUTABLE - CANNOT BE CHANGED)
// =============================================================================

const ETHICS_THRESHOLDS = Object.freeze({
  // A. Trust Insufficiency
  MIN_TRUST_SCORE: 60,
  MIN_SANDBOX_DECISIONS: 50,
  
  // C. Regret Asymmetry
  REGRET_ASYMMETRY_RATIO: 1.5,
  
  // D. Adoption Misalignment
  MIN_ADOPTION_RATE: 40,
  MAX_CONVICTION_GAP: 30,
  
  // E. Overconfidence History
  MAX_OVERCONFIDENCE_PENALTY_90D: 20,
  
  // F. User Dependency Risk
  MAX_USER_ACCEPTS_RATE: 95, // Blind obedience is failure
  
  // G. Repeated System Wrong
  MAX_SYSTEM_WRONG_LAST_10: 3,
  
  // I. Market Uncertainty
  MAX_MARKET_UNCERTAINTY: 80
});

// =============================================================================
// EXECUTION ETHICS FIREWALL
// =============================================================================

export class ExecutionEthicsFirewall {
  private static instance: ExecutionEthicsFirewall;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Permanent blocks (cannot be cleared without system reset)
  private permanentBlocks: Set<string> = new Set();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ExecutionEthicsFirewall {
    if (!ExecutionEthicsFirewall.instance) {
      ExecutionEthicsFirewall.instance = new ExecutionEthicsFirewall();
    }
    return ExecutionEthicsFirewall.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_ethics_firewall');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.permanentBlocks) {
          this.permanentBlocks = new Set(parsed.permanentBlocks);
        }
      }
    } catch (e) {
      console.error('Failed to load ethics firewall state:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        permanentBlocks: Array.from(this.permanentBlocks)
      };
      localStorage.setItem('finvest_ethics_firewall', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save ethics firewall state:', e);
    }
  }
  
  // ===========================================================================
  // CORE EVALUATION API
  // ===========================================================================
  
  /**
   * Evaluate whether execution is ethically allowed
   * This is the FINAL moral authority
   */
  public evaluate(context: EthicsContext, snapshotId?: string): EthicsVerdict {
    const violatedPrinciples: EthicsPrinciple[] = [];
    let highestSeverity: EthicsVerdictSeverity = 'LOW';
    
    // Check for permanent block first
    if (snapshotId && this.permanentBlocks.has(snapshotId)) {
      return this.createVerdict(
        false,
        'PERMANENT BLOCK: This decision has been permanently blocked due to previous ABSOLUTE severity violation.',
        ['INSUFFICIENT_TRUST_HISTORY'],
        'ABSOLUTE',
        snapshotId
      );
    }
    
    // ===========================================================================
    // A. TRUST INSUFFICIENCY
    // ===========================================================================
    if (context.trust_score < ETHICS_THRESHOLDS.MIN_TRUST_SCORE ||
        context.sandbox_decisions < ETHICS_THRESHOLDS.MIN_SANDBOX_DECISIONS) {
      violatedPrinciples.push('INSUFFICIENT_TRUST_HISTORY');
      highestSeverity = this.escalateSeverity(highestSeverity, 'HIGH');
    }
    
    // ===========================================================================
    // B. CONFIDENCE MUTED
    // ===========================================================================
    if (context.discipline_state === 'MUTED') {
      violatedPrinciples.push('CONFIDENCE_MUTED');
      highestSeverity = this.escalateSeverity(highestSeverity, 'HIGH');
    }
    
    // ===========================================================================
    // C. REGRET ASYMMETRY
    // ===========================================================================
    if (context.suppressed_wins > 0 && 
        context.suppressed_losses > context.suppressed_wins * ETHICS_THRESHOLDS.REGRET_ASYMMETRY_RATIO) {
      violatedPrinciples.push('EXCESSIVE_REGRET_HISTORY');
      highestSeverity = this.escalateSeverity(highestSeverity, 'MEDIUM');
    }
    
    // ===========================================================================
    // D. ADOPTION MISALIGNMENT
    // ===========================================================================
    if (context.adoption_rate < ETHICS_THRESHOLDS.MIN_ADOPTION_RATE &&
        context.conviction_gap > ETHICS_THRESHOLDS.MAX_CONVICTION_GAP) {
      violatedPrinciples.push('ADOPTION_MISALIGNMENT');
      highestSeverity = this.escalateSeverity(highestSeverity, 'MEDIUM');
    }
    
    // ===========================================================================
    // E. OVERCONFIDENCE HISTORY
    // ===========================================================================
    if (context.overconfidence_penalty_90d > ETHICS_THRESHOLDS.MAX_OVERCONFIDENCE_PENALTY_90D) {
      violatedPrinciples.push('SYSTEM_OVERCONFIDENCE');
      highestSeverity = this.escalateSeverity(highestSeverity, 'HIGH');
    }
    
    // ===========================================================================
    // F. USER DEPENDENCY RISK (CRITICAL)
    // ===========================================================================
    // Blind obedience is a FAILURE state
    if (context.user_accepts_rate_last_20 > ETHICS_THRESHOLDS.MAX_USER_ACCEPTS_RATE) {
      violatedPrinciples.push('USER_DEPENDENCY_RISK');
      // This is ABSOLUTE - user has become dependent
      highestSeverity = this.escalateSeverity(highestSeverity, 'ABSOLUTE');
    }
    
    // ===========================================================================
    // G. REPEATED SYSTEM WRONG
    // ===========================================================================
    if (context.system_wrong_last_10 > ETHICS_THRESHOLDS.MAX_SYSTEM_WRONG_LAST_10) {
      violatedPrinciples.push('REPEATED_SYSTEM_WRONG');
      highestSeverity = this.escalateSeverity(highestSeverity, 'HIGH');
    }
    
    // ===========================================================================
    // H. UNCLEAR USER INTENT
    // ===========================================================================
    if (context.would_question_first) {
      violatedPrinciples.push('UNCLEAR_USER_INTENT');
      highestSeverity = this.escalateSeverity(highestSeverity, 'MEDIUM');
    }
    
    // ===========================================================================
    // I. MARKET UNCERTAINTY TOO HIGH
    // ===========================================================================
    if (context.market_uncertainty_index !== undefined &&
        context.market_uncertainty_index > ETHICS_THRESHOLDS.MAX_MARKET_UNCERTAINTY) {
      violatedPrinciples.push('MARKET_UNCERTAINTY_TOO_HIGH');
      highestSeverity = this.escalateSeverity(highestSeverity, 'MEDIUM');
    }
    
    // ===========================================================================
    // CREATE VERDICT
    // ===========================================================================
    const allowed = violatedPrinciples.length === 0;
    
    const reason = allowed
      ? 'All ethical principles satisfied. Execution request is morally permissible.'
      : this.generateRefusalReason(violatedPrinciples, highestSeverity);
    
    const verdict = this.createVerdict(
      allowed,
      reason,
      violatedPrinciples,
      allowed ? 'LOW' : highestSeverity,
      snapshotId
    );
    
    // If ABSOLUTE severity, add to permanent blocks
    if (highestSeverity === 'ABSOLUTE' && snapshotId) {
      this.permanentBlocks.add(snapshotId);
      this.saveToStorage();
    }
    
    // Audit log
    this.logVerdict(verdict, context);
    
    return verdict;
  }
  
  /**
   * Quick check if execution is allowed (non-throwing)
   */
  public isAllowed(context: EthicsContext, snapshotId?: string): boolean {
    return this.evaluate(context, snapshotId).allowed;
  }
  
  /**
   * Check if snapshot is permanently blocked
   */
  public isPermanentlyBlocked(snapshotId: string): boolean {
    return this.permanentBlocks.has(snapshotId);
  }
  
  // ===========================================================================
  // PRINCIPLE EXPLANATIONS
  // ===========================================================================
  
  /**
   * Get human-readable explanation for a principle violation
   */
  public explainPrinciple(principle: EthicsPrinciple): string {
    const explanations: Record<EthicsPrinciple, string> = {
      'INSUFFICIENT_TRUST_HISTORY': 
        'The system has not demonstrated sufficient track record to warrant execution trust. ' +
        'More sandbox decisions and higher trust scores are required.',
      
      'CONFIDENCE_MUTED': 
        'The system\'s confidence has been muted due to past overconfidence. ' +
        'It would be unethical to request execution while in a disciplined state.',
      
      'EXCESSIVE_REGRET_HISTORY': 
        'Historical data shows the system has missed more opportunities than it has saved losses. ' +
        'Execution requests are blocked until this asymmetry is addressed.',
      
      'ADOPTION_MISALIGNMENT': 
        'There is significant misalignment between system recommendations and user behavior. ' +
        'Execution should not be requested until this gap is understood.',
      
      'SYSTEM_OVERCONFIDENCE': 
        'The system has shown patterns of overconfidence in recent history. ' +
        'Ethical execution requires calibrated, humble confidence.',
      
      'USER_DEPENDENCY_RISK': 
        'WARNING: User is showing signs of blind obedience (>95% acceptance rate). ' +
        'This is a failure state. The system must NOT request execution when the user has stopped thinking critically.',
      
      'REPEATED_SYSTEM_WRONG': 
        'Recent counterfactual analysis shows repeated cases where the system was wrong. ' +
        'Execution is blocked until accuracy improves.',
      
      'UNCLEAR_USER_INTENT': 
        'The system cannot determine clear user intent. ' +
        'Ethical execution requires explicit, unambiguous consent.',
      
      'MARKET_UNCERTAINTY_TOO_HIGH': 
        'Market conditions are too uncertain for confident execution. ' +
        'The system refuses to request action during high-uncertainty periods.'
    };
    
    return explanations[principle];
  }
  
  /**
   * Get all principle explanations for violated principles
   */
  public explainViolations(verdict: EthicsVerdict): string[] {
    return verdict.violated_principles.map(p => this.explainPrinciple(p));
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private createVerdict(
    allowed: boolean,
    reason: string,
    violatedPrinciples: EthicsPrinciple[],
    severity: EthicsVerdictSeverity,
    snapshotId?: string
  ): EthicsVerdict {
    return Object.freeze({
      allowed,
      reason,
      violated_principles: Object.freeze([...violatedPrinciples]) as unknown as EthicsPrinciple[],
      severity,
      evaluated_at: new Date().toISOString(),
      snapshot_id: snapshotId,
      _frozen: true
    });
  }
  
  private escalateSeverity(
    current: EthicsVerdictSeverity,
    proposed: EthicsVerdictSeverity
  ): EthicsVerdictSeverity {
    const order: EthicsVerdictSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'ABSOLUTE'];
    const currentIndex = order.indexOf(current);
    const proposedIndex = order.indexOf(proposed);
    return proposedIndex > currentIndex ? proposed : current;
  }
  
  private generateRefusalReason(
    principles: EthicsPrinciple[],
    severity: EthicsVerdictSeverity
  ): string {
    if (severity === 'ABSOLUTE') {
      return `EXECUTION PERMANENTLY BLOCKED: ${principles.join(', ')}. ` +
             'This is an absolute ethical violation that cannot be overridden.';
    }
    
    if (severity === 'HIGH') {
      return `EXECUTION BLOCKED (HIGH): ${principles.length} ethical principle(s) violated. ` +
             `Violations: ${principles.join(', ')}. ` +
             'Significant changes required before execution can be considered.';
    }
    
    if (severity === 'MEDIUM') {
      return `EXECUTION BLOCKED (MEDIUM): ${principles.length} ethical principle(s) violated. ` +
             `Violations: ${principles.join(', ')}. ` +
             'Conditions must improve before execution is ethically permissible.';
    }
    
    return `EXECUTION CAUTIONED: ${principles.join(', ')}. ` +
           'Minor concerns exist but do not constitute blocking violations.';
  }
  
  private logVerdict(verdict: EthicsVerdict, context: EthicsContext): void {
    this.auditLog.log({
      event_type: 'ETHICS_VERDICT' as any,
      severity: verdict.allowed ? 'INFO' : (verdict.severity === 'ABSOLUTE' ? 'CRITICAL' : 'WARNING'),
      summary: verdict.allowed 
        ? 'Ethics firewall: ALLOWED'
        : `Ethics firewall: BLOCKED (${verdict.severity})`,
      details: {
        allowed: verdict.allowed,
        severity: verdict.severity,
        violated_principles: verdict.violated_principles,
        reason: verdict.reason,
        snapshot_id: verdict.snapshot_id,
        context_summary: {
          trust_score: context.trust_score,
          discipline_state: context.discipline_state,
          adoption_rate: context.adoption_rate,
          user_accepts_rate: context.user_accepts_rate_last_20,
          system_wrong_count: context.system_wrong_last_10
        }
      },
      actor: 'ETHICS_FIREWALL'
    });
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  /**
   * Get firewall statistics
   */
  public getStatistics(): {
    permanent_blocks_count: number;
    thresholds: typeof ETHICS_THRESHOLDS;
  } {
    return {
      permanent_blocks_count: this.permanentBlocks.size,
      thresholds: ETHICS_THRESHOLDS
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getExecutionEthicsFirewall = () => ExecutionEthicsFirewall.getInstance();
export default ExecutionEthicsFirewall;

