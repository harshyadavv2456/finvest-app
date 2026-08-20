/**
 * ExecutionSandbox - NO REAL MONEY Execution Layer
 * 
 * PHASE 22: Execution Sandbox
 * 
 * PURPOSE:
 * Prove FinVest decisions outperform user in reality
 * WITHOUT placing real trades.
 * 
 * RULES (NON-NEGOTIABLE):
 * - NO broker APIs allowed
 * - NO real money paths
 * - ALL intents are immutable
 * - Sandbox is ALWAYS ON
 * - FAIL CLOSED if snapshot/consequence/policy missing
 */

import { DecisionSnapshot, DecisionOutput } from '../core/DecisionSnapshot';
import { getSnapshotAuthority, SnapshotAuthority } from '../core/SnapshotAuthority';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { UserPolicy, userPolicy } from '../policy/UserPolicy';
import { getMarketTimeline } from '../core/MarketTimeline';
import { MarketEventFactory } from '../core/MarketEvent';

// =============================================================================
// TYPES
// =============================================================================

export type IntentAction = 'BUY' | 'SELL' | 'HOLD';
export type IntentStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

/**
 * IntentRecord - Immutable record of user's decision on a recommendation
 */
export interface IntentRecord {
  readonly id: string;
  readonly created_at: string;
  
  // Snapshot reference (MANDATORY)
  readonly snapshot_id: string;
  readonly recommendation_index: number;
  
  // Intent details
  readonly action: IntentAction;
  readonly symbol: string;
  readonly market: 'US' | 'IN';
  readonly quantity: number;
  
  // Price at intent time
  readonly price_at_intent: number;
  readonly value_at_intent: number;
  
  // User decision
  readonly status: IntentStatus;
  readonly user_decision_at: string;
  readonly user_reason?: string;
  
  // Policy reference
  readonly user_policy_id: string;
  readonly policy_snapshot: Partial<UserPolicy>;
  
  // Tracking fields (updated daily)
  current_price?: number;
  current_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_percent?: number;
  last_updated?: string;
  
  // Immutability marker
  readonly _frozen: true;
}

/**
 * IntentPerformance - Performance metrics for an intent
 */
export interface IntentPerformance {
  intent_id: string;
  symbol: string;
  
  // If followed
  value_if_followed: number;
  return_if_followed: number;
  tax_if_followed: number;
  after_tax_return_if_followed: number;
  
  // If not followed (actual)
  value_actual: number;
  return_actual: number;
  
  // Delta
  regret_amount: number;      // Positive = missed opportunity
  regret_percent: number;
  opportunity_cost: number;
  
  // Tracking
  days_since_intent: number;
  last_calculated: string;
}

/**
 * SandboxStats - Aggregate sandbox statistics
 */
export interface SandboxStats {
  total_intents: number;
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  
  // Performance
  total_regret: number;
  total_opportunity_cost: number;
  average_regret_percent: number;
  
  // Accuracy by confidence
  accuracy_by_confidence: {
    high: { correct: number; total: number; rate: number };     // 80-100
    medium: { correct: number; total: number; rate: number };   // 60-79
    low: { correct: number; total: number; rate: number };      // 0-59
  };
  
  // Portfolio comparison
  if_followed_value: number;
  actual_value: number;
  delta_value: number;
  delta_percent: number;
  
  // Time series available
  has_time_series: boolean;
  oldest_intent: string | null;
  newest_intent: string | null;
}

/**
 * SandboxGate - Gate check result
 */
export interface SandboxGate {
  allowed: boolean;
  reason: string;
  missing: string[];
}

// =============================================================================
// EXECUTION SANDBOX
// =============================================================================

/**
 * ExecutionSandbox
 * 
 * THE SANDBOX. No real money ever passes through.
 * All intents are tracked and compared against reality.
 */
export class ExecutionSandbox {
  private static instance: ExecutionSandbox;
  private intents: Map<string, IntentRecord> = new Map();
  private performances: Map<string, IntentPerformance> = new Map();
  private snapshotAuthority: SnapshotAuthority;
  private auditLog: DecisionAuditLog;
  private userPolicyManager: UserPolicy;
  private timeline = getMarketTimeline();
  
  // SANDBOX IS ALWAYS ON
  private readonly SANDBOX_ENABLED: true = true;
  
  private constructor() {
    this.snapshotAuthority = getSnapshotAuthority();
    this.auditLog = DecisionAuditLog.getInstance();
    this.userPolicyManager = UserPolicy.getInstance();
    
    this.loadFromStorage();
  }
  
  public static getInstance(): ExecutionSandbox {
    if (!ExecutionSandbox.instance) {
      ExecutionSandbox.instance = new ExecutionSandbox();
    }
    return ExecutionSandbox.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const storedIntents = localStorage.getItem('finvest_sandbox_intents');
      if (storedIntents) {
        const parsed = JSON.parse(storedIntents);
        for (const [id, intent] of Object.entries(parsed)) {
          this.intents.set(id, intent as IntentRecord);
        }
      }
      
      const storedPerf = localStorage.getItem('finvest_sandbox_performance');
      if (storedPerf) {
        const parsed = JSON.parse(storedPerf);
        for (const [id, perf] of Object.entries(parsed)) {
          this.performances.set(id, perf as IntentPerformance);
        }
      }
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to load sandbox from storage',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  private saveToStorage(): void {
    try {
      const intentStore: Record<string, IntentRecord> = {};
      for (const [id, intent] of this.intents) {
        intentStore[id] = intent;
      }
      localStorage.setItem('finvest_sandbox_intents', JSON.stringify(intentStore));
      
      const perfStore: Record<string, IntentPerformance> = {};
      for (const [id, perf] of this.performances) {
        perfStore[id] = perf;
      }
      localStorage.setItem('finvest_sandbox_performance', JSON.stringify(perfStore));
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to save sandbox to storage',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  // ===========================================================================
  // GATE CHECK - FAIL CLOSED
  // ===========================================================================
  
  /**
   * Check if sandbox can proceed
   * FAIL CLOSED if anything is missing
   */
  public checkGate(snapshotId: string): SandboxGate {
    const missing: string[] = [];
    
    // Check 1: Snapshot must exist and be valid
    const snapshotGate = this.snapshotAuthority.checkRenderGate(snapshotId);
    if (!snapshotGate.allowed) {
      missing.push(`Snapshot: ${snapshotGate.reason}`);
    }
    
    // Check 2: Policy must exist
    try {
      const policy = this.userPolicyManager.getPolicy();
      if (!policy) {
        missing.push('User policy not configured');
      }
    } catch (e) {
      missing.push('User policy unavailable');
    }
    
    // Check 3: Sandbox must be enabled (always is)
    if (!this.SANDBOX_ENABLED) {
      missing.push('Sandbox is disabled');
    }
    
    if (missing.length > 0) {
      this.auditLog.log({
        event_type: 'EXECUTION_BLOCKED',
        severity: 'WARNING',
        summary: `Sandbox gate blocked: ${missing.length} requirements missing`,
        details: { snapshot_id: snapshotId, missing },
        actor: 'ENGINE'
      });
      
      return {
        allowed: false,
        reason: `Cannot proceed: ${missing.join('; ')}`,
        missing
      };
    }
    
    return {
      allowed: true,
      reason: 'All requirements met',
      missing: []
    };
  }
  
  // ===========================================================================
  // INTENT CREATION
  // ===========================================================================
  
  /**
   * User APPROVES a recommendation
   */
  public approveIntent(
    snapshot: DecisionSnapshot,
    recommendationIndex: number,
    currentPrice: number,
    reason?: string
  ): { success: boolean; intent?: IntentRecord; error?: string } {
    return this.createIntent(snapshot, recommendationIndex, currentPrice, 'APPROVED', reason);
  }
  
  /**
   * User REJECTS a recommendation
   */
  public rejectIntent(
    snapshot: DecisionSnapshot,
    recommendationIndex: number,
    currentPrice: number,
    reason?: string
  ): { success: boolean; intent?: IntentRecord; error?: string } {
    return this.createIntent(snapshot, recommendationIndex, currentPrice, 'REJECTED', reason);
  }
  
  /**
   * Create an intent record
   */
  private createIntent(
    snapshot: DecisionSnapshot,
    recommendationIndex: number,
    currentPrice: number,
    status: IntentStatus,
    reason?: string
  ): { success: boolean; intent?: IntentRecord; error?: string } {
    // GATE CHECK
    const gate = this.checkGate(snapshot.id);
    if (!gate.allowed) {
      return { success: false, error: gate.reason };
    }
    
    // Get recommendation
    const recommendation = snapshot.outputs[recommendationIndex];
    if (!recommendation) {
      return { 
        success: false, 
        error: `Recommendation at index ${recommendationIndex} not found` 
      };
    }
    
    // Get policy
    const policy = this.userPolicyManager.getPolicy();
    
    // Calculate values
    const quantity = recommendation.quantity || 1;
    const value = currentPrice * quantity;
    
    // Create immutable intent
    const now = new Date().toISOString();
    const id = `INTENT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const intent: IntentRecord = Object.freeze({
      id,
      created_at: now,
      snapshot_id: snapshot.id,
      recommendation_index: recommendationIndex,
      action: recommendation.action as IntentAction,
      symbol: recommendation.symbol || 'UNKNOWN',
      market: this.detectMarket(recommendation.symbol || ''),
      quantity,
      price_at_intent: currentPrice,
      value_at_intent: value,
      status,
      user_decision_at: now,
      user_reason: reason,
      user_policy_id: `POLICY-${now}`,
      policy_snapshot: {
        risk_tolerance: policy.risk_tolerance,
        tax_preference: policy.tax_preference,
        holding_bias: policy.holding_bias
      },
      current_price: currentPrice,
      current_value: value,
      unrealized_pnl: 0,
      unrealized_pnl_percent: 0,
      last_updated: now,
      _frozen: true
    });
    
    // Store
    this.intents.set(id, intent);
    this.saveToStorage();
    
    // Add to timeline
    this.timeline.addEvent(
      MarketEventFactory.portfolioAction(
        intent.symbol,
        intent.market,
        `${status}: ${intent.action} ${intent.quantity} @ ${currentPrice.toFixed(2)}`,
        { intent_id: id, status, action: intent.action },
        snapshot.id
      )
    );
    
    // Audit log
    this.auditLog.log({
      event_type: status === 'APPROVED' ? 'USER_CONFIRMATION' : 'USER_REJECTION',
      severity: 'INFO',
      summary: `User ${status} intent: ${intent.action} ${intent.symbol}`,
      details: {
        intent_id: id,
        snapshot_id: snapshot.id,
        action: intent.action,
        symbol: intent.symbol,
        quantity: intent.quantity,
        price: currentPrice,
        status,
        reason
      },
      actor: 'USER'
    });
    
    return { success: true, intent };
  }
  
  // ===========================================================================
  // DAILY CONSEQUENCE TRACKING
  // ===========================================================================
  
  /**
   * Update all intents with current prices
   * Call this daily (or when prices update)
   */
  public updateAllIntents(currentPrices: Map<string, number>): void {
    const now = new Date().toISOString();
    const updates: string[] = [];
    
    for (const [id, intent] of this.intents) {
      const currentPrice = currentPrices.get(intent.symbol);
      if (!currentPrice) continue;
      
      // Calculate performance
      const currentValue = currentPrice * intent.quantity;
      const unrealizedPnl = currentValue - intent.value_at_intent;
      const unrealizedPnlPercent = (unrealizedPnl / intent.value_at_intent) * 100;
      
      // Update intent (create new frozen object)
      const updatedIntent: IntentRecord = Object.freeze({
        ...intent,
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent: unrealizedPnlPercent,
        last_updated: now
      });
      
      this.intents.set(id, updatedIntent);
      
      // Update performance
      this.updatePerformance(updatedIntent);
      
      updates.push(intent.symbol);
    }
    
    if (updates.length > 0) {
      this.saveToStorage();
      
      this.auditLog.log({
        event_type: 'PRICE_UPDATE',
        severity: 'INFO',
        summary: `Sandbox updated ${updates.length} intents`,
        details: { symbols: updates, timestamp: now },
        actor: 'ENGINE'
      });
    }
  }
  
  /**
   * Update performance metrics for an intent
   */
  private updatePerformance(intent: IntentRecord): void {
    const daysSinceIntent = Math.floor(
      (Date.now() - new Date(intent.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Calculate if-followed values
    let valueIfFollowed: number;
    let returnIfFollowed: number;
    
    if (intent.status === 'APPROVED') {
      // User followed the advice
      valueIfFollowed = intent.current_value || intent.value_at_intent;
      returnIfFollowed = intent.unrealized_pnl_percent || 0;
    } else {
      // User rejected - if they had followed, what would have happened?
      if (intent.action === 'BUY') {
        // If we recommended BUY and they rejected, the "if followed" would be current value
        valueIfFollowed = intent.current_value || intent.value_at_intent;
        returnIfFollowed = intent.unrealized_pnl_percent || 0;
      } else {
        // If we recommended SELL and they rejected, they still hold
        // The "if followed" would be original value (they sold)
        valueIfFollowed = intent.value_at_intent;
        returnIfFollowed = 0;
      }
    }
    
    // Calculate actual values
    let valueActual: number;
    let returnActual: number;
    
    if (intent.status === 'APPROVED') {
      valueActual = intent.current_value || intent.value_at_intent;
      returnActual = intent.unrealized_pnl_percent || 0;
    } else {
      // User rejected, so opposite happened
      if (intent.action === 'BUY') {
        // Didn't buy, so no position
        valueActual = 0;
        returnActual = 0;
      } else {
        // Didn't sell, so still holds
        valueActual = intent.current_value || intent.value_at_intent;
        returnActual = intent.unrealized_pnl_percent || 0;
      }
    }
    
    // Calculate regret
    const regretAmount = valueIfFollowed - valueActual;
    const regretPercent = intent.value_at_intent > 0 
      ? (regretAmount / intent.value_at_intent) * 100 
      : 0;
    
    // Opportunity cost (for rejected recommendations)
    const opportunityCost = intent.status === 'REJECTED' 
      ? Math.max(0, valueIfFollowed - intent.value_at_intent)
      : 0;
    
    // Estimate tax (simplified)
    const taxRate = daysSinceIntent >= 365 ? 0.10 : 0.15; // LTCG vs STCG
    const gainIfFollowed = Math.max(0, valueIfFollowed - intent.value_at_intent);
    const taxIfFollowed = gainIfFollowed * taxRate;
    const afterTaxReturnIfFollowed = returnIfFollowed * (1 - taxRate);
    
    const performance: IntentPerformance = {
      intent_id: intent.id,
      symbol: intent.symbol,
      value_if_followed: valueIfFollowed,
      return_if_followed: returnIfFollowed,
      tax_if_followed: taxIfFollowed,
      after_tax_return_if_followed: afterTaxReturnIfFollowed,
      value_actual: valueActual,
      return_actual: returnActual,
      regret_amount: regretAmount,
      regret_percent: regretPercent,
      opportunity_cost: opportunityCost,
      days_since_intent: daysSinceIntent,
      last_calculated: new Date().toISOString()
    };
    
    this.performances.set(intent.id, performance);
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  /**
   * Get sandbox statistics
   */
  public getStats(): SandboxStats {
    const intents = Array.from(this.intents.values());
    const performances = Array.from(this.performances.values());
    
    // Counts
    const approved = intents.filter(i => i.status === 'APPROVED');
    const rejected = intents.filter(i => i.status === 'REJECTED');
    const pending = intents.filter(i => i.status === 'PENDING');
    
    // Totals
    const totalRegret = performances.reduce((sum, p) => sum + p.regret_amount, 0);
    const totalOpportunityCost = performances.reduce((sum, p) => sum + p.opportunity_cost, 0);
    const avgRegretPercent = performances.length > 0
      ? performances.reduce((sum, p) => sum + p.regret_percent, 0) / performances.length
      : 0;
    
    // Portfolio values
    const ifFollowedValue = performances.reduce((sum, p) => sum + p.value_if_followed, 0);
    const actualValue = performances.reduce((sum, p) => sum + p.value_actual, 0);
    
    // Accuracy by confidence bucket
    const accuracyByConfidence = this.calculateAccuracyByConfidence();
    
    // Time series info
    const sortedByTime = intents.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    return {
      total_intents: intents.length,
      approved_count: approved.length,
      rejected_count: rejected.length,
      pending_count: pending.length,
      total_regret: totalRegret,
      total_opportunity_cost: totalOpportunityCost,
      average_regret_percent: avgRegretPercent,
      accuracy_by_confidence: accuracyByConfidence,
      if_followed_value: ifFollowedValue,
      actual_value: actualValue,
      delta_value: ifFollowedValue - actualValue,
      delta_percent: actualValue > 0 ? ((ifFollowedValue - actualValue) / actualValue) * 100 : 0,
      has_time_series: intents.length > 0,
      oldest_intent: sortedByTime[0]?.created_at || null,
      newest_intent: sortedByTime[sortedByTime.length - 1]?.created_at || null
    };
  }
  
  /**
   * Calculate accuracy by confidence bucket
   */
  private calculateAccuracyByConfidence(): SandboxStats['accuracy_by_confidence'] {
    const result = {
      high: { correct: 0, total: 0, rate: 0 },
      medium: { correct: 0, total: 0, rate: 0 },
      low: { correct: 0, total: 0, rate: 0 }
    };
    
    for (const [intentId, perf] of this.performances) {
      const intent = this.intents.get(intentId);
      if (!intent) continue;
      
      // Get confidence from snapshot (would need to look up)
      // For now, use a simplified approach based on regret
      const isCorrect = perf.regret_amount >= 0; // FinVest was right if regret >= 0
      
      // Estimate confidence bucket from return magnitude
      const absReturn = Math.abs(perf.return_if_followed);
      let bucket: 'high' | 'medium' | 'low';
      if (absReturn >= 15) {
        bucket = 'high';
      } else if (absReturn >= 5) {
        bucket = 'medium';
      } else {
        bucket = 'low';
      }
      
      result[bucket].total++;
      if (isCorrect) {
        result[bucket].correct++;
      }
    }
    
    // Calculate rates
    for (const bucket of ['high', 'medium', 'low'] as const) {
      if (result[bucket].total > 0) {
        result[bucket].rate = result[bucket].correct / result[bucket].total;
      }
    }
    
    return result;
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get all intents
   */
  public getIntents(): IntentRecord[] {
    return Array.from(this.intents.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Get intents by symbol
   */
  public getIntentsBySymbol(symbol: string): IntentRecord[] {
    return Array.from(this.intents.values())
      .filter(i => i.symbol === symbol)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Get intent by ID
   */
  public getIntent(id: string): IntentRecord | null {
    return this.intents.get(id) || null;
  }
  
  /**
   * Get performance by intent ID
   */
  public getPerformance(intentId: string): IntentPerformance | null {
    return this.performances.get(intentId) || null;
  }
  
  /**
   * Get rejected intents with positive regret (missed opportunities)
   */
  public getMissedOpportunities(): Array<{ intent: IntentRecord; performance: IntentPerformance }> {
    const result: Array<{ intent: IntentRecord; performance: IntentPerformance }> = [];
    
    for (const [intentId, perf] of this.performances) {
      if (perf.regret_amount > 0 && perf.opportunity_cost > 0) {
        const intent = this.intents.get(intentId);
        if (intent && intent.status === 'REJECTED') {
          result.push({ intent, performance: perf });
        }
      }
    }
    
    return result.sort((a, b) => b.performance.regret_amount - a.performance.regret_amount);
  }
  
  /**
   * Get decisions where user was right to reject
   */
  public getUserWins(): Array<{ intent: IntentRecord; performance: IntentPerformance }> {
    const result: Array<{ intent: IntentRecord; performance: IntentPerformance }> = [];
    
    for (const [intentId, perf] of this.performances) {
      if (perf.regret_amount < 0) {
        const intent = this.intents.get(intentId);
        if (intent && intent.status === 'REJECTED') {
          result.push({ intent, performance: perf });
        }
      }
    }
    
    return result.sort((a, b) => a.performance.regret_amount - b.performance.regret_amount);
  }
  
  // ===========================================================================
  // FINBOT INTEGRATION HELPERS
  // ===========================================================================
  
  /**
   * Get data for "What if I had followed you?" query
   */
  public getFollowedComparison(): {
    total_recommendations: number;
    followed_count: number;
    rejected_count: number;
    if_followed_all_value: number;
    actual_value: number;
    missed_gains: number;
    avoided_losses: number;
  } {
    const stats = this.getStats();
    const missed = this.getMissedOpportunities();
    const userWins = this.getUserWins();
    
    const missedGains = missed.reduce((sum, m) => sum + m.performance.opportunity_cost, 0);
    const avoidedLosses = userWins.reduce((sum, w) => sum + Math.abs(w.performance.regret_amount), 0);
    
    return {
      total_recommendations: stats.total_intents,
      followed_count: stats.approved_count,
      rejected_count: stats.rejected_count,
      if_followed_all_value: stats.if_followed_value,
      actual_value: stats.actual_value,
      missed_gains: missedGains,
      avoided_losses: avoidedLosses
    };
  }
  
  /**
   * Get data for "Which decisions hurt me?" query
   */
  public getHurtfulDecisions(): Array<{
    symbol: string;
    action_recommended: IntentAction;
    user_decision: IntentStatus;
    regret_amount: number;
    regret_percent: number;
    reason: string;
  }> {
    const missed = this.getMissedOpportunities();
    
    return missed.slice(0, 10).map(({ intent, performance }) => ({
      symbol: intent.symbol,
      action_recommended: intent.action,
      user_decision: intent.status,
      regret_amount: performance.regret_amount,
      regret_percent: performance.regret_percent,
      reason: intent.action === 'BUY' 
        ? `Missed ${performance.return_if_followed.toFixed(1)}% gain by not buying`
        : `Lost ${Math.abs(performance.return_actual).toFixed(1)}% by not selling`
    }));
  }
  
  /**
   * Get data for "Where was I wrong ignoring you?" query
   */
  public getWrongIgnores(): Array<{
    symbol: string;
    ignored_action: IntentAction;
    opportunity_cost: number;
    current_outcome: string;
    what_would_have_been: string;
  }> {
    const missed = this.getMissedOpportunities();
    
    return missed.slice(0, 10).map(({ intent, performance }) => ({
      symbol: intent.symbol,
      ignored_action: intent.action,
      opportunity_cost: performance.opportunity_cost,
      current_outcome: `${performance.return_actual >= 0 ? '+' : ''}${performance.return_actual.toFixed(1)}%`,
      what_would_have_been: `${performance.return_if_followed >= 0 ? '+' : ''}${performance.return_if_followed.toFixed(1)}%`
    }));
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private detectMarket(symbol: string): 'US' | 'IN' {
    if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
      return 'IN';
    }
    return 'US';
  }
  
  /**
   * Check if sandbox is enabled (always true)
   */
  public isEnabled(): boolean {
    return this.SANDBOX_ENABLED;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getExecutionSandbox = () => ExecutionSandbox.getInstance();
export default ExecutionSandbox;

