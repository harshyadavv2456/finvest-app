/**
 * Market Overview Page
 * Cross-market intelligence and top movers
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Globe, TrendingUp, TrendingDown, 
  DollarSign
} from 'lucide-react';
import { api } from '../lib/api';

interface MarketData {
  ticker_count: number;
}

interface UniverseData {
  total: number;
  by_market: Record<string, number>;
  markets_available: string[];
  screener_coverage: number;
}

interface SmartMoney {
  date: string;
  fii_net: number;
  dii_net: number;
  total_net: number;
  regime: string;
  flow_signal: string;
  nifty_close: number;
  fii_5d_avg: number;
  dii_5d_avg: number;
}

interface Mover {
  ticker: string;
  company_name?: string;
  price: number;
  change_percent: number;
  volume: number;
}

export default function MarketOverviewPage() {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Record<string, MarketData>>({});
  const [universe, setUniverse] = useState<UniverseData | null>(null);
  const [smartMoney, setSmartMoney] = useState<SmartMoney | null>(null);
  const [movers, setMovers] = useState<{ gainers: Mover[]; losers: Mover[] } | null>(null);
  const [selectedMarket, setSelectedMarket] = useState('US');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      try {
        // Fetch full universe for accurate market counts
        console.log('[MarketOverview] Fetching universe...');
        const universeRes = await api.getUniverse();
        console.log('[MarketOverview] Universe response:', universeRes);
        
        if (universeRes) {
          setUniverse(universeRes);
          // Build markets object from universe data
          const marketCounts: Record<string, MarketData> = {};
          const byMarket = universeRes.by_market || {};
          console.log('[MarketOverview] by_market:', byMarket);
          
          Object.entries(byMarket).forEach(([market, count]) => {
            marketCounts[market] = { ticker_count: count as number };
          });
          console.log('[MarketOverview] Market counts:', marketCounts);
          setMarkets(marketCounts);
        }
        
        const [overviewRes, moversRes] = await Promise.all([
          api.get('/api/intelligence/market-overview').catch(() => null),
          api.get(`/api/analytics/screener/top-movers?market=${selectedMarket}`).catch(() => null),
        ]);
        
        if (overviewRes?.data) {
          setSmartMoney(overviewRes.data.smart_money);
        }
        if (moversRes?.data) {
          setMovers(moversRes.data);
        }
      } catch (err) {
        console.error('Error fetching market overview:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchOverview();
  }, [selectedMarket]);

  // Get currency symbol based on market
  const getCurrencySymbol = (market: string) => {
    const symbols: Record<string, string> = {
      US: '$',
      IN: '₹',
      UK: '£',
      JP: '¥',
      CN: '¥',
      HK: 'HK$',
      SG: 'S$',
      AU: 'A$',
    };
    return symbols[market] || '$';
  };

  const formatPrice = (val: number | null, market: string) => {
    if (val === null || val === undefined) return 'N/A';
    const symbol = getCurrencySymbol(market);
    return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return 'N/A';
    return `₹${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} Cr`;
  };

  const marketLabels: Record<string, string> = {
    US: '🇺🇸 United States',
    IN: '🇮🇳 India',
    UK: '🇬🇧 United Kingdom',
    JP: '🇯🇵 Japan',
    CN: '🇨🇳 China',
    HK: '🇭🇰 Hong Kong',
    SG: '🇸🇬 Singapore',
    AU: '🇦🇺 Australia',
  };

  if (loading && !movers) {
    return (
      <div className="min-h-screen bg-bloomberg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bloomberg-accent mx-auto mb-4"></div>
          <p className="text-bloomberg-text-muted">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-bloomberg-darker border-b border-bloomberg-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-bloomberg-border rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-bloomberg-text" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-bloomberg-text flex items-center gap-2">
                <Globe className="w-6 h-6 text-bloomberg-accent" />
                Market Intelligence
              </h1>
              <p className="text-bloomberg-text-muted">Cross-market overview and institutional flows</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Universe Summary */}
        {universe && (
          <div className="bg-gradient-to-r from-bloomberg-accent/10 to-blue-500/10 rounded-xl p-4 border border-bloomberg-accent/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-bloomberg-text">
                  Global Universe: {universe.total.toLocaleString()} Stocks
                </h2>
                <p className="text-sm text-bloomberg-text-muted">
                  Intelligence enabled for US & IN ({['US', 'IN'].includes(selectedMarket) ? 'Full analysis' : 'Screener data only'})
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-bloomberg-text-muted">
                  Screener coverage: {universe.screener_coverage} / {universe.total}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Markets Grid */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {Object.entries(marketLabels).map(([code, label]) => {
            const data = markets[code];
            const count = data?.ticker_count || 0;
            const isIntelligenceEnabled = ['US', 'IN'].includes(code);
            return (
              <button
                key={code}
                onClick={() => setSelectedMarket(code)}
                className={`p-3 rounded-lg border transition-all ${
                  selectedMarket === code
                    ? 'bg-bloomberg-accent/20 border-bloomberg-accent'
                    : 'bg-bloomberg-darker border-bloomberg-border hover:border-bloomberg-accent/50'
                }`}
              >
                <div className="text-2xl">{label.split(' ')[0]}</div>
                <div className="text-xs text-bloomberg-text-muted mt-1">{count} stocks</div>
                {isIntelligenceEnabled && (
                  <div className="text-[10px] text-green-400 mt-0.5">Intelligence</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Smart Money Flow */}
        {smartMoney && (
          <div className="bg-bloomberg-darker rounded-xl p-6 border border-bloomberg-border">
            <h2 className="text-xl font-bold text-bloomberg-text mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-bloomberg-accent" />
              Smart Money Flow (India)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${smartMoney.fii_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(smartMoney.fii_net)}
                </div>
                <div className="text-sm text-bloomberg-text-muted">FII Net</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${smartMoney.dii_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(smartMoney.dii_net)}
                </div>
                <div className="text-sm text-bloomberg-text-muted">DII Net</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${smartMoney.total_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(smartMoney.total_net)}
                </div>
                <div className="text-sm text-bloomberg-text-muted">Total Net</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-bloomberg-text">
                  {smartMoney.nifty_close?.toLocaleString()}
                </div>
                <div className="text-sm text-bloomberg-text-muted">Nifty Close</div>
              </div>
              <div className="text-center">
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  smartMoney.regime?.includes('buy') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {smartMoney.regime?.replace(/_/g, ' ').toUpperCase()}
                </div>
                <div className="text-sm text-bloomberg-text-muted mt-1">Regime</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Movers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bloomberg-darker rounded-xl p-6 border border-bloomberg-border">
            <h2 className="text-xl font-bold text-bloomberg-text mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Top Gainers ({marketLabels[selectedMarket]?.split(' ').slice(1).join(' ')})
            </h2>
            <div className="space-y-2">
              {movers?.gainers?.slice(0, 10).map((stock, i) => (
                <div
                  key={stock.ticker}
                  onClick={() => navigate(`/stock/${stock.ticker}`)}
                  className="flex items-center justify-between p-3 bg-bloomberg-dark rounded-lg cursor-pointer hover:bg-bloomberg-border transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-bloomberg-text-muted w-6 flex-shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <span className="text-bloomberg-text font-medium block truncate">
                        {stock.company_name && stock.company_name !== stock.ticker 
                          ? stock.company_name 
                          : stock.ticker.replace('.NS', '').replace('.T', '').replace('.AX', '')}
                      </span>
                      {stock.company_name && stock.company_name !== stock.ticker && (
                        <span className="text-bloomberg-text-muted text-xs">{stock.ticker}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-bloomberg-text">{formatPrice(stock.price, selectedMarket)}</span>
                    <span className="text-green-400 font-medium">+{stock.change_percent?.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-bloomberg-darker rounded-xl p-6 border border-bloomberg-border">
            <h2 className="text-xl font-bold text-bloomberg-text mb-4 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              Top Losers ({marketLabels[selectedMarket]?.split(' ').slice(1).join(' ')})
            </h2>
            <div className="space-y-2">
              {movers?.losers?.slice(0, 10).map((stock, i) => (
                <div
                  key={stock.ticker}
                  onClick={() => navigate(`/stock/${stock.ticker}`)}
                  className="flex items-center justify-between p-3 bg-bloomberg-dark rounded-lg cursor-pointer hover:bg-bloomberg-border transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-bloomberg-text-muted w-6 flex-shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <span className="text-bloomberg-text font-medium block truncate">
                        {stock.company_name && stock.company_name !== stock.ticker 
                          ? stock.company_name 
                          : stock.ticker.replace('.NS', '').replace('.T', '').replace('.AX', '')}
                      </span>
                      {stock.company_name && stock.company_name !== stock.ticker && (
                        <span className="text-bloomberg-text-muted text-xs">{stock.ticker}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-bloomberg-text">{formatPrice(stock.price, selectedMarket)}</span>
                    <span className="text-red-400 font-medium">{stock.change_percent?.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

