/**
 * Signals Calculator
 * 
 * Computes option chain signals from StrataXOptionRow[] data.
 */

import { StrataXOptionRow } from '../types/strataxTypes';

export interface OptionSignals {
  pcr: number; // Put/Call Ratio
  highestOIStrikes: Array<{
    strike: number;
    oi: number;
    optionType: 'CALL' | 'PUT';
  }>;
  highestOIChange: Array<{
    strike: number;
    oiChange: number;
    optionType: 'CALL' | 'PUT';
  }>;
  mostActiveStrikes: Array<{
    strike: number;
    volume: number;
    optionType: 'CALL' | 'PUT';
  }>;
  ivRank?: number | null;
}

/**
 * Calculate signals from option chain rows.
 */
export function calculateSignals(rows: StrataXOptionRow[]): OptionSignals {
  if (!rows || rows.length === 0) {
    return {
      pcr: 0,
      highestOIStrikes: [],
      highestOIChange: [],
      mostActiveStrikes: [],
      ivRank: null,
    };
  }

  // Separate calls and puts
  const calls = rows.filter(r => r.optionType === 'CE');
  const puts = rows.filter(r => r.optionType === 'PE');

  // Calculate PCR (Put/Call Ratio)
  const totalPutOI = puts.reduce((sum, r) => sum + (r.openInterest || 0), 0);
  const totalCallOI = calls.reduce((sum, r) => sum + (r.openInterest || 0), 0);
  const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  // Highest OI strikes (top 10)
  const allOI = rows
    .filter(r => r.openInterest && r.openInterest > 0)
    .map(r => ({
      strike: r.strikePrice,
      oi: r.openInterest!,
      optionType: r.optionType === 'CE' ? 'CALL' as const : 'PUT' as const,
    }))
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 10);

  // Highest OI change (top 10)
  const allOIChange = rows
    .filter(r => r.changeInOI !== null && r.changeInOI !== undefined)
    .map(r => ({
      strike: r.strikePrice,
      oiChange: r.changeInOI!,
      optionType: r.optionType === 'CE' ? 'CALL' as const : 'PUT' as const,
    }))
    .sort((a, b) => Math.abs(b.oiChange) - Math.abs(a.oiChange))
    .slice(0, 10);

  // Most active strikes by volume (top 10)
  const allVolume = rows
    .filter(r => r.totalTradedVolume && r.totalTradedVolume > 0)
    .map(r => ({
      strike: r.strikePrice,
      volume: r.totalTradedVolume!,
      optionType: r.optionType === 'CE' ? 'CALL' as const : 'PUT' as const,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // IV Rank (simplified - would need historical IV data for proper calculation)
  const ivRank = null; // TODO: Implement IV rank calculation with historical data

  return {
    pcr,
    highestOIStrikes: allOI,
    highestOIChange: allOIChange,
    mostActiveStrikes: allVolume,
    ivRank,
  };
}

/**
 * Calculate support and resistance levels based on highest put/call OI.
 */
export function calculateSupportResistance(rows: StrataXOptionRow[]): {
  support: number[];
  resistance: number[];
} {
  if (!rows || rows.length === 0) {
    return { support: [], resistance: [] };
  }

  // Highest put OI = support levels
  const putOI = rows
    .filter(r => r.optionType === 'PE' && r.openInterest && r.openInterest > 0)
    .map(r => ({
      strike: r.strikePrice,
      oi: r.openInterest!,
    }))
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 5)
    .map(item => item.strike);

  // Highest call OI = resistance levels
  const callOI = rows
    .filter(r => r.optionType === 'CE' && r.openInterest && r.openInterest > 0)
    .map(r => ({
      strike: r.strikePrice,
      oi: r.openInterest!,
    }))
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 5)
    .map(item => item.strike);

  return {
    support: putOI,
    resistance: callOI,
  };
}
