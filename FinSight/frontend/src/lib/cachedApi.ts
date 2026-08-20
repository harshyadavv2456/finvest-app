/**
 * Cached API Wrapper
 * Wraps core API calls with in-memory caching
 * 
 * Default TTLs:
 * - Screener data: 30 seconds
 * - Markets data: 60 seconds
 * - Static data (ratios): 5 minutes
 */

import { api, ScreenerResponse } from './api';
import { apiCache, dedupeRequest } from './cache';

// TTL constants (in milliseconds)
const TTL = {
  SCREENER: 30000,      // 30 seconds
  MARKETS: 60000,       // 60 seconds
  TICKER: 30000,        // 30 seconds
  STATIC: 300000,       // 5 minutes
  SMART_MONEY: 60000,   // 60 seconds
};

/**
 * Cached screener API
 */
export const cachedApi = {
  /**
   * Get screener data with caching
   */
  getScreener: async (params: Parameters<typeof api.getScreener>[0] = {}): Promise<ScreenerResponse> => {
    const cacheKey = `screener:${JSON.stringify(params)}`;
    
    return dedupeRequest(cacheKey, async () => {
      const result = await api.getScreener(params);
      return result;
    });
  },

  /**
   * Get markets with caching (longer TTL since static)
   */
  getMarkets: async (): Promise<Record<string, boolean>> => {
    const cacheKey = 'markets';
    
    const cached = apiCache.get<Record<string, boolean>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getMarkets();
    apiCache.set(cacheKey, result, TTL.MARKETS);
    return result;
  },

  /**
   * Get ratios metadata with caching (long TTL, rarely changes)
   */
  getRatios: async () => {
    const cacheKey = 'ratios';
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getRatios>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getRatios();
    apiCache.set(cacheKey, result, TTL.STATIC);
    return result;
  },

  /**
   * Get filter options with caching
   */
  getFilterOptions: async (market?: string) => {
    const cacheKey = `filters:${market || 'all'}`;
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getFilterOptions>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getFilterOptions(market);
    apiCache.set(cacheKey, result, TTL.STATIC);
    return result;
  },

  /**
   * Get ticker fundamentals with caching
   */
  getTickerFundamentals: async (ticker: string) => {
    const cacheKey = `fundamentals:${ticker}`;
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getTickerFundamentals>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getTickerFundamentals(ticker);
    apiCache.set(cacheKey, result, TTL.TICKER);
    return result;
  },

  /**
   * Get top opportunities with caching
   */
  getTopOpportunities: async (market: string) => {
    const cacheKey = `opportunities:${market}`;
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getTopOpportunities>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getTopOpportunities(market);
    apiCache.set(cacheKey, result, TTL.SCREENER);
    return result;
  },

  /**
   * Get insider trades with caching
   */
  getInsiderTrades: async (days: number, limit: number) => {
    const cacheKey = `insider:${days}:${limit}`;
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getInsiderTrades>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getInsiderTrades(days, limit);
    apiCache.set(cacheKey, result, TTL.SMART_MONEY);
    return result;
  },

  /**
   * Get 13F signals with caching
   */
  get13FSignals: async (days: number) => {
    const cacheKey = `13f:${days}`;
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.get13FSignals>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.get13FSignals(days);
    apiCache.set(cacheKey, result, TTL.SMART_MONEY);
    return result;
  },

  /**
   * Get FII/DII summary with caching
   */
  getFiiDiiSummary: async () => {
    const cacheKey = 'fii-dii-summary';
    
    const cached = apiCache.get<Awaited<ReturnType<typeof api.getFiiDiiSummary>>>(cacheKey);
    if (cached) return cached;
    
    const result = await api.getFiiDiiSummary();
    apiCache.set(cacheKey, result, TTL.SMART_MONEY);
    return result;
  },

  /**
   * Clear all cache
   */
  clearCache: () => {
    apiCache.clear();
  },

  /**
   * Get cache stats for debugging
   */
  getCacheStats: () => {
    return apiCache.stats();
  },
};

/**
 * Export original api for uncached calls
 */
export { api };

