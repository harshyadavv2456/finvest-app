/**
 * Portfolio Analyzer Page
 * Track your portfolio with smart money alerts
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Briefcase, Plus, Trash2,
  AlertTriangle, CheckCircle, PieChart, Target,
  RefreshCw, Search
} from 'lucide-react';
import { api } from '../lib/api';

interface Position {
  ticker: string;
  shares: number;
  cost_basis: number;
}

interface AnalyzedPosition {
  ticker: string;
  shares: number;
  cost_basis: number;
  current_price: number | null;
  position_value: number;
  position_cost: number;
  pnl: number;
  pnl_pct: number;
  pe_ratio: number | null;
  market_cap: number | null;
  sector: string;
  insider_alert: {
    type: string;
    message: string;
  } | null;
}

interface PortfolioAnalysis {
  portfolio_name: string;
  summary: {
    total_value: number;
    total_cost: number;
    total_pnl: number;
    total_pnl_pct: number;
    position_count: number;
    winning_positions: number;
    losing_positions: number;
  };
  positions: AnalyzedPosition[];
  sector_allocation: Record<string, number>;
  risk_metrics: {
    concentration_risk: string;
    top_position_pct: number;
    sector_count: number;
  };
  smart_money_alerts: {
    warnings: string[];
    opportunities: string[];
  };
}

interface SmartPick {
  ticker: string;
  total_buy_value: number;
  unique_insiders: number;
  last_buy_date: string;
  signal_strength: number;
  pick_reason: string;
}

export default function PortfolioAnalyzerPage() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<Position[]>([
    { ticker: 'AAPL', shares: 100, cost_basis: 150 },
    { ticker: 'GOOGL', shares: 50, cost_basis: 140 },
    { ticker: 'MSFT', shares: 75, cost_basis: 380 },
  ]);
  const [newPosition, setNewPosition] = useState({ ticker: '', shares: '', cost_basis: '' });
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [smartPicks, setSmartPicks] = useState<SmartPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'smart-picks'>('portfolio');

  const addPosition = () => {
    if (newPosition.ticker && newPosition.shares && newPosition.cost_basis) {
      setPositions([
        ...positions,
        {
          ticker: newPosition.ticker.toUpperCase(),
          shares: parseFloat(newPosition.shares),
          cost_basis: parseFloat(newPosition.cost_basis),
        }
      ]);
      setNewPosition({ ticker: '', shares: '', cost_basis: '' });
    }
  };

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index));
  };

  const analyzePortfolio = async () => {
    if (positions.length === 0) return;

    setLoading(true);
    try {
      const res = await api.post('/api/portfolio/analyze', {
        name: 'My Portfolio',
        positions: positions,
      });
      setAnalysis(res.data);
    } catch (err) {
      console.error('Error analyzing portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSmartPicks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/portfolio/smart-picks');
      setSmartPicks(res.data.picks || []);
    } catch (err) {
      console.error('Error fetching smart picks:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(2)}K`;
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border-b border-emerald-500/20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate('/')}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Back to Screener</span>
          </button>
          
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <Briefcase className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Portfolio Analyzer</h1>
              <p className="text-emerald-400/80">Track your holdings with smart money alerts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b border-gray-800 mb-6">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-3 rounded-t-lg font-medium transition-all ${
              activeTab === 'portfolio'
                ? 'bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            📊 My Portfolio
          </button>
          <button
            onClick={() => {
              setActiveTab('smart-picks');
              if (smartPicks.length === 0) fetchSmartPicks();
            }}
            className={`px-4 py-3 rounded-t-lg font-medium transition-all ${
              activeTab === 'smart-picks'
                ? 'bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🎯 Smart Picks
          </button>
        </div>

        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Positions Input */}
            <div className="lg:col-span-2 space-y-6">
              {/* Add Position */}
              <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Plus className="text-emerald-400" />
                  Add Position
                </h3>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <input
                    type="text"
                    placeholder="Ticker (e.g., AAPL)"
                    value={newPosition.ticker}
                    onChange={(e) => setNewPosition({ ...newPosition, ticker: e.target.value.toUpperCase() })}
                    className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Shares"
                    value={newPosition.shares}
                    onChange={(e) => setNewPosition({ ...newPosition, shares: e.target.value })}
                    className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Cost Basis ($)"
                    value={newPosition.cost_basis}
                    onChange={(e) => setNewPosition({ ...newPosition, cost_basis: e.target.value })}
                    className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                
                <button
                  onClick={addPosition}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium transition-colors"
                >
                  Add to Portfolio
                </button>
              </div>

              {/* Current Positions */}
              <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Your Holdings ({positions.length})</h3>
                  <button
                    onClick={analyzePortfolio}
                    disabled={loading || positions.length === 0}
                    className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
                    Analyze
                  </button>
                </div>

                {positions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    Add positions above to get started
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-gray-400 text-sm">
                        <th className="text-left p-2">Ticker</th>
                        <th className="text-right p-2">Shares</th>
                        <th className="text-right p-2">Cost Basis</th>
                        <th className="text-right p-2">Total Cost</th>
                        <th className="text-right p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, i) => (
                        <tr key={i} className="border-t border-gray-800">
                          <td className="p-2 font-medium text-white">{pos.ticker}</td>
                          <td className="p-2 text-right text-gray-300">{pos.shares}</td>
                          <td className="p-2 text-right text-gray-300">${pos.cost_basis}</td>
                          <td className="p-2 text-right text-gray-300">{formatCurrency(pos.shares * pos.cost_basis)}</td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => removePosition(i)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Analysis Results */}
              {analysis && (
                <div className="space-y-6">
                  {/* Analyzed Positions */}
                  <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700">
                      <h3 className="text-lg font-semibold text-white">Position Analysis</h3>
                    </div>
                    <table className="w-full">
                      <thead className="bg-gray-800">
                        <tr className="text-gray-400 text-sm">
                          <th className="text-left p-3">Stock</th>
                          <th className="text-right p-3">Value</th>
                          <th className="text-right p-3">P&L</th>
                          <th className="text-right p-3">P&L %</th>
                          <th className="text-left p-3">Alert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.positions.map((pos, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            <td className="p-3">
                              <div className="font-medium text-white">{pos.ticker}</div>
                              <div className="text-xs text-gray-500">{pos.sector}</div>
                            </td>
                            <td className="p-3 text-right text-white">{formatCurrency(pos.position_value)}</td>
                            <td className={`p-3 text-right ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pos.pnl >= 0 ? '+' : ''}{formatCurrency(pos.pnl)}
                            </td>
                            <td className={`p-3 text-right ${pos.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                            </td>
                            <td className="p-3">
                              {pos.insider_alert && (
                                <span className={`text-xs ${
                                  pos.insider_alert.type === 'warning' ? 'text-red-400' :
                                  pos.insider_alert.type === 'bullish' ? 'text-green-400' :
                                  'text-gray-400'
                                }`}>
                                  {pos.insider_alert.message}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Summary Sidebar */}
            <div className="space-y-6">
              {analysis ? (
                <>
                  {/* Portfolio Summary */}
                  <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <PieChart className="text-emerald-400" />
                      Summary
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Value</span>
                        <span className="text-white font-bold">{formatCurrency(analysis.summary.total_value)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Cost</span>
                        <span className="text-gray-300">{formatCurrency(analysis.summary.total_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total P&L</span>
                        <span className={`font-bold ${analysis.summary.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {analysis.summary.total_pnl >= 0 ? '+' : ''}{formatCurrency(analysis.summary.total_pnl)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Return</span>
                        <span className={`font-bold ${analysis.summary.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {analysis.summary.total_pnl_pct >= 0 ? '+' : ''}{analysis.summary.total_pnl_pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="pt-4 border-t border-gray-700">
                        <div className="flex justify-between text-sm">
                          <span className="text-green-400">✓ Winners: {analysis.summary.winning_positions}</span>
                          <span className="text-red-400">✗ Losers: {analysis.summary.losing_positions}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Smart Money Alerts */}
                  <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Target className="text-amber-400" />
                      Smart Money Alerts
                    </h3>
                    
                    {analysis.smart_money_alerts.warnings.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm text-red-400 mb-2 flex items-center gap-1">
                          <AlertTriangle size={14} />
                          Warnings
                        </h4>
                        {analysis.smart_money_alerts.warnings.map((w, i) => (
                          <div key={i} className="text-sm text-gray-300 p-2 bg-red-500/10 rounded mb-1">
                            {w}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {analysis.smart_money_alerts.opportunities.length > 0 && (
                      <div>
                        <h4 className="text-sm text-green-400 mb-2 flex items-center gap-1">
                          <CheckCircle size={14} />
                          Opportunities
                        </h4>
                        {analysis.smart_money_alerts.opportunities.map((o, i) => (
                          <div key={i} className="text-sm text-gray-300 p-2 bg-green-500/10 rounded mb-1">
                            {o}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {analysis.smart_money_alerts.warnings.length === 0 && 
                     analysis.smart_money_alerts.opportunities.length === 0 && (
                      <p className="text-sm text-gray-400">No significant insider activity in your holdings</p>
                    )}
                  </div>

                  {/* Risk Metrics */}
                  <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Risk Analysis</h3>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Concentration Risk</span>
                        <span className={`font-medium ${
                          analysis.risk_metrics.concentration_risk === 'high' ? 'text-red-400' :
                          analysis.risk_metrics.concentration_risk === 'medium' ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {analysis.risk_metrics.concentration_risk.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Top Position</span>
                        <span className="text-gray-300">{analysis.risk_metrics.top_position_pct.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Sectors</span>
                        <span className="text-gray-300">{analysis.risk_metrics.sector_count}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 text-center">
                  <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">Add positions and click "Analyze" to see portfolio insights</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Smart Picks Tab */}
        {activeTab === 'smart-picks' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-xl border border-amber-500/20 p-6">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                🎯 AI Smart Picks
              </h2>
              <p className="text-gray-400">
                Stocks with multiple insider buys in the last 60 days - highest conviction signals
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin w-8 h-8 text-emerald-400 mx-auto mb-4" />
                <p className="text-gray-400">Loading smart picks...</p>
              </div>
            ) : smartPicks.length === 0 ? (
              <div className="text-center py-12">
                <Target className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">No smart picks available</p>
                <button
                  onClick={fetchSmartPicks}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {smartPicks.map((pick, i) => (
                  <div
                    key={i}
                    className="bg-gray-900 rounded-xl border border-gray-700 p-4 hover:border-emerald-500/50 transition-all cursor-pointer"
                    onClick={() => navigate(`/stock/${pick.ticker}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold text-white">{pick.ticker}</span>
                          <div className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                            Signal: {pick.signal_strength.toFixed(0)}%
                          </div>
                        </div>
                        <p className="text-gray-400 mt-1">{pick.pick_reason}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-400">
                          {formatCurrency(pick.total_buy_value)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Last buy: {pick.last_buy_date}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 flex gap-4 text-sm">
                      <span className="text-emerald-400">
                        👤 {pick.unique_insiders} insiders
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

