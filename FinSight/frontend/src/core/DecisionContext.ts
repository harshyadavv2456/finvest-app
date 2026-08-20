/**
 * DecisionContext - Single Source of Truth (SSOT)
 * 
 * PROBLEM SOLVED:
 * Data exists in multiple places. This creates ONE deterministic decision graph.
 * 
 * ALL downstream systems MUST consume ONLY DecisionContext:
 * - UI
 * - FinBot
 * - ExecutionEngine
 * - DecisionExplainer
 * 
 * If ANY component is missing → DecisionContext = INVALID
 * System MUST halt decision rendering.
 */

import { PortfolioSnapshot, EnrichedHolding } from '../integrations/portfolio';
import { FinSightSignal, AllocationRecommendation } from '../engines/TaxAwareAllocator';

// Market regime types
export type MarketRegime = 
  | 'BULL_STRONG'      // Strong uptrend, low volatility
  | 'BULL_VOLATILE'    // Uptrend with high volatility
  | 'BEAR_STRONG'      // Strong downtrend
  | 'BEAR_VOLATILE'    // Downtrend with high volatility
  | 'SIDEWAYS'         // No clear trend
  | 'UNKNOWN';         // Insufficient data

// Context validity status
export type ContextStatus = 
  | 'VALID'            // All components present and fresh
  | 'STALE'            // Data older than threshold
  | 'INCOMPLETE'       // Missing required components
  | 'INVALID';         // Cannot make decisions

// Component freshness thresholds (in seconds)
export const FRESHNESS_THRESHOLDS = {
  PRICES: 60,          // 1 minute for prices
  PORTFOLIO: 3600,     // 1 hour for portfolio
  SIGNALS: 86400,      // 24 hours for signals
  REGIME: 3600         // 1 hour for regime
} as const;

/**
 * Live price data from PriceAuthority
 */
export interface PriceData {
  symbol: string;
  price: number;
  timestamp: string;
  source: 'YAHOO' | 'NSE' | 'BSE' | 'FALLBACK';
  is_stale: boolean;
}

/**
 * Tax analysis output
 */
export interface TaxAnalysis {
  symbol: string;
  holding_days: number;
  is_ltcg_eligible: boolean;
  days_to_ltcg: number;
  unrealized_gain: number;
  tax_if_sold_now: number;
  tax_if_ltcg: number;
  potential_savings: number;
}

/**
 * Component status tracking
 */
export interface ComponentStatus {
  name: string;
  status: 'AVAILABLE' | 'MISSING' | 'STALE' | 'ERROR';
  last_updated: string | null;
  age_seconds: number;
  error?: string;
}

/**
 * DecisionContext - The SINGLE SOURCE OF TRUTH
 * 
 * This is the ONLY object that downstream systems should consume.
 * No direct API calls. No local calculations. Everything flows through here.
 */
export interface DecisionContext {
  // Metadata
  id: string;
  created_at: string;
  status: ContextStatus;
  status_reason: string;
  
  // Core data (all required for VALID status)
  portfolio_snapshot: PortfolioSnapshot | null;
  enriched_holdings: EnrichedHolding[];
  live_prices: Map<string, PriceData>;
  finsight_signals: Map<string, FinSightSignal>;
  tax_analyses: Map<string, TaxAnalysis>;
  market_regime: MarketRegime;
  
  // Derived data
  recommendations: AllocationRecommendation[];
  
  // Component health
  components: ComponentStatus[];
  
  // Validation
  missing_components: string[];
  stale_components: string[];
  warnings: string[];
}

/**
 * DecisionContext Builder
 * 
 * Ensures all components are validated before creating a context.
 */
export class DecisionContextBuilder {
  private portfolioSnapshot: PortfolioSnapshot | null = null;
  private enrichedHoldings: EnrichedHolding[] = [];
  private livePrices: Map<string, PriceData> = new Map();
  private signals: Map<string, FinSightSignal> = new Map();
  private taxAnalyses: Map<string, TaxAnalysis> = new Map();
  private regime: MarketRegime = 'UNKNOWN';
  private recommendations: AllocationRecommendation[] = [];
  private timestamps: Map<string, Date> = new Map();

  /**
   * Set portfolio snapshot
   */
  withPortfolio(snapshot: PortfolioSnapshot | null, holdings: EnrichedHolding[]): this {
    this.portfolioSnapshot = snapshot;
    this.enrichedHoldings = holdings;
    if (snapshot) {
      this.timestamps.set('portfolio', new Date(snapshot.ingested_at));
    }
    return this;
  }

  /**
   * Set live prices
   */
  withPrices(prices: Map<string, PriceData>): this {
    this.livePrices = prices;
    if (prices.size > 0) {
      // Use most recent price timestamp
      const timestamps = Array.from(prices.values()).map(p => new Date(p.timestamp));
      this.timestamps.set('prices', new Date(Math.max(...timestamps.map(t => t.getTime()))));
    }
    return this;
  }

  /**
   * Set FinSight signals
   */
  withSignals(signals: FinSightSignal[]): this {
    this.signals.clear();
    signals.forEach(s => this.signals.set(s.symbol, s));
    if (signals.length > 0) {
      this.timestamps.set('signals', new Date());
    }
    return this;
  }

  /**
   * Set tax analyses
   */
  withTaxAnalyses(analyses: TaxAnalysis[]): this {
    this.taxAnalyses.clear();
    analyses.forEach(a => this.taxAnalyses.set(a.symbol, a));
    return this;
  }

  /**
   * Set market regime
   */
  withRegime(regime: MarketRegime): this {
    this.regime = regime;
    this.timestamps.set('regime', new Date());
    return this;
  }

  /**
   * Set recommendations from TaxAwareAllocator
   */
  withRecommendations(recommendations: AllocationRecommendation[]): this {
    this.recommendations = recommendations;
    return this;
  }

  /**
   * Build the DecisionContext
   */
  build(): DecisionContext {
    const now = new Date();
    const components: ComponentStatus[] = [];
    const missingComponents: string[] = [];
    const staleComponents: string[] = [];
    const warnings: string[] = [];

    // Check portfolio component
    const portfolioStatus = this.checkComponent('portfolio', this.portfolioSnapshot !== null, 
      this.timestamps.get('portfolio'), FRESHNESS_THRESHOLDS.PORTFOLIO);
    components.push(portfolioStatus);
    if (portfolioStatus.status === 'MISSING') missingComponents.push('portfolio');
    if (portfolioStatus.status === 'STALE') staleComponents.push('portfolio');

    // Check prices component
    const pricesStatus = this.checkComponent('prices', this.livePrices.size > 0,
      this.timestamps.get('prices'), FRESHNESS_THRESHOLDS.PRICES);
    components.push(pricesStatus);
    if (pricesStatus.status === 'MISSING') missingComponents.push('prices');
    if (pricesStatus.status === 'STALE') staleComponents.push('prices');

    // Check signals component (not required, but tracked)
    const signalsStatus = this.checkComponent('signals', this.signals.size > 0,
      this.timestamps.get('signals'), FRESHNESS_THRESHOLDS.SIGNALS);
    components.push(signalsStatus);
    if (signalsStatus.status === 'MISSING') {
      warnings.push('No FinSight signals available - recommendations will be limited');
    }

    // Check regime component
    const regimeStatus = this.checkComponent('regime', this.regime !== 'UNKNOWN',
      this.timestamps.get('regime'), FRESHNESS_THRESHOLDS.REGIME);
    components.push(regimeStatus);
    if (regimeStatus.status === 'MISSING') {
      warnings.push('Market regime unknown - using conservative assumptions');
    }

    // Determine overall status
    let status: ContextStatus;
    let statusReason: string;

    if (missingComponents.includes('portfolio')) {
      status = 'INVALID';
      statusReason = 'Portfolio not connected. Cannot make investment decisions.';
    } else if (missingComponents.includes('prices')) {
      status = 'INCOMPLETE';
      statusReason = 'Live prices unavailable. P&L calculations may be inaccurate.';
    } else if (staleComponents.length > 0) {
      status = 'STALE';
      statusReason = `Stale data: ${staleComponents.join(', ')}. Refresh recommended.`;
    } else {
      status = 'VALID';
      statusReason = 'All components current and valid.';
    }

    return {
      id: `CTX-${now.getTime()}`,
      created_at: now.toISOString(),
      status,
      status_reason: statusReason,
      portfolio_snapshot: this.portfolioSnapshot,
      enriched_holdings: this.enrichedHoldings,
      live_prices: this.livePrices,
      finsight_signals: this.signals,
      tax_analyses: this.taxAnalyses,
      market_regime: this.regime,
      recommendations: this.recommendations,
      components,
      missing_components: missingComponents,
      stale_components: staleComponents,
      warnings
    };
  }

  private checkComponent(
    name: string, 
    exists: boolean, 
    lastUpdated: Date | undefined,
    freshnessThreshold: number
  ): ComponentStatus {
    const now = new Date();
    
    if (!exists) {
      return {
        name,
        status: 'MISSING',
        last_updated: null,
        age_seconds: -1
      };
    }

    if (!lastUpdated) {
      return {
        name,
        status: 'AVAILABLE',
        last_updated: null,
        age_seconds: 0
      };
    }

    const ageSeconds = (now.getTime() - lastUpdated.getTime()) / 1000;
    const isStale = ageSeconds > freshnessThreshold;

    return {
      name,
      status: isStale ? 'STALE' : 'AVAILABLE',
      last_updated: lastUpdated.toISOString(),
      age_seconds: Math.floor(ageSeconds)
    };
  }
}

/**
 * DecisionContext Manager
 * 
 * Singleton that maintains the current decision context.
 */
export class DecisionContextManager {
  private static instance: DecisionContextManager;
  private currentContext: DecisionContext | null = null;
  private listeners: Set<(ctx: DecisionContext) => void> = new Set();

  private constructor() {}

  static getInstance(): DecisionContextManager {
    if (!DecisionContextManager.instance) {
      DecisionContextManager.instance = new DecisionContextManager();
    }
    return DecisionContextManager.instance;
  }

  /**
   * Get current context
   * Returns null if no context has been built
   */
  getContext(): DecisionContext | null {
    return this.currentContext;
  }

  /**
   * Check if context is valid for decision-making
   */
  isContextValid(): boolean {
    return this.currentContext?.status === 'VALID';
  }

  /**
   * Check if context allows any operations (VALID or STALE)
   */
  canMakeDecisions(): boolean {
    const status = this.currentContext?.status;
    return status === 'VALID' || status === 'STALE';
  }

  /**
   * Get reason why decisions cannot be made
   */
  getDecisionBlockReason(): string {
    if (!this.currentContext) {
      return 'Decision context not initialized. Please refresh data.';
    }
    if (this.currentContext.status === 'INVALID') {
      return this.currentContext.status_reason;
    }
    if (this.currentContext.status === 'INCOMPLETE') {
      return this.currentContext.status_reason;
    }
    return '';
  }

  /**
   * Update context
   */
  updateContext(context: DecisionContext): void {
    this.currentContext = context;
    this.notifyListeners();
  }

  /**
   * Subscribe to context changes
   */
  subscribe(listener: (ctx: DecisionContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (this.currentContext) {
      this.listeners.forEach(l => l(this.currentContext!));
    }
  }
}

// Export singleton
export const decisionContextManager = DecisionContextManager.getInstance();

export default DecisionContextManager;

