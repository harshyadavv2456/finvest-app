/**
 * StrataX Payoff Chart Component
 * 
 * Displays payoff curve for a strategy using Recharts.
 * Intuitive visualization with clear labels and explanations.
 */

import { XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { StrataXStrategyAnalysis } from '../types/strataxTypes';
import { Info } from 'lucide-react';

interface StrataXPayoffChartProps {
  analysis: StrataXStrategyAnalysis;
  spotPrice?: number;
}

export default function StrataXPayoffChart({ analysis, spotPrice = 0 }: StrataXPayoffChartProps) {
  // Prepare data for chart
  const chartData = analysis.payoff.map(point => ({
    underlyingPrice: point.underlyingPrice,
    pnl: point.pnl,
  }));

  // Find min/max for better visualization
  const minPrice = Math.min(...chartData.map(d => d.underlyingPrice));
  const maxPrice = Math.max(...chartData.map(d => d.underlyingPrice));
  const maxPnl = Math.max(...chartData.map(d => d.pnl));

  // Format tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-bloomberg-text-muted">Underlying Price</p>
          <p className="text-lg font-semibold text-bloomberg-text">{data.underlyingPrice.toFixed(2)}</p>
          <p className="text-sm text-bloomberg-text-muted mt-2">P&L</p>
          <p className={`text-lg font-semibold ${data.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-2 text-sm text-bloomberg-text-muted">
        <Info size={14} />
        <span>This chart shows profit/loss at different underlying prices at expiry</span>
      </div>
      <div className="w-full h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <defs>
              <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="underlyingPrice"
              stroke="#9CA3AF"
              style={{ fontSize: '12px' }}
              label={{ value: 'Underlying Price at Expiry', position: 'insideBottom', offset: -10, fill: '#9CA3AF' }}
              domain={[minPrice * 0.95, maxPrice * 1.05]}
            />
            <YAxis
              stroke="#9CA3AF"
              style={{ fontSize: '12px' }}
              label={{ value: 'Profit / Loss (₹)', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Zero line */}
            <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="2 2" strokeWidth={2} />
            
            {/* Spot price line */}
            {spotPrice > 0 && (
              <ReferenceLine
                x={spotPrice}
                stroke="#3B82F6"
                strokeDasharray="2 2"
                strokeWidth={2}
                label={{ value: 'Current Spot', position: 'top', fill: '#3B82F6', fontSize: '11px' }}
              />
            )}
            
            {/* Breakeven lines */}
            {analysis.breakevenPoints.map((be, idx) => (
              <ReferenceLine
                key={idx}
                x={be}
                stroke="#F59E0B"
                strokeDasharray="2 2"
                strokeWidth={2}
                label={{ value: `Breakeven ${idx + 1}`, position: 'top', fill: '#F59E0B', fontSize: '11px' }}
              />
            ))}
            
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={maxPnl >= 0 ? "#10B981" : "#EF4444"}
              strokeWidth={3}
              fill="url(#colorPnl)"
              name="Payoff"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Chart Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-bloomberg-text-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-400"></div>
          <span>Profit Zone (above zero line)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-red-400"></div>
          <span>Loss Zone (below zero line)</span>
        </div>
        {spotPrice > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 border-t-2 border-blue-400 border-dashed"></div>
            <span>Current Spot Price</span>
          </div>
        )}
        {analysis.breakevenPoints.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 border-t-2 border-yellow-500 border-dashed"></div>
            <span>Breakeven Points</span>
          </div>
        )}
      </div>
    </div>
  );
}

