/**
 * PriceAuthority - Single Source of Truth for Prices
 * 
 * PROBLEM SOLVED:
 * Prices differ across modules. This creates ONE authoritative price per symbol.
 * 
 * RULES:
 * - ONE price per symbol per timestamp
 * - Cached for X seconds
 * - Tagged with source (Yahoo / NSE / FALLBACK)
 * 
 * ALL P&L, allocation, intelligence MUST use PriceAuthority.
 * NO direct price calls elsewhere.
 */

import { PriceData } from './DecisionContext';

// Price sources in order of preference
export type PriceSource = 'YAHOO' | 'NSE' | 'BSE' | 'FALLBACK';

// Cache configuration
export const PRICE_CACHE_CONFIG = {
  TTL_SECONDS: 60,           // Cache TTL during market hours
  STALE_THRESHOLD: 300,      // Consider stale after 5 minutes
  MAX_DEVIATION_PERCENT: 10, // Alert if price deviates > 10% from last known
  BATCH_SIZE: 20             // Max symbols per API call
} as const;

// Market hours (IST for NSE/BSE)
export const MARKET_HOURS = {
  NSE: { open: 9.25, close: 15.30 },  // 9:15 AM - 3:30 PM IST
  NYSE: { open: 19.0, close: 1.30 }   // 7:00 PM - 1:30 AM IST (US Eastern converted)
} as const;

/**
 * Price entry in cache
 */
interface PriceCacheEntry {
  symbol: string;
  price: number;
  timestamp: Date;
  source: PriceSource;
  previous_price?: number;
  deviation_percent?: number;
}

/**
 * Price fetch result
 */
export interface PriceFetchResult {
  symbol: string;
  success: boolean;
  price?: number;
  source?: PriceSource;
  error?: string;
  is_stale: boolean;
}

/**
 * Batch price result
 */
export interface BatchPriceResult {
  fetched_at: string;
  success_count: number;
  error_count: number;
  prices: Map<string, PriceData>;
  errors: Map<string, string>;
}

/**
 * PriceAuthority
 * 
 * The SINGLE authority for all price data in the system.
 */
export class PriceAuthority {
  private static instance: PriceAuthority;
  private cache: Map<string, PriceCacheEntry> = new Map();
  private subscribers: Set<(prices: Map<string, PriceData>) => void> = new Set();
  private lastFetch: Date | null = null;
  private isFetching: boolean = false;

  private constructor() {}

  static getInstance(): PriceAuthority {
    if (!PriceAuthority.instance) {
      PriceAuthority.instance = new PriceAuthority();
    }
    return PriceAuthority.instance;
  }

  /**
   * Get price for a single symbol
   * Returns cached price if fresh, fetches if stale
   */
  async getPrice(symbol: string): Promise<PriceFetchResult> {
    const cached = this.cache.get(symbol);
    
    if (cached && !this.isStale(cached.timestamp)) {
      return {
        symbol,
        success: true,
        price: cached.price,
        source: cached.source,
        is_stale: false
      };
    }

    // Return stale price with flag if available
    if (cached) {
      return {
        symbol,
        success: true,
        price: cached.price,
        source: cached.source,
        is_stale: true
      };
    }

    // No cached price
    return {
      symbol,
      success: false,
      error: 'Price not available. Run fetchPrices() first.',
      is_stale: true
    };
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Map<string, PriceData> {
    const result = new Map<string, PriceData>();
    
    for (const [symbol, entry] of this.cache) {
      result.set(symbol, {
        symbol,
        price: entry.price,
        timestamp: entry.timestamp.toISOString(),
        source: entry.source,
        is_stale: this.isStale(entry.timestamp)
      });
    }
    
    return result;
  }

  /**
   * Set price manually (for testing or fallback)
   */
  setPrice(symbol: string, price: number, source: PriceSource = 'FALLBACK'): void {
    const existing = this.cache.get(symbol);
    const previousPrice = existing?.price;
    
    const entry: PriceCacheEntry = {
      symbol,
      price,
      timestamp: new Date(),
      source,
      previous_price: previousPrice,
      deviation_percent: previousPrice 
        ? ((price - previousPrice) / previousPrice) * 100 
        : undefined
    };

    // Alert on large deviation
    if (entry.deviation_percent && Math.abs(entry.deviation_percent) > PRICE_CACHE_CONFIG.MAX_DEVIATION_PERCENT) {
      console.warn(`[PriceAuthority] Large price deviation for ${symbol}: ${entry.deviation_percent.toFixed(2)}%`);
    }

    this.cache.set(symbol, entry);
    this.notifySubscribers();
  }

  /**
   * Set multiple prices (batch update)
   */
  setPrices(prices: Record<string, number>, source: PriceSource = 'FALLBACK'): void {
    Object.entries(prices).forEach(([symbol, price]) => {
      this.setPrice(symbol, price, source);
    });
  }

  /**
   * Fetch prices for multiple symbols
   * In production, this calls the actual price API
   */
  async fetchPrices(symbols: string[]): Promise<BatchPriceResult> {
    if (this.isFetching) {
      console.warn('[PriceAuthority] Fetch already in progress');
      return this.createEmptyBatchResult();
    }

    this.isFetching = true;
    const startTime = new Date();
    const prices = new Map<string, PriceData>();
    const errors = new Map<string, string>();

    try {
      // In production, this would call the actual API
      // For now, we use the cached prices or mark as unavailable
      for (const symbol of symbols) {
        const cached = this.cache.get(symbol);
        
        if (cached) {
          prices.set(symbol, {
            symbol,
            price: cached.price,
            timestamp: cached.timestamp.toISOString(),
            source: cached.source,
            is_stale: this.isStale(cached.timestamp)
          });
        } else {
          errors.set(symbol, 'Price not available');
        }
      }

      this.lastFetch = new Date();
      this.notifySubscribers();

      return {
        fetched_at: startTime.toISOString(),
        success_count: prices.size,
        error_count: errors.size,
        prices,
        errors
      };

    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Check if market is open
   */
  isMarketOpen(market: 'NSE' | 'NYSE' = 'NSE'): boolean {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    const dayOfWeek = now.getDay();
    
    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    
    const marketHours = market === 'NSE' ? MARKET_HOURS.NSE : MARKET_HOURS.NYSE;
    return hours >= marketHours.open && hours <= marketHours.close;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    total_symbols: number;
    fresh_count: number;
    stale_count: number;
    oldest_price_age: number;
    last_fetch: string | null;
  } {
    let freshCount = 0;
    let staleCount = 0;
    let oldestAge = 0;

    for (const [, entry] of this.cache) {
      const age = (Date.now() - entry.timestamp.getTime()) / 1000;
      if (this.isStale(entry.timestamp)) {
        staleCount++;
      } else {
        freshCount++;
      }
      oldestAge = Math.max(oldestAge, age);
    }

    return {
      total_symbols: this.cache.size,
      fresh_count: freshCount,
      stale_count: staleCount,
      oldest_price_age: Math.floor(oldestAge),
      last_fetch: this.lastFetch?.toISOString() || null
    };
  }

  /**
   * Clear all cached prices
   */
  clearCache(): void {
    this.cache.clear();
    this.notifySubscribers();
  }

  /**
   * Subscribe to price updates
   */
  subscribe(callback: (prices: Map<string, PriceData>) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Check if price is stale
   */
  private isStale(timestamp: Date): boolean {
    const age = (Date.now() - timestamp.getTime()) / 1000;
    return age > PRICE_CACHE_CONFIG.STALE_THRESHOLD;
  }

  /**
   * Notify subscribers of price changes
   */
  private notifySubscribers(): void {
    const prices = this.getAllPrices();
    this.subscribers.forEach(callback => callback(prices));
  }

  /**
   * Create empty batch result
   */
  private createEmptyBatchResult(): BatchPriceResult {
    return {
      fetched_at: new Date().toISOString(),
      success_count: 0,
      error_count: 0,
      prices: new Map(),
      errors: new Map()
    };
  }
}

// Export singleton
export const priceAuthority = PriceAuthority.getInstance();

/**
 * Price validation utilities
 */
export const PriceValidation = {
  /**
   * Check if price is reasonable (not zero, not negative, not extreme)
   */
  isValidPrice(price: number): boolean {
    return price > 0 && price < 10000000; // Max 1 crore per share
  },

  /**
   * Check if price change is suspicious
   */
  isSuspiciousChange(oldPrice: number, newPrice: number): boolean {
    if (oldPrice <= 0) return false;
    const changePercent = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
    return changePercent > PRICE_CACHE_CONFIG.MAX_DEVIATION_PERCENT;
  },

  /**
   * Get price display with currency
   */
  formatPrice(price: number, currency: 'INR' | 'USD' = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(price);
  }
};

export default PriceAuthority;

