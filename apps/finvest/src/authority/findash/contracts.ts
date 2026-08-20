/**
 * FinDash Authority Contracts
 * 
 * AUTHORITY: LOCKED
 * FinDash is the DATA AUTHORITY for real-time market data.
 * These contracts define the data schemas from FinDash.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export interface StockDataPoint {
  timestamp: number;
  price: number;
  volume?: number;
}

export interface StockRatios {
  marketCap: string;
  peRatio: number | null;
  eps: number;
  dividendYield: number | null;
  beta: number;
  high52Week: number;
  low52Week: number;
}

export interface StockAnalytics {
  sma20?: number;
  sma50?: number;
  rsi?: number;
  macd?: number;
  volatility?: number;
  volumeChange?: number;
  support?: number;
  resistance?: number;
}

export interface StockFundamentals {
  revenue?: number;
  netIncome?: number;
  totalAssets?: number;
  totalDebt?: number;
  totalEquity?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  roe?: number;
  roa?: number;
  currentRatio?: number;
  debtToEquity?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  analystTargetPrice?: number;
  analystTargetHigh?: number;
  analystTargetLow?: number;
  analystRecommendations?: {
    strongBuy?: number;
    buy?: number;
    hold?: number;
    sell?: number;
    strongSell?: number;
  };
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  history: StockDataPoint[];
  ratios: StockRatios;
  volume?: number;
  averageVolume?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  analytics?: StockAnalytics;
  fundamentals?: StockFundamentals;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface MarketQuoteResponse {
  success: boolean;
  data: Stock | null;
  timestamp: string;
  source: 'findash';
  authority: 'LIVE';
}

export interface MarketOHLCResponse {
  success: boolean;
  symbol: string;
  data: StockDataPoint[];
  interval: string;
  range: string;
  timestamp: string;
  source: 'findash';
  authority: 'LIVE';
}

export interface MarketIndicatorsResponse {
  success: boolean;
  symbol: string;
  analytics: StockAnalytics | null;
  timestamp: string;
  source: 'findash';
  authority: 'LIVE';
}

export interface MarketStatusResponse {
  success: boolean;
  findash: {
    status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
    url: string;
    port: number;
    lastCheck: string;
  };
  dataSource: 'yfinance';
  authority: 'LIVE';
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const FINDASH_PORT = 3000;
export const FINDASH_URL = `http://localhost:${FINDASH_PORT}`;
export const DATA_SOURCE = 'yfinance' as const;
export const AUTHORITY = 'LIVE' as const;

