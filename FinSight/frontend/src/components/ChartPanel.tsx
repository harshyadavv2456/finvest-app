import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailyDataResponse, api, MinuteDataResponse } from '../lib/api';

interface ChartPanelProps {
  ticker: string;
  chartType: 'daily' | 'minute';
  dailyData: DailyDataResponse | null;
}

type Timeframe = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';

export default function ChartPanel({ ticker, chartType, dailyData }: ChartPanelProps) {
  const [minuteData, setMinuteData] = useState<MinuteDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [showIndicators, setShowIndicators] = useState(true);

  useEffect(() => {
    if (chartType === 'minute') {
      setLoading(true);
      api.getTickerMinute(ticker)
        .then(setMinuteData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [chartType, ticker]);

  const data = chartType === 'daily' ? dailyData : minuteData;
  
  // Calculate data range based on timeframe
  const getDataLimit = (tf: Timeframe): number => {
    switch (tf) {
      case '1M': return 21; // ~1 month
      case '3M': return 63; // ~3 months
      case '6M': return 126; // ~6 months
      case '1Y': return 252; // ~1 year
      case '3Y': return 756; // ~3 years
      case '5Y': return 1260; // ~5 years
      case '10Y': return 2520; // ~10 years
      case 'MAX': return Infinity;
      default: return 252;
    }
  };

  const limit = getDataLimit(timeframe);
  const chartData = (data?.data.slice(-limit) || []).map((point) => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      ...(timeframe === '1Y' || timeframe === '3Y' || timeframe === '5Y' || timeframe === '10Y' || timeframe === 'MAX' ? { year: '2-digit' } : {})
    }),
    timestamp: point.timestamp,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume || 0,
  }));

  const technicals = dailyData?.technicals?.slice(-252) || [];
  const sma20Data = technicals.map((t) => ({
    date: new Date(t.timestamp).toLocaleDateString(),
    timestamp: t.timestamp,
    sma20: t.sma20,
    sma50: t.sma50,
    sma200: t.sma200,
  }));

  // Merge price and technical data by timestamp
  const mergedData = chartData.map((price) => {
    const tech = sma20Data.find((t) => {
      const priceDate = new Date(price.timestamp);
      const techDate = new Date(t.timestamp);
      return Math.abs(priceDate.getTime() - techDate.getTime()) < 86400000; // Within 1 day
    });
    return {
      ...price,
      sma20: tech?.sma20,
      sma50: tech?.sma50,
      sma200: tech?.sma200,
    };
  });

  if (loading) {
    return <div className="h-64 flex items-center justify-center text-bloomberg-text-muted">Loading chart...</div>;
  }

  if (!mergedData.length) {
    return <div className="h-64 flex items-center justify-center text-bloomberg-text-muted">No data available</div>;
  }

  const timeframes: { value: Timeframe; label: string }[] = [
    { value: '1M', label: '1M' },
    { value: '3M', label: '3M' },
    { value: '6M', label: '6M' },
    { value: '1Y', label: '1Y' },
    { value: '3Y', label: '3Y' },
    { value: '5Y', label: '5Y' },
    { value: '10Y', label: '10Y' },
    { value: 'MAX', label: 'MAX' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                timeframe === tf.value
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowIndicators(!showIndicators)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            showIndicators
              ? 'bg-bloomberg-accent text-white'
              : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
          }`}
        >
          {showIndicators ? 'Hide' : 'Show'} Indicators
        </button>
      </div>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            dataKey="date"
            stroke="#8b949e"
            tick={{ fill: '#8b949e', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#8b949e"
            tick={{ fill: '#8b949e', fontSize: 12 }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: '#c9d1d9',
            }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#1f6feb"
            strokeWidth={2.5}
            dot={false}
            name="Price"
            activeDot={{ r: 4 }}
          />
          {showIndicators && mergedData[0].sma20 && (
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              name="SMA 20"
              strokeDasharray="5 5"
            />
          )}
          {showIndicators && mergedData[0].sma50 && (
            <Line
              type="monotone"
              dataKey="sma50"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              name="SMA 50"
              strokeDasharray="5 5"
            />
          )}
          {showIndicators && mergedData[0].sma200 && (
            <Line
              type="monotone"
              dataKey="sma200"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              dot={false}
              name="SMA 200"
              strokeDasharray="5 5"
            />
          )}
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

