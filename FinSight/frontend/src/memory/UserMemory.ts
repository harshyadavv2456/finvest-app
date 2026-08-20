/**
 * UserMemory - User Behavior and Outcome Tracking
 * 
 * PHASE 19: User Memory Engine
 * 
 * RULES (NON-NEGOTIABLE):
 * - Track: advice_shown, advice_ignored, advice_accepted, outcome_quality
 * - FinBot must consult UserMemory before responding
 * - If advice was ignored 3x → downgrade confidence
 * - If advice historically worked → increase clarity, NOT confidence
 * - NO ML. Deterministic scoring only.
 * - All memory has audit trail
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export type AdviceResponse = 'ACCEPTED' | 'IGNORED' | 'REJECTED' | 'PARTIAL';

export type OutcomeQuality = 
  | 'BETTER_THAN_BASELINE'    // Following advice beat not following
  | 'SAME_AS_BASELINE'        // No significant difference
  | 'WORSE_THAN_BASELINE'     // Not following would have been better
  | 'PENDING';                // Outcome not yet determined

export interface AdviceRecord {
  id: string;
  snapshot_id: string;        // Reference to DecisionSnapshot
  symbol: string;
  advice_type: string;        // BUY, SELL, HOLD, etc.
  advice_given_at: string;
  advice_response: AdviceResponse;
  response_at?: string;
  
  // Outcome tracking
  outcome_quality: OutcomeQuality;
  outcome_measured_at?: string;
  
  // Values for outcome calculation
  price_at_advice: number;
  price_at_response?: number;
  price_at_outcome?: number;
  
  // Deltas
  return_if_followed?: number;   // What return if advice was followed
  return_actual?: number;        // What user actually got
  delta_vs_baseline?: number;    // Difference
}

export interface UserBehaviorStats {
  total_advice_shown: number;
  total_accepted: number;
  total_ignored: number;
  total_rejected: number;
  acceptance_rate: number;       // 0-1
  
  // Outcome stats
  outcomes_measured: number;
  outcomes_better: number;
  outcomes_same: number;
  outcomes_worse: number;
  success_rate: number;          // 0-1
  
  // Per-symbol stats
  symbol_stats: Map<string, {
    shown: number;
    accepted: number;
    ignored: number;
    success_rate: number;
  }>;
  
  // Confidence modifiers (deterministic)
  confidence_modifier: number;   // -20 to +10 (never inflate)
  clarity_modifier: number;      // 0 to 2 (multiplier for explanation detail)
}

export interface MemoryInsight {
  type: 'CONFIDENCE_DOWNGRADE' | 'CLARITY_BOOST' | 'SYMBOL_PATTERN' | 'BEHAVIOR_TREND';
  message: string;
  data: Record<string, any>;
  applies_to?: string[];        // Symbols this insight applies to
}

// =============================================================================
// USER MEMORY ENGINE
// =============================================================================

export class UserMemory {
  private static instance: UserMemory;
  private records: Map<string, AdviceRecord> = new Map();
  private auditLog: DecisionAuditLog;
  
  // Thresholds (deterministic, no ML)
  private readonly IGNORE_THRESHOLD = 3;           // Ignored 3x → downgrade
  private readonly SUCCESS_CLARITY_BOOST = 0.7;    // >70% success → more detail
  private readonly MIN_RECORDS_FOR_STATS = 5;      // Need 5+ records for stats
  
  private constructor() {
    this.auditLog = DecisionAuditLog.getInstance();
    this.loadFromStorage();
  }
  
  public static getInstance(): UserMemory {
    if (!UserMemory.instance) {
      UserMemory.instance = new UserMemory();
    }
    return UserMemory.instance;
  }
  
  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_user_memory');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, record] of Object.entries(parsed)) {
          this.records.set(id, record as AdviceRecord);
        }
      }
    } catch (e) {
      console.error('Failed to load user memory:', e);
    }
  }
  
  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    try {
      const toStore: Record<string, AdviceRecord> = {};
      // Keep last 500 records
      const recent = Array.from(this.records.values())
        .sort((a, b) => new Date(b.advice_given_at).getTime() - new Date(a.advice_given_at).getTime())
        .slice(0, 500);
      
      for (const record of recent) {
        toStore[record.id] = record;
      }
      
      localStorage.setItem('finvest_user_memory', JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save user memory:', e);
    }
  }
  
  /**
   * Record advice shown to user
   */
  public recordAdviceShown(
    snapshotId: string,
    symbol: string,
    adviceType: string,
    priceAtAdvice: number
  ): string {
    const id = `ADV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const record: AdviceRecord = {
      id,
      snapshot_id: snapshotId,
      symbol,
      advice_type: adviceType,
      advice_given_at: new Date().toISOString(),
      advice_response: 'IGNORED',  // Default to ignored until updated
      outcome_quality: 'PENDING',
      price_at_advice: priceAtAdvice
    };
    
    this.records.set(id, record);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'SYSTEM_ERROR',  // Using available type
      severity: 'INFO',
      summary: `Advice shown: ${adviceType} ${symbol}`,
      details: { record_id: id, snapshot_id: snapshotId, symbol, advice_type: adviceType },
      actor: 'SYSTEM'
    });
    
    return id;
  }
  
  /**
   * Record user response to advice
   */
  public recordResponse(
    recordId: string,
    response: AdviceResponse,
    priceAtResponse: number
  ): void {
    const record = this.records.get(recordId);
    if (!record) {
      console.warn(`Advice record ${recordId} not found`);
      return;
    }
    
    const updated: AdviceRecord = {
      ...record,
      advice_response: response,
      response_at: new Date().toISOString(),
      price_at_response: priceAtResponse
    };
    
    this.records.set(recordId, updated);
    this.saveToStorage();
    
    // Log to audit
    if (response === 'ACCEPTED') {
      this.auditLog.logUserConfirmation({
        action: record.advice_type,
        symbol: record.symbol,
        quantity: 0,
        recommendation_id: recordId
      });
    } else if (response === 'REJECTED') {
      this.auditLog.logUserRejection({
        action: record.advice_type,
        symbol: record.symbol,
        reason: 'User rejected advice',
        recommendation_id: recordId
      });
    }
  }
  
  /**
   * Record outcome (called later when we can measure result)
   */
  public recordOutcome(
    recordId: string,
    priceAtOutcome: number
  ): void {
    const record = this.records.get(recordId);
    if (!record) {
      console.warn(`Advice record ${recordId} not found`);
      return;
    }
    
    // Calculate returns
    const returnIfFollowed = this.calculateReturnIfFollowed(record, priceAtOutcome);
    const returnActual = this.calculateActualReturn(record, priceAtOutcome);
    const delta = returnIfFollowed - returnActual;
    
    // Determine outcome quality
    let outcomeQuality: OutcomeQuality;
    if (Math.abs(delta) < 0.01) {  // <1% difference
      outcomeQuality = 'SAME_AS_BASELINE';
    } else if (delta > 0) {
      outcomeQuality = 'BETTER_THAN_BASELINE';
    } else {
      outcomeQuality = 'WORSE_THAN_BASELINE';
    }
    
    const updated: AdviceRecord = {
      ...record,
      outcome_quality: outcomeQuality,
      outcome_measured_at: new Date().toISOString(),
      price_at_outcome: priceAtOutcome,
      return_if_followed: returnIfFollowed,
      return_actual: returnActual,
      delta_vs_baseline: delta
    };
    
    this.records.set(recordId, updated);
    this.saveToStorage();
  }
  
  /**
   * Calculate return if advice was followed
   */
  private calculateReturnIfFollowed(record: AdviceRecord, currentPrice: number): number {
    const basePrice = record.price_at_advice;
    if (basePrice <= 0) return 0;
    
    // If advice was BUY, return is (current - advice_price) / advice_price
    // If advice was SELL, return is (advice_price - current) / advice_price
    if (record.advice_type === 'BUY' || record.advice_type === 'INITIATE') {
      return (currentPrice - basePrice) / basePrice;
    } else if (record.advice_type === 'SELL' || record.advice_type === 'EXIT') {
      return (basePrice - currentPrice) / basePrice;
    }
    return 0;
  }
  
  /**
   * Calculate actual return based on user's action
   */
  private calculateActualReturn(record: AdviceRecord, currentPrice: number): number {
    const basePrice = record.price_at_response || record.price_at_advice;
    if (basePrice <= 0) return 0;
    
    // If user accepted, same as follow advice
    if (record.advice_response === 'ACCEPTED') {
      return this.calculateReturnIfFollowed(record, currentPrice);
    }
    
    // If user ignored/rejected, they held (for BUY advice) or didn't sell (for SELL advice)
    if (record.advice_type === 'BUY' || record.advice_type === 'INITIATE') {
      // User didn't buy, so their return is 0 (they didn't participate)
      return 0;
    } else if (record.advice_type === 'SELL' || record.advice_type === 'EXIT') {
      // User didn't sell, so their return is market move
      return (currentPrice - basePrice) / basePrice;
    }
    
    return 0;
  }
  
  /**
   * Get user behavior statistics
   */
  public getStats(): UserBehaviorStats {
    const records = Array.from(this.records.values());
    
    // Basic counts
    const total = records.length;
    const accepted = records.filter(r => r.advice_response === 'ACCEPTED').length;
    const ignored = records.filter(r => r.advice_response === 'IGNORED').length;
    const rejected = records.filter(r => r.advice_response === 'REJECTED').length;
    
    // Outcome counts
    const withOutcome = records.filter(r => r.outcome_quality !== 'PENDING');
    const better = withOutcome.filter(r => r.outcome_quality === 'BETTER_THAN_BASELINE').length;
    const same = withOutcome.filter(r => r.outcome_quality === 'SAME_AS_BASELINE').length;
    const worse = withOutcome.filter(r => r.outcome_quality === 'WORSE_THAN_BASELINE').length;
    
    // Per-symbol stats
    const symbolStats = new Map<string, { shown: number; accepted: number; ignored: number; success_rate: number }>();
    const symbolGroups = new Map<string, AdviceRecord[]>();
    
    for (const record of records) {
      const existing = symbolGroups.get(record.symbol) || [];
      existing.push(record);
      symbolGroups.set(record.symbol, existing);
    }
    
    for (const [symbol, symbolRecords] of symbolGroups) {
      const sAccepted = symbolRecords.filter(r => r.advice_response === 'ACCEPTED').length;
      const sIgnored = symbolRecords.filter(r => r.advice_response === 'IGNORED').length;
      const sWithOutcome = symbolRecords.filter(r => r.outcome_quality !== 'PENDING');
      const sBetter = sWithOutcome.filter(r => r.outcome_quality === 'BETTER_THAN_BASELINE').length;
      
      symbolStats.set(symbol, {
        shown: symbolRecords.length,
        accepted: sAccepted,
        ignored: sIgnored,
        success_rate: sWithOutcome.length > 0 ? sBetter / sWithOutcome.length : 0
      });
    }
    
    // Calculate modifiers (DETERMINISTIC)
    let confidenceModifier = 0;
    let clarityModifier = 1;
    
    // If ignored 3+ times recently, downgrade confidence
    const recentIgnored = records
      .filter(r => r.advice_response === 'IGNORED')
      .sort((a, b) => new Date(b.advice_given_at).getTime() - new Date(a.advice_given_at).getTime())
      .slice(0, 10);
    
    if (recentIgnored.length >= this.IGNORE_THRESHOLD) {
      confidenceModifier = -10 * Math.min(recentIgnored.length / 5, 2);  // Max -20
    }
    
    // If high success rate, increase clarity (not confidence!)
    const successRate = withOutcome.length > 0 ? better / withOutcome.length : 0;
    if (withOutcome.length >= this.MIN_RECORDS_FOR_STATS && successRate > this.SUCCESS_CLARITY_BOOST) {
      clarityModifier = 1.5;  // More detailed explanations
    }
    
    return {
      total_advice_shown: total,
      total_accepted: accepted,
      total_ignored: ignored,
      total_rejected: rejected,
      acceptance_rate: total > 0 ? accepted / total : 0,
      outcomes_measured: withOutcome.length,
      outcomes_better: better,
      outcomes_same: same,
      outcomes_worse: worse,
      success_rate: successRate,
      symbol_stats: symbolStats,
      confidence_modifier: confidenceModifier,
      clarity_modifier: clarityModifier
    };
  }
  
  /**
   * Get insights based on user behavior (for FinBot to use)
   */
  public getInsights(): MemoryInsight[] {
    const insights: MemoryInsight[] = [];
    const stats = this.getStats();
    
    // Confidence downgrade insight
    if (stats.confidence_modifier < 0) {
      insights.push({
        type: 'CONFIDENCE_DOWNGRADE',
        message: `Based on your history of not following advice (${stats.total_ignored} ignored), confidence in recommendations is adjusted by ${stats.confidence_modifier}%`,
        data: { modifier: stats.confidence_modifier, ignored_count: stats.total_ignored }
      });
    }
    
    // Clarity boost insight
    if (stats.clarity_modifier > 1) {
      insights.push({
        type: 'CLARITY_BOOST',
        message: `Your high success rate (${(stats.success_rate * 100).toFixed(0)}%) when following advice enables more detailed recommendations`,
        data: { modifier: stats.clarity_modifier, success_rate: stats.success_rate }
      });
    }
    
    // Symbol-specific patterns
    for (const [symbol, symbolStat] of stats.symbol_stats) {
      if (symbolStat.ignored >= 2 && symbolStat.shown >= 3) {
        insights.push({
          type: 'SYMBOL_PATTERN',
          message: `You tend to ignore advice for ${symbol} (${symbolStat.ignored}/${symbolStat.shown} times)`,
          data: { symbol, ...symbolStat },
          applies_to: [symbol]
        });
      }
    }
    
    // Behavior trends
    if (stats.acceptance_rate < 0.3 && stats.total_advice_shown >= 5) {
      insights.push({
        type: 'BEHAVIOR_TREND',
        message: `You accept only ${(stats.acceptance_rate * 100).toFixed(0)}% of recommendations. Consider if the advice criteria match your goals.`,
        data: { acceptance_rate: stats.acceptance_rate }
      });
    }
    
    return insights;
  }
  
  /**
   * Should be called before FinBot responds
   * Returns adjusted confidence and clarity multiplier
   */
  public getResponseModifiers(symbol?: string): { 
    confidence_adjustment: number; 
    clarity_multiplier: number;
    warnings: string[];
  } {
    const stats = this.getStats();
    const warnings: string[] = [];
    
    let confidenceAdjustment = stats.confidence_modifier;
    let clarityMultiplier = stats.clarity_modifier;
    
    // Symbol-specific adjustment
    if (symbol) {
      const symbolStat = stats.symbol_stats.get(symbol);
      if (symbolStat && symbolStat.ignored >= 2) {
        warnings.push(`Note: You've previously ignored ${symbolStat.ignored} recommendations for ${symbol}`);
      }
      if (symbolStat && symbolStat.success_rate > 0.8 && symbolStat.shown >= 3) {
        warnings.push(`Historical advice for ${symbol} has been ${(symbolStat.success_rate * 100).toFixed(0)}% accurate when followed`);
      }
    }
    
    return {
      confidence_adjustment: confidenceAdjustment,
      clarity_multiplier: clarityMultiplier,
      warnings
    };
  }
  
  /**
   * Get pending outcomes that need measurement
   */
  public getPendingOutcomes(): AdviceRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.outcome_quality === 'PENDING' && r.response_at)
      .sort((a, b) => new Date(a.advice_given_at).getTime() - new Date(b.advice_given_at).getTime());
  }
}

// Export singleton getter
export const getUserMemory = () => UserMemory.getInstance();

export default UserMemory;

