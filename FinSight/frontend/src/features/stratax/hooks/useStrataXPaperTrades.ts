/**
 * Hook for managing StrataX Paper Trades
 * 
 * Uses localStorage for persistence in v1.
 * Designed to be easily migrated to backend API later.
 */

import { useState, useEffect, useCallback } from 'react';
import { StrataXPaperTrade } from '../types/strataxTypes';

const STORAGE_KEY = 'finsight_stratax_paper_trades';

/**
 * Load paper trades from localStorage
 */
function loadPaperTradesFromStorage(): StrataXPaperTrade[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load paper trades from localStorage:', error);
    return [];
  }
}

/**
 * Save paper trades to localStorage
 */
function savePaperTradesToStorage(trades: StrataXPaperTrade[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (error) {
    console.error('Failed to save paper trades to localStorage:', error);
  }
}

/**
 * Hook for managing paper trades
 */
export function useStrataXPaperTrades() {
  const [trades, setTrades] = useState<StrataXPaperTrade[]>([]);
  const [loading, setLoading] = useState(true);

  // Load trades on mount
  useEffect(() => {
    const loaded = loadPaperTradesFromStorage();
    setTrades(loaded);
    setLoading(false);
  }, []);

  /**
   * Save a new paper trade
   */
  const savePaperTrade = useCallback((trade: Omit<StrataXPaperTrade, 'id'>) => {
    const newTrade: StrataXPaperTrade = {
      ...trade,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    const updated = [...trades, newTrade];
    setTrades(updated);
    savePaperTradesToStorage(updated);
    return newTrade.id;
  }, [trades]);

  /**
   * Update an existing paper trade
   */
  const updatePaperTrade = useCallback((id: string, updates: Partial<StrataXPaperTrade>) => {
    const updated = trades.map(trade =>
      trade.id === id ? { ...trade, ...updates } : trade
    );
    setTrades(updated);
    savePaperTradesToStorage(updated);
  }, [trades]);

  /**
   * Delete a paper trade
   */
  const deletePaperTrade = useCallback((id: string) => {
    const updated = trades.filter(trade => trade.id !== id);
    setTrades(updated);
    savePaperTradesToStorage(updated);
  }, [trades]);

  /**
   * Get a paper trade by ID
   */
  const getPaperTrade = useCallback((id: string): StrataXPaperTrade | undefined => {
    return trades.find(trade => trade.id === id);
  }, [trades]);

  return {
    trades,
    loading,
    savePaperTrade,
    updatePaperTrade,
    deletePaperTrade,
    getPaperTrade,
  };
}

