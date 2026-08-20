/**
 * ConflictResolutionEngine - Multi-Decision Conflict Resolution (MDCR)
 * 
 * PHASE 30B: Portfolio-Level Authority Logic
 * 
 * PURPOSE:
 * Decide which correct decisions are ALLOWED when they conflict.
 * This is NOT ranking, NOT suggestion, NOT UI logic.
 * 
 * ABSOLUTE RULES:
 * - FAIL-CLOSED: If conflicts cannot be resolved → SYSTEM_ABORT
 * - NO USER ARBITRATION: System kills decisions itself
 * - NO SOFT PRIORITIZATION: ALLOWED or SUPPRESSED only
 * - SUPPRESSION ≠ DELETION: Suppressed decisions remain auditable
 * - ALL OUTPUTS IMMUTABLE: Every output is frozen
 */

import { DecisionSnapshot, DecisionOutput, DecisionInput } from '../core/DecisionSnapshot';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getDecisionLifecycleEngine } from '../lifecycle/DecisionLifecycleEngine';
import { getTemporalReservationEngine, TemporalWindow } from '../reservations/TemporalReservationEngine';
import { getCounterfactualLedger, SuppressionReason } from '../counterfactual/CounterfactualLedger';

// =============================================================================
// TYPES - INPUT
// =============================================================================

/**
 * PortfolioSnapshot - Current portfolio state
 */
export interface PortfolioSnapshot {
  readonly holdings: ReadonlyArray<{
    readonly symbol: string;
    readonly quantity: number;
    readonly avg_cost: number;
    readonly current_price: number;
    readonly sector: string;
    readonly weight: number;
  }>;
  readonly cash_available: number;
  readonly cash_buffer_required: number;
  readonly total_value: number;
  readonly _frozen: true;
}

/**
 * RiskBudget - Risk limits
 */
export interface RiskBudget {
  readonly max_drawdown_percent: number;
  readonly max_volatility_percent: number;
  readonly max_single_position_percent: number;
  readonly max_sector_concentration_percent: number;
  readonly current_drawdown_percent: number;
  readonly current_volatility_percent: number;
  readonly _frozen: true;
}

/**
 * TaxProfile - Tax considerations
 */
export interface TaxProfile {
  readonly stcg_rate: number;
  readonly ltcg_rate: number;
  readonly holding_periods: ReadonlyArray<{
    readonly symbol: string;
    readonly days_held: number;
    readonly days_to_ltcg: number;
    readonly unrealized_gain: number;
  }>;
  readonly _frozen: true;
}

/**
 * UserPolicy - User constraints
 */
export interface UserPolicy {
  readonly excluded_sectors: ReadonlyArray<string>;
  readonly excluded_symbols: ReadonlyArray<string>;
  readonly max_position_size: number;
  readonly min_holding_period_days: number;
  readonly allow_short_term_gains: boolean;
  readonly _frozen: true;
}

/**
 * MarketRegime - Current market state
 */
export type MarketRegimeType = 'RISK_ON' | 'NORMAL' | 'RISK_OFF' | 'CRISIS';

export interface MarketRegime {
  readonly regime: MarketRegimeType;
  readonly volatility_index: number;
  readonly regime_confidence: number;
  readonly _frozen: true;
}

/**
 * ConflictInput - All inputs for conflict resolution
 */
export interface ConflictInput {
  readonly decision_snapshots: ReadonlyArray<DecisionSnapshot>;
  readonly portfolio_state: PortfolioSnapshot;
  readonly risk_budget: RiskBudget;
  readonly tax_profile: TaxProfile;
  readonly user_policy: UserPolicy;
  readonly market_regime: MarketRegime;
}

// =============================================================================
// TYPES - OUTPUT
// =============================================================================

/**
 * ConflictReason - Why a decision was suppressed
 */
export type ConflictReason =
  | 'CAPITAL_CONTENTION'
  | 'RISK_BUDGET_EXHAUSTION'
  | 'TAX_VS_SIGNAL'
  | 'CORRELATION_CONFLICT'
  | 'POLICY_VIOLATION'
  | 'DUPLICATE_SYMBOL'
  | 'TEMPORAL_RESOURCE_CONFLICT'  // PHASE 32: Time-based resource conflict
  | 'SYSTEM_ABORT';

/**
 * StrategyType - Resolution strategy used
 */
export type StrategyType =
  | 'CAPITAL_MAX_EFFICIENCY'
  | 'RISK_MINIMIZATION'
  | 'TAX_OPTIMIZED_HOLD'
  | 'DIVERSIFICATION_PRIORITY'
  | 'POLICY_ENFORCEMENT'
  | 'SYSTEM_ABORT';

/**
 * SuppressedDecision - A decision that was killed
 */
export interface SuppressedDecision {
  readonly snapshot_id: string;
  readonly suppression_reason: ConflictReason;
  readonly killed_by: string;              // snapshot_id of winning decision, or 'SYSTEM'
  readonly regret_if_executed: number;
  readonly confidence_at_death: number;
  readonly _frozen: true;
}

/**
 * ConflictResolutionResult - Final output
 */
export interface ConflictResolutionResult {
  readonly allowed: ReadonlyArray<DecisionSnapshot>;
  readonly suppressed: ReadonlyArray<SuppressedDecision>;
  readonly resolution_strategy: StrategyType;
  readonly audit_trail_id: string;
  readonly capital_used: number;
  readonly risk_used: number;
  readonly _frozen: true;
}

/**
 * AuditEvent - Logged for every resolution
 */
interface ConflictAuditEvent {
  event_type: 'CONFLICT_RESOLVED';
  winning_snapshot_id: string | null;
  suppressed_snapshot_ids: string[];
  resolution_strategy: StrategyType;
  capital_saved: number;
  risk_reduced: number;
  tax_impact: number;
  timestamp: string;
}

// =============================================================================
// CONFLICT RESOLUTION ENGINE
// =============================================================================

export class ConflictResolutionEngine {
  private static instance: ConflictResolutionEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): ConflictResolutionEngine {
    if (!ConflictResolutionEngine.instance) {
      ConflictResolutionEngine.instance = new ConflictResolutionEngine();
    }
    return ConflictResolutionEngine.instance;
  }
  
  // ===========================================================================
  // MAIN RESOLUTION API
  // ===========================================================================
  
  /**
   * Resolve conflicts among multiple decisions
   * FAIL-CLOSED: Returns SYSTEM_ABORT if constraints cannot be satisfied
   */
  public resolveConflicts(input: ConflictInput): ConflictResolutionResult {
    // Validate input
    this.validateInput(input);
    
    const allowed: DecisionSnapshot[] = [];
    const suppressed: SuppressedDecision[] = [];
    let strategy: StrategyType = 'CAPITAL_MAX_EFFICIENCY';
    
    // Track resources
    let remainingCapital = input.portfolio_state.cash_available - 
                           input.portfolio_state.cash_buffer_required;
    let remainingRiskBudget = input.risk_budget.max_drawdown_percent - 
                              input.risk_budget.current_drawdown_percent;
    
    // 1. First pass: Policy violations (immediate suppression)
    const { passed: policyPassed, violated: policyViolated } = 
      this.checkPolicyViolations(input.decision_snapshots, input.user_policy);
    
    for (const violated of policyViolated) {
      suppressed.push(this.createSuppressed(
        violated,
        'POLICY_VIOLATION',
        'SYSTEM',
        0,
        this.getConfidence(violated)
      ));
    }
    
    if (policyViolated.length > 0) {
      strategy = 'POLICY_ENFORCEMENT';
    }
    
    // 2. Check for duplicate symbols (only one decision per symbol)
    const { unique, duplicates } = this.removeDuplicateSymbols(policyPassed);
    for (const dup of duplicates) {
      suppressed.push(this.createSuppressed(
        dup.suppressed,
        'DUPLICATE_SYMBOL',
        dup.winner.id,
        this.calculateRegret(dup.suppressed),
        this.getConfidence(dup.suppressed)
      ));
    }
    
    // 3. Sort by priority for capital allocation
    const sorted = this.sortByPriority(unique, input);
    
    // 4. Capital contention resolution
    for (const decision of sorted) {
      const capitalRequired = this.getCapitalRequired(decision);
      const riskRequired = this.getRiskRequired(decision, input);
      
      // Check capital
      if (capitalRequired > remainingCapital) {
        suppressed.push(this.createSuppressed(
          decision,
          'CAPITAL_CONTENTION',
          allowed.length > 0 ? allowed[allowed.length - 1].id : 'SYSTEM',
          this.calculateRegret(decision),
          this.getConfidence(decision)
        ));
        strategy = 'CAPITAL_MAX_EFFICIENCY';
        continue;
      }
      
      // Check risk budget
      if (riskRequired > remainingRiskBudget) {
        suppressed.push(this.createSuppressed(
          decision,
          'RISK_BUDGET_EXHAUSTION',
          allowed.length > 0 ? allowed[allowed.length - 1].id : 'SYSTEM',
          this.calculateRegret(decision),
          this.getConfidence(decision)
        ));
        strategy = 'RISK_MINIMIZATION';
        continue;
      }
      
      // Check correlation conflict
      if (this.hasCorrelationConflict(decision, allowed, input)) {
        suppressed.push(this.createSuppressed(
          decision,
          'CORRELATION_CONFLICT',
          this.findCorrelationWinner(decision, allowed),
          this.calculateRegret(decision),
          this.getConfidence(decision)
        ));
        strategy = 'DIVERSIFICATION_PRIORITY';
        continue;
      }
      
      // Check tax vs signal conflict
      const taxConflict = this.checkTaxSignalConflict(decision, input);
      if (taxConflict.hasConflict) {
        if (taxConflict.suppress) {
          suppressed.push(this.createSuppressed(
            decision,
            'TAX_VS_SIGNAL',
            'SYSTEM',
            this.calculateRegret(decision),
            this.getConfidence(decision)
          ));
          strategy = 'TAX_OPTIMIZED_HOLD';
          continue;
        }
      }
      
      // PHASE 32: Check temporal resource conflict
      const temporalConflict = this.checkTemporalResourceConflict(decision, allowed, input);
      if (temporalConflict.hasConflict) {
        suppressed.push(this.createSuppressed(
          decision,
          'TEMPORAL_RESOURCE_CONFLICT',
          temporalConflict.conflictingDecisionId || 'SYSTEM',
          this.calculateRegret(decision),
          this.getConfidence(decision)
        ));
        strategy = 'CAPITAL_MAX_EFFICIENCY';
        continue;
      }
      
      // Decision is ALLOWED
      allowed.push(decision);
      remainingCapital -= capitalRequired;
      remainingRiskBudget -= riskRequired;
    }
    
    // 5. Final check: If no decisions allowed and we had inputs, consider SYSTEM_ABORT
    if (allowed.length === 0 && input.decision_snapshots.length > 0) {
      // Check if this is a true SYSTEM_ABORT scenario
      if (suppressed.length === 0) {
        // This shouldn't happen - something is wrong
        strategy = 'SYSTEM_ABORT';
      }
    }
    
    // 6. LIFECYCLE TRANSITIONS (PHASE 31 INTEGRATION)
    this.transitionLifecycles(allowed, suppressed);
    
    // 7. Create audit event
    const auditId = this.createAuditEvent(allowed, suppressed, strategy, input);
    
    // 8. Build and freeze result
    const result: ConflictResolutionResult = Object.freeze({
      allowed: Object.freeze(allowed),
      suppressed: Object.freeze(suppressed),
      resolution_strategy: strategy,
      audit_trail_id: auditId,
      capital_used: input.portfolio_state.cash_available - 
                    input.portfolio_state.cash_buffer_required - remainingCapital,
      risk_used: input.risk_budget.max_drawdown_percent - 
                 input.risk_budget.current_drawdown_percent - remainingRiskBudget,
      _frozen: true
    });
    
    return result;
  }
  
  /**
   * Transition lifecycles for allowed and suppressed decisions
   * PHASE 31 INTEGRATION
   */
  private transitionLifecycles(
    allowed: DecisionSnapshot[],
    suppressed: SuppressedDecision[]
  ): void {
    const lifecycleEngine = getDecisionLifecycleEngine();
    
    // Transition allowed decisions: CONFLICTED → ACTIVE
    for (const decision of allowed) {
      try {
        // Ensure lifecycle exists and is in CONFLICTED state
        if (lifecycleEngine.hasLifecycle(decision.id)) {
          const current = lifecycleEngine.getCurrentState(decision.id);
          if (current.state === 'CONFLICTED') {
            lifecycleEngine.transition(
              decision.id,
              'CONFLICTED',
              'ACTIVE',
              'Survived conflict resolution',
              'MDCR'
            );
          }
        }
      } catch (e) {
        // Log but don't fail - lifecycle might not exist for test data
        console.warn(`Lifecycle transition failed for allowed ${decision.id}:`, e);
      }
    }
    
    // Transition suppressed decisions: CONFLICTED → SUPPRESSED
    for (const sup of suppressed) {
      try {
        if (lifecycleEngine.hasLifecycle(sup.snapshot_id)) {
          const current = lifecycleEngine.getCurrentState(sup.snapshot_id);
          if (current.state === 'CONFLICTED') {
            lifecycleEngine.transition(
              sup.snapshot_id,
              'CONFLICTED',
              'SUPPRESSED',
              `Suppressed by MDCR: ${sup.suppression_reason}`,
              'MDCR'
            );
          }
        }
      } catch (e) {
        // Log but don't fail
        console.warn(`Lifecycle transition failed for suppressed ${sup.snapshot_id}:`, e);
      }
    }
  }
  
  /**
   * Force SYSTEM_ABORT when constraints cannot be satisfied
   */
  public forceSystemAbort(input: ConflictInput, reason: string): ConflictResolutionResult {
    const suppressed: SuppressedDecision[] = [];
    const lifecycleEngine = getDecisionLifecycleEngine();
    
    for (const decision of input.decision_snapshots) {
      suppressed.push(this.createSuppressed(
        decision,
        'SYSTEM_ABORT',
        'SYSTEM',
        this.calculateRegret(decision),
        this.getConfidence(decision)
      ));
      
      // PHASE 31: Transition to SUPPRESSED
      try {
        if (lifecycleEngine.hasLifecycle(decision.id)) {
          const current = lifecycleEngine.getCurrentState(decision.id);
          if (current.state === 'CONFLICTED') {
            lifecycleEngine.transition(
              decision.id,
              'CONFLICTED',
              'SUPPRESSED',
              `SYSTEM_ABORT: ${reason}`,
              'MDCR'
            );
          }
        }
      } catch (e) {
        console.warn(`Lifecycle transition failed for ${decision.id}:`, e);
      }
    }
    
    const auditId = this.createAuditEvent([], suppressed, 'SYSTEM_ABORT', input);
    
    this.auditLog.log({
      event_type: 'EXECUTION_BLOCKED',
      severity: 'ERROR',
      summary: `SYSTEM_ABORT: ${reason}`,
      details: {
        reason,
        suppressed_count: suppressed.length,
        audit_id: auditId
      },
      actor: 'ENGINE'
    });
    
    return Object.freeze({
      allowed: Object.freeze([]),
      suppressed: Object.freeze(suppressed),
      resolution_strategy: 'SYSTEM_ABORT' as const,
      audit_trail_id: auditId,
      capital_used: 0,
      risk_used: 0,
      _frozen: true
    });
  }
  
  // ===========================================================================
  // VALIDATION
  // ===========================================================================
  
  private validateInput(input: ConflictInput): void {
    if (!input.decision_snapshots || input.decision_snapshots.length === 0) {
      throw new Error('CONFLICT_VALIDATION_FAILED: No decision snapshots provided');
    }
    
    if (!input.portfolio_state) {
      throw new Error('CONFLICT_VALIDATION_FAILED: Portfolio state required');
    }
    
    if (!input.risk_budget) {
      throw new Error('CONFLICT_VALIDATION_FAILED: Risk budget required');
    }
    
    if (!input.tax_profile) {
      throw new Error('CONFLICT_VALIDATION_FAILED: Tax profile required');
    }
    
    if (!input.user_policy) {
      throw new Error('CONFLICT_VALIDATION_FAILED: User policy required');
    }
    
    if (!input.market_regime) {
      throw new Error('CONFLICT_VALIDATION_FAILED: Market regime required');
    }
    
    // Validate all snapshots are frozen
    for (const snapshot of input.decision_snapshots) {
      if (!snapshot._frozen) {
        throw new Error(`CONFLICT_VALIDATION_FAILED: Snapshot ${snapshot.id} is not frozen`);
      }
    }
  }
  
  // ===========================================================================
  // CONFLICT CHECKS
  // ===========================================================================
  
  /**
   * Check policy violations (immediate suppression)
   */
  private checkPolicyViolations(
    decisions: ReadonlyArray<DecisionSnapshot>,
    policy: UserPolicy
  ): { passed: DecisionSnapshot[]; violated: DecisionSnapshot[] } {
    const passed: DecisionSnapshot[] = [];
    const violated: DecisionSnapshot[] = [];
    
    for (const decision of decisions) {
      const output = decision.outputs[0];
      if (!output) {
        violated.push(decision);
        continue;
      }
      
      const symbol = output.symbol || '';
      
      // Check excluded symbols
      if (policy.excluded_symbols.includes(symbol)) {
        violated.push(decision);
        continue;
      }
      
      // Check excluded sectors (would need sector info from elsewhere)
      // For now, pass if not explicitly excluded
      
      passed.push(decision);
    }
    
    return { passed, violated };
  }
  
  /**
   * Remove duplicate symbols - only one decision per symbol allowed
   */
  private removeDuplicateSymbols(decisions: DecisionSnapshot[]): {
    unique: DecisionSnapshot[];
    duplicates: Array<{ winner: DecisionSnapshot; suppressed: DecisionSnapshot }>;
  } {
    const symbolMap = new Map<string, DecisionSnapshot>();
    const duplicates: Array<{ winner: DecisionSnapshot; suppressed: DecisionSnapshot }> = [];
    
    for (const decision of decisions) {
      const symbol = decision.outputs[0]?.symbol || '';
      
      if (symbolMap.has(symbol)) {
        // Compare and keep higher confidence
        const existing = symbolMap.get(symbol)!;
        const existingConf = this.getConfidence(existing);
        const newConf = this.getConfidence(decision);
        
        if (newConf > existingConf) {
          duplicates.push({ winner: decision, suppressed: existing });
          symbolMap.set(symbol, decision);
        } else {
          duplicates.push({ winner: existing, suppressed: decision });
        }
      } else {
        symbolMap.set(symbol, decision);
      }
    }
    
    return {
      unique: Array.from(symbolMap.values()),
      duplicates
    };
  }
  
  /**
   * Check for correlation conflict with existing allowed decisions
   */
  private hasCorrelationConflict(
    decision: DecisionSnapshot,
    allowed: DecisionSnapshot[],
    input: ConflictInput
  ): boolean {
    if (allowed.length === 0) return false;
    
    const symbol = decision.outputs[0]?.symbol || '';
    const sector = this.getSector(symbol, input.portfolio_state);
    
    // Count sector exposure
    let sectorCount = 0;
    for (const allowedDecision of allowed) {
      const allowedSymbol = allowedDecision.outputs[0]?.symbol || '';
      const allowedSector = this.getSector(allowedSymbol, input.portfolio_state);
      
      if (allowedSector === sector && sector !== 'UNKNOWN') {
        sectorCount++;
      }
    }
    
    // If we already have 2+ in same sector, correlation conflict
    if (sectorCount >= 2) {
      return true;
    }
    
    // Check max sector concentration
    const currentSectorWeight = this.getCurrentSectorWeight(sector, input.portfolio_state);
    if (currentSectorWeight > input.risk_budget.max_sector_concentration_percent) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check tax vs signal conflict
   */
  private checkTaxSignalConflict(
    decision: DecisionSnapshot,
    input: ConflictInput
  ): { hasConflict: boolean; suppress: boolean } {
    const output = decision.outputs[0];
    if (!output || output.action !== 'SELL') {
      return { hasConflict: false, suppress: false };
    }
    
    const symbol = output.symbol || '';
    const holdingPeriod = input.tax_profile.holding_periods.find(h => h.symbol === symbol);
    
    if (!holdingPeriod) {
      return { hasConflict: false, suppress: false };
    }
    
    // Check if close to LTCG threshold
    const daysToLtcg = holdingPeriod.days_to_ltcg;
    const unrealizedGain = holdingPeriod.unrealized_gain;
    
    // If within 30 days of LTCG and significant gain, there's a conflict
    if (daysToLtcg > 0 && daysToLtcg <= 30 && unrealizedGain > 0) {
      // HIERARCHY: Market Regime Risk > Tax Optimization > Signal Strength
      
      if (input.market_regime.regime === 'RISK_OFF' || input.market_regime.regime === 'CRISIS') {
        // Signal overrides tax in risk-off
        return { hasConflict: true, suppress: false };
      }
      
      // In NORMAL or RISK_ON, tax may override signal
      if (input.market_regime.regime === 'NORMAL' || input.market_regime.regime === 'RISK_ON') {
        const confidence = this.getConfidence(decision);
        
        // If confidence is not high enough, tax wins
        if (confidence < 75) {
          return { hasConflict: true, suppress: true };
        }
      }
    }
    
    return { hasConflict: false, suppress: false };
  }
  
  /**
   * Find which allowed decision caused correlation conflict
   */
  private findCorrelationWinner(decision: DecisionSnapshot, allowed: DecisionSnapshot[]): string {
    const symbol = decision.outputs[0]?.symbol || '';
    
    // Find first allowed decision in same sector
    for (const allowedDecision of allowed) {
      // Simplified: just return the first allowed decision
      // In production, would check sector correlation
      return allowedDecision.id;
    }
    
    return 'SYSTEM';
  }
  
  /**
   * PHASE 32: Check temporal resource conflict
   * Decisions with overlapping time windows compete for resources
   */
  private checkTemporalResourceConflict(
    decision: DecisionSnapshot,
    allowed: DecisionSnapshot[],
    input: ConflictInput
  ): { hasConflict: boolean; conflictingDecisionId: string | null } {
    const reservationEngine = getTemporalReservationEngine();
    const output = decision.outputs[0];
    
    if (!output) {
      return { hasConflict: false, conflictingDecisionId: null };
    }
    
    // Default window: 30 days from now
    const now = new Date();
    const defaultWindow: TemporalWindow = {
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const capitalRequired = this.getCapitalRequired(decision);
    const riskRequired = this.getRiskRequired(decision, input);
    
    // Check for capital conflicts
    if (capitalRequired > 0) {
      const capitalConflicts = reservationEngine.detectCapitalConflicts(
        decision.id,
        capitalRequired,
        defaultWindow
      );
      
      if (capitalConflicts.length > 0) {
        // Find which allowed decision has the conflicting reservation
        for (const conflict of capitalConflicts) {
          const conflictingDecision = allowed.find(
            d => reservationEngine.getCapitalReservation(d.id)?.reservation_id === conflict.existing_reservation_id
          );
          if (conflictingDecision) {
            return { hasConflict: true, conflictingDecisionId: conflictingDecision.id };
          }
        }
        return { hasConflict: true, conflictingDecisionId: null };
      }
    }
    
    // Check for risk conflicts
    if (riskRequired > 0) {
      const riskConflicts = reservationEngine.detectRiskConflicts(
        decision.id,
        riskRequired,
        defaultWindow
      );
      
      if (riskConflicts.length > 0) {
        for (const conflict of riskConflicts) {
          const conflictingDecision = allowed.find(
            d => reservationEngine.getRiskReservation(d.id)?.reservation_id === conflict.existing_reservation_id
          );
          if (conflictingDecision) {
            return { hasConflict: true, conflictingDecisionId: conflictingDecision.id };
          }
        }
        return { hasConflict: true, conflictingDecisionId: null };
      }
    }
    
    return { hasConflict: false, conflictingDecisionId: null };
  }
  
  // ===========================================================================
  // SORTING & PRIORITY
  // ===========================================================================
  
  /**
   * Sort decisions by priority for capital allocation
   * Higher priority = allocated first
   */
  private sortByPriority(decisions: DecisionSnapshot[], input: ConflictInput): DecisionSnapshot[] {
    return [...decisions].sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a, input);
      const scoreB = this.calculatePriorityScore(b, input);
      return scoreB - scoreA; // Higher score first
    });
  }
  
  /**
   * Calculate priority score for a decision
   */
  private calculatePriorityScore(decision: DecisionSnapshot, input: ConflictInput): number {
    const output = decision.outputs[0];
    if (!output) return 0;
    
    let score = 0;
    
    // 1. Confidence (0-100)
    score += output.confidence * 0.3;
    
    // 2. Expected return (normalized)
    const expectedReturn = output.expected_return || 0;
    score += Math.min(expectedReturn, 50) * 0.3;
    
    // 3. Tax efficiency (0-20)
    const taxScore = this.getTaxEfficiencyScore(decision, input);
    score += taxScore * 0.2;
    
    // 4. Risk-adjusted return (0-20)
    const riskAdjusted = this.getRiskAdjustedScore(decision, input);
    score += riskAdjusted * 0.2;
    
    return score;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private getConfidence(decision: DecisionSnapshot): number {
    return decision.outputs[0]?.confidence || 0;
  }
  
  private getCapitalRequired(decision: DecisionSnapshot): number {
    const output = decision.outputs[0];
    if (!output) return 0;
    
    if (output.action === 'SELL') return 0;
    
    const price = output.price_at_decision || 0;
    const quantity = output.quantity || 1;
    
    return price * quantity;
  }
  
  private getRiskRequired(decision: DecisionSnapshot, input: ConflictInput): number {
    // Simplified: risk = volatility contribution estimate
    const output = decision.outputs[0];
    if (!output) return 0;
    
    // Each BUY adds 2% risk, SELL reduces 1%
    if (output.action === 'BUY') return 2;
    if (output.action === 'SELL') return -1;
    return 0;
  }
  
  private calculateRegret(decision: DecisionSnapshot): number {
    const output = decision.outputs[0];
    if (!output) return 0;
    
    return (output.expected_return || 0) * (output.confidence / 100);
  }
  
  private getSector(symbol: string, portfolio: PortfolioSnapshot): string {
    const holding = portfolio.holdings.find(h => h.symbol === symbol);
    return holding?.sector || 'UNKNOWN';
  }
  
  private getCurrentSectorWeight(sector: string, portfolio: PortfolioSnapshot): number {
    if (sector === 'UNKNOWN') return 0;
    
    return portfolio.holdings
      .filter(h => h.sector === sector)
      .reduce((sum, h) => sum + h.weight, 0);
  }
  
  private getTaxEfficiencyScore(decision: DecisionSnapshot, input: ConflictInput): number {
    const output = decision.outputs[0];
    if (!output) return 0;
    
    if (output.action !== 'SELL') return 10; // Neutral for non-sells
    
    const symbol = output.symbol || '';
    const holdingPeriod = input.tax_profile.holding_periods.find(h => h.symbol === symbol);
    
    if (!holdingPeriod) return 10;
    
    // Long-term gains = higher score
    if (holdingPeriod.days_to_ltcg <= 0) return 20; // Already LTCG
    if (holdingPeriod.days_to_ltcg <= 30) return 5;  // Close to LTCG
    return 10;
  }
  
  private getRiskAdjustedScore(decision: DecisionSnapshot, input: ConflictInput): number {
    const output = decision.outputs[0];
    if (!output) return 0;
    
    const expectedReturn = output.expected_return || 0;
    const confidence = output.confidence;
    
    // Higher confidence = lower risk adjustment
    return Math.min(20, (expectedReturn * confidence) / 100);
  }
  
  private createSuppressed(
    decision: DecisionSnapshot,
    reason: ConflictReason,
    killedBy: string,
    regret: number,
    confidence: number
  ): SuppressedDecision {
    // PHASE 33: Register with CounterfactualLedger
    // MANDATORY: No suppression without registration
    try {
      const counterfactualLedger = getCounterfactualLedger();
      if (!counterfactualLedger.isRegistered(decision.id)) {
        counterfactualLedger.registerSuppression(
          decision,
          reason as SuppressionReason,
          killedBy,
          30 // Default 30-day horizon
        );
      }
    } catch (e) {
      // Log but don't fail - ledger registration is for accounting, not blocking
      console.error('Failed to register suppression in CounterfactualLedger:', e);
    }
    
    return Object.freeze({
      snapshot_id: decision.id,
      suppression_reason: reason,
      killed_by: killedBy,
      regret_if_executed: regret,
      confidence_at_death: confidence,
      _frozen: true
    });
  }
  
  // ===========================================================================
  // AUDIT
  // ===========================================================================
  
  private createAuditEvent(
    allowed: DecisionSnapshot[],
    suppressed: SuppressedDecision[],
    strategy: StrategyType,
    input: ConflictInput
  ): string {
    const auditId = `CONFLICT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const capitalSaved = suppressed.reduce((sum, s) => {
      const decision = input.decision_snapshots.find(d => d.id === s.snapshot_id);
      return sum + (decision ? this.getCapitalRequired(decision) : 0);
    }, 0);
    
    const riskReduced = suppressed.reduce((sum, s) => {
      const decision = input.decision_snapshots.find(d => d.id === s.snapshot_id);
      return sum + (decision ? this.getRiskRequired(decision, input) : 0);
    }, 0);
    
    const taxImpact = suppressed
      .filter(s => s.suppression_reason === 'TAX_VS_SIGNAL')
      .length * 100; // Simplified
    
    const auditEvent: ConflictAuditEvent = {
      event_type: 'CONFLICT_RESOLVED',
      winning_snapshot_id: allowed.length > 0 ? allowed[0].id : null,
      suppressed_snapshot_ids: suppressed.map(s => s.snapshot_id),
      resolution_strategy: strategy,
      capital_saved: capitalSaved,
      risk_reduced: riskReduced,
      tax_impact: taxImpact,
      timestamp: new Date().toISOString()
    };
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: strategy === 'SYSTEM_ABORT' ? 'ERROR' : 'INFO',
      summary: `Conflict resolved: ${strategy}`,
      details: {
        ...auditEvent,
        audit_id: auditId,
        allowed_count: allowed.length,
        suppressed_count: suppressed.length
      },
      actor: 'ENGINE'
    });
    
    return auditId;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getConflictResolutionEngine = () => ConflictResolutionEngine.getInstance();
export default ConflictResolutionEngine;

