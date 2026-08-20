/**
 * TaxEngine - Real Tax Computation Engine
 * 
 * RULES (NON-NEGOTIABLE):
 * - Real Indian taxation logic (FY 2024-25)
 * - STCG @ 20% for holdings < 1 year (Budget 2024)
 * - LTCG @ 12.5% for holdings > 1 year (Budget 2024, above ₹1.25L exemption)
 * - FIFO lot tracking for accurate cost basis
 * - Per-demat computation
 * - NO mock data, NO hardcoded examples
 * 
 * REQUIRES: PortfolioSnapshot from connected demat
 * If no demat → TaxEngine CANNOT compute, must show unavailable
 * 
 * Outputs:
 * - Tax liability per demat
 * - Optimal sell strategy to minimize tax
 */

import { 
  Holding, 
  TaxLot, 
  DematAccount, 
  PortfolioSnapshot 
} from '../integrations/demat/types';

// =============================================================================
// TAX CONFIG (FY 2024-25 Budget)
// =============================================================================

export const TAX_CONFIG = {
  // Short-term capital gains (< 12 months holding)
  STCG_RATE: 0.20, // 20% as per Budget 2024
  
  // Long-term capital gains (>= 12 months holding)
  LTCG_RATE: 0.125, // 12.5% as per Budget 2024
  
  // LTCG exemption limit per FY
  LTCG_EXEMPTION: 125000, // ₹1.25 lakh
  
  // Holding period for LTCG qualification
  LTCG_HOLDING_PERIOD_DAYS: 365, // 12 months
  
  // Cess rate
  CESS_RATE: 0.04, // 4% health and education cess
  
  // Surcharge thresholds
  SURCHARGE_10_THRESHOLD: 5000000, // ₹50 lakh
  SURCHARGE_15_THRESHOLD: 10000000, // ₹1 crore
};

// =============================================================================
// TYPES
// =============================================================================

export type TaxJurisdiction = 'IN' | 'US';
export type SellStrategy = 'FIFO' | 'LIFO' | 'HIFO' | 'MIN_TAX';
export type GainType = 'STCG' | 'LTCG' | 'LOSS';

export interface TaxLotAnalysis {
  lotId: string;
  ticker: string;
  dematAccountId: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  holdingPeriodDays: number;
  isLongTerm: boolean;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  gainType: GainType;
  projectedTax: number;
  netProceeds: number;
}

export interface DematTaxSummary {
  accountId: string;
  accountName: string;
  stcgGains: number;
  stcgLosses: number;
  stcgNetTaxable: number;
  stcgTax: number;
  ltcgGains: number;
  ltcgLosses: number;
  ltcgExemptionUsed: number;
  ltcgNetTaxable: number;
  ltcgTax: number;
  totalTax: number;
  totalProceeds: number;
  netCash: number;
  lots: TaxLotAnalysis[];
}

export interface TaxComputationResult {
  /** Whether the computation was successful */
  success: boolean;
  
  /** Error message if computation failed */
  error?: string;
  
  /** Tax breakdown by demat account */
  byDemat: Record<string, DematTaxSummary>;
  
  /** Aggregate totals */
  totals: {
    stcgGains: number;
    stcgLosses: number;
    stcgTax: number;
    ltcgGains: number;
    ltcgLosses: number;
    ltcgExemptionUsed: number;
    ltcgExemptionRemaining: number;
    ltcgTax: number;
    totalTax: number;
    totalProceeds: number;
    netCash: number;
  };
  
  /** Recommendation for optimal selling */
  recommendation: {
    optimalDematForSale: string | null;
    strategy: SellStrategy;
    reason: string;
  };
  
  /** Warnings and notes */
  warnings: string[];
}

export interface SellPlan {
  lots: TaxLotAnalysis[];
  strategy: SellStrategy;
  totalQuantity: number;
  totalProceeds: number;
  totalCost: number;
  totalGain: number;
  stcgTax: number;
  ltcgTax: number;
  totalTax: number;
  netCash: number;
  effectiveTaxRate: number;
  taxSavingsVsFIFO: number;
}

// =============================================================================
// ERROR TYPE
// =============================================================================

export class TaxEngineError extends Error {
  constructor(
    public code: 'NO_DEMAT' | 'NO_DATA' | 'NO_PRICE' | 'INVALID_INPUT',
    message: string
  ) {
    super(message);
    this.name = 'TaxEngineError';
  }
}

// =============================================================================
// TAX ENGINE CLASS
// =============================================================================

export class TaxEngine {
  private jurisdiction: TaxJurisdiction;
  
  // Tax rates from config
  private stcgRate: number;
  private ltcgRate: number;
  private ltcgExemption: number;
  private holdingPeriodDays: number;
  private cessRate: number;

  constructor(jurisdiction: TaxJurisdiction = 'IN') {
    this.jurisdiction = jurisdiction;
    
    if (jurisdiction === 'IN') {
      this.stcgRate = TAX_CONFIG.STCG_RATE;
      this.ltcgRate = TAX_CONFIG.LTCG_RATE;
      this.ltcgExemption = TAX_CONFIG.LTCG_EXEMPTION;
      this.holdingPeriodDays = TAX_CONFIG.LTCG_HOLDING_PERIOD_DAYS;
      this.cessRate = TAX_CONFIG.CESS_RATE;
    } else {
      // US defaults (simplified)
      this.stcgRate = 0.22;
      this.ltcgRate = 0.15;
      this.ltcgExemption = 0;
      this.holdingPeriodDays = 365;
      this.cessRate = 0;
    }
  }

  /**
   * Calculate holding period in days from buy date to today
   */
  private getHoldingPeriodDays(buyDate: string): number {
    const buy = new Date(buyDate);
    const today = new Date();
    const diffMs = today.getTime() - buy.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }


  /**
   * Calculate tax on gains with surcharge and cess (India only)
   */
  private calculateTax(
    gain: number, 
    isLongTerm: boolean, 
    exemptionAlreadyUsed: number = 0
  ): { tax: number; exemptionUsed: number } {
    if (gain <= 0) {
      return { tax: 0, exemptionUsed: 0 };
    }

    let taxableGain = gain;
    let exemptionUsed = 0;
    let rate: number;

    if (isLongTerm && this.jurisdiction === 'IN') {
      // Apply LTCG exemption (₹1.25L)
      const exemptionAvailable = Math.max(0, this.ltcgExemption - exemptionAlreadyUsed);
      exemptionUsed = Math.min(exemptionAvailable, gain);
      taxableGain = Math.max(0, gain - exemptionUsed);
      rate = this.ltcgRate;
    } else if (isLongTerm) {
      rate = this.ltcgRate;
    } else {
      rate = this.stcgRate;
    }

    if (taxableGain <= 0) {
      return { tax: 0, exemptionUsed };
    }

    let baseTax = taxableGain * rate;

    // Add surcharge for India (simplified - actual brackets are complex)
    if (this.jurisdiction === 'IN' && taxableGain > TAX_CONFIG.SURCHARGE_10_THRESHOLD) {
      if (taxableGain > TAX_CONFIG.SURCHARGE_15_THRESHOLD) {
        baseTax *= 1.15; // 15% surcharge
      } else {
        baseTax *= 1.10; // 10% surcharge
      }
    }

    // Add cess (4% for India)
    if (this.jurisdiction === 'IN') {
      baseTax *= (1 + this.cessRate);
    }

    return { 
      tax: Math.round(baseTax * 100) / 100, 
      exemptionUsed 
    };
  }

  /**
   * Analyze a single tax lot
   */
  analyzeLot(
    lot: TaxLot,
    currentPrice: number,
    exemptionUsed: number = 0
  ): TaxLotAnalysis {
    const holdingPeriodDays = this.getHoldingPeriodDays(lot.buyDate);
    const isLongTerm = holdingPeriodDays >= this.holdingPeriodDays;
    
    const costBasis = lot.quantity * lot.buyPrice;
    const marketValue = lot.quantity * currentPrice;
    const unrealizedGain = marketValue - costBasis;
    const unrealizedGainPercent = costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0;
    
    const gainType: GainType = unrealizedGain >= 0 
      ? (isLongTerm ? 'LTCG' : 'STCG') 
      : 'LOSS';
    
    const { tax: projectedTax } = 
      this.calculateTax(unrealizedGain, isLongTerm, exemptionUsed);
    
    const netProceeds = marketValue - projectedTax;

    return {
      lotId: lot.id,
      ticker: lot.ticker,
      dematAccountId: lot.dematAccountId,
      quantity: lot.quantity,
      buyPrice: lot.buyPrice,
      buyDate: lot.buyDate,
      holdingPeriodDays,
      isLongTerm,
      currentPrice,
      costBasis,
      marketValue,
      unrealizedGain,
      unrealizedGainPercent,
      gainType,
      projectedTax,
      netProceeds,
    };
  }

  /**
   * Compute full tax analysis from PortfolioSnapshot
   * 
   * REQUIRES: Valid PortfolioSnapshot from connected demat
   * FAILS: If snapshot is null (no demat connected)
   */
  computeFromSnapshot(
    snapshot: PortfolioSnapshot | null,
    prices?: Record<string, number>
  ): TaxComputationResult {
    // CRITICAL: Check for valid snapshot
    if (!snapshot) {
      return this.createErrorResult('NO_DEMAT', 'Tax analysis unavailable. No demat account connected.');
    }

    if (snapshot.holdings.length === 0) {
      return this.createErrorResult('NO_DATA', 'No holdings found. Import your portfolio to see tax analysis.');
    }

    // Build price map from holdings if not provided
    const priceMap = prices || {};
    snapshot.holdings.forEach(h => {
      if (!priceMap[h.ticker]) {
        priceMap[h.ticker] = h.currentPrice;
      }
    });

    return this.computeTaxes(snapshot.holdings, snapshot.taxLots, snapshot.accounts, priceMap);
  }

  /**
   * Compute full tax analysis for portfolio
   */
  computeTaxes(
    _holdings: Holding[],
    taxLots: TaxLot[],
    accounts: DematAccount[],
    prices: Record<string, number>
  ): TaxComputationResult {
    const byDemat: Record<string, DematTaxSummary> = {};
    const warnings: string[] = [];
    
    // Initialize per-demat summaries
    accounts.forEach(account => {
      byDemat[account.id] = {
        accountId: account.id,
        accountName: account.name,
        stcgGains: 0,
        stcgLosses: 0,
        stcgNetTaxable: 0,
        stcgTax: 0,
        ltcgGains: 0,
        ltcgLosses: 0,
        ltcgExemptionUsed: 0,
        ltcgNetTaxable: 0,
        ltcgTax: 0,
        totalTax: 0,
        totalProceeds: 0,
        netCash: 0,
        lots: [],
      };
    });

    // Track global LTCG exemption usage
    let totalLtcgExemptionUsed = 0;

    // Analyze all tax lots
    taxLots.forEach(lot => {
      const currentPrice = prices[lot.ticker];
      
      if (!currentPrice || currentPrice <= 0) {
        warnings.push(`No valid price for ${lot.ticker}`);
        return;
      }

      const analysis = this.analyzeLot(lot, currentPrice, totalLtcgExemptionUsed);
      
      const demat = byDemat[lot.dematAccountId];
      if (!demat) {
        // Create a default demat entry for orphaned lots
        byDemat[lot.dematAccountId] = {
          accountId: lot.dematAccountId,
          accountName: 'Unknown Account',
          stcgGains: 0,
          stcgLosses: 0,
          stcgNetTaxable: 0,
          stcgTax: 0,
          ltcgGains: 0,
          ltcgLosses: 0,
          ltcgExemptionUsed: 0,
          ltcgNetTaxable: 0,
          ltcgTax: 0,
          totalTax: 0,
          totalProceeds: 0,
          netCash: 0,
          lots: [],
        };
      }

      const targetDemat = byDemat[lot.dematAccountId];
      targetDemat.lots.push(analysis);
      targetDemat.totalProceeds += analysis.marketValue;

      if (analysis.unrealizedGain >= 0) {
        if (analysis.isLongTerm) {
          targetDemat.ltcgGains += analysis.unrealizedGain;
        } else {
          targetDemat.stcgGains += analysis.unrealizedGain;
        }
      } else {
        if (analysis.isLongTerm) {
          targetDemat.ltcgLosses += Math.abs(analysis.unrealizedGain);
        } else {
          targetDemat.stcgLosses += Math.abs(analysis.unrealizedGain);
        }
      }
    });

    // Calculate taxes per demat
    let totalStcgGains = 0;
    let totalStcgLosses = 0;
    let totalLtcgGains = 0;
    let totalLtcgLosses = 0;
    let totalStcgTax = 0;
    let totalLtcgTax = 0;
    let totalProceeds = 0;

    Object.values(byDemat).forEach(demat => {
      // STCG: Net gains - losses (loss can offset within STCG)
      demat.stcgNetTaxable = Math.max(0, demat.stcgGains - demat.stcgLosses);
      const { tax: stcgTax } = this.calculateTax(demat.stcgNetTaxable, false);
      demat.stcgTax = stcgTax;

      // LTCG: Apply exemption across portfolio
      demat.ltcgNetTaxable = Math.max(0, demat.ltcgGains - demat.ltcgLosses);
      const exemptionAvailable = Math.max(0, this.ltcgExemption - totalLtcgExemptionUsed);
      const exemptionForDemat = Math.min(exemptionAvailable, demat.ltcgNetTaxable);
      demat.ltcgExemptionUsed = exemptionForDemat;
      totalLtcgExemptionUsed += exemptionForDemat;

      const ltcgTaxable = Math.max(0, demat.ltcgNetTaxable - exemptionForDemat);
      demat.ltcgTax = ltcgTaxable * this.ltcgRate * (1 + this.cessRate);
      demat.ltcgTax = Math.round(demat.ltcgTax * 100) / 100;

      demat.totalTax = demat.stcgTax + demat.ltcgTax;
      demat.netCash = demat.totalProceeds - demat.totalTax;

      // Aggregate totals
      totalStcgGains += demat.stcgGains;
      totalStcgLosses += demat.stcgLosses;
      totalLtcgGains += demat.ltcgGains;
      totalLtcgLosses += demat.ltcgLosses;
      totalStcgTax += demat.stcgTax;
      totalLtcgTax += demat.ltcgTax;
      totalProceeds += demat.totalProceeds;
    });

    // Find optimal demat for selling (lowest effective tax rate)
    let optimalDematForSale: string | null = null;
    let lowestTaxRate = Infinity;

    Object.values(byDemat).forEach(demat => {
      if (demat.totalProceeds > 0) {
        const effectiveRate = demat.totalTax / demat.totalProceeds;
        if (effectiveRate < lowestTaxRate) {
          lowestTaxRate = effectiveRate;
          optimalDematForSale = demat.accountId;
        }
      }
    });

    return {
      success: true,
      byDemat,
      totals: {
        stcgGains: totalStcgGains,
        stcgLosses: totalStcgLosses,
        stcgTax: totalStcgTax,
        ltcgGains: totalLtcgGains,
        ltcgLosses: totalLtcgLosses,
        ltcgExemptionUsed: totalLtcgExemptionUsed,
        ltcgExemptionRemaining: Math.max(0, this.ltcgExemption - totalLtcgExemptionUsed),
        ltcgTax: totalLtcgTax,
        totalTax: totalStcgTax + totalLtcgTax,
        totalProceeds,
        netCash: totalProceeds - (totalStcgTax + totalLtcgTax),
      },
      recommendation: {
        optimalDematForSale,
        strategy: 'MIN_TAX',
        reason: optimalDematForSale 
          ? `${byDemat[optimalDematForSale]?.accountName} has lowest effective tax rate`
          : 'No holdings to analyze',
      },
      warnings,
    };
  }

  /**
   * Create a sell plan for specific ticker with given strategy
   */
  createSellPlan(
    ticker: string,
    quantity: number,
    strategy: SellStrategy,
    snapshot: PortfolioSnapshot | null,
    prices?: Record<string, number>
  ): SellPlan {
    if (!snapshot) {
      throw new TaxEngineError('NO_DEMAT', 'Cannot create sell plan: No demat connected');
    }

    const priceMap = prices || {};
    snapshot.holdings.forEach(h => {
      if (!priceMap[h.ticker]) {
        priceMap[h.ticker] = h.currentPrice;
      }
    });

    const currentPrice = priceMap[ticker];
    if (!currentPrice || currentPrice <= 0) {
      throw new TaxEngineError('NO_PRICE', `No valid price available for ${ticker}`);
    }

    // Get all lots for this ticker
    const relevantLots = snapshot.taxLots.filter(lot => lot.ticker === ticker);
    
    if (relevantLots.length === 0) {
      throw new TaxEngineError('NO_DATA', `No holdings found for ${ticker}`);
    }

    // Analyze all lots
    const allLots: TaxLotAnalysis[] = relevantLots.map(lot => 
      this.analyzeLot(lot, currentPrice)
    );

    // Sort lots based on strategy
    let sortedLots: TaxLotAnalysis[];
    switch (strategy) {
      case 'FIFO':
        sortedLots = [...allLots].sort((a, b) => 
          new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime()
        );
        break;
      case 'LIFO':
        sortedLots = [...allLots].sort((a, b) => 
          new Date(b.buyDate).getTime() - new Date(a.buyDate).getTime()
        );
        break;
      case 'HIFO':
        sortedLots = [...allLots].sort((a, b) => b.buyPrice - a.buyPrice);
        break;
      case 'MIN_TAX':
        // Prefer: 1) Long-term 2) Lowest gain %
        sortedLots = [...allLots].sort((a, b) => {
          if (a.isLongTerm !== b.isLongTerm) return a.isLongTerm ? -1 : 1;
          return a.unrealizedGainPercent - b.unrealizedGainPercent;
        });
        break;
    }

    // Select lots until we reach target quantity
    let remainingQty = quantity;
    const selectedLots: TaxLotAnalysis[] = [];

    for (const lot of sortedLots) {
      if (remainingQty <= 0) break;
      
      const useQty = Math.min(lot.quantity, remainingQty);
      if (useQty > 0) {
        // Create partial lot if needed
        const partialLot: TaxLotAnalysis = {
          ...lot,
          quantity: useQty,
          costBasis: useQty * lot.buyPrice,
          marketValue: useQty * currentPrice,
          unrealizedGain: useQty * (currentPrice - lot.buyPrice),
        };
        
        // Recalculate tax for partial quantity
        const { tax } = this.calculateTax(partialLot.unrealizedGain, lot.isLongTerm);
        partialLot.projectedTax = tax;
        partialLot.netProceeds = partialLot.marketValue - tax;
        
        selectedLots.push(partialLot);
        remainingQty -= useQty;
      }
    }

    // Compute totals
    const totalQuantity = selectedLots.reduce((sum, l) => sum + l.quantity, 0);
    const totalProceeds = selectedLots.reduce((sum, l) => sum + l.marketValue, 0);
    const totalCost = selectedLots.reduce((sum, l) => sum + l.costBasis, 0);
    const totalGain = totalProceeds - totalCost;

    const stcgTax = selectedLots
      .filter(l => !l.isLongTerm && l.unrealizedGain > 0)
      .reduce((sum, l) => sum + l.projectedTax, 0);
    
    const ltcgTax = selectedLots
      .filter(l => l.isLongTerm && l.unrealizedGain > 0)
      .reduce((sum, l) => sum + l.projectedTax, 0);

    const totalTax = stcgTax + ltcgTax;
    const netCash = totalProceeds - totalTax;
    const effectiveTaxRate = totalProceeds > 0 ? totalTax / totalProceeds : 0;

    // Calculate savings vs FIFO (only if not already FIFO)
    let taxSavingsVsFIFO = 0;
    if (strategy !== 'FIFO') {
      try {
        const fifoPlan = this.createSellPlan(ticker, quantity, 'FIFO', snapshot, prices);
        taxSavingsVsFIFO = fifoPlan.totalTax - totalTax;
      } catch {
        // If FIFO plan fails, savings are 0
      }
    }

    return {
      lots: selectedLots,
      strategy,
      totalQuantity,
      totalProceeds,
      totalCost,
      totalGain,
      stcgTax,
      ltcgTax,
      totalTax,
      netCash,
      effectiveTaxRate,
      taxSavingsVsFIFO,
    };
  }

  /**
   * Create an error result
   */
  private createErrorResult(_code: string, message: string): TaxComputationResult {
    return {
      success: false,
      error: message,
      byDemat: {},
      totals: {
        stcgGains: 0,
        stcgLosses: 0,
        stcgTax: 0,
        ltcgGains: 0,
        ltcgLosses: 0,
        ltcgExemptionUsed: 0,
        ltcgExemptionRemaining: this.ltcgExemption,
        ltcgTax: 0,
        totalTax: 0,
        totalProceeds: 0,
        netCash: 0,
      },
      recommendation: {
        optimalDematForSale: null,
        strategy: 'FIFO',
        reason: message,
      },
      warnings: [message],
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE (India default)
// =============================================================================

export const taxEngine = new TaxEngine('IN');
