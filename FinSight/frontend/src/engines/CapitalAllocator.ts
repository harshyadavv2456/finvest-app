/**
 * CapitalAllocator - Multi-Demat Capital Planning Engine
 * 
 * Takes desired action (invest / withdraw) and simulates across all demats.
 * Minimizes:
 * - Tax liability
 * - Transaction count
 * - Risk concentration
 * 
 * REQUIRES: PortfolioSnapshot from connected demat
 * If no demat → CapitalAllocator CANNOT compute
 * 
 * NO order placement. Only plans.
 */

import { TaxEngine, SellPlan, SellStrategy } from './TaxEngine';
import { 
  DematAccount, 
  PortfolioSnapshot 
} from '../integrations/demat/types';

// =============================================================================
// TYPES
// =============================================================================

export type AllocationAction = 'invest' | 'withdraw' | 'rebalance';
export type OptimizationGoal = 'min_tax' | 'min_transactions' | 'min_concentration' | 'balanced';

export interface AllocationRequest {
  action: AllocationAction;
  amount: number; // Amount to invest or withdraw
  ticker?: string; // Specific ticker for invest/withdraw
  currency: string;
  goal: OptimizationGoal;
  maxTransactions?: number;
  maxConcentrationPercent?: number; // Max % of portfolio in single stock
}

export interface DematAllocation {
  accountId: string;
  accountName: string;
  amount: number;
  ticker?: string;
  quantity?: number;
  taxImpact: number;
  reason: string;
}

export interface AllocationPlan {
  /** Was the plan successfully created? */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  request: AllocationRequest;
  allocations: DematAllocation[];
  totalAmount: number;
  totalTax: number;
  totalTransactions: number;
  netCash: number;
  concentrationScore: number; // 0-100, lower is better
  warnings: string[];
  recommendations: string[];
  sellPlans?: SellPlan[]; // For withdrawals
  isOptimal: boolean;
}

export interface PortfolioAnalysis {
  totalValue: number;
  byDemat: Record<string, {
    value: number;
    percentOfTotal: number;
    holdings: number;
    cash: number;
  }>;
  byTicker: Record<string, {
    value: number;
    percentOfTotal: number;
    avgPrice: number;
    quantity: number;
  }>;
  concentrationRisk: {
    topHolding: { ticker: string; percent: number } | null;
    herfindahlIndex: number; // Market concentration index
    diversificationScore: number; // 0-100
  };
}

// =============================================================================
// CAPITAL ALLOCATOR
// =============================================================================

export class CapitalAllocator {
  private taxEngine: TaxEngine;

  constructor(jurisdiction: 'IN' | 'US' = 'IN') {
    this.taxEngine = new TaxEngine(jurisdiction);
  }

  /**
   * Analyze current portfolio state from snapshot
   */
  analyzePortfolio(snapshot: PortfolioSnapshot | null): PortfolioAnalysis | null {
    if (!snapshot || snapshot.holdings.length === 0) {
      return null;
    }

    const byDemat: PortfolioAnalysis['byDemat'] = {};
    const byTicker: PortfolioAnalysis['byTicker'] = {};
    let totalValue = 0;

    // Initialize demat accounts
    snapshot.accounts.forEach(account => {
      const dematCash = snapshot.cashBalances.find(c => c.dematAccountId === account.id)?.available || 0;
      byDemat[account.id] = {
        value: dematCash,
        percentOfTotal: 0,
        holdings: 0,
        cash: dematCash,
      };
      totalValue += dematCash;
    });

    // Calculate holdings values
    snapshot.holdings.forEach(holding => {
      const price = holding.currentPrice || holding.avgBuyPrice;
      const value = holding.quantity * price;
      
      // Add to demat
      if (byDemat[holding.dematAccountId]) {
        byDemat[holding.dematAccountId].value += value;
        byDemat[holding.dematAccountId].holdings++;
      }
      
      // Add to ticker aggregation
      if (!byTicker[holding.ticker]) {
        byTicker[holding.ticker] = {
          value: 0,
          percentOfTotal: 0,
          avgPrice: 0,
          quantity: 0,
        };
      }
      byTicker[holding.ticker].value += value;
      byTicker[holding.ticker].quantity += holding.quantity;
      
      totalValue += value;
    });

    // Calculate percentages
    Object.keys(byDemat).forEach(id => {
      byDemat[id].percentOfTotal = totalValue > 0 ? (byDemat[id].value / totalValue) * 100 : 0;
    });
    Object.keys(byTicker).forEach(ticker => {
      byTicker[ticker].percentOfTotal = totalValue > 0 ? (byTicker[ticker].value / totalValue) * 100 : 0;
      byTicker[ticker].avgPrice = byTicker[ticker].quantity > 0 
        ? byTicker[ticker].value / byTicker[ticker].quantity 
        : 0;
    });

    // Calculate concentration metrics
    const tickerValues = Object.values(byTicker).map(t => t.percentOfTotal);
    const topHolding = Object.entries(byTicker)
      .sort((a, b) => b[1].percentOfTotal - a[1].percentOfTotal)[0];
    
    // Herfindahl-Hirschman Index (HHI)
    const hhi = tickerValues.reduce((sum, pct) => sum + Math.pow(pct, 2), 0);
    
    // Diversification score (inverse of HHI, normalized)
    const maxHHI = 10000; // 100% in one stock
    const diversificationScore = Math.max(0, 100 - (hhi / maxHHI * 100));

    return {
      totalValue,
      byDemat,
      byTicker,
      concentrationRisk: {
        topHolding: topHolding ? { ticker: topHolding[0], percent: topHolding[1].percentOfTotal } : null,
        herfindahlIndex: hhi,
        diversificationScore,
      },
    };
  }

  /**
   * Create allocation plan from snapshot
   * 
   * REQUIRES: Valid PortfolioSnapshot
   * FAILS: If snapshot is null (no demat connected)
   */
  createPlan(
    request: AllocationRequest,
    snapshot: PortfolioSnapshot | null,
    prices?: Record<string, number>
  ): AllocationPlan {
    // CRITICAL: Check for valid snapshot
    if (!snapshot) {
      return this.createErrorPlan(request, 'NO_DEMAT', 'Capital allocation unavailable. No demat account connected.');
    }

    if (snapshot.accounts.length === 0) {
      return this.createErrorPlan(request, 'NO_ACCOUNTS', 'No demat accounts found.');
    }

    // Build price map from holdings if not provided
    const priceMap = prices || {};
    snapshot.holdings.forEach(h => {
      if (!priceMap[h.ticker]) {
        priceMap[h.ticker] = h.currentPrice;
      }
    });

    switch (request.action) {
      case 'invest':
        return this.planInvestment(request, snapshot, priceMap);
      case 'withdraw':
        return this.planWithdrawal(request, snapshot, priceMap);
      case 'rebalance':
        return this.createErrorPlan(request, 'NOT_IMPLEMENTED', 'Rebalancing is not yet implemented.');
    }
  }

  /**
   * Create investment allocation plan
   */
  private planInvestment(
    request: AllocationRequest,
    snapshot: PortfolioSnapshot,
    _prices: Record<string, number>
  ): AllocationPlan {
    const { amount, ticker, goal, maxConcentrationPercent = 20 } = request;
    const analysis = this.analyzePortfolio(snapshot);
    
    if (!analysis) {
      return this.createErrorPlan(request, 'NO_DATA', 'Unable to analyze portfolio.');
    }

    const warnings: string[] = [];
    const recommendations: string[] = [];
    const allocations: DematAllocation[] = [];

    if (amount <= 0) {
      return this.createErrorPlan(request, 'INVALID_AMOUNT', 'Investment amount must be positive.');
    }

    // Check concentration risk if specific ticker
    if (ticker) {
      const newValue = amount + (analysis.byTicker[ticker]?.value || 0);
      const projectedPercent = analysis.totalValue > 0 
        ? (newValue / (analysis.totalValue + amount)) * 100 
        : 100;

      if (projectedPercent > maxConcentrationPercent) {
        warnings.push(`Investing in ${ticker} would bring concentration to ${projectedPercent.toFixed(1)}% (>${maxConcentrationPercent}% limit)`);
        
        // Recommend max safe amount
        const safeAmount = (maxConcentrationPercent / 100) * (analysis.totalValue + amount) - (analysis.byTicker[ticker]?.value || 0);
        if (safeAmount > 0) {
          recommendations.push(`Consider limiting investment to ₹${safeAmount.toFixed(0)} to stay within concentration limit`);
        }
      }
    }

    // Determine allocation strategy based on goal
    const accounts = snapshot.accounts;
    
    switch (goal) {
      case 'min_tax':
        allocations.push(...this.allocateMinTax(amount, accounts, analysis, ticker));
        break;
      
      case 'min_transactions':
        allocations.push(...this.allocateMinTransactions(amount, accounts, analysis, ticker));
        break;
      
      case 'min_concentration':
        allocations.push(...this.allocateMinConcentration(amount, accounts, analysis, ticker));
        break;
      
      case 'balanced':
      default:
        allocations.push(...this.allocateBalanced(amount, accounts, analysis, ticker));
        break;
    }

    const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
    const totalTax = allocations.reduce((sum, a) => sum + a.taxImpact, 0);
    const totalTransactions = allocations.length;

    return {
      success: true,
      request,
      allocations,
      totalAmount,
      totalTax,
      totalTransactions,
      netCash: totalAmount - totalTax,
      concentrationScore: analysis.concentrationRisk.diversificationScore,
      warnings,
      recommendations,
      isOptimal: warnings.length === 0,
    };
  }

  /**
   * Create withdrawal plan (selling)
   */
  private planWithdrawal(
    request: AllocationRequest,
    snapshot: PortfolioSnapshot,
    prices: Record<string, number>
  ): AllocationPlan {
    const { amount, ticker, goal } = request;
    const analysis = this.analyzePortfolio(snapshot);
    
    if (!analysis) {
      return this.createErrorPlan(request, 'NO_DATA', 'Unable to analyze portfolio.');
    }

    const warnings: string[] = [];
    const recommendations: string[] = [];
    const allocations: DematAllocation[] = [];
    const sellPlans: SellPlan[] = [];
    const accounts = snapshot.accounts;
    const cashBalances = snapshot.cashBalances;

    // First, use available cash
    let remainingAmount = amount;
    const availableCash = cashBalances.reduce((sum, c) => sum + c.available, 0);
    
    if (availableCash >= amount) {
      // Can fulfill entirely from cash
      cashBalances.forEach(c => {
        if (remainingAmount <= 0) return;
        const useAmount = Math.min(c.available, remainingAmount);
        if (useAmount > 0) {
          const account = accounts.find(a => a.id === c.dematAccountId);
          allocations.push({
            accountId: c.dematAccountId,
            accountName: account?.name || 'Unknown',
            amount: useAmount,
            taxImpact: 0,
            reason: 'Cash withdrawal (no tax impact)',
          });
          remainingAmount -= useAmount;
        }
      });
    } else {
      // Need to sell holdings
      remainingAmount -= availableCash;
      
      // Use cash first
      cashBalances.forEach(c => {
        if (c.available > 0) {
          const account = accounts.find(a => a.id === c.dematAccountId);
          allocations.push({
            accountId: c.dematAccountId,
            accountName: account?.name || 'Unknown',
            amount: c.available,
            taxImpact: 0,
            reason: 'Cash withdrawal',
          });
        }
      });

      // Create sell plans for remaining
      if (ticker && prices[ticker]) {
        // Sell specific ticker
        try {
          const strategy: SellStrategy = goal === 'min_tax' ? 'MIN_TAX' : 'FIFO';
          const qty = Math.ceil(remainingAmount / prices[ticker]);
          const plan = this.taxEngine.createSellPlan(ticker, qty, strategy, snapshot, prices);
          sellPlans.push(plan);
          
          plan.lots.forEach(lot => {
            const account = accounts.find(a => a.id === lot.dematAccountId);
            allocations.push({
              accountId: lot.dematAccountId,
              accountName: account?.name || 'Unknown',
              amount: lot.quantity * lot.currentPrice,
              ticker,
              quantity: lot.quantity,
              taxImpact: lot.projectedTax,
              reason: `Sell ${lot.quantity} shares (${lot.isLongTerm ? 'LTCG' : 'STCG'})`,
            });
          });
          
          remainingAmount -= plan.totalProceeds;
        } catch (e: any) {
          warnings.push(`Could not create sell plan for ${ticker}: ${e.message}`);
        }
      } else {
        // Sell based on optimization goal
        // Sort holdings by potential tax impact (prefer losses)
        const sortedHoldings = [...snapshot.holdings]
          .map(h => ({
            ...h,
            gain: (h.currentPrice - h.avgBuyPrice) / h.avgBuyPrice,
          }))
          .sort((a, b) => a.gain - b.gain); // Losses first

        for (const holding of sortedHoldings) {
          if (remainingAmount <= 0) break;
          
          const price = prices[holding.ticker] || holding.currentPrice;
          if (!price) continue;
          
          const maxValue = holding.quantity * price;
          const sellValue = Math.min(maxValue, remainingAmount);
          const sellQty = Math.floor(sellValue / price);
          
          if (sellQty > 0) {
            try {
              const plan = this.taxEngine.createSellPlan(
                holding.ticker,
                sellQty,
                'MIN_TAX',
                snapshot,
                prices
              );
              sellPlans.push(plan);
              
              const account = accounts.find(a => a.id === holding.dematAccountId);
              allocations.push({
                accountId: holding.dematAccountId,
                accountName: account?.name || 'Unknown',
                amount: sellQty * price,
                ticker: holding.ticker,
                quantity: sellQty,
                taxImpact: plan.totalTax,
                reason: `Sell ${sellQty} ${holding.ticker}`,
              });
              
              remainingAmount -= plan.totalProceeds;
            } catch (e) {
              // Skip this holding if sell plan fails
            }
          }
        }
      }
    }

    const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
    const totalTax = allocations.reduce((sum, a) => sum + a.taxImpact, 0);

    if (remainingAmount > 0) {
      warnings.push(`Could only allocate ₹${(amount - remainingAmount).toFixed(0)} of requested ₹${amount.toFixed(0)}`);
    }

    return {
      success: true,
      request,
      allocations,
      totalAmount,
      totalTax,
      totalTransactions: allocations.length,
      netCash: totalAmount - totalTax,
      concentrationScore: analysis.concentrationRisk.diversificationScore,
      warnings,
      recommendations,
      sellPlans,
      isOptimal: warnings.length === 0,
    };
  }

  // =============================================================================
  // PRIVATE ALLOCATION STRATEGIES
  // =============================================================================

  private allocateMinTax(
    amount: number,
    accounts: DematAccount[],
    _analysis: PortfolioAnalysis,
    ticker?: string
  ): DematAllocation[] {
    // For investments, prioritize accounts with tax-loss harvesting opportunities
    // For now, just use primary account
    const primaryAccount = accounts.find(a => a.isPrimary) || accounts[0];
    if (!primaryAccount) return [];

    return [{
      accountId: primaryAccount.id,
      accountName: primaryAccount.name,
      amount,
      ticker,
      taxImpact: 0,
      reason: 'Primary account (min tax strategy)',
    }];
  }

  private allocateMinTransactions(
    amount: number,
    accounts: DematAccount[],
    analysis: PortfolioAnalysis,
    ticker?: string
  ): DematAllocation[] {
    // Single account with highest value (most capacity)
    const sortedAccounts = accounts
      .map(a => ({ account: a, value: analysis.byDemat[a.id]?.value || 0 }))
      .sort((a, b) => b.value - a.value);
    
    const topAccount = sortedAccounts[0]?.account;
    if (!topAccount) return [];

    return [{
      accountId: topAccount.id,
      accountName: topAccount.name,
      amount,
      ticker,
      taxImpact: 0,
      reason: 'Largest account (single transaction)',
    }];
  }

  private allocateMinConcentration(
    amount: number,
    accounts: DematAccount[],
    _analysis: PortfolioAnalysis,
    ticker?: string
  ): DematAllocation[] {
    // Spread evenly across accounts
    const allocations: DematAllocation[] = [];
    const amountPerAccount = amount / accounts.length;

    accounts.forEach(account => {
      allocations.push({
        accountId: account.id,
        accountName: account.name,
        amount: amountPerAccount,
        ticker,
        taxImpact: 0,
        reason: 'Even distribution (diversification)',
      });
    });

    return allocations;
  }

  private allocateBalanced(
    amount: number,
    accounts: DematAccount[],
    analysis: PortfolioAnalysis,
    ticker?: string
  ): DematAllocation[] {
    // Balance based on inverse of current concentration
    const targetPercent = 100 / accounts.length;
    
    const allocations: DematAllocation[] = [];
    let remainingAmount = amount;

    // Sort by how underweight each account is
    const sortedAccounts = accounts
      .map(a => ({
        account: a,
        currentPercent: analysis.byDemat[a.id]?.percentOfTotal || 0,
        underweight: targetPercent - (analysis.byDemat[a.id]?.percentOfTotal || 0),
      }))
      .sort((a, b) => b.underweight - a.underweight);

    sortedAccounts.forEach(({ account, underweight }) => {
      if (remainingAmount <= 0) return;
      
      // Allocate proportionally more to underweight accounts
      const weight = Math.max(0, underweight + 100) / 100;
      const allocation = Math.min(remainingAmount, amount * weight / sortedAccounts.length);
      
      if (allocation > 0) {
        allocations.push({
          accountId: account.id,
          accountName: account.name,
          amount: allocation,
          ticker,
          taxImpact: 0,
          reason: underweight > 0 
            ? `Underweight account (+${underweight.toFixed(1)}% below target)` 
            : 'Balanced allocation',
        });
        remainingAmount -= allocation;
      }
    });

    // If any remaining, add to first account
    if (remainingAmount > 0 && allocations.length > 0) {
      allocations[0].amount += remainingAmount;
    }

    return allocations;
  }

  /**
   * Create an error plan
   */
  private createErrorPlan(request: AllocationRequest, _code: string, message: string): AllocationPlan {
    return {
      success: false,
      error: message,
      request,
      allocations: [],
      totalAmount: 0,
      totalTax: 0,
      totalTransactions: 0,
      netCash: 0,
      concentrationScore: 0,
      warnings: [message],
      recommendations: [],
      isOptimal: false,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const capitalAllocator = new CapitalAllocator('IN');
