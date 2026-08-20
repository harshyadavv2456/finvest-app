/**
 * Groww Provider - NOT IMPLEMENTED
 * 
 * STATUS: COMING_SOON
 * REASON: Groww API integration in development
 * 
 * This file defines the interface and stub for Groww integration.
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

export class GrowwProvider extends BaseDematProvider {
  readonly id: DematProviderType = 'groww';
  readonly name = 'Groww';
  readonly capabilities: ProviderCapabilities = {
    holdings: true,
    trades: true,
    cash: true,
    taxLots: 'derived',
    realtime: false,
    oauth: true,
    apiKey: false,
  };

  private static readonly NOT_IMPLEMENTED_MSG = 
    'Groww integration not yet implemented. In development.';

  async connect(_credentials?: { apiKey?: string; apiSecret?: string }): Promise<AuthState> {
    throw new DematConnectionError(
      this.id,
      'API_ERROR',
      GrowwProvider.NOT_IMPLEMENTED_MSG
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
      GrowwProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchTrades(_fromDate: string, _toDate: string): Promise<Trade[]> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      GrowwProvider.NOT_IMPLEMENTED_MSG
    );
  }

  async fetchCash(): Promise<CashBalance> {
    throw new DematConnectionError(
      this.id,
      'NOT_CONNECTED',
      GrowwProvider.NOT_IMPLEMENTED_MSG
    );
  }
}

export const growwProvider = new GrowwProvider();

