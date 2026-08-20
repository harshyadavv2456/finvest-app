/**
 * Alpha Rankings — Daily market-wide mispricing scanner.
 * 
 * Shows top 20 undervalued and top 20 overvalued stocks ranked by
 * mispricing probability, with expectation gap trends and signal tiers.
 */

import { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, Zap, Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PRODUCTION_API = 'https://finvest-api-gwkz.onrender.com';
const API_BASE = import.meta.env.VITE_API_URL 
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : PRODUCTION_API;

interface GapTrend {
  delta: number;
  days: number;
  trend: string;
  oldestGap: number;
}

interface RankedStock {
  ticker: string;
  companyName: string;
  companyType: string;
  currentPrice: number;
  intrinsicValue: number;
  marginOfSafety: number;
  recommendation: string;
  valuationZone: string;
  valuationConfidence: number;
  expectationGap: number;
  gapLabel: string;
  mispricingScore: number;
  mispricingLabel: string;
  alphaDirection: string;
  impliedGrowth: number;
  modelGrowth: number;
  signalTier: string;
  gapTrend?: GapTrend;
}

interface RankingsData {
  generatedAt: string;
  totalScored: number;
  totalTickers: number;
  topUndervalued: RankedStock[];
  topOvervalued: RankedStock[];
  signalSummary: {
    strong: number;
    moderate: number;
    weak: number;
  };
}

function TrendBadge({ trend }: { trend?: GapTrend }) {
  if (!trend) return <span className="text-xs text-zinc-600">—</span>;
  
  const icon = trend.delta > 2 
    ? <ArrowUpRight className="w-3 h-3" /> 
    : trend.delta < -2 
    ? <ArrowDownRight className="w-3 h-3" />
    : <Minus className="w-3 h-3" />;
  
  const color = trend.trend.includes('undervalue') || trend.trend === 'improving'
    ? 'text-emerald-400'
    : trend.trend.includes('overvalue') || trend.trend === 'deteriorating'
    ? 'text-red-400'
    : 'text-zinc-400';

  return (
    <span className={`flex items-center gap-0.5 text-xs font-mono ${color}`} title={`${trend.days}d trend`}>
      {icon} {trend.delta > 0 ? '+' : ''}{trend.delta}%
    </span>
  );
}

function SignalBadge({ tier }: { tier: string }) {
  const config = {
    strong: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
    moderate: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
    weak: { bg: 'bg-zinc-700/30', text: 'text-zinc-500', border: 'border-zinc-600/30' },
  }[tier] || { bg: 'bg-zinc-800', text: 'text-zinc-500', border: 'border-zinc-700' };

  return (
    <span className={`px-1.5 py-0.5 text-xs rounded ${config.bg} ${config.text} border ${config.border} capitalize`}>
      {tier}
    </span>
  );
}

function StockRow({ stock, rank, direction }: { stock: RankedStock; rank: number; direction: 'undervalued' | 'overvalued' }) {
  const navigate = useNavigate();
  const isUnder = direction === 'undervalued';
  
  return (
    <tr 
      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
      onClick={() => navigate(`/stock/${stock.ticker}`)}
    >
      <td className="py-3 px-3 text-zinc-500 font-mono text-sm">{rank}</td>
      <td className="py-3 px-3">
        <div className="font-semibold text-white">{stock.ticker}</div>
        <div className="text-xs text-zinc-500 truncate max-w-[140px]">{stock.companyName}</div>
      </td>
      <td className="py-3 px-3">
        <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded capitalize">{stock.companyType}</span>
      </td>
      <td className="py-3 px-3 font-mono text-sm text-zinc-300">${stock.currentPrice.toFixed(2)}</td>
      <td className="py-3 px-3 font-mono text-sm text-zinc-300">${stock.intrinsicValue.toFixed(2)}</td>
      <td className={`py-3 px-3 font-mono text-sm font-bold ${isUnder ? 'text-emerald-400' : 'text-red-400'}`}>
        {stock.expectationGap > 0 ? '+' : ''}{stock.expectationGap}%
      </td>
      <td className="py-3 px-3">
        <TrendBadge trend={stock.gapTrend} />
      </td>
      <td className={`py-3 px-3 font-mono text-sm font-bold ${
        stock.mispricingScore >= 75 ? 'text-purple-400' : 
        stock.mispricingScore >= 50 ? 'text-amber-400' : 'text-zinc-400'
      }`}>
        {stock.mispricingScore}%
      </td>
      <td className="py-3 px-3">
        <SignalBadge tier={stock.signalTier} />
      </td>
      <td className={`py-3 px-3 text-sm font-semibold ${
        stock.recommendation === 'BUY' ? 'text-emerald-400' :
        stock.recommendation === 'SELL' ? 'text-red-400' : 'text-zinc-400'
      }`}>
        {stock.recommendation}
      </td>
    </tr>
  );
}

export default function AlphaRankingsPage() {
  const [data, setData] = useState<RankingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'undervalued' | 'overvalued'>('undervalued');

  const fetchRankings = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/intrinsiq/alpha-rankings`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Failed to load rankings' }));
        throw new Error(err.detail || 'Failed');
      }
      const result = await resp.json();
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load rankings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRankings(); }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
        <p className="text-zinc-400">Loading Alpha Rankings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <p className="text-zinc-400">{error}</p>
        <p className="text-xs text-zinc-600">Rankings are generated during daily refresh. Run the refresh pipeline first.</p>
        <button onClick={fetchRankings} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const list = activeTab === 'undervalued' ? data.topUndervalued : data.topOvervalued;
  const generatedDate = new Date(data.generatedAt).toLocaleString();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-purple-500" />
            Alpha Rankings
          </h1>
          <p className="text-zinc-400 mt-1">
            Market-wide mispricing scanner &middot; {data.totalScored} stocks scored &middot; Updated {generatedDate}
          </p>
        </div>
        <button 
          onClick={fetchRankings}
          className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm flex items-center gap-2 self-start"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Signal Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-400 font-mono">{data.signalSummary.strong}</p>
          <p className="text-xs text-purple-300 mt-1">Strong Signals (&ge;70%)</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-400 font-mono">{data.signalSummary.moderate}</p>
          <p className="text-xs text-amber-300 mt-1">Moderate Signals (50-70%)</p>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-zinc-400 font-mono">{data.signalSummary.weak}</p>
          <p className="text-xs text-zinc-500 mt-1">Weak Signals (&lt;50%)</p>
        </div>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('undervalued')}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'undervalued'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Top 20 Undervalued
        </button>
        <button
          onClick={() => setActiveTab('overvalued')}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'overvalued'
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          <TrendingDown className="w-4 h-4" /> Top 20 Overvalued
        </button>
      </div>

      {/* Rankings Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No {activeTab} stocks found yet. Rankings build after daily refresh.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="py-3 px-3 text-left">#</th>
                  <th className="py-3 px-3 text-left">Ticker</th>
                  <th className="py-3 px-3 text-left">Type</th>
                  <th className="py-3 px-3 text-left">Price</th>
                  <th className="py-3 px-3 text-left">Intrinsic</th>
                  <th className="py-3 px-3 text-left">Gap</th>
                  <th className="py-3 px-3 text-left">Trend</th>
                  <th className="py-3 px-3 text-left">Mispricing</th>
                  <th className="py-3 px-3 text-left">Signal</th>
                  <th className="py-3 px-3 text-left">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {list.map((stock, i) => (
                  <StockRow 
                    key={stock.ticker} 
                    stock={stock} 
                    rank={i + 1}
                    direction={activeTab}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Signal Thresholds Legend */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">Signal Trigger Thresholds</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0"></div>
            <div>
              <p className="text-purple-400 font-medium">Strong Signal (&ge;70%)</p>
              <p className="text-zinc-500 text-xs">High conviction mispricing. MOS, expectation gap, and confidence all aligned. Actionable.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
            <div>
              <p className="text-amber-400 font-medium">Moderate Signal (50-70%)</p>
              <p className="text-zinc-500 text-xs">Probable mispricing but with some uncertainty. Worth monitoring for confirmation.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-zinc-600 mt-1.5 shrink-0"></div>
            <div>
              <p className="text-zinc-400 font-medium">Weak Signal (&lt;50%)</p>
              <p className="text-zinc-500 text-xs">Low mispricing probability. Mixed signals or insufficient data. No action recommended.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
