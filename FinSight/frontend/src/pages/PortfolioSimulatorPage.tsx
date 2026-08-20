import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  BarChart3,
  PieChart,
  RefreshCw,
  Clock
} from 'lucide-react';
import { api } from '../lib/api';

interface SnapshotData {
  // New v2.0 format
  version?: string;
  generated_at?: string;
  as_of_date?: string;
  n_stocks_analyzed?: number;
  intents?: {
    INITIATE: number;
    HOLD: number;
    AVOID: number;
    REDUCE: number;
    EXIT: number;
  };
  regimes?: Record<string, number>;
  top_opportunities?: Array<{
    ticker: string;
    market: string;
    conviction: number;
    conviction_pct?: number;
    intent: string;
    asset_regime: string;
    signal_agreement: number;
    risk_reward: number;
    volatility?: number;
    cvar_95?: number;
  }>;
  top_avoids?: Array<{
    ticker: string;
    market: string;
    conviction: number;
    conviction_pct?: number;
    asset_regime: string;
    risk_factors: string[];
    cvar_95: number;
  }>;
  
  // CORRELATION-AWARE RISK METRICS (NEW)
  portfolio_risk?: {
    n_active_positions: number;
    avg_pairwise_correlation: number;
    max_correlation: number;
    effective_positions: number;
    diversification_ratio: number;
    correlation_drag: number;
    total_portfolio_vol: number;
    largest_risk_contributor: string;
    largest_risk_pct: number;
    concentration_score: number;
    positions_capped_by_correlation: number;
    regime_concentration: Record<string, number>;
    dominant_regime: string;
    regime_diversification: number;
    risk_narrative: string;
  };
  
  avg_conviction?: number;
  avg_cvar?: number;
  market_regime_us?: string;
  market_regime_in?: string;
  
  // Legacy format fields (for backwards compatibility)
  market?: string;
  universe?: string;
  start_date?: string;
  end_date?: string;
  initial_capital?: number;
  final_capital?: number;
  total_return?: number;
  cagr?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  volatility?: number;
  time_in_cash_pct?: number;
  avg_positions?: number;
  total_trades?: number;
  win_rate?: number;
  avg_win?: number;
  avg_loss?: number;
  profit_factor?: number;
  tickers_included?: number;
  computation_time_sec?: number;
  regime_performance?: Record<string, {trades: number; win_rate: number; avg_return: number}>;
  equity_curve?: Array<{date: string; equity: number; cash_pct?: number}>;
  drawdown_curve?: Array<{date: string; drawdown: number}>;
  regime_exposure_over_time?: Array<Record<string, any>>;
  stress_narrative?: {
    worst_30d_return: string;
    worst_30d_date: string | null;
    action_taken: string;
    recovery_approach?: string;
  };
  key_insight?: string;
  methodology?: string;
  disclaimer?: string;
  config?: Record<string, any>;
}

const MARKETS = [
  { value: 'US', label: 'US Equities', description: 'S&P 500 + NASDAQ' },
  { value: 'IN', label: 'India', description: 'NSE + BSE' },
];

const UNIVERSES = {
  'US': [
    { value: 'ALL', label: 'All Available', description: 'All stocks with data' },
    { value: 'SP500', label: 'S&P 500', description: 'Large cap US' },
    { value: 'NASDAQ100', label: 'NASDAQ 100', description: 'Tech-heavy' },
  ],
  'IN': [
    { value: 'ALL', label: 'All Available', description: 'All stocks with data' },
    { value: 'NIFTY50', label: 'NIFTY 50', description: 'Large cap India' },
    { value: 'NIFTY100', label: 'NIFTY 100', description: 'Mid + Large cap' },
  ],
};

export default function PortfolioSimulatorPage() {
  const navigate = useNavigate();
  
  // Config state
  const [market, setMarket] = useState('US');
  const [universe, setUniverse] = useState('ALL');
  
  // Result state
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  
  // Top stocks from intelligence
  const [topOpportunities, setTopOpportunities] = useState<Array<{
    rank: number;
    ticker: string;
    edge_score: number;
    intent: string;
    conviction: number;
    conviction_pct?: number;
    regime: string;
    cvar_95: number;
    risk_summary: string;
  }>>([]);
  const [topAvoids, setTopAvoids] = useState<Array<{
    rank: number;
    ticker: string;
    intent: string;
    conviction: number;
    conviction_pct?: number;
    cvar_95: number;
    regime: string;
    why_avoid: string;
  }>>([]);
  const [opportunitiesMetadata, setOpportunitiesMetadata] = useState<{
    total_stocks: number;
    initiate_candidates: number;
    avoid_candidates: number;
    intent_counts: Record<string, number>;
  } | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(false);
  
  // UI state
  const [showMethodology, setShowMethodology] = useState(true);
  const [activeTab, setActiveTab] = useState<'equity' | 'drawdown' | 'regime'>('equity');

  // Load snapshot on market/universe change
  useEffect(() => {
    loadSnapshot();
    loadTopStocks();
  }, [market, universe]);

  // Load top INITIATE and AVOID stocks from pre-computed file
  const loadTopStocks = async () => {
    setLoadingStocks(true);
    try {
      const response = await api.get(`/api/top-opportunities/${market}`);
      
      if (response.data?.success) {
        setTopOpportunities(response.data.opportunities || []);
        setTopAvoids(response.data.avoid_list || []);
        setOpportunitiesMetadata({
          total_stocks: response.data.total_stocks || 0,
          initiate_candidates: response.data.initiate_candidates || 0,
          avoid_candidates: response.data.avoid_candidates || 0,
          intent_counts: response.data.intent_counts || {},
        });
      } else {
        console.error('Top opportunities not available:', response.data?.error);
        setTopOpportunities([]);
        setTopAvoids([]);
        setOpportunitiesMetadata(null);
      }
    } catch (err) {
      console.error('Failed to load top opportunities:', err);
      setTopOpportunities([]);
      setTopAvoids([]);
      setOpportunitiesMetadata(null);
    } finally {
      setLoadingStocks(false);
    }
  };

  const loadSnapshot = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.getPortfolioSnapshot(market, universe);
      
      if (response.success && response.data) {
        setSnapshot(response.data);
        setVersion(response.version);
        setLastUpdated(response.last_updated || response.data.as_of_date);
      } else {
        setError(response.error || 'No snapshot available for this selection.');
        setSnapshot(null);
      }
    } catch (err) {
      setError('Failed to load snapshot. Please try again.');
      setSnapshot(null);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-bloomberg-dark text-bloomberg-text">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border-b border-bloomberg-border">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Portfolio Intelligence
                </h1>
                <p className="text-bloomberg-text-muted mt-1">
                  Precomputed daily snapshots • Updated automatically
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lastUpdated && (
                <div className="flex items-center gap-2 text-sm text-bloomberg-text-muted">
                  <Clock size={16} />
                  <span>Last updated: {lastUpdated}</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-600/50 rounded-lg px-4 py-2">
                <Shield size={18} className="text-amber-400" />
                <span className="text-sm text-amber-300">Risk-First Approach</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Methodology Section - Always visible */}
        <div className="mb-8 bg-bloomberg-panel border border-bloomberg-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info size={20} className="text-indigo-400" />
              <span className="font-semibold">How This Works</span>
            </div>
            {showMethodology ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          
          {showMethodology && (
            <div className="px-6 pb-6 border-t border-bloomberg-border pt-4 space-y-4">
              <p className="text-bloomberg-text-muted">
                We do not predict prices or run live simulations. All insights are generated daily 
                using the same decision rules shown on each stock page. The system increases exposure 
                only when historical data shows consistent edge in similar market regimes. During 
                uncertainty or elevated risk, capital is reduced or held in cash.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-indigo-400">What We Do</h4>
                  <ul className="space-y-2 text-sm text-bloomberg-text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      Follow rules-based decision logic consistently
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      Add positions only when data shows consistent edge
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      Reduce exposure when uncertainty increases
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      Maintain minimum 20% cash floor at all times
                    </li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-red-400">What We Don't Do</h4>
                  <ul className="space-y-2 text-sm text-bloomberg-text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-red-400">✗</span>
                      Predict prices or optimize for hindsight
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400">✗</span>
                      Use future information in any decision
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400">✗</span>
                      Chase momentum without regime confirmation
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400">✗</span>
                      Guarantee any future performance
                    </li>
                  </ul>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-200">
                    <strong>Important:</strong> This is historical system behavior, not a guarantee 
                    of future performance. Past results do not predict future outcomes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Universe Selection - Simplified */}
        <div className="mb-8 bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calendar size={20} className="text-indigo-400" />
              Select Universe
            </h3>
            {version && (
              <span className="text-xs text-bloomberg-text-muted bg-bloomberg-dark px-2 py-1 rounded">
                {version}
              </span>
            )}
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Market */}
            <div>
              <label className="block text-sm text-bloomberg-text-muted mb-2">Market</label>
              <select
                value={market}
                onChange={(e) => {
                  setMarket(e.target.value);
                  setUniverse('ALL');
                }}
                className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-3 py-2.5 text-bloomberg-text focus:border-indigo-500 focus:outline-none"
              >
                {MARKETS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Universe */}
            <div>
              <label className="block text-sm text-bloomberg-text-muted mb-2">Universe</label>
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-3 py-2.5 text-bloomberg-text focus:border-indigo-500 focus:outline-none"
              >
                {UNIVERSES[market as keyof typeof UNIVERSES]?.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-900/30 mb-6">
              <RefreshCw size={40} className="text-indigo-400 animate-spin" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Loading Snapshot...</h3>
            <p className="text-bloomberg-text-muted">
              Fetching precomputed intelligence for {market} / {universe}
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-900/30 mb-6">
              <AlertTriangle size={40} className="text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Snapshot Not Available</h3>
            <p className="text-bloomberg-text-muted max-w-md mx-auto mb-4">
              {error}
            </p>
            <p className="text-sm text-bloomberg-text-muted">
              Try selecting a different market or universe. Snapshots are generated daily.
            </p>
          </div>
        )}

        {/* Results */}
        {snapshot && !loading && (
          <div className="space-y-6">
            {/* Check if we have the new v2.0 format or legacy format */}
            {snapshot.n_stocks_analyzed !== undefined ? (
              /* NEW v2.0 FORMAT - Daily Intelligence Snapshot */
              <>
                {/* Period Info */}
                <div className="flex items-center justify-between text-sm text-bloomberg-text-muted bg-bloomberg-panel border border-bloomberg-border rounded-lg px-4 py-2">
                  <span>Snapshot Date: {snapshot.as_of_date || snapshot.generated_at?.split('T')[0]}</span>
                  <span>Stocks Analyzed: {snapshot.n_stocks_analyzed}</span>
                  <span>Version: {snapshot.version}</span>
                </div>

                {/* Intent Distribution */}
                <div className="grid md:grid-cols-5 gap-4">
                  {[
                    { key: 'INITIATE', label: 'Initiate', color: 'emerald', icon: TrendingUp },
                    { key: 'HOLD', label: 'Hold', color: 'blue', icon: Activity },
                    { key: 'AVOID', label: 'Avoid', color: 'red', icon: AlertTriangle },
                    { key: 'REDUCE', label: 'Reduce', color: 'amber', icon: TrendingDown },
                    { key: 'EXIT', label: 'Exit', color: 'red', icon: AlertTriangle },
                  ].map(item => (
                    <div key={item.key} className={`bg-bloomberg-panel border border-bloomberg-border rounded-xl p-5`}>
                      <div className="flex items-center gap-2 text-bloomberg-text-muted mb-2">
                        <item.icon size={16} className={`text-${item.color}-400`} />
                        <span className="text-sm">{item.label}</span>
                      </div>
                      <div className={`text-3xl font-bold text-${item.color}-400`}>
                        {snapshot.intents?.[item.key as keyof typeof snapshot.intents] || 0}
                      </div>
                      <div className="text-xs text-bloomberg-text-muted mt-1">stocks</div>
                    </div>
                  ))}
                </div>

                {/* Market Regimes */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4">Market Regimes</h4>
                    <div className="space-y-3">
                      {snapshot.market_regime_us && (
                        <div className="flex justify-between items-center">
                          <span className="text-bloomberg-text-muted">🇺🇸 US Market</span>
                          <span className="capitalize font-semibold">{snapshot.market_regime_us}</span>
                        </div>
                      )}
                      {snapshot.market_regime_in && (
                        <div className="flex justify-between items-center">
                          <span className="text-bloomberg-text-muted">🇮🇳 India Market</span>
                          <span className="capitalize font-semibold">{snapshot.market_regime_in}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4">Aggregate Metrics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-bloomberg-text-muted">Avg Conviction</span>
                        <span className="font-semibold">{((snapshot.avg_conviction || 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-bloomberg-text-muted">Avg CVaR (95%)</span>
                        <span className="font-semibold text-red-400">{((snapshot.avg_cvar || 0) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Regime Distribution */}
                {snapshot.regimes && Object.keys(snapshot.regimes).length > 0 && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <PieChart size={20} className="text-purple-400" />
                      Regime Distribution
                    </h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                      {Object.entries(snapshot.regimes).map(([regime, count]) => (
                        <div key={regime} className="text-center">
                          <div className="text-2xl font-bold">{count}</div>
                          <div className="text-sm text-bloomberg-text-muted capitalize">{regime}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CORRELATION-AWARE RISK METRICS (NEW) */}
                {snapshot.portfolio_risk && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Shield size={20} className="text-cyan-400" />
                      Correlation-Aware Risk Analysis
                    </h4>
                    
                    <div className="grid md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-bloomberg-dark rounded-lg p-4">
                        <div className="text-sm text-bloomberg-text-muted mb-1">Effective Positions</div>
                        <div className="text-2xl font-bold text-cyan-400">
                          {snapshot.portfolio_risk.effective_positions?.toFixed(1) || 'N/A'}
                        </div>
                        <div className="text-xs text-bloomberg-text-muted mt-1">
                          of {snapshot.portfolio_risk.n_active_positions || 0} actual
                        </div>
                      </div>
                      
                      <div className="bg-bloomberg-dark rounded-lg p-4">
                        <div className="text-sm text-bloomberg-text-muted mb-1">Avg Correlation</div>
                        <div className={`text-2xl font-bold ${(snapshot.portfolio_risk.avg_pairwise_correlation || 0) > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {((snapshot.portfolio_risk.avg_pairwise_correlation || 0) * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-bloomberg-text-muted mt-1">
                          {(snapshot.portfolio_risk.avg_pairwise_correlation || 0) > 0.6 ? 'High' : (snapshot.portfolio_risk.avg_pairwise_correlation || 0) > 0.4 ? 'Moderate' : 'Low'}
                        </div>
                      </div>
                      
                      <div className="bg-bloomberg-dark rounded-lg p-4">
                        <div className="text-sm text-bloomberg-text-muted mb-1">Diversification Ratio</div>
                        <div className="text-2xl font-bold text-purple-400">
                          {snapshot.portfolio_risk.diversification_ratio?.toFixed(2) || 'N/A'}
                        </div>
                        <div className="text-xs text-bloomberg-text-muted mt-1">
                          &gt;1 = diversification benefit
                        </div>
                      </div>
                      
                      <div className="bg-bloomberg-dark rounded-lg p-4">
                        <div className="text-sm text-bloomberg-text-muted mb-1">Correlation Drag</div>
                        <div className={`text-2xl font-bold ${(snapshot.portfolio_risk.correlation_drag || 0) > 0.2 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {((snapshot.portfolio_risk.correlation_drag || 0) * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-bloomberg-text-muted mt-1">
                          risk from correlation
                        </div>
                      </div>
                    </div>
                    
                    {/* Risk Narrative */}
                    {snapshot.portfolio_risk.risk_narrative && (
                      <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4 text-sm text-cyan-300">
                        <strong>📊 Risk Insight:</strong> {snapshot.portfolio_risk.risk_narrative}
                      </div>
                    )}
                    
                    {/* Largest Risk Contributor */}
                    {snapshot.portfolio_risk.largest_risk_contributor && (
                      <div className="mt-4 text-sm text-bloomberg-text-muted">
                        <span className="text-bloomberg-text">Largest risk contributor:</span>{' '}
                        <span className="font-semibold text-amber-400">{snapshot.portfolio_risk.largest_risk_contributor}</span>
                        {' '}({((snapshot.portfolio_risk.largest_risk_pct || 0) * 100).toFixed(0)}% of total risk)
                      </div>
                    )}
                  </div>
                )}

                {/* Top Opportunities */}
                {snapshot.top_opportunities && snapshot.top_opportunities.length > 0 && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <TrendingUp size={20} className="text-emerald-400" />
                      Top Opportunities (INITIATE)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-bloomberg-text-muted text-left">
                            <th className="pb-3">Ticker</th>
                            <th className="pb-3">Market</th>
                            <th className="pb-3">Conviction</th>
                            <th className="pb-3">Regime</th>
                            <th className="pb-3">Signal Agree</th>
                            <th className="pb-3">Risk/Reward</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.top_opportunities.map((opp, i) => (
                            <tr key={i} className="border-t border-bloomberg-border">
                              <td className="py-3 font-semibold">{opp.ticker}</td>
                              <td className="py-3">{opp.market}</td>
                              <td className="py-3 text-emerald-400">{(opp.conviction_pct ?? opp.conviction * 100).toFixed(1)}%</td>
                              <td className="py-3 capitalize">{opp.asset_regime}</td>
                              <td className="py-3">{(opp.signal_agreement * 100).toFixed(0)}%</td>
                              <td className="py-3">{opp.risk_reward?.toFixed(2) || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Top Avoids - What the System Protected Against */}
                {snapshot.top_avoids && snapshot.top_avoids.length > 0 && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-red-400" />
                      What the System Avoided
                    </h4>
                    <p className="text-sm text-bloomberg-text-muted mb-4">
                      These stocks were flagged as AVOID due to unfavorable risk/reward or misaligned signals.
                    </p>
                    <div className="space-y-3">
                      {snapshot.top_avoids.slice(0, 5).map((avoid, i) => (
                        <div key={i} className="flex justify-between items-center bg-red-900/10 border border-red-500/20 rounded-lg p-3">
                          <div>
                            <span className="font-semibold">{avoid.ticker}</span>
                            <span className="text-bloomberg-text-muted ml-2 text-sm">({avoid.market})</span>
                            <span className="text-red-400 ml-2 text-sm capitalize">{avoid.asset_regime}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-red-400 text-sm">CVaR: {((avoid.cvar_95 || 0) * 100).toFixed(1)}%</div>
                            <div className="text-xs text-bloomberg-text-muted">Conv: {((avoid.conviction || 0) * 100).toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Insight */}
                <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-xl p-6">
                  <h4 className="font-semibold text-indigo-300 mb-3">System Status</h4>
                  <p className="text-lg text-bloomberg-text">
                    Analyzed {snapshot.n_stocks_analyzed} stocks. 
                    {snapshot.intents?.INITIATE} showing favorable conditions for new positions, 
                    {snapshot.intents?.AVOID} flagged as avoid due to elevated risk or weak signals.
                  </p>
                </div>
              </>
            ) : (
              /* LEGACY FORMAT - Full Simulation Results */
              <>
                {/* Period Info */}
                <div className="flex items-center justify-between text-sm text-bloomberg-text-muted bg-bloomberg-panel border border-bloomberg-border rounded-lg px-4 py-2">
                  <span>Simulation Period: {snapshot.start_date} to {snapshot.end_date}</span>
                  <span>Initial Capital: {formatCurrency(snapshot.initial_capital || 1000000)}</span>
                  <span>Tickers Analyzed: {snapshot.tickers_included || 'N/A'}</span>
                </div>

                {/* Headline Metrics */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <div className="flex items-center gap-2 text-bloomberg-text-muted mb-2">
                      <TrendingUp size={18} className="text-green-400" />
                      <span className="text-sm">CAGR</span>
                    </div>
                    <div className={`text-3xl font-bold ${(snapshot.cagr || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(snapshot.cagr || 0)}
                    </div>
                    <div className="text-xs text-bloomberg-text-muted mt-1">Compound Annual Growth</div>
                  </div>

                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <div className="flex items-center gap-2 text-bloomberg-text-muted mb-2">
                      <TrendingDown size={18} className="text-red-400" />
                      <span className="text-sm">Max Drawdown</span>
                    </div>
                    <div className="text-3xl font-bold text-red-400">{formatPercent(snapshot.max_drawdown || 0)}</div>
                    <div className="text-xs text-bloomberg-text-muted mt-1">Largest Peak-to-Trough</div>
                  </div>

                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <div className="flex items-center gap-2 text-bloomberg-text-muted mb-2">
                      <BarChart3 size={18} className="text-indigo-400" />
                      <span className="text-sm">Sharpe Ratio</span>
                    </div>
                    <div className="text-3xl font-bold text-indigo-400">{(snapshot.sharpe_ratio || 0).toFixed(2)}</div>
                    <div className="text-xs text-bloomberg-text-muted mt-1">Risk-Adjusted Return</div>
                  </div>

                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <div className="flex items-center gap-2 text-bloomberg-text-muted mb-2">
                      <DollarSign size={18} className="text-amber-400" />
                      <span className="text-sm">Time in Cash</span>
                    </div>
                    <div className="text-3xl font-bold text-amber-400">{formatPercent(snapshot.time_in_cash_pct || 0)}</div>
                    <div className="text-xs text-bloomberg-text-muted mt-1">Capital Preservation</div>
                  </div>
                </div>

                {/* Key Insight */}
                {snapshot.key_insight && (
                  <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-xl p-6">
                    <h4 className="font-semibold text-indigo-300 mb-3">Key Insight</h4>
                    <p className="text-lg text-bloomberg-text">{snapshot.key_insight}</p>
                  </div>
                )}

                {/* Top INITIATE and AVOID Stocks */}
                {opportunitiesMetadata && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-bloomberg-text-muted">Signal Distribution ({opportunitiesMetadata.total_stocks} stocks analyzed)</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-400">
                          INITIATE: {opportunitiesMetadata.initiate_candidates}
                        </span>
                        <span className="text-blue-400">
                          HOLD: {opportunitiesMetadata.intent_counts?.HOLD || 0}
                        </span>
                        <span className="text-red-400">
                          AVOID: {opportunitiesMetadata.avoid_candidates}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Top INITIATE Stocks */}
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <TrendingUp size={20} className="text-emerald-400" />
                      Best Opportunities (INITIATE)
                      {topOpportunities.length > 0 && (
                        <span className="text-xs text-bloomberg-text-muted ml-auto">
                          Top {topOpportunities.length} by Edge Score
                        </span>
                      )}
                    </h4>
                    {loadingStocks ? (
                      <div className="text-center py-8 text-bloomberg-text-muted">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                        Loading...
                      </div>
                    ) : topOpportunities.length > 0 ? (
                      <div className="space-y-2">
                        {topOpportunities.slice(0, 10).map((stock) => (
                          <div 
                            key={stock.ticker}
                            onClick={() => navigate(`/stock-intelligence/${market}/${stock.ticker}`)}
                            className="flex items-center justify-between p-3 bg-emerald-900/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-900/20 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-400 font-bold text-sm w-5">#{stock.rank}</span>
                              <div>
                                <span className="font-semibold">{stock.ticker.replace('.NS', '')}</span>
                                <span className="text-xs text-bloomberg-text-muted ml-2 capitalize">{stock.regime}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-emerald-400 font-semibold">{(stock.conviction_pct ?? stock.conviction * 100).toFixed(1)}%</div>
                              <div className="text-xs text-bloomberg-text-muted">Edge: {stock.edge_score?.toFixed(2)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-bloomberg-text-muted">
                        No INITIATE signals found for {market}
                        {opportunitiesMetadata && (
                          <p className="text-xs mt-2">
                            ({opportunitiesMetadata.initiate_candidates} candidates, none meet ranking criteria)
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Top AVOID Stocks */}
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-red-400" />
                      What System Avoids
                      {topAvoids.length > 0 && (
                        <span className="text-xs text-bloomberg-text-muted ml-auto">
                          Top {topAvoids.length} by Risk
                        </span>
                      )}
                    </h4>
                    {loadingStocks ? (
                      <div className="text-center py-8 text-bloomberg-text-muted">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                        Loading...
                      </div>
                    ) : topAvoids.length > 0 ? (
                      <div className="space-y-2">
                        {topAvoids.slice(0, 10).map((stock) => (
                          <div 
                            key={stock.ticker}
                            onClick={() => navigate(`/stock-intelligence/${market}/${stock.ticker}`)}
                            className="flex items-center justify-between p-3 bg-red-900/10 border border-red-500/20 rounded-lg hover:bg-red-900/20 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-red-400 font-bold text-sm w-5">#{stock.rank}</span>
                              <div>
                                <span className="font-semibold">{stock.ticker.replace('.NS', '')}</span>
                                <span className="text-xs text-bloomberg-text-muted ml-2 capitalize">{stock.regime}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-red-400 font-semibold">{(Math.abs(stock.cvar_95 || 0) * 100).toFixed(1)}%</div>
                              <div className="text-xs text-bloomberg-text-muted">CVaR risk</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-bloomberg-text-muted">
                        No AVOID signals found for {market}
                        {opportunitiesMetadata && (
                          <p className="text-xs mt-2">
                            ({opportunitiesMetadata.avoid_candidates} AVOID stocks in universe)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stress Narrative */}
                {snapshot.stress_narrative && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-6">
                      <h5 className="text-sm text-red-400 font-semibold mb-2 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        Worst 30-Day Period
                      </h5>
                      <div className="text-2xl font-bold text-red-400 mb-2">
                        {snapshot.stress_narrative.worst_30d_return}
                      </div>
                      {snapshot.stress_narrative.worst_30d_date && (
                        <p className="text-sm text-bloomberg-text-muted mb-2">
                          Occurred around {snapshot.stress_narrative.worst_30d_date}
                        </p>
                      )}
                      <p className="text-sm text-bloomberg-text-muted">
                        {snapshot.stress_narrative.action_taken}
                      </p>
                    </div>
                    <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-6">
                      <h5 className="text-sm text-green-400 font-semibold mb-2 flex items-center gap-2">
                        <Shield size={16} />
                        Recovery Approach
                      </h5>
                      <p className="text-bloomberg-text-muted">
                        {snapshot.stress_narrative.recovery_approach || 
                         'Positions rebuilt gradually as regime confidence improved.'}
                      </p>
                      {snapshot.final_capital && (
                        <div className="mt-4">
                          <div className="text-sm text-bloomberg-text-muted">Final Capital</div>
                          <div className="text-xl font-bold text-green-400">
                            {formatCurrency(snapshot.final_capital)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Charts Tab Navigation - only show if we have data */}
                {(snapshot.equity_curve?.length || snapshot.drawdown_curve?.length || snapshot.regime_performance) && (
                  <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl overflow-hidden">
                    <div className="flex border-b border-bloomberg-border">
                      {[
                        { key: 'equity', label: 'Equity Curve', icon: TrendingUp },
                        { key: 'drawdown', label: 'Drawdown', icon: TrendingDown },
                        { key: 'regime', label: 'Regime Performance', icon: PieChart },
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key as typeof activeTab)}
                          className={`flex-1 px-6 py-4 flex items-center justify-center gap-2 transition-colors ${
                            activeTab === tab.key
                              ? 'bg-indigo-500/20 text-indigo-400 border-b-2 border-indigo-500'
                              : 'text-bloomberg-text-muted hover:bg-white/5'
                          }`}
                        >
                          <tab.icon size={18} />
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="p-6">
                      {activeTab === 'equity' && snapshot.equity_curve && snapshot.equity_curve.length > 0 && (
                        <div className="h-80">
                          <EquityChart data={snapshot.equity_curve} initialCapital={snapshot.initial_capital || 1000000} />
                        </div>
                      )}

                      {activeTab === 'drawdown' && snapshot.drawdown_curve && snapshot.drawdown_curve.length > 0 && (
                        <div className="h-80">
                          <DrawdownChart data={snapshot.drawdown_curve} />
                        </div>
                      )}

                      {activeTab === 'regime' && snapshot.regime_performance && (
                        <div className="grid md:grid-cols-3 gap-4">
                          {Object.entries(snapshot.regime_performance).map(([regime, perf]) => (
                            <div 
                              key={regime}
                              className="bg-bloomberg-dark border border-bloomberg-border rounded-lg p-4"
                            >
                              <h5 className="font-semibold capitalize mb-3">{regime}</h5>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-bloomberg-text-muted">Trades</span>
                                  <span>{perf.trades}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-bloomberg-text-muted">Win Rate</span>
                                  <span className={perf.win_rate > 0.5 ? 'text-green-400' : 'text-red-400'}>
                                    {formatPercent(perf.win_rate)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-bloomberg-text-muted">Avg Return</span>
                                  <span className={perf.avg_return > 0 ? 'text-green-400' : 'text-red-400'}>
                                    {formatPercent(perf.avg_return)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Trade Statistics - only show if available */}
                {(snapshot.total_trades || snapshot.win_rate) && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-green-400" />
                        Trade Statistics
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Total Trades</div>
                          <div className="text-xl font-semibold">{snapshot.total_trades || 0}</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Win Rate</div>
                          <div className={`text-xl font-semibold ${(snapshot.win_rate || 0) > 0.5 ? 'text-green-400' : 'text-amber-400'}`}>
                            {formatPercent(snapshot.win_rate || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Avg Win</div>
                          <div className="text-xl font-semibold text-green-400">
                            +{formatPercent(snapshot.avg_win || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Avg Loss</div>
                          <div className="text-xl font-semibold text-red-400">
                            {formatPercent(snapshot.avg_loss || 0)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-bloomberg-panel border border-bloomberg-border rounded-xl p-6">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 size={20} className="text-indigo-400" />
                        Risk Metrics
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Volatility</div>
                          <div className="text-xl font-semibold">{formatPercent(snapshot.volatility || 0)}</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Sortino Ratio</div>
                          <div className="text-xl font-semibold text-indigo-400">
                            {(snapshot.sortino_ratio || 0).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Profit Factor</div>
                          <div className="text-xl font-semibold">
                            {(snapshot.profit_factor || 0).toFixed(2)}x
                          </div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted text-sm">Avg Positions</div>
                          <div className="text-xl font-semibold">
                            {(snapshot.avg_positions || 0).toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Disclaimer */}
            <div className="text-center text-sm text-bloomberg-text-muted py-4 border-t border-bloomberg-border">
              {snapshot.disclaimer || "This is historical system behavior, not a guarantee of future performance. Past results do not predict future outcomes."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple Equity Chart Component - FIXED path rendering
function EquityChart({ data, initialCapital }: { data: Array<{date: string; equity: number}>; initialCapital: number }) {
  if (data.length === 0) return <div className="text-center text-bloomberg-text-muted">No data available</div>;

  const maxEquity = Math.max(...data.map(d => d.equity));
  const minEquity = Math.min(...data.map(d => d.equity));
  const range = maxEquity - minEquity || 1;

  // Build path string correctly
  const pathData = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 1000 : 500;
    const y = 300 - ((d.equity - minEquity) / range) * 260 - 20;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const initialY = 300 - ((initialCapital - minEquity) / range) * 260 - 20;

  return (
    <div className="relative h-full">
      <svg viewBox="0 0 1000 300" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line
            key={pct}
            x1="0" y1={20 + pct * 260}
            x2="1000" y2={20 + pct * 260}
            stroke="#333" strokeWidth="1"
          />
        ))}
        
        {/* Equity line */}
        <path
          d={pathData}
          fill="none"
          stroke="url(#equityGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Initial capital line */}
        <line
          x1="0" y1={initialY}
          x2="1000" y2={initialY}
          stroke="#666" strokeWidth="1" strokeDasharray="5,5"
        />
        
        <defs>
          <linearGradient id="equityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Labels */}
      <div className="absolute top-2 right-2 text-sm font-semibold text-indigo-400">
        Final: ${data[data.length - 1]?.equity.toLocaleString(undefined, {maximumFractionDigits: 0})}
      </div>
      <div className="absolute top-2 left-2 text-sm text-bloomberg-text-muted">
        Start: ${data[0]?.equity.toLocaleString(undefined, {maximumFractionDigits: 0})}
      </div>
      <div className="absolute bottom-2 left-2 text-xs text-bloomberg-text-muted">
        {data[0]?.date}
      </div>
      <div className="absolute bottom-2 right-2 text-xs text-bloomberg-text-muted">
        {data[data.length - 1]?.date}
      </div>
    </div>
  );
}

// Simple Drawdown Chart Component - FIXED path rendering
function DrawdownChart({ data }: { data: Array<{date: string; drawdown: number}> }) {
  if (data.length === 0) return <div className="text-center text-bloomberg-text-muted">No data available</div>;

  const minDrawdown = Math.min(...data.map(d => d.drawdown));
  const maxDrawdown = Math.max(0, ...data.map(d => d.drawdown));
  const range = maxDrawdown - minDrawdown || 0.1;

  // Build path strings correctly
  const linePath = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 1000 : 500;
    const y = 20 + ((maxDrawdown - d.drawdown) / range) * 260;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Area path (for fill)
  const areaPath = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 1000 : 500;
    const y = 20 + ((maxDrawdown - d.drawdown) / range) * 260;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') + ` L 1000 20 L 0 20 Z`;

  return (
    <div className="relative h-full">
      <svg viewBox="0 0 1000 300" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Zero line */}
        <line x1="0" y1="20" x2="1000" y2="20" stroke="#666" strokeWidth="1" />
        
        {/* Drawdown area */}
        <path
          d={areaPath}
          fill="url(#ddGradient)"
          fillOpacity="0.4"
        />
        
        {/* Drawdown line */}
        <path
          d={linePath}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        <defs>
          <linearGradient id="ddGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Labels */}
      <div className="absolute top-2 right-2 text-sm font-semibold text-red-400">
        Max: {(minDrawdown * 100).toFixed(1)}%
      </div>
      <div className="absolute top-2 left-2 text-xs text-bloomberg-text-muted">
        0%
      </div>
      <div className="absolute bottom-2 left-2 text-xs text-bloomberg-text-muted">
        {data[0]?.date}
      </div>
      <div className="absolute bottom-2 right-2 text-xs text-bloomberg-text-muted">
        {data[data.length - 1]?.date}
      </div>
    </div>
  );
}