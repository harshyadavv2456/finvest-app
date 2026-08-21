/**
 * StrataX TypeScript Type Definitions
 * 
 * All types for the StrataX options analytics module.
 * Designed to be easily migrated to database schema later.
 */

export type OptionType = 'CALL' | 'PUT';
export type ActionType = 'BUY' | 'SELL';

/**
 * Canonical option row schema matching backend StrataXOptionRow and CSV structure.
 */
export interface StrataXOptionRow {
  symbol: string;
  kind: 'index' | 'equity';
  underlying?: string | null;
  underlyingValue?: number | null;
  timestamp?: string | null;
  expiryDate: string;
  strikePrice: number;
  optionType: 'CE' | 'PE';
  lastPrice?: number | null;
  change?: number | null;
  pChange?: number | null;
  openInterest?: number | null;
  changeInOI?: number | null;
  totalTradedVolume?: number | null;
  impliedVolatility?: number | null;
  bidQty?: number | null;
  bidPrice?: number | null;
  askPrice?: number | null;
  askQty?: number | null;
  identifier?: string | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
}

/**
 * Legacy format (deprecated, kept for backward compatibility).
 * @deprecated Use StrataXOptionRow instead
 */
export interface StrataXOptionChainRow {
  strike: number;
  call: {
    ltp?: number;
    change?: number;
    volume?: number;
    oi?: number;
    oiChange?: number;
    iv?: number;
  };
  put: {
    ltp?: number;
    change?: number;
    volume?: number;
    oi?: number;
    oiChange?: number;
    iv?: number;
  };
}

export interface StrataXOptionChain {
  underlying: string;
  expiry: string; // ISO date string
  spotPrice: number;
  rows: StrataXOptionChainRow[];
  timestamp: string; // ISO timestamp
}

export interface StrataXOptionLeg {
  id: string; // Unique identifier for this leg
  underlying: string;
  expiry: string; // ISO date string
  optionType: OptionType;
  action: ActionType;
  strike: number;
  quantity: number;
  entryPrice: number; // Price per contract
}

export interface StrataXStrategy {
  id: string; // Unique identifier
  name?: string;
  legs: StrataXOptionLeg[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface StrataXStrategyAnalysis {
  netPremium: number; // Total credit/debit
  maxProfit: number | null; // null if unlimited
  maxLoss: number | null; // null if unlimited
  breakevenPoints: number[]; // Array of breakeven prices
  payoff: Array<{ underlyingPrice: number; pnl: number }>; // Payoff curve data
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  legGreeks: Array<{
    legId: string;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  }>;
}

export interface StrataXPaperTrade {
  id: string; // Unique identifier
  name: string;
  strategy: StrataXStrategy;
  entryTimestamp: string; // ISO timestamp
  currentPnL?: number; // Current P&L if option prices available
  notes?: string;
}

export interface StrataXSignal {
  underlying: string;
  highestOIStrikes: Array<{
    strike: number;
    oi: number;
    optionType: OptionType;
  }>;
  highestOIChange: Array<{
    strike: number;
    oiChange: number;
    optionType: OptionType;
  }>;
  pcr: number; // Put/Call Ratio
  ivRank?: number; // IV rank (0-100) if available
}

export interface StrataXGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionChainProvider {
  getOptionChain(underlying: string, expiry?: string): Promise<StrataXOptionChain>;
  getAvailableUnderlyings(): Promise<string[]>;
  getAvailableExpiries(underlying: string): Promise<string[]>;
}

