/**
 * Internal Market API Client
 * 
 * AUTHORITY: LOCKED
 * 
 * These APIs proxy FinDash market data.
 * NO transformation. NO caching. NO mutation.
 * FinDash is the DATA AUTHORITY.
 */

import { getFindashAdapter } from '../authority/findash';
import type { 
  MarketStatusResponse,
  MarketQuoteResponse,
  MarketOHLCResponse,
  MarketIndicatorsResponse,
} from '../authority/findash';

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get market data status
 * GET /api/market/status
 */
export async function getMarketStatus(): Promise<MarketStatusResponse> {
  return getFindashAdapter().getStatus();
}

/**
 * Get quote for a symbol
 * GET /api/market/quote/{symbol}
 * 
 * Note: Returns metadata about data availability.
 * Actual data should be consumed via embedded FinDash UI.
 */
export async function getMarketQuote(symbol: string): Promise<MarketQuoteResponse> {
  return getFindashAdapter().getQuote(symbol);
}

/**
 * Get OHLC data for a symbol
 * GET /api/market/ohlc/{symbol}
 */
export async function getMarketOHLC(
  symbol: string, 
  interval: string = '1d', 
  range: string = '1mo'
): Promise<MarketOHLCResponse> {
  return getFindashAdapter().getOHLC(symbol, interval, range);
}

/**
 * Get technical indicators for a symbol
 * GET /api/market/indicators/{symbol}
 * 
 * Note: Indicators are computed by FinDash, not FinVest.
 * FinVest NEVER computes indicators.
 */
export async function getMarketIndicators(symbol: string): Promise<MarketIndicatorsResponse> {
  return getFindashAdapter().getIndicators(symbol);
}

/**
 * Get chart embed URL
 * GET /api/market/charts/{symbol}
 * 
 * Returns the URL to embed FinDash charts.
 */
export function getChartEmbedUrl(symbol?: string): string {
  const baseUrl = getFindashAdapter().getEmbedUrl();
  if (symbol) {
    return `${baseUrl}?symbol=${encodeURIComponent(symbol)}`;
  }
  return baseUrl;
}

// ============================================================================
// FETCH HELPERS (for React components)
// ============================================================================

const API_BASE = '/api/market';

/**
 * Fetch market status from API
 */
export async function fetchMarketStatus(): Promise<MarketStatusResponse> {
  try {
    const response = await fetch(`${API_BASE}/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch market status: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    // Return offline status if API is unavailable
    return {
      success: false,
      findash: {
        status: 'OFFLINE',
        url: 'http://localhost:3000',
        port: 3000,
        lastCheck: new Date().toISOString(),
      },
      dataSource: 'yfinance',
      authority: 'LIVE',
    };
  }
}

