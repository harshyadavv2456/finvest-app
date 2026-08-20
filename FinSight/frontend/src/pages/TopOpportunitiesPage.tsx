import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Target,
  Shield,
  AlertTriangle,
  ChevronRight,
  Zap
} from 'lucide-react';

interface OpportunityEntry {
  rank: number;
  ticker: string;
  market: string;
  edge_score: number;
  intent: string;
  conviction: number;
  conviction_pct?: number;
  expected_return_p50: number;
  cvar_95: number;
  regime: string;
  regime_alignment: number;
  risk_summary: string;
  why_this_beats_alternatives: string;
  recommended_position_pct: number;
  max_position_pct: number;
}

interface TopOpportunitiesData {
  market: string;
  generated_at: string;
  version: string;
  total_opportunities: number;
  opportunities: OpportunityEntry[];
}

interface PortfolioIntelligence {
  risk_regime: string;
  market_regime: string;
  capital_deployment_recommended_pct: number;
  cash_hold_recommended_pct: number;
  new_positions_allowed: boolean;
  position_scaling_mode: string;
  max_new_positions_today: number;
  dominant_risk_factor: string;
  portfolio_summary_explanation: string;
  generated_at: string;
}

const getIntentBg = (intent: string): string => {
  switch (intent) {
    case 'INITIATE': return 'bg-emerald-900/40 border-emerald-500/30';
    case 'ADD': return 'bg-green-900/40 border-green-500/30';
    case 'HOLD': return 'bg-blue-900/40 border-blue-500/30';
    default: return 'bg-gray-800/40 border-gray-600/30';
  }
};

const getIntentColor = (intent: string): string => {
  switch (intent) {
    case 'INITIATE': return 'text-emerald-400';
    case 'ADD': return 'text-green-400';
    case 'HOLD': return 'text-blue-400';
    default: return 'text-gray-400';
  }
};

const getRiskRegimeColor = (regime: string): string => {
  switch (regime) {
    case 'low': return 'text-emerald-400';
    case 'moderate': return 'text-amber-400';
    case 'high': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

const getScalingModeColor = (mode: string): string => {
  switch (mode) {
    case 'aggressive': return 'text-emerald-400';
    case 'selective': return 'text-amber-400';
    case 'defensive': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

export default function TopOpportunitiesPage() {
  const navigate = useNavigate();
  const [market, setMarket] = useState<'US' | 'IN'>('US');
  const [opportunities, setOpportunities] = useState<TopOpportunitiesData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch top opportunities
        const oppsResponse = await fetch(`/intelligence/${market}/_top_opportunities.json`);
        if (oppsResponse.ok) {
          const oppsData = await oppsResponse.json();
          setOpportunities(oppsData);
        } else {
          setOpportunities(null);
        }
        
        // Fetch portfolio intelligence
        const portfolioResponse = await fetch(`/intelligence/${market}/_portfolio_intelligence.json`);
        if (portfolioResponse.ok) {
          const portfolioData = await portfolioResponse.json();
          setPortfolio(portfolioData);
        } else {
          setPortfolio(null);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load opportunities data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [market]);

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Target className="text-amber-400" />
                Top Opportunities
              </h1>
              <p className="text-gray-400 mt-1">Edge-based opportunity ranking</p>
            </div>
          </div>
          
          {/* Market Toggle */}
          <div className="flex gap-2 bg-white/5 p-1 rounded-lg">
            {(['US', 'IN'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  market === m 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'US' ? '🇺🇸 US' : '🇮🇳 India'}
              </button>
            ))}
          </div>
        </div>

        {/* Portfolio Overview Panel */}
        {portfolio && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield className="text-blue-400" size={20} />
              Portfolio Control Panel
            </h2>
            
            <div className="grid md:grid-cols-5 gap-4">
              {/* Risk Regime */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Risk Regime</div>
                <div className={`text-xl font-bold uppercase ${getRiskRegimeColor(portfolio.risk_regime)}`}>
                  {portfolio.risk_regime}
                </div>
              </div>
              
              {/* Capital Deployment */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Deploy Capital</div>
                <div className="text-xl font-bold text-white">
                  {(portfolio.capital_deployment_recommended_pct * 100).toFixed(0)}%
                </div>
              </div>
              
              {/* Hold Cash */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Hold Cash</div>
                <div className="text-xl font-bold text-white">
                  {(portfolio.cash_hold_recommended_pct * 100).toFixed(0)}%
                </div>
              </div>
              
              {/* New Positions */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">New Positions</div>
                <div className={`text-xl font-bold ${portfolio.new_positions_allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {portfolio.new_positions_allowed ? `Max ${portfolio.max_new_positions_today}` : 'None'}
                </div>
              </div>
              
              {/* Scaling Mode */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Scaling Mode</div>
                <div className={`text-xl font-bold uppercase ${getScalingModeColor(portfolio.position_scaling_mode)}`}>
                  {portfolio.position_scaling_mode}
                </div>
              </div>
            </div>
            
            {/* Summary */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg">
              <p className="text-sm text-gray-300">{portfolio.portfolio_summary_explanation}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 text-red-400" size={32} />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Opportunities List */}
        {!loading && opportunities && opportunities.opportunities.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="text-amber-400" size={24} />
                Ranked by Edge Score
              </h2>
              <div className="text-sm text-gray-400">
                {opportunities.total_opportunities} opportunities • {new Date(opportunities.generated_at).toLocaleDateString()}
              </div>
            </div>

            {opportunities.opportunities.map((opp) => (
              <div
                key={`${opp.market}-${opp.ticker}`}
                onClick={() => navigate(`/intelligence/${opp.market}/${opp.ticker}`)}
                className={`${getIntentBg(opp.intent)} border rounded-xl p-5 cursor-pointer hover:border-white/30 transition-all group`}
              >
                <div className="flex items-start justify-between">
                  {/* Left Side */}
                  <div className="flex items-start gap-4">
                    {/* Rank */}
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                      <span className="text-xl font-bold text-amber-400">#{opp.rank}</span>
                    </div>
                    
                    {/* Ticker Info */}
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-2xl font-bold">{opp.ticker.replace('.NS', '')}</span>
                        <span className={`px-2 py-1 rounded text-sm font-semibold ${getIntentColor(opp.intent)}`}>
                          {opp.intent}
                        </span>
                        <span className="text-sm text-gray-400 capitalize">
                          {opp.regime}
                        </span>
                      </div>
                      
                      <p className="text-gray-400 text-sm mb-2">{opp.why_this_beats_alternatives}</p>
                      
                      <div className="flex gap-4 text-sm">
                        <span className="text-gray-400">
                          Expected: <span className={opp.expected_return_p50 >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {(opp.expected_return_p50 * 100).toFixed(1)}%
                          </span>
                        </span>
                        <span className="text-gray-400">
                          CVaR: <span className="text-red-400">{(opp.cvar_95 * 100).toFixed(1)}%</span>
                        </span>
                        <span className="text-gray-400">
                          Conviction: <span className="text-white">{(opp.conviction_pct ?? opp.conviction * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right Side */}
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">Edge Score</div>
                    <div className="text-3xl font-bold text-amber-400">{opp.edge_score.toFixed(2)}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Size: {(opp.recommended_position_pct * 100).toFixed(1)}%
                    </div>
                    <ChevronRight className="ml-auto mt-2 text-gray-500 group-hover:text-white transition-colors" size={20} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && (!opportunities || opportunities.opportunities.length === 0) && (
          <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-12 text-center">
            <Target className="mx-auto mb-4 text-gray-600" size={48} />
            <h3 className="text-xl font-bold text-gray-400 mb-2">No Opportunities Available</h3>
            <p className="text-gray-500">Check back after the next pipeline run.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Signals powered by FinSight Intelligence</p>
          <p className="mt-1 text-xs text-gray-600">Edge Score = Risk-adjusted returns × Conviction × Market alignment</p>
        </div>
      </div>
    </div>
  );
}

