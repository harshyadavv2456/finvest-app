/**
 * Cross-Signal Insights Page
 *
 * Surfaces the new /api/insights endpoints: combines the quant engine's
 * conviction score with the news pipeline's sentiment/impact scoring for
 * the same ticker, and flags whether they agree or disagree. First
 * feature in FinVest that actually combines the two independent signal
 * sources the system now has (see REPO_AUDIT_REPORT.md).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, GitCompare, TrendingUp, TrendingDown, Minus,
  Newspaper, Cpu, RefreshCw, AlertTriangle, Globe
} from 'lucide-react';
import { api } from '../lib/api';

interface MacroContext {
  as_of?: string;
  us?: { available: boolean; yield_curve_2y10y_spread_pct?: number | null; yield_curve_inverted?: boolean | null; fed_funds_rate_pct?: number | null };
  india?: { available: boolean };
  physical_disruption?: { available: boolean; firms?: { active_fire_detections_24h?: number | null }; usgs?: { significant_earthquakes_7d?: number | null; max_magnitude_7d?: number | null } };
  summary?: string;
}

interface DivergentSignal {
  ticker: string;
  quant_intent: string;
  conviction_pct: number | null;
  news_sentiment: string | null;
  article_count: number;
}

interface CrossSignalDetail {
  status: string;
  market: string;
  ticker: string;
  as_of_date: string;
  quant: { intent: string; conviction_pct: number | null; rationale: string | null };
  news: { article_count: number; avg_sentiment_score: number | null; dominant_sentiment: string | null; recent_articles: Array<{ title: string; sentiment: string | null; impact_level: string | null; url: string | null }> };
  cross_signal: { agreement: string; note: string };
}

function AgreementBadge({ agreement }: { agreement: string }) {
  const map: Record<string, { label: string; icon: JSX.Element; className: string }> = {
    confirms: { label: 'Confirms', icon: <TrendingUp size={13} />, className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    diverges: { label: 'Diverges', icon: <AlertTriangle size={13} />, className: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    neutral: { label: 'Neutral', icon: <Minus size={13} />, className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
    no_news_signal: { label: 'No news', icon: <Minus size={13} />, className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  };
  const cfg = map[agreement] || map.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.className}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function CrossSignalInsightsPage() {
  const navigate = useNavigate();
  const [market, setMarket] = useState<'US' | 'IN'>('US');
  const [signals, setSignals] = useState<DivergentSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CrossSignalDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [macro, setMacro] = useState<MacroContext | null>(null);

  useEffect(() => {
    fetchDivergent();
  }, [market]);

  // Macro context is market-wide, not per-ticker - fetch once, reuse for
  // every ticker's reconciliation panel. Top of the causal chain this
  // page is meant to show: macro pressure -> quant signal -> news
  // sentiment, one connected view instead of three separate widgets.
  useEffect(() => {
    api.get('/api/macro-context/current')
      .then((res) => setMacro(res.data))
      .catch(() => setMacro(null));
  }, []);

  const fetchDivergent = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/insights/divergent?market=${market}&limit=25`);
      setSignals(res.data.signals || []);
    } catch (err) {
      console.error('Failed to load divergent signals:', err);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (ticker: string) => {
    setLoadingDetail(true);
    setSelected(null);
    try {
      const res = await api.get(`/api/insights/${market}/${ticker}`);
      setSelected(res.data);
    } catch (err) {
      console.error('Failed to load cross-signal detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900/30 to-purple-900/30 border-b border-amber-500/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <GitCompare className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Signal Reconciliation</h1>
                <p className="text-xs text-amber-400/80 hidden md:block">Quant conviction vs. recent news sentiment</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['US', 'IN'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  market === m ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                {m}
              </button>
            ))}
            <button onClick={fetchDivergent} disabled={loading} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Divergent feed */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">Divergent right now — {market}</h2>
            <span className="text-xs text-gray-500 font-mono">{signals.length} flagged</span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
          ) : signals.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm border border-gray-800 rounded-xl">
              No divergent signals right now — quant and news agree across the covered universe.
            </div>
          ) : (
            <div className="border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {signals.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => openDetail(s.ticker)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm w-16">{s.ticker}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      s.quant_intent === 'AVOID' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      Quant: {s.quant_intent}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Newspaper size={12} />
                      {s.news_sentiment} ({s.article_count})
                    </span>
                    {s.conviction_pct != null && <span className="font-mono w-14 text-right">{s.conviction_pct.toFixed(1)}%</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {loadingDetail ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading detail...</div>
          ) : !selected ? (
            <div className="text-center py-12 text-gray-500 text-sm border border-gray-800 rounded-xl border-dashed">
              Select a ticker from the feed to see the full reconciliation.
            </div>
          ) : (
            <div className="border border-gray-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-mono">{selected.ticker}</h3>
                <AgreementBadge agreement={selected.cross_signal.agreement} />
              </div>
              <p className="text-xs text-gray-400">{selected.cross_signal.note}</p>

              {/* Macro layer - top of the causal chain: geopolitical/macro
                  pressure feeding into what the quant engine and news
                  sentiment below are reacting to. Market-wide, not
                  ticker-specific, but shown alongside every ticker's
                  reconciliation so the connection is visible in one place. */}
              {macro?.summary && (
                <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 mb-1">
                    <Globe size={13} /> Macro Context
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{macro.summary}</p>
                  {macro.us?.available && macro.us.yield_curve_2y10y_spread_pct != null && (
                    <div className="flex justify-between text-xs pt-1 border-t border-indigo-500/10">
                      <span className="text-gray-500">US 2Y/10Y spread</span>
                      <span className={`font-mono ${macro.us.yield_curve_inverted ? 'text-rose-400' : 'text-gray-300'}`}>
                        {macro.us.yield_curve_2y10y_spread_pct > 0 ? '+' : ''}{macro.us.yield_curve_2y10y_spread_pct.toFixed(2)}pp
                        {macro.us.yield_curve_inverted ? ' (inverted)' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-gray-900/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-1">
                  <Cpu size={13} /> Quant Engine
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Intent</span>
                  <span className="font-mono">{selected.quant.intent}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Conviction</span>
                  <span className="font-mono">{selected.quant.conviction_pct?.toFixed(1)}%</span>
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-1">
                  <Newspaper size={13} /> Recent Coverage ({selected.news.article_count})
                </div>
                {selected.news.recent_articles.map((a, i) => (
                  <a
                    key={i}
                    href={a.url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-gray-300 hover:text-white bg-black/30 rounded p-2"
                  >
                    {a.title}
                    <span className={`ml-2 ${a.sentiment === 'positive' ? 'text-emerald-400' : a.sentiment === 'negative' ? 'text-rose-400' : 'text-gray-500'}`}>
                      · {a.sentiment}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
