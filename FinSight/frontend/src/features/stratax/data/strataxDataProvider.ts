/**
 * StrataX Data Provider Abstraction Layer
 * 
 * Provides a clean interface for fetching option chain data.
 * Supports mock data for v1, designed for easy migration to live data.
 */

import { OptionChainProvider, StrataXOptionChain } from '../types/strataxTypes';
import { getMockOptionChain, getMockExpiries, MOCK_UNDERLYINGS } from './mockOptionChainData';

/**
 * Mock Option Chain Provider
 * 
 * Returns realistic mock data for development and demo.
 */
export class MockOptionChainProvider implements OptionChainProvider {
  async getOptionChain(underlying: string, expiry?: string): Promise<StrataXOptionChain> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return getMockOptionChain(underlying, expiry);
  }

  async getAvailableUnderlyings(): Promise<string[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return [...MOCK_UNDERLYINGS];
  }

  async getAvailableExpiries(underlying: string): Promise<string[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return getMockExpiries(underlying);
  }
}

/**
 * Live Option Chain Provider (Future Implementation)
 * 
 * This will be implemented when live data source is available.
 * It will fetch from NSE or a 3rd-party API.
 */
export class LiveOptionChainProvider implements OptionChainProvider {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/stratax') {
    this.baseUrl = baseUrl;
  }

  async getOptionChain(underlying: string, expiry?: string): Promise<StrataXOptionChain> {
    const params = new URLSearchParams({ underlying });
    if (expiry) {
      params.append('expiry', expiry);
    }

    const response = await fetch(`${this.baseUrl}/option-chain?${params}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch option chain: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Map backend response to frontend format
    return {
      underlying: data.underlying,
      expiry: data.expiry,
      spotPrice: data.spot_price,
      rows: data.rows.map((row: any) => ({
        strike: row.strike,
        call: row.call,
        put: row.put,
      })),
      timestamp: data.timestamp,
    };
  }

  async getAvailableUnderlyings(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/underlyings`);
    if (!response.ok) {
      throw new Error(`Failed to fetch underlyings: ${response.statusText}`);
    }

    return response.json();
  }

  async getAvailableExpiries(underlying: string): Promise<string[]> {
    const params = new URLSearchParams({ underlying });
    const response = await fetch(`${this.baseUrl}/expiries?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch expiries: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Default data provider instance
 * 
 * Uses backend API by default for real-time data.
 * Falls back to mock if backend is unavailable.
 */
export const optionChainProvider: OptionChainProvider = new LiveOptionChainProvider();

/**
 * Factory function to get the appropriate provider
 */
export function getOptionChainProvider(): OptionChainProvider {
  // Check environment variable or config to determine provider
  const useMock = import.meta.env.VITE_STRATAX_USE_MOCK_DATA === 'true';
  
  if (useMock) {
    return new MockOptionChainProvider();
  }
  
  // Default: Use live backend API
  return new LiveOptionChainProvider();
}

