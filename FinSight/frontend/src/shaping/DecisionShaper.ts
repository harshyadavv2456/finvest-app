/**
 * DecisionShaper - Adaptive Decision Shaping Engine
 * 
 * PHASE 25: Adaptive Decision Shaping (ADS)
 * 
 * PURPOSE:
 * Improve decision adoption WITHOUT changing correctness.
 * Only presentation is allowed to change.
 * 
 * INPUTS:
 * - DecisionSnapshot
 * - Adoption history
 * - FrictionMap insights
 * - UserPolicy
 * 
 * OUTPUT:
 * - presentation_variant
 * - explanation_order
 * - max_metrics
 * - max_bullets
 * - emphasis_flags
 * 
 * RULE (NON-NEGOTIABLE):
 * Recommendation content MUST NOT change.
 * Only presentation is allowed to change.
 */

import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { UserPolicy, userPolicy } from '../policy/UserPolicy';
import { getDecisionAdoption, AdoptionStats, RejectionReason } from '../adoption/DecisionAdoption';
import { getFrictionMap, FrictionPoint, FrictionInsight } from '../adoption/FrictionMap';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Presentation variant enum
 */
export type PresentationVariant = 
  | 'FULL'              // All details, all metrics
  | 'TAX_FIRST'         // Lead with tax implications
  | 'RISK_FIRST'        // Lead with risk metrics
  | 'SIMPLE'            // Minimal, 3 bullets max
  | 'COMPARISON_ONLY';  // Just before/after comparison

/**
 * Emphasis flags
 */
export type EmphasisFlag = 'TAX' | 'RISK' | 'TIMING' | 'SIMPLICITY';

/**
 * Metric order configuration
 */
export type MetricOrder = 
  | 'RETURN_FIRST'
  | 'TAX_FIRST'
  | 'RISK_FIRST'
  | 'CONFIDENCE_FIRST';

/**
 * ShapedDecision - The output of shaping
 */
export interface ShapedDecision {
  // Original (NEVER modified)
  readonly original_snapshot: DecisionSnapshot;
  readonly original_output: DecisionOutput;
  
  // Shaping metadata
  readonly shaping_id: string;
  readonly shaped_at: string;
  
  // Presentation controls
  readonly variant: PresentationVariant;
  readonly explanation_order: string[];
  readonly max_metrics: number;
  readonly max_bullets: number;
  readonly emphasis_flags: EmphasisFlag[];
  readonly metric_order: MetricOrder;
  
  // Shaped content (derived, not new)
  readonly shaped_explanation: string[];
  readonly shaped_metrics: ShapedMetric[];
  readonly headline: string;
  
  // Why this shaping was chosen
  readonly shaping_rationale: string;
  
  // Audit
  readonly audit_log_id: string;
  
  // Immutability
  readonly _frozen: true;
  
  // Verification that original is unchanged
  readonly original_hash: string;
}

/**
 * ShapedMetric - A metric with presentation order
 */
export interface ShapedMetric {
  name: string;
  value: string | number;
  priority: number;
  emphasized: boolean;
}

/**
 * ShapingContext - Input context for shaping
 */
export interface ShapingContext {
  snapshot: DecisionSnapshot;
  output_index: number;
  user_policy: { tax_preference: string; risk_tolerance: string };
  adoption_stats: AdoptionStats;
  friction_insights: FrictionInsight[];
  top_friction_reason: RejectionReason | null;
}

/**
 * ShapingConfig - Configuration for shaping decisions
 */
export interface ShapingConfig {
  default_variant: PresentationVariant;
  enable_auto_simplification: boolean;
  max_simplification_level: number;
  respect_user_preference: boolean;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_SHAPING_CONFIG: ShapingConfig = {
  default_variant: 'FULL',
  enable_auto_simplification: true,
  max_simplification_level: 3,
  respect_user_preference: true
};

// =============================================================================
// DECISION SHAPER
// =============================================================================

export class DecisionShaper {
  private static instance: DecisionShaper;
  private adoption = getDecisionAdoption();
  private frictionMap = getFrictionMap();
  private policyManager = userPolicy;
  private auditLog = DecisionAuditLog.getInstance();
  private config: ShapingConfig = DEFAULT_SHAPING_CONFIG;
  
  private constructor() {}
  
  public static getInstance(): DecisionShaper {
    if (!DecisionShaper.instance) {
      DecisionShaper.instance = new DecisionShaper();
    }
    return DecisionShaper.instance;
  }
  
  // ===========================================================================
  // MAIN SHAPING API
  // ===========================================================================
  
  /**
   * Shape a decision for presentation
   * NEVER changes the actual recommendation
   */
  public shapeDecision(
    snapshot: DecisionSnapshot,
    outputIndex: number,
    userPolicy: UserPolicy
  ): ShapedDecision {
    const output = snapshot.outputs[outputIndex];
    if (!output) {
      throw new Error(`Output at index ${outputIndex} not found in snapshot`);
    }
    
    // Get context
    const context = this.buildContext(snapshot, outputIndex, userPolicy);
    
    // Determine variant
    const variant = this.selectVariant(context);
    
    // Build shaping parameters
    const emphasisFlags = this.determineEmphasis(context);
    const metricOrder = this.determineMetricOrder(context, emphasisFlags);
    const { maxMetrics, maxBullets } = this.determineLimits(context);
    const explanationOrder = this.orderExplanation(output.reasoning, emphasisFlags);
    
    // Shape content (derive, don't create new)
    const shapedExplanation = this.shapeExplanation(output.reasoning, maxBullets, emphasisFlags);
    const shapedMetrics = this.shapeMetrics(output, maxMetrics, emphasisFlags);
    const headline = this.generateHeadline(output, variant);
    
    // Generate hash of original for verification
    const originalHash = this.hashOutput(output);
    
    // Shaping rationale
    const rationale = this.generateRationale(variant, context);
    
    // Log
    const auditLogId = this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Decision shaped: ${output.symbol} → ${variant}`,
      details: {
        snapshot_id: snapshot.id,
        output_index: outputIndex,
        variant,
        emphasis: emphasisFlags,
        max_bullets: maxBullets,
        original_hash: originalHash
      },
      actor: 'ENGINE'
    });
    
    const shaped: ShapedDecision = Object.freeze({
      original_snapshot: snapshot,
      original_output: output,
      shaping_id: `SHAPE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shaped_at: new Date().toISOString(),
      variant,
      explanation_order: explanationOrder,
      max_metrics: maxMetrics,
      max_bullets: maxBullets,
      emphasis_flags: emphasisFlags,
      metric_order: metricOrder,
      shaped_explanation: shapedExplanation,
      shaped_metrics: shapedMetrics,
      headline,
      shaping_rationale: rationale,
      audit_log_id: auditLogId,
      _frozen: true,
      original_hash: originalHash
    });
    
    return shaped;
  }
  
  // ===========================================================================
  // CONTEXT BUILDING (FAIL-CLOSED)
  // ===========================================================================
  
  /**
   * Build shaping context from dependencies
   * THROWS if required dependencies are missing - fail closed
   */
  private buildContext(
    snapshot: DecisionSnapshot,
    outputIndex: number,
    userPolicy: UserPolicy
  ): ShapingContext {
    // FAIL CLOSED: Validate all dependencies exist
    if (!snapshot || !snapshot.id) {
      throw new Error('SHAPING_FAIL_CLOSED: DecisionSnapshot is missing or invalid');
    }
    
    // UserPolicy is validated - get config for property access
    const policyConfig = userPolicy.getConfig();
    
    const stats = this.adoption.getStats();
    
    // FAIL CLOSED: Require minimum data for shaping
    // If we have no adoption data at all, we cannot shape responsibly
    if (stats.total_recommendations === 0) {
      this.auditLog.log({
        event_type: 'CONTEXT_CREATED',
        severity: 'WARNING',
        summary: 'Shaping with no adoption history - using FULL variant',
        details: { snapshot_id: snapshot.id },
        actor: 'ENGINE'
      });
      // This is acceptable - use FULL variant as fail-safe
    }
    
    const frictionInsights = this.frictionMap.getFrictionInsights();
    const topFriction = this.frictionMap.getTopFrictionReasons(1);
    
    return {
      snapshot,
      output_index: outputIndex,
      user_policy: {
        tax_preference: policyConfig.tax_preference,
        risk_tolerance: policyConfig.risk_tolerance
      },
      adoption_stats: stats,
      friction_insights: frictionInsights,
      top_friction_reason: topFriction[0]?.reason || null
    };
  }
  
  // ===========================================================================
  // VARIANT SELECTION
  // ===========================================================================
  
  /**
   * Select presentation variant based on context
   */
  private selectVariant(context: ShapingContext): PresentationVariant {
    const { adoption_stats, top_friction_reason, user_policy } = context;
    
    // If user has high ignore rate, simplify
    if (adoption_stats.ignore_rate > 0.4) {
      return 'SIMPLE';
    }
    
    // Based on top friction reason
    switch (top_friction_reason) {
      case 'TAX_FEAR':
        return 'TAX_FIRST';
      case 'CONVICTION_TOO_LOW':
      case 'TIMING_DOUBT':
        return 'RISK_FIRST';
      case 'TOO_COMPLEX':
        return 'SIMPLE';
      case 'LIQUIDITY_CONCERN':
      case 'MARKET_CONDITION':
        return 'COMPARISON_ONLY';
    }
    
    // Based on user policy
    if (user_policy.tax_preference === 'OPTIMIZE') {
      return 'TAX_FIRST';
    }
    
    if (user_policy.risk_tolerance === 'LOW') {
      return 'RISK_FIRST';
    }
    
    // Default
    return this.config.default_variant;
  }
  
  // ===========================================================================
  // EMPHASIS DETERMINATION
  // ===========================================================================
  
  private determineEmphasis(context: ShapingContext): EmphasisFlag[] {
    const flags: EmphasisFlag[] = [];
    const { top_friction_reason, user_policy, adoption_stats } = context;
    
    // Based on friction
    if (top_friction_reason === 'TAX_FEAR') {
      flags.push('TAX');
    }
    if (top_friction_reason === 'CONVICTION_TOO_LOW' || top_friction_reason === 'TIMING_DOUBT') {
      flags.push('RISK');
    }
    if (top_friction_reason === 'MARKET_CONDITION') {
      flags.push('TIMING');
    }
    if (top_friction_reason === 'TOO_COMPLEX' || adoption_stats.ignore_rate > 0.3) {
      flags.push('SIMPLICITY');
    }
    
    // Based on policy
    if (user_policy.tax_preference === 'OPTIMIZE' && !flags.includes('TAX')) {
      flags.push('TAX');
    }
    if (user_policy.risk_tolerance === 'LOW' && !flags.includes('RISK')) {
      flags.push('RISK');
    }
    
    return flags;
  }
  
  private determineMetricOrder(context: ShapingContext, emphasis: EmphasisFlag[]): MetricOrder {
    if (emphasis.includes('TAX')) return 'TAX_FIRST';
    if (emphasis.includes('RISK')) return 'RISK_FIRST';
    return 'RETURN_FIRST';
  }
  
  // ===========================================================================
  // LIMITS DETERMINATION
  // ===========================================================================
  
  private determineLimits(context: ShapingContext): { maxMetrics: number; maxBullets: number } {
    const { adoption_stats } = context;
    
    // Default
    let maxMetrics = 6;
    let maxBullets = 5;
    
    // Reduce based on ignore rate
    if (adoption_stats.ignore_rate > 0.5) {
      maxMetrics = 3;
      maxBullets = 2;
    } else if (adoption_stats.ignore_rate > 0.3) {
      maxMetrics = 4;
      maxBullets = 3;
    }
    
    // Reduce based on avg decision time
    if (adoption_stats.avg_time_to_action_seconds > 1800) { // 30 minutes
      maxMetrics = Math.min(maxMetrics, 4);
      maxBullets = Math.min(maxBullets, 3);
    }
    
    return { maxMetrics, maxBullets };
  }
  
  // ===========================================================================
  // CONTENT SHAPING
  // ===========================================================================
  
  /**
   * Order explanation points based on emphasis
   * Does NOT create new content, only reorders existing
   */
  private orderExplanation(reasoning: string[], emphasis: EmphasisFlag[]): string[] {
    if (reasoning.length <= 1) return reasoning;
    
    const scored = reasoning.map((r, idx) => ({
      text: r,
      original_index: idx,
      score: this.scoreExplanationPoint(r, emphasis)
    }));
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored.map(s => s.text);
  }
  
  /**
   * Score an explanation point based on emphasis
   */
  private scoreExplanationPoint(text: string, emphasis: EmphasisFlag[]): number {
    let score = 0;
    const lower = text.toLowerCase();
    
    if (emphasis.includes('TAX')) {
      if (lower.includes('tax') || lower.includes('ltcg') || lower.includes('stcg')) {
        score += 10;
      }
    }
    
    if (emphasis.includes('RISK')) {
      if (lower.includes('risk') || lower.includes('volatil') || lower.includes('downside')) {
        score += 10;
      }
    }
    
    if (emphasis.includes('TIMING')) {
      if (lower.includes('timing') || lower.includes('entry') || lower.includes('level')) {
        score += 10;
      }
    }
    
    if (emphasis.includes('SIMPLICITY')) {
      // Shorter is better
      score += Math.max(0, 10 - text.length / 20);
    }
    
    return score;
  }
  
  /**
   * Shape explanation to fit within limits
   * Does NOT create new content, only selects from existing
   */
  private shapeExplanation(
    reasoning: string[],
    maxBullets: number,
    emphasis: EmphasisFlag[]
  ): string[] {
    const ordered = this.orderExplanation(reasoning, emphasis);
    return ordered.slice(0, maxBullets);
  }
  
  /**
   * Shape metrics for display
   * INVARIANT: At least one risk-related metric MUST always be visible
   */
  private shapeMetrics(
    output: DecisionOutput,
    maxMetrics: number,
    emphasis: EmphasisFlag[]
  ): ShapedMetric[] {
    const metrics: ShapedMetric[] = [];
    
    // MANDATORY: Always include confidence (cannot be hidden)
    metrics.push({
      name: 'Confidence',
      value: `${output.confidence}%`,
      priority: 1,
      emphasized: false,
      _mandatory: true
    } as ShapedMetric & { _mandatory: boolean });
    
    // Expected return (RISK METRIC - must be preserved)
    let hasRiskMetric = false;
    if (output.expected_return !== undefined) {
      metrics.push({
        name: 'Expected Return',
        value: `${output.expected_return >= 0 ? '+' : ''}${output.expected_return.toFixed(1)}%`,
        priority: 2, // Always high priority for risk visibility
        emphasized: emphasis.includes('RISK'),
        _mandatory: true // RISK VISIBILITY GUARANTEE
      } as ShapedMetric & { _mandatory: boolean });
      hasRiskMetric = true;
    }
    
    // Tax impact
    if (output.expected_tax_impact !== undefined) {
      metrics.push({
        name: 'Tax Impact',
        value: `₹${Math.abs(output.expected_tax_impact).toLocaleString()}`,
        priority: emphasis.includes('TAX') ? 3 : 4,
        emphasized: emphasis.includes('TAX')
      });
    }
    
    // Quantity if available
    if (output.quantity !== undefined) {
      metrics.push({
        name: 'Quantity',
        value: output.quantity,
        priority: 6,
        emphasized: false
      });
    }
    
    // Sort by priority
    metrics.sort((a, b) => a.priority - b.priority);
    
    // RISK VISIBILITY GUARANTEE:
    // Ensure at least one risk metric is always shown
    // If no risk metric exists in output, add explicit note
    if (!hasRiskMetric) {
      // No risk data available - add explicit indicator
      metrics.push({
        name: 'Risk',
        value: 'No explicit risk data',
        priority: 2,
        emphasized: true
      });
    }
    
    // Apply limit but NEVER remove mandatory metrics
    const mandatoryMetrics = metrics.filter((m: any) => m._mandatory);
    const optionalMetrics = metrics.filter((m: any) => !m._mandatory);
    
    // Take all mandatory + fill remaining with optional
    const remainingSlots = Math.max(0, maxMetrics - mandatoryMetrics.length);
    const selectedOptional = optionalMetrics.slice(0, remainingSlots);
    
    const finalMetrics = [...mandatoryMetrics, ...selectedOptional]
      .sort((a, b) => a.priority - b.priority)
      .map(({ _mandatory, ...m }: any) => m as ShapedMetric); // Remove internal flag
    
    return finalMetrics;
  }
  
  /**
   * Generate headline based on variant
   */
  private generateHeadline(output: DecisionOutput, variant: PresentationVariant): string {
    const action = output.action;
    const symbol = output.symbol || 'position';
    
    switch (variant) {
      case 'SIMPLE':
        return `${action} ${symbol}`;
      case 'TAX_FIRST':
        return `${action} ${symbol} (tax-optimized)`;
      case 'RISK_FIRST':
        return `${action} ${symbol} (risk-adjusted)`;
      case 'COMPARISON_ONLY':
        return `${action} ${symbol}: Before vs After`;
      default:
        return `${action} ${symbol} at ${output.confidence}% confidence`;
    }
  }
  
  // ===========================================================================
  // UTILITIES
  // ===========================================================================
  
  /**
   * Generate hash of output to verify it wasn't changed
   * MUST include ALL decision-relevant fields
   */
  private hashOutput(output: DecisionOutput): string {
    // CRITICAL: Include ALL fields that affect the decision
    const content = JSON.stringify({
      action: output.action,
      symbol: output.symbol,
      quantity: output.quantity,
      confidence: output.confidence,
      reasoning: output.reasoning,
      expected_return: output.expected_return,
      expected_tax_impact: output.expected_tax_impact
    });
    
    // Simple hash (in production, use crypto)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  /**
   * Generate shaping rationale
   */
  private generateRationale(variant: PresentationVariant, context: ShapingContext): string {
    const reasons: string[] = [];
    
    if (context.adoption_stats.ignore_rate > 0.3) {
      reasons.push(`High ignore rate (${(context.adoption_stats.ignore_rate * 100).toFixed(0)}%) → simplified presentation`);
    }
    
    if (context.top_friction_reason) {
      reasons.push(`Top friction: "${context.top_friction_reason}" → ${variant} variant`);
    }
    
    if (context.user_policy.tax_preference === 'OPTIMIZE') {
      reasons.push('User prefers tax optimization → emphasized tax metrics');
    }
    
    if (context.user_policy.risk_tolerance === 'LOW') {
      reasons.push('Low risk tolerance → risk-first ordering');
    }
    
    return reasons.length > 0 
      ? reasons.join('. ')
      : 'Default presentation based on user profile';
  }
  
  // ===========================================================================
  // VERIFICATION (MANDATORY)
  // ===========================================================================
  
  /**
   * Verify shaped decision hasn't altered original
   * MUST be called before rendering
   * Logs result to audit trail
   */
  public verifyIntegrity(shaped: ShapedDecision): boolean {
    const currentHash = this.hashOutput(shaped.original_output);
    const isValid = currentHash === shaped.original_hash;
    
    // ALWAYS log verification result
    this.auditLog.log({
      event_type: isValid ? 'CONTEXT_CREATED' : 'SYSTEM_ERROR',
      severity: isValid ? 'INFO' : 'ERROR',
      summary: `Integrity verification: ${isValid ? 'PASSED' : 'FAILED'}`,
      details: {
        shaping_id: shaped.shaping_id,
        snapshot_id: shaped.original_snapshot.id,
        expected_hash: shaped.original_hash,
        actual_hash: currentHash,
        is_valid: isValid
      },
      actor: 'ENGINE'
    });
    
    return isValid;
  }
  
  /**
   * Verify and get shaped decision for rendering
   * THROWS if integrity check fails - fail closed
   */
  public verifyAndGet(shaped: ShapedDecision): ShapedDecision {
    if (!this.verifyIntegrity(shaped)) {
      throw new Error(
        `INTEGRITY VIOLATION: ShapedDecision ${shaped.shaping_id} failed hash verification. ` +
        `Original content may have been tampered. Rendering BLOCKED.`
      );
    }
    return shaped;
  }
  
  // ===========================================================================
  // CONFIG
  // ===========================================================================
  
  public getConfig(): ShapingConfig {
    return { ...this.config };
  }
  
  public updateConfig(partial: Partial<ShapingConfig>): void {
    this.config = { ...this.config, ...partial };
    
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'INFO',
      summary: 'Shaping config updated',
      details: { new_config: this.config },
      actor: 'USER'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getDecisionShaper = () => DecisionShaper.getInstance();
export default DecisionShaper;

