/**
 * StrataX Data Source Status Indicator
 * 
 * Displays the current data source (mock/NSE) and status.
 */

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Activity, Database, AlertCircle } from 'lucide-react';

interface DataStatus {
  active_source: 'mock' | 'nse' | 'csv';
  fallback_used_recently: boolean;
  last_successful_nse_fetch: string | null;
  nse_available: boolean;
  csv_rows_loaded?: number;
}

export default function StrataXDataStatus() {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getStrataXDataStatus();
        setStatus(data);
      } catch (err) {
        console.error('Failed to fetch data status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 text-xs text-bloomberg-text-muted">
        <Activity size={12} className="animate-pulse" />
        <span>Loading status...</span>
      </div>
    );
  }

  // Handle missing status gracefully
  if (!status.active_source) {
    return (
      <div className="flex items-center gap-2 text-xs text-bloomberg-text-muted">
        <Database size={12} />
        <span>CSV Data</span>
      </div>
    );
  }

  const isCSV = status.active_source === 'csv';
  const isLive = status.active_source === 'nse' && !status.fallback_used_recently && status.nse_available;
  const isMock = status.active_source === 'mock' || status.fallback_used_recently;

  return (
    <div className="flex items-center gap-2 text-xs">
      {isCSV ? (
        <>
          <Database size={12} className="text-blue-400" />
          <span className="text-blue-400 font-semibold">CSV Data</span>
          {status.csv_rows_loaded && (
            <span className="text-bloomberg-text-muted">
              ({status.csv_rows_loaded.toLocaleString()} rows)
            </span>
          )}
        </>
      ) : isLive ? (
        <>
          <Activity size={12} className="text-green-400 animate-pulse" />
          <span className="text-green-400 font-semibold">Live (NSE)</span>
          {status.last_successful_nse_fetch && (
            <span className="text-bloomberg-text-muted">
              • {new Date(status.last_successful_nse_fetch).toLocaleTimeString()}
            </span>
          )}
        </>
      ) : isMock ? (
        <>
          <Database size={12} className="text-yellow-400" />
          <span className="text-yellow-400 font-semibold">Mock Data</span>
          {status.fallback_used_recently && status.active_source === 'nse' && (
            <>
              <AlertCircle size={12} className="text-red-400" />
              <span className="text-red-400">(NSE failed, using mock)</span>
            </>
          )}
        </>
      ) : (
        <>
          <AlertCircle size={12} className="text-red-400" />
          <span className="text-red-400">Data Source Error</span>
        </>
      )}
    </div>
  );
}

