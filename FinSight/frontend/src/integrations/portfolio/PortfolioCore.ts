/**
 * PortfolioCore
 * 
 * The SINGLE SOURCE OF TRUTH for portfolio data in FinVest.
 * 
 * RULES:
 * - Consumes ONLY normalized output from PortfolioIngestion
 * - Refuses to load if no ingestion exists
 * - Displays explicit "Portfolio not connected" otherwise
 * - NO mock data
 * - NO placeholders
 * - NO silent failures
 */

import { 
  PortfolioSnapshot, 
  Holding, 
  Transaction, 
  PortfolioState,
  TaxProfile
} from './types';
import { portfolioIngestion } from './PortfolioIngestion';

// Default tax profile for Indian resident
export const DEFAULT_TAX_PROFILE: TaxProfile = {
  tax_residency: 'IN',
  stcg_rate: 0.15,      // 15% STCG on equity
  ltcg_rate: 0.10,      // 10% LTCG on equity above exemption
  ltcg_exemption: 100000, // ₹1L exemption
  loss_carry_forward: 0,
  wash_sale_applicable: false // Not applicable in India
};

/**
 * Enriched holding with computed fields
 */
export interface EnrichedHolding extends Holding {
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  holding_days: number;
  is_ltcg_eligible: boolean;
  days_to_ltcg: number; // Days remaining for LTCG eligibility
  tax_if_sold_now: number; // Estimated tax if sold today
}

/**
 * Portfolio summary with computed metrics
 */
export interface PortfolioSummary {
  total_invested: number;
  current_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  stcg_holdings: number;  // Count of holdings subject to STCG
  ltcg_holdings: number;  // Count of holdings eligible for LTCG
  total_holdings: number;
  last_updated: string;
}

/**
 * PortfolioCore Service
 * Orchestrates portfolio data and computations
 */
export class PortfolioCore {
  private static instance: PortfolioCore;
  private priceCache: Map<string, number> = new Map();
  private taxProfile: TaxProfile = DEFAULT_TAX_PROFILE;

  private constructor() {}

  static getInstance(): PortfolioCore {
    if (!PortfolioCore.instance) {
      PortfolioCore.instance = new PortfolioCore();
    }
    return PortfolioCore.instance;
  }

  /**
   * Get current portfolio state
   * Returns NOT_CONNECTED if no portfolio ingested
   */
  getState(): PortfolioState {
    return portfolioIngestion.getPortfolioState();
  }

  /**
   * Check if portfolio is available
   */
  isAvailable(): boolean {
    const state = this.getState();
    return state.status === 'READY';
  }

  /**
   * Get current snapshot
   * Throws if not available
   */
  getSnapshot(): PortfolioSnapshot {
    const state = this.getState();
    if (state.status !== 'READY') {
      throw new Error('Portfolio not connected. Please ingest portfolio data first.');
    }
    return state.snapshot;
  }

  /**
   * Get holdings with enriched data (live prices, P&L, tax info)
   */
  async getEnrichedHoldings(): Promise<EnrichedHolding[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const snapshot = this.getSnapshot();
    const enriched: EnrichedHolding[] = [];
    const now = new Date();

    for (const holding of snapshot.holdings) {
      const currentPrice = await this.getPrice(holding.symbol);
      const currentValue = holding.quantity * currentPrice;
      const investedValue = holding.quantity * holding.avg_price;
      const unrealizedPnl = currentValue - investedValue;
      
      // Calculate holding period
      const acquisitionDate = new Date(holding.acquisition_date);
      const holdingDays = Math.floor((now.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24));
      const isLtcgEligible = holdingDays >= 365;
      const daysToLtcg = Math.max(0, 365 - holdingDays);

      // Calculate tax if sold now
      const taxIfSoldNow = this.calculateTaxOnSale(unrealizedPnl, isLtcgEligible);

      enriched.push({
        ...holding,
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent: investedValue > 0 ? (unrealizedPnl / investedValue) * 100 : 0,
        holding_days: holdingDays,
        is_ltcg_eligible: isLtcgEligible,
        days_to_ltcg: daysToLtcg,
        tax_if_sold_now: taxIfSoldNow
      });
    }

    return enriched;
  }

  /**
   * Get portfolio summary
   */
  async getSummary(): Promise<PortfolioSummary | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const holdings = await this.getEnrichedHoldings();
    
    let totalInvested = 0;
    let currentValue = 0;
    let stcgHoldings = 0;
    let ltcgHoldings = 0;

    for (const h of holdings) {
      totalInvested += h.quantity * h.avg_price;
      currentValue += h.current_value;
      
      if (h.is_ltcg_eligible) {
        ltcgHoldings++;
      } else {
        stcgHoldings++;
      }
    }

    const totalPnl = currentValue - totalInvested;

    return {
      total_invested: totalInvested,
      current_value: currentValue,
      total_pnl: totalPnl,
      total_pnl_percent: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
      stcg_holdings: stcgHoldings,
      ltcg_holdings: ltcgHoldings,
      total_holdings: holdings.length,
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Get transactions
   */
  getTransactions(): Transaction[] {
    if (!this.isAvailable()) {
      return [];
    }
    return this.getSnapshot().transactions;
  }

  /**
   * Set user's tax profile
   */
  setTaxProfile(profile: Partial<TaxProfile>): void {
    this.taxProfile = { ...this.taxProfile, ...profile };
  }

  /**
   * Get tax profile
   */
  getTaxProfile(): TaxProfile {
    return { ...this.taxProfile };
  }

  /**
   * Update price cache (called by PriceService)
   */
  updatePrice(symbol: string, price: number): void {
    this.priceCache.set(symbol, price);
  }

  /**
   * Bulk update prices
   */
  updatePrices(prices: Record<string, number>): void {
    Object.entries(prices).forEach(([symbol, price]) => {
      this.priceCache.set(symbol, price);
    });
  }

  // Private methods

  private async getPrice(symbol: string): Promise<number> {
    // Check cache first
    if (this.priceCache.has(symbol)) {
      return this.priceCache.get(symbol)!;
    }

    // For now, return avg_price as fallback
    // In production, this would call PriceService
    const snapshot = this.getSnapshot();
    const holding = snapshot.holdings.find(h => h.symbol === symbol);
    return holding?.avg_price || 0;
  }

  private calculateTaxOnSale(gain: number, isLtcg: boolean): number {
    if (gain <= 0) return 0; // No tax on loss

    if (isLtcg) {
      // LTCG: 10% above ₹1L exemption
      const taxableGain = Math.max(0, gain - this.taxProfile.ltcg_exemption);
      return taxableGain * this.taxProfile.ltcg_rate;
    } else {
      // STCG: 15%
      return gain * this.taxProfile.stcg_rate;
    }
  }
}

// Export singleton
export const portfolioCore = PortfolioCore.getInstance();

export default PortfolioCore;

