/**
 * AdoptionLift - Adoption Lift Measurement
 * 
 * PHASE 25: Adaptive Decision Shaping (ADS)
 * 
 * PURPOSE:
 * Measure the impact of decision shaping on adoption.
 * Revert strategy if lift is negative.
 * 
 * TRACKS:
 * - adoption_before
 * - adoption_after
 * - lift_percent
 * - value_recovered
 * 
 * RULE:
 * If lift <= 0 for 10 decisions: revert shaping strategy
 */

import { getDecisionShaper, PresentationVariant, ShapedDecision } from './DecisionShaper';
import { getDecisionAdoption, AdoptionStats, UserAction } from '../adoption/DecisionAdoption';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * LiftMeasurement - Single lift measurement
 */
export interface LiftMeasurement {
  id: string;
  timestamp: string;
  
  // Decision reference
  shaping_id: string;
  snapshot_id: string;
  symbol: string;
  
  // Variant used
  variant: PresentationVariant;
  was_simplified: boolean;
  
  // Outcome
  user_action: UserAction;
  time_to_action_seconds: number;
  
  // Lift calculation
  baseline_adoption_rate: number;  // Historical rate
  expected_outcome: number;        // 0 or 1 based on baseline
  actual_outcome: number;          // 0 or 1
  lift_contribution: number;       // actual - expected
  
  // Value
  value_if_adopted: number;
  value_recovered: number;         // If lift was positive
  value_lost: number;              // If lift was negative
}

/**
 * LiftReport - Aggregate lift report
 */
export interface LiftReport {
  generated_at: string;
  
  // Overall lift
  total_measurements: number;
  total_positive_lift: number;
  total_negative_lift: number;
  net_lift: number;
  lift_percent: number;
  
  // Value impact
  total_value_recovered: number;
  total_value_lost: number;
  net_value_impact: number;
  
  // By variant
  by_variant: Record<PresentationVariant, VariantLift>;
  
  // Strategy status
  current_strategy_status: 'ACTIVE' | 'DEGRADED' | 'REVERTED';
  consecutive_negative: number;
  revert_threshold: number;
  
  // Trend
  recent_lift_trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  
  // Recommendations
  strategy_recommendation: string;
}

/**
 * VariantLift - Lift stats per variant
 */
export interface VariantLift {
  variant: PresentationVariant;
  usage_count: number;
  adoption_rate: number;
  avg_lift: number;
  total_value_impact: number;
  is_effective: boolean;
}

/**
 * StrategyStatus - Current strategy status
 */
export type StrategyStatus = 'ACTIVE' | 'DEGRADED' | 'REVERTED';

// =============================================================================
// ADOPTION LIFT TRACKER
// =============================================================================

export class AdoptionLiftTracker {
  private static instance: AdoptionLiftTracker;
  private shaper = getDecisionShaper();
  private adoption = getDecisionAdoption();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Measurements
  private measurements: Map<string, LiftMeasurement> = new Map();
  
  // Strategy state
  private currentStatus: StrategyStatus = 'ACTIVE';
  private consecutiveNegative: number = 0;
  private readonly REVERT_THRESHOLD = 10;
  
  // Baseline (rolling average)
  private baselineAdoptionRate: number = 0.5;
  private baselineSampleSize: number = 0;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): AdoptionLiftTracker {
    if (!AdoptionLiftTracker.instance) {
      AdoptionLiftTracker.instance = new AdoptionLiftTracker();
    }
    return AdoptionLiftTracker.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_adoption_lift');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, measurement] of Object.entries(parsed.measurements || {})) {
          this.measurements.set(id, measurement as LiftMeasurement);
        }
        this.currentStatus = parsed.status || 'ACTIVE';
        this.consecutiveNegative = parsed.consecutiveNegative || 0;
        this.baselineAdoptionRate = parsed.baseline || 0.5;
        this.baselineSampleSize = parsed.baselineSampleSize || 0;
      }
    } catch (e) {
      console.error('Failed to load adoption lift data:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const measurementStore: Record<string, LiftMeasurement> = {};
      for (const [id, m] of this.measurements) {
        measurementStore[id] = m;
      }
      
      localStorage.setItem('finvest_adoption_lift', JSON.stringify({
        measurements: measurementStore,
        status: this.currentStatus,
        consecutiveNegative: this.consecutiveNegative,
        baseline: this.baselineAdoptionRate,
        baselineSampleSize: this.baselineSampleSize
      }));
    } catch (e) {
      console.error('Failed to save adoption lift data:', e);
    }
  }
  
  // ===========================================================================
  // MEASUREMENT RECORDING
  // ===========================================================================
  
  /**
   * Record a lift measurement
   */
  public recordMeasurement(
    shaped: ShapedDecision,
    userAction: UserAction,
    timeToActionSeconds: number,
    valueIfAdopted: number
  ): LiftMeasurement {
    const id = `LIFT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const actualOutcome = userAction === 'APPROVE' ? 1 : 0;
    
    // Expected outcome based on baseline
    const expectedOutcome = this.baselineAdoptionRate > 0.5 ? 1 : 0;
    const liftContribution = actualOutcome - expectedOutcome;
    
    // Value calculation
    const valueRecovered = liftContribution > 0 ? valueIfAdopted : 0;
    const valueLost = liftContribution < 0 ? valueIfAdopted : 0;
    
    const measurement: LiftMeasurement = {
      id,
      timestamp: new Date().toISOString(),
      shaping_id: shaped.shaping_id,
      snapshot_id: shaped.original_snapshot.id,
      symbol: shaped.original_output.symbol || 'UNKNOWN',
      variant: shaped.variant,
      was_simplified: shaped.max_bullets < 5,
      user_action: userAction,
      time_to_action_seconds: timeToActionSeconds,
      baseline_adoption_rate: this.baselineAdoptionRate,
      expected_outcome: expectedOutcome,
      actual_outcome: actualOutcome,
      lift_contribution: liftContribution,
      value_if_adopted: valueIfAdopted,
      value_recovered: valueRecovered,
      value_lost: valueLost
    };
    
    this.measurements.set(id, measurement);
    
    // Update baseline (rolling average)
    this.updateBaseline(actualOutcome);
    
    // Update strategy status
    this.updateStrategyStatus(liftContribution);
    
    this.saveToStorage();
    
    // Log
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: liftContribution > 0 ? 'INFO' : 'WARNING',
      summary: `Adoption lift: ${liftContribution > 0 ? '+' : ''}${liftContribution}`,
      details: {
        id,
        variant: shaped.variant,
        user_action: userAction,
        lift: liftContribution,
        consecutive_negative: this.consecutiveNegative,
        status: this.currentStatus
      },
      actor: 'ENGINE'
    });
    
    return measurement;
  }
  
  /**
   * Update baseline adoption rate
   */
  private updateBaseline(outcome: number): void {
    this.baselineSampleSize++;
    const alpha = Math.min(0.1, 1 / this.baselineSampleSize);
    this.baselineAdoptionRate = alpha * outcome + (1 - alpha) * this.baselineAdoptionRate;
  }
  
  /**
   * Update strategy status based on lift
   */
  private updateStrategyStatus(liftContribution: number): void {
    if (liftContribution <= 0) {
      this.consecutiveNegative++;
      
      if (this.consecutiveNegative >= this.REVERT_THRESHOLD) {
        this.revertStrategy();
      } else if (this.consecutiveNegative >= this.REVERT_THRESHOLD / 2) {
        this.degradeStrategy();
      }
    } else {
      // Reset on positive lift
      this.consecutiveNegative = 0;
      if (this.currentStatus === 'DEGRADED') {
        this.currentStatus = 'ACTIVE';
        
        this.auditLog.log({
          event_type: 'POLICY_UPDATE',
          severity: 'INFO',
          summary: 'Shaping strategy restored to ACTIVE',
          details: {},
          actor: 'ENGINE'
        });
      }
    }
  }
  
  /**
   * Degrade strategy (intermediate state)
   */
  private degradeStrategy(): void {
    if (this.currentStatus !== 'DEGRADED') {
      this.currentStatus = 'DEGRADED';
      
      this.auditLog.log({
        event_type: 'POLICY_UPDATE',
        severity: 'WARNING',
        summary: `Shaping strategy DEGRADED: ${this.consecutiveNegative} consecutive negative lifts`,
        details: {
          consecutive_negative: this.consecutiveNegative,
          threshold: this.REVERT_THRESHOLD
        },
        actor: 'ENGINE'
      });
    }
  }
  
  /**
   * Revert strategy to defaults
   */
  private revertStrategy(): void {
    this.currentStatus = 'REVERTED';
    
    // Reset shaper to defaults
    this.shaper.updateConfig({
      default_variant: 'FULL',
      enable_auto_simplification: false
    });
    
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'ERROR',
      summary: `Shaping strategy REVERTED: ${this.consecutiveNegative} consecutive negative lifts`,
      details: {
        consecutive_negative: this.consecutiveNegative,
        action: 'Reverted to FULL variant, disabled auto-simplification'
      },
      actor: 'ENGINE'
    });
    
    // Reset counter
    this.consecutiveNegative = 0;
  }
  
  // ===========================================================================
  // REPORTING
  // ===========================================================================
  
  /**
   * Get lift report
   */
  public getReport(): LiftReport {
    const measurements = Array.from(this.measurements.values());
    const total = measurements.length;
    
    if (total === 0) {
      return this.createEmptyReport();
    }
    
    // Calculate totals
    const positiveLift = measurements.filter(m => m.lift_contribution > 0).length;
    const negativeLift = measurements.filter(m => m.lift_contribution < 0).length;
    const netLift = positiveLift - negativeLift;
    
    const totalValueRecovered = measurements.reduce((sum, m) => sum + m.value_recovered, 0);
    const totalValueLost = measurements.reduce((sum, m) => sum + m.value_lost, 0);
    
    // By variant
    const byVariant = this.calculateVariantStats(measurements);
    
    // Recent trend
    const recentMeasurements = measurements.slice(-10);
    const recentLift = recentMeasurements.reduce((sum, m) => sum + m.lift_contribution, 0);
    const recentTrend: LiftReport['recent_lift_trend'] = 
      recentLift > 2 ? 'IMPROVING' : recentLift < -2 ? 'DECLINING' : 'STABLE';
    
    // Strategy recommendation
    const recommendation = this.generateRecommendation(byVariant, this.currentStatus);
    
    return {
      generated_at: new Date().toISOString(),
      total_measurements: total,
      total_positive_lift: positiveLift,
      total_negative_lift: negativeLift,
      net_lift: netLift,
      lift_percent: total > 0 ? (netLift / total) * 100 : 0,
      total_value_recovered: totalValueRecovered,
      total_value_lost: totalValueLost,
      net_value_impact: totalValueRecovered - totalValueLost,
      by_variant: byVariant,
      current_strategy_status: this.currentStatus,
      consecutive_negative: this.consecutiveNegative,
      revert_threshold: this.REVERT_THRESHOLD,
      recent_lift_trend: recentTrend,
      strategy_recommendation: recommendation
    };
  }
  
  /**
   * Calculate stats per variant
   */
  private calculateVariantStats(
    measurements: LiftMeasurement[]
  ): Record<PresentationVariant, VariantLift> {
    const variants: PresentationVariant[] = ['FULL', 'TAX_FIRST', 'RISK_FIRST', 'SIMPLE', 'COMPARISON_ONLY'];
    const result: Record<PresentationVariant, VariantLift> = {} as any;
    
    for (const variant of variants) {
      const variantMeasurements = measurements.filter(m => m.variant === variant);
      const count = variantMeasurements.length;
      
      if (count === 0) {
        result[variant] = {
          variant,
          usage_count: 0,
          adoption_rate: 0,
          avg_lift: 0,
          total_value_impact: 0,
          is_effective: false
        };
        continue;
      }
      
      const adopted = variantMeasurements.filter(m => m.actual_outcome === 1).length;
      const totalLift = variantMeasurements.reduce((sum, m) => sum + m.lift_contribution, 0);
      const totalValue = variantMeasurements.reduce(
        (sum, m) => sum + m.value_recovered - m.value_lost, 0
      );
      
      result[variant] = {
        variant,
        usage_count: count,
        adoption_rate: adopted / count,
        avg_lift: totalLift / count,
        total_value_impact: totalValue,
        is_effective: totalLift > 0
      };
    }
    
    return result;
  }
  
  /**
   * Generate strategy recommendation
   */
  private generateRecommendation(
    byVariant: Record<PresentationVariant, VariantLift>,
    status: StrategyStatus
  ): string {
    if (status === 'REVERTED') {
      return 'Strategy reverted to defaults. Allow 10+ decisions before re-enabling shaping.';
    }
    
    if (status === 'DEGRADED') {
      return `Warning: ${this.consecutiveNegative} consecutive negative lifts. Consider reviewing variant selection logic.`;
    }
    
    // Find best performing variant
    const variantStats = Object.values(byVariant).filter(v => v.usage_count >= 3);
    if (variantStats.length === 0) {
      return 'Insufficient data. Continue collecting measurements.';
    }
    
    const best = variantStats.sort((a, b) => b.avg_lift - a.avg_lift)[0];
    const worst = variantStats.sort((a, b) => a.avg_lift - b.avg_lift)[0];
    
    if (best.avg_lift > 0.2) {
      return `${best.variant} is performing well (+${(best.avg_lift * 100).toFixed(0)}% lift). Consider increasing usage.`;
    }
    
    if (worst.avg_lift < -0.2 && worst.usage_count >= 5) {
      return `${worst.variant} has negative lift. Consider reducing or disabling.`;
    }
    
    return 'Strategy is stable. Continue monitoring.';
  }
  
  private createEmptyReport(): LiftReport {
    return {
      generated_at: new Date().toISOString(),
      total_measurements: 0,
      total_positive_lift: 0,
      total_negative_lift: 0,
      net_lift: 0,
      lift_percent: 0,
      total_value_recovered: 0,
      total_value_lost: 0,
      net_value_impact: 0,
      by_variant: {
        FULL: { variant: 'FULL', usage_count: 0, adoption_rate: 0, avg_lift: 0, total_value_impact: 0, is_effective: false },
        TAX_FIRST: { variant: 'TAX_FIRST', usage_count: 0, adoption_rate: 0, avg_lift: 0, total_value_impact: 0, is_effective: false },
        RISK_FIRST: { variant: 'RISK_FIRST', usage_count: 0, adoption_rate: 0, avg_lift: 0, total_value_impact: 0, is_effective: false },
        SIMPLE: { variant: 'SIMPLE', usage_count: 0, adoption_rate: 0, avg_lift: 0, total_value_impact: 0, is_effective: false },
        COMPARISON_ONLY: { variant: 'COMPARISON_ONLY', usage_count: 0, adoption_rate: 0, avg_lift: 0, total_value_impact: 0, is_effective: false }
      },
      current_strategy_status: this.currentStatus,
      consecutive_negative: this.consecutiveNegative,
      revert_threshold: this.REVERT_THRESHOLD,
      recent_lift_trend: 'STABLE',
      strategy_recommendation: 'No data yet. Start making shaped decisions.'
    };
  }
  
  // ===========================================================================
  // STATUS QUERIES
  // ===========================================================================
  
  /**
   * Get current strategy status
   */
  public getStatus(): StrategyStatus {
    return this.currentStatus;
  }
  
  /**
   * Check if shaping is active
   */
  public isShapingActive(): boolean {
    return this.currentStatus === 'ACTIVE';
  }
  
  /**
   * Get consecutive negative count
   */
  public getConsecutiveNegative(): number {
    return this.consecutiveNegative;
  }
  
  /**
   * Get baseline adoption rate
   */
  public getBaselineRate(): number {
    return this.baselineAdoptionRate;
  }
  
  /**
   * Manually restore strategy (after review)
   */
  public restoreStrategy(): void {
    this.currentStatus = 'ACTIVE';
    this.consecutiveNegative = 0;
    
    this.shaper.updateConfig({
      enable_auto_simplification: true
    });
    
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'INFO',
      summary: 'Shaping strategy manually restored',
      details: {},
      actor: 'USER'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getAdoptionLift = () => AdoptionLiftTracker.getInstance();
export default AdoptionLiftTracker;

