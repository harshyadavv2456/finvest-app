/**
 * Authority Status Utilities
 * 
 * Provides status information for UI display.
 */

import { getAuthorityStatus, type AuthorityStatus } from '../../authority/finsight';

export interface AuthorityDisplayStatus {
  isHealthy: boolean;
  badge: 'LOCKED' | 'WARNING' | 'ERROR';
  message: string;
  lastUpdated: string;
  markets: {
    US: MarketDisplayStatus;
    IN: MarketDisplayStatus;
  };
  initiateCount: number;
  avoidCount: number;
}

export interface MarketDisplayStatus {
  status: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';
  stockCount: number;
  isAvailable: boolean;
}

/**
 * Get formatted status for UI display
 */
export function getDisplayStatus(): AuthorityDisplayStatus {
  try {
    const status = getAuthorityStatus();
    
    const usStocks = status.markets.US?.stocks_available ?? 0;
    const inStocks = status.markets.IN?.stocks_available ?? 0;
    
    const isHealthy = status.data_freshness.is_fresh && (usStocks > 0 || inStocks > 0);
    
    let badge: AuthorityDisplayStatus['badge'] = 'LOCKED';
    let message = 'FinSight authority active. Decisions are locked.';
    
    if (!status.data_freshness.is_fresh) {
      badge = 'WARNING';
      message = status.data_freshness.warning || 'Data may be stale.';
    }
    
    if (usStocks === 0 && inStocks === 0) {
      badge = 'ERROR';
      message = 'No intelligence data available.';
    }
    
    return {
      isHealthy,
      badge,
      message,
      lastUpdated: status.last_updated,
      markets: {
        US: {
          status: status.markets.US?.status ?? 'CLOSED',
          stockCount: usStocks,
          isAvailable: usStocks > 0,
        },
        IN: {
          status: status.markets.IN?.status ?? 'CLOSED',
          stockCount: inStocks,
          isAvailable: inStocks > 0,
        },
      },
      initiateCount: 0, // Will be populated from top opportunities
      avoidCount: 0,
    };
  } catch (error) {
    return {
      isHealthy: false,
      badge: 'ERROR',
      message: error instanceof Error ? error.message : 'Authority status unavailable',
      lastUpdated: 'N/A',
      markets: {
        US: { status: 'CLOSED', stockCount: 0, isAvailable: false },
        IN: { status: 'CLOSED', stockCount: 0, isAvailable: false },
      },
      initiateCount: 0,
      avoidCount: 0,
    };
  }
}

/**
 * Format timestamp for display
 */
export function formatLastUpdated(timestamp: string): string {
  if (!timestamp || timestamp === 'N/A') {
    return 'Never';
  }
  
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)} hours ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} days ago`;
    }
  } catch {
    return timestamp;
  }
}

/**
 * Get market status emoji
 */
export function getMarketStatusEmoji(status: string): string {
  switch (status) {
    case 'OPEN': return '🟢';
    case 'CLOSED': return '🔴';
    case 'PRE_MARKET': return '🟡';
    case 'AFTER_HOURS': return '🟠';
    default: return '⚪';
  }
}

