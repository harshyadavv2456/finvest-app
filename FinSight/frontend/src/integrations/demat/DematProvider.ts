/**
 * DematProvider - Base Class and Provider Registry
 * 
 * Manages all demat integrations.
 * 
 * RULES:
 * - READ-ONLY: No execution
 * - EXPLICIT: No silent failures
 * - REAL DATA ONLY: No mocks
 */

import {
  IDematProvider,
  DematProviderType,
  AuthState,
  Holding,
  Trade,
  CashBalance,
  TaxLot,
  DematAccount,
  ProviderCapabilities,
  DematConnectionError,
} from './types';

// =============================================================================
// PROVIDER STATUS
// =============================================================================

export type ProviderStatus = 
  | 'available'      // Can be connected
  | 'connected'      // Currently connected
  | 'coming_soon'    // Not yet implemented
  | 'disabled';      // Explicitly disabled

export interface ProviderInfo {
  id: DematProviderType;
  name: string;
  logo?: string;
  status: ProviderStatus;
  capabilities: ProviderCapabilities;
  description: string;
  disabledReason?: string;
}

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

/**
 * Registry of all supported demat providers
 */
export const PROVIDER_REGISTRY: Record<DematProviderType, ProviderInfo> = {
  zerodha: {
    id: 'zerodha',
    name: 'Zerodha',
    status: 'coming_soon',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: 'derived',
      realtime: true,
      oauth: true,
      apiKey: true,
    },
    description: 'Connect your Zerodha Kite account',
    disabledReason: 'Zerodha API integration pending approval',
  },
  groww: {
    id: 'groww',
    name: 'Groww',
    status: 'coming_soon',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: 'derived',
      realtime: false,
      oauth: true,
      apiKey: false,
    },
    description: 'Connect your Groww account',
    disabledReason: 'Groww API integration in development',
  },
  upstox: {
    id: 'upstox',
    name: 'Upstox',
    status: 'coming_soon',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: 'derived',
      realtime: true,
      oauth: true,
      apiKey: true,
    },
    description: 'Connect your Upstox account',
    disabledReason: 'Upstox API integration pending',
  },
  angelone: {
    id: 'angelone',
    name: 'Angel One',
    status: 'coming_soon',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: 'derived',
      realtime: true,
      oauth: false,
      apiKey: true,
    },
    description: 'Connect your Angel One account',
    disabledReason: 'Angel One API integration pending',
  },
  dhan: {
    id: 'dhan',
    name: 'Dhan',
    status: 'coming_soon',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: 'derived',
      realtime: true,
      oauth: true,
      apiKey: true,
    },
    description: 'Connect your Dhan account',
    disabledReason: 'Dhan API integration pending',
  },
  csv: {
    id: 'csv',
    name: 'CSV Import',
    status: 'available',
    capabilities: {
      holdings: true,
      trades: true,
      cash: false,
      taxLots: 'derived',
      realtime: false,
      oauth: false,
      apiKey: false,
    },
    description: 'Import holdings from CSV file (broker statement)',
  },
  demo: {
    id: 'demo',
    name: 'Demo Mode',
    status: 'disabled',
    capabilities: {
      holdings: true,
      trades: true,
      cash: true,
      taxLots: true,
      realtime: false,
      oauth: false,
      apiKey: false,
    },
    description: 'Demo mode with sample data',
    disabledReason: 'DISABLED: No mock data allowed in production',
  },
};

// =============================================================================
// ABSTRACT BASE PROVIDER
// =============================================================================

/**
 * Base class for all demat providers
 */
export abstract class BaseDematProvider implements IDematProvider {
  abstract readonly id: DematProviderType;
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  protected authState: AuthState = { status: 'disconnected' };
  protected account: DematAccount | null = null;

  abstract connect(credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState>;
  abstract disconnect(): Promise<void>;
  abstract fetchHoldings(): Promise<Holding[]>;
  abstract fetchTrades(fromDate: string, toDate: string): Promise<Trade[]>;
  abstract fetchCash(): Promise<CashBalance>;

  handleCallback?(code: string, state: string): Promise<AuthState>;

  isConnected(): boolean {
    return this.authState.status === 'connected';
  }

  getAuthState(): AuthState {
    return this.authState;
  }

  getAccountInfo(): DematAccount | null {
    return this.account;
  }

  /**
   * Derive tax lots from trades using FIFO
   */
  deriveTaxLots(trades: Trade[]): TaxLot[] {
    // Sort trades by date (oldest first)
    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const taxLots: TaxLot[] = [];
    const holdingsByTicker: Record<string, { quantity: number; lots: TaxLot[] }> = {};

    for (const trade of sortedTrades) {
      if (trade.status !== 'COMPLETE') continue;
      if (trade.productType !== 'CNC') continue; // Only delivery trades

      if (!holdingsByTicker[trade.ticker]) {
        holdingsByTicker[trade.ticker] = { quantity: 0, lots: [] };
      }

      const holding = holdingsByTicker[trade.ticker];

      if (trade.transactionType === 'BUY') {
        // Create new tax lot
        const lot: TaxLot = {
          id: `lot_${trade.tradeId}`,
          ticker: trade.ticker,
          quantity: trade.quantity,
          buyPrice: trade.price,
          buyDate: trade.tradeDate,
          tradeId: trade.tradeId,
          orderId: trade.orderId,
          dematAccountId: trade.dematAccountId,
        };
        holding.lots.push(lot);
        holding.quantity += trade.quantity;
      } else if (trade.transactionType === 'SELL') {
        // FIFO: Reduce from oldest lots first
        let remainingQty = trade.quantity;
        
        for (const lot of holding.lots) {
          if (remainingQty <= 0) break;
          
          if (lot.quantity > 0) {
            const reduceQty = Math.min(lot.quantity, remainingQty);
            lot.quantity -= reduceQty;
            remainingQty -= reduceQty;
          }
        }
        
        holding.quantity -= trade.quantity;
        // Remove empty lots
        holding.lots = holding.lots.filter(l => l.quantity > 0);
      }
    }

    // Collect remaining lots
    for (const ticker of Object.keys(holdingsByTicker)) {
      taxLots.push(...holdingsByTicker[ticker].lots.filter(l => l.quantity > 0));
    }

    return taxLots;
  }

  protected setAuthState(state: AuthState): void {
    this.authState = state;
  }

  protected setAccount(account: DematAccount | null): void {
    this.account = account;
  }

  protected requireConnection(): void {
    if (!this.isConnected()) {
      throw new DematConnectionError(
        this.id,
        'NOT_CONNECTED',
        `Not connected to ${this.name}. Please connect first.`
      );
    }
  }
}

// =============================================================================
// PROVIDER MANAGER
// =============================================================================

/**
 * Singleton manager for all demat providers
 */
class DematProviderManager {
  private providers: Map<string, IDematProvider> = new Map();
  private static instance: DematProviderManager;

  private constructor() {}

  static getInstance(): DematProviderManager {
    if (!DematProviderManager.instance) {
      DematProviderManager.instance = new DematProviderManager();
    }
    return DematProviderManager.instance;
  }

  /**
   * Register a provider instance
   */
  registerProvider(provider: IDematProvider): void {
    const info = PROVIDER_REGISTRY[provider.id];
    if (info?.status === 'disabled') {
      console.warn(`[DematProvider] Cannot register disabled provider: ${provider.id}`);
      return;
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a registered provider
   */
  getProvider(id: DematProviderType): IDematProvider | null {
    return this.providers.get(id) || null;
  }

  /**
   * Get all connected providers
   */
  getConnectedProviders(): IDematProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isConnected());
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): IDematProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if any provider is connected
   */
  hasConnectedProvider(): boolean {
    return this.getConnectedProviders().length > 0;
  }

  /**
   * Disconnect all providers
   */
  async disconnectAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      if (provider.isConnected()) {
        await provider.disconnect();
      }
    }
  }

  /**
   * Get available provider info (for UI)
   */
  getAvailableProviders(): ProviderInfo[] {
    return Object.values(PROVIDER_REGISTRY).filter(
      p => p.status === 'available' || p.status === 'coming_soon'
    );
  }
}

export const dematProviderManager = DematProviderManager.getInstance();

