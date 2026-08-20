/**
 * Hook for fetching and managing option chain data
 * Uses the new /api/stratax/option-chain endpoint with StrataXOptionRow[]
 */

import { useState, useEffect, useCallback } from 'react';
import { StrataXOptionRow } from '../types/strataxTypes';
import { api } from '../../../lib/api';

export function useStrataXOptionChain(symbol: string) {
  const [rows, setRows] = useState<StrataXOptionRow[]>([]);
  const [loading, setLoading] = useState(true); // Start with true
  const [error, setError] = useState<string | null>(null);

  const fetchChain = useCallback(async () => {
    if (!symbol) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api.getStrataXOptionChain(symbol);
      setRows(data || []);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch option chain';
      setError(errorMessage);
      setRows([]);
      console.error('Error fetching option chain:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchChain();
  }, [fetchChain]);

  return {
    rows,
    loading,
    error,
    refetch: fetchChain,
  };
}

