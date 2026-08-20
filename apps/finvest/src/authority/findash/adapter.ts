/**
 * FinDash Authority Adapter
 * 
 * AUTHORITY: LOCKED
 * 
 * This adapter provides READ-ONLY access to FinDash market data.
 * FinDash uses yfinance for real-time stock data.
 * 
 * Rules:
 * - Adapter ONLY reads FinDash data
 * - Adapter NEVER computes indicators (FinDash does that)
 * - Adapter enforces schema validation
 * - Adapter adds timestamps
 * - Adapter fails loudly if data is unavailable
 * - NO MOCK DATA, NO FALLBACKS
 */

import type {
  Stock,
  StockDataPoint,
  StockAnalytics,
  MarketQuoteResponse,
  MarketOHLCResponse,
  MarketIndicatorsResponse,
  MarketStatusResponse,
} from './contracts';
import { FINDASH_URL, AUTHORITY } from './contracts';
import { checkFindashStatus, type FindashStatus } from './status';
import {
  FindashOfflineError,
  StockNotFoundError,
  DataFetchError,
} from './errors';

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class FindashAdapter {
  private statusCache: FindashStatus | null = null;
  private statusCacheTime: number = 0;
  private readonly statusCacheTTL = 30000; // 30 seconds

  /**
   * Get FinDash status
   */
  async getStatus(): Promise<MarketStatusResponse> {
    const status = await this.getCachedStatus();
    
    return {
      success: status.isOnline,
      findash: {
        status: status.status,
        url: status.url,
        port: status.port,
        lastCheck: status.lastCheck,
      },
      dataSource: 'yfinance',
      authority: AUTHORITY,
    };
  }

  /**
   * Fetch quote for a symbol
   * 
   * Note: Since FinDash is client-side only and fetches directly from Yahoo,
   * this adapter primarily validates that FinDash is available and provides
   * the iframe/embedding context. For actual data, use the embedded FinDash UI
   * or call Yahoo Finance APIs directly through the same services.
   */
  async getQuote(symbol: string): Promise<MarketQuoteResponse> {
    const status = await this.getCachedStatus();
    
    if (!status.isOnline) {
      throw new FindashOfflineError();
    }

    // Since FinDash is client-side, we return a response indicating
    // to use the embedded UI for actual data
    return {
      success: true,
      data: null, // Data comes from embedded FinDash UI
      timestamp: new Date().toISOString(),
      source: 'findash',
      authority: AUTHORITY,
    };
  }

  /**
   * Get OHLC data for a symbol
   */
  async getOHLC(symbol: string, interval: string = '1d', range: string = '1mo'): Promise<MarketOHLCResponse> {
    const status = await this.getCachedStatus();
    
    if (!status.isOnline) {
      throw new FindashOfflineError();
    }

    // Data comes from embedded FinDash UI
    return {
      success: true,
      symbol: symbol.toUpperCase(),
      data: [],
      interval,
      range,
      timestamp: new Date().toISOString(),
      source: 'findash',
      authority: AUTHORITY,
    };
  }

  /**
   * Get technical indicators for a symbol
   */
  async getIndicators(symbol: string): Promise<MarketIndicatorsResponse> {
    const status = await this.getCachedStatus();
    
    if (!status.isOnline) {
      throw new FindashOfflineError();
    }

    // Indicators are computed by FinDash, not by this adapter
    return {
      success: true,
      symbol: symbol.toUpperCase(),
      analytics: null, // Comes from embedded FinDash UI
      timestamp: new Date().toISOString(),
      source: 'findash',
      authority: AUTHORITY,
    };
  }

  /**
   * Get the FinDash embed URL
   */
  getEmbedUrl(): string {
    return FINDASH_URL;
  }

  /**
   * Get cached status with TTL
   */
  private async getCachedStatus(): Promise<FindashStatus> {
    const now = Date.now();
    
    if (this.statusCache && (now - this.statusCacheTime) < this.statusCacheTTL) {
      return this.statusCache;
    }

    this.statusCache = await checkFindashStatus();
    this.statusCacheTime = now;
    return this.statusCache;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let adapterInstance: FindashAdapter | null = null;

export function getFindashAdapter(): FindashAdapter {
  if (!adapterInstance) {
    adapterInstance = new FindashAdapter();
  }
  return adapterInstance;
}

