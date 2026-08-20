/**
 * FinVest Sidebar - Unified Navigation
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, TrendingUp, DollarSign, BarChart3, Layers, Globe, 
  Zap, Brain, Activity, LineChart, PieChart, Target, Lightbulb
} from 'lucide-react';
import { ScreenerFilterParams, api } from '../../lib/api';
import UserMenu from '../UserMenu';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onFilterChange: (filters: ScreenerFilterParams) => void;
  currentFilters: ScreenerFilterParams;
}

const MARKET_NAMES: Record<string, string> = {
  'IN': 'India',
  'US': 'USA',
  'UK': 'UK',
  'JP': 'Japan',
  'CN': 'China',
  'SG': 'Singapore',
  'HK': 'Hong Kong',
  'AU': 'Australia',
  'OTHER': 'Other',
};

export default function Sidebar({ isOpen, setIsOpen, onFilterChange, currentFilters }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [localFilters, setLocalFilters] = useState<ScreenerFilterParams>(currentFilters);
  const [marketsWithData, setMarketsWithData] = useState<Record<string, boolean>>({});
  const [loadingMarkets, setLoadingMarkets] = useState(true);

  useEffect(() => {
    setLocalFilters(currentFilters);
  }, [currentFilters]);

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        const markets = await api.getMarkets();
        setMarketsWithData(markets);
      } catch (error) {
        console.error('Failed to load markets:', error);
        setMarketsWithData({
          IN: true, US: true, UK: true, JP: true, CN: true, SG: true, HK: true, AU: true, OTHER: true,
        });
      } finally {
        setLoadingMarkets(false);
      }
    };
    loadMarkets();
  }, []);

  const handleMarketFilter = (market: string) => {
    const marketValue = market === 'All Markets' ? undefined : market;
    const newFilters = { ...localFilters, market: marketValue };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
    window.dispatchEvent(new CustomEvent('filterChange', { detail: newFilters }));
  };

  const handleQuickFilter = (filterType: string) => {
    let newFilters: ScreenerFilterParams = { ...localFilters };
    if (filterType === 'Large Cap') {
      newFilters = { ...newFilters, min_market_cap: 10000000000 };
    } else if (filterType === 'Growth Stocks') {
      newFilters = { ...newFilters, min_ret_1y: 20 };
    } else if (filterType === 'Value Stocks') {
      newFilters = { ...newFilters, max_pe: 15, min_roe: 15 };
    }
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
    window.dispatchEvent(new CustomEvent('filterChange', { detail: newFilters }));
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      {isOpen ? (
        <div className="w-72 bg-gradient-to-b from-[#0d1117] to-[#0a0a0f] border-r border-gray-800 flex flex-col shadow-2xl">
          {/* Logo Section - FinVest Branding */}
          <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-3 hover:opacity-90 transition-all"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  FinVest
                </span>
                <span className="text-xs text-gray-400">Financial OS</span>
              </div>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg p-2 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 p-4 space-y-6 overflow-y-auto">
            {/* Core Modules */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2 px-2">
                <Layers size={14} />
                Core Modules
              </h3>
              <div className="space-y-1">
                {/* Dashboard */}
                <button
                  onClick={() => navigate('/')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    location.pathname === '/'
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Activity size={18} />
                    <span className="font-medium">Dashboard</span>
                  </div>
                </button>

                {/* Intelligence (FinSight) */}
                <button
                  onClick={() => navigate('/intelligence')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/intelligence') || isActive('/stock-intelligence') || isActive('/opportunities')
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Brain size={18} />
                    <span className="font-medium">Intelligence</span>
                    <span className="ml-auto text-xs bg-purple-500/30 px-2 py-0.5 rounded">FinSight</span>
                  </div>
                </button>

                {/* Markets (FinDash) */}
                <button
                  onClick={() => navigate('/markets')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/markets') || isActive('/dashboard')
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <LineChart size={18} />
                    <span className="font-medium">Markets</span>
                    <span className="ml-auto text-xs bg-green-500/30 px-2 py-0.5 rounded">FinDash</span>
                  </div>
                </button>

                {/* Screener */}
                <button
                  onClick={() => navigate('/screener')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/screener')
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 size={18} />
                    <span className="font-medium">Screener</span>
                    <span className="ml-auto text-xs text-gray-500">900+</span>
                  </div>
                </button>

                {/* Market Overview */}
                <button
                  onClick={() => navigate('/market-overview')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/market-overview')
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Globe size={18} />
                    <span className="font-medium">Market Overview</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Premium Modules */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2 px-2">
                <Target size={14} />
                Premium Modules
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => navigate('/hedge-funds')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/hedge-funds') ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span>🏦</span>
                    <span>Hedge Funds</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/insider-flow')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/insider-flow') ? 'bg-orange-500/20 text-orange-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span>👔</span>
                    <span>InsiderFlow</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/smart-money')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/smart-money') ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span>💰</span>
                    <span>Smart Money</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/intrinsiq')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/intrinsiq') || isActive('/value-analysis') ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span>📊</span>
                    <span>IntrinsIQ</span>
                    <span className="ml-auto text-xs bg-emerald-500/30 px-2 py-0.5 rounded">AI Value</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/ai-insights')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/ai-insights') ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Lightbulb size={18} />
                    <span>AI Insights</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/portfolio')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/portfolio') ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <PieChart size={18} />
                    <span>Portfolio</span>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/stratax')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    isActive('/stratax') ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Zap size={18} />
                    <span>StrataX Options</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Markets Filter */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2 px-2">
                <Globe size={14} />
                Filter by Market
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => handleMarketFilter('All Markets')}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all text-sm ${
                    !localFilters.market
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  All Markets
                </button>
                {['IN', 'US', 'AU', 'UK', 'HK', 'JP', 'CN', 'SG'].map((code) => {
                  const hasData = marketsWithData[code] ?? true;
                  return (
                    <button
                      key={code}
                      onClick={() => hasData && handleMarketFilter(code)}
                      disabled={!hasData && !loadingMarkets}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-all text-sm ${
                        localFilters.market === code
                          ? 'bg-blue-500/20 text-blue-300'
                          : hasData
                          ? 'text-gray-400 hover:bg-gray-800/50'
                          : 'text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {MARKET_NAMES[code]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Filters */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2 px-2">
                <TrendingUp size={14} />
                Quick Filters
              </h3>
              <div className="space-y-1">
                {[
                  { name: 'Large Cap', icon: DollarSign },
                  { name: 'Growth Stocks', icon: TrendingUp },
                  { name: 'Value Stocks', icon: BarChart3 },
                ].map((filter) => {
                  const Icon = filter.icon;
                  return (
                    <button
                      key={filter.name}
                      onClick={() => handleQuickFilter(filter.name)}
                      className="w-full text-left px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-800/50 transition-all text-sm flex items-center gap-2"
                    >
                      <Icon size={14} />
                      {filter.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Menu */}
          <div className="p-4 border-t border-gray-800">
            <UserMenu />
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t border-gray-800 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
            <div className="text-center">
              <span className="text-xs text-gray-500">FinVest © 2024</span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute top-4 left-4 z-10 p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white hover:shadow-lg shadow-blue-500/50 transition-all"
        >
          <Menu size={24} />
        </button>
      )}
    </>
  );
}
