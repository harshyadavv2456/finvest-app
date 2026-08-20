/**
 * Mock Option Chain Data for StrataX
 * 
 * Realistic mock data for development and demo purposes.
 * Structure matches live data format for easy migration.
 */

import { StrataXOptionChain } from '../types/strataxTypes';

// Generate mock option chain data
function generateMockOptionChain(
  underlying: string,
  spotPrice: number,
  expiry: string
): StrataXOptionChain {
  const strikes: number[] = [];
  const atmStrike = Math.round(spotPrice / 50) * 50; // Round to nearest 50
  
  // Generate strikes around ATM (20 strikes on each side)
  for (let i = -20; i <= 20; i++) {
    strikes.push(atmStrike + i * 50);
  }

  const rows = strikes.map((strike) => {
    // Calculate moneyness
    const moneyness = strike / spotPrice;
    
    // Mock LTP based on moneyness and time value
    const intrinsicCall = Math.max(0, spotPrice - strike);
    const intrinsicPut = Math.max(0, strike - spotPrice);
    const timeValue = Math.random() * 50 + 20; // Random time value
    
    const callLTP = intrinsicCall + timeValue * (1 - Math.abs(moneyness - 1) * 0.5);
    const putLTP = intrinsicPut + timeValue * (1 - Math.abs(moneyness - 1) * 0.5);
    
    // Mock IV (higher for OTM, lower for ITM)
    const baseIV = 0.15 + Math.random() * 0.15; // 15-30%
    const callIV = baseIV * (1 + Math.abs(moneyness - 1) * 0.3);
    const putIV = baseIV * (1 + Math.abs(moneyness - 1) * 0.3);
    
    // Mock OI and Volume
    const baseOI = Math.floor(Math.random() * 1000000) + 100000;
    const baseVolume = Math.floor(Math.random() * 100000) + 10000;
    
    return {
      strike,
      call: {
        ltp: Math.max(0.05, callLTP),
        change: (Math.random() - 0.5) * 10,
        volume: baseVolume + Math.floor(Math.random() * 50000),
        oi: baseOI + Math.floor(Math.random() * 200000),
        oiChange: Math.floor((Math.random() - 0.5) * 50000),
        iv: callIV,
      },
      put: {
        ltp: Math.max(0.05, putLTP),
        change: (Math.random() - 0.5) * 10,
        volume: baseVolume + Math.floor(Math.random() * 50000),
        oi: baseOI + Math.floor(Math.random() * 200000),
        oiChange: Math.floor((Math.random() - 0.5) * 50000),
        iv: putIV,
      },
    };
  });

  return {
    underlying,
    expiry,
    spotPrice,
    rows,
    timestamp: new Date().toISOString(),
  };
}

// Predefined spot prices for common underlyings
const SPOT_PRICES: Record<string, number> = {
  'NIFTY': 24500,
  'BANKNIFTY': 52000,
  'RELIANCE': 2850,
  'TCS': 3850,
  'INFY': 1650,
  'HDFCBANK': 1650,
  'ICICIBANK': 1120,
  'SBIN': 750,
  'BHARTIARTL': 1400,
  'HINDUNILVR': 2600,
};

// Predefined expiries (next 4 Thursdays)
function getNextThursdays(count: number = 4): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  // Find next Thursday
  let current = new Date(today);
  const dayOfWeek = current.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
  current.setDate(current.getDate() + daysUntilThursday);
  
  for (let i = 0; i < count; i++) {
    const expiry = new Date(current);
    expiry.setDate(expiry.getDate() + i * 7);
    dates.push(expiry.toISOString().split('T')[0]);
  }
  
  return dates;
}

export const MOCK_UNDERLYINGS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'HINDUNILVR'];

export function getMockOptionChain(
  underlying: string,
  expiry?: string
): StrataXOptionChain {
  const spotPrice = SPOT_PRICES[underlying] || 1000;
  const expiries = getNextThursdays();
  const selectedExpiry = expiry || expiries[0];
  
  return generateMockOptionChain(underlying, spotPrice, selectedExpiry);
}

export function getMockExpiries(_underlying: string): string[] {
  return getNextThursdays();
}

