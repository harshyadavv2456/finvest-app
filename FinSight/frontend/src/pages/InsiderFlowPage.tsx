import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Users, DollarSign, Building2, FileText, Newspaper, AlertTriangle, ChevronRight, Zap, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, withRetry } from '../services/apiClient';
import { api as libApi } from '../lib/api';
import { RETRY_CONFIG } from '../config/env';

// =============================================================================
// INTERFACES
// =============================================================================

interface InsiderSignal {
  symbol: string;
  date: string;
  num_trades: number;
  num_bullish: number;
  num_bearish: number;
  total_buy_value: number;
  total_sell_value: number;
  signal_strength: number;
  cluster_buy: boolean;
  cluster_sell: boolean;
}

interface InsiderTrade {
  symbol: string;
  insider: string;
  date: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  value: number;
}

interface HedgeFundSignal {
  cusip: string;
  name: string;
  ticker?: string;
  date: string;
  num_funds: number;
  total_value: number;
  increases: number;
  decreases: number;
  new_positions: number;
  exits: number;
  net_flow: number;
}

interface CorporateAnnouncement {
  symbol: string;
  date: string;
  category: string;
  summary: string;
}

type TabType = 'overview' | 'trades' | 'form4' | '13f' | 'announcements';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const formatCurrency = (value: number) => {
  if (!value || isNaN(value)) return '$0';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatDate = (date: string) => {
  try {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return date;
  }
};

const getSignalColor = (strength: number) => {
  if (strength > 20) return 'text-emerald-400 bg-emerald-500/20';
  if (strength > 0) return 'text-green-400 bg-green-500/20';
  if (strength < -20) return 'text-red-400 bg-red-500/20';
  if (strength < 0) return 'text-orange-400 bg-orange-500/20';
  return 'text-gray-400 bg-gray-500/20';
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InsiderFlowPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [signals, setSignals] = useState<InsiderSignal[]>([]);
  const [trades, setTrades] = useState<InsiderTrade[]>([]);
  const [hedgeFundSignals, setHedgeFundSignals] = useState<HedgeFundSignal[]>([]);
  const [corporateAnnouncements, setCorporateAnnouncements] = useState<CorporateAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [signalsData, tradesData, hedgeFundData, announcementsData] = await Promise.all([
        withRetry(() => api.getInsiderFlowSignals(365), { maxRetries: RETRY_CONFIG.MAX_RETRIES }),
        withRetry(() => api.getInsiderFlowTrades(180, 500), { maxRetries: RETRY_CONFIG.MAX_RETRIES }),
        withRetry(() => api.getInsiderFlow13F(365), { maxRetries: RETRY_CONFIG.MAX_RETRIES }),
        libApi.get('/api/announcements/today').catch(() => ({ data: null })),
      ]);
      
      setSignals(signalsData.signals || []);
      setTrades(tradesData.trades || []);
      setHedgeFundSignals(hedgeFundData.signals || []);
      setCorporateAnnouncements(announcementsData.data?.corporate_in?.announcements || []);
    } catch (err: any) {
      console.error('Error fetching insider flow data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =============================================================================
  // COMPUTED INSIGHTS
  // =============================================================================

  const insights = useMemo(() => {
    // Filter valid signals
    const validSignals = signals.filter(s => s.symbol && s.symbol !== '-' && s.symbol !== 'NONE');
    
    const bullishSignals = validSignals.filter(s => s.signal_strength > 0);
    const bearishSignals = validSignals.filter(s => s.signal_strength < 0);
    const clusterBuys = validSignals.filter(s => s.cluster_buy);
    const clusterSells = validSignals.filter(s => s.cluster_sell);
    
    const totalBuyValue = validSignals.reduce((sum, s) => sum + (s.total_buy_value || 0), 0);
    const totalSellValue = validSignals.reduce((sum, s) => sum + (s.total_sell_value || 0), 0);
    
    // Top stocks by buy value (filter out invalid entries)
    const topBuyers = [...validSignals]
      .filter(s => s.total_buy_value > 0)
      .sort((a, b) => b.total_buy_value - a.total_buy_value)
      .slice(0, 10);
    
    // Top stocks by sell value
    const topSellers = [...validSignals]
      .filter(s => s.total_sell_value > 0)
      .sort((a, b) => b.total_sell_value - a.total_sell_value)
      .slice(0, 10);
    
    // Hedge fund insights - filter valid entries
    const validHedgeFund = hedgeFundSignals.filter(h => h.name && h.total_value > 0);
    const bullishFunds = validHedgeFund.filter(h => h.net_flow > 0);
    const bearishFunds = validHedgeFund.filter(h => h.net_flow < 0);
    const totalAUM = validHedgeFund.reduce((sum, h) => sum + (h.total_value || 0), 0);
    
    // Top 13F positions by value
    const top13F = [...validHedgeFund]
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 10);
    
    // Most active stocks (high trade count)
    const mostActive = [...validSignals]
      .filter(s => s.num_trades >= 3)
      .sort((a, b) => b.num_trades - a.num_trades)
      .slice(0, 5);
    
    return {
      bullishCount: bullishSignals.length,
      bearishCount: bearishSignals.length,
      clusterBuys: clusterBuys.length,
      clusterSells: clusterSells.length,
      totalBuyValue,
      totalSellValue,
      netFlow: totalBuyValue - totalSellValue,
      topBuyers,
      topSellers,
      bullishFunds: bullishFunds.length,
      bearishFunds: bearishFunds.length,
      totalAUM,
      top13F,
      mostActive,
      signalRatio: totalSellValue > 0 ? totalBuyValue / totalSellValue : 0,
    };
  }, [signals, hedgeFundSignals]);

  // Recent trades (filter valid)
  const recentTrades = useMemo(() => {
    return trades
      .filter(t => t.symbol && t.value > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 100);
  }, [trades]);

  // Significant trades (>$100K)
  const significantTrades = useMemo(() => {
    return recentTrades.filter(t => t.value >= 100000);
  }, [recentTrades]);

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Target },
    { id: 'trades' as TabType, label: 'Recent Trades', icon: Zap },
    { id: 'form4' as TabType, label: 'Form 4 Signals', icon: Users },
    { id: '13f' as TabType, label: '13F Holdings', icon: Building2 },
    { id: 'announcements' as TabType, label: 'Corp Announcements', icon: Newspaper },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#0d1526] to-[#0a0f1a]">
      {/* Header */}
      <div className="bg-[#111827]/80 backdrop-blur-xl border-b border-emerald-500/20 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <button onClick={() => navigate('/')} className="p-1.5 sm:p-2 hover:bg-emerald-500/10 rounded-lg transition-colors">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </button>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  InsiderFlow Intelligence
                </h1>
                <p className="text-xs sm:text-sm text-gray-400">SEC Form 4, 13F & Corporate Filings</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-[#1f2937] text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-3 sm:p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-400">Analyzing institutional trading patterns...</p>
          </div>
        ) : (
          <>
            {/* ================================================================ */}
            {/* OVERVIEW TAB */}
            {/* ================================================================ */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-emerald-900/30 to-green-900/10 border border-emerald-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm text-gray-400">Bullish Signals</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{insights.bullishCount}</div>
                    <div className="text-xs text-emerald-300/60 mt-1">{insights.clusterBuys} cluster buys</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-red-900/30 to-orange-900/10 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-5 h-5 text-red-400" />
                      <span className="text-sm text-gray-400">Bearish Signals</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-red-400">{insights.bearishCount}</div>
                    <div className="text-xs text-red-300/60 mt-1">{insights.clusterSells} cluster sells</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-blue-400" />
                      <span className="text-sm text-gray-400">Net Flow</span>
                    </div>
                    <div className={`text-2xl sm:text-3xl font-bold ${insights.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(Math.abs(insights.netFlow))}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{insights.netFlow >= 0 ? 'Net buying' : 'Net selling'}</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-900/30 to-violet-900/10 border border-purple-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-5 h-5 text-purple-400" />
                      <span className="text-sm text-gray-400">13F AUM Tracked</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-purple-400">{formatCurrency(insights.totalAUM)}</div>
                    <div className="text-xs text-purple-300/60 mt-1">{hedgeFundSignals.length} positions</div>
                  </div>
                </div>

                {/* Top Buying & Selling */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top Insider Buying */}
                  <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-emerald-500/5">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        Top Insider Buying
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                      {insights.topBuyers.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">No significant insider buys detected</div>
                      ) : (
                        insights.topBuyers.map((s, i) => (
                          <button 
                            key={i}
                            onClick={() => navigate(`/stock/${s.symbol}`)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-emerald-500/5 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-5">#{i + 1}</span>
                              <span className="font-bold text-white">{s.symbol}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-emerald-400 font-medium">{formatCurrency(s.total_buy_value)}</div>
                              <div className="text-xs text-gray-500">{s.num_trades} trades</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Top Insider Selling */}
                  <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-red-500/5">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                        Top Insider Selling
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                      {insights.topSellers.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">No significant insider sells detected</div>
                      ) : (
                        insights.topSellers.map((s, i) => (
                          <button 
                            key={i}
                            onClick={() => navigate(`/stock/${s.symbol}`)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-red-500/5 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-5">#{i + 1}</span>
                              <span className="font-bold text-white">{s.symbol}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-red-400 font-medium">{formatCurrency(s.total_sell_value)}</div>
                              <div className="text-xs text-gray-500">{s.num_trades} trades</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Significant Recent Trades */}
                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Significant Trades (&gt;$100K)
                    </h3>
                    <button 
                      onClick={() => setActiveTab('trades')}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      View All <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="divide-y divide-gray-800/50 max-h-[400px] overflow-y-auto">
                    {significantTrades.slice(0, 15).map((trade, i) => (
                      <button 
                        key={i}
                        onClick={() => navigate(`/stock/${trade.symbol}`)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            trade.type === 'BUY' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.type}
                          </span>
                          <div>
                            <div className="font-bold text-white">{trade.symbol}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[150px]">{trade.insider}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${trade.type === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(trade.value)}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(trade.date)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* RECENT TRADES TAB */}
            {/* ================================================================ */}
            {activeTab === 'trades' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">All Recent Insider Trades</h2>
                  <span className="text-sm text-gray-400">{recentTrades.length} trades</span>
                </div>
                
                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-[#1f2937]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Symbol</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Insider</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Shares</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Price</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {recentTrades.map((trade, i) => (
                          <tr 
                            key={i} 
                            className="hover:bg-gray-800/30 cursor-pointer transition-colors"
                            onClick={() => navigate(`/stock/${trade.symbol}`)}
                          >
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-2 py-1 rounded ${
                                trade.type === 'BUY' 
                                  ? 'bg-emerald-500/20 text-emerald-400' 
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {trade.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-white">{trade.symbol}</td>
                            <td className="px-4 py-3 text-gray-400 truncate max-w-[200px]">{trade.insider}</td>
                            <td className="px-4 py-3 text-right text-gray-300">{trade.shares?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-300">${trade.price?.toFixed(2)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${trade.type === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(trade.value)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">{formatDate(trade.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* FORM 4 SIGNALS TAB */}
            {/* ================================================================ */}
            {activeTab === 'form4' && (
              <div className="space-y-4">
                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl p-4">
                  <h2 className="text-lg font-bold text-white mb-2">SEC Form 4 Signal Analysis</h2>
                  <p className="text-sm text-gray-400 mb-4">
                    Aggregated insider trading signals. Cluster signals indicate multiple insiders trading in the same direction.
                  </p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{insights.bullishCount}</div>
                      <div className="text-xs text-gray-400">Bullish</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{insights.bearishCount}</div>
                      <div className="text-xs text-gray-400">Bearish</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{insights.clusterBuys}</div>
                      <div className="text-xs text-gray-400">Cluster Buys</div>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-400">{insights.clusterSells}</div>
                      <div className="text-xs text-gray-400">Cluster Sells</div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="bg-[#1f2937]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Symbol</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Trades</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-400">Buy Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-red-400">Sell Value</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Signal</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Cluster</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {signals.filter(s => s.symbol && s.symbol !== '-').slice(0, 100).map((signal, i) => (
                          <tr 
                            key={i} 
                            className="hover:bg-gray-800/30 cursor-pointer transition-colors"
                            onClick={() => navigate(`/stock/${signal.symbol}`)}
                          >
                            <td className="px-4 py-3 font-bold text-white">{signal.symbol}</td>
                            <td className="px-4 py-3 text-gray-400">{signal.date}</td>
                            <td className="px-4 py-3 text-right text-gray-300">{signal.num_trades}</td>
                            <td className="px-4 py-3 text-right text-emerald-400">{formatCurrency(signal.total_buy_value)}</td>
                            <td className="px-4 py-3 text-right text-red-400">{formatCurrency(signal.total_sell_value)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-bold px-2 py-1 rounded ${getSignalColor(signal.signal_strength)}`}>
                                {signal.signal_strength > 0 ? '+' : ''}{signal.signal_strength.toFixed(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {signal.cluster_buy && <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded">BUY</span>}
                              {signal.cluster_sell && <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded ml-1">SELL</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* 13F HOLDINGS TAB */}
            {/* ================================================================ */}
            {activeTab === '13f' && (
              <div className="space-y-4">
                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl p-4">
                  <h2 className="text-lg font-bold text-white mb-2">13F Hedge Fund Holdings</h2>
                  <p className="text-sm text-gray-400 mb-4">
                    Quarterly institutional holdings from SEC 13F filings. Track what major hedge funds are buying and selling.
                  </p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">{formatCurrency(insights.totalAUM)}</div>
                      <div className="text-xs text-gray-400">Total AUM Tracked</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{hedgeFundSignals.length}</div>
                      <div className="text-xs text-gray-400">Positions</div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{insights.bullishFunds}</div>
                      <div className="text-xs text-gray-400">Net Increases</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{insights.bearishFunds}</div>
                      <div className="text-xs text-gray-400">Net Decreases</div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead className="bg-[#1f2937]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Asset</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Ticker</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400"># Funds</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Total Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-400">Increases</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-red-400">Decreases</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">New</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Exits</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Net Flow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {hedgeFundSignals.filter(h => h.name).slice(0, 100).map((signal, i) => (
                          <tr 
                            key={i} 
                            className="hover:bg-gray-800/30 cursor-pointer transition-colors"
                            onClick={() => signal.ticker && navigate(`/stock/${signal.ticker}`)}
                          >
                            <td className="px-4 py-3 text-gray-300 truncate max-w-[200px]">{signal.name}</td>
                            <td className="px-4 py-3">
                              {signal.ticker ? (
                                <span className="font-bold text-purple-400 bg-purple-500/20 px-2 py-1 rounded text-xs">
                                  {signal.ticker}
                                </span>
                              ) : (
                                <span className="text-gray-500 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">{signal.num_funds}</td>
                            <td className="px-4 py-3 text-right text-gray-300 font-medium">{formatCurrency(signal.total_value)}</td>
                            <td className="px-4 py-3 text-right text-emerald-400">{signal.increases}</td>
                            <td className="px-4 py-3 text-right text-red-400">{signal.decreases}</td>
                            <td className="px-4 py-3 text-right text-blue-400">{signal.new_positions}</td>
                            <td className="px-4 py-3 text-right text-orange-400">{signal.exits}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-bold px-2 py-1 rounded ${
                                signal.net_flow > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                                signal.net_flow < 0 ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {signal.net_flow > 0 ? '+' : ''}{signal.net_flow}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* CORPORATE ANNOUNCEMENTS TAB */}
            {/* ================================================================ */}
            {activeTab === 'announcements' && (
              <div className="space-y-4">
                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl p-4">
                  <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-indigo-400" />
                    Corporate Announcements (India)
                  </h2>
                  <p className="text-sm text-gray-400">
                    Latest corporate filings and announcements from NSE/BSE listed companies.
                  </p>
                </div>

                <div className="bg-[#111827]/60 border border-gray-800 rounded-xl overflow-hidden">
                  {corporateAnnouncements.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No recent corporate announcements</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-800/50">
                      {corporateAnnouncements.map((ann, i) => (
                        <button
                          key={i}
                          onClick={() => ann.symbol && navigate(`/stock/${ann.symbol}.NS`)}
                          className="w-full px-4 py-4 text-left hover:bg-indigo-500/5 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/20 px-2 py-1 rounded">
                                {ann.symbol || 'NSE'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-gray-500">{ann.date}</span>
                                <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                                  {ann.category}
                                </span>
                              </div>
                              <p className="text-sm text-white line-clamp-2">{ann.summary}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
