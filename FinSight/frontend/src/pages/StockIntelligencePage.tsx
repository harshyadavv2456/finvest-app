import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Target,
  Activity,
  Eye,
  BarChart3,
  Search,
  ChevronRight,
  Sparkles,
  Info,
  History,
  Calendar,
  ArrowRight
} from 'lucide-react';
import { api } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'https://finvest-api-gwkz.onrender.com';

interface StockHistoryEntry {
  date: string;
  intent: string;
  conviction: number;
  expected_return?: number;
  rationale?: string;
}

// Helper function for intent colors
const getIntentColor = (intent: string): string => {
  switch (intent) {
    case 'INITIATE':
      return 'text-emerald-400';
    case 'HOLD':
      return 'text-blue-400';
    case 'AVOID':
      return 'text-red-400';
    case 'REDUCE':
      return 'text-amber-400';
    case 'EXIT':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
};

interface StockSnapshot {
  ticker: string;
  market: string;
  as_of_date: string;
  version: string;
  schema_version?: string;  // LOCKED: "2.3-authority"
  system_mode?: string;  // LOCKED: "LOCKED_AUTHORITY"
  generated_at?: string;
  intent: string;
  // CONVICTION: Use conviction_pct for display, conviction_raw for calculations
  conviction?: number;  // DEPRECATED - for backwards compatibility only
  conviction_raw?: number;  // Full precision 0.0-1.0 (authoritative)
  conviction_pct?: number;  // Percentage with 1 decimal (e.g., 63.7) - display
  confidence?: number;
  direction: string;
  asset_regime: string;
  asset_regime_confidence: number;
  market_regime: string;
  market_benchmark_source?: string;  // "NIFTY50", "SP500", or "SYNTHETIC_LARGE_CAP"
  market_regime_confidence?: number;
  relative_strength: number;
  regime_divergence?: string;
  days_in_regime?: number;
  
  // PM Regime Context (Layer 2B) - India only
  pm_regime_state?: string;  // RISK_ON, TRANSITION, RISK_OFF
  pm_regime_confidence?: number;
  pm_regime_triggers?: string[];
  pm_context_description?: string;
  pm_regime_changed?: boolean;
  volatility_20d: number;
  volatility_regime: string;
  vol_percentile?: number;
  vol_forecast?: number;
  vol_normal?: number;
  vol_stress?: number;
  vol_tail?: number;
  // Return distribution
  return_p10?: number;
  return_p25?: number;
  return_p50?: number;
  return_p75?: number;
  return_p90?: number;
  return_mean?: number;
  return_std?: number;
  // Risk metrics
  cvar_95?: number;
  cvar_95_normal?: number;
  cvar_95_stress?: number;
  cvar_95_panic?: number;
  max_drawdown_expected?: number;
  sortino_ratio?: number;
  // Legacy fields (for backwards compatibility)
  cvar_bucket?: string;
  max_drawdown_1y?: number;
  // Position sizing
  max_position_pct?: number;
  recommended_position_pct?: number;
  risk_budget_used_pct?: number;
  scale_in_tranches?: number;
  risk_reward_ratio?: number;
  expected_return?: number;
  expected_risk?: number;
  time_horizon?: string;
  expected_holding_days?: number;
  // Signals
  signal_agreement: number;
  supporting_signals: string[];
  opposing_signals: string[];
  top_signals_ic?: Record<string, number>;
  signal_confidence?: number;
  // Comparable setups
  n_comparable_setups?: number;
  comparable_win_rate?: number;
  comparable_median_return?: number;
  comparable_worst_outcome?: number;
  // Legacy similar_regime_outcomes
  similar_regime_outcomes?: {
    sample_size: number;
    median_20d_return: number;
    win_rate: number;
    worst_outcome: number;
  };
  // Conditions
  upgrade_conditions?: string[];
  downgrade_conditions?: string[];
  risk_factors?: string[];
  // Explanation
  rationale?: string;
  explanation?: string;
  // Price
  last_price: number;
  price_date: string;
  price_change_1d?: number;
  price_change_5d?: number;
  price_change_20d?: number;
  data_quality: string;
  data_points?: number;
  // Authority Mode (v2.3)
  if_holding?: string;
  if_not_holding?: string;
  recommended_action_explanation?: string;
  portfolio_correlation_note?: string;
  risk_budget_context?: string;
}

const INTENT_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string; description: string }> = {
  'INITIATE': { 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-500/20 border-emerald-500/40', 
    icon: CheckCircle2,
    label: 'INITIATE',
    description: 'Conditions favor opening a new position'
  },
  'ADD': { 
    color: 'text-green-400', 
    bg: 'bg-green-500/20 border-green-500/40', 
    icon: TrendingUp,
    label: 'ADD',
    description: 'Consider adding to existing position'
  },
  'HOLD': { 
    color: 'text-blue-400', 
    bg: 'bg-blue-500/20 border-blue-500/40', 
    icon: Minus,
    label: 'HOLD',
    description: 'Maintain current position, no action needed'
  },
  'REDUCE': { 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/20 border-amber-500/40', 
    icon: AlertTriangle,
    label: 'REDUCE',
    description: 'Consider reducing position size'
  },
  'AVOID': { 
    color: 'text-red-400', 
    bg: 'bg-red-500/20 border-red-500/40', 
    icon: XCircle,
    label: 'AVOID',
    description: 'Do not enter or maintain position'
  },
  'EXIT': { 
    color: 'text-red-500', 
    bg: 'bg-red-600/20 border-red-600/40', 
    icon: AlertCircle,
    label: 'EXIT',
    description: 'Close position immediately'
  },
};

const REGIME_CONFIG: Record<string, { color: string; description: string }> = {
  'accumulation': { color: 'text-cyan-400', description: 'Smart money building positions quietly' },
  'markup': { color: 'text-emerald-400', description: 'Strong uptrend with momentum' },
  'distribution': { color: 'text-amber-400', description: 'Smart money reducing exposure' },
  'markdown': { color: 'text-red-400', description: 'Downtrend with selling pressure' },
  'recovery': { color: 'text-blue-400', description: 'Transitioning from weakness to strength' },
  'panic': { color: 'text-red-500', description: 'High volatility fear-driven selling' },
};

const SIGNAL_LABELS: Record<string, string> = {
  'momentum_20d': '20-Day Momentum',
  'above_sma20': 'Above 20-Day Moving Average',
  'below_sma20': 'Below 20-Day Moving Average',
  'vol_contained': 'Volatility Contained',
  'vol_elevated': 'Volatility Elevated',
  'rsi_oversold': 'RSI Oversold',
  'rsi_overbought': 'RSI Overbought',
  'macd_bullish': 'MACD Bullish Cross',
  'macd_bearish': 'MACD Bearish Cross',
  'volume_surge': 'Above Average Volume',
  'breakout': 'Price Breakout',
  'breakdown': 'Price Breakdown',
};

// UI-ONLY: Quick access buttons for popular stocks.
// NOTE: This is FRONTEND filtering ONLY - it does NOT limit the compute universe.
// The backend processes ALL available stocks from the filesystem.
// These are just convenient shortcuts for users.
const QUICK_ACCESS_STOCKS = {
  US: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ', 'UNH', 'HD', 'PG', 'MA', 'DIS'],
  IN: ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS', 'LT.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'MARUTI.NS', 'TITAN.NS'],
};

export default function StockIntelligencePage() {
  const navigate = useNavigate();
  const { ticker: urlTicker, market: urlMarket } = useParams();
  const [searchParams] = useSearchParams();
  
  const [market, setMarket] = useState(urlMarket || searchParams.get('market') || 'US');
  const [ticker, setTicker] = useState(urlTicker || searchParams.get('ticker') || '');
  const [searchInput, setSearchInput] = useState('');
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stock list for autocomplete dropdown
  const [stockList, setStockList] = useState<string[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingStocks, setLoadingStocks] = useState(false);
  
  // Stock history for timeline
  const [stockHistory, setStockHistory] = useState<StockHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load stock list when market changes
  useEffect(() => {
    const loadStockList = async () => {
      setLoadingStocks(true);
      try {
        const response = await api.get(`/api/intelligence-stocks/${market}`);
        if (response.data?.success && response.data?.stocks) {
          setStockList(response.data.stocks);
        }
      } catch (err) {
        console.error('Failed to load stock list:', err);
        // Fallback to QUICK_ACCESS_STOCKS if API fails
        setStockList(QUICK_ACCESS_STOCKS[market as keyof typeof QUICK_ACCESS_STOCKS] || []);
      } finally {
        setLoadingStocks(false);
      }
    };
    loadStockList();
  }, [market]);

  // Filter stocks based on search input
  useEffect(() => {
    if (searchInput.length > 0 && stockList.length > 0) {
      const query = searchInput.toUpperCase();
      const filtered = stockList.filter(s => 
        s.toUpperCase().includes(query) || 
        s.replace('.NS', '').toUpperCase().includes(query)
      ).slice(0, 20); // Limit to 20 results
      setFilteredStocks(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setFilteredStocks([]);
      setShowDropdown(false);
    }
  }, [searchInput, stockList]);

  useEffect(() => {
    if (ticker) {
      loadSnapshot(market, ticker);
      loadStockHistory(market, ticker);
    }
  }, [market, ticker]);

  // Load stock history from timeline API
  const loadStockHistory = async (m: string, t: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/timeline/compare/${m}/${t}?days=14`);
      if (res.ok) {
        const data = await res.json();
        setStockHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load stock history:', err);
      setStockHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSnapshot = async (m: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getStockSnapshot(m, t);
      if (response.success && response.data) {
        const data = response.data;
        
        // ===== DATA INTEGRITY VALIDATION =====
        // Check for invalid intent/action combinations
        const validIntents = ['INITIATE', 'ADD', 'HOLD', 'REDUCE', 'EXIT', 'AVOID'];
        if (data.intent && !validIntents.includes(data.intent)) {
          console.warn(`[DATA INTEGRITY] Invalid intent: ${data.intent}`);
        }
        
        // Check for conflicting combinations that should never appear
        if (data.intent === 'INITIATE' && data.if_not_holding === 'WAIT') {
          console.error('[DATA INTEGRITY] INVALID: INITIATE + WAIT combination');
        }
        if (data.intent === 'INITIATE' && data.if_not_holding === 'AVOID') {
          console.error('[DATA INTEGRITY] INVALID: INITIATE + AVOID combination');
        }
        if (data.intent === 'AVOID' && data.if_holding === 'HOLD') {
          console.error('[DATA INTEGRITY] INVALID: AVOID + HOLD combination');
        }
        if (data.intent === 'AVOID' && data.if_not_holding === 'INITIATE') {
          console.error('[DATA INTEGRITY] INVALID: AVOID + INITIATE combination');
        }
        
        // Check conviction fields
        if ('conviction' in data && !('conviction_pct' in data)) {
          console.warn('[DATA INTEGRITY] Legacy conviction field without conviction_pct');
        }
        
        setSnapshot(data);
      } else {
        setError(response.error || 'Stock intelligence not available');
        setSnapshot(null);
      }
    } catch (err) {
      setError('Failed to load stock intelligence');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const t = searchInput.toUpperCase().trim();
    if (t) {
      setTicker(t);
      navigate(`/stock-intelligence/${market}/${t}`);
    }
  };

  const handleQuickSelect = (t: string) => {
    setTicker(t);
    setSearchInput(t);
    setShowDropdown(false);
    navigate(`/stock-intelligence/${market}/${t}`);
  };

  const handleSelectFromDropdown = (selectedTicker: string) => {
    setTicker(selectedTicker);
    setSearchInput(selectedTicker);
    setShowDropdown(false);
    navigate(`/stock-intelligence/${market}/${selectedTicker}`);
  };

  const intentConfig = snapshot ? INTENT_CONFIG[snapshot.intent] || INTENT_CONFIG['HOLD'] : null;
  const regimeConfig = snapshot ? REGIME_CONFIG[snapshot.asset_regime] || { color: 'text-gray-400', description: 'Unknown regime' } : null;

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/20 via-purple-900/20 to-pink-900/20" />
        <div className="relative max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Target size={20} />
                  </div>
                  Stock Intelligence
                </h1>
                <p className="text-gray-400 text-sm mt-1">Decision engine analysis • Updated daily</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* How This Works Section */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Info size={20} className="text-indigo-400" />
            <h3 className="font-semibold text-lg">How This Decision Engine Works</h3>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <h4 className="font-semibold text-emerald-400 mb-2">14-Layer Analysis Pipeline</h4>
              <ul className="space-y-1 text-gray-400">
                <li>• <span className="text-gray-300">Layers 1-3:</span> Signals + Regime + Efficacy</li>
                <li>• <span className="text-gray-300">Layers 4-6:</span> Probability + Backtest + Decision</li>
                <li>• <span className="text-gray-300">Layers 7-9:</span> Explanation + Meta + Portfolio</li>
                <li>• <span className="text-gray-300">Layers 10-14:</span> Fundamentals + Intraday + News + Insider + FII/DII</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-blue-400 mb-2">What We Output</h4>
              <ul className="space-y-1 text-gray-400">
                <li>• <span className="text-gray-300">INITIATE:</span> Conditions favor new position</li>
                <li>• <span className="text-gray-300">HOLD:</span> Maintain, no action needed</li>
                <li>• <span className="text-gray-300">REDUCE/EXIT:</span> Risk rising, consider trimming</li>
                <li>• <span className="text-gray-300">AVOID:</span> Risk/reward unfavorable</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-amber-400 mb-2">What We Never Do</h4>
              <ul className="space-y-1 text-gray-400">
                <li>• <span className="text-red-400">✗</span> Predict exact prices or targets</li>
                <li>• <span className="text-red-400">✗</span> Use future data in analysis</li>
                <li>• <span className="text-red-400">✗</span> Guarantee any outcomes</li>
                <li>• <span className="text-red-400">✗</span> Optimize for hindsight</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            {/* Market Toggle */}
            <div className="flex bg-white/5 rounded-xl p-1">
              {['US', 'IN'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMarket(m); setTicker(''); setSnapshot(null); }}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    market === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {m === 'US' ? '🇺🇸 US' : '🇮🇳 India'}
                </button>
              ))}
            </div>

            {/* Search with Autocomplete Dropdown */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setShowDropdown(false);
                      handleSearch();
                    } else if (e.key === 'Escape') {
                      setShowDropdown(false);
                    }
                  }}
                  onFocus={() => {
                    if (searchInput.length > 0 && filteredStocks.length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  placeholder={market === 'US' ? 'Type to search (e.g., AAPL, NVDA)' : 'Type to search (e.g., RELIANCE, TCS)'}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
                
                {/* Autocomplete Dropdown */}
                {showDropdown && filteredStocks.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-[#1a1f2e] border border-white/20 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                    {loadingStocks ? (
                      <div className="px-4 py-3 text-gray-400 text-sm">Loading stocks...</div>
                    ) : (
                      filteredStocks.map((stock, index) => (
                        <button
                          key={stock}
                          onClick={() => handleSelectFromDropdown(stock)}
                          className={`w-full text-left px-4 py-3 hover:bg-indigo-600/30 transition-colors flex items-center justify-between ${
                            index !== filteredStocks.length - 1 ? 'border-b border-white/5' : ''
                          }`}
                        >
                          <span className="font-medium text-white">
                            {stock.replace('.NS', '')}
                          </span>
                          <span className="text-sm text-gray-400">
                            {market === 'IN' ? 'NSE' : 'NYSE/NASDAQ'}
                          </span>
                        </button>
                      ))
                    )}
                    <div className="px-4 py-2 text-xs text-gray-500 bg-white/5">
                      {filteredStocks.length} of {stockList.length} stocks • Type to filter
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  handleSearch();
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium transition-all"
              >
                Analyze
              </button>
            </div>
          </div>

          {/* Quick Access (UI shortcuts only - all stocks are computed) */}
          <div>
            <p className="text-sm text-gray-400 mb-3">Quick Access — Popular {market} Stocks:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACCESS_STOCKS[market as keyof typeof QUICK_ACCESS_STOCKS]?.map(t => (
                <button
                  key={t}
                  onClick={() => handleQuickSelect(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    ticker === t 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {t.replace('.NS', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-400">Analyzing {ticker}...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-20">
            <AlertTriangle size={48} className="mx-auto text-amber-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Intelligence Not Available</h3>
            <p className="text-gray-400 max-w-md mx-auto">{error}</p>
          </div>
        )}

        {/* No Selection */}
        {!ticker && !loading && (
          <div className="text-center py-20 bg-[#111827] border border-white/10 rounded-2xl">
            <Target size={48} className="mx-auto text-indigo-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Select a Stock to Analyze</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Enter a ticker symbol or click one of the quick access buttons above to see the decision engine's analysis.
            </p>
          </div>
        )}

        {/* Stock Intelligence Results */}
        {snapshot && !loading && (
          <div className="space-y-6">
            {/* Decision Header */}
            <div className={`${intentConfig?.bg} border rounded-2xl p-8`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl font-bold">{snapshot.ticker.replace('.NS', '')}</span>
                    <span className={`px-4 py-2 rounded-full text-lg font-bold ${intentConfig?.bg} ${intentConfig?.color}`}>
                      {intentConfig?.label}
                    </span>
                  </div>
                  <p className="text-xl text-gray-300 mb-2">{intentConfig?.description}</p>
                  <p className="text-gray-400">
                    Last Price: <span className="text-white font-semibold">${snapshot.last_price.toFixed(2)}</span>
                    <span className="mx-2">•</span>
                    As of {snapshot.price_date}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">Conviction</div>
                  <div className="text-4xl font-bold">{(snapshot.conviction_pct ?? (snapshot.conviction_raw || 0) * 100).toFixed(1)}%</div>
                  <div className="text-sm text-gray-400 mt-1">
                    {(snapshot.conviction_pct ?? 0) < 30 ? 'Low' : (snapshot.conviction_pct ?? 0) < 60 ? 'Moderate' : 'High'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendation History Timeline */}
            {stockHistory.length > 0 && (
              <div className="bg-gradient-to-r from-purple-900/20 to-indigo-900/20 border border-purple-500/30 rounded-2xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                  <History className="text-purple-400" size={20} />
                  Recommendation History
                  <span className="text-xs font-normal text-gray-400 ml-2">Last 14 days</span>
                </h3>
                
                {/* Timeline */}
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {stockHistory.slice(0, 14).reverse().map((entry, i, arr) => {
                    const prevEntry = i > 0 ? arr[i - 1] : null;
                    const changed = prevEntry && prevEntry.intent !== entry.intent;
                    
                    return (
                      <div key={i} className="flex items-center">
                        <div className="flex flex-col items-center min-w-[60px]">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            entry.intent === 'INITIATE' ? 'bg-emerald-500/30 border border-emerald-500' :
                            entry.intent === 'AVOID' ? 'bg-red-500/30 border border-red-500' :
                            'bg-gray-700/50 border border-gray-600'
                          }`}>
                            {entry.intent === 'INITIATE' ? <TrendingUp size={16} className="text-emerald-400" /> :
                             entry.intent === 'AVOID' ? <TrendingDown size={16} className="text-red-400" /> :
                             <Minus size={16} className="text-gray-400" />}
                          </div>
                          <span className="text-[9px] text-gray-500 mt-1">{entry.date?.slice(5)}</span>
                          <span className={`text-[8px] font-bold ${
                            entry.intent === 'INITIATE' ? 'text-emerald-400' :
                            entry.intent === 'AVOID' ? 'text-red-400' : 'text-gray-400'
                          }`}>{entry.intent}</span>
                          <span className="text-[8px] text-gray-500">{((entry.conviction || 0) * 100).toFixed(0)}%</span>
                        </div>
                        {i < arr.length - 1 && (
                          <div className={`w-4 h-0.5 ${changed ? 'bg-amber-500' : 'bg-gray-700'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Legend */}
                <div className="flex items-center justify-center gap-6 mt-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-500 rounded" />
                    INITIATE
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-700/50 border border-gray-600 rounded" />
                    HOLD
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500/30 border border-red-500 rounded" />
                    AVOID
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-4 h-0.5 bg-amber-500" />
                    Stance Changed
                  </span>
                </div>
              </div>
            )}

            {/* AUTHORITY MODE: What Should I Do? */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Target className="text-amber-400" size={24} />
                What Should I Do?
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                {/* If Holding */}
                <div className={`rounded-xl p-4 ${
                  snapshot.if_holding === 'EXIT' ? 'bg-red-900/30 border border-red-500/30' :
                  snapshot.if_holding === 'REDUCE' ? 'bg-amber-900/30 border border-amber-500/30' :
                  'bg-blue-900/30 border border-blue-500/30'
                }`}>
                  <div className="text-sm text-gray-400 mb-1">If you currently HOLD this stock:</div>
                  <div className={`text-2xl font-bold ${
                    snapshot.if_holding === 'EXIT' ? 'text-red-400' :
                    snapshot.if_holding === 'REDUCE' ? 'text-amber-400' :
                    'text-blue-400'
                  }`}>
                    {snapshot.if_holding || 'HOLD'}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {snapshot.if_holding === 'EXIT' && 'Close position. Conditions have deteriorated.'}
                    {snapshot.if_holding === 'REDUCE' && 'Consider reducing. Risk/reward has shifted.'}
                    {(snapshot.if_holding === 'HOLD' || !snapshot.if_holding) && 'Maintain position. No action required.'}
                  </div>
                </div>
                
                {/* If Not Holding */}
                <div className={`rounded-xl p-4 ${
                  snapshot.if_not_holding === 'INITIATE' ? 'bg-emerald-900/30 border border-emerald-500/30' :
                  snapshot.if_not_holding === 'AVOID' ? 'bg-red-900/30 border border-red-500/30' :
                  'bg-gray-800/50 border border-gray-600/30'
                }`}>
                  <div className="text-sm text-gray-400 mb-1">If you do NOT hold this stock:</div>
                  <div className={`text-2xl font-bold ${
                    snapshot.if_not_holding === 'INITIATE' ? 'text-emerald-400' :
                    snapshot.if_not_holding === 'AVOID' ? 'text-red-400' :
                    'text-gray-300'
                  }`}>
                    {snapshot.if_not_holding || 'WAIT'}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {snapshot.if_not_holding === 'INITIATE' && `Initiate position with ${(snapshot.conviction_pct ?? (snapshot.conviction_raw || 0) * 100).toFixed(1)}% conviction.`}
                    {snapshot.if_not_holding === 'AVOID' && 'Do not enter. Conditions unfavorable.'}
                    {(snapshot.if_not_holding === 'WAIT' || !snapshot.if_not_holding) && 'Wait for better setup.'}
                  </div>
                </div>
              </div>
              
              {/* Action Explanation */}
              {snapshot.recommended_action_explanation && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg">
                  <p className="text-sm text-gray-300">{snapshot.recommended_action_explanation}</p>
                </div>
              )}
              
              {/* Position Guidance */}
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-xs text-gray-400">Recommended Size</div>
                  <div className="text-lg font-bold text-white">
                    {((snapshot.recommended_position_pct || 0.02) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-xs text-gray-400">Max Size</div>
                  <div className="text-lg font-bold text-white">
                    {((snapshot.max_position_pct || 0.05) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-xs text-gray-400">Scale-In Tranches</div>
                  <div className="text-lg font-bold text-white">
                    {snapshot.scale_in_tranches || 2}
                  </div>
                </div>
              </div>
              
              {/* Portfolio Note */}
              {snapshot.portfolio_correlation_note && (
                <div className="mt-3 text-xs text-gray-400 flex items-center gap-2">
                  <Info size={14} />
                  {snapshot.portfolio_correlation_note}
                </div>
              )}
            </div>

            {/* Why This Decision */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <Sparkles className="text-indigo-400" size={24} />
                Why This Decision?
              </h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Regime Context */}
                <div className="bg-white/5 rounded-xl p-5">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-purple-400" />
                    Market Regime
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Asset Regime</span>
                      <span className={`font-semibold capitalize ${regimeConfig?.color}`}>
                        {snapshot.asset_regime}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{regimeConfig?.description}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Confidence</span>
                      <span className="font-semibold">{(snapshot.asset_regime_confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Market Regime</span>
                      <span className={`font-semibold capitalize ${REGIME_CONFIG[snapshot.market_regime]?.color || 'text-gray-400'}`}>
                        {snapshot.market_regime}
                      </span>
                    </div>
                    {snapshot.market_benchmark_source && (
                      <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-gray-500">Benchmark</span>
                        <span className="text-gray-400">
                          {snapshot.market_benchmark_source === 'NIFTY50' ? '🇮🇳 NIFTY 50' :
                           snapshot.market_benchmark_source === 'SP500' ? '🇺🇸 S&P 500' :
                           snapshot.market_benchmark_source}
                        </span>
                      </div>
                    )}
                    
                    {/* PM Regime Context (India only) */}
                    {snapshot.pm_regime_state && (
                      <div className={`mt-4 p-3 rounded-lg border ${
                        snapshot.pm_regime_state === 'RISK_OFF' 
                          ? 'bg-amber-500/10 border-amber-500/30' 
                          : snapshot.pm_regime_state === 'RISK_ON'
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-gray-800/50 border-gray-700/50'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">Macro Context (Gold/Silver)</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            snapshot.pm_regime_state === 'RISK_OFF' 
                              ? 'bg-amber-500/20 text-amber-400' 
                              : snapshot.pm_regime_state === 'RISK_ON'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-700 text-gray-300'
                          }`}>
                            {snapshot.pm_regime_state === 'RISK_OFF' ? '⚠️ Defensive' : 
                             snapshot.pm_regime_state === 'RISK_ON' ? '✅ Constructive' : 
                             '⚖️ Mixed'}
                          </span>
                        </div>
                        {snapshot.pm_context_description && (
                          <p className="text-xs text-gray-400">{snapshot.pm_context_description}</p>
                        )}
                        {snapshot.pm_regime_triggers && snapshot.pm_regime_triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {snapshot.pm_regime_triggers.slice(0, 2).map((trigger, i) => (
                              <span key={i} className="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">
                                {trigger.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Risk Assessment */}
                <div className="bg-white/5 rounded-xl p-5">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <Shield size={18} className="text-amber-400" />
                    Risk Assessment
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">20D Volatility</span>
                      <span className={`font-semibold ${snapshot.volatility_20d > 0.3 ? 'text-red-400' : snapshot.volatility_20d > 0.2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(snapshot.volatility_20d * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Volatility Regime</span>
                      <span className={`font-semibold capitalize ${snapshot.volatility_regime === 'high' || snapshot.volatility_regime === 'extreme' ? 'text-red-400' : snapshot.volatility_regime === 'elevated' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {snapshot.volatility_regime}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">CVaR (95%)</span>
                      <span className={`font-semibold ${(snapshot.cvar_95 || 0) < -0.10 ? 'text-red-400' : (snapshot.cvar_95 || 0) < -0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {snapshot.cvar_95 ? `${(snapshot.cvar_95 * 100).toFixed(1)}%` : (snapshot.cvar_bucket || 'N/A')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Expected Max DD</span>
                      <span className="font-semibold text-red-400">
                        {snapshot.max_drawdown_expected 
                          ? `${(snapshot.max_drawdown_expected * 100).toFixed(1)}%`
                          : snapshot.max_drawdown_1y 
                          ? `${(snapshot.max_drawdown_1y * 100).toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signals */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Supporting Signals */}
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={20} />
                  Supporting Signals ({snapshot.supporting_signals.length})
                </h4>
                {snapshot.supporting_signals.length > 0 ? (
                  <ul className="space-y-2">
                    {snapshot.supporting_signals.map((signal, i) => (
                      <li key={i} className="flex items-center gap-2 text-emerald-300">
                        <ChevronRight size={16} />
                        {SIGNAL_LABELS[signal] || signal}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 italic">No supporting signals detected</p>
                )}
              </div>

              {/* Opposing Signals */}
              <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-red-400">
                  <XCircle size={20} />
                  Opposing Signals ({snapshot.opposing_signals.length})
                </h4>
                {snapshot.opposing_signals.length > 0 ? (
                  <ul className="space-y-2">
                    {snapshot.opposing_signals.map((signal, i) => (
                      <li key={i} className="flex items-center gap-2 text-red-300">
                        <ChevronRight size={16} />
                        {SIGNAL_LABELS[signal] || signal}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 italic">No opposing signals detected</p>
                )}
              </div>
            </div>

            {/* Historical Context */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <BarChart3 className="text-blue-400" size={24} />
                What Happened in Similar Setups?
              </h3>
              
              {/* Use new fields or fall back to legacy */}
              {(() => {
                const sampleSize = snapshot.n_comparable_setups ?? snapshot.similar_regime_outcomes?.sample_size ?? 0;
                const winRate = snapshot.comparable_win_rate ?? snapshot.similar_regime_outcomes?.win_rate ?? 0.5;
                const medianReturn = snapshot.comparable_median_return ?? snapshot.similar_regime_outcomes?.median_20d_return ?? 0;
                const worstOutcome = snapshot.comparable_worst_outcome ?? snapshot.similar_regime_outcomes?.worst_outcome ?? -0.1;
                
                return (
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 mb-6">
                    <p className="text-gray-300 mb-4">
                      {sampleSize > 0 ? (
                        <>We found <span className="text-white font-bold">{sampleSize.toLocaleString()}</span> historical 
                        periods with similar regime characteristics. Here's what happened over the next 20 trading days:</>
                      ) : (
                        <>Analyzing return distributions based on current regime and signal alignment:</>
                      )}
                    </p>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-400">
                          {(winRate * 100).toFixed(0)}%
                        </div>
                        <div className="text-sm text-gray-400">Win Rate</div>
                        <div className="text-xs text-gray-500 mt-1">Positive returns</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-bold ${medianReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {medianReturn >= 0 ? '+' : ''}{(medianReturn * 100).toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-400">Median Return</div>
                        <div className="text-xs text-gray-500 mt-1">20-day forward</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-red-400">
                          {(worstOutcome * 100).toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-400">Worst Case</div>
                        <div className="text-xs text-gray-500 mt-1">Maximum loss</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Return Distribution (new) */}
              {snapshot.return_p10 !== undefined && (
                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-400 mb-3">20-Day Return Distribution</h4>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-center">
                      <div className="text-red-400 font-semibold">{((snapshot.return_p10 || 0) * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">P10</div>
                    </div>
                    <div className="text-center">
                      <div className="text-amber-400 font-semibold">{((snapshot.return_p25 || 0) * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">P25</div>
                    </div>
                    <div className="text-center">
                      <div className="text-white font-bold text-lg">{((snapshot.return_p50 || 0) * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">Median</div>
                    </div>
                    <div className="text-center">
                      <div className="text-emerald-400 font-semibold">{((snapshot.return_p75 || 0) * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">P75</div>
                    </div>
                    <div className="text-center">
                      <div className="text-emerald-300 font-semibold">{((snapshot.return_p90 || 0) * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">P90</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 text-sm text-gray-400">
                <Info size={18} className="flex-shrink-0 mt-0.5" />
                <p>
                  Historical patterns do not guarantee future results. This analysis shows what happened in 
                  similar market conditions historically, not what will happen. Use this as one input among many 
                  in your decision-making process.
                </p>
              </div>
            </div>

            {/* Explanation/Rationale */}
            {snapshot.explanation && (
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-3">
                  <Sparkles className="text-indigo-400" size={20} />
                  Analysis Summary
                </h3>
                <p className="text-gray-300">{snapshot.explanation}</p>
                {snapshot.rationale && (
                  <p className="text-sm text-gray-400 mt-3 italic">{snapshot.rationale}</p>
                )}
              </div>
            )}

            {/* DECISION TRACE (NEW) - Shows pipeline logic flow */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-3">
                <Activity className="text-cyan-400" size={20} />
                Decision Trace
              </h3>
              <p className="text-sm text-gray-400 mb-4">How the system arrived at this decision:</p>
              
              <div className="space-y-3">
                {/* Step 1: Regime */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-900/50 border border-cyan-500/50 flex items-center justify-center text-xs text-cyan-400">1</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-cyan-400">Regime Classification</div>
                    <div className="text-sm text-gray-400">
                      Asset: <span className="text-white capitalize">{snapshot.asset_regime}</span> ({(snapshot.asset_regime_confidence * 100).toFixed(0)}% confidence) • 
                      Market: <span className="text-white capitalize">{snapshot.market_regime}</span>
                    </div>
                  </div>
                </div>
                
                {/* Step 2: Signals */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-900/50 border border-purple-500/50 flex items-center justify-center text-xs text-purple-400">2</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-purple-400">Signal Analysis</div>
                    <div className="text-sm text-gray-400">
                      {snapshot.supporting_signals.length} supporting, {snapshot.opposing_signals.length} opposing → 
                      <span className={snapshot.signal_agreement > 0.6 ? 'text-emerald-400' : snapshot.signal_agreement > 0.4 ? 'text-amber-400' : 'text-red-400'}>
                        {' '}{(snapshot.signal_agreement * 100).toFixed(0)}% agreement
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Step 3: Risk */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-900/50 border border-red-500/50 flex items-center justify-center text-xs text-red-400">3</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-400">Risk Assessment</div>
                    <div className="text-sm text-gray-400">
                      Vol: <span className="text-white">{(snapshot.volatility_20d * 100).toFixed(1)}%</span> ({snapshot.volatility_regime}) • 
                      CVaR: <span className="text-red-400">{((snapshot.cvar_95 || 0) * 100).toFixed(1)}%</span> • 
                      Max DD: <span className="text-red-400">{((snapshot.max_drawdown_expected || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                
                {/* Step 4: Historical Context */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-900/50 border border-amber-500/50 flex items-center justify-center text-xs text-amber-400">4</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-amber-400">Historical Comparable</div>
                    <div className="text-sm text-gray-400">
                      {(snapshot.n_comparable_setups || 0).toLocaleString()} similar setups → 
                      <span className={(snapshot.comparable_win_rate || 0) > 0.55 ? 'text-emerald-400' : (snapshot.comparable_win_rate || 0) > 0.45 ? 'text-amber-400' : 'text-red-400'}>
                        {' '}{((snapshot.comparable_win_rate || 0) * 100).toFixed(0)}% win rate
                      </span>, median: {((snapshot.comparable_median_return || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                {/* Step 5: Decision */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 border border-emerald-500/50 flex items-center justify-center text-xs text-emerald-400">5</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-emerald-400">Decision Output</div>
                    <div className="text-sm text-gray-400">
                      Intent: <span className={`font-bold ${getIntentColor(snapshot.intent)}`}>{snapshot.intent}</span> • 
                      Conviction: <span className="text-white">{(snapshot.conviction_pct ?? (snapshot.conviction_raw || 0) * 100).toFixed(1)}%</span> • 
                      Position: <span className="text-white">{((snapshot.recommended_position_pct || 0) * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signal Agreement */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-3">
                <Eye className="text-purple-400" size={20} />
                Signal Agreement
              </h3>
              
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${snapshot.signal_agreement > 0.6 ? 'bg-emerald-500' : snapshot.signal_agreement > 0.3 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${snapshot.signal_agreement * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-2xl font-bold">
                  {(snapshot.signal_agreement * 100).toFixed(0)}%
                </div>
              </div>
              
              <p className="text-sm text-gray-400 mt-3">
                {snapshot.signal_agreement > 0.7 
                  ? 'Strong signal alignment — multiple indicators point in the same direction.'
                  : snapshot.signal_agreement > 0.4
                  ? 'Mixed signals — some indicators conflict. Proceed with caution.'
                  : 'Weak alignment — signals are conflicting. High uncertainty in the outlook.'}
              </p>
            </div>

            {/* Upgrade/Downgrade Conditions */}
            {((snapshot.upgrade_conditions && snapshot.upgrade_conditions.length > 0) || 
              (snapshot.downgrade_conditions && snapshot.downgrade_conditions.length > 0) || 
              (snapshot.risk_factors && snapshot.risk_factors.length > 0)) && (
              <div className="grid md:grid-cols-3 gap-4">
                {snapshot.upgrade_conditions && snapshot.upgrade_conditions.length > 0 && (
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                      <TrendingUp size={16} />
                      Upgrade Triggers
                    </h4>
                    <ul className="space-y-1 text-sm text-emerald-300">
                      {snapshot.upgrade_conditions.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {snapshot.downgrade_conditions && snapshot.downgrade_conditions.length > 0 && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-amber-400 mb-3 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Downgrade Triggers
                    </h4>
                    <ul className="space-y-1 text-sm text-amber-300">
                      {snapshot.downgrade_conditions.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {snapshot.risk_factors && snapshot.risk_factors.length > 0 && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <Shield size={16} />
                      Risk Factors
                    </h4>
                    <ul className="space-y-1 text-sm text-red-300">
                      {snapshot.risk_factors.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Why This Decision - Explicit Reasoning */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-3">
                <AlertCircle className="text-amber-400" size={20} />
                Why {snapshot.intent} and Not Something Else?
              </h3>
              
              <div className="space-y-4 text-sm">
                {snapshot.intent === 'HOLD' && (
                  <>
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                      <h4 className="font-semibold text-blue-400 mb-2">Why HOLD (not INITIATE)?</h4>
                      <p className="text-gray-300">
                        {/* Intent is HOLD - backend determined conditions don't warrant fresh entry */}
                        {(snapshot.conviction_pct ?? 0) < 50 
                          ? 'Conviction is below the threshold for a fresh entry. Either signals are mixed, regime is unclear, or risk metrics don\'t support aggressive positioning.'
                          : (snapshot.signal_agreement ?? 0) < 0.5
                          ? 'While regime may be favorable, signal alignment is too weak. Technical indicators are not yet confirming direction.'
                          : 'Current conditions favor maintaining positions but don\'t warrant new capital deployment due to elevated risk or unfavorable entry timing.'}
                      </p>
                    </div>
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                      <h4 className="font-semibold text-amber-400 mb-2">Why HOLD (not REDUCE)?</h4>
                      <p className="text-gray-300">
                        {snapshot.volatility_regime === 'low' || snapshot.volatility_regime === 'normal'
                          ? 'Volatility is contained and there\'s no imminent breakdown signal. No reason to reduce exposure yet.'
                          : snapshot.asset_regime !== 'distribution' && snapshot.asset_regime !== 'markdown'
                          ? 'Asset regime is not showing distribution patterns. No evidence of smart money exiting positions.'
                          : 'Despite some caution signals, the overall risk profile doesn\'t justify reducing exposure at current prices.'}
                      </p>
                    </div>
                  </>
                )}
                
                {snapshot.intent === 'INITIATE' && (
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-emerald-400 mb-2">Why INITIATE (Entry Justified)?</h4>
                    <p className="text-gray-300">
                      Conviction at {(snapshot.conviction_pct ?? (snapshot.conviction_raw || 0) * 100).toFixed(1)}% with {(snapshot.signal_agreement * 100).toFixed(1)}% signal agreement. 
                      {snapshot.asset_regime === 'accumulation' || snapshot.asset_regime === 'markup'
                        ? ' Regime is favorable for longs.'
                        : ' Risk-adjusted opportunity detected.'} 
                      Historical setups show {((snapshot.comparable_win_rate || 0) * 100).toFixed(0)}% win rate.
                    </p>
                  </div>
                )}
                
                {snapshot.intent === 'AVOID' && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-red-400 mb-2">Why AVOID (Entry Not Recommended)?</h4>
                    <p className="text-gray-300">
                      {snapshot.asset_regime === 'distribution' || snapshot.asset_regime === 'markdown' || snapshot.asset_regime === 'panic'
                        ? 'Asset is in a bearish regime with high probability of further downside.'
                        : snapshot.volatility_regime === 'extreme' || snapshot.volatility_regime === 'high'
                        ? 'Volatility is too elevated for safe entry. Wait for conditions to normalize.'
                        : 'Risk/reward profile is unfavorable. Either too much downside risk or insufficient upside potential.'}
                    </p>
                  </div>
                )}
                
                {(snapshot.intent === 'REDUCE' || snapshot.intent === 'EXIT') && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                    <h4 className="font-semibold text-red-400 mb-2">Why {snapshot.intent} (Risk Management)?</h4>
                    <p className="text-gray-300">
                      {snapshot.asset_regime === 'distribution' || snapshot.asset_regime === 'markdown'
                        ? 'Asset showing distribution/markdown patterns. Smart money may be exiting.'
                        : (snapshot.cvar_95 || 0) < -0.15
                        ? `CVaR at ${((snapshot.cvar_95 || 0) * 100).toFixed(1)}% indicates extreme tail risk.`
                        : 'Multiple risk factors are converging. Position should be reduced to manage downside.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* RISK BOX - Always Visible */}
            <div className="bg-gradient-to-r from-red-900/20 to-amber-900/20 border border-red-500/30 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-3 text-red-400">
                <Shield size={20} />
                Risk Summary
                <span className="ml-auto text-xs font-normal text-gray-400 cursor-help" title="Conditional Value at Risk (CVaR) represents the expected loss in the worst 5% of scenarios">
                  ℹ️ Hover for definitions
                </span>
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-black/30 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    CVaR (95%)
                    <span className="cursor-help" title="Conditional Value at Risk: Expected loss in the worst 5% of scenarios">ⓘ</span>
                  </div>
                  <div className={`text-2xl font-bold ${(snapshot.cvar_95 || 0) < -0.10 ? 'text-red-400' : (snapshot.cvar_95 || 0) < -0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {snapshot.cvar_95 ? `${(snapshot.cvar_95 * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {(snapshot.cvar_95 || 0) < -0.10 ? 'High risk' : (snapshot.cvar_95 || 0) < -0.05 ? 'Moderate' : 'Low risk'}
                  </div>
                </div>
                
                <div className="bg-black/30 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    Max Drawdown
                    <span className="cursor-help" title="Expected maximum peak-to-trough decline">ⓘ</span>
                  </div>
                  <div className={`text-2xl font-bold ${(snapshot.max_drawdown_expected || snapshot.max_drawdown_1y || 0) < -0.20 ? 'text-red-400' : 'text-amber-400'}`}>
                    {snapshot.max_drawdown_expected 
                      ? `${(snapshot.max_drawdown_expected * 100).toFixed(1)}%`
                      : snapshot.max_drawdown_1y 
                      ? `${(snapshot.max_drawdown_1y * 100).toFixed(1)}%`
                      : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Expected worst case</div>
                </div>
                
                <div className="bg-black/30 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    Volatility
                    <span className="cursor-help" title="20-day realized volatility annualized">ⓘ</span>
                  </div>
                  <div className={`text-2xl font-bold ${snapshot.volatility_20d > 0.4 ? 'text-red-400' : snapshot.volatility_20d > 0.25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(snapshot.volatility_20d * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1 capitalize">{snapshot.volatility_regime} regime</div>
                </div>
                
                <div className="bg-black/30 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    Position Size
                    <span className="cursor-help" title="Recommended allocation based on risk budget">ⓘ</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {((snapshot.recommended_position_pct || 0) * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Of portfolio</div>
                </div>
              </div>
              
              {/* Correlation Warning if applicable */}
              {snapshot.relative_strength && Math.abs(snapshot.relative_strength) > 0.8 && (
                <div className="mt-4 bg-amber-900/30 border border-amber-500/40 rounded-xl p-3 flex items-center gap-3">
                  <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
                  <div className="text-sm text-amber-300">
                    <span className="font-semibold">Correlation Warning:</span> This stock has {snapshot.relative_strength > 0 ? 'high positive' : 'high negative'} correlation with market benchmark. 
                    Consider diversification impact on portfolio risk.
                  </div>
                </div>
              )}
            </div>

            {/* Data Freshness Badge */}
            <div className="bg-[#0d1117] border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm text-gray-300">
                  <span className="font-semibold text-emerald-400">Data Freshness:</span> Pipeline ran {snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleString() : 'today'} 
                </span>
              </div>
              <div className="text-sm text-gray-400">
                Version: <span className="text-white">{snapshot.version}</span> • 
                Quality: <span className={`${snapshot.data_quality === 'high' ? 'text-emerald-400' : snapshot.data_quality === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>{snapshot.data_quality}</span> •
                Data points: <span className="text-white">{snapshot.data_points?.toLocaleString() || 'N/A'}</span>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="text-center text-sm text-gray-500 py-4 border-t border-white/10">
              <p>
                This is algorithmic analysis based on historical patterns, not investment advice. 
                Past performance does not guarantee future results. Always do your own research.
              </p>
              <p className="mt-2 text-xs">
                Data as of {snapshot.as_of_date} • Version {snapshot.version} • Quality: {snapshot.data_quality}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

