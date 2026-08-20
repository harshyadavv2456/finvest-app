/**
 * CoveragePanel - Market Pipeline Coverage Display
 * 
 * Shows per-market breakdown of:
 * - Total ingested tickers
 * - Valid data count  
 * - Signal-eligible count
 * - Decision breakdown (INITIATE, HOLD, AVOID)
 * - Pipeline status and freshness
 */

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiClient';
import { 
  BarChart3, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Globe,
  Database,
  Cpu,
  Zap
} from 'lucide-react';

interface MarketCoverage {
  market: string;
  total_ingested: number;
  data_valid: number;
  signal_eligible: number;
  decision_generated: Record<string, number>;
  last_pipeline_run: string | null;
  pipeline_version: string;
  status: string;
  status_reason: string | null;
}

interface CoverageData {
  coverage: MarketCoverage[];
  api_version: string;
  git_commit: string | null;
  timestamp: string;
}

interface SystemStatus {
  status: string;
  overall_health: string;
  last_successful_run: string | null;
  next_scheduled_run: string;
  pipeline_health: Record<string, {
    last_run?: string;
    age_hours?: number;
    status: string;
    total_stocks?: number;
    version?: string;
    error?: string;
  }>;
  backend: {
    environment: string;
    api_url: string;
    data_dir: string;
    data_dir_exists: boolean;
  };
  timestamp: string;
}

// Status badge colors
const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'live':
    case 'healthy':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'stale':
    case 'degraded':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'failed':
    case 'outdated':
    case 'unhealthy':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'not_processed':
    case 'not_available':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'live':
    case 'healthy':
      return <CheckCircle className="w-4 h-4" />;
    case 'stale':
    case 'degraded':
      return <AlertTriangle className="w-4 h-4" />;
    case 'failed':
    case 'outdated':
    case 'unhealthy':
      return <XCircle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

// Format time ago
const formatTimeAgo = (isoString: string | null): string => {
  if (!isoString) return 'Never';
  
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return 'Unknown';
  }
};

// Market Coverage Card
const MarketCoverageCard: React.FC<{ coverage: MarketCoverage }> = ({ coverage }) => {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-400" />
          <span className="text-lg font-semibold text-white">
            {coverage.market === 'US' ? '🇺🇸 United States' : '🇮🇳 India'}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${getStatusColor(coverage.status)}`}>
          {getStatusIcon(coverage.status)}
          <span>{coverage.status}</span>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <Database className="w-4 h-4" />
            Tickers Ingested
          </span>
          <span className="text-white font-medium">{coverage.total_ingested.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Valid Data
          </span>
          <span className="text-white font-medium">{coverage.data_valid.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Signal Eligible
          </span>
          <span className="text-white font-medium">{coverage.signal_eligible.toLocaleString()}</span>
        </div>
      </div>

      {/* Decision Breakdown */}
      <div className="bg-[#0f0f1a] rounded-lg p-3 mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Decision Breakdown</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-green-400 font-bold text-lg">
              {coverage.decision_generated.INITIATE || 0}
            </div>
            <div className="text-xs text-gray-500">INITIATE</div>
          </div>
          <div className="text-center">
            <div className="text-gray-300 font-bold text-lg">
              {coverage.decision_generated.HOLD || 0}
            </div>
            <div className="text-xs text-gray-500">HOLD</div>
          </div>
          <div className="text-center">
            <div className="text-red-400 font-bold text-lg">
              {coverage.decision_generated.AVOID || 0}
            </div>
            <div className="text-xs text-gray-500">AVOID</div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>Last Pipeline Run</span>
          <span className="text-gray-400">{formatTimeAgo(coverage.last_pipeline_run)}</span>
        </div>
        <div className="flex justify-between">
          <span>Pipeline Version</span>
          <span className="text-gray-400">{coverage.pipeline_version}</span>
        </div>
        {coverage.status_reason && (
          <div className="flex justify-between">
            <span>Status</span>
            <span className="text-gray-400">{coverage.status_reason}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Main Component
export const CoveragePanel: React.FC = () => {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [coverageData, statusData] = await Promise.all([
        api.getCoverage(),
        api.getSystemStatus(),
      ]);
      setCoverage(coverageData);
      setSystemStatus(statusData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load coverage:', err);
      setError(err.message || 'Failed to load coverage data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    if (!coverage) return null;
    
    return {
      totalIngested: coverage.coverage.reduce((sum, m) => sum + m.total_ingested, 0),
      totalValid: coverage.coverage.reduce((sum, m) => sum + m.data_valid, 0),
      totalEligible: coverage.coverage.reduce((sum, m) => sum + m.signal_eligible, 0),
      totalInitiate: coverage.coverage.reduce((sum, m) => sum + (m.decision_generated.INITIATE || 0), 0),
      totalHold: coverage.coverage.reduce((sum, m) => sum + (m.decision_generated.HOLD || 0), 0),
      totalAvoid: coverage.coverage.reduce((sum, m) => sum + (m.decision_generated.AVOID || 0), 0),
    };
  }, [coverage]);

  if (loading) {
    return (
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Loading coverage data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#1a1a2e] border border-red-500/30 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <XCircle className="w-4 h-4" />
          <span>Failed to load coverage: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-lg overflow-hidden">
      {/* Collapsed Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1a1a2e] transition-colors"
      >
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <span className="text-white font-medium">Market Coverage</span>
          
          {/* Quick Stats */}
          {aggregateStats && (
            <div className="flex items-center gap-4 ml-4 text-sm">
              <span className="text-gray-400">
                <span className="text-white font-medium">{aggregateStats.totalIngested.toLocaleString()}</span> tickers
              </span>
              <span className="text-green-400">
                {aggregateStats.totalInitiate} INITIATE
              </span>
              <span className="text-red-400">
                {aggregateStats.totalAvoid} AVOID
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Overall Health Badge */}
          {systemStatus && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${getStatusColor(systemStatus.overall_health)}`}>
              {getStatusIcon(systemStatus.overall_health)}
              <span>{systemStatus.overall_health}</span>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadData();
            }}
            className="p-1.5 hover:bg-[#2a2a4a] rounded-lg transition-colors"
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && coverage && (
        <div className="border-t border-[#2a2a4a] p-4 space-y-4">
          {/* Market Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coverage.coverage.map((market) => (
              <MarketCoverageCard key={market.market} coverage={market} />
            ))}
          </div>

          {/* System Info */}
          {systemStatus && (
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-white">System Info</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-gray-500">Last Successful Run</div>
                  <div className="text-gray-300">{formatTimeAgo(systemStatus.last_successful_run)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Next Scheduled</div>
                  <div className="text-gray-300">{systemStatus.next_scheduled_run}</div>
                </div>
                <div>
                  <div className="text-gray-500">Backend</div>
                  <div className="text-gray-300">{systemStatus.backend.environment}</div>
                </div>
                <div>
                  <div className="text-gray-500">API URL</div>
                  <div className="text-gray-300 truncate" title={systemStatus.backend.api_url}>
                    {systemStatus.backend.api_url}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-gray-500 flex justify-between">
            <span>API v{coverage.api_version} {coverage.git_commit ? `• ${coverage.git_commit}` : ''}</span>
            <span>Last checked: {new Date(coverage.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoveragePanel;

