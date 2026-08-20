/**
 * Stock Technical Dashboard
 * Consolidated view: price, screener metrics, intelligence signals,
 * IntrinsIQ valuation, StrataX options, news - all in one page.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart3, Brain, Sparkles, Layers, TrendingUp, TrendingDown,
  AlertTriangle, Newspaper, Search, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { API_BASE_URL } from '../config/env';

interface DashboardData {
  ticker: string;
  market: string;
  companyName: string;
  price: {
    current: number;
    change_1d: number;
    change_1d_pct: number;
    high_52w: number;
    low_52w: number;
    sma20: number;
    sma50: number | null;
    sma200: number | null;
  };
  screener: Record<string, any>;
  intelligence: {
    intent: string;
    conviction: number;
    conviction_pct: number;
    direction: string;
    asset_regime: string;
    market_regime: string;
    explanation: string;
    supporting_signals: string[];
    opposing_signals: string[];
  } | null;
  valuation: {
    intrinsicValue: number;
    marginOfSafety: number;
    recommendation: string;
    methods: { name: string; value: number | null; description: string; applicable: boolean }[];
    regime: string;
  } | null;
  stratax: { available: boolean; data: any };
  news: any[];
}

export default function StockDashboardPage() {
  const { ticker: paramTicker } = useParams();
  const navigate = useNavigate();
  const [ticker, setTicker] = useState(paramTicker || '');
  const [searchInput, setSearchInput] = useState(paramTicker || '');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDashboard = async (t: string) => {
    if (!t) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE_URL}/api/stock-dashboard/${t}`);
      if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
      const json = await resp.json();
      setData(json);
      setTicker(t);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paramTicker) fetchDashboard(paramTicker.toUpperCase());
  }, [paramTicker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/dashboard/${searchInput.trim().toUpperCase()}`);
    }
  };

  const intentColor = (intent: string) => {
    if (!intent) return 'text-gray-400';
    const i = intent.toUpperCase();
    if (i === 'INITIATE') return 'text-green-400';
    if (i === 'AVOID') return 'text-red-400';
    return 'text-yellow-400';
  };

  const recColor = (rec: string) => {
    if (rec === 'BUY') return 'text-green-400 bg-green-500/10';
    if (rec === 'SELL') return 'text-red-400 bg-red-500/10';
    return 'text-yellow-400 bg-yellow-500/10';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Technical Dashboard</h1>
          <p className="text-sm text-gray-400">Consolidated stock analysis</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter ticker (e.g. RELIANCE.NS, AAPL)"
            className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button type="submit" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
          Analyze
        </button>
      </form>

      {loading && (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-blue-400" size={32} />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Price Header */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <div className="flex items-baseline gap-4 mb-2">
              <h2 className="text-3xl font-bold">{data.companyName}</h2>
              <span className="text-gray-400">{data.ticker}</span>
              <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{data.market}</span>
            </div>
            {data.price && (
              <div className="flex items-baseline gap-6">
                <span className="text-4xl font-bold">{data.price.current?.toFixed(2)}</span>
                <span className={data.price.change_1d >= 0 ? 'text-green-400 text-xl' : 'text-red-400 text-xl'}>
                  {data.price.change_1d >= 0 ? '+' : ''}{data.price.change_1d?.toFixed(2)} ({data.price.change_1d_pct?.toFixed(2)}%)
                </span>
              </div>
            )}
            {data.price && (
              <div className="flex gap-6 mt-3 text-sm text-gray-400">
                <span>52W H: {data.price.high_52w?.toFixed(2)}</span>
                <span>52W L: {data.price.low_52w?.toFixed(2)}</span>
                <span>SMA20: {data.price.sma20?.toFixed(2)}</span>
                {data.price.sma50 && <span>SMA50: {data.price.sma50.toFixed(2)}</span>}
                {data.price.sma200 && <span>SMA200: {data.price.sma200.toFixed(2)}</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Intelligence Panel */}
            {data.intelligence && (
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Brain size={20} className="text-purple-400" />
                  <h3 className="text-lg font-semibold">Intelligence</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Intent</span>
                    <span className={`font-bold ${intentColor(data.intelligence.intent)}`}>{data.intelligence.intent}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Conviction</span>
                    <span className="font-bold">{data.intelligence.conviction_pct?.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Direction</span>
                    <span>{data.intelligence.direction}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Regime</span>
                    <span>{data.intelligence.asset_regime} / {data.intelligence.market_regime}</span>
                  </div>
                  {data.intelligence.supporting_signals?.length > 0 && (
                    <div>
                      <span className="text-gray-400 text-sm">Supporting: </span>
                      <span className="text-green-400 text-sm">{data.intelligence.supporting_signals.join(', ')}</span>
                    </div>
                  )}
                  {data.intelligence.opposing_signals?.length > 0 && (
                    <div>
                      <span className="text-gray-400 text-sm">Opposing: </span>
                      <span className="text-red-400 text-sm">{data.intelligence.opposing_signals.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* IntrinsIQ Valuation */}
            {data.valuation && (
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={20} className="text-emerald-400" />
                  <h3 className="text-lg font-semibold">IntrinsIQ Valuation</h3>
                  {data.valuation.companyType && (
                    <span className="text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded capitalize">{data.valuation.companyType}</span>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Intrinsic Value</span>
                    <span className="font-bold">{data.valuation.intrinsicValue?.toFixed(2)}</span>
                  </div>
                  {data.valuation.intrinsicRange && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Range</span>
                      <span className="text-gray-300 font-mono text-xs">
                        {data.valuation.intrinsicRange.low?.toFixed(0)} — {data.valuation.intrinsicRange.base?.toFixed(0)} — {data.valuation.intrinsicRange.high?.toFixed(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Margin of Safety</span>
                    <span className={data.valuation.marginOfSafety > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {data.valuation.marginOfSafety?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Recommendation</span>
                    <span className={`px-2 py-0.5 rounded text-sm font-bold ${recColor(data.valuation.recommendation)}`}>
                      {data.valuation.recommendation}
                    </span>
                  </div>
                  {data.valuation.valuationZone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Zone</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded capitalize ${
                        data.valuation.valuationZone === 'deep_undervalue' || data.valuation.valuationZone === 'undervalue' ? 'text-green-400 bg-green-500/10' :
                        data.valuation.valuationZone === 'fair_value' ? 'text-yellow-400 bg-yellow-500/10' :
                        'text-red-400 bg-red-500/10'
                      }`}>{data.valuation.valuationZone.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {data.valuation.valuationConfidence != null && data.valuation.valuationConfidence > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Confidence</span>
                      <span className={`font-bold ${data.valuation.valuationConfidence >= 70 ? 'text-green-400' : data.valuation.valuationConfidence >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {data.valuation.valuationConfidence.toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {data.valuation.reverseDCF && (
                    <div className="mt-2 p-2 bg-gray-800/60 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Reverse DCF</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Mkt Implies</span>
                        <span className={`font-bold font-mono ${data.valuation.reverseDCF.impliedGrowthRate > data.valuation.reverseDCF.modelGrowthRate ? 'text-amber-400' : 'text-green-400'}`}>
                          {data.valuation.reverseDCF.impliedGrowthRate}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Model</span>
                        <span className="font-bold font-mono text-blue-400">{data.valuation.reverseDCF.modelGrowthRate}%</span>
                      </div>
                    </div>
                  )}
                  {data.valuation.alphaSignals && (
                    <div className="mt-2 p-2 bg-purple-900/20 rounded-lg border border-purple-800/30">
                      <p className="text-xs text-purple-400 font-semibold mb-1">Alpha Signals</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Gap</span>
                        <span className={`font-bold font-mono ${
                          data.valuation.alphaSignals.expectationGap > 5 ? 'text-green-400' :
                          data.valuation.alphaSignals.expectationGap < -10 ? 'text-red-400' : 'text-gray-300'
                        }`}>
                          {data.valuation.alphaSignals.expectationGap > 0 ? '+' : ''}{data.valuation.alphaSignals.expectationGap}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Mispricing</span>
                        <span className={`font-bold font-mono ${
                          data.valuation.alphaSignals.mispricingScore >= 75 ? 'text-purple-400' :
                          data.valuation.alphaSignals.mispricingScore >= 50 ? 'text-amber-400' : 'text-gray-400'
                        }`}>
                          {data.valuation.alphaSignals.mispricingScore}%
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 space-y-1">
                    {data.valuation.methods?.map((m, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-400">{m.name}</span>
                        <span className={m.applicable ? 'text-white' : 'text-gray-600'}>
                          {m.applicable && m.value ? m.value.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Screener Metrics */}
            {data.screener && Object.keys(data.screener).length > 0 && (
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 size={20} className="text-blue-400" />
                  <h3 className="text-lg font-semibold">Screener Metrics</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {['pe_ratio', 'pb_ratio', 'roe', 'roce', 'debt_to_equity', 'dividend_yield',
                    'rsi14', 'eps_growth_yoy', 'market_cap_cr', 'beta'].map(key => (
                    data.screener[key] != null && (
                      <div key={key} className="flex justify-between py-1">
                        <span className="text-gray-400">{key.replace(/_/g, ' ').toUpperCase()}</span>
                        <span>{typeof data.screener[key] === 'number' ? data.screener[key].toFixed(2) : data.screener[key]}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* StrataX Options */}
            {data.stratax?.available && (
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Layers size={20} className="text-pink-400" />
                  <h3 className="text-lg font-semibold">StrataX Options</h3>
                </div>
                <p className="text-sm text-gray-400">Options chain data available for this stock.</p>
                <button
                  onClick={() => navigate('/stratax')}
                  className="mt-3 px-4 py-2 bg-pink-500/20 text-pink-400 rounded-lg text-sm hover:bg-pink-500/30"
                >
                  View Full Options Analysis
                </button>
              </div>
            )}
          </div>

          {/* News */}
          {data.news && data.news.length > 0 && (
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Newspaper size={20} className="text-amber-400" />
                <h3 className="text-lg font-semibold">Recent News</h3>
              </div>
              <div className="space-y-2">
                {data.news.slice(0, 5).map((n: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm">{n.title || n.headline}</p>
                      <p className="text-xs text-gray-500 mt-1">{n.publisher || n.source} - {n.published || n.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-20 text-gray-500">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
          <p>Enter a ticker symbol to see the full technical dashboard</p>
        </div>
      )}
    </div>
  );
}
