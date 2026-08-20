/**
 * Angel One Provider - NOT IMPLEMENTED
 * 
 * STATUS: COMING_SOON
 * REASON: Angel One SmartAPI integration pending
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

export class AngelOneProvider extends BaseDematProvider {
  readonly id: DematProviderType = 'angelone';
  readonly name = 'Angel One';
  readonly capabilities: ProviderCapabilities = {
    holdings: true,
    trades: true,
    cash: true,
    taxLots: 'derived',
    realtime: true,
    oauth: false,
    apiKey: true,
  };

  private static readonly NOT_IMPLEMENTED_MSG = 
    'Angel One integration not yet implemented. Pending SmartAPI access.';

  async connect(_credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState> {
    throw new DematConnectionError(
      this.id,
      'API_ERROR',
      AngelOneProvider.NOT_IMPLEMENTED_MSG
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
      AngelOneProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchTrades(_fromDate: string, _toDate: string): Promise<Trade[]> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      AngelOneProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchCash(): Promise<CashBalance> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      AngelOneProvider.NOT_IMPLEMENTED_MSG
    );
  }
}

export const angelOneProvider = new AngelOneProvider();

