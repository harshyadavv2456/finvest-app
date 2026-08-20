import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Calendar, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, withRetry } from '../services/apiClient';
import { RETRY_CONFIG } from '../config/env';

interface FiiDiiDaily {
  date: string;
  fii_buy: number;
  fii_sell: number;
  fii_net: number;
  dii_buy: number;
  dii_sell: number;
  dii_net: number;
  total_net: number;
}

interface FiiDiiSummary {
  latest_date: string;
  fii_today: number;
  dii_today: number;
  total_today: number;
  fii_5d: number;
  dii_5d: number;
  fii_20d: number;
  dii_20d: number;
  regime: string;
  flow_signal: string;
  data_days: number;
}

export default function SmartMoneyPage() {
  const navigate = useNavigate();
  const [dailyData, setDailyData] = useState<FiiDiiDaily[]>([]);
  const [summary, setSummary] = useState<FiiDiiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dailyData, summaryData] = await Promise.all([
        withRetry(() => api.getSmartMoneyDaily(), { maxRetries: RETRY_CONFIG.MAX_RETRIES }),
        withRetry(() => api.getSmartMoneySummary(), { maxRetries: RETRY_CONFIG.MAX_RETRIES }),
      ]);
      setDailyData(dailyData.data || []);
      setSummary(summaryData);
    } catch (err: any) {
      console.error('Error fetching FII/DII data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (value: number) => {
    if (!value && value !== 0) return '₹0';
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 1e5) return `${sign}₹${(absValue / 1e5).toFixed(0)}L Cr`;
    if (absValue >= 1e3) return `${sign}₹${(absValue / 1e3).toFixed(1)}K Cr`;
    return `${sign}₹${absValue.toFixed(0)} Cr`;
  };

  const getRegimeColor = (regime: string) => {
    if (regime?.includes('buy') && !regime?.includes('sell')) return 'text-emerald-400 bg-emerald-500/20';
    if (regime?.includes('sell') && !regime?.includes('buy')) return 'text-red-400 bg-red-500/20';
    return 'text-yellow-400 bg-yellow-500/20';
  };

  const getRegimeLabel = (regime: string) => {
    if (!regime) return 'Unknown';
    return regime.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#0d1526] to-[#0a0f1a]">
      {/* Header */}
      <div className="bg-[#111827]/80 backdrop-blur-xl border-b border-orange-500/20 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-orange-500/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-orange-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                Smart Money Flow
              </h1>
              <p className="text-sm text-gray-400">FII & DII Daily Activity (Indian Markets)</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-400">Loading FII/DII data...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Today's Summary */}
            {summary && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* FII Card */}
                <div className="bg-[#111827]/60 backdrop-blur-sm border border-blue-500/20 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-blue-400">FII / FPI</h3>
                    <span className="text-xs text-gray-500">Foreign Institutional</span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-400">Today's Net</p>
                      <p className={`text-3xl font-bold ${summary.fii_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(summary.fii_today)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">5-Day Total</p>
                        <p className={`text-lg font-semibold ${summary.fii_5d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(summary.fii_5d)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">20-Day Total</p>
                        <p className={`text-lg font-semibold ${summary.fii_20d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(summary.fii_20d)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DII Card */}
                <div className="bg-[#111827]/60 backdrop-blur-sm border border-purple-500/20 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-purple-400">DII</h3>
                    <span className="text-xs text-gray-500">Domestic Institutional</span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-400">Today's Net</p>
                      <p className={`text-3xl font-bold ${summary.dii_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(summary.dii_today)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">5-Day Total</p>
                        <p className={`text-lg font-semibold ${summary.dii_5d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(summary.dii_5d)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">20-Day Total</p>
                        <p className={`text-lg font-semibold ${summary.dii_20d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(summary.dii_20d)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Market Regime Card */}
                <div className="bg-[#111827]/60 backdrop-blur-sm border border-orange-500/20 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-orange-400">Market Regime</h3>
                    <Calendar className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-400">Current Regime</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-1 ${getRegimeColor(summary.regime)}`}>
                        {getRegimeLabel(summary.regime)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Flow Signal</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-1 ${
                        summary.flow_signal?.includes('bullish') ? 'text-emerald-400 bg-emerald-500/20' :
                        summary.flow_signal?.includes('bearish') ? 'text-red-400 bg-red-500/20' :
                        'text-yellow-400 bg-yellow-500/20'
                      }`}>
                        {getRegimeLabel(summary.flow_signal)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Combined Net (Today)</p>
                      <p className={`text-2xl font-bold ${summary.total_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(summary.total_today)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Daily Data Table */}
            <div className="bg-[#111827]/60 backdrop-blur-sm border border-orange-500/20 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-orange-500/20">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-orange-400" />
                  FII/DII Daily Cash Market Activity
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#1f2937]">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-blue-400">FII Buy</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-blue-400">FII Sell</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-blue-400">FII Net</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-purple-400">DII Buy</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-purple-400">DII Sell</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-purple-400">DII Net</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-orange-400">Total Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          No FII/DII data found. Data files may not be present on server.
                        </td>
                      </tr>
                    ) : (
                      dailyData.map((day, i) => (
                        <tr key={i} className="border-t border-gray-800 hover:bg-orange-500/5 transition-colors">
                          <td className="px-4 py-3 font-semibold text-white">{day.date}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(day.fii_buy)}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(day.fii_sell)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center gap-1 font-semibold ${day.fii_net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {day.fii_net >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              {formatCurrency(day.fii_net)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(day.dii_buy)}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(day.dii_sell)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center gap-1 font-semibold ${day.dii_net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {day.dii_net >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              {formatCurrency(day.dii_net)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center gap-1 font-bold ${day.total_net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {day.total_net >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              {formatCurrency(day.total_net)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="bg-[#111827]/40 rounded-xl p-4 border border-gray-800">
              <div className="flex flex-wrap gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span><strong>FII/FPI</strong> - Foreign Institutional Investors</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span><strong>DII</strong> - Domestic Institutional Investors (MF, Insurance, etc.)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">↑ Positive</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-red-400">↓ Negative</span>
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-gray-500">
              Data sourced from NSE. All values in ₹ Crores. Updates daily after market close.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
