import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';

interface ValuationGaugeProps {
  currentPrice: number;
  intrinsicValue: number;
}

export const ValuationGauge: React.FC<ValuationGaugeProps> = ({ currentPrice, intrinsicValue }) => {
  // Ensure we have valid numbers
  const price = Number(currentPrice) || 0;
  const intrinsic = Number(intrinsicValue) || price * 0.9; // Default to 90% of price if no intrinsic
  
  // Skip chart render if both values are 0
  if (price === 0 && intrinsic === 0) {
    return (
      <div className="h-48 w-full flex items-center justify-center">
        <p className="text-dark-muted">Waiting for data...</p>
      </div>
    );
  }
  
  const data = [
    { name: 'Current Price', value: price },
    { name: 'Intrinsic Value', value: intrinsic },
  ];

  const maxVal = Math.max(price, intrinsic, 10) * 1.2;
  const isUndervalued = price < intrinsic;

  return (
    <div className="w-full">
      {/* Chart container with fixed height */}
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 15, right: 30, left: 10, bottom: 5 }}
          >
            <XAxis type="number" hide domain={[0, maxVal]} />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={100} 
              tick={{ fill: '#a1a1aa', fontSize: 11 }} 
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              cursor={{ fill: 'transparent' }}
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
            />
            <Bar dataKey="value" barSize={28} radius={[0, 6, 6, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.name === 'Current Price' ? '#ffffff' : (isUndervalued ? '#22c55e' : '#ef4444')} 
                  fillOpacity={entry.name === 'Current Price' ? 0.25 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Price comparison below chart */}
      <div className="flex justify-between items-center mt-4 px-2">
        <div className="text-center flex-1">
          <div className="text-xs text-dark-muted mb-1">Current</div>
          <div className="text-xl font-bold text-white font-mono">${price.toFixed(2)}</div>
        </div>
        <div className="flex-shrink-0 px-4">
          <div className={`text-2xl ${isUndervalued ? 'text-brand-500' : 'text-red-500'}`}>
            {isUndervalued ? '→' : '←'}
          </div>
        </div>
        <div className="text-center flex-1">
          <div className="text-xs text-dark-muted mb-1">Intrinsic</div>
          <div className={`text-xl font-bold font-mono ${isUndervalued ? 'text-brand-500' : 'text-red-500'}`}>
            ${intrinsic.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};
