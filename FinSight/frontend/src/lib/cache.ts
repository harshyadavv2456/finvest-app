/**
 * FinVest Cache Utility
 * In-memory caching for API responses
 * 
 * Features:
 * - TTL-based expiration (30-60s default)
 * - Prevents duplicate API calls on rerenders
 * - Memory cleanup for stale entries
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class InMemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup stale entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get cached data if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data with TTL (default 30 seconds)
   */
  set<T>(key: string, data: T, ttlMs: number = 30000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup on unmount
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Singleton instance
export const apiCache = new InMemoryCache();

/**
 * Create a cached version of an async function
 */
export function withCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyPrefix: string,
  ttlMs: number = 30000
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
    
    // Check cache first
    const cached = apiCache.get<ReturnType<T>>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const result = await fn(...args);
    
    // Cache the result
    apiCache.set(cacheKey, result, ttlMs);
    
    return result;
  }) as T;
}

/**
 * Hook-style caching for React components
 */
export function useCachedFetch<T>(
  _key: string,
  _fetchFn: () => Promise<T>,
  _ttlMs: number = 30000
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  // This would be a React hook - importing useState/useEffect would be needed
  // For now, this is a utility type definition
  return {
    data: null,
    loading: false,
    error: null,
    refetch: async () => {},
  };
}

/**
 * Dedupe concurrent requests for the same key
 */
const pendingRequests: Map<string, Promise<unknown>> = new Map();

export async function dedupeRequest<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  // If there's already a pending request for this key, return it
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  // Check cache first
  const cached = apiCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Create new request
  const request = fetchFn()
    .then((result) => {
      apiCache.set(key, result, 30000);
      pendingRequests.delete(key);
      return result;
    })
    .catch((err) => {
      pendingRequests.delete(key);
      throw err;
    });

  pendingRequests.set(key, request);
  return request;
}

