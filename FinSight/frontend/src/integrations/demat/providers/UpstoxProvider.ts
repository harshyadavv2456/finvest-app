/**
 * Upstox Provider - NOT IMPLEMENTED
 * 
 * STATUS: COMING_SOON
 * REASON: Upstox API integration pending
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

export class UpstoxProvider extends BaseDematProvider {
  readonly id: DematProviderType = 'upstox';
  readonly name = 'Upstox';
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
    'Upstox integration not yet implemented. Pending API access.';

  async connect(_credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState> {
    throw new DematConnectionError(
      this.id,
      'API_ERROR',
      UpstoxProvider.NOT_IMPLEMENTED_MSG
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
      UpstoxProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchTrades(_fromDate: string, _toDate: string): Promise<Trade[]> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      UpstoxProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchCash(): Promise<CashBalance> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      UpstoxProvider.NOT_IMPLEMENTED_MSG
    );
  }
}

export const upstoxProvider = new UpstoxProvider();

