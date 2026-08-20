import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, ExternalLink, Brain, Sparkles, BarChart3, Layers, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { api, ScreenerRow, DailyDataResponse, FundamentalsResponse, NewsItem } from '../lib/api';
import { API_BASE_URL } from '../config/env';
import ChartPanel from '../components/ChartPanel';
import FundamentalsPanel from '../components/FundamentalsPanel';
import NewsPanel from '../components/NewsPanel';
import AIInsightsPanel from '../components/AIInsightsPanel';
import PeerComparison from '../components/PeerComparison';
import QuarterlyResults from '../components/QuarterlyResults';
import FinancialStatements from '../components/FinancialStatements';
import FinancialsCharts from '../components/FinancialsCharts';
import TechnicalsGauges from '../components/TechnicalsGauges';
import SeasonalsChart from '../components/SeasonalsChart';
import RatioInspector from '../components/RatioInspector';
import StockIntelligence from '../components/StockIntelligence';

type TabType = 'overview' | 'chart' | 'analysis' | 'intelligence' | 'peers' | 'quarters' | 'financials' | 'news' | 'dashboard';

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [screenerRow, setScreenerRow] = useState<ScreenerRow | null>(null);
  const [dailyData, setDailyData] = useState<DailyDataResponse | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalsResponse | null>(null);
  const [news, setNews] = useState<{
    stock_specific: NewsItem[];
    sector_peer: NewsItem[];
    generic: NewsItem[];
    sector?: string | null;
    industry?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'daily' | 'minute'>('daily');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        // Get screener row for this ticker
        const screenerResponse = await api.getScreener({ limit: 1000 });
        const tickerRow = screenerResponse.rows.find(r => r.ticker === ticker);
        
        if (!tickerRow) {
          console.error('Ticker not found in screener');
          return;
        }
        
        setScreenerRow(tickerRow);
        
        // Load detailed data
        const [daily, fund, newsData] = await Promise.all([
          api.getTickerDaily(ticker),
          api.getTickerFundamentals(ticker),
          api.getTickerNews(ticker).catch(() => ({
            stock_specific: [],
            sector_peer: [],
            generic: [],
            sector: null,
            industry: null,
          })),
        ]);
        
        setDailyData(daily);
        setFundamentals(fund);
        setNews(newsData);
      } catch (error) {
        console.error('Failed to load ticker data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [ticker]);

  useEffect(() => {
    if (!ticker || activeTab !== 'dashboard') return;
    if (dashboardData?.ticker === ticker) return;
    const loadDashboard = async () => {
      setDashboardLoading(true);
      try {
        const resp = await fetch(`${API_BASE_URL}/api/stock-dashboard/${ticker}`);
        if (resp.ok) {
          setDashboardData(await resp.json());
        }
      } catch (err) {
        console.error('Dashboard load failed:', err);
      } finally {
        setDashboardLoading(false);
      }
    };
    loadDashboard();
  }, [ticker, activeTab]);

  if (!ticker || !screenerRow) {
    return (
      <div className="min-h-screen bg-bloomberg-dark flex items-center justify-center">
        <div className="text-bloomberg-text-muted">Loading...</div>
      </div>
    );
  }

  const getCurrencySymbol = (currency?: string, market?: string): string => {
    if (currency) {
      const currencyMap: Record<string, string> = {
        'USD': '$',
        'INR': '₹',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'SGD': 'S$',
        'HKD': 'HK$',
      };
      return currencyMap[currency] || currency;
    }
    const marketMap: Record<string, string> = {
      'IN': '₹',
      'US': '$',
      'UK': '£',
      'JP': '¥',
      'CN': '¥',
      'SG': 'S$',
      'HK': 'HK$',
    };
    return marketMap[market || ''] || '$';
  };

  const formatNumber = (value: number | undefined, decimals = 2): string => {
    if (value === undefined || value === null) return '—';
    const symbol = getCurrencySymbol(screenerRow?.currency, screenerRow?.market);
    if (Math.abs(value) >= 1e12) return `${symbol}${(value / 1e12).toFixed(decimals)}T`;
    if (Math.abs(value) >= 1e9) return `${symbol}${(value / 1e9).toFixed(decimals)}B`;
    if (Math.abs(value) >= 1e6) return `${symbol}${(value / 1e6).toFixed(decimals)}M`;
    if (Math.abs(value) >= 1e3) return `${symbol}${(value / 1e3).toFixed(decimals)}K`;
    return `${symbol}${value.toFixed(decimals)}`;
  };

  const formatPercent = (value: number | undefined): string => {
    if (value === undefined || value === null) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const priceChange = screenerRow.ret_1d || 0;
  const isPositive = priceChange >= 0;

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'chart', label: 'Chart' },
    { id: 'intelligence', label: '🧠 Intelligence' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'peers', label: 'Peers' },
    { id: 'quarters', label: 'Quarters' },
    { id: 'financials', label: 'Financials' },
    { id: 'news', label: 'News' },
    { id: 'dashboard', label: 'Technical Dashboard' },
  ];

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-bloomberg-panel border-b border-bloomberg-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <button
            onClick={() => navigate('/')}
            className="mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base text-bloomberg-text-muted hover:text-bloomberg-text transition-colors"
          >
            <ArrowLeft size={18} className="md:w-5 md:h-5" />
            <span>Back to Screener</span>
          </button>
          
          <div className="flex flex-col md:flex-row items-start md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 md:gap-3 mb-2">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-bloomberg-text truncate">{ticker}</h1>
                {fundamentals?.info?.website && (
                  <a
                    href={fundamentals.info.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bloomberg-accent hover:text-bloomberg-accent-hover flex-shrink-0"
                  >
                    <ExternalLink size={16} className="md:w-[18px] md:h-[18px]" />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-bloomberg-text-muted mb-2">
                <span>{screenerRow.market}</span>
                {fundamentals?.info?.longName && (
                  <span className="text-bloomberg-text truncate">{fundamentals.info.longName}</span>
                )}
                {fundamentals?.info?.sectorDisp && (
                  <span>• {fundamentals.info.sectorDisp}</span>
                )}
                {fundamentals?.info?.industryDisp && (
                  <span>• {fundamentals.info.industryDisp}</span>
                )}
              </div>
              {fundamentals?.info?.longBusinessSummary && (
                <p className="text-xs md:text-sm text-bloomberg-text-muted max-w-3xl line-clamp-2">
                  {fundamentals.info.longBusinessSummary}
                </p>
              )}
            </div>
            
            <div className="text-left md:text-right w-full md:w-auto md:ml-6 flex-shrink-0">
              <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-bloomberg-text mb-1">
                {screenerRow.current_price ? `${getCurrencySymbol(screenerRow.currency, screenerRow.market)}${screenerRow.current_price.toFixed(2)}` : '—'}
              </div>
              <div className={`flex items-center gap-2 text-lg md:text-xl font-semibold mb-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? <TrendingUp size={20} className="md:w-6 md:h-6" /> : <TrendingDown size={20} className="md:w-6 md:h-6" />}
                <span>{formatPercent(priceChange)}</span>
              </div>
              <div className="text-xs text-bloomberg-text-muted">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - close price
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-bloomberg-panel border-b border-bloomberg-border sticky top-[120px] z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 md:px-6 py-3 text-xs md:text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === tab.id
                    ? 'border-bloomberg-accent text-bloomberg-accent'
                    : 'border-transparent text-bloomberg-text-muted hover:text-bloomberg-text hover:border-bloomberg-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-bloomberg-text-muted">Loading...</div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Ratio Inspector */}
                {screenerRow && (
                  <RatioInspector
                    ticker={ticker || ''}
                    screenerRow={screenerRow}
                    fundamentals={fundamentals}
                    currency={screenerRow.currency}
                    market={screenerRow.market}
                  />
                )}

                {/* Key Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Market Cap</div>
                    <div className="text-xl font-bold text-bloomberg-text">{formatNumber(screenerRow.market_cap)}</div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Current Price</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.current_price ? `$${screenerRow.current_price.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Stock P/E</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.pe_trailing ? screenerRow.pe_trailing.toFixed(2) : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Book Value</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.pb_ratio && screenerRow.current_price
                        ? `$${(screenerRow.current_price / screenerRow.pb_ratio).toFixed(2)}`
                        : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Dividend Yield</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.dividend_yield ? `${(screenerRow.dividend_yield > 20 ? screenerRow.dividend_yield / 100 : screenerRow.dividend_yield).toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">ROCE</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.roe ? `${screenerRow.roe.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">ROE</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.roe ? `${screenerRow.roe.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Face Value</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {fundamentals?.info?.currency === 'INR' ? '₹10.0' : '$1.0'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">High / Low</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.high_52w && screenerRow.low_52w
                        ? `$${screenerRow.high_52w.toFixed(2)} / $${screenerRow.low_52w.toFixed(2)}`
                        : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">EV/EBITDA</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {fundamentals?.info?.enterpriseValue && fundamentals?.info?.ebitda
                        ? (fundamentals.info.enterpriseValue / fundamentals.info.ebitda).toFixed(2)
                        : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">Debt to Equity</div>
                    <div className="text-xl font-bold text-bloomberg-text">
                      {screenerRow.debt_to_equity != null ? screenerRow.debt_to_equity.toFixed(2) : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide">% from 52W High</div>
                    <div className={`text-xl font-bold ${screenerRow.pct_from_52w_high && screenerRow.pct_from_52w_high < -10 ? 'text-red-400' : 'text-bloomberg-text'}`}>
                      {screenerRow.pct_from_52w_high ? `${screenerRow.pct_from_52w_high.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                </div>

                {/* Chart Preview */}
                <div className="card">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setChartType('daily')}
                      className={`px-4 py-2 rounded-md text-sm ${
                        chartType === 'daily'
                          ? 'bg-bloomberg-accent text-white'
                          : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setChartType('minute')}
                      className={`px-4 py-2 rounded-md text-sm ${
                        chartType === 'minute'
                          ? 'bg-bloomberg-accent text-white'
                          : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
                      }`}
                    >
                      Intraday
                    </button>
                  </div>
                  <ChartPanel ticker={ticker} chartType={chartType} dailyData={dailyData} />
                </div>

                {/* Fundamentals Summary */}
                {fundamentals && (
                  <div className="card">
                    <h2 className="text-xl font-bold text-bloomberg-text mb-4">Key Fundamentals</h2>
                    <FundamentalsPanel fundamentals={fundamentals} screenerRow={screenerRow} />
                  </div>
                )}

                {/* Technicals Gauges */}
                {screenerRow && (
                  <TechnicalsGauges screenerRow={screenerRow} dailyData={dailyData} />
                )}

                {/* AI Insights */}
                <div className="card">
                  <AIInsightsPanel ticker={ticker} />
                </div>
              </div>
            )}

            {activeTab === 'chart' && (
              <div className="space-y-6">
                {/* Seasonals Chart */}
                {dailyData && dailyData.data && dailyData.data.length > 0 && (
                  <SeasonalsChart dailyData={dailyData} />
                )}
                
                <div className="card bg-gradient-to-br from-bloomberg-dark to-bloomberg-panel border-2 border-blue-500/30 shadow-2xl">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setChartType('daily')}
                      className={`px-6 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 ${
                        chartType === 'daily'
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/50'
                          : 'bg-bloomberg-panel text-bloomberg-text hover:bg-bloomberg-border border border-bloomberg-border'
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setChartType('minute')}
                      className={`px-6 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 ${
                        chartType === 'minute'
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/50'
                          : 'bg-bloomberg-panel text-bloomberg-text hover:bg-bloomberg-border border border-bloomberg-border'
                      }`}
                    >
                      Intraday
                    </button>
                  </div>
                  <div className="h-[600px]">
                    <ChartPanel ticker={ticker || ''} chartType={chartType} dailyData={dailyData} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="card">
                <AIInsightsPanel ticker={ticker} />
              </div>
            )}

            {activeTab === 'intelligence' && (
              <div className="card p-0 overflow-hidden">
                <StockIntelligence ticker={ticker} />
              </div>
            )}

            {activeTab === 'peers' && <PeerComparison ticker={ticker} />}

            {activeTab === 'quarters' && (
              <QuarterlyResults 
                ticker={ticker} 
                currency={screenerRow?.currency}
                market={screenerRow?.market}
              />
            )}

            {activeTab === 'financials' && fundamentals && (
              <div className="space-y-6">
                <FinancialsCharts
                  fundamentals={fundamentals}
                  currency={screenerRow?.currency}
                  market={screenerRow?.market}
                />
                <FundamentalsPanel fundamentals={fundamentals} screenerRow={screenerRow} />
                <FinancialStatements 
                  fundamentals={fundamentals}
                  currency={screenerRow?.currency}
                  market={screenerRow?.market}
                />
              </div>
            )}

            {activeTab === 'news' && (
              <NewsPanel newsData={news} loading={loading} ticker={ticker || ''} />
            )}

            {activeTab === 'dashboard' && (
              <TechnicalDashboardTab
                ticker={ticker}
                data={dashboardData}
                loading={dashboardLoading}
                screenerRow={screenerRow}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TechnicalDashboardTab({ ticker, data, loading, screenerRow }: {
  ticker: string;
  data: any;
  loading: boolean;
  screenerRow: ScreenerRow;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bloomberg-text-muted">Loading Technical Dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-bloomberg-text-muted">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
        <p>No dashboard data available for {ticker}</p>
      </div>
    );
  }

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

  const verdictIcon = (rec: string) => {
    if (rec === 'BUY') return <CheckCircle size={20} className="text-green-400" />;
    if (rec === 'SELL') return <XCircle size={20} className="text-red-400" />;
    return <AlertTriangle size={20} className="text-yellow-400" />;
  };

  const intel = data.intelligence;
  const val = data.valuation;
  const scr = data.screener || {};

  const verdictScore = computeVerdict(intel, val, scr);

  return (
    <div className="space-y-6">
      {/* Final Verdict */}
      <div className={`rounded-xl p-6 border-2 ${
        verdictScore.signal === 'BUY' ? 'bg-green-500/5 border-green-500/30' :
        verdictScore.signal === 'SELL' ? 'bg-red-500/5 border-red-500/30' :
        'bg-yellow-500/5 border-yellow-500/30'
      }`}>
        <div className="flex items-center gap-3 mb-4">
          {verdictIcon(verdictScore.signal)}
          <h3 className="text-xl font-bold text-bloomberg-text">Consolidated Verdict</h3>
          <span className={`ml-auto px-4 py-1.5 rounded-lg text-lg font-bold ${recColor(verdictScore.signal)}`}>
            {verdictScore.signal}
          </span>
        </div>
        <p className="text-bloomberg-text-muted mb-4">{verdictScore.rationale}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xs text-bloomberg-text-muted uppercase mb-1">Valuation</div>
            <div className={`text-lg font-bold ${verdictScore.valuation_bias === 'undervalued' ? 'text-green-400' : verdictScore.valuation_bias === 'overvalued' ? 'text-red-400' : 'text-yellow-400'}`}>
              {verdictScore.valuation_bias}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-bloomberg-text-muted uppercase mb-1">Intelligence</div>
            <div className={`text-lg font-bold ${intentColor(intel?.intent || '')}`}>
              {intel?.intent || 'N/A'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-bloomberg-text-muted uppercase mb-1">Conviction</div>
            <div className="text-lg font-bold text-bloomberg-text">{intel?.conviction_pct?.toFixed(0) || 'N/A'}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-bloomberg-text-muted uppercase mb-1">Margin of Safety</div>
            <div className={`text-lg font-bold ${val?.marginOfSafety > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {val?.marginOfSafety?.toFixed(1) || 'N/A'}%
            </div>
          </div>
        </div>
      </div>

      {/* Price Summary */}
      {data.price && (
        <div className="card">
          <h3 className="text-lg font-semibold text-bloomberg-text mb-3">Price Summary</h3>
          <div className="flex items-baseline gap-6 mb-3">
            <span className="text-3xl font-bold text-bloomberg-text">{data.price.current?.toFixed(2)}</span>
            <span className={data.price.change_1d >= 0 ? 'text-green-400 text-xl' : 'text-red-400 text-xl'}>
              {data.price.change_1d >= 0 ? '+' : ''}{data.price.change_1d?.toFixed(2)} ({data.price.change_1d_pct?.toFixed(2)}%)
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-bloomberg-text-muted">
            <span>52W H: {data.price.high_52w?.toFixed(2)}</span>
            <span>52W L: {data.price.low_52w?.toFixed(2)}</span>
            <span>SMA20: {data.price.sma20?.toFixed(2)}</span>
            {data.price.sma50 && <span>SMA50: {data.price.sma50.toFixed(2)}</span>}
            {data.price.sma200 && <span>SMA200: {data.price.sma200.toFixed(2)}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intelligence Panel */}
        {intel && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={20} className="text-purple-400" />
              <h3 className="text-lg font-semibold text-bloomberg-text">Intelligence</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Intent</span>
                <span className={`font-bold ${intentColor(intel.intent)}`}>{intel.intent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Conviction</span>
                <span className="font-bold text-bloomberg-text">{intel.conviction_pct?.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Direction</span>
                <span className="text-bloomberg-text">{intel.direction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Regime</span>
                <span className="text-bloomberg-text">{intel.asset_regime} / {intel.market_regime}</span>
              </div>
              {intel.supporting_signals?.length > 0 && (
                <div>
                  <span className="text-bloomberg-text-muted text-sm">Supporting: </span>
                  <span className="text-green-400 text-sm">{intel.supporting_signals.join(', ')}</span>
                </div>
              )}
              {intel.opposing_signals?.length > 0 && (
                <div>
                  <span className="text-bloomberg-text-muted text-sm">Opposing: </span>
                  <span className="text-red-400 text-sm">{intel.opposing_signals.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IntrinsIQ Valuation */}
        {val && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={20} className="text-emerald-400" />
              <h3 className="text-lg font-semibold text-bloomberg-text">IntrinsIQ Valuation</h3>
              {val.companyType && (
                <span className="text-xs text-bloomberg-text-muted bg-bloomberg-bg px-1.5 py-0.5 rounded capitalize">{val.companyType}</span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Intrinsic Value</span>
                <span className="font-bold text-bloomberg-text">{val.intrinsicValue?.toFixed(2)}</span>
              </div>
              {val.intrinsicRange && (
                <div className="flex justify-between text-sm">
                  <span className="text-bloomberg-text-muted">Range</span>
                  <span className="text-bloomberg-text font-mono text-xs">
                    {val.intrinsicRange.low?.toFixed(0)} — {val.intrinsicRange.base?.toFixed(0)} — {val.intrinsicRange.high?.toFixed(0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Margin of Safety</span>
                <span className={`font-bold ${val.marginOfSafety > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {val.marginOfSafety?.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-text-muted">Recommendation</span>
                <span className={`px-2 py-0.5 rounded text-sm font-bold ${recColor(val.recommendation)}`}>
                  {val.recommendation}
                </span>
              </div>
              {val.valuationZone && (
                <div className="flex justify-between text-sm">
                  <span className="text-bloomberg-text-muted">Zone</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded capitalize ${
                    val.valuationZone === 'deep_undervalue' || val.valuationZone === 'undervalue' ? 'text-green-400 bg-green-500/10' :
                    val.valuationZone === 'fair_value' ? 'text-yellow-400 bg-yellow-500/10' :
                    'text-red-400 bg-red-500/10'
                  }`}>{val.valuationZone.replace(/_/g, ' ')}</span>
                </div>
              )}
              {val.valuationConfidence != null && val.valuationConfidence > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-bloomberg-text-muted">Confidence</span>
                  <span className={`font-bold ${val.valuationConfidence >= 70 ? 'text-green-400' : val.valuationConfidence >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {val.valuationConfidence.toFixed(0)}%
                  </span>
                </div>
              )}
              {val.reverseDCF && (
                <div className="mt-2 p-2.5 bg-bloomberg-bg rounded-lg border border-gray-700/50">
                  <p className="text-xs text-bloomberg-text-muted mb-1.5">Reverse DCF — Market Expectations</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">Market Implies</span>
                    <span className={`font-bold font-mono ${val.reverseDCF.impliedGrowthRate > val.reverseDCF.modelGrowthRate ? 'text-amber-400' : 'text-green-400'}`}>
                      {val.reverseDCF.impliedGrowthRate}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">Model Assumes</span>
                    <span className="font-bold font-mono text-blue-400">{val.reverseDCF.modelGrowthRate}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.abs(val.reverseDCF.impliedGrowthRate - val.reverseDCF.modelGrowthRate) < 3
                      ? 'Market aligns with fundamentals'
                      : val.reverseDCF.impliedGrowthRate > val.reverseDCF.modelGrowthRate
                        ? `Market pricing in ${(val.reverseDCF.impliedGrowthRate - val.reverseDCF.modelGrowthRate).toFixed(1)}% extra optimism`
                        : `Model sees ${(val.reverseDCF.modelGrowthRate - val.reverseDCF.impliedGrowthRate).toFixed(1)}% upside vs market`}
                  </p>
                </div>
              )}
              {val.alphaSignals && (
                <div className="mt-2 p-2.5 bg-bloomberg-bg rounded-lg border border-purple-800/30">
                  <p className="text-xs text-purple-400 font-semibold mb-1.5">Alpha Signals</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">Expectation Gap</span>
                    <span className={`font-bold font-mono ${
                      val.alphaSignals.expectationGap > 5 ? 'text-green-400' :
                      val.alphaSignals.expectationGap < -10 ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {val.alphaSignals.expectationGap > 0 ? '+' : ''}{val.alphaSignals.expectationGap}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">Mispricing</span>
                    <span className={`font-bold font-mono ${
                      val.alphaSignals.mispricingScore >= 75 ? 'text-purple-400' :
                      val.alphaSignals.mispricingScore >= 50 ? 'text-amber-400' : 'text-gray-400'
                    }`}>
                      {val.alphaSignals.mispricingScore}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">Direction</span>
                    <span className={`font-semibold capitalize ${
                      val.alphaSignals.alphaDirection === 'undervalued' ? 'text-green-400' :
                      val.alphaSignals.alphaDirection === 'overvalued' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {val.alphaSignals.alphaDirection}
                    </span>
                  </div>
                </div>
              )}
              <div className="mt-3 space-y-1">
                {val.methods?.map((m: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-bloomberg-text-muted">{m.name}</span>
                    <span className={m.applicable ? 'text-bloomberg-text' : 'text-gray-600'}>
                      {m.applicable && m.value ? m.value.toFixed(2) : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Screener Metrics */}
        {Object.keys(scr).length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-blue-400" />
              <h3 className="text-lg font-semibold text-bloomberg-text">Key Ratios</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { key: 'pe_trailing', label: 'P/E Ratio' },
                { key: 'pb_ratio', label: 'P/B Ratio' },
                { key: 'roe', label: 'ROE' },
                { key: 'debt_to_equity', label: 'Debt/Equity' },
                { key: 'dividend_yield', label: 'Div Yield' },
                { key: 'rsi14', label: 'RSI (14)' },
                { key: 'market_cap', label: 'Market Cap' },
                { key: 'beta', label: 'Beta' },
              ].map(({ key, label }) => {
                let val = scr[key] ?? screenerRow[key as keyof ScreenerRow];
                if (typeof val === 'number') {
                  // Values are already normalized by backend
                }
                return val != null ? (
                  <div key={key} className="flex justify-between py-1 border-b border-bloomberg-border/30">
                    <span className="text-bloomberg-text-muted">{label}</span>
                    <span className="text-bloomberg-text">
                      {typeof val === 'number' ? (
                        key === 'market_cap' ? (Math.abs(val) >= 1e9 ? `${(val / 1e9).toFixed(1)}B` : `${(val / 1e6).toFixed(0)}M`) :
                        key === 'dividend_yield' || key === 'roe' ? `${val.toFixed(2)}%` :
                        val.toFixed(2)
                      ) : val}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* StrataX Options */}
        {data.stratax?.available && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={20} className="text-pink-400" />
              <h3 className="text-lg font-semibold text-bloomberg-text">StrataX Options</h3>
            </div>
            <p className="text-sm text-bloomberg-text-muted">Options chain data available for this stock.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function computeVerdict(
  intel: any,
  val: any,
  scr: any,
): { signal: string; rationale: string; valuation_bias: string } {
  let bullPoints = 0;
  let bearPoints = 0;

  if (intel) {
    if (intel.intent === 'INITIATE') bullPoints += 2;
    else if (intel.intent === 'AVOID') bearPoints += 2;
    else bullPoints += 0.5;

    const conv = intel.conviction_pct || 50;
    if (conv > 65) bullPoints += 1;
    else if (conv < 35) bearPoints += 1;
  }

  let valuation_bias = 'fair value';
  if (val) {
    if (val.marginOfSafety > 20) { bullPoints += 3; valuation_bias = 'undervalued'; }
    else if (val.marginOfSafety > 0) { bullPoints += 1; valuation_bias = 'slightly undervalued'; }
    else if (val.marginOfSafety > -30) { bearPoints += 1; valuation_bias = 'slightly overvalued'; }
    else { bearPoints += 3; valuation_bias = 'overvalued'; }
  }

  const pe = scr.pe_trailing || scr.pe_ratio;
  if (pe) {
    if (pe < 15) bullPoints += 1;
    else if (pe > 40) bearPoints += 1;
  }
  let de = scr.debt_to_equity;
  if (de != null) {
    if (de < 0.5) bullPoints += 0.5;
    else if (de > 2) bearPoints += 0.5;
  }
  const roe = scr.roe;
  if (roe) {
    if (roe > 20) bullPoints += 1;
    else if (roe < 5) bearPoints += 0.5;
  }

  const net = bullPoints - bearPoints;
  let signal: string;
  if (net >= 3) signal = 'BUY';
  else if (net <= -2) signal = 'SELL';
  else signal = 'HOLD';

  const parts: string[] = [];
  if (val) parts.push(`Intrinsic value ${val.intrinsicValue?.toFixed(2)} vs market price (${val.marginOfSafety?.toFixed(1)}% margin).`);
  if (intel) parts.push(`Intelligence signal: ${intel.intent} with ${intel.conviction_pct?.toFixed(0)}% conviction in ${intel.asset_regime || 'unknown'} regime.`);
  if (pe) parts.push(`P/E at ${pe.toFixed(1)}x.`);
  if (roe) parts.push(`ROE ${roe.toFixed(1)}%.`);

  return { signal, rationale: parts.join(' '), valuation_bias };
}

