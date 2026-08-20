/**
 * PriceResolver Service
 * 
 * Resolves live prices for stocks across markets.
 * - US stocks: Yahoo Finance via backend proxy
 * - Indian stocks: NSE/BSE symbols via backend proxy
 * 
 * NO MOCK DATA. NO HARDCODED PRICES. NO SILENT FAILURES.
 */

import { api } from '../lib/api';

export interface PriceResult {
  symbol: string;
  market: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  timestamp: string;
  source: 'YAHOO' | 'NSE' | 'BSE' | 'UNKNOWN';
  status: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  error?: string;
}

export interface BatchPriceResult {
  prices: Record<string, PriceResult>;
  fetchedAt: string;
  successCount: number;
  failedCount: number;
}

/**
 * Normalize symbol for API lookup
 */
function normalizeSymbol(symbol: string, market: string): string {
  const cleanSymbol = symbol.toUpperCase().trim();
  
  if (market === 'IN') {
    // Indian stocks need .NS or .BO suffix for Yahoo
    if (!cleanSymbol.includes('.')) {
      return `${cleanSymbol}.NS`; // Default to NSE
    }
    return cleanSymbol;
  }
  
  // For other markets, remove any suffix for Yahoo lookup
  return cleanSymbol.split('.')[0];
}

/**
 * Get Yahoo Finance symbol for a given market
 */
function getYahooSymbol(symbol: string, market: string): string {
  const cleanSymbol = symbol.toUpperCase().trim().split('.')[0];
  
  const marketSuffixes: Record<string, string> = {
    'US': '',
    'IN': '.NS',
    'UK': '.L',
    'JP': '.T',
    'CN': '.SS',
    'HK': '.HK',
    'SG': '.SI',
    'AU': '.AX',
  };
  
  const suffix = marketSuffixes[market] || '';
  return `${cleanSymbol}${suffix}`;
}

/**
 * Fetch live price for a single stock
 */
export async function getPrice(symbol: string, market: string): Promise<PriceResult> {
  try {
    // Use the getLivePrice API which handles symbol conversion
    const response = await api.getLivePrice(symbol, market);
    
    if (response && response.price !== null && response.price !== undefined) {
      return {
        symbol,
        market,
        price: response.price,
        previousClose: null, // Not always available
        change: response.change || null,
        changePercent: response.changePercent || null,
        timestamp: response.timestamp || new Date().toISOString(),
        source: market === 'IN' ? 'NSE' : 'YAHOO',
        status: response.status === 'LIVE' ? 'LIVE' : 'UNAVAILABLE',
      };
    }
    
    return {
      symbol,
      market,
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      timestamp: new Date().toISOString(),
      source: 'UNKNOWN',
      status: 'UNAVAILABLE',
      error: response?.error || 'No price data returned from API',
    };
    
  } catch (error: any) {
    console.error(`[PriceResolver] Failed to fetch price for ${symbol} (${market}):`, error.message);
    
    return {
      symbol,
      market,
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      timestamp: new Date().toISOString(),
      source: 'UNKNOWN',
      status: 'UNAVAILABLE',
      error: error.message || 'Failed to fetch price',
    };
  }
}

/**
 * Fetch prices for multiple stocks in batch
 */
export async function getBatchPrices(
  holdings: Array<{ symbol: string; market: string }>
): Promise<BatchPriceResult> {
  const results: Record<string, PriceResult> = {};
  let successCount = 0;
  let failedCount = 0;
  
  // Process in batches of 10 to avoid overwhelming the API
  const batchSize = 10;
  
  for (let i = 0; i < holdings.length; i += batchSize) {
    const batch = holdings.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async ({ symbol, market }) => {
      const result = await getPrice(symbol, market);
      const key = `${market}:${symbol}`;
      results[key] = result;
      
      if (result.status === 'LIVE') {
        successCount++;
      } else {
        failedCount++;
      }
    });
    
    await Promise.all(batchPromises);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < holdings.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return {
    prices: results,
    fetchedAt: new Date().toISOString(),
    successCount,
    failedCount,
  };
}

/**
 * Calculate holding value and P&L with live price
 */
export interface HoldingWithPrice {
  symbol: string;
  market: string;
  quantity: number;
  avgCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPercent: number | null;
  priceStatus: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  lastUpdated: string;
}

export function calculateHoldingValue(
  symbol: string,
  market: string,
  quantity: number,
  avgCost: number,
  priceResult: PriceResult
): HoldingWithPrice {
  const currentPrice = priceResult.price;
  
  if (currentPrice === null || priceResult.status === 'UNAVAILABLE') {
    return {
      symbol,
      market,
      quantity,
      avgCost,
      currentPrice: null,
      currentValue: null,
      unrealizedPnL: null,
      unrealizedPnLPercent: null,
      priceStatus: 'UNAVAILABLE',
      lastUpdated: priceResult.timestamp,
    };
  }
  
  const currentValue = quantity * currentPrice;
  const costBasis = quantity * avgCost;
  const unrealizedPnL = currentValue - costBasis;
  const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
  
  return {
    symbol,
    market,
    quantity,
    avgCost,
    currentPrice,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    priceStatus: priceResult.status,
    lastUpdated: priceResult.timestamp,
  };
}

export default {
  getPrice,
  getBatchPrices,
  calculateHoldingValue,
  normalizeSymbol,
  getYahooSymbol,
};
