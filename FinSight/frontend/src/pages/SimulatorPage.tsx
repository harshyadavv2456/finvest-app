/**
 * Simulator Page - Recommendation Timeline & Opportunities
 * 
 * PRIMARY FEATURE: Show recommendation history by date
 * - What was INITIATE on Dec 21, 22, 23
 * - Transitions: INITIATE → HOLD → AVOID
 * - Highlight stance changes
 * 
 * SECONDARY: Current opportunity list with detailed analysis
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Globe, Brain, BarChart3,
  ArrowRight, AlertCircle, RefreshCw, Target, Shield,
  Clock, Activity, ChevronDown, ChevronUp, Info,
  Calendar, History, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { api } from '../services/apiClient';
import { Opportunity } from '../core/DataCore';

const API_BASE = import.meta.env.VITE_API_URL || 'https://finvest-api-gwkz.onrender.com';

type Market = 'US' | 'IN';
type Tab = 'timeline' | 'initiate' | 'avoid' | 'all';
type SortField = 'rank' | 'conviction' | 'expected_return' | 'cvar';
type SortDir = 'asc' | 'desc';

interface StanceChange {
  ticker: string;
  previous_intent: string;
  previous_conviction: number;
  current_intent: string;
  current_conviction: number;
  from_date: string;
  to_date: string;
  change_type: string;
}

interface HistoryEntry {
  date: string;
  total_stocks: number;
  intent_counts: Record<string, number>;
}

interface PMRegimeBadge {
  badge_text: string;
  badge_type: 'success' | 'warning' | 'neutral';
  tooltip: string;
  icon?: string;
}

export default function SimulatorPage() {
  const navigate = useNavigate();
  const [selectedMarket, setSelectedMarket] = useState<Market>('US');
  const [selectedTab, setSelectedTab] = useState<Tab>('timeline');
  const [data, setData] = useState<any>(null);
  const [stanceChanges, setStanceChanges] = useState<StanceChange[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pmRegime, setPmRegime] = useState<PMRegimeBadge | null>(null);

  // Load PM Regime badge (India market only)
  useEffect(() => {
    if (selectedMarket === 'IN') {
      fetch(`${API_BASE}/api/pm-regime/context-badge`)
        .then(res => res.json())
        .then(data => setPmRegime(data))
        .catch(() => setPmRegime(null));
    } else {
      setPmRegime(null);
    }
  }, [selectedMarket]);

  // Save today's snapshot and load timeline history
  useEffect(() => {
    const loadTimelineData = async () => {
      try {
        // First, save today's snapshot (creates if doesn't exist)
        await fetch(`${API_BASE}/api/timeline/save/${selectedMarket}`, { method: 'POST' });
        
        // Load stance changes (yesterday vs today)
        const changesRes = await fetch(`${API_BASE}/api/timeline/changes/${selectedMarket}`);
        if (changesRes.ok) {
          const changesData = await changesRes.json();
          setStanceChanges(changesData.changes || []);
        }
        
        // Load history for the last 7 days
        const historyRes = await fetch(`${API_BASE}/api/timeline/history/${selectedMarket}?days=7`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistory(historyData.history || []);
        }
      } catch (e) {
        console.error('Failed to load timeline:', e);
      }
    };
    
    loadTimelineData();
  }, [selectedMarket]);

  // Load opportunities data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getTopOpportunities(selectedMarket);
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Failed to load opportunities');
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedMarket]);

  // Computed stance changes for display  
  const displayChanges = useMemo(() => {
    // Use real API data if available
    if (stanceChanges.length > 0) {
      return stanceChanges.map(c => ({
        ticker: c.ticker,
        market: selectedMarket,
        previousStance: c.previous_intent,
        currentStance: c.current_intent,
        conviction: c.current_conviction,
        reason: c.change_type
      }));
    }
    
    // Fallback: show AVOID stocks as potential changes
    if (!data) return [];
    return (data.avoid_list || []).slice(0, 6).map((stock: any) => ({
      ticker: stock.ticker,
      market: stock.market,
      previousStance: 'HOLD',
      currentStance: 'AVOID',
      conviction: stock.conviction,
      reason: stock.risk_summary || 'Risk elevated'
    }));
  }, [stanceChanges, data, selectedMarket]);

  // Filter and sort opportunities
  const displayedOpportunities = useMemo(() => {
    if (!data || selectedTab === 'timeline') return [];
    
    let opportunities: Opportunity[];
    switch (selectedTab) {
      case 'initiate':
        opportunities = data.opportunities || [];
        break;
      case 'avoid':
        opportunities = data.avoid_list || [];
        break;
      case 'all':
        opportunities = [...(data.opportunities || []), ...(data.avoid_list || [])];
        break;
      default:
        opportunities = [];
    }

    return [...opportunities].sort((a, b) => {
      let valA: number, valB: number;
      switch (sortField) {
        case 'conviction':
          valA = a.conviction || 0;
          valB = b.conviction || 0;
          break;
        case 'expected_return':
          valA = a.expected_return_p50 || 0;
          valB = b.expected_return_p50 || 0;
          break;
        case 'cvar':
          valA = Math.abs(a.cvar_95 || 0);
          valB = Math.abs(b.cvar_95 || 0);
          break;
        default:
          valA = a.rank || 999;
          valB = b.rank || 999;
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [data, selectedTab, sortField, sortDir]);

  const formatPercent = (n?: number, decimals = 1) => {
    if (n === undefined || n === null) return '-';
    return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(decimals)}%`;
  };

  const formatNumber = (n?: number) => {
    if (n === undefined || n === null) return '-';
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  };

  const handleStockClick = (ticker: string, oppMarket?: string) => {
    const market = oppMarket || (ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'IN' : 'US');
    navigate(`/stock-intelligence/${market}/${ticker}`);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  // Get dates for the last few days
  const getRecentDates = () => {
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-3 sm:p-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <Brain className="w-5 h-5 sm:w-7 sm:h-7 text-purple-400" />
            Recommendation Simulator
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Recommendation memory • Stance history • 30-day outlook
          </p>
        </div>
        
        {/* Market Toggle */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl p-1 border border-gray-700 self-start sm:self-auto">
          <button
            onClick={() => setSelectedMarket('US')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              selectedMarket === 'US'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Globe className="w-3 h-3 sm:w-4 sm:h-4" />
            US
          </button>
          <button
            onClick={() => setSelectedMarket('IN')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              selectedMarket === 'IN'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Globe className="w-3 h-3 sm:w-4 sm:h-4" />
            IN
          </button>
        </div>
      </header>

      {/* PM Regime Context Badge (India only) */}
      {selectedMarket === 'IN' && pmRegime && (
        <div className={`mb-4 flex items-center gap-3 p-3 rounded-lg border ${
          pmRegime.badge_type === 'warning' 
            ? 'bg-amber-500/10 border-amber-500/30' 
            : pmRegime.badge_type === 'success'
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-gray-800/50 border-gray-700'
        }`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            pmRegime.badge_type === 'warning'
              ? 'bg-amber-500/20'
              : pmRegime.badge_type === 'success'
              ? 'bg-green-500/20'
              : 'bg-gray-700/50'
          }`}>
            {pmRegime.badge_type === 'warning' ? (
              <Shield className={`w-4 h-4 text-amber-400`} />
            ) : pmRegime.badge_type === 'success' ? (
              <TrendingUp className={`w-4 h-4 text-green-400`} />
            ) : (
              <Activity className={`w-4 h-4 text-gray-400`} />
            )}
          </div>
          <div className="flex-1">
            <div className={`text-sm font-bold ${
              pmRegime.badge_type === 'warning' 
                ? 'text-amber-400' 
                : pmRegime.badge_type === 'success'
                ? 'text-green-400'
                : 'text-gray-300'
            }`}>
              {pmRegime.badge_text}
            </div>
            <div className="text-xs text-gray-400">{pmRegime.tooltip}</div>
          </div>
          <div className="text-[10px] text-gray-500 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Gold/Silver ETF Analysis
          </div>
        </div>
      )}

      {/* Stance Changes Alert */}
      {displayChanges.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 to-red-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-amber-400">
              {stanceChanges.length > 0 ? 'Stance Changes Since Yesterday' : 'Current Risk Signals'}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayChanges.slice(0, 6).map((change, i) => (
              <button
                key={i}
                onClick={() => handleStockClick(change.ticker, change.market)}
                className="flex items-center gap-3 bg-gray-900/50 rounded-lg p-3 hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="flex-1">
                  <div className="font-bold text-white">{change.ticker}</div>
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <span className="text-gray-400">{change.previousStance}</span>
                    <ArrowRight className="w-3 h-3 text-red-400" />
                    <span className="text-red-400 font-medium">{change.currentStance}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Conviction</div>
                  <div className="text-sm font-bold text-white">{(change.conviction * 100).toFixed(0)}%</div>
                </div>
              </button>
            ))}
          </div>
          {displayChanges.length > 6 && (
            <div className="mt-3 text-xs text-gray-400 text-center">
              +{displayChanges.length - 6} more changes detected
            </div>
          )}
        </div>
      )}

      {/* Timeline History Bar */}
      {history.length > 0 && (
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400" />
            7-Day Recommendation History
          </h3>
          <div className="flex items-end gap-2 h-16">
            {history.slice(0, 7).reverse().map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex gap-0.5 h-12">
                  <div 
                    className="w-2 bg-green-500/60 rounded-t"
                    style={{ height: `${Math.min(100, (day.intent_counts?.INITIATE || 0) * 3)}%` }}
                    title={`INITIATE: ${day.intent_counts?.INITIATE || 0}`}
                  />
                  <div 
                    className="w-2 bg-red-500/60 rounded-t"
                    style={{ height: `${Math.min(100, (day.intent_counts?.AVOID || 0) / 3)}%` }}
                    title={`AVOID: ${day.intent_counts?.AVOID || 0}`}
                  />
                </div>
                <span className="text-[9px] text-gray-500">{day.date?.slice(5) || ''}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500/60 rounded" /> INITIATE</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/60 rounded" /> AVOID</span>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span className="text-xs text-gray-400">Analyzed</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400">{formatNumber(data.total_stocks)}</div>
          </div>
          <div className="bg-[#0d1117] border border-green-500/20 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
              <span className="text-xs text-gray-400">INITIATE</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-400">{data.initiate_candidates || 0}</div>
          </div>
          <div className="bg-[#0d1117] border border-red-500/20 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
              <span className="text-xs text-gray-400">AVOID</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-400">{data.avoid_candidates || 0}</div>
          </div>
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span className="text-xs text-gray-400">HOLD</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-purple-400">{data.intent_counts?.HOLD || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => setSelectedTab('timeline')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            selectedTab === 'timeline'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Timeline
        </button>
        <button
          onClick={() => setSelectedTab('initiate')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            selectedTab === 'initiate'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          INITIATE ({data?.initiate_candidates || 0})
        </button>
        <button
          onClick={() => setSelectedTab('avoid')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            selectedTab === 'avoid'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          AVOID ({data?.avoid_candidates || 0})
        </button>
        <button
          onClick={() => setSelectedTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedTab === 'all'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-gray-300 border border-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          All Signals
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="text-gray-400">Loading {selectedMarket} recommendations...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-400">
          <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
          <span className="text-lg font-medium">Failed to Load</span>
          <span className="text-sm text-gray-500 mt-1">{error}</span>
        </div>
      ) : selectedTab === 'timeline' ? (
        /* Timeline View */
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/30">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              Recommendation Memory
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Historical stance for each stock • Click to see full intelligence
            </p>
          </div>
          
          {/* Timeline Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-400">
                  <th className="text-left px-6 py-3 font-medium">Stock</th>
                  <th className="text-center px-4 py-3 font-medium">Current Stance</th>
                  <th className="text-center px-4 py-3 font-medium">Conviction</th>
                  <th className="text-left px-4 py-3 font-medium">Rationale</th>
                  <th className="text-center px-4 py-3 font-medium">As Of</th>
                  <th className="text-center px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {/* Show INITIATE stocks */}
                {(data?.opportunities || []).slice(0, 15).map((stock: any, i: number) => (
                  <tr key={`init-${i}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{stock.ticker}</div>
                      <div className="text-xs text-gray-500">{stock.market}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400">
                        <ArrowUpRight className="w-3 h-3" />
                        INITIATE
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`text-sm font-bold ${
                        stock.conviction >= 0.7 ? 'text-green-400' :
                        stock.conviction >= 0.5 ? 'text-yellow-400' : 'text-gray-400'
                      }`}>
                        {(stock.conviction * 100).toFixed(0)}%
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-gray-400 max-w-xs truncate">
                        {stock.risk_summary || stock.why_this_beats_alternatives || 'Positive outlook'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-xs text-gray-500">
                        {data.generated_at ? new Date(data.generated_at).toLocaleDateString() : 'Today'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleStockClick(stock.ticker, stock.market)}
                        className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
                
                {/* Show AVOID stocks */}
                {(data?.avoid_list || []).slice(0, 10).map((stock: any, i: number) => (
                  <tr key={`avoid-${i}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{stock.ticker}</div>
                      <div className="text-xs text-gray-500">{stock.market}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400">
                        <ArrowDownRight className="w-3 h-3" />
                        AVOID
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`text-sm font-bold ${
                        stock.conviction >= 0.7 ? 'text-red-400' :
                        stock.conviction >= 0.5 ? 'text-orange-400' : 'text-gray-400'
                      }`}>
                        {(stock.conviction * 100).toFixed(0)}%
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-gray-400 max-w-xs truncate">
                        {stock.risk_summary || 'Elevated risk detected'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-xs text-gray-500">
                        {data.generated_at ? new Date(data.generated_at).toLocaleDateString() : 'Today'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleStockClick(stock.ticker, stock.market)}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
                      >
                        View Risk
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Note about historical data */}
          <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/20">
            <div className="flex items-start gap-3 text-xs text-gray-500">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-400">About Recommendation Memory</p>
                <p className="mt-1">
                  This view shows the current recommendation stance for each stock. 
                  For detailed historical transitions (when stance changed from INITIATE → HOLD → AVOID), 
                  click on any stock to view its full Intelligence page.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : displayedOpportunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
          <span className="text-lg">No opportunities found</span>
          <span className="text-sm mt-1">Try switching markets or tabs</span>
        </div>
      ) : (
        /* Opportunity Table */
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-900/50 border-b border-gray-800 text-xs text-gray-400 font-medium">
            <button 
              onClick={() => handleSort('rank')}
              className="col-span-1 flex items-center gap-1 hover:text-white transition-colors"
            >
              # <SortIcon field="rank" />
            </button>
            <div className="col-span-2">Ticker</div>
            <div className="col-span-1">Intent</div>
            <button 
              onClick={() => handleSort('conviction')}
              className="col-span-1 flex items-center gap-1 hover:text-white transition-colors"
            >
              Conviction <SortIcon field="conviction" />
            </button>
            <button 
              onClick={() => handleSort('expected_return')}
              className="col-span-2 flex items-center gap-1 hover:text-white transition-colors"
            >
              Exp. Return (30d) <SortIcon field="expected_return" />
            </button>
            <button 
              onClick={() => handleSort('cvar')}
              className="col-span-1 flex items-center gap-1 hover:text-white transition-colors"
            >
              Risk (CVaR) <SortIcon field="cvar" />
            </button>
            <div className="col-span-2">Position Size</div>
            <div className="col-span-2">Regime</div>
          </div>
          
          <div className="divide-y divide-gray-800/50">
            {displayedOpportunities.map((opp: Opportunity, i: number) => (
              <div key={`${opp.ticker}-${i}`}>
                <button
                  onClick={() => setExpandedRow(expandedRow === opp.ticker ? null : opp.ticker)}
                  className="w-full grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-800/30 transition-colors text-left"
                >
                  <div className="col-span-1 text-gray-500 font-mono">{opp.rank || i + 1}</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-white">{opp.ticker}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStockClick(opp.ticker, opp.market);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">{opp.market}</div>
                  </div>
                  <div className="col-span-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${
                      opp.intent === 'INITIATE' 
                        ? 'bg-green-500/20 text-green-400' 
                        : opp.intent === 'AVOID'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {opp.intent}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <div className="flex items-center gap-1">
                      <div className={`text-sm font-medium ${
                        opp.conviction >= 0.7 ? 'text-green-400' :
                        opp.conviction >= 0.5 ? 'text-yellow-400' : 'text-gray-400'
                      }`}>
                        {(opp.conviction * 100).toFixed(0)}%
                      </div>
                      <Target className="w-3 h-3 text-gray-500" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className={`text-sm font-bold ${opp.expected_return_p50 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(opp.expected_return_p50)}
                    </div>
                    <div className="text-xs text-gray-500">30-day median</div>
                  </div>
                  <div className="col-span-1">
                    <div className="flex items-center gap-1">
                      <div className="text-sm text-red-400">{formatPercent(opp.cvar_95)}</div>
                      <Shield className="w-3 h-3 text-gray-500" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-cyan-400">{opp.recommended_position_pct || '-'}%</div>
                    <div className="text-xs text-gray-500">max: {opp.max_position_pct || '-'}%</div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-purple-400">{opp.regime}</div>
                      <div className="text-xs text-gray-500">align: {(opp.regime_alignment * 100).toFixed(0)}%</div>
                    </div>
                    {expandedRow === opp.ticker ? 
                      <ChevronUp className="w-4 h-4 text-gray-500" /> : 
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    }
                  </div>
                </button>
                
                {expandedRow === opp.ticker && (
                  <div className="px-6 py-4 bg-gray-900/30 border-t border-gray-800/50">
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <h4 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Risk Summary
                        </h4>
                        <p className="text-sm text-gray-300">{opp.risk_summary || 'No risk summary available'}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-400 mb-2">Why This Opportunity?</h4>
                        <p className="text-sm text-gray-300">{opp.why_this_beats_alternatives || 'Analysis pending'}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-400 mb-2">Edge Score</h4>
                        <div className="flex items-center gap-2">
                          <div className="text-2xl font-bold text-cyan-400">{opp.edge_score?.toFixed(2) || '-'}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => handleStockClick(opp.ticker, opp.market)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                      >
                        View Full Intelligence
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Info Footer */}
      {data?.generated_at && (
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span>Generated: {new Date(data.generated_at).toLocaleString()}</span>
          <span>•</span>
          <span>Version: {data.version || 'v2'}</span>
          <span>•</span>
          <span className="text-purple-400">30-day forward projections based on 9-layer intelligence pipeline</span>
        </div>
      )}
    </div>
  );
}
