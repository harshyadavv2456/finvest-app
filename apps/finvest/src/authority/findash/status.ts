/**
 * FinDash Status Utilities
 * 
 * AUTHORITY: LOCKED
 * FinDash is the DATA AUTHORITY for real-time market data.
 */

import { FINDASH_URL, FINDASH_PORT } from './contracts';

export interface FindashStatus {
  isOnline: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  url: string;
  port: number;
  lastCheck: string;
  error?: string;
}

/**
 * Check if FinDash is available
 * 
 * Note: Since FinDash is a client-side only app, we check if the 
 * development server is responding.
 */
export async function checkFindashStatus(): Promise<FindashStatus> {
  const now = new Date().toISOString();
  
  try {
    // Try to reach the FinDash development server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(FINDASH_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok || response.status === 200) {
      return {
        isOnline: true,
        status: 'ONLINE',
        url: FINDASH_URL,
        port: FINDASH_PORT,
        lastCheck: now,
      };
    } else {
      return {
        isOnline: false,
        status: 'DEGRADED',
        url: FINDASH_URL,
        port: FINDASH_PORT,
        lastCheck: now,
        error: `Unexpected status: ${response.status}`,
      };
    }
  } catch (error) {
    return {
      isOnline: false,
      status: 'OFFLINE',
      url: FINDASH_URL,
      port: FINDASH_PORT,
      lastCheck: now,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Get display status for UI
 */
export function getStatusDisplay(status: FindashStatus): {
  badge: 'LIVE' | 'OFFLINE' | 'DEGRADED';
  color: string;
  message: string;
} {
  switch (status.status) {
    case 'ONLINE':
      return {
        badge: 'LIVE',
        color: 'text-green-400',
        message: 'FinDash market data active',
      };
    case 'DEGRADED':
      return {
        badge: 'DEGRADED',
        color: 'text-amber-400',
        message: 'FinDash partially available',
      };
    case 'OFFLINE':
    default:
      return {
        badge: 'OFFLINE',
        color: 'text-red-400',
        message: 'FinDash offline - start on port 3000',
      };
  }
}

