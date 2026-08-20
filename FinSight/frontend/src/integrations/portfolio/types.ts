/**
 * Portfolio Ingestion Types
 * 
 * Normalized schema for portfolio data from various sources:
 * - CAMS Consolidated Account Statement (CAS)
 * - CDSL Easiest / EasiestEST
 * - NSDL CAS
 * 
 * This is the SINGLE SOURCE OF TRUTH for portfolio data.
 * No mock data. No placeholders. Real ingested data only.
 */

// Supported ingestion sources
export type IngestionSource = 'CAMS_CAS' | 'CDSL_EASIEST' | 'NSDL_CAS' | 'MANUAL_CSV';

// Supported exchanges
export type Exchange = 'NSE' | 'BSE';

// Supported markets
export type Market = 'IN' | 'US';

// Transaction types
export type TransactionType = 'BUY' | 'SELL';

/**
 * Individual holding in the portfolio
 */
export interface Holding {
  symbol: string;           // Trading symbol (e.g., RELIANCE, INFY)
  isin: string;             // ISIN code for unique identification
  quantity: number;         // Current quantity held
  avg_price: number;        // Average acquisition price
  acquisition_date: string; // ISO date of first acquisition
  exchange: Exchange;       // NSE or BSE
  market: Market;           // IN or US
  // Computed fields
  current_value?: number;   // quantity * current_price (set by PriceService)
  unrealized_pnl?: number;  // current_value - (quantity * avg_price)
  holding_days?: number;    // Days since acquisition
  is_ltcg_eligible?: boolean; // Holding > 365 days (India)
}

/**
 * Individual transaction record
 */
export interface Transaction {
  symbol: string;
  isin: string;
  date: string;             // ISO date of transaction
  type: TransactionType;    // BUY or SELL
  quantity: number;
  price: number;            // Price per share
  charges: number;          // Brokerage + taxes + other charges
  exchange: Exchange;
  // For FIFO tax calculation
  lot_id?: string;          // Unique identifier for tax lot tracking
}

/**
 * Normalized portfolio snapshot
 * This is the ONLY format that PortfolioCore accepts
 */
export interface PortfolioSnapshot {
  // Metadata
  demat_id: string;         // DP ID or account identifier
  broker: string;           // Broker name (Zerodha, Angel, etc.)
  source: IngestionSource;  // Where this data came from
  ingested_at: string;      // ISO timestamp of ingestion
  version: string;          // Snapshot version (YYYY-MM-DD-HH)
  
  // Data
  holdings: Holding[];
  transactions: Transaction[];
  
  // Summary
  total_holdings: number;
  total_invested: number;   // Sum of (quantity * avg_price) for all holdings
  
  // Validation
  is_valid: boolean;
  validation_errors: string[];
}

/**
 * Ingestion result
 */
export interface IngestionResult {
  success: boolean;
  snapshot?: PortfolioSnapshot;
  error?: string;
  warnings: string[];
}

/**
 * User tax profile for TaxAwareAllocator
 */
export interface TaxProfile {
  tax_residency: 'IN' | 'US' | 'OTHER';
  // Capital gains buckets (in INR for India)
  stcg_rate: number;        // Short-term capital gains rate (15% in India)
  ltcg_rate: number;        // Long-term capital gains rate (10% in India above 1L exemption)
  ltcg_exemption: number;   // Annual LTCG exemption (1,00,000 in India)
  // Loss carry forward
  loss_carry_forward: number; // Losses from previous years that can be set off
  // For US residents
  wash_sale_applicable: boolean;
}

/**
 * Portfolio state for UI
 */
export type PortfolioState = 
  | { status: 'NOT_CONNECTED'; reason: string }
  | { status: 'LOADING' }
  | { status: 'ERROR'; error: string }
  | { status: 'READY'; snapshot: PortfolioSnapshot };

/**
 * Enriched holding with computed values
 */
export interface EnrichedHolding extends Holding {
  // Price data
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  
  // Holding period
  holding_days: number;
  is_ltcg_eligible: boolean;
  days_to_ltcg: number;
  
  // Classification
  sector: string;
  
  // FinSight data
  finsight_intent?: string;
  finsight_conviction?: number;
}

