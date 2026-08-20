/**
 * FinVest Dashboard - Central Command
 * 
 * A deterministic financial operating system dashboard.
 * 
 * RULES (NON-NEGOTIABLE):
 * - Data comes ONLY from DataCore
 * - NO hardcoded values
 * - NO infinite loading states
 * - Show explicit FAILED state if data unavailable
 * - UI must reflect truth, not optimism
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, BarChart3, Brain,
  ChevronRight, ChevronDown, ChevronUp, Activity, Users, Building2, DollarSign,
  LineChart, Briefcase, Calculator, AlertCircle, Globe, Server, Newspaper, ExternalLink
} from 'lucide-react';
import { useDataCore, DataStatus } from '../core/DataCore';
import SystemHealthPanel from '../components/SystemHealthPanel';
import CoveragePanel from '../components/CoveragePanel';
import { api } from '../services/apiClient';
import { api as libApi } from '../lib/api';

// =============================================================================
// ANIMATED NEWS TICKER COMPONENT
// =============================================================================

interface NewsTickerProps {
  announcements: any[];
  onItemClick: (symbol: string) => void;
  onViewAll: () => void;
}

const NewsTicker: React.FC<NewsTickerProps> = ({ announcements, onItemClick, onViewAll }) => {
  const [isPaused, setIsPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  
  if (announcements.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 text-sm">
        No recent announcements
      </div>
    );
  }
  
  // Duplicate items for seamless infinite scroll
  const items = [...announcements, ...announcements];
  
  return (
    <div 
      className="relative overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        ref={tickerRef}
        className={`flex gap-4 py-3 px-4 ${isPaused ? '' : 'animate-ticker'}`}
        style={{
          width: 'fit-content',
        }}
      >
        {items.map((ann: any, i: number) => (
          <button
            key={i}
            onClick={() => ann.symbol ? onItemClick(ann.symbol + '.NS') : onViewAll()}
            className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl hover:border-indigo-400/40 hover:from-indigo-500/20 hover:to-purple-500/20 transition-all group min-w-[300px] max-w-[400px]"
          >
            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/20 px-2 py-1 rounded flex-shrink-0">
              {ann.symbol || 'NSE'}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-gray-500">{ann.date}</span>
                <span className="text-[10px] text-indigo-400/80 bg-indigo-500/10 px-1.5 py-0.5 rounded">{ann.category}</span>
              </div>
              <p className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">
                {ann.summary?.slice(0, 80)}...
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-indigo-400/50 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
      
      {/* Gradient masks for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0a0a0f] to-transparent pointer-events-none z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0a0f] to-transparent pointer-events-none z-10" />
      
      {/* CSS for ticker animation */}
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 60s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

// FinVest Logo
const FinVestLogo = '/finvest-logo.png';

// Market type
type Market = 'US' | 'IN';

// =============================================================================
// UTILITY COMPONENTS
// =============================================================================

interface DataCardProps {
  status: DataStatus;
  children: React.ReactNode;
}

const DataCard: React.FC<DataCardProps> = ({ status, children }) => {
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-xs text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }
  
  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-red-400">
        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm font-medium">FAILED</span>
        <span className="text-xs text-gray-500 mt-1">Data unavailable</span>
      </div>
    );
  }
  
  return <>{children}</>;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const formatNumber = (n?: number): string => {
  if (n === undefined || n === null) return '-';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
};


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function FinVestDashboard() {
  const navigate = useNavigate();
  const { state } = useDataCore();
  
  // Market selection state
  const [selectedMarket, setSelectedMarket] = useState<Market>('US');
  const [marketOpportunities, setMarketOpportunities] = useState<any>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [showSystemHealth, setShowSystemHealth] = useState(false);
  
  // Announcements state
  const [announcements, setAnnouncements] = useState<{
    insider_us: { trades: any[] };
    corporate_in: { announcements: any[] };
  } | null>(null);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  // Extract data from DataCore
  const finSightData = state.finSight;
  const opportunitiesData = state.topOpportunities;
  const insiderData = state.smartMoney.insider;
  const hedgeFundData = state.smartMoney.hedgeFund;
  const fiiDiiData = state.smartMoney.fiiDii;

  // Load market-specific opportunities when market changes
  useEffect(() => {
    const loadMarketData = async () => {
      setMarketLoading(true);
      try {
        const data = await api.getTopOpportunities(selectedMarket);
        setMarketOpportunities(data);
      } catch (e) {
        console.error(`Failed to load ${selectedMarket} opportunities:`, e);
        setMarketOpportunities(null);
      } finally {
        setMarketLoading(false);
      }
    };
    loadMarketData();
  }, [selectedMarket]);

  // Load announcements on mount
  useEffect(() => {
    const loadAnnouncements = async () => {
      setAnnouncementsLoading(true);
      try {
        const response = await libApi.get('/api/announcements/today');
        if (response.data) {
          setAnnouncements(response.data);
        }
      } catch (e) {
        console.error('Failed to load announcements:', e);
        setAnnouncements(null);
      } finally {
        setAnnouncementsLoading(false);
      }
    };
    loadAnnouncements();
  }, []);

  // Stats from market-specific opportunities
  const opportunityStats = useMemo(() => {
    const data = marketOpportunities || opportunitiesData.data;
    return {
      total: data?.total_stocks || finSightData.data?.total_count || 0,
      initiate: data?.initiate_candidates || 0,
      avoid: data?.avoid_candidates || 0,
      intentCounts: data?.intent_counts || {},
    };
  }, [marketOpportunities, opportunitiesData.data, finSightData.data]);

  // Top INITIATE opportunities from selected market
  // API returns "initiate_list" (from intelligence_api) or "opportunities" (from older format)
  const topInitiate = useMemo(() => {
    const data = marketOpportunities || opportunitiesData.data;
    // Support both API response formats
    const list = data?.initiate_list || data?.opportunities || [];
    return list.slice(0, 5);
  }, [marketOpportunities, opportunitiesData.data]);

  // Top AVOID opportunities from selected market
  const topAvoid = useMemo(() => {
    const data = marketOpportunities || opportunitiesData.data;
    return (data?.avoid_list || []).slice(0, 5);
  }, [marketOpportunities, opportunitiesData.data]);

  // Insider activity - show trades with type indicator
  const insiderActivity = useMemo(() => {
    const trades = insiderData.data || [];
    return [...trades]
      .filter(t => t.symbol && t.value > 0)
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
      .slice(0, 5);
  }, [insiderData.data]);

  // Hedge fund activity - show top positions with tickers
  const hedgeFundActivity = useMemo(() => {
    const signals = hedgeFundData.data || [];
    return [...signals]
      .filter(s => s.name && s.total_value > 0)
      .sort((a, b) => {
        if (a.ticker && !b.ticker) return -1;
        if (!a.ticker && b.ticker) return 1;
        return (b.net_flow || 0) - (a.net_flow || 0);
      })
      .slice(0, 5);
  }, [hedgeFundData.data]);

  // Market status
  const marketOpen = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour < 16;
  }, []);

  // Navigation handlers
  const handleNavigate = useCallback((path: string) => () => navigate(path), [navigate]);
  
  // Navigate to stock intelligence page
  const handleStockClick = useCallback((ticker: string, market?: string) => () => {
    // Determine market from ticker suffix or provided market
    const mkt = market || (ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'IN' : 'US');
    navigate(`/stock-intelligence/${mkt}/${ticker}`);
  }, [navigate]);
  
  const handleViewAllClick = useCallback(() => {
    navigate('/simulator');
  }, [navigate]);

  // Show loading indicator
  const isLoading = marketLoading || opportunitiesData.status === 'loading' || finSightData.status === 'loading';

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-3 sm:p-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <img 
            src={FinVestLogo} 
            alt="FinVest" 
            className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight">FinVest</h1>
            <p className="text-xs sm:text-sm text-gray-400">Capital Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
          {/* Market Toggle */}
          <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl p-1 border border-gray-700 flex-shrink-0">
            <button
              onClick={() => setSelectedMarket('US')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                selectedMarket === 'US'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              US
            </button>
            <button
              onClick={() => setSelectedMarket('IN')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                selectedMarket === 'IN'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              IN
            </button>
          </div>
          
          {/* Market Status */}
          <div className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium flex-shrink-0 ${
            marketOpen 
              ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
              : 'bg-gray-800/50 text-gray-400 border border-gray-700'
          }`}>
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{marketOpen ? 'Market Open' : 'Market Closed'}</span>
            <span className="sm:hidden">{marketOpen ? 'Open' : 'Closed'}</span>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* NEWS TICKER - Animated Auto-Scrolling Corporate Announcements */}
      {/* ================================================================ */}
      <div className="mb-6 bg-gradient-to-r from-indigo-900/20 via-purple-900/10 to-indigo-900/20 border border-indigo-500/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Latest News & Announcements</span>
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          </div>
          <button
            onClick={handleNavigate('/insider-flow')}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            View All <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        
        {announcementsLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : (
          <NewsTicker 
            announcements={(announcements?.corporate_in?.announcements || []).slice(0, 10)}
            onItemClick={(symbol) => navigate(`/stock/${symbol}`)}
            onViewAll={() => navigate('/insider-flow')}
          />
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        {/* INITIATE */}
        <button
          onClick={handleNavigate('/intelligence')}
          className="bg-gradient-to-br from-green-900/30 to-emerald-900/10 border border-green-500/20 rounded-xl p-3 sm:p-5 text-left hover:border-green-400/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
            </div>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-green-400/50 group-hover:text-green-400 transition-opacity" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-green-400 mb-0.5 sm:mb-1">
            {isLoading ? '...' : opportunityStats.initiate}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-400">INITIATE Signals</div>
        </button>

        {/* AVOID */}
        <button
          onClick={handleNavigate('/intelligence')}
          className="bg-gradient-to-br from-red-900/30 to-orange-900/10 border border-red-500/20 rounded-xl p-3 sm:p-5 text-left hover:border-red-400/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            </div>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-red-400/50 group-hover:text-red-400 transition-opacity" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-red-400 mb-0.5 sm:mb-1">
            {isLoading ? '...' : opportunityStats.avoid}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-400">AVOID Signals</div>
        </button>

        {/* Total Stocks */}
        <button
          onClick={handleNavigate('/screener')}
          className="bg-gradient-to-br from-blue-900/30 to-indigo-900/10 border border-blue-500/20 rounded-xl p-3 sm:p-5 text-left hover:border-blue-400/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </div>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400/50 group-hover:text-blue-400 transition-opacity" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-blue-400 mb-0.5 sm:mb-1">
            {isLoading ? '...' : formatNumber(opportunityStats.total)}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-400">Total Stocks</div>
        </button>

        {/* Market Intel */}
        <button
          onClick={handleNavigate('/markets')}
          className="bg-gradient-to-br from-purple-900/30 to-violet-900/10 border border-purple-500/20 rounded-xl p-3 sm:p-5 text-left hover:border-purple-400/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <LineChart className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
            </div>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400/50 group-hover:text-purple-400 transition-opacity" />
          </div>
          <div className="text-xl sm:text-3xl font-bold text-purple-400 mb-0.5 sm:mb-1">
            FinDash
          </div>
          <div className="text-[10px] sm:text-xs text-gray-400">Market Intel</div>
        </button>
      </div>

      {/* Top Opportunities Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
        {/* Top INITIATE */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-green-500/5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="font-medium text-white text-sm">Top INITIATE</span>
              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{selectedMarket}</span>
            </div>
            <button
              onClick={handleViewAllClick}
              className="text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              View All →
            </button>
          </div>
          <DataCard status={isLoading ? 'loading' : opportunitiesData.status}>
            {topInitiate.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No INITIATE signals available</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {topInitiate.map((opp: any, i: number) => {
                  const ticker = opp.ticker || opp.symbol;
                  const market = opp.market || selectedMarket;
                  // expected_return_p50 is a decimal (e.g., 0.0782 = 7.82%)
                  const expectedReturn = opp.expected_return_p50 ?? opp.expected_return ?? opp.edge_score;
                  const conviction = opp.conviction ? (opp.conviction * 100).toFixed(0) : null;
                  const regime = opp.regime;
                  return (
                    <button 
                      key={i} 
                      onClick={handleStockClick(ticker, market)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-green-500/5 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-xs text-gray-500 font-mono">#{i + 1}</span>
                        <div>
                          <span className="text-sm font-bold text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
                            {ticker}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500">{market}</span>
                            {regime && (
                              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{regime}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-medium text-green-400">
                            {expectedReturn !== undefined && expectedReturn !== null 
                              ? `+${(expectedReturn * 100).toFixed(1)}%`
                              : '-'}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {conviction ? `${conviction}% conviction` : '30d exp. return'}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-green-400 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </DataCard>
        </div>

        {/* Top AVOID */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-red-500/5">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="font-medium text-white text-sm">Top AVOID</span>
              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{selectedMarket}</span>
            </div>
            <button
              onClick={handleViewAllClick}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              View All →
            </button>
          </div>
          <DataCard status={isLoading ? 'loading' : opportunitiesData.status}>
            {topAvoid.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No AVOID signals available</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {topAvoid.map((opp: any, i: number) => {
                  const ticker = opp.ticker || opp.symbol;
                  const market = opp.market || selectedMarket;
                  const whyAvoid = opp.why_avoid || opp.risk_summary || 'High risk';
                  const regime = opp.regime;
                  const cvar = opp.cvar_95;
                  return (
                    <button 
                      key={i} 
                      onClick={handleStockClick(ticker, market)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-red-500/5 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-xs text-gray-500 font-mono">#{i + 1}</span>
                        <div>
                          <span className="text-sm font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
                            {ticker}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500">{market}</span>
                            {regime && (
                              <span className="text-[10px] text-red-400/60 bg-red-500/10 px-1.5 py-0.5 rounded">{regime}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right max-w-[140px]">
                          {cvar !== undefined && cvar !== null ? (
                            <>
                              <div className="text-sm font-medium text-red-400">
                                CVaR: {(cvar * 100).toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-gray-500">max loss risk</div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] text-red-400/80 truncate" title={whyAvoid}>
                                {whyAvoid.slice(0, 25)}{whyAvoid.length > 25 ? '...' : ''}
                              </div>
                            </>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-red-400 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </DataCard>
        </div>
      </div>

      {/* Smart Money Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Insider Trades */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-white text-sm">Insider Trades</span>
            </div>
            <button
              onClick={handleNavigate('/insider-flow')}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              More →
            </button>
          </div>
          <DataCard status={insiderData.status}>
            {insiderActivity.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No recent insider trades</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {insiderActivity.map((trade, i) => (
                  <button 
                    key={i} 
                    onClick={handleStockClick(trade.symbol)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        trade.type === 'BUY' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.type}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-white">{trade.symbol}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[80px]">{trade.insider}</div>
                      </div>
                    </div>
                    <div className={`text-xs font-medium ${trade.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                      ${formatNumber(trade.value)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DataCard>
        </div>

        {/* Hedge Fund 13F */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span className="font-medium text-white text-sm">Hedge Fund 13F</span>
            </div>
            <button
              onClick={handleNavigate('/insider-flow')}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              More →
            </button>
          </div>
          <DataCard status={hedgeFundData.status}>
            {hedgeFundActivity.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No recent positions</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {hedgeFundActivity.map((signal, i) => (
                  <button 
                    key={i} 
                    onClick={signal.ticker ? handleStockClick(signal.ticker) : undefined}
                    className={`w-full px-4 py-2 flex items-center justify-between ${
                      signal.ticker ? 'hover:bg-gray-800/30 cursor-pointer' : 'cursor-default'
                    } transition-colors`}
                    disabled={!signal.ticker}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {signal.ticker && (
                          <span className="text-xs font-bold text-purple-400 bg-purple-500/20 px-1.5 py-0.5 rounded">
                            {signal.ticker}
                          </span>
                        )}
                        <div className="text-sm font-medium text-white truncate max-w-[100px]">
                          {signal.ticker ? '' : signal.name}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {signal.num_funds} funds • {signal.net_flow > 0 ? '+' : ''}{signal.net_flow} flow
                      </div>
                    </div>
                    <div className={`text-xs font-medium ${signal.net_flow > 0 ? 'text-green-400' : signal.net_flow < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      ${formatNumber(signal.total_value / 1000)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DataCard>
        </div>

        {/* FII/DII */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              <span className="font-medium text-white text-sm">FII/DII Flow (IN)</span>
            </div>
            <button
              onClick={handleNavigate('/fii-dii')}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              More →
            </button>
          </div>
          <DataCard status={fiiDiiData.status}>
            {!fiiDiiData.data ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No data available</div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">FII Net (5d)</span>
                  <span className={`text-sm font-medium ${(fiiDiiData.data.fii_5d || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ₹{formatNumber(fiiDiiData.data.fii_5d)}Cr
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">DII Net (5d)</span>
                  <span className={`text-sm font-medium ${(fiiDiiData.data.dii_5d || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ₹{formatNumber(fiiDiiData.data.dii_5d)}Cr
                  </span>
                </div>
                {fiiDiiData.data.regime && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                    <span className="text-xs text-gray-400">Regime</span>
                    <span className="text-xs font-medium text-cyan-400">{fiiDiiData.data.regime}</span>
                  </div>
                )}
              </div>
            )}
          </DataCard>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={handleNavigate('/intelligence')}
          className="flex items-center gap-3 p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-purple-500/30 hover:bg-purple-500/5 transition-all"
        >
          <Brain className="w-5 h-5 text-purple-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-white">Intelligence</div>
            <div className="text-xs text-gray-500">FinSight</div>
          </div>
        </button>

        <button
          onClick={handleNavigate('/markets')}
          className="flex items-center gap-3 p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-green-500/30 hover:bg-green-500/5 transition-all"
        >
          <LineChart className="w-5 h-5 text-green-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-white">Markets</div>
            <div className="text-xs text-gray-500">FinDash</div>
          </div>
        </button>

        <button
          onClick={handleNavigate('/portfolio')}
          className="flex items-center gap-3 p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
        >
          <Briefcase className="w-5 h-5 text-blue-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-white">Portfolio</div>
            <div className="text-xs text-gray-500">Holdings</div>
          </div>
        </button>

        <button
          onClick={handleNavigate('/tax')}
          className="flex items-center gap-3 p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-amber-500/30 hover:bg-amber-500/5 transition-all"
        >
          <Calculator className="w-5 h-5 text-amber-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-white">Tax</div>
            <div className="text-xs text-gray-500">STCG/LTCG</div>
          </div>
        </button>

        <button
          onClick={handleNavigate('/insider-flow')}
          className="flex items-center gap-3 p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all"
        >
          <Building2 className="w-5 h-5 text-cyan-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-white">Smart Money</div>
            <div className="text-xs text-gray-500">Insider & 13F</div>
          </div>
        </button>
      </div>

      {/* Market Coverage */}
      <div className="mt-8">
        <CoveragePanel />
      </div>

      {/* System Health - Collapsible */}
      <div className="mt-4 border-t border-gray-800 pt-4">
        <button
          onClick={() => setShowSystemHealth(!showSystemHealth)}
          className="w-full flex items-center justify-between px-4 py-2 bg-[#0d1117] border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">System Health</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              state.health.apiReachable 
                ? 'bg-green-500/10 text-green-400' 
                : 'bg-red-500/10 text-red-400'
            }`}>
              {state.health.apiReachable ? 'All Systems OK' : 'Issues Detected'}
            </span>
          </div>
          {showSystemHealth ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        
        {showSystemHealth && (
          <div className="mt-2">
            <SystemHealthPanel />
          </div>
        )}
      </div>
    </div>
  );
}
