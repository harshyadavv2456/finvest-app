/**
 * Position Data Adapter
 * 
 * PHASE 43: Frontend Product Surface
 * 
 * Reads position data from JSON files and provides a unified interface
 * for the Daily Command Center and other position-related UI components.
 * 
 * RULES:
 * - READ ONLY - Never modifies source data
 * - Returns null/empty on missing data (no fake data)
 * - Provides clear status indicators
 */

import { api } from '../lib/api';

// =============================================================================
// TYPES
// =============================================================================

export type PositionDecision = 'INITIATE' | 'HOLD' | 'REDUCE' | 'EXIT' | 'AVOID';

export interface PositionData {
  readonly position_id: string;
  readonly symbol: string;
  readonly exchange: 'NSE' | 'BSE';
  readonly quantity: number;
  readonly average_cost: number;
  readonly current_price: number;
  readonly current_value: number;
  readonly unrealized_pnl: number;
  readonly unrealized_pnl_percent: number;
  readonly lifecycle_state: 'OPEN' | 'REDUCING' | 'CLOSED';
  readonly last_decision: PositionDecision;
  readonly last_decision_date: string;
  readonly last_decision_reason: string;
  readonly entry_date: string;
  readonly risk_allocation: {
    readonly risk_units: number;
    readonly max_loss_allowed: number;
    readonly current_drawdown: number;
    readonly stop_loss_price: number;
    readonly position_size_percent: number;
  };
  readonly tax_lots: readonly {
    readonly lot_id: string;
    readonly quantity: number;
    readonly days_held: number;
    readonly is_ltcg_eligible: boolean;
    readonly days_to_ltcg: number;
    readonly tax_implication: 'STCG' | 'LTCG' | 'LOSS';
  }[];
  readonly total_tax_liability_if_sold: number;
}

export interface DailyAssessmentSummary {
  readonly position_id: string;
  readonly symbol: string;
  readonly date: string;
  readonly today_decision: PositionDecision;
  readonly yesterday_decision: PositionDecision | null;
  readonly decision_changed: boolean;
  readonly rationale: string;
  readonly requires_action: boolean;
  readonly news_impact: string | null;
  readonly confidence: number;
}

export interface PositionsFile {
  version: string;
  last_updated: string;
  positions: PositionData[];
}

export interface TimelineEntry {
  date: string;
  position_id: string;
  symbol: string;
  decision: PositionDecision;
  rationale: string;
  price_at_decision: number;
}

export interface PositionTimeline {
  version: string;
  entries: TimelineEntry[];
}

export interface LoadResult<T> {
  data: T | null;
  status: 'success' | 'loading' | 'error' | 'no_data';
  error: string | null;
  lastUpdated: string | null;
}

// =============================================================================
// POSITION DATA ADAPTER
// =============================================================================

class PositionDataAdapterImpl {
  private positionsCache: PositionsFile | null = null;
  private timelineCache: PositionTimeline | null = null;
  private lastFetch: Date | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  /**
   * Load positions from the JSON file
   */
  async loadPositions(): Promise<LoadResult<PositionsFile>> {
    try {
      // Try API first (for deployed environment)
      const response = await api.get('/api/positions/current');
      if (response.data && response.data.positions) {
        this.positionsCache = response.data;
        this.lastFetch = new Date();
        return {
          data: response.data,
          status: 'success',
          error: null,
          lastUpdated: response.data.last_updated || new Date().toISOString()
        };
      }
    } catch {
      // Fallback to static JSON file
      try {
        const response = await fetch('/data/positions/positions.json');
        if (response.ok) {
          const data = await response.json();
          this.positionsCache = data;
          this.lastFetch = new Date();
          return {
            data,
            status: 'success',
            error: null,
            lastUpdated: data.last_updated || new Date().toISOString()
          };
        }
      } catch {
        // File not found
      }
    }
    
    return {
      data: null,
      status: 'no_data',
      error: 'No positions data available',
      lastUpdated: null
    };
  }

  /**
   * Load position timeline
   */
  async loadTimeline(): Promise<LoadResult<PositionTimeline>> {
    try {
      // Try API first
      const response = await api.get('/api/positions/timeline');
      if (response.data && response.data.entries) {
        this.timelineCache = response.data;
        return {
          data: response.data,
          status: 'success',
          error: null,
          lastUpdated: new Date().toISOString()
        };
      }
    } catch {
      // Fallback to static JSON file
      try {
        const response = await fetch('/data/positions/position_timeline.json');
        if (response.ok) {
          const data = await response.json();
          this.timelineCache = data;
          return {
            data,
            status: 'success',
            error: null,
            lastUpdated: new Date().toISOString()
          };
        }
      } catch {
        // File not found
      }
    }
    
    return {
      data: null,
      status: 'no_data',
      error: 'No timeline data available',
      lastUpdated: null
    };
  }

  /**
   * Get open positions only
   */
  async getOpenPositions(): Promise<LoadResult<PositionData[]>> {
    const result = await this.loadPositions();
    if (result.status !== 'success' || !result.data) {
      return {
        data: null,
        status: result.status,
        error: result.error,
        lastUpdated: result.lastUpdated
      };
    }
    
    const openPositions = result.data.positions.filter(
      p => p.lifecycle_state === 'OPEN'
    );
    
    return {
      data: openPositions,
      status: 'success',
      error: null,
      lastUpdated: result.lastUpdated
    };
  }

  /**
   * Get daily assessment summary for all open positions
   */
  async getDailyAssessments(): Promise<LoadResult<DailyAssessmentSummary[]>> {
    const [positionsResult, timelineResult] = await Promise.all([
      this.getOpenPositions(),
      this.loadTimeline()
    ]);
    
    if (positionsResult.status !== 'success' || !positionsResult.data) {
      return {
        data: null,
        status: positionsResult.status,
        error: positionsResult.error,
        lastUpdated: positionsResult.lastUpdated
      };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    const assessments: DailyAssessmentSummary[] = positionsResult.data.map(position => {
      // Find yesterday's decision from timeline
      const yesterdayEntry = timelineResult.data?.entries.find(
        e => e.position_id === position.position_id && e.date === yesterday
      );
      
      const todayDecision = position.last_decision;
      const yesterdayDecision = yesterdayEntry?.decision || null;
      const decisionChanged = yesterdayDecision !== null && yesterdayDecision !== todayDecision;
      
      // Determine if action is required
      const requiresAction = 
        todayDecision === 'REDUCE' || 
        todayDecision === 'EXIT' ||
        todayDecision === 'INITIATE';
      
      return {
        position_id: position.position_id,
        symbol: position.symbol,
        date: today,
        today_decision: todayDecision,
        yesterday_decision: yesterdayDecision,
        decision_changed: decisionChanged,
        rationale: position.last_decision_reason,
        requires_action: requiresAction,
        news_impact: null, // TODO: Integrate with news pipeline
        confidence: 75 // TODO: Get from intelligence pipeline
      };
    });
    
    return {
      data: assessments,
      status: 'success',
      error: null,
      lastUpdated: positionsResult.lastUpdated
    };
  }

  /**
   * Get positions that require action today
   */
  async getActionRequired(): Promise<LoadResult<{
    position: PositionData;
    assessment: DailyAssessmentSummary;
  }[]>> {
    const [positionsResult, assessmentsResult] = await Promise.all([
      this.getOpenPositions(),
      this.getDailyAssessments()
    ]);
    
    if (
      positionsResult.status !== 'success' || 
      !positionsResult.data ||
      assessmentsResult.status !== 'success' ||
      !assessmentsResult.data
    ) {
      return {
        data: null,
        status: 'error',
        error: 'Could not load position data',
        lastUpdated: null
      };
    }
    
    const actionItems = assessmentsResult.data
      .filter(a => a.requires_action)
      .map(assessment => {
        const position = positionsResult.data!.find(
          p => p.position_id === assessment.position_id
        )!;
        return { position, assessment };
      });
    
    return {
      data: actionItems,
      status: 'success',
      error: null,
      lastUpdated: positionsResult.lastUpdated
    };
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(): Promise<LoadResult<{
    total_value: number;
    total_pnl: number;
    total_pnl_percent: number;
    position_count: number;
    requires_action_count: number;
    hold_count: number;
    last_updated: string;
  }>> {
    const positionsResult = await this.getOpenPositions();
    
    if (positionsResult.status !== 'success' || !positionsResult.data) {
      return {
        data: null,
        status: positionsResult.status,
        error: positionsResult.error,
        lastUpdated: positionsResult.lastUpdated
      };
    }
    
    const positions = positionsResult.data;
    const totalValue = positions.reduce((sum, p) => sum + p.current_value, 0);
    const totalCost = positions.reduce((sum, p) => sum + (p.quantity * p.average_cost), 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    
    const actionRequired = positions.filter(
      p => p.last_decision === 'REDUCE' || p.last_decision === 'EXIT'
    ).length;
    
    const holdCount = positions.filter(
      p => p.last_decision === 'HOLD'
    ).length;
    
    return {
      data: {
        total_value: totalValue,
        total_pnl: totalPnl,
        total_pnl_percent: totalPnlPercent,
        position_count: positions.length,
        requires_action_count: actionRequired,
        hold_count: holdCount,
        last_updated: positionsResult.lastUpdated || new Date().toISOString()
      },
      status: 'success',
      error: null,
      lastUpdated: positionsResult.lastUpdated
    };
  }

  /**
   * Clear cache (for manual refresh)
   */
  clearCache(): void {
    this.positionsCache = null;
    this.timelineCache = null;
    this.lastFetch = null;
  }
}

// Singleton instance
export const PositionDataAdapter = new PositionDataAdapterImpl();

// Hook for React components
export function usePositionData() {
  return PositionDataAdapter;
}

