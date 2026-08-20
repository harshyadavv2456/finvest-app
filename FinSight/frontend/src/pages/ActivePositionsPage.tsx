/**
 * Active Positions Page - Historical Recommendation Memory
 * =========================================================
 * 
 * This page shows ALL recommendations tracked over time:
 * 1. EXIT SIGNALS - Stocks that were INITIATE and now need to be sold
 * 2. ACTIVE HOLDS - Current INITIATE/HOLD recommendations being tracked
 * 3. HOLDING WARNINGS - Positions approaching end of holding period
 * 4. Full lifecycle: INITIATE → HOLD → AVOID with dates
 * 
 * KEY: This is an AUDIT TRAIL, not a trading interface.
 * No buy/sell buttons, no P&L theatrics, just memory and signals.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, TrendingUp, TrendingDown, Clock, Target,
  ArrowRight, RefreshCw, Shield, Activity, BarChart3,
  AlertCircle, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight,
  Calendar, Timer, Eye, History, ChevronRight, Bell
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://finvest-api-gwkz.onrender.com';

type Market = 'US' | 'IN';
type TabType = 'exits' | 'warnings' | 'active' | 'all';

interface Position {
  ticker: string;
  market: string;
  entry_date: string;
  entry_price: number | null;
  entry_conviction: number | null;
  entry_intent: string;
  current_intent: string;
  current_conviction: number | null;
  current_price: number | null;
  days_held: number;
  suggested_holding_days: number;
  pnl_percent: number | null;
  status: string;
  exit_reason: string | null;
  exit_urgency: string;
  holding_warning: string | null;
  holding_progress: number;
  rationale?: string;
  tracked_since?: string;
  last_updated?: string;
}

interface PositionsData {
  market: string;
  total_positions: number;
  exit_signals: number;
  active_holds: number;
  avg_days_held: number;
  positions: Position[];
  exit_required: Position[];
  holds: Position[];
  sync_info: {
    last_sync?: string;
    added?: number;
    updated?: number;
    total?: number;
  };
}

export default function ActivePositionsPage() {
  const navigate = useNavigate();
  const [market, setMarket] = useState<Market>('US');
  const [data, setData] = useState<PositionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('exits');

  // Load positions
  const loadPositions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/positions/active/${market}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setError(null);
      } else {
        setError('Failed to load positions');
      }
    } catch (e) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPositions();
  }, [market]);

  // Sync positions with current intelligence
  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/api/positions/sync/${market}`, { method: 'POST' });
      await loadPositions();
    } finally {
      setSyncing(false);
    }
  };

  // Navigate to stock details
  const handleStockClick = (ticker: string) => {
    navigate(`/stock-intelligence/${market}/${ticker}`);
  };

  // Filter positions by tab
  const getFilteredPositions = (): Position[] => {
    if (!data) return [];
    
    switch (activeTab) {
      case 'exits':
        return data.exit_required || [];
      case 'warnings':
        return (data.positions || []).filter(p => p.holding_warning);
      case 'active':
        return data.holds || [];
      case 'all':
      default:
        return data.positions || [];
    }
  };

  const filteredPositions = getFilteredPositions();

  // Warnings count
  const warningsCount = (data?.positions || []).filter(p => p.holding_warning).length;

  // Format helpers
  const formatPnL = (pnl: number | null) => {
    if (pnl === null) return '-';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: dateStr.startsWith('2024') ? 'numeric' : undefined
    });
  };

  const getStatusBadge = (pos: Position) => {
    const status = pos.status;
    
    if (status === 'EXIT_SIGNAL' || status === 'EXIT_CRITICAL') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
          <XCircle className="w-3 h-3" />
          EXIT
        </span>
      );
    }
    if (status === 'REDUCE') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3 h-3" />
          REDUCE
        </span>
      );
    }
    if (pos.holding_warning) {
      return (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
          <Clock className="w-3 h-3" />
          REVIEW
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
        <CheckCircle2 className="w-3 h-3" />
        HOLD
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 sm:p-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
            <History className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400" />
            Recommendation Memory
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Track INITIATE → HOLD → EXIT lifecycle • Holding periods • Historical audit trail
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Market Toggle */}
          <div className="flex bg-gray-800/50 rounded-xl p-1 border border-gray-700">
            <button
              onClick={() => setMarket('US')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                market === 'US'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              US
            </button>
            <button
              onClick={() => setMarket('IN')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                market === 'IN'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              IN
            </button>
          </div>
          
          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/30 transition-colors border border-purple-500/30"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-400">Total Tracked</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{data.total_positions}</div>
            <div className="text-[10px] text-gray-500 mt-1">Accumulated over time</div>
          </div>
          
          <div className={`rounded-xl p-4 ${data.exit_signals > 0 ? 'bg-red-900/20 border-2 border-red-500/50' : 'bg-[#0d1117] border border-gray-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-gray-400">Exit Signals</span>
            </div>
            <div className={`text-2xl font-bold ${data.exit_signals > 0 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
              {data.exit_signals}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">INITIATE → AVOID</div>
          </div>
          
          <div className={`rounded-xl p-4 ${warningsCount > 0 ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-[#0d1117] border border-gray-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-400">Period Warnings</span>
            </div>
            <div className={`text-2xl font-bold ${warningsCount > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
              {warningsCount}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">Holding period ending</div>
          </div>
          
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-400">Avg Days Held</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">
              {data.avg_days_held || 0}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">Across all positions</div>
          </div>
        </div>
      )}

      {/* EXIT SIGNALS ALERT */}
      {data && data.exit_required && data.exit_required.length > 0 && (
        <div className="bg-gradient-to-r from-red-900/30 to-red-800/20 border-2 border-red-500/50 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-500/30 rounded-full flex items-center justify-center animate-pulse">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-400">
                ⚠️ {data.exit_required.length} EXIT SIGNAL{data.exit_required.length > 1 ? 'S' : ''} DETECTED
              </h2>
              <p className="text-xs text-gray-400">
                These stocks changed from INITIATE to AVOID. If you acted on the original recommendation, consider exiting.
              </p>
            </div>
          </div>
          
          <div className="grid gap-3">
            {data.exit_required.slice(0, 3).map((pos, i) => (
              <button
                key={i}
                onClick={() => handleStockClick(pos.ticker)}
                className="flex items-center justify-between bg-red-950/50 border border-red-500/40 rounded-lg p-4 hover:bg-red-900/50 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-500/30 flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg">{pos.ticker}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
                      <span className="text-green-400">INITIATE</span>
                      <span>{formatDate(pos.entry_date)}</span>
                      <ArrowRight className="w-3 h-3 text-red-400" />
                      <span className="text-red-400 font-bold">EXIT NOW</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {pos.exit_reason || 'Stance changed to AVOID'}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-xs text-gray-400">Held {pos.days_held} days</div>
                  <div className={`text-lg font-bold ${(pos.pnl_percent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPnL(pos.pnl_percent)}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 ml-auto mt-1" />
                </div>
              </button>
            ))}
          </div>
          
          {data.exit_required.length > 3 && (
            <button
              onClick={() => setActiveTab('exits')}
              className="mt-3 text-sm text-red-400 hover:text-red-300 flex items-center gap-1 mx-auto"
            >
              View all {data.exit_required.length} exits <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('exits')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'exits'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Exit Signals
          {data && data.exit_signals > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {data.exit_signals}
            </span>
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('warnings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'warnings'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <Bell className="w-4 h-4" />
          Period Warnings
          {warningsCount > 0 && (
            <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
              {warningsCount}
            </span>
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'active'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Active Holds
        </button>
        
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <History className="w-4 h-4" />
          All History
        </button>
      </div>

      {/* Loading/Error states */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="ml-3 text-gray-400">Loading positions...</span>
        </div>
      )}
      
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadPositions}
            className="mt-3 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty states */}
      {!loading && !error && filteredPositions.length === 0 && (
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-10 text-center">
          {activeTab === 'exits' ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold text-gray-300">No Exit Signals</h3>
              <p className="text-sm text-gray-500 mt-1">
                All tracked positions are still in HOLD status. No exits required.
              </p>
            </>
          ) : activeTab === 'warnings' ? (
            <>
              <Clock className="w-12 h-12 text-purple-400 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold text-gray-300">No Holding Warnings</h3>
              <p className="text-sm text-gray-500 mt-1">
                No positions are approaching their suggested holding period end.
              </p>
            </>
          ) : (
            <>
              <Target className="w-12 h-12 text-blue-400 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold text-gray-300">No Positions Tracked</h3>
              <p className="text-sm text-gray-500 mt-1">
                INITIATE recommendations will be automatically tracked here.
              </p>
              <button
                onClick={handleSync}
                className="mt-4 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm hover:bg-purple-500/30 inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Sync with Intelligence
              </button>
            </>
          )}
        </div>
      )}

      {/* Positions Table */}
      {!loading && !error && filteredPositions.length > 0 && (
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-900/50 border-b border-gray-800 text-xs font-medium text-gray-400">
            <div className="col-span-3">Stock</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Entry Date</div>
            <div className="col-span-2">Holding Period</div>
            <div className="col-span-2">P&L</div>
            <div className="col-span-1"></div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-gray-800/50">
            {filteredPositions.map((pos, i) => (
              <button
                key={i}
                onClick={() => handleStockClick(pos.ticker)}
                className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-gray-800/30 transition-colors w-full text-left items-center"
              >
                {/* Stock */}
                <div className="col-span-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      pos.status === 'EXIT_SIGNAL' ? 'bg-red-500/20' :
                      pos.holding_warning ? 'bg-amber-500/20' :
                      'bg-green-500/20'
                    }`}>
                      {pos.status === 'EXIT_SIGNAL' ? (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white">{pos.ticker}</div>
                      <div className="text-xs text-gray-500">{pos.market}</div>
                    </div>
                  </div>
                </div>
                
                {/* Status */}
                <div className="col-span-2">
                  {getStatusBadge(pos)}
                  {pos.holding_warning && (
                    <div className="text-[10px] text-amber-400 mt-1">
                      {pos.holding_warning}
                    </div>
                  )}
                </div>
                
                {/* Entry Date */}
                <div className="col-span-2">
                  <div className="text-sm text-white">{formatDate(pos.entry_date)}</div>
                  <div className="text-xs text-gray-500">
                    {pos.entry_intent} @ {pos.entry_conviction ? `${Math.round(pos.entry_conviction * 100)}%` : '-'}
                  </div>
                </div>
                
                {/* Holding Period */}
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{pos.days_held}d</span>
                    <span className="text-xs text-gray-500">/ {pos.suggested_holding_days}d</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        pos.holding_progress >= 100 ? 'bg-amber-500' :
                        pos.holding_progress >= 80 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, pos.holding_progress)}%` }}
                    />
                  </div>
                </div>
                
                {/* P&L */}
                <div className="col-span-2">
                  <div className={`text-sm font-bold ${
                    (pos.pnl_percent || 0) > 0 ? 'text-green-400' :
                    (pos.pnl_percent || 0) < 0 ? 'text-red-400' :
                    'text-gray-400'
                  }`}>
                    {formatPnL(pos.pnl_percent)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pos.entry_price ? `$${pos.entry_price.toFixed(2)}` : '-'} → {pos.current_price ? `$${pos.current_price.toFixed(2)}` : '-'}
                  </div>
                </div>
                
                {/* Action */}
                <div className="col-span-1 flex justify-end">
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sync Info Footer */}
      {data?.sync_info && (
        <div className="mt-4 text-center text-xs text-gray-500">
          Last sync: {data.sync_info.last_sync || 'Never'} • 
          {data.sync_info.added || 0} new • {data.sync_info.updated || 0} updated
        </div>
      )}
    </div>
  );
}
