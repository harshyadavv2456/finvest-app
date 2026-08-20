/**
 * Zerodha Provider - NOT IMPLEMENTED
 * 
 * STATUS: COMING_SOON
 * REASON: Zerodha Kite Connect API integration pending approval
 * 
 * This file defines the interface and stub for Zerodha integration.
 * Implementation will be added once API access is approved.
 */

import {
  DematProviderType,
  AuthState,
  Holding,
  Trade,
  CashBalance,
  ProviderCapabilities,
  DematConnectionError,
} from '../types';
import { BaseDematProvider } from '../DematProvider';

export class ZerodhaProvider extends BaseDematProvider {
  readonly id: DematProviderType = 'zerodha';
  readonly name = 'Zerodha';
  readonly capabilities: ProviderCapabilities = {
    holdings: true,
    trades: true,
    cash: true,
    taxLots: 'derived',
    realtime: true,
    oauth: true,
    apiKey: true,
  };

  private static readonly NOT_IMPLEMENTED_MSG = 
    'Zerodha integration not yet implemented. Pending API approval.';

  async connect(_credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState> {
    throw new DematConnectionError(
      this.id,
      'API_ERROR',
      ZerodhaProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async handleCallback(_code: string, _state: string): Promise<AuthState> {
    throw new DematConnectionError(
      this.id,
      'API_ERROR',
      ZerodhaProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async disconnect(): Promise<void> {
    this.setAuthState({ status: 'disconnected' });
    this.setAccount(null);
  }

  async fetchHoldings(): Promise<Holding[]> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      ZerodhaProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchTrades(_fromDate: string, _toDate: string): Promise<Trade[]> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      ZerodhaProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchCash(): Promise<CashBalance> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      ZerodhaProvider.NOT_IMPLEMENTED_MSG
    );
  }
}

// Export singleton (inactive)
export const zerodhaProvider = new ZerodhaProvider();

