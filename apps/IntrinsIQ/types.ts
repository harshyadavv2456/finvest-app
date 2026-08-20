export interface KeyMetrics {
  peRatio: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  beta: number | null;
  dividendYield: number | null;
  debtToEquity: number | null;
}

export interface AnalysisResult {
  ticker: string;
  companyName: string;
  currentPrice: number;
  intrinsicValue: number;
  marginOfSafety: number; // percentage
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  summary: string;
  detailedReport: string; // Markdown content
  keyMetrics: KeyMetrics;
  valuationMethodology: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface FullAnalysisResponse {
  analysis: AnalysisResult | null;
  groundingSources: GroundingSource[];
  rawText?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
