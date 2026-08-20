import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DailyDataResponse } from '../lib/api';

interface SeasonalsChartProps {
  dailyData: DailyDataResponse;
}

export default function SeasonalsChart({ dailyData }: SeasonalsChartProps) {
  const seasonalsData = useMemo(() => {
    if (!dailyData.data || dailyData.data.length === 0) return [];

    // Group data by year and month
    const byYear: Record<number, Record<number, number[]>> = {};
    
    dailyData.data.forEach(point => {
      const date = new Date(point.timestamp);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      if (!byYear[year]) byYear[year] = {};
      if (!byYear[year][month]) byYear[year][month] = [];
      
      byYear[year][month].push(point.close);
    });

    // Get available years
    const years = Object.keys(byYear).map(Number).sort();
    if (years.length < 2) return [];

    // Calculate percentage change from January for each year
    const result: Record<string, any> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    years.forEach(year => {
      const janPrices = byYear[year][0]; // January
      if (!janPrices || janPrices.length === 0) return;

      const janAvg = janPrices.reduce((a, b) => a + b, 0) / janPrices.length;
      
      months.forEach((month, monthIdx) => {
        if (!result[month]) result[month] = { month };
        
        const monthPrices = byYear[year][monthIdx];
        if (monthPrices && monthPrices.length > 0) {
          const monthAvg = monthPrices.reduce((a, b) => a + b, 0) / monthPrices.length;
          const pctChange = ((monthAvg - janAvg) / janAvg) * 100;
          result[month][year.toString()] = pctChange;
        }
      });
    });

    return Object.values(result);
  }, [dailyData]);

  if (seasonalsData.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Seasonals</h3>
        <p className="text-bloomberg-text-muted text-sm">
          Displays a symbol's price movements over previous years to identify recurring trends.
        </p>
        <div className="text-center py-8 text-bloomberg-text-muted">
          Insufficient data for seasonal analysis
        </div>
      </div>
    );
  }

  // Get available years for legend
  const years = useMemo(() => {
    const yearSet = new Set<string>();
    seasonalsData.forEach((point: any) => {
      Object.keys(point).forEach(key => {
        if (key !== 'month' && typeof point[key] === 'number') {
          yearSet.add(key);
        }
      });
    });
    return Array.from(yearSet).sort();
  }, [seasonalsData]);

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-bloomberg-text mb-1">Seasonals</h3>
        <p className="text-xs text-bloomberg-text-muted">
          Displays a symbol's price movements over previous years to identify recurring trends.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={seasonalsData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="month" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151', 
              borderRadius: '4px' 
            }}
            formatter={(value: number) => `${value.toFixed(2)}%`}
          />
          <Legend />
          {years.map((year, idx) => (
            <Line
              key={year}
              type="monotone"
              dataKey={year}
              stroke={colors[idx % colors.length]}
              strokeWidth={2}
              name={year}
              dot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 text-xs text-bloomberg-text-muted">
        {years.map((year, idx) => (
          <span key={year} className="mr-4">
            <span 
              className="inline-block w-3 h-3 rounded-full mr-1"
              style={{ backgroundColor: colors[idx % colors.length] }}
            />
            {year}: {seasonalsData[seasonalsData.length - 1]?.[year]?.toFixed(2) || 'N/A'}%
          </span>
        ))}
      </div>
    </div>
  );
}

