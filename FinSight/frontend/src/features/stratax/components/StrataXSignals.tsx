/**
 * StrataX Signals Component
 * 
 * Intuitive option chain insights with visual indicators and explanations.
 * No expiry filter - shows aggregate signals across all expiries.
 */

import { useState, useEffect } from 'react';
import { useStrataXOptionChain } from '../hooks/useStrataXOptionChain';
import { calculateSignals, calculateSupportResistance } from '../utils/signalsCalculator';
import { api } from '../../../lib/api';
import { Info, TrendingUp, TrendingDown, Shield, Target, Activity } from 'lucide-react';
import Tooltip from './Tooltip';

export default function StrataXSignals() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const { rows, loading, error } = useStrataXOptionChain(symbol);

  // Load available symbols
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const symbols = await api.getStrataXUnderlyings();
        setAvailableSymbols(symbols);
      } catch (err) {
        console.error('Failed to load symbols:', err);
      }
    };
    loadSymbols();
  }, []);

  // Get spot price from first row
  const spotPrice = rows.length > 0 ? rows[0].underlyingValue : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-2">
        <div className="text-bloomberg-text-muted">Loading signals...</div>
        <div className="text-xs text-bloomberg-text-muted">Analyzing option chain data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-2">
        <div className="text-red-400 font-semibold">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-2">
        <div className="text-bloomberg-text-muted">No option chain data available</div>
        <div className="text-xs text-bloomberg-text-muted">Try selecting a different symbol</div>
      </div>
    );
  }

  const signals = calculateSignals(rows);
  const { support, resistance } = calculateSupportResistance(rows);

  const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null) return '-';
    return value.toFixed(decimals);
  };

  const formatLargeNumber = (value: number | null | undefined): string => {
    if (value === undefined || value === null) return '-';
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  const getPCRColor = (pcr: number): string => {
    if (pcr > 1.5) return 'text-red-400'; // Bearish
    if (pcr < 0.7) return 'text-green-400'; // Bullish
    return 'text-yellow-400'; // Neutral
  };

  const getPCRInterpretation = (pcr: number): string => {
    if (pcr > 1.5) return 'Bearish (More puts than calls)';
    if (pcr < 0.7) return 'Bullish (More calls than puts)';
    return 'Neutral (Balanced)';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-bloomberg-text-muted">Symbol:</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-bloomberg-dark border border-bloomberg-border rounded-lg px-3 py-2 text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                {availableSymbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {spotPrice && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-bloomberg-text-muted">Spot:</span>
                <span className="text-lg font-bold text-blue-400">{formatNumber(spotPrice)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-bloomberg-text-muted">Put/Call Ratio (PCR)</span>
            <Tooltip content="Ratio of put OI to call OI. High PCR (>1.5) = bearish, Low PCR (<0.7) = bullish">
              <Info size={12} className="text-bloomberg-text-muted cursor-help" />
            </Tooltip>
          </div>
          <div className={`text-3xl font-bold ${getPCRColor(signals.pcr)}`}>
            {formatNumber(signals.pcr, 2)}
          </div>
          <div className={`text-sm mt-2 ${getPCRColor(signals.pcr)}`}>
            {getPCRInterpretation(signals.pcr)}
          </div>
          <div className="text-xs text-bloomberg-text-muted mt-1">
            <div>• &gt;1.5 = Bearish sentiment</div>
            <div>• &lt;0.7 = Bullish sentiment</div>
            <div>• 0.7-1.5 = Neutral</div>
          </div>
        </div>

        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-bloomberg-text-muted">IV Rank</span>
            <Tooltip content="Implied Volatility rank (0-100%). High IV = expensive options, Low IV = cheap options">
              <Info size={12} className="text-bloomberg-text-muted cursor-help" />
            </Tooltip>
          </div>
          <div className="text-3xl font-bold text-bloomberg-text-muted">
            {signals.ivRank !== null && signals.ivRank !== undefined ? formatNumber(signals.ivRank, 1) + '%' : 'N/A'}
          </div>
          <div className="text-sm text-bloomberg-text-muted mt-2">
            {signals.ivRank !== null && signals.ivRank !== undefined
              ? signals.ivRank > 75
                ? 'High IV - Options are expensive'
                : signals.ivRank < 25
                ? 'Low IV - Options are cheap'
                : 'Moderate IV'
              : 'Not available'}
          </div>
        </div>

        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-bloomberg-text-muted">Spot Price</span>
            <Tooltip content="Current underlying asset price">
              <Info size={12} className="text-bloomberg-text-muted cursor-help" />
            </Tooltip>
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {formatNumber(spotPrice)}
          </div>
          <div className="text-sm text-bloomberg-text-muted mt-2">
            Current market price
          </div>
        </div>
      </div>

      {/* Support & Resistance Levels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="text-green-400" size={18} />
            <h4 className="text-sm font-semibold text-bloomberg-text">Support Levels</h4>
            <Tooltip content="Strikes with high PUT open interest act as support (price tends to bounce up from here)">
              <Info size={12} className="text-bloomberg-text-muted cursor-help" />
            </Tooltip>
          </div>
          {support.length > 0 ? (
            <div className="space-y-2">
              {support.slice(0, 5).map((level, idx) => (
                <div
                  key={idx}
                  className="bg-bloomberg-dark rounded p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-green-400" size={16} />
                    <span className="text-sm font-semibold text-bloomberg-text">{level}</span>
                  </div>
                  <span className="text-xs text-bloomberg-text-muted">High PUT OI</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-bloomberg-text-muted">No support levels identified</div>
          )}
        </div>

        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="text-red-400" size={18} />
            <h4 className="text-sm font-semibold text-bloomberg-text">Resistance Levels</h4>
            <Tooltip content="Strikes with high CALL open interest act as resistance (price tends to fall from here)">
              <Info size={12} className="text-bloomberg-text-muted cursor-help" />
            </Tooltip>
          </div>
          {resistance.length > 0 ? (
            <div className="space-y-2">
              {resistance.slice(0, 5).map((level, idx) => (
                <div
                  key={idx}
                  className="bg-bloomberg-dark rounded p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <TrendingDown className="text-red-400" size={16} />
                    <span className="text-sm font-semibold text-bloomberg-text">{level}</span>
                  </div>
                  <span className="text-xs text-bloomberg-text-muted">High CALL OI</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-bloomberg-text-muted">No resistance levels identified</div>
          )}
        </div>
      </div>

      {/* Highest OI Strikes */}
      <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="text-blue-400" size={18} />
          <h4 className="text-sm font-semibold text-bloomberg-text">Highest Open Interest (Key Levels)</h4>
          <Tooltip content="Strikes with highest open interest - these act as strong support/resistance levels">
            <Info size={12} className="text-bloomberg-text-muted cursor-help" />
          </Tooltip>
        </div>
        {signals.highestOIStrikes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {signals.highestOIStrikes.slice(0, 10).map((item, idx) => (
              <div
                key={idx}
                className="bg-bloomberg-dark rounded p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-bloomberg-text">{item.strike}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.optionType === 'CALL' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.optionType}
                  </span>
                </div>
                <div className="text-sm text-blue-400 font-semibold">
                  OI: {formatLargeNumber(item.oi)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-bloomberg-text-muted">No OI data available</div>
        )}
      </div>

      {/* Highest OI Change */}
      <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-green-400" size={18} />
          <h4 className="text-sm font-semibold text-bloomberg-text">Highest OI Change (Buildup/Unwinding)</h4>
          <Tooltip content="Strikes with biggest OI changes - positive = buildup (new positions), negative = unwinding (closing positions)">
            <Info size={12} className="text-bloomberg-text-muted cursor-help" />
          </Tooltip>
        </div>
        {signals.highestOIChange.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {signals.highestOIChange.slice(0, 10).map((item, idx) => (
              <div
                key={idx}
                className="bg-bloomberg-dark rounded p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-bloomberg-text">{item.strike}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.optionType === 'CALL' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.optionType}
                  </span>
                </div>
                <div className={`text-sm font-semibold flex items-center gap-1 ${
                  item.oiChange > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {item.oiChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {item.oiChange > 0 ? '+' : ''}{formatLargeNumber(item.oiChange)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-bloomberg-text-muted">No OI change data available</div>
        )}
      </div>

      {/* Most Active Strikes */}
      <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="text-yellow-400" size={18} />
          <h4 className="text-sm font-semibold text-bloomberg-text">Most Active Strikes (by Volume)</h4>
          <Tooltip content="Strikes with highest trading volume today - indicates active interest">
            <Info size={12} className="text-bloomberg-text-muted cursor-help" />
          </Tooltip>
        </div>
        {signals.mostActiveStrikes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {signals.mostActiveStrikes.slice(0, 10).map((item, idx) => (
              <div
                key={idx}
                className="bg-bloomberg-dark rounded p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-bloomberg-text">{item.strike}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.optionType === 'CALL' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.optionType}
                  </span>
                </div>
                <div className="text-sm text-yellow-400 font-semibold">
                  Vol: {formatLargeNumber(item.volume)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-bloomberg-text-muted">No volume data available</div>
        )}
      </div>
    </div>
  );
}
