/**
 * SystemHealthPanel - Real-time System Status Display
 * 
 * Shows truth, not optimism.
 * 
 * Status for all data sources:
 * - LIVE: Data loaded successfully and fresh
 * - STALE: Data loaded but older than threshold (5 min)
 * - FAILED: Failed to load data (with reason)
 * - LOADING: Currently fetching (max 15s, then FAILED)
 */

import React, { useMemo } from 'react';
import { useDataCore, DataStatus, getStatusColor, getStatusText } from '../core/DataCore';
import { DATA_SOURCES } from '../config/env';
import { CheckCircle, XCircle, Clock, Loader, RefreshCw, AlertTriangle, Server, Wifi, WifiOff } from 'lucide-react';

interface StatusIndicatorProps {
  label: string;
  description?: string;
  status: DataStatus;
  lastUpdated: string | null;
  error: string | null;
  count?: number;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  label,
  description,
  status,
  lastUpdated,
  error,
  count,
}) => {
  const getIcon = () => {
    switch (status) {
      case 'live':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'stale':
        return <Clock size={16} className="text-amber-400" />;
      case 'failed':
        return <XCircle size={16} className="text-red-400" />;
      case 'loading':
        return <Loader size={16} className="text-blue-400 animate-spin" />;
      default:
        return <AlertTriangle size={16} className="text-gray-400" />;
    }
  };

  const statusColor = getStatusColor(status);
  const statusText = getStatusText(status);

  return (
    <div className="flex items-center justify-between py-2.5 px-3 border-b border-gray-800 last:border-b-0 hover:bg-gray-800/30 transition-colors">
      <div className="flex items-center gap-3">
        {getIcon()}
        <div>
          <span className="text-sm text-gray-300">{label}</span>
          {description && (
            <p className="text-[10px] text-gray-500">{description}</p>
          )}
        </div>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
            {count.toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span className={`text-xs font-semibold ${statusColor}`}>
          {statusText}
        </span>
        {lastUpdated && status !== 'loading' && (
          <span className="text-[10px] text-gray-500">
            {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        {error && status === 'failed' && (
          <span className="text-[10px] text-red-400 max-w-[150px] truncate" title={error}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
};

const SystemHealthPanel: React.FC = () => {
  const { state, refreshAll } = useDataCore();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Calculate overall health
  const healthStats = useMemo(() => {
    const statuses: DataStatus[] = [
      state.finSight.status,
      state.smartMoney.insider.status,
      state.smartMoney.hedgeFund.status,
      state.smartMoney.fiiDii.status,
    ];
    
    const failedCount = statuses.filter(s => s === 'failed').length;
    const loadingCount = statuses.filter(s => s === 'loading').length;
    const liveCount = statuses.filter(s => s === 'live').length;
    const staleCount = statuses.filter(s => s === 'stale').length;
    
    let overall: 'healthy' | 'degraded' | 'critical' | 'loading';
    if (loadingCount > 0) {
      overall = 'loading';
    } else if (failedCount >= 3) {
      overall = 'critical';
    } else if (failedCount >= 1 || staleCount >= 2) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return { failedCount, loadingCount, liveCount, staleCount, overall, total: statuses.length };
  }, [state.finSight.status, state.smartMoney.insider.status, state.smartMoney.hedgeFund.status, state.smartMoney.fiiDii.status]);

  const overallColor = {
    healthy: 'text-green-400',
    degraded: 'text-amber-400',
    critical: 'text-red-400',
    loading: 'text-blue-400',
  }[healthStats.overall];

  const overallBg = {
    healthy: 'bg-green-500/10 border-green-500/30',
    degraded: 'bg-amber-500/10 border-amber-500/30',
    critical: 'bg-red-500/10 border-red-500/30',
    loading: 'bg-blue-500/10 border-blue-500/30',
  }[healthStats.overall];

  return (
    <div className="bg-[#0d1117] border border-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${overallBg}`}>
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${overallColor}`}>
            <Server size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">System Health</h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">
              {healthStats.overall === 'healthy' && 'All Systems Operational'}
              {healthStats.overall === 'degraded' && 'Partial Service'}
              {healthStats.overall === 'critical' && 'Service Degraded'}
              {healthStats.overall === 'loading' && 'Initializing...'}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-all disabled:opacity-50"
          title="Refresh All Data"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* API Connection Status */}
      <div className="px-4 py-2 bg-gray-900/30 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          {state.health.apiReachable ? (
            <>
              <Wifi size={12} className="text-green-400" />
              <span className="text-gray-400">API Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-red-400" />
              <span className="text-red-400">API Disconnected</span>
            </>
          )}
        </div>
        <span className="text-[10px] text-gray-600 font-mono truncate max-w-[180px]" title={state.health.backendUrl}>
          {state.health.backendUrl}
        </span>
      </div>

      {/* Data Sources */}
      <div className="divide-y divide-gray-800/50">
        <StatusIndicator
          label={DATA_SOURCES.FINSIGHT.name}
          description={DATA_SOURCES.FINSIGHT.description}
          status={state.finSight.status}
          lastUpdated={state.finSight.lastUpdated}
          error={state.finSight.error}
          count={state.finSight.data?.total_count}
        />
        <StatusIndicator
          label={DATA_SOURCES.INSIDER.name}
          description={DATA_SOURCES.INSIDER.description}
          status={state.smartMoney.insider.status}
          lastUpdated={state.smartMoney.insider.lastUpdated}
          error={state.smartMoney.insider.error}
          count={state.smartMoney.insider.data?.length}
        />
        <StatusIndicator
          label={DATA_SOURCES.HEDGE_FUND.name}
          description={DATA_SOURCES.HEDGE_FUND.description}
          status={state.smartMoney.hedgeFund.status}
          lastUpdated={state.smartMoney.hedgeFund.lastUpdated}
          error={state.smartMoney.hedgeFund.error}
          count={state.smartMoney.hedgeFund.data?.length}
        />
        <StatusIndicator
          label={DATA_SOURCES.FII_DII.name}
          description={DATA_SOURCES.FII_DII.description}
          status={state.smartMoney.fiiDii.status}
          lastUpdated={state.smartMoney.fiiDii.lastUpdated}
          error={state.smartMoney.fiiDii.error}
        />
        {/* FinDash is client-side, always "live" if app loads */}
        <StatusIndicator
          label={DATA_SOURCES.FINDASH.name}
          description={DATA_SOURCES.FINDASH.description}
          status="live"
          lastUpdated={new Date().toISOString()}
          error={null}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-900/30 border-t border-gray-800">
        <div className="flex items-center justify-between text-[10px]">
          <span className={`font-medium ${overallColor}`}>
            {healthStats.liveCount}/{healthStats.total} sources live
            {healthStats.staleCount > 0 && ` • ${healthStats.staleCount} stale`}
            {healthStats.failedCount > 0 && ` • ${healthStats.failedCount} failed`}
          </span>
          {state.health.lastCheck && (
            <span className="text-gray-600">
              Checked: {new Date(state.health.lastCheck).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemHealthPanel;
