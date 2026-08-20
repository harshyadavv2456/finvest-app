/**
 * Hedge Fund Explorer Page
 * Track 145+ institutional investors from 13F filings
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Building2, TrendingUp,
  Search, Eye, ChevronRight,
  Crown, Target
} from 'lucide-react';
import { api } from '../lib/api';

interface HedgeFund {
  cik: string;
  name: string;
  manager: string;
  style: string;
  aum_estimated: number;
  position_count: number;
  last_filing: string;
  new_positions: number;
  increased: number;
  decreased: number;
}

interface FundHolding {
  issuer: string;
  class: string;
  cusip: string;
  value: number;
  shares: number;
  pct_portfolio: number;
  change_type: string;
  delta_value: number;
}

interface FundPortfolio {
  cik: string;
  fund_name: string;
  manager: string;
  style: string;
  filing_date: string;
  total_value: number;
  position_count: number;
  holdings: FundHolding[];
  summary: {
    new: number;
    increased: number;
    decreased: number;
    unchanged: number;
  };
}

interface LegendFund {
  cik: string;
  name: string;
  manager: string;
  style: string;
  aum: number;
  position_count: number;
  top_holdings: { issuer: string; value: number; change_type: string }[];
  filing_date: string;
}

export default function HedgeFundExplorerPage() {
  const navigate = useNavigate();
  const [funds, setFunds] = useState<HedgeFund[]>([]);
  const [legends, setLegends] = useState<LegendFund[]>([]);
  const [selectedFund, setSelectedFund] = useState<FundPortfolio | null>(null);
  const [topMoves, setTopMoves] = useState<any[]>([]);
  const [convergence, setConvergence] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'legends' | 'all' | 'moves' | 'convergence'>('legends');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fundsRes, legendsRes, movesRes, convRes] = await Promise.all([
        api.get('/api/hedge-funds/list'),
        api.get('/api/hedge-funds/legends'),
        api.get('/api/hedge-funds/top-moves?limit=30'),
        api.get('/api/hedge-funds/convergence?min_funds=3'),
      ]);

      setFunds(fundsRes.data.funds || []);
      setLegends(legendsRes.data.legends || []);
      setTopMoves(movesRes.data.moves || []);
      setConvergence(convRes.data.signals || []);
    } catch (err) {
      console.error('Error fetching hedge fund data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFundPortfolio = async (cik: string) => {
    try {
      const res = await api.get(`/api/hedge-funds/portfolio/${cik}?limit=50`);
      setSelectedFund(res.data);
    } catch (err) {
      console.error('Error loading fund portfolio:', err);
    }
  };

  const formatCurrency = (val: number, compact = true) => {
    if (!val) return '$0';
    if (compact) {
      if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
      if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
      if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
      if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(2)}K`;
    }
    return `$${val.toLocaleString()}`;
  };

  const getChangeColor = (type: string) => {
    if (type === 'new' || type === 'increase') return 'text-green-400';
    if (type === 'decrease') return 'text-red-400';
    return 'text-gray-400';
  };

  const getChangeBadge = (type: string) => {
    if (type === 'new') return <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">NEW</span>;
    if (type === 'increase') return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">↑ ADD</span>;
    if (type === 'decrease') return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">↓ CUT</span>;
    return <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded-full">HOLD</span>;
  };

  const filteredFunds = funds.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.manager.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-gray-400 text-lg">Loading Institutional Data...</p>
          <p className="text-gray-500 text-sm mt-2">Tracking 145+ hedge funds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate('/')}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Back to Screener</span>
          </button>
          
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
              <Building2 className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Hedge Fund Tracker</h1>
              <p className="text-amber-400/80">Track 145+ institutional investors from SEC 13F filings</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <div className="bg-black/30 rounded-xl p-3 md:p-4 border border-amber-500/20">
              <div className="text-xl md:text-2xl font-bold text-white">{funds.length}</div>
              <div className="text-xs md:text-sm text-gray-400">Funds Tracked</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 md:p-4 border border-amber-500/20">
              <div className="text-xl md:text-2xl font-bold text-green-400">{topMoves.filter(m => m.change_type === 'new').length}</div>
              <div className="text-xs md:text-sm text-gray-400">New Positions</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 md:p-4 border border-amber-500/20">
              <div className="text-xl md:text-2xl font-bold text-blue-400">{topMoves.filter(m => m.change_type === 'increase').length}</div>
              <div className="text-xs md:text-sm text-gray-400">Increased</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 md:p-4 border border-amber-500/20">
              <div className="text-xl md:text-2xl font-bold text-amber-400">{convergence.length}</div>
              <div className="text-xs md:text-sm text-gray-400">Convergence</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-1 md:gap-2 border-b border-gray-800 mb-6 overflow-x-auto scrollbar-hide">
          {[
            { id: 'legends', label: '👑 Legends', fullLabel: '👑 Legend Portfolios', icon: Crown },
            { id: 'all', label: '🏦 Funds', fullLabel: '🏦 All Funds', icon: Building2 },
            { id: 'moves', label: '🔥 Moves', fullLabel: '🔥 Top Moves', icon: TrendingUp },
            { id: 'convergence', label: '🎯 Conv.', fullLabel: '🎯 Convergence', icon: Target },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2 md:px-4 py-2 md:py-3 rounded-t-lg font-medium transition-all whitespace-nowrap text-sm md:text-base ${
                activeTab === tab.id
                  ? 'bg-amber-500/20 text-amber-400 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="md:hidden">{tab.label}</span>
              <span className="hidden md:inline">{tab.fullLabel}</span>
            </button>
          ))}
        </div>

        {/* Legends Tab */}
        {activeTab === 'legends' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Crown className="text-amber-400" />
              Legendary Investors
            </h2>
            
            <div className="grid gap-6">
              {legends.map((legend) => (
                <div 
                  key={legend.cik}
                  className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-amber-500/50 transition-all"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">{legend.name}</h3>
                        <p className="text-amber-400">{legend.manager}</p>
                        <p className="text-sm text-gray-400">{legend.style}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">{formatCurrency(legend.aum)}</div>
                        <div className="text-sm text-gray-400">{legend.position_count} positions</div>
                        <div className="text-xs text-gray-500">Filed: {legend.filing_date}</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">TOP 10 HOLDINGS</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {legend.top_holdings.map((h, i) => (
                          <div 
                            key={i}
                            className={`p-2 rounded-lg bg-black/30 border ${
                              h.change_type === 'new' ? 'border-green-500/30' :
                              h.change_type === 'increase' ? 'border-blue-500/30' :
                              h.change_type === 'decrease' ? 'border-red-500/30' :
                              'border-gray-700'
                            }`}
                          >
                            <div className="text-sm font-medium text-white truncate">{h.issuer}</div>
                            <div className="text-xs text-gray-400">{formatCurrency(h.value)}</div>
                            {getChangeBadge(h.change_type)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => loadFundPortfolio(legend.cik)}
                      className="mt-4 w-full py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye size={16} />
                      View Full Portfolio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Funds Tab */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search funds or managers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {filteredFunds.map((fund) => (
                <div 
                  key={fund.cik}
                  className="bg-gray-900 rounded-xl border border-gray-700 p-4 cursor-pointer active:bg-gray-800"
                  onClick={() => loadFundPortfolio(fund.cik)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-white text-sm">{fund.name}</div>
                      <div className="text-xs text-gray-400">{fund.manager}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">{formatCurrency(fund.aum_estimated)}</div>
                      <div className="text-xs text-gray-500">{fund.position_count} pos</div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-400">+{fund.new_positions || 0} new</span>
                    <span className="text-blue-400">+{fund.increased || 0} add</span>
                    <span className="text-red-400">-{fund.decreased || 0} cut</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left p-4 text-gray-400 font-medium">Fund</th>
                    <th className="text-right p-4 text-gray-400 font-medium">AUM</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Positions</th>
                    <th className="text-right p-4 text-gray-400 font-medium">New</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Added</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Cut</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Filed</th>
                    <th className="text-right p-4 text-gray-400 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFunds.map((fund) => (
                    <tr 
                      key={fund.cik}
                      className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => loadFundPortfolio(fund.cik)}
                    >
                      <td className="p-4">
                        <div className="font-medium text-white">{fund.name}</div>
                        <div className="text-sm text-gray-400">{fund.manager} • {fund.style}</div>
                      </td>
                      <td className="p-4 text-right text-white font-medium">{formatCurrency(fund.aum_estimated)}</td>
                      <td className="p-4 text-right text-gray-300">{fund.position_count}</td>
                      <td className="p-4 text-right text-green-400">{fund.new_positions || '-'}</td>
                      <td className="p-4 text-right text-blue-400">{fund.increased || '-'}</td>
                      <td className="p-4 text-right text-red-400">{fund.decreased || '-'}</td>
                      <td className="p-4 text-right text-gray-500 text-sm">{fund.last_filing}</td>
                      <td className="p-4 text-right">
                        <ChevronRight className="text-gray-500" size={18} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Moves Tab */}
        {activeTab === 'moves' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-green-400" />
              Biggest Position Changes
            </h2>

            <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left p-4 text-gray-400 font-medium">Fund</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Stock</th>
                    <th className="text-center p-4 text-gray-400 font-medium">Action</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Position</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {topMoves.map((move, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4">
                        <div className="font-medium text-white">{move.fund_name}</div>
                        <div className="text-sm text-gray-400">{move.manager}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-white">{move.issuer}</div>
                        <div className="text-xs text-gray-500">{move.cusip}</div>
                      </td>
                      <td className="p-4 text-center">
                        {getChangeBadge(move.change_type)}
                      </td>
                      <td className="p-4 text-right text-white">{formatCurrency(move.value)}</td>
                      <td className={`p-4 text-right font-medium ${getChangeColor(move.change_type)}`}>
                        {move.delta_value > 0 ? '+' : ''}{formatCurrency(move.delta_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Convergence Tab */}
        {activeTab === 'convergence' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="text-purple-400" />
              Convergence Signals - Multiple Funds Same Stock
            </h2>
            <p className="text-gray-400">Stocks that 3+ hedge funds are buying simultaneously</p>

            <div className="grid gap-4">
              {convergence.map((signal, i) => (
                <div 
                  key={i}
                  className={`p-4 rounded-xl border ${
                    signal.sentiment === 'bullish' ? 'bg-green-900/10 border-green-500/30' :
                    signal.sentiment === 'bearish' ? 'bg-red-900/10 border-red-500/30' :
                    'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">{signal.issuer}</h3>
                      <div className="text-sm text-gray-400">{signal.cusip}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${
                        signal.sentiment === 'bullish' ? 'text-green-400' :
                        signal.sentiment === 'bearish' ? 'text-red-400' :
                        'text-gray-400'
                      }`}>
                        {signal.fund_count} Funds
                      </div>
                      <div className="text-sm text-gray-400">{formatCurrency(signal.total_value)} total</div>
                    </div>
                  </div>

                  <div className="flex gap-4 text-sm mb-3">
                    <span className="text-green-400">🟢 {signal.bullish_funds} buying</span>
                    <span className="text-red-400">🔴 {signal.bearish_funds} selling</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {signal.funds?.map((f: any, j: number) => (
                      <span 
                        key={j}
                        className={`px-2 py-1 rounded text-xs ${
                          f.change_type === 'new' || f.change_type === 'increase'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {f.fund_name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fund Detail Modal */}
      {selectedFund && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedFund.fund_name}</h2>
                <p className="text-amber-400">{selectedFund.manager} • {selectedFund.style}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-gray-400">AUM: {formatCurrency(selectedFund.total_value)}</span>
                  <span className="text-gray-400">{selectedFund.position_count} positions</span>
                  <span className="text-gray-400">Filed: {selectedFund.filing_date}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedFund(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-4 border-b border-gray-700 flex gap-4">
              <div className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg">
                {selectedFund.summary.new} New
              </div>
              <div className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg">
                {selectedFund.summary.increased} Increased
              </div>
              <div className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg">
                {selectedFund.summary.decreased} Decreased
              </div>
              <div className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg">
                {selectedFund.summary.unchanged} Unchanged
              </div>
            </div>

            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full">
                <thead className="bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-gray-400 text-sm">#</th>
                    <th className="text-left p-3 text-gray-400 text-sm">Holding</th>
                    <th className="text-right p-3 text-gray-400 text-sm">Value</th>
                    <th className="text-right p-3 text-gray-400 text-sm">% Port</th>
                    <th className="text-center p-3 text-gray-400 text-sm">Change</th>
                    <th className="text-right p-3 text-gray-400 text-sm">Δ Value</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFund.holdings.map((h, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="p-3 text-gray-500">{i + 1}</td>
                      <td className="p-3">
                        <div className="font-medium text-white">{h.issuer}</div>
                        <div className="text-xs text-gray-500">{h.class} • {h.cusip}</div>
                      </td>
                      <td className="p-3 text-right text-white">{formatCurrency(h.value)}</td>
                      <td className="p-3 text-right text-gray-400">{h.pct_portfolio.toFixed(1)}%</td>
                      <td className="p-3 text-center">{getChangeBadge(h.change_type)}</td>
                      <td className={`p-3 text-right ${getChangeColor(h.change_type)}`}>
                        {h.delta_value !== 0 ? (h.delta_value > 0 ? '+' : '') + formatCurrency(h.delta_value) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

