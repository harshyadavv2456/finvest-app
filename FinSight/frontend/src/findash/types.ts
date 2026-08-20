export interface StockDataPoint {
  timestamp: number;
  price: number;
  volume?: number;
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

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevance?: number;
  publishedTime?: string;
}

export interface PromoterInfo {
  name: string;
  role: string;
  holdingPercentage?: number;
  background?: string;
  plans?: string;
  experience?: string;
}

export interface PromoterData {
  totalPromoterHolding?: number;
  promoterPledge?: number;
  promoters?: PromoterInfo[];
  fiiHolding?: number;
  diiHolding?: number;
  publicHolding?: number;
  institutionalHolding?: number;
  aiGeneratedSummary?: string;
}

export interface FinancialHealthScore {
  overall: number;
  profitability: number;
  liquidity: number;
  solvency: number;
  efficiency: number;
  growth: number;
  insights: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface MarketPosition {
  sectorRank?: number;
  indexRank?: number;
  sectorPerformance?: {
    oneMonth?: number;
    threeMonth?: number;
    oneYear?: number;
  };
  indexPerformance?: {
    oneMonth?: number;
    threeMonth?: number;
    oneYear?: number;
  };
  vsSectorPE?: number;
  vsSectorROE?: number;
  vsSectorDebtEquity?: number;
}

export interface StockRatios {
  marketCap: string;
  peRatio: number | null;
  eps: number;
  dividendYield: number | null;
  beta: number;
  high52Week: number;
  low52Week: number;
  pbRatio?: number | null;
  pegRatio?: number | null;
  evEbitda?: number | null;
  psRatio?: number | null;
  roce?: number | null;
  netProfitMargin?: number | null;
  operatingMargin?: number | null;
  ebitdaMargin?: number | null;
  quickRatio?: number | null;
  interestCoverage?: number | null;
  assetTurnover?: number | null;
  bookValuePerShare?: number | null;
  cashPerShare?: number | null;
  salesPerShare?: number | null;
  dividendPerShare?: number | null;
  payoutRatio?: number | null;
  sharpeRatio?: number | null;
  sortinoRatio?: number | null;
}

export interface StockAnalytics {
  sma20?: number;
  sma50?: number;
  rsi?: number;
  macd?: number;
  volumeChange?: number;
  volatility?: number;
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
  operatingCashFlow?: number;
  freeCashFlow?: number;
  roe?: number;
  roa?: number;
  currentRatio?: number;
  debtToEquity?: number;
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
  revenueGrowth?: number;
  netIncomeGrowth?: number;
  operatingIncome?: number;
  ebitda?: number;
  sharesOutstanding?: number;
  float?: number;
  revenueHistory?: Array<{ date: number; value: number }>;
  profitHistory?: Array<{ date: number; value: number }>;
  annualDividend?: number;
  dividendGrowth?: number;
  exDividendDate?: number;
  revenueCAGR3Y?: number;
  revenueCAGR5Y?: number;
  profitCAGR3Y?: number;
  profitCAGR5Y?: number;
  epsGrowth?: number;
}

export interface ChartDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';
export type ChartType = 'line' | 'candlestick' | 'area';
