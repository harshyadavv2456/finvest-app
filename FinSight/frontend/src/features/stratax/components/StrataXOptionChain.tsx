/**
 * StrataX Option Chain Component
 * 
 * Intuitive option chain display with explanations and visual indicators.
 * Shows all expiries together, grouped by strike.
 */

import { useState, useEffect, useMemo } from 'react';
import { useStrataXOptionChain } from '../hooks/useStrataXOptionChain';
import { useStrataXAnalytics } from '../hooks/useStrataXAnalytics';
import { StrataXOptionRow } from '../types/strataxTypes';
import { api } from '../../../lib/api';
import { Info, TrendingUp, TrendingDown, Minus, Calendar, Sparkles, Loader2 } from 'lucide-react';
import Tooltip from './Tooltip';

interface GroupedRow {
  strike: number;
  call?: StrataXOptionRow;
  put?: StrataXOptionRow;
}

export default function StrataXOptionChain() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const { rows, loading, error } = useStrataXOptionChain(symbol);
  const { analytics } = useStrataXAnalytics(symbol);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

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

  // Load available expiries from rows - only update when rows change
  useEffect(() => {
    if (rows.length > 0) {
      const expiries = Array.from(new Set(rows.map(r => r.expiryDate).filter(Boolean))).sort();
      setAvailableExpiries(expiries);
      // Only auto-select expiry if none is selected or the selected one is invalid
      if (expiries.length > 0) {
        setSelectedExpiry(prev => {
          if (!prev || !expiries.includes(prev)) {
            return expiries[0];
          }
          return prev;
        });
      }
    }
  }, [rows]); // Removed selectedExpiry from deps to prevent infinite loops

  // Group rows by strike, filtered by selected expiry
  const groupedRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    
    // Filter by selected expiry if set
    const filteredRows = selectedExpiry 
      ? rows.filter(row => (row.expiryDate || '').trim() === selectedExpiry.trim())
      : rows;
    
    if (filteredRows.length === 0) return [];
    
    // Group by strike
    const strikeMap = new Map<number, GroupedRow>();
    
    filteredRows.forEach(row => {
      const strike = row.strikePrice;
      if (!strike || strike === 0 || isNaN(strike)) return;
      
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          strike,
        });
      }
      
      const grouped = strikeMap.get(strike)!;
      if (row.optionType === 'CE') {
        grouped.call = row;
      } else if (row.optionType === 'PE') {
        grouped.put = row;
      }
    });
    
    return Array.from(strikeMap.values())
      .filter(row => {
        const hasCallData = row.call && (
          (row.call.lastPrice && row.call.lastPrice > 0) ||
          (row.call.openInterest && row.call.openInterest > 0) ||
          (row.call.totalTradedVolume && row.call.totalTradedVolume > 0)
        );
        const hasPutData = row.put && (
          (row.put.lastPrice && row.put.lastPrice > 0) ||
          (row.put.openInterest && row.put.openInterest > 0) ||
          (row.put.totalTradedVolume && row.put.totalTradedVolume > 0)
        );
        return hasCallData || hasPutData;
      })
      .sort((a, b) => a.strike - b.strike);
  }, [rows, selectedExpiry]);

  // Get spot price from first row
  const spotPrice = rows.length > 0 ? rows[0].underlyingValue : null;

  const handleAnalyze = async () => {
    if (!spotPrice) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const analysis = await api.analyzeStrataXOptionChain(symbol, spotPrice);
      setAiAnalysis(analysis.analysis || 'Analysis completed but no content returned.');
    } catch (err: any) {
      setAiAnalysis(`Error: ${err.message || 'Failed to analyze option chain'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null || value === 0) return '-';
    return value.toFixed(decimals);
  };

  const formatLargeNumber = (value: number | null | undefined): string => {
    if (value === undefined || value === null || value === 0) return '-';
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  const getChangeColor = (change: number | null | undefined): string => {
    if (change === undefined || change === null || change === 0) return 'text-bloomberg-text-muted';
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-bloomberg-text-muted';
  };

  const getChangeIcon = (change: number | null | undefined) => {
    if (change === undefined || change === null || change === 0) return <Minus size={12} />;
    if (change > 0) return <TrendingUp size={12} className="text-green-400" />;
    return <TrendingDown size={12} className="text-red-400" />;
  };

  const getIVColor = (iv: number | null | undefined): string => {
    if (!iv || iv === 0) return 'text-bloomberg-text-muted';
    // IV from CSV is already in percentage form (e.g., 35.10 for 35.10%)
    // If value > 100, it's likely already multiplied, so divide by 100
    const ivPercent = iv > 100 ? iv / 100 : iv;
    if (ivPercent > 30) return 'text-red-400'; // High IV - expensive
    if (ivPercent < 15) return 'text-green-400'; // Low IV - cheap
    return 'text-yellow-400'; // Moderate IV
  };

  const formatIV = (iv: number | null | undefined): string => {
    if (!iv || iv === 0) return '-';
    // IV from CSV: if > 100, divide by 100 to get percentage
    const ivPercent = iv > 100 ? iv / 100 : iv;
    return ivPercent.toFixed(2) + '%';
  };

  const getOIColor = (oi: number | null | undefined): string => {
    if (!oi || oi === 0) return 'text-bloomberg-text-muted';
    if (oi > 1000000) return 'text-blue-400'; // Very high OI - strong support/resistance
    if (oi > 500000) return 'text-cyan-400'; // High OI
    return 'text-bloomberg-text-muted';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-2">
        <div className="text-bloomberg-text-muted">Loading option chain...</div>
        <div className="text-xs text-bloomberg-text-muted">Loading data from CSV...</div>
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

  return (
    <div className="space-y-4">
      {/* Header with Symbol and Expiry Selector */}
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-bloomberg-text">Underlying:</label>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setSelectedExpiry('');
                }}
                className="bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-2 text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold min-w-[120px]"
              >
                {availableSymbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            {availableExpiries.length > 0 && (
              <div className="flex items-center gap-2">
                <Calendar className="text-blue-400" size={18} />
                <label className="text-sm font-semibold text-bloomberg-text">Expiry:</label>
                <select
                  value={selectedExpiry}
                  onChange={(e) => setSelectedExpiry(e.target.value)}
                  className="bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-2 text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold min-w-[150px]"
                >
                  {availableExpiries.map(e => {
                    const date = new Date(e);
                    const formatted = !isNaN(date.getTime()) 
                      ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : e;
                    return (
                      <option key={e} value={e}>{formatted}</option>
                    );
                  })}
                </select>
              </div>
            )}
            
            {spotPrice && (
              <div className="flex items-center gap-2 bg-bloomberg-dark/50 rounded-lg px-3 py-2">
                <span className="text-xs text-bloomberg-text-muted">Spot:</span>
                <span className="text-lg font-bold text-blue-400">{formatNumber(spotPrice)}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 bg-bloomberg-dark/50 rounded-lg px-3 py-2">
              <span className="text-xs text-bloomberg-text-muted">Strikes:</span>
              <span className="text-sm font-semibold text-bloomberg-text">{groupedRows.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !spotPrice}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  AI Analyze
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sensibull-style analytics strip - Max Pain, PCR, ATM straddle,
          support/resistance. All computed server-side from the real
          reconstructed chain (AngelOne primary, CSV fallback). */}
      {analytics.available && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              Max Pain
              <Tooltip content="The strike where option writers (sellers) collectively lose the least - often acts as a magnet for price near expiry">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-lg font-bold text-bloomberg-text">{formatNumber(analytics.max_pain, 0)}</div>
          </div>
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              PCR (OI)
              <Tooltip content="Put-Call Ratio by open interest. Above 1 = more put OI than call OI (often read as bearish positioning / support building); below 1 = the reverse">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className={`text-lg font-bold ${
              analytics.pcr_oi != null ? (analytics.pcr_oi > 1 ? 'text-red-400' : 'text-green-400') : 'text-bloomberg-text'
            }`}>
              {analytics.pcr_oi != null ? analytics.pcr_oi.toFixed(2) : '-'}
            </div>
          </div>
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              ATM Straddle
              <Tooltip content="ATM call + ATM put premium - the market's own implied move for this expiry">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-lg font-bold text-purple-400">{formatNumber(analytics.atm_straddle_price)}</div>
          </div>
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              Resistance
              <Tooltip content="Highest call OI strike - the level where the most call sellers are positioned">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-lg font-bold text-red-400">{formatNumber(analytics.resistance_strike, 0)}</div>
          </div>
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              Support
              <Tooltip content="Highest put OI strike - the level where the most put sellers are positioned">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-lg font-bold text-green-400">{formatNumber(analytics.support_strike, 0)}</div>
          </div>
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-3">
            <div className="text-xs text-bloomberg-text-muted mb-1 flex items-center gap-1">
              Call/Put OI
              <Tooltip content="Total open interest across all strikes, calls vs puts">
                <Info size={10} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-sm font-bold text-bloomberg-text">
              <span className="text-blue-400">{formatLargeNumber(analytics.total_call_oi)}</span>
              {' / '}
              <span className="text-red-400">{formatLargeNumber(analytics.total_put_oi)}</span>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis Results */}
      {aiAnalysis && (
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="text-purple-400" size={20} />
            <h3 className="text-lg font-semibold text-bloomberg-text">AI Analysis</h3>
          </div>
          <div className="bg-bloomberg-dark/50 rounded-lg p-4 text-sm text-bloomberg-text whitespace-pre-wrap max-h-96 overflow-y-auto">
            {aiAnalysis}
          </div>
        </div>
      )}

      {/* Legend/Explanation */}
      <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info size={16} className="text-blue-400 mt-0.5" />
          <h3 className="text-sm font-semibold text-bloomberg-text">Understanding the Option Chain</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-bloomberg-text-muted">
          <div>
            <div className="font-semibold text-bloomberg-text mb-1">LTP (Last Traded Price)</div>
            <div>Current market price of the option</div>
          </div>
          <div>
            <div className="font-semibold text-bloomberg-text mb-1">OI (Open Interest)</div>
            <div className="text-blue-400">High OI = Strong support/resistance level</div>
            <div>Total outstanding contracts</div>
          </div>
          <div>
            <div className="font-semibold text-bloomberg-text mb-1">IV (Implied Volatility)</div>
            <div className="text-red-400">High IV (&gt;30%) = Expensive options</div>
            <div className="text-green-400">Low IV (&lt;15%) = Cheap options</div>
            <div>Market's expectation of price movement</div>
          </div>
        </div>
      </div>

      {/* Option Chain Table */}
      <div className="overflow-x-auto bg-bloomberg-panel border border-bloomberg-border rounded-lg">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bloomberg-dark border-b border-bloomberg-border">
              <th className="text-left px-4 py-3 text-sm font-semibold text-bloomberg-text sticky left-0 bg-bloomberg-dark z-10 border-r border-bloomberg-border">
                <div className="flex items-center gap-1">
                  Strike
                  <Tooltip content="Option strike price - the price at which you can exercise the option to buy (CALL) or sell (PUT)">
                    <Info size={12} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th colSpan={6} className="text-center px-4 py-3 text-sm font-semibold text-blue-400 border-l border-bloomberg-border">
                CALL OPTIONS (Right to Buy)
              </th>
              <th colSpan={6} className="text-center px-4 py-3 text-sm font-semibold text-red-400 border-l border-bloomberg-border">
                PUT OPTIONS (Right to Sell)
              </th>
            </tr>
            <tr className="bg-bloomberg-dark border-b border-bloomberg-border">
              <th className="text-left px-4 py-2 text-xs font-semibold text-bloomberg-text-muted sticky left-0 bg-bloomberg-dark z-10 border-r border-bloomberg-border"></th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  LTP
                  <Tooltip content="Last Traded Price - current market price of the option contract">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  Chg
                  <Tooltip content="Price change from previous trading session. Green = up, Red = down">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  Vol
                  <Tooltip content="Volume - total number of contracts traded today. Higher volume = more liquidity">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  OI
                  <Tooltip content="Open Interest - total outstanding contracts. High OI at a strike = strong support (PUT) or resistance (CALL)">
                    <Info size={10} className="text-blue-400 cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  OI Chg
                  <Tooltip content="Open Interest Change - positive (+) = buildup (new positions), negative (-) = unwinding (closing positions)">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  IV
                  <Tooltip content="Implied Volatility - market's expectation of price movement. High IV (>30%) = expensive options, Low IV (<15%) = cheap options">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted border-l border-bloomberg-border">
                <div className="flex items-center justify-end gap-1">
                  LTP
                  <Tooltip content="Last Traded Price - current market price of the option contract">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  Chg
                  <Tooltip content="Price change from previous trading session. Green = up, Red = down">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  Vol
                  <Tooltip content="Volume - total number of contracts traded today. Higher volume = more liquidity">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  OI
                  <Tooltip content="Open Interest - total outstanding contracts. High OI at a strike = strong support (PUT) or resistance (CALL)">
                    <Info size={10} className="text-blue-400 cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  OI Chg
                  <Tooltip content="Open Interest Change - positive (+) = buildup (new positions), negative (-) = unwinding (closing positions)">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
              <th className="text-right px-2 py-2 text-xs font-semibold text-bloomberg-text-muted">
                <div className="flex items-center justify-end gap-1">
                  IV
                  <Tooltip content="Implied Volatility - market's expectation of price movement. High IV (>30%) = expensive options, Low IV (<15%) = cheap options">
                    <Info size={10} className="text-bloomberg-text-muted cursor-help" />
                  </Tooltip>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((row, idx) => {
              const isATM = spotPrice ? Math.abs(row.strike - spotPrice) < (spotPrice * 0.02) : false;
              const distanceFromSpot = spotPrice ? ((row.strike - spotPrice) / spotPrice * 100) : 0;
              
              return (
                <tr
                  key={`${row.strike}-${idx}`}
                  className={`border-b border-bloomberg-border hover:bg-bloomberg-dark/50 transition-colors ${
                    isATM ? 'bg-blue-500/20 border-l-4 border-l-blue-400' : ''
                  }`}
                >
                  <td className={`px-4 py-2 text-sm font-semibold sticky left-0 bg-inherit z-10 border-r border-bloomberg-border ${
                    isATM ? 'text-blue-400' : 'text-bloomberg-text'
                  }`}>
                    <div className="flex items-center gap-2">
                      {row.strike}
                      {isATM && (
                        <span className="text-xs text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">ATM</span>
                      )}
                      {!isATM && spotPrice && (
                        <span className={`text-xs ${
                          distanceFromSpot > 0 ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {distanceFromSpot > 0 ? '↑' : '↓'} {Math.abs(distanceFromSpot).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Call columns */}
                  <td className="text-right px-2 py-2 text-sm text-bloomberg-text font-medium">
                    {row.call?.lastPrice && row.call.lastPrice > 0
                      ? formatNumber(row.call.lastPrice)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm ${getChangeColor(row.call?.change)}`}>
                    <div className="flex items-center justify-end gap-1">
                      {getChangeIcon(row.call?.change)}
                      {row.call?.change !== undefined && row.call?.change !== null && row.call.change !== 0
                        ? (row.call.change > 0 ? '+' : '') + formatNumber(row.call.change) 
                        : '-'}
                    </div>
                  </td>
                  <td className="text-right px-2 py-2 text-sm text-bloomberg-text-muted">
                    {row.call?.totalTradedVolume && row.call.totalTradedVolume > 0
                      ? formatLargeNumber(row.call.totalTradedVolume)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm font-medium ${getOIColor(row.call?.openInterest)}`}>
                    {row.call?.openInterest && row.call.openInterest > 0
                      ? formatLargeNumber(row.call.openInterest)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm ${getChangeColor(row.call?.changeInOI)}`}>
                    {row.call?.changeInOI !== undefined && row.call?.changeInOI !== null && row.call.changeInOI !== 0
                      ? (row.call.changeInOI > 0 ? '+' : '') + formatLargeNumber(row.call.changeInOI) 
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm font-medium ${getIVColor(row.call?.impliedVolatility)}`}>
                    {formatIV(row.call?.impliedVolatility)}
                  </td>
                  {/* Put columns */}
                  <td className="text-right px-2 py-2 text-sm text-bloomberg-text font-medium border-l border-bloomberg-border">
                    {row.put?.lastPrice && row.put.lastPrice > 0
                      ? formatNumber(row.put.lastPrice)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm ${getChangeColor(row.put?.change)}`}>
                    <div className="flex items-center justify-end gap-1">
                      {getChangeIcon(row.put?.change)}
                      {row.put?.change !== undefined && row.put?.change !== null && row.put.change !== 0
                        ? (row.put.change > 0 ? '+' : '') + formatNumber(row.put.change) 
                        : '-'}
                    </div>
                  </td>
                  <td className="text-right px-2 py-2 text-sm text-bloomberg-text-muted">
                    {row.put?.totalTradedVolume && row.put.totalTradedVolume > 0
                      ? formatLargeNumber(row.put.totalTradedVolume)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm font-medium ${getOIColor(row.put?.openInterest)}`}>
                    {row.put?.openInterest && row.put.openInterest > 0
                      ? formatLargeNumber(row.put.openInterest)
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm ${getChangeColor(row.put?.changeInOI)}`}>
                    {row.put?.changeInOI !== undefined && row.put?.changeInOI !== null && row.put.changeInOI !== 0
                      ? (row.put.changeInOI > 0 ? '+' : '') + formatLargeNumber(row.put.changeInOI) 
                      : '-'}
                  </td>
                  <td className={`text-right px-2 py-2 text-sm font-medium ${getIVColor(row.put?.impliedVolatility)}`}>
                    {formatIV(row.put?.impliedVolatility)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
