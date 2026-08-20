/**
 * PortfolioCore - Portfolio Orchestrator
 * 
 * CRITICAL: This module has ZERO data of its own.
 * It acts purely as an orchestrator for demat provider data.
 * 
 * FLOW:
 * Demat Provider → Normalizer → PortfolioCore → Engines → UI
 * 
 * RULES:
 * - NO manual portfolio entry
 * - NO localStorage-based fake portfolios
 * - NO mock data
 * - NO execution capabilities
 * - If no demat connected → Portfolio is EMPTY (not fake)
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import {
  Holding as DematHolding,
  TaxLot as DematTaxLot,
  CashBalance,
  DematAccount,
  PortfolioSnapshot,
} from '../integrations/demat/types';
import { dematProviderManager, PROVIDER_REGISTRY, ProviderInfo } from '../integrations/demat/DematProvider';
import { csvProvider } from '../integrations/demat/providers/CSVProvider';

// =============================================================================
// STATE MACHINE
// =============================================================================

export type PortfolioStatus = 
  | 'NO_DEMAT'          // No demat connected - Portfolio unavailable
  | 'CONNECTING'        // Attempting to connect to demat
  | 'SYNCING'           // Connected, syncing data
  | 'READY'             // Data synced and ready
  | 'STALE'             // Data exists but outdated (>5 min)
  | 'ERROR';            // Error state

export interface PortfolioState {
  /** Current status */
  status: PortfolioStatus;
  
  /** Status message for UI */
  statusMessage: string;
  
  /** Connected demat accounts */
  connectedAccounts: DematAccount[];
  
  /** Normalized holdings from all connected demats */
  holdings: DematHolding[];
  
  /** Tax lots from all connected demats */
  taxLots: DematTaxLot[];
  
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
  
  /** Last successful sync timestamp */
  lastSync: string | null;
  
  /** Error message if status is ERROR */
  error: string | null;
}

// =============================================================================
// ACTIONS
// =============================================================================

type PortfolioAction =
  | { type: 'SET_STATUS'; payload: { status: PortfolioStatus; message: string } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SNAPSHOT'; payload: PortfolioSnapshot }
  | { type: 'ADD_ACCOUNT'; payload: DematAccount }
  | { type: 'REMOVE_ACCOUNT'; payload: string }
  | { type: 'CLEAR_ALL' };

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: PortfolioState = {
  status: 'NO_DEMAT',
  statusMessage: 'No demat account connected. Connect a broker to view your portfolio.',
  connectedAccounts: [],
  holdings: [],
  taxLots: [],
  cashBalances: [],
  totalValue: 0,
  totalCostBasis: 0,
  totalUnrealizedPnL: 0,
  totalCash: 0,
  lastSync: null,
  error: null,
};

// =============================================================================
// REDUCER
// =============================================================================

function portfolioReducer(state: PortfolioState, action: PortfolioAction): PortfolioState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload.status,
        statusMessage: action.payload.message,
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: 'ERROR',
        statusMessage: action.payload,
        error: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        status: state.connectedAccounts.length > 0 ? 'READY' : 'NO_DEMAT',
        statusMessage: state.connectedAccounts.length > 0 
          ? 'Portfolio data loaded'
          : 'No demat account connected',
      };

    case 'SET_SNAPSHOT': {
      const snapshot = action.payload;
      return {
        ...state,
        status: snapshot.hasStaleData ? 'STALE' : 'READY',
        statusMessage: snapshot.hasStaleData 
          ? 'Some data may be outdated. Refresh to update.'
          : 'Portfolio data is up to date',
        connectedAccounts: snapshot.accounts,
        holdings: snapshot.holdings,
        taxLots: snapshot.taxLots,
        cashBalances: snapshot.cashBalances,
        totalValue: snapshot.totalValue,
        totalCostBasis: snapshot.totalCostBasis,
        totalUnrealizedPnL: snapshot.totalUnrealizedPnL,
        totalCash: snapshot.totalCash,
        lastSync: snapshot.timestamp,
        error: null,
      };
    }

    case 'ADD_ACCOUNT': {
      const accounts = [...state.connectedAccounts, action.payload];
      return {
        ...state,
        connectedAccounts: accounts,
        status: 'SYNCING',
        statusMessage: `Syncing data from ${action.payload.name}...`,
      };
    }

    case 'REMOVE_ACCOUNT': {
      const accounts = state.connectedAccounts.filter(a => a.id !== action.payload);
      return {
        ...state,
        connectedAccounts: accounts,
        // Clear holdings for this account
        holdings: state.holdings.filter(h => h.dematAccountId !== action.payload),
        taxLots: state.taxLots.filter(t => t.dematAccountId !== action.payload),
        cashBalances: state.cashBalances.filter(c => c.dematAccountId !== action.payload),
        status: accounts.length === 0 ? 'NO_DEMAT' : state.status,
        statusMessage: accounts.length === 0 
          ? 'No demat account connected'
          : `Account removed. ${accounts.length} account(s) connected.`,
      };
    }

    case 'CLEAR_ALL':
      return initialState;

    default:
      return state;
  }
}

// =============================================================================
// CONTEXT INTERFACE
// =============================================================================

interface PortfolioCoreContextType {
  /** Current portfolio state */
  state: PortfolioState;
  
  /** Is any demat connected? */
  isDematConnected: boolean;
  
  /** Is portfolio data available? */
  isDataAvailable: boolean;
  
  /** Available providers (for connection UI) */
  availableProviders: ProviderInfo[];
  
  /** Connect to a demat provider */
  connectDemat: (providerId: string, options?: { csvContent?: string; csvFormat?: string }) => Promise<void>;
  
  /** Disconnect a demat account */
  disconnectDemat: (accountId: string) => Promise<void>;
  
  /** Disconnect all accounts */
  disconnectAll: () => Promise<void>;
  
  /** Refresh portfolio data from all connected demats */
  refreshPortfolio: () => Promise<void>;
  
  /** Get snapshot for engines (TaxEngine, CapitalAllocator) */
  getSnapshot: () => PortfolioSnapshot | null;
  
  /** Get holdings for a specific account */
  getHoldingsByAccount: (accountId: string) => DematHolding[];
  
  /** Get tax lots for a specific ticker */
  getTaxLots: (ticker: string, accountId?: string) => DematTaxLot[];
}

const PortfolioCoreContext = createContext<PortfolioCoreContextType | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function PortfolioCoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(portfolioReducer, initialState);

  // Register CSV provider on mount
  useEffect(() => {
    dematProviderManager.registerProvider(csvProvider);
    
    // Check if CSV provider already has data (from previous import)
    if (csvProvider.isConnected()) {
      syncFromProviders();
    }
  }, []);

  /**
   * Sync data from all connected providers
   */
  const syncFromProviders = useCallback(async () => {
    const connectedProviders = dematProviderManager.getConnectedProviders();
    
    if (connectedProviders.length === 0) {
      dispatch({ type: 'SET_STATUS', payload: { status: 'NO_DEMAT', message: 'No demat account connected' } });
      return;
    }

    dispatch({ type: 'SET_STATUS', payload: { status: 'SYNCING', message: 'Syncing portfolio data...' } });

    try {
      const allHoldings: DematHolding[] = [];
      const allTaxLots: DematTaxLot[] = [];
      const allCashBalances: CashBalance[] = [];
      const allAccounts: DematAccount[] = [];
      const dataFreshness: Record<string, { lastSync: string; isStale: boolean }> = {};

      for (const provider of connectedProviders) {
        const account = provider.getAccountInfo();
        if (!account) continue;

        allAccounts.push(account);

        try {
          // Fetch holdings
          const holdings = await provider.fetchHoldings();
          allHoldings.push(...holdings);

          // Derive tax lots if supported
          if (provider.deriveTaxLots) {
            // For now, create simple tax lots from holdings
            const taxLots = holdings.map(h => ({
              id: `lot_${h.id}`,
              ticker: h.ticker,
              quantity: h.quantity,
              buyPrice: h.avgBuyPrice,
              buyDate: new Date().toISOString().split('T')[0], // Placeholder
              dematAccountId: h.dematAccountId,
            }));
            allTaxLots.push(...taxLots);
          }

          // Fetch cash if supported
          if (provider.capabilities.cash) {
            try {
              const cash = await provider.fetchCash();
              allCashBalances.push(cash);
            } catch (e) {
              // Cash not available for this provider
              console.warn(`[PortfolioCore] Cash not available from ${provider.id}`);
            }
          }

          dataFreshness[account.id] = {
            lastSync: new Date().toISOString(),
            isStale: false,
          };
        } catch (e: any) {
          console.error(`[PortfolioCore] Error syncing from ${provider.id}:`, e);
          dataFreshness[account.id] = {
            lastSync: account.lastSync || '',
            isStale: true,
          };
        }
      }

      // Calculate totals
      const totalValue = allHoldings.reduce((sum, h) => sum + h.marketValue, 0);
      const totalCostBasis = allHoldings.reduce((sum, h) => sum + h.costBasis, 0);
      const totalUnrealizedPnL = allHoldings.reduce((sum, h) => sum + h.unrealizedPnL, 0);
      const totalCash = allCashBalances.reduce((sum, c) => sum + c.available, 0);

      const snapshot: PortfolioSnapshot = {
        timestamp: new Date().toISOString(),
        accounts: allAccounts,
        holdings: allHoldings,
        taxLots: allTaxLots,
        cashBalances: allCashBalances,
        totalValue: totalValue + totalCash,
        totalCostBasis,
        totalUnrealizedPnL,
        totalCash,
        hasStaleData: Object.values(dataFreshness).some(f => f.isStale),
        dataFreshness,
      };

      dispatch({ type: 'SET_SNAPSHOT', payload: snapshot });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to sync portfolio data' });
    }
  }, []);

  /**
   * Connect to a demat provider
   */
  const connectDemat = useCallback(async (
    providerId: string, 
    options?: { csvContent?: string; csvFormat?: string }
  ) => {
    const providerInfo = PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY];
    
    if (!providerInfo) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    if (providerInfo.status === 'disabled') {
      throw new Error(`Provider ${providerInfo.name} is disabled: ${providerInfo.disabledReason}`);
    }

    if (providerInfo.status === 'coming_soon') {
      throw new Error(`Provider ${providerInfo.name} is not yet available: ${providerInfo.disabledReason}`);
    }

    dispatch({ type: 'SET_STATUS', payload: { status: 'CONNECTING', message: `Connecting to ${providerInfo.name}...` } });

    try {
      if (providerId === 'csv' && options?.csvContent) {
        // Special handling for CSV import
        const result = await csvProvider.importHoldingsFromCSV(
          options.csvContent,
          (options.csvFormat as 'zerodha' | 'groww' | 'generic') || 'generic'
        );

        if (result.errors.length > 0) {
          console.warn('[PortfolioCore] CSV import warnings:', result.errors);
        }

        const account = csvProvider.getAccountInfo();
        if (account) {
          dispatch({ type: 'ADD_ACCOUNT', payload: account });
        }
      } else {
        // For other providers (when implemented)
        const provider = dematProviderManager.getProvider(providerId as any);
        if (!provider) {
          throw new Error(`Provider ${providerId} not registered`);
        }

        const authState = await provider.connect();
        
        if (authState.status === 'awaiting_auth') {
          // OAuth flow - redirect user
          window.open(authState.authUrl, '_blank');
          dispatch({ type: 'SET_STATUS', payload: { 
            status: 'CONNECTING', 
            message: 'Please complete authentication in the new window...' 
          }});
          return;
        }

        if (authState.status === 'connected') {
          const account = provider.getAccountInfo();
          if (account) {
            dispatch({ type: 'ADD_ACCOUNT', payload: account });
          }
        }
      }

      // Sync data after connection
      await syncFromProviders();
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message || `Failed to connect to ${providerInfo.name}` });
      throw error;
    }
  }, [syncFromProviders]);

  /**
   * Disconnect a specific demat account
   */
  const disconnectDemat = useCallback(async (accountId: string) => {
    // Find the provider for this account
    const account = state.connectedAccounts.find(a => a.id === accountId);
    if (!account) return;

    const provider = dematProviderManager.getProvider(account.provider);
    if (provider) {
      await provider.disconnect();
    }

    dispatch({ type: 'REMOVE_ACCOUNT', payload: accountId });
  }, [state.connectedAccounts]);

  /**
   * Disconnect all accounts
   */
  const disconnectAll = useCallback(async () => {
    await dematProviderManager.disconnectAll();
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  /**
   * Get portfolio snapshot for engines
   */
  const getSnapshot = useCallback((): PortfolioSnapshot | null => {
    if (state.status === 'NO_DEMAT' || state.connectedAccounts.length === 0) {
      return null;
    }

    return {
      timestamp: state.lastSync || new Date().toISOString(),
      accounts: state.connectedAccounts,
      holdings: state.holdings,
      taxLots: state.taxLots,
      cashBalances: state.cashBalances,
      totalValue: state.totalValue,
      totalCostBasis: state.totalCostBasis,
      totalUnrealizedPnL: state.totalUnrealizedPnL,
      totalCash: state.totalCash,
      hasStaleData: state.status === 'STALE',
      dataFreshness: {},
    };
  }, [state]);

  /**
   * Get holdings for a specific account
   */
  const getHoldingsByAccount = useCallback((accountId: string): DematHolding[] => {
    return state.holdings.filter(h => h.dematAccountId === accountId);
  }, [state.holdings]);

  /**
   * Get tax lots for a ticker
   */
  const getTaxLots = useCallback((ticker: string, accountId?: string): DematTaxLot[] => {
    if (accountId) {
      return state.taxLots.filter(t => t.ticker === ticker && t.dematAccountId === accountId);
    }
    return state.taxLots.filter(t => t.ticker === ticker);
  }, [state.taxLots]);

  // Computed values
  const isDematConnected = state.connectedAccounts.length > 0;
  const isDataAvailable = isDematConnected && (state.status === 'READY' || state.status === 'STALE');
  
  const availableProviders = useMemo(() => 
    dematProviderManager.getAvailableProviders(),
    []
  );

  const value: PortfolioCoreContextType = {
    state,
    isDematConnected,
    isDataAvailable,
    availableProviders,
    connectDemat,
    disconnectDemat,
    disconnectAll,
    refreshPortfolio: syncFromProviders,
    getSnapshot,
    getHoldingsByAccount,
    getTaxLots,
  };

  return (
    <PortfolioCoreContext.Provider value={value}>
      {children}
    </PortfolioCoreContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function usePortfolioCore(): PortfolioCoreContextType {
  const context = useContext(PortfolioCoreContext);
  if (!context) {
    throw new Error('usePortfolioCore must be used within PortfolioCoreProvider');
  }
  return context;
}

// =============================================================================
// LEGACY EXPORTS (for compatibility during migration)
// =============================================================================

// Re-export demat types for components that need them
export type { 
  DematHolding as Holding,
  DematTaxLot as TaxLot,
  CashBalance as CashPosition,
  DematAccount,
} from '../integrations/demat/types';
