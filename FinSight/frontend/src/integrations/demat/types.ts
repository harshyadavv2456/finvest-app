/**
 * Demat Integration Types
 * 
 * These types define the contract for all demat provider integrations.
 * All providers must implement these interfaces.
 * 
 * RULES:
 * - READ-ONLY mode (no execution)
 * - No mock data
 * - No fallbacks
 * - Explicit state machine
 */

// =============================================================================
// AUTHENTICATION STATE MACHINE
// =============================================================================

export type AuthState = 
  | { status: 'disconnected' }
  | { status: 'connecting'; provider: string }
  | { status: 'awaiting_auth'; authUrl: string; provider: string }
  | { status: 'connected'; provider: string; accountId: string; lastSync: string }
  | { status: 'error'; provider: string; error: string };

// =============================================================================
// CORE DATA TYPES
// =============================================================================

export interface Holding {
  /** Unique identifier for this holding */
  id: string;
  
  /** Stock ticker/symbol */
  ticker: string;
  
  /** Exchange (NSE, BSE, NYSE, etc.) */
  exchange: string;
  
  /** ISIN code (if available) */
  isin?: string;
  
  /** Company name */
  companyName: string;
  
  /** Total quantity held */
  quantity: number;
  
  /** Average buy price */
  avgBuyPrice: number;
  
  /** Current market price (from broker) */
  currentPrice: number;
  
  /** Last traded price timestamp */
  priceTimestamp: string;
  
  /** Unrealized P&L */
  unrealizedPnL: number;
  
  /** Unrealized P&L percentage */
  unrealizedPnLPercent: number;
  
  /** Day's change */
  dayChange: number;
  
  /** Day's change percentage */
  dayChangePercent: number;
  
  /** Market value (quantity * current price) */
  marketValue: number;
  
  /** Cost basis (quantity * avg buy price) */
  costBasis: number;
  
  /** Product type (CNC, MIS, NRML) */
  productType: 'CNC' | 'MIS' | 'NRML' | 'OTHER';
  
  /** Source demat account ID */
  dematAccountId: string;
}

export interface TaxLot {
  /** Unique identifier */
  id: string;
  
  /** Stock ticker */
  ticker: string;
  
  /** Quantity in this lot */
  quantity: number;
  
  /** Purchase price per unit */
  buyPrice: number;
  
  /** Purchase date (ISO string) */
  buyDate: string;
  
  /** Trade ID from broker (if available) */
  tradeId?: string;
  
  /** Order ID from broker (if available) */
  orderId?: string;
  
  /** Demat account ID */
  dematAccountId: string;
}

export interface Trade {
  /** Trade ID from broker */
  tradeId: string;
  
  /** Order ID */
  orderId: string;
  
  /** Stock ticker */
  ticker: string;
  
  /** Exchange */
  exchange: string;
  
  /** Buy or Sell */
  transactionType: 'BUY' | 'SELL';
  
  /** Quantity */
  quantity: number;
  
  /** Price per unit */
  price: number;
  
  /** Total value */
  value: number;
  
  /** Trade timestamp */
  timestamp: string;
  
  /** Trade date (YYYY-MM-DD) */
  tradeDate: string;
  
  /** Product type */
  productType: 'CNC' | 'MIS' | 'NRML' | 'OTHER';
  
  /** Order type */
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SLM';
  
  /** Demat account ID */
  dematAccountId: string;
  
  /** Status */
  status: 'COMPLETE' | 'CANCELLED' | 'REJECTED' | 'PENDING';
}

export interface CashBalance {
  /** Total available cash for trading */
  available: number;
  
  /** Cash used as margin */
  usedMargin: number;
  
  /** Cash blocked for open orders */
  blocked: number;
  
  /** Total cash (available + used + blocked) */
  total: number;
  
  /** Currency code */
  currency: 'INR' | 'USD';
  
  /** Last updated timestamp */
  lastUpdated: string;
  
  /** Demat account ID */
  dematAccountId: string;
}

export interface DematAccount {
  /** Unique identifier */
  id: string;
  
  /** Provider name */
  provider: DematProviderType;
  
  /** Display name (user-defined or from broker) */
  name: string;
  
  /** Account/Client ID from broker */
  clientId: string;
  
  /** Connection status */
  status: 'connected' | 'disconnected' | 'error';
  
  /** Last successful sync */
  lastSync: string | null;
  
  /** Error message if status is error */
  error: string | null;
  
  /** Whether this is the primary account */
  isPrimary: boolean;
}

// =============================================================================
// PROVIDER TYPES
// =============================================================================

export type DematProviderType = 
  | 'zerodha'
  | 'groww'
  | 'upstox'
  | 'angelone'
  | 'dhan'
  | 'csv'  // Fallback for manual import
  | 'demo'; // DISABLED - for testing only

export interface ProviderCapabilities {
  /** Can fetch real-time holdings */
  holdings: boolean;
  
  /** Can fetch historical trades */
  trades: boolean;
  
  /** Can fetch cash balance */
  cash: boolean;
  
  /** Can fetch tax lots (or derive from trades) */
  taxLots: boolean | 'derived';
  
  /** Supports real-time price updates */
  realtime: boolean;
  
  /** Requires OAuth flow */
  oauth: boolean;
  
  /** Supports API key authentication */
  apiKey: boolean;
}

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

/**
 * Every demat provider must implement this interface.
 * 
 * CRITICAL RULES:
 * - READ-ONLY: No execution methods
 * - EXPLICIT ERRORS: Never silently fail
 * - NO FALLBACKS: If data unavailable, throw
 */
export interface IDematProvider {
  /** Provider identifier */
  readonly id: DematProviderType;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;
  
  /**
   * Initiate connection to broker
   * Returns auth URL for OAuth or connects directly for API key
   */
  connect(credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState>;
  
  /**
   * Handle OAuth callback
   * Only for OAuth-based providers
   */
  handleCallback?(code: string, state: string): Promise<AuthState>;
  
  /**
   * Disconnect from broker
   * Clears all tokens and session data
   */
  disconnect(): Promise<void>;
  
  /**
   * Fetch current holdings
   * MUST throw if not connected
   */
  fetchHoldings(): Promise<Holding[]>;
  
  /**
   * Fetch historical trades
   * @param fromDate Start date (ISO string)
   * @param toDate End date (ISO string)
   */
  fetchTrades(fromDate: string, toDate: string): Promise<Trade[]>;
  
  /**
   * Fetch current cash balance
   */
  fetchCash(): Promise<CashBalance>;
  
  /**
   * Derive tax lots from trades
   * Uses FIFO by default
   */
  deriveTaxLots?(trades: Trade[]): TaxLot[];
  
  /**
   * Check if currently connected and token is valid
   */
  isConnected(): boolean;
  
  /**
   * Get current auth state
   */
  getAuthState(): AuthState;
  
  /**
   * Get demat account info
   */
  getAccountInfo(): DematAccount | null;
}

// =============================================================================
// PORTFOLIO SNAPSHOT
// =============================================================================

/**
 * Normalized portfolio snapshot from all connected demats
 */
export interface PortfolioSnapshot {
  /** Snapshot timestamp */
  timestamp: string;
  
  /** All connected accounts */
  accounts: DematAccount[];
  
  /** Holdings across all accounts */
  holdings: Holding[];
  
  /** Tax lots across all accounts */
  taxLots: TaxLot[];
  
  /** Cash balances per account */
  cashBalances: CashBalance[];
  
  /** Total portfolio value */
  totalValue: number;
  
  /** Total cost basis */
  totalCostBasis: number;
  
  /** Total unrealized P&L */
  totalUnrealizedPnL: number;
  
  /** Total cash */
  totalCash: number;
  
  /** Is any data stale? */
  hasStaleData: boolean;
  
  /** Data freshness per source */
  dataFreshness: Record<string, { lastSync: string; isStale: boolean }>;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class DematConnectionError extends Error {
  constructor(
    public provider: DematProviderType,
    public code: 'AUTH_FAILED' | 'TOKEN_EXPIRED' | 'NETWORK_ERROR' | 'API_ERROR' | 'NOT_CONNECTED',
    message: string
  ) {
    super(message);
    this.name = 'DematConnectionError';
  }
}

export class DematDataError extends Error {
  constructor(
    public provider: DematProviderType,
    public dataType: 'holdings' | 'trades' | 'cash' | 'taxLots',
    message: string
  ) {
    super(message);
    this.name = 'DematDataError';
  }
}

// Aliases for backward compatibility
export type DematHolding = Holding;
export type DematTaxLot = TaxLot;

