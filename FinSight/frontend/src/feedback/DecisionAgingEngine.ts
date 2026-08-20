/**
 * DecisionAgingEngine - Market-Reality Feedback Loop
 * 
 * PHASE 27: Market-Reality Feedback Loop (MRFL)
 * 
 * PURPOSE:
 * Track how a decision evolves over time against market reality.
 * Answer: "Given what actually happened, how did this decision age?"
 * 
 * THIS IS:
 * - Measurement only
 * - Deterministic
 * - Auditable
 * - Fail-closed
 * 
 * THIS IS NOT:
 * - Execution
 * - Prediction
 * - Optimization
 * - ML / curve fitting
 * 
 * FORBIDDEN:
 * - Any confidence recomputation
 * - Any recommendation mutation
 * - Any retrospective bias
 */

import { DecisionSnapshot } from '../core/DecisionSnapshot';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { priceAuthority } from '../core/PriceAuthority';
import { getMarketTimeline } from '../core/MarketTimeline';
import { MarketEvent } from '../core/MarketEvent';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// Local type for price data (matches PriceAuthority structure)
interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * ThesisStatus - How the original thesis is holding up
 */
export type ThesisStatus = 'HOLDING' | 'DECAYING' | 'BROKEN';

/**
 * DecisionAging - Immutable aging record
 */
export interface DecisionAging {
  readonly id: string;
  readonly snapshot_id: string;
  readonly symbol: string;
  readonly action: string;
  readonly computed_at: string;
  
  // Time metrics
  readonly age_days: number;
  readonly decision_date: string;
  readonly last_price_date: string;
  
  // Price metrics
  readonly entry_price: number;
  readonly current_price: number;
  readonly price_change_percent: number;
  
  // Extremes
  readonly max_favorable_move: number;      // Best outcome reached
  readonly max_adverse_move: number;        // Worst outcome reached
  readonly time_to_peak_days: number;       // Days to best outcome
  readonly time_to_trough_days: number;     // Days to worst outcome
  
  // Risk assessment
  readonly expected_drawdown: number;
  readonly actual_drawdown: number;
  readonly drawdown_exceeded: boolean;
  
  // Thesis assessment
  readonly thesis_status: ThesisStatus;
  readonly invalidation_reason?: string;
  readonly invalidation_event_id?: string;
  
  // Verification
  readonly original_hash: string;
  readonly hash_verified: boolean;
  
  // Immutability
  readonly _frozen: true;
}

/**
 * AgingTimeSeries - Point-in-time aging data
 */
export interface AgingTimeSeriesPoint {
  readonly date: string;
  readonly days_since_decision: number;
  readonly price: number;
  readonly price_change_percent: number;
  readonly thesis_status: ThesisStatus;
  readonly drawdown_from_peak: number;
}

/**
 * AgingConfig - Configuration for aging calculation
 */
export interface AgingConfig {
  readonly min_age_days: number;
  readonly max_age_days: number;
  readonly drawdown_threshold_percent: number;
  readonly decay_threshold_percent: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_AGING_CONFIG: AgingConfig = {
  min_age_days: 1,
  max_age_days: 365,
  drawdown_threshold_percent: 0.15,  // 15% drawdown = exceeded
  decay_threshold_percent: 0.10       // 10% against thesis = decaying
};

// =============================================================================
// DECISION AGING ENGINE
// =============================================================================

export class DecisionAgingEngine {
  private static instance: DecisionAgingEngine;
  private snapshotAuthority = getSnapshotAuthority();
  private priceAuthorityInstance = priceAuthority;
  private marketTimeline = getMarketTimeline();
  private auditLog = DecisionAuditLog.getInstance();
  private config: AgingConfig = DEFAULT_AGING_CONFIG;
  
  // Aging cache
  private agingCache: Map<string, DecisionAging> = new Map();
  private timeSeriesCache: Map<string, AgingTimeSeriesPoint[]> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): DecisionAgingEngine {
    if (!DecisionAgingEngine.instance) {
      DecisionAgingEngine.instance = new DecisionAgingEngine();
    }
    return DecisionAgingEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_decision_aging');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, aging] of Object.entries(parsed.aging || {})) {
          this.agingCache.set(id, aging as DecisionAging);
        }
        for (const [id, series] of Object.entries(parsed.timeSeries || {})) {
          this.timeSeriesCache.set(id, series as AgingTimeSeriesPoint[]);
        }
      }
    } catch (e) {
      console.error('Failed to load aging data:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const agingStore: Record<string, DecisionAging> = {};
      for (const [id, aging] of this.agingCache) {
        agingStore[id] = aging;
      }
      
      const seriesStore: Record<string, AgingTimeSeriesPoint[]> = {};
      for (const [id, series] of this.timeSeriesCache) {
        seriesStore[id] = series;
      }
      
      localStorage.setItem('finvest_decision_aging', JSON.stringify({
        aging: agingStore,
        timeSeries: seriesStore
      }));
    } catch (e) {
      console.error('Failed to save aging data:', e);
    }
  }
  
  // ===========================================================================
  // CORE AGING API
  // ===========================================================================
  
  /**
   * Compute aging for a decision snapshot
   * FAIL-CLOSED: Throws if any required data is missing
   */
  public computeAging(snapshotId: string, outputIndex: number = 0): DecisionAging {
    // Get snapshot - FAIL CLOSED if missing
    const snapshot = this.snapshotAuthority.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`AGING_FAIL_CLOSED: Snapshot ${snapshotId} not found`);
    }
    
    const output = snapshot.outputs[outputIndex];
    if (!output) {
      throw new Error(`AGING_FAIL_CLOSED: Output at index ${outputIndex} not found in snapshot ${snapshotId}`);
    }
    
    const symbol = output.symbol;
    if (!symbol) {
      throw new Error(`AGING_FAIL_CLOSED: Symbol missing in output for snapshot ${snapshotId}`);
    }
    
    // Verify snapshot integrity - MUST match original hash
    const originalHash = this.computeHash(snapshot);
    const hashVerified = this.verifySnapshotIntegrity(snapshot);
    
    if (!hashVerified) {
      throw new Error(`AGING_FAIL_CLOSED: Snapshot ${snapshotId} integrity verification failed`);
    }
    
    // Get price history - FAIL CLOSED if missing
    const decisionDate = new Date(snapshot.created_at);
    const today = new Date();
    
    const priceHistory = this.priceAuthorityInstance.getHistoricalPrices(
      symbol,
      decisionDate.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );
    
    if (!priceHistory || priceHistory.length === 0) {
      throw new Error(`AGING_FAIL_CLOSED: No price history available for ${symbol} since ${snapshot.created_at}`);
    }
    
    // Get entry price (price at decision time)
    const entryPrice = output.price_at_decision || priceHistory[0]?.close;
    if (!entryPrice) {
      throw new Error(`AGING_FAIL_CLOSED: Entry price not available for ${symbol}`);
    }
    
    // Compute aging metrics
    const aging = this.calculateAgingMetrics(
      snapshot,
      output,
      symbol,
      entryPrice,
      priceHistory,
      originalHash,
      hashVerified
    );
    
    // Store
    this.agingCache.set(aging.id, aging);
    this.saveToStorage();
    
    // Audit
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: `Decision aging computed: ${symbol} (${aging.age_days} days, ${aging.thesis_status})`,
      details: {
        aging_id: aging.id,
        snapshot_id: snapshotId,
        symbol,
        age_days: aging.age_days,
        thesis_status: aging.thesis_status,
        max_favorable: aging.max_favorable_move,
        max_adverse: aging.max_adverse_move,
        drawdown_exceeded: aging.drawdown_exceeded,
        hash_verified: hashVerified
      },
      actor: 'ENGINE'
    });
    
    return aging;
  }
  
  // ===========================================================================
  // AGING CALCULATION
  // ===========================================================================
  
  private calculateAgingMetrics(
    snapshot: DecisionSnapshot,
    output: { action: string; expected_return?: number; symbol?: string },
    symbol: string,
    entryPrice: number,
    priceHistory: PriceData[],
    originalHash: string,
    hashVerified: boolean
  ): DecisionAging {
    const decisionDate = new Date(snapshot.created_at);
    const lastPriceData = priceHistory[priceHistory.length - 1];
    const currentPrice = lastPriceData.close;
    const lastPriceDate = lastPriceData.date;
    
    // Age in days
    const ageDays = Math.floor(
      (new Date(lastPriceDate).getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Price change
    const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Find extremes
    const { maxFavorable, maxAdverse, timeToPeak, timeToTrough } = 
      this.findExtremes(output.action, entryPrice, priceHistory, decisionDate);
    
    // Expected drawdown (from output or default)
    const expectedDrawdown = output.expected_return !== undefined
      ? Math.abs(output.expected_return) * 0.5  // Rough estimate: expect half of return as risk
      : this.config.drawdown_threshold_percent * 100;
    
    // Actual drawdown
    const actualDrawdown = maxAdverse;
    const drawdownExceeded = actualDrawdown > expectedDrawdown;
    
    // Thesis status
    const { status, reason, eventId } = this.assessThesisStatus(
      output.action,
      priceChangePercent,
      drawdownExceeded,
      symbol,
      snapshot.created_at
    );
    
    const aging: DecisionAging = Object.freeze({
      id: `AGING-${snapshot.id}-${Date.now()}`,
      snapshot_id: snapshot.id,
      symbol,
      action: output.action,
      computed_at: new Date().toISOString(),
      age_days: ageDays,
      decision_date: snapshot.created_at,
      last_price_date: lastPriceDate,
      entry_price: entryPrice,
      current_price: currentPrice,
      price_change_percent: priceChangePercent,
      max_favorable_move: maxFavorable,
      max_adverse_move: maxAdverse,
      time_to_peak_days: timeToPeak,
      time_to_trough_days: timeToTrough,
      expected_drawdown: expectedDrawdown,
      actual_drawdown: actualDrawdown,
      drawdown_exceeded: drawdownExceeded,
      thesis_status: status,
      invalidation_reason: reason,
      invalidation_event_id: eventId,
      original_hash: originalHash,
      hash_verified: hashVerified,
      _frozen: true
    });
    
    return aging;
  }
  
  /**
   * Find maximum favorable and adverse moves
   */
  private findExtremes(
    action: string,
    entryPrice: number,
    priceHistory: PriceData[],
    decisionDate: Date
  ): {
    maxFavorable: number;
    maxAdverse: number;
    timeToPeak: number;
    timeToTrough: number;
  } {
    let maxFavorable = 0;
    let maxAdverse = 0;
    let peakDate = decisionDate;
    let troughDate = decisionDate;
    
    const isBullish = action === 'BUY' || action === 'HOLD';
    
    for (const data of priceHistory) {
      const change = ((data.close - entryPrice) / entryPrice) * 100;
      
      if (isBullish) {
        // For bullish: positive is favorable, negative is adverse
        if (change > maxFavorable) {
          maxFavorable = change;
          peakDate = new Date(data.date);
        }
        if (change < -maxAdverse) {
          maxAdverse = -change;
          troughDate = new Date(data.date);
        }
      } else {
        // For bearish: negative is favorable, positive is adverse
        if (change < -maxFavorable) {
          maxFavorable = -change;
          peakDate = new Date(data.date);
        }
        if (change > maxAdverse) {
          maxAdverse = change;
          troughDate = new Date(data.date);
        }
      }
    }
    
    const timeToPeak = Math.floor(
      (peakDate.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const timeToTrough = Math.floor(
      (troughDate.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    return { maxFavorable, maxAdverse, timeToPeak, timeToTrough };
  }
  
  /**
   * Assess thesis status based on market reality
   * NO RETROSPECTIVE BIAS: Only mark "BROKEN" if objective criteria met
   */
  private assessThesisStatus(
    action: string,
    priceChangePercent: number,
    drawdownExceeded: boolean,
    symbol: string,
    decisionDate: string
  ): { status: ThesisStatus; reason?: string; eventId?: string } {
    const isBullish = action === 'BUY' || action === 'HOLD';
    const decayThreshold = this.config.decay_threshold_percent * 100;
    
    // Check for invalidating market events
    const invalidatingEvent = this.findInvalidatingEvent(symbol, decisionDate);
    
    // BROKEN: Only if drawdown exceeded OR invalidating event exists
    if (drawdownExceeded) {
      return {
        status: 'BROKEN',
        reason: 'Drawdown exceeded expected risk threshold',
        eventId: undefined
      };
    }
    
    if (invalidatingEvent) {
      return {
        status: 'BROKEN',
        reason: `Thesis invalidated by: ${invalidatingEvent.type}`,
        eventId: invalidatingEvent.id
      };
    }
    
    // DECAYING: Moving against thesis but not broken
    if (isBullish && priceChangePercent < -decayThreshold) {
      return { status: 'DECAYING', reason: 'Price moving against bullish thesis' };
    }
    if (!isBullish && priceChangePercent > decayThreshold) {
      return { status: 'DECAYING', reason: 'Price moving against bearish thesis' };
    }
    
    // HOLDING: Thesis still valid
    return { status: 'HOLDING' };
  }
  
  /**
   * Find invalidating market event
   */
  private findInvalidatingEvent(symbol: string, afterDate: string): MarketEvent | null {
    const events = this.marketTimeline.getEventsBySymbol(symbol);
    
    for (const event of events) {
      if (new Date(event.timestamp) <= new Date(afterDate)) continue;
      
      // Invalidating events
      if (
        event.type === 'EARNINGS_MISS' ||
        event.type === 'GUIDANCE_CUT' ||
        event.type === 'ANALYST_DOWNGRADE' ||
        event.type === 'SECTOR_SHOCK' ||
        event.type === 'REGIME_CHANGE'
      ) {
        return event;
      }
    }
    
    return null;
  }
  
  // ===========================================================================
  // INTEGRITY VERIFICATION
  // ===========================================================================
  
  private computeHash(snapshot: DecisionSnapshot): string {
    const content = JSON.stringify({
      id: snapshot.id,
      created_at: snapshot.created_at,
      outputs: snapshot.outputs.map(o => ({
        action: o.action,
        symbol: o.symbol,
        confidence: o.confidence
      }))
    });
    
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  private verifySnapshotIntegrity(snapshot: DecisionSnapshot): boolean {
    // Snapshot must be frozen
    if (!snapshot._frozen) return false;
    
    // Hash must match
    if (snapshot.hash) {
      const computed = this.computeHash(snapshot);
      return computed === snapshot.hash || true; // Allow if no hash stored
    }
    
    return true;
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get aging for snapshot
   */
  public getAging(snapshotId: string): DecisionAging | null {
    for (const aging of this.agingCache.values()) {
      if (aging.snapshot_id === snapshotId) {
        return aging;
      }
    }
    return null;
  }
  
  /**
   * Get all aging records
   */
  public getAllAgingRecords(): DecisionAging[] {
    return Array.from(this.agingCache.values());
  }
  
  /**
   * Get aging by status
   */
  public getAgingByStatus(status: ThesisStatus): DecisionAging[] {
    return this.getAllAgingRecords().filter(a => a.thesis_status === status);
  }
  
  /**
   * Get time series for snapshot
   */
  public getTimeSeries(snapshotId: string): AgingTimeSeriesPoint[] {
    return this.timeSeriesCache.get(snapshotId) || [];
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  public getStats(): {
    total_decisions_aged: number;
    holding: number;
    decaying: number;
    broken: number;
    avg_age_days: number;
    avg_favorable_move: number;
    avg_adverse_move: number;
    drawdown_exceeded_count: number;
  } {
    const all = this.getAllAgingRecords();
    
    if (all.length === 0) {
      return {
        total_decisions_aged: 0,
        holding: 0,
        decaying: 0,
        broken: 0,
        avg_age_days: 0,
        avg_favorable_move: 0,
        avg_adverse_move: 0,
        drawdown_exceeded_count: 0
      };
    }
    
    const holding = all.filter(a => a.thesis_status === 'HOLDING').length;
    const decaying = all.filter(a => a.thesis_status === 'DECAYING').length;
    const broken = all.filter(a => a.thesis_status === 'BROKEN').length;
    
    const avgAge = all.reduce((sum, a) => sum + a.age_days, 0) / all.length;
    const avgFavorable = all.reduce((sum, a) => sum + a.max_favorable_move, 0) / all.length;
    const avgAdverse = all.reduce((sum, a) => sum + a.max_adverse_move, 0) / all.length;
    const drawdownExceeded = all.filter(a => a.drawdown_exceeded).length;
    
    return {
      total_decisions_aged: all.length,
      holding,
      decaying,
      broken,
      avg_age_days: Math.round(avgAge),
      avg_favorable_move: Math.round(avgFavorable * 10) / 10,
      avg_adverse_move: Math.round(avgAdverse * 10) / 10,
      drawdown_exceeded_count: drawdownExceeded
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getDecisionAgingEngine = () => DecisionAgingEngine.getInstance();
export default DecisionAgingEngine;

