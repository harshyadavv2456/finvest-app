import { useMemo, useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { ScreenerRow, DailyDataResponse } from '../lib/api';

interface TechnicalsGaugesProps {
  screenerRow: ScreenerRow;
  dailyData?: DailyDataResponse | null;
}

interface GaugeProps {
  title: string;
  value: number | undefined; // 0-100, where 0 = Strong Sell, 50 = Neutral, 100 = Strong Buy, undefined = No data
  label: string;
}

function Gauge({ title, value, label }: GaugeProps) {
  // Handle undefined values - show "No data" if value is undefined
  if (value === undefined || value === null) {
    return (
      <div className="flex flex-col items-center">
        <h4 className="text-sm font-semibold text-bloomberg-text-muted mb-4">{title}</h4>
        <div className="relative">
          <svg width="240" height="140" viewBox="0 0 240 140">
            <path
              d="M 20 120 A 100 100 0 0 1 220 120"
              fill="none"
              stroke="#374151"
              strokeWidth="8"
            />
          </svg>
          <div className="absolute top-0 left-0 right-0 flex justify-between px-4 text-xs text-bloomberg-text-muted">
            <span>Strong sell</span>
            <span>Strong buy</span>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold text-bloomberg-text-muted">No data</p>
      </div>
    );
  }
  
  const displayValue = value;
  
  // Convert value (0-100) to angle (-135 to 135 degrees)
  const angle = (displayValue / 100) * 270 - 135;
  const centerX = 120;
  const centerY = 120;
  
  // Calculate pointer position
  const pointerLength = 50;
  const pointerX = centerX + Math.cos((angle * Math.PI) / 180) * pointerLength;
  const pointerY = centerY + Math.sin((angle * Math.PI) / 180) * pointerLength;

  // Determine color based on value
  const getColor = () => {
    if (displayValue < 20) return '#EF4444'; // Red (Strong Sell)
    if (displayValue < 40) return '#F97316'; // Orange (Sell)
    if (displayValue < 60) return '#A855F7'; // Purple (Neutral)
    if (displayValue < 80) return '#3B82F6'; // Blue (Buy)
    return '#10B981'; // Green (Strong Buy)
  };

  const color = getColor();

  return (
    <div className="flex flex-col items-center">
      <h4 className="text-sm font-semibold text-bloomberg-text-muted mb-4">{title}</h4>
      <div className="relative group">
        <svg width="240" height="140" viewBox="0 0 240 140">
          {/* Arc background */}
          <path
            d="M 20 120 A 100 100 0 0 1 220 120"
            fill="none"
            stroke="#374151"
            strokeWidth="8"
          />
          {/* Colored segments */}
          <path
            d="M 20 120 A 100 100 0 0 1 60 40"
            fill="none"
            stroke="#EF4444"
            strokeWidth="8"
          />
          <path
            d="M 60 40 A 100 100 0 0 1 100 30"
            fill="none"
            stroke="#F97316"
            strokeWidth="8"
          />
          <path
            d="M 100 30 A 100 100 0 0 1 140 30"
            fill="none"
            stroke="#A855F7"
            strokeWidth="8"
          />
          <path
            d="M 140 30 A 100 100 0 0 1 180 40"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="8"
          />
          <path
            d="M 180 40 A 100 100 0 0 1 220 120"
            fill="none"
            stroke="#10B981"
            strokeWidth="8"
          />
          {/* Pointer */}
          <line
            x1={centerX}
            y1={centerY}
            x2={pointerX}
            y2={pointerY}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={centerX} cy={centerY} r="6" fill={color} />
        </svg>
        {/* Labels */}
        <div className="absolute top-0 left-0 right-0 flex justify-between px-4 text-xs text-bloomberg-text-muted">
          <span>Strong sell</span>
          <span>Strong buy</span>
        </div>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-bloomberg-panel border border-bloomberg-border rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap text-xs">
          <div className="text-bloomberg-text font-semibold">Score: {displayValue.toFixed(0)}/100</div>
          <div className="text-bloomberg-text-muted">{label}</div>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

export default function TechnicalsGauges({ screenerRow, dailyData }: TechnicalsGaugesProps) {
  // Calculate oscillator signal (RSI-based)
  const oscillatorValue = useMemo(() => {
    let rsi = screenerRow.rsi14;
    
    // If RSI is missing from screenerRow, try to calculate from dailyData
    if ((rsi === null || rsi === undefined || isNaN(rsi)) && dailyData && dailyData.data && dailyData.data.length > 14) {
      // Simple RSI calculation from daily prices
      const prices = dailyData.data.slice(-15).map(d => d.close || d.adj_close || 0).filter(p => p > 0);
      if (prices.length >= 15) {
        const gains: number[] = [];
        const losses: number[] = [];
        for (let i = 1; i < prices.length; i++) {
          const change = prices[i] - prices[i - 1];
          if (change > 0) {
            gains.push(change);
            losses.push(0);
          } else {
            gains.push(0);
            losses.push(Math.abs(change));
          }
        }
        const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
        if (avgLoss !== 0) {
          const rs = avgGain / avgLoss;
          rsi = 100 - (100 / (1 + rs));
        }
      }
    }
    
    // If RSI is still null/undefined, return undefined to show "No data" instead of neutral
    if (rsi === null || rsi === undefined || isNaN(rsi)) return undefined;
    
    // RSI > 70 = overbought (sell), RSI < 30 = oversold (buy)
    // Convert to 0-100 scale where higher = more buy signal
    if (rsi > 70) return 20; // Sell
    if (rsi < 30) return 80; // Buy
    if (rsi > 50) return 40 + (70 - rsi) * 2; // Between 50-70
    return 60 - (50 - rsi) * 2; // Between 30-50
  }, [screenerRow.rsi14]);

  // Calculate moving averages signal
  const movingAveragesValue = useMemo(() => {
    let price = screenerRow.current_price;
    let sma20 = screenerRow.sma20;
    let sma50 = screenerRow.sma50;
    let sma200 = screenerRow.sma200;
    let goldenCross = screenerRow.golden_cross_50_200;
    let above50 = screenerRow.price_above_sma50;
    let above200 = screenerRow.price_above_sma200;

    // If SMAs are missing, try to calculate from dailyData
    if (dailyData && dailyData.data && dailyData.data.length > 0) {
      if (!price || price === null || isNaN(price)) {
        const latest = dailyData.data[dailyData.data.length - 1];
        price = latest.close || latest.adj_close || undefined;
      }
      
      if (price && price > 0) {
        const prices = dailyData.data.map(d => d.close || d.adj_close || 0).filter(p => p > 0);
        
        // Calculate SMA20 if missing
        if ((!sma20 || sma20 === null || isNaN(sma20)) && prices.length >= 20) {
          sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
          if (above50 === null || above50 === undefined) {
            above50 = price > sma20;
          }
        }
        
        // Calculate SMA50 if missing
        if ((!sma50 || sma50 === null || isNaN(sma50)) && prices.length >= 50) {
          sma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50;
          if (above50 === null || above50 === undefined) {
            above50 = price > sma50;
          }
        }
        
        // Calculate SMA200 if missing
        if ((!sma200 || sma200 === null || isNaN(sma200)) && prices.length >= 200) {
          sma200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200;
          if (above200 === null || above200 === undefined) {
            above200 = price > sma200;
          }
        }
        
        // Check for golden cross if we have both SMAs
        if (sma50 && sma200 && prices.length >= 2) {
          const recent50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50;
          const recent200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200;
          const prev50 = prices.length >= 51 ? prices.slice(-51, -1).reduce((a, b) => a + b, 0) / 50 : recent50;
          const prev200 = prices.length >= 201 ? prices.slice(-201, -1).reduce((a, b) => a + b, 0) / 200 : recent200;
          if (goldenCross === null || goldenCross === undefined) {
            goldenCross = recent50 > recent200 && prev50 <= prev200;
          }
        }
      }
    }

    // Need at least price and one SMA to calculate
    if (!price || price === null || isNaN(price)) return undefined;
    if (!sma200 || sma200 === null || isNaN(sma200)) {
      // Try with sma50 if available
      if (sma50 && sma50 !== null && !isNaN(sma50)) {
        if (above50 === true) return 60; // Slight buy if above SMA50
        if (above50 === false) return 40; // Slight sell if below SMA50
        // If above50 is null, calculate it
        if (price > sma50) return 60;
        return 40;
      }
      // Try with sma20 if available
      if (sma20 && sma20 !== null && !isNaN(sma20)) {
        if (price > sma20) return 55; // Slight buy
        return 45; // Slight sell
      }
      return undefined;
    }

    // Strong buy signals
    if (goldenCross === true && above200 === true && above50 === true) return 90; // Strong Buy
    if (above200 === true && above50 === true) return 75; // Buy
    if (above200 === true) return 65; // Slight Buy
    
    // Neutral
    if (above50 === true) return 50; // Neutral
    
    // Sell signals
    if (above50 === false && above200 === false) return 25; // Sell
    if (above200 === false) return 35; // Slight Sell
    return 50; // Default neutral
  }, [screenerRow, dailyData]);

  // Calculate summary (average of oscillators and moving averages)
  const summaryValue = useMemo(() => {
    const values = [oscillatorValue, movingAveragesValue].filter(v => v !== null && v !== undefined);
    if (values.length === 0) return undefined;
    if (values.length === 1) return values[0] ?? undefined;
    return Math.round((values[0]! + values[1]!) / 2);
  }, [oscillatorValue, movingAveragesValue]);

  const getLabel = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'No data';
    if (value < 20) return 'Strong sell';
    if (value < 40) return 'Sell';
    if (value < 60) return 'Neutral';
    if (value < 80) return 'Buy';
    return 'Strong buy';
  };

  // Calculate breakdown for explanations
  const oscillatorBreakdown = useMemo(() => {
    const rsi = screenerRow.rsi14 ?? (dailyData && dailyData.data && dailyData.data.length > 14 
      ? (() => {
          const prices = dailyData.data.slice(-15).map(d => d.close || d.adj_close || 0).filter(p => p > 0);
          if (prices.length < 15) return null;
          const gains: number[] = [];
          const losses: number[] = [];
          for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
              gains.push(change);
              losses.push(0);
            } else {
              gains.push(0);
              losses.push(Math.abs(change));
            }
          }
          const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
          const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
          if (avgLoss === 0) return null;
          const rs = avgGain / avgLoss;
          return 100 - (100 / (1 + rs));
        })() 
      : null);
    
    if (rsi === null || rsi === undefined || isNaN(rsi)) {
      return { buy: 0, neutral: 0, sell: 0, total: 0, indicators: [] };
    }
    
    let signal: 'buy' | 'neutral' | 'sell' = 'neutral';
    if (rsi > 70) signal = 'sell';
    else if (rsi < 30) signal = 'buy';
    
    return {
      buy: signal === 'buy' ? 1 : 0,
      neutral: signal === 'neutral' ? 1 : 0,
      sell: signal === 'sell' ? 1 : 0,
      total: 1,
      indicators: [`RSI(14): ${rsi.toFixed(1)}`],
    };
  }, [screenerRow.rsi14, dailyData]);

  const movingAveragesBreakdown = useMemo(() => {
    const price = screenerRow.current_price;
    const sma20 = screenerRow.sma20;
    const sma50 = screenerRow.sma50;
    const sma200 = screenerRow.sma200;
    const above50 = screenerRow.price_above_sma50;
    const above200 = screenerRow.price_above_sma200;
    const goldenCross = screenerRow.golden_cross_50_200;
    
    const indicators: string[] = [];
    let buy = 0, neutral = 0, sell = 0;
    
    if (price && sma200) {
      indicators.push(`Price vs SMA200: ${above200 ? 'Above' : 'Below'}`);
      if (above200) buy++;
      else sell++;
    }
    if (price && sma50) {
      indicators.push(`Price vs SMA50: ${above50 ? 'Above' : 'Below'}`);
      if (above50) buy++;
      else sell++;
    }
    if (sma20 && price) {
      const above20 = price > sma20;
      indicators.push(`Price vs SMA20: ${above20 ? 'Above' : 'Below'}`);
      if (above20) buy++;
      else sell++;
    }
    if (goldenCross === true) {
      indicators.push('Golden Cross (SMA50 > SMA200): Yes');
      buy++;
    }
    
    if (buy === 0 && sell === 0) neutral = 1;
    
    return { buy, neutral, sell, total: buy + neutral + sell, indicators };
  }, [screenerRow]);

  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-bloomberg-text">Technicals</h3>
          <span className="text-xs text-bloomberg-text-muted">Summarizing what the indicators are suggesting.</span>
        </div>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex items-center gap-1 text-xs text-bloomberg-accent hover:text-bloomberg-accent-hover transition-colors"
        >
          <Info size={14} />
          {showExplanation ? 'Hide' : 'How this works'}
          {showExplanation ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      
      {showExplanation && (
        <div className="mb-6 p-4 bg-bloomberg-dark border border-bloomberg-border rounded-lg text-sm">
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-bloomberg-text mb-2">Summary</h4>
              <p className="text-bloomberg-text-muted text-xs">
                Aggregate signal combining Oscillators and Moving Averages. Calculated as the average of both components.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-bloomberg-text mb-2">Oscillators</h4>
              <p className="text-bloomberg-text-muted text-xs mb-2">
                Based on RSI(14): RSI &gt; 70 = Overbought (Sell), RSI &lt; 30 = Oversold (Buy), 30-70 = Neutral
              </p>
              {oscillatorBreakdown.total > 0 && (
                <p className="text-xs text-bloomberg-text">
                  Signals: {oscillatorBreakdown.buy} Buy / {oscillatorBreakdown.neutral} Neutral / {oscillatorBreakdown.sell} Sell
                </p>
              )}
              {oscillatorBreakdown.indicators.length > 0 && (
                <ul className="text-xs text-bloomberg-text-muted mt-1 list-disc list-inside">
                  {oscillatorBreakdown.indicators.map((ind, i) => (
                    <li key={i}>{ind}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-bloomberg-text mb-2">Moving Averages</h4>
              <p className="text-bloomberg-text-muted text-xs mb-2">
                Based on price position relative to SMA20, SMA50, and SMA200. Price above moving averages = Buy signal, below = Sell signal. Golden Cross (SMA50 crosses above SMA200) = Strong Buy.
              </p>
              {movingAveragesBreakdown.total > 0 && (
                <p className="text-xs text-bloomberg-text">
                  Signals: {movingAveragesBreakdown.buy} Buy / {movingAveragesBreakdown.neutral} Neutral / {movingAveragesBreakdown.sell} Sell
                </p>
              )}
              {movingAveragesBreakdown.indicators.length > 0 && (
                <ul className="text-xs text-bloomberg-text-muted mt-1 list-disc list-inside">
                  {movingAveragesBreakdown.indicators.map((ind, i) => (
                    <li key={i}>{ind}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Gauge
          title="Summary"
          value={summaryValue}
          label={getLabel(summaryValue ?? null)}
        />
        <Gauge
          title="Oscillators"
          value={oscillatorValue}
          label={getLabel(oscillatorValue ?? null)}
        />
        <Gauge
          title="Moving Averages"
          value={movingAveragesValue}
          label={getLabel(movingAveragesValue ?? null)}
        />
      </div>
    </div>
  );
}

