import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ScreenerRow, api, DailyDataResponse, FundamentalsResponse, NewsItem } from '../lib/api';
import ChartPanel from './ChartPanel';
import FundamentalsPanel from './FundamentalsPanel';
import NewsPanel from './NewsPanel';
import AIInsightsPanel from './AIInsightsPanel';

interface TickerDetailProps {
  ticker: ScreenerRow;
  onClose: () => void;
}

export default function TickerDetail({ ticker, onClose }: TickerDetailProps) {
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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [daily, fund, newsData] = await Promise.all([
          api.getTickerDaily(ticker.ticker),
          api.getTickerFundamentals(ticker.ticker),
          api.getTickerNews(ticker.ticker).catch(() => ({
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
  }, [ticker.ticker]);

  return (
    <div className="h-full flex flex-col bg-bloomberg-darker">
      <div className="p-4 border-b border-bloomberg-border flex items-center justify-between sticky top-0 bg-bloomberg-darker z-10">
        <div>
          <h2 className="text-xl font-bold text-bloomberg-text">{ticker.ticker}</h2>
          <div className="text-sm text-bloomberg-text-muted">{ticker.market}</div>
        </div>
        <button
          onClick={onClose}
          className="text-bloomberg-text-muted hover:text-bloomberg-text"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-bloomberg-text-muted">Loading...</div>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setChartType('daily')}
                  className={`px-4 py-2 rounded-md ${
                    chartType === 'daily'
                      ? 'bg-bloomberg-accent text-white'
                      : 'bg-bloomberg-panel text-bloomberg-text hover:bg-bloomberg-border'
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setChartType('minute')}
                  className={`px-4 py-2 rounded-md ${
                    chartType === 'minute'
                      ? 'bg-bloomberg-accent text-white'
                      : 'bg-bloomberg-panel text-bloomberg-text hover:bg-bloomberg-border'
                  }`}
                >
                  Intraday
                </button>
              </div>
              <ChartPanel ticker={ticker.ticker} chartType={chartType} dailyData={dailyData} />
            </div>

            {fundamentals && <FundamentalsPanel fundamentals={fundamentals} screenerRow={ticker} />}

            <NewsPanel newsData={news} loading={loading} ticker={ticker.ticker} />

            <AIInsightsPanel ticker={ticker.ticker} />
          </>
        )}
      </div>
    </div>
  );
}

