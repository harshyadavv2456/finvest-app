/**
 * Hook for Sensibull-style chain analytics (Max Pain, PCR, support/
 * resistance, ATM straddle) - Workstream D "pro level" analytics.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';

export interface ChainAnalytics {
  available: boolean;
  spot?: number | null;
  max_pain?: number | null;
  pcr_oi?: number | null;
  atm_straddle_price?: number | null;
  total_call_oi?: number | null;
  total_put_oi?: number | null;
  total_call_volume?: number | null;
  total_put_volume?: number | null;
  resistance_strike?: number | null;
  support_strike?: number | null;
}

export function useStrataXAnalytics(symbol: string) {
  const [analytics, setAnalytics] = useState<ChainAnalytics>({ available: false });
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    if (!symbol) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStrataXAnalytics(symbol);
      setAnalytics(data);
    } catch {
      setAnalytics({ available: false });
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
}
