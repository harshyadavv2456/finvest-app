/**
 * StrataX Strategy Builder Component
 * 
 * Intuitive multi-leg options strategy builder with visual feedback.
 * Rebuilt from scratch for better UX.
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Eye, EyeOff, Save, Info, AlertTriangle, Zap } from 'lucide-react';
import { useStrataXStrategy } from '../hooks/useStrataXStrategy';
import { StrataXOptionLeg, OptionType, ActionType } from '../types/strataxTypes';
import StrataXPayoffChart from './StrataXPayoffChart';
import { useStrataXPaperTrades } from '../hooks/useStrataXPaperTrades';
import { useStrataXOptionChain } from '../hooks/useStrataXOptionChain';
import { api } from '../../../lib/api';
import Tooltip from './Tooltip';
import { validateStrategy, getStrategyType } from '../utils/strategyValidator';
import { calculateProbabilityOfProfit } from '../utils/probabilityCalculator';
import { DEFAULT_RISK_FREE_RATE } from '../utils/blackScholes';

export default function StrataXStrategyBuilder() {
  const { savePaperTrade } = useStrataXPaperTrades();
  const [showGreeks, setShowGreeks] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [tradeNotes, setTradeNotes] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  
  // Fetch option chain for selected symbol
  const { rows } = useStrataXOptionChain(selectedSymbol);
  
  // Get spot price from option chain
  const spotPrice = rows.length > 0 ? rows[0].underlyingValue : null;
  
  const { strategy, analysis, addLeg, removeLeg, updateLeg } = useStrataXStrategy(undefined, {
    spotPrice,
    optionChainData: rows,
  });

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

  // Get available strikes from option chain (spotPrice already defined above)
  const availableStrikes = useMemo(() => {
    const strikes = new Set<number>();
    rows.forEach(row => {
      if (row.strikePrice && row.strikePrice > 0) {
        strikes.add(row.strikePrice);
      }
    });
    return Array.from(strikes).sort((a, b) => a - b);
  }, [rows]);

  // Get unique expiries from rows
  const expiriesFromData = useMemo(() => {
    const expSet = new Set<string>();
    rows.forEach(row => {
      if (row.expiryDate) {
        expSet.add(row.expiryDate);
      }
    });
    return Array.from(expSet).sort();
  }, [rows]);

  const handleAddLeg = () => {
    const defaultStrike = availableStrikes.length > 0 
      ? availableStrikes[Math.floor(availableStrikes.length / 2)] 
      : spotPrice || 24500;
    
    addLeg({
      underlying: selectedSymbol,
      expiry: expiriesFromData[0] || new Date().toISOString().split('T')[0],
      optionType: 'CALL',
      action: 'BUY',
      strike: defaultStrike,
      quantity: 1,
      entryPrice: 0,
    });
  };

  const handleLegChange = (legId: string, field: keyof StrataXOptionLeg, value: any) => {
    updateLeg(legId, { [field]: value });
    
    // Auto-fill entry price when strike/optionType/expiry changes
    if ((field === 'strike' || field === 'optionType' || field === 'expiry') && rows.length > 0) {
      const leg = strategy.legs.find(l => l.id === legId);
      if (leg) {
        const newStrike = field === 'strike' ? value : leg.strike;
        const newOptionType = field === 'optionType' ? value : leg.optionType;
        const newExpiry = field === 'expiry' ? value : leg.expiry;
        
        // Find matching row
        const matchingRow = rows.find(r => 
          r.strikePrice === newStrike &&
          r.optionType === (newOptionType === 'CALL' ? 'CE' : 'PE') &&
          r.expiryDate === newExpiry
        );
        
        if (matchingRow && matchingRow.lastPrice !== null && matchingRow.lastPrice !== undefined && matchingRow.lastPrice > 0) {
          updateLeg(legId, { entryPrice: matchingRow.lastPrice });
        }
      }
    }
  };

  // Get LTP and IV for a leg
  const getLegData = (leg: StrataXOptionLeg) => {
    const matchingRow = rows.find(r => 
      r.strikePrice === leg.strike &&
      r.optionType === (leg.optionType === 'CALL' ? 'CE' : 'PE') &&
      r.expiryDate === leg.expiry
    );
    
    return {
      ltp: matchingRow?.lastPrice || null,
      iv: matchingRow?.impliedVolatility || null,
    };
  };

  const formatNumber = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    if (value === Infinity || value === -Infinity) return '∞';
    return value.toFixed(2);
  };

  const handleSavePaperTrade = () => {
    if (!tradeName.trim()) {
      alert('Please enter a name for the paper trade');
      return;
    }

    if (strategy.legs.length === 0) {
      alert('Please add at least one leg to the strategy');
      return;
    }

    savePaperTrade({
      name: tradeName.trim(),
      strategy: {
        ...strategy,
        updatedAt: new Date().toISOString(),
      },
      entryTimestamp: new Date().toISOString(),
      notes: tradeNotes.trim() || undefined,
    });

    setShowSaveDialog(false);
    setTradeName('');
    setTradeNotes('');
    alert('Paper trade saved successfully!');
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
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
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
          <button
            onClick={handleAddLeg}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
          >
            <Plus size={18} />
            Add Leg
          </button>
        </div>
      </div>

      {/* Greeks Disclaimer Banner */}
      {strategy.legs.length > 0 && (
        <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-yellow-400 mb-1">
                ⚠️ Greeks Calculation Notice
              </div>
              <div className="text-xs text-bloomberg-text-muted space-y-1">
                <p>
                  <strong>Delta values are reliable.</strong> Theta, Vega, and Rho have been scaled to match NSE format 
                  (rupees per day per contract). Gamma values are small by nature (0.0002-0.0003 for ATM).
                </p>
                <p>
                  <strong>These values should be verified before live trading.</strong> Please cross-check against 
                  NSE official Greeks, TradingView, or your broker's platform for confirmation.
                </p>
                <p className="text-yellow-300/80 mt-2">
                  For accurate Greeks, verify against: NSE official Greeks feed, TradingView, or your broker's platform.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Validation & Type */}
      {strategy.legs.length > 0 && (() => {
        const validationIssues = validateStrategy(strategy);
        const errors = validationIssues.filter(i => i.type === 'error');
        const warnings = validationIssues.filter(i => i.type === 'warning');
        const strategyType = getStrategyType(strategy);
        
        // Calculate probability of profit
        const avgIV = rows.length > 0 
          ? rows.reduce((sum, r) => {
              const iv = r.impliedVolatility || 0;
              const ivDecimal = iv > 100 ? iv / 100 : iv;
              return sum + ivDecimal;
            }, 0) / rows.length
          : 0.20;
        const probOfProfit = spotPrice && strategy.legs.length > 0 && strategy.legs[0].expiry
          ? calculateProbabilityOfProfit(strategy, spotPrice, avgIV, DEFAULT_RISK_FREE_RATE, strategy.legs[0].expiry)
          : null;

        return (
          <>
            {/* Validation Warnings/Errors */}
            {(errors.length > 0 || warnings.length > 0) && (
              <div className="space-y-2 mb-4">
                {errors.map((error, idx) => (
                  <div key={idx} className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-400">Error</div>
                      <div className="text-xs text-bloomberg-text-muted">{error.message}</div>
                    </div>
                  </div>
                ))}
                {warnings.map((warning, idx) => (
                  <div key={idx} className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-yellow-400">Warning</div>
                      <div className="text-xs text-bloomberg-text-muted">{warning.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Strategy Type & Probability */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
                <div className="text-xs text-bloomberg-text-muted mb-1">Strategy Type</div>
                <div className="text-lg font-semibold text-bloomberg-text">{strategyType}</div>
              </div>
              {probOfProfit !== null && (
                <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="text-yellow-400" />
                    <span className="text-xs text-bloomberg-text-muted">Probability of Profit</span>
                    <Tooltip content="Estimated probability that strategy will be profitable at expiry (based on Black-Scholes model)">
                      <Info size={12} className="text-bloomberg-text-muted cursor-help" />
                    </Tooltip>
                  </div>
                  <div className={`text-lg font-semibold ${
                    probOfProfit > 0.6 ? 'text-green-400' : probOfProfit > 0.4 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {(probOfProfit * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* Strategy Summary Cards */}
      {strategy.legs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-bloomberg-text-muted">Net Premium</span>
              <Tooltip content="Total cost/credit of the strategy">
                <Info size={12} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className={`text-2xl font-bold ${
              analysis.netPremium < 0 ? 'text-red-400' : 'text-green-400'
            }`}>
              {analysis.netPremium >= 0 ? '+' : ''}{formatNumber(analysis.netPremium)}
            </div>
            <div className="text-xs text-bloomberg-text-muted mt-1">
              {analysis.netPremium < 0 ? 'Debit (you pay)' : 'Credit (you receive)'}
            </div>
          </div>

          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-bloomberg-text-muted">Max Profit</span>
              <Tooltip content="Maximum profit if strategy works out">
                <Info size={12} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className={`text-2xl font-bold ${
              analysis.maxProfit === null ? 'text-bloomberg-text' : 'text-green-400'
            }`}>
              {analysis.maxProfit === null ? '∞' : formatNumber(analysis.maxProfit)}
            </div>
            <div className="text-xs text-bloomberg-text-muted mt-1">
              {analysis.maxProfit === null ? 'Unlimited profit' : 'Maximum possible profit'}
            </div>
          </div>

          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-bloomberg-text-muted">Max Loss</span>
              <Tooltip content="Maximum loss if strategy fails">
                <Info size={12} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className={`text-2xl font-bold ${
              analysis.maxLoss === null ? 'text-bloomberg-text' : 'text-red-400'
            }`}>
              {analysis.maxLoss === null ? '∞' : formatNumber(Math.abs(analysis.maxLoss))}
            </div>
            <div className="text-xs text-bloomberg-text-muted mt-1">
              {analysis.maxLoss === null 
                ? 'Unlimited loss' 
                : `Limited to ₹${Math.abs(analysis.maxLoss).toFixed(2)}`}
            </div>
          </div>

          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-bloomberg-text-muted">Breakeven</span>
              <Tooltip content="Price where strategy breaks even">
                <Info size={12} className="text-bloomberg-text-muted cursor-help" />
              </Tooltip>
            </div>
            <div className="text-2xl font-bold text-bloomberg-text">
              {analysis.breakevenPoints.length > 0
                ? analysis.breakevenPoints.map(be => be.toFixed(0)).join(', ')
                : 'None'}
            </div>
            <div className="text-xs text-bloomberg-text-muted mt-1">
              {analysis.breakevenPoints.length > 0 ? 'Break-even points' : 'No breakeven'}
            </div>
          </div>
        </div>
      )}

      {/* Payoff Chart */}
      {strategy.legs.length > 0 && (
        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-bloomberg-text">Payoff Chart</h3>
            <div className="flex items-center gap-2 text-xs text-bloomberg-text-muted">
              <Info size={12} />
              <span>Shows profit/loss at different underlying prices</span>
            </div>
          </div>
          <StrataXPayoffChart analysis={analysis} spotPrice={spotPrice || 0} />
        </div>
      )}

      {/* Strategy Legs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-bloomberg-text">Strategy Legs</h3>
          {strategy.legs.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowGreeks(!showGreeks)}
                className="flex items-center gap-2 px-4 py-2 bg-bloomberg-dark border border-bloomberg-border rounded-lg text-bloomberg-text hover:bg-bloomberg-border transition-colors"
              >
                {showGreeks ? <EyeOff size={18} /> : <Eye size={18} />}
                {showGreeks ? 'Hide' : 'Show'} Greeks
              </button>
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Save size={18} />
                Save Trade
              </button>
            </div>
          )}
        </div>

        {strategy.legs.length === 0 ? (
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-8 text-center">
            <div className="text-bloomberg-text-muted mb-4">
              No legs added yet. Click "Add Leg" to start building your strategy.
            </div>
            <div className="text-xs text-bloomberg-text-muted space-y-1">
              <div>💡 <strong>Tip:</strong> Each leg represents one option position</div>
              <div>💡 <strong>Example:</strong> Buy 1 NIFTY 26500 CALL = 1 leg</div>
              <div>💡 <strong>Strategy:</strong> Combine multiple legs to create spreads, straddles, etc.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {strategy.legs.map((leg, idx) => {
              const legData = getLegData(leg);
              const legGreeks = analysis.legGreeks.find(g => g.legId === leg.id);
              
              return (
                <div
                  key={leg.id}
                  className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-bloomberg-text">
                        Leg {idx + 1}
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${
                        leg.action === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {leg.action}
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${
                        leg.optionType === 'CALL' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                      }`}>
                        {leg.optionType}
                      </div>
                    </div>
                    <button
                      onClick={() => removeLeg(leg.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      title="Remove this leg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Strike Price
                        <Tooltip content="The price at which you can exercise the option">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      {availableStrikes.length > 0 ? (
                        <select
                          value={leg.strike}
                          onChange={(e) => handleLegChange(leg.id, 'strike', parseFloat(e.target.value) || 0)}
                          className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {availableStrikes.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          value={leg.strike}
                          onChange={(e) => handleLegChange(leg.id, 'strike', parseFloat(e.target.value) || 0)}
                          className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter strike"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Quantity
                        <Tooltip content="Number of contracts">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      <input
                        type="number"
                        value={leg.quantity}
                        onChange={(e) => handleLegChange(leg.id, 'quantity', parseInt(e.target.value) || 1)}
                        min="1"
                        className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Entry Price
                        {legData.ltp !== null && (
                          <span className="text-green-400 ml-1">(LTP: {legData.ltp.toFixed(2)})</span>
                        )}
                        <Tooltip content="Price per contract you paid/received">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      <input
                        type="number"
                        value={leg.entryPrice}
                        onChange={(e) => handleLegChange(leg.id, 'entryPrice', parseFloat(e.target.value) || 0)}
                        step="0.01"
                        className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {legData.iv !== null && legData.iv !== undefined && (
                        <div className="text-xs text-bloomberg-text-muted mt-1">
                          IV: {legData.iv > 100 ? (legData.iv / 100).toFixed(2) : legData.iv.toFixed(2)}%
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Option Type
                        <Tooltip content="CALL = right to buy, PUT = right to sell">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      <select
                        value={leg.optionType}
                        onChange={(e) => handleLegChange(leg.id, 'optionType', e.target.value as OptionType)}
                        className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="CALL">CALL (Buy Right)</option>
                        <option value="PUT">PUT (Sell Right)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Action
                        <Tooltip content="BUY = long position, SELL = short position">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      <select
                        value={leg.action}
                        onChange={(e) => handleLegChange(leg.id, 'action', e.target.value as ActionType)}
                        className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="BUY">BUY (Long)</option>
                        <option value="SELL">SELL (Short)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-bloomberg-text-muted mb-1">
                        Expiry
                        <Tooltip content="Date when option expires">
                          <Info size={10} className="inline ml-1 cursor-help" />
                        </Tooltip>
                      </label>
                      <select
                        value={leg.expiry}
                        onChange={(e) => handleLegChange(leg.id, 'expiry', e.target.value)}
                        className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-2 py-1 text-sm text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {expiriesFromData.length > 0 ? expiriesFromData.map(e => (
                          <option key={e} value={e}>{e}</option>
                        )) : (
                          <option value={leg.expiry}>{leg.expiry}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Greeks Display */}
                  {showGreeks && legGreeks && (
                    <div className="mt-4 pt-4 border-t border-bloomberg-border">
                      <div className="text-xs font-semibold text-bloomberg-text-muted mb-2">Greeks (Risk Metrics)</div>
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        <div>
                          <div className="text-bloomberg-text-muted">Delta</div>
                          <div className="text-bloomberg-text font-semibold">{formatNumber(legGreeks.delta)}</div>
                          <div className="text-bloomberg-text-muted text-[10px]">Price sensitivity</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted">Gamma</div>
                          <div className="text-bloomberg-text font-semibold">{formatNumber(legGreeks.gamma)}</div>
                          <div className="text-bloomberg-text-muted text-[10px]">Delta change rate</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted">Theta</div>
                          <div className="text-red-400 font-semibold">{formatNumber(legGreeks.theta)}</div>
                          <div className="text-bloomberg-text-muted text-[10px]">Time decay/day</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted">Vega</div>
                          <div className="text-bloomberg-text font-semibold">{formatNumber(legGreeks.vega)}</div>
                          <div className="text-bloomberg-text-muted text-[10px]">IV sensitivity</div>
                        </div>
                        <div>
                          <div className="text-bloomberg-text-muted">Rho</div>
                          <div className="text-bloomberg-text font-semibold">{formatNumber(legGreeks.rho)}</div>
                          <div className="text-bloomberg-text-muted text-[10px]">Rate sensitivity</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aggregate Greeks */}
      {showGreeks && strategy.legs.length > 0 && (
        <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-bloomberg-text mb-3">Total Strategy Greeks</h4>
          <div className="grid grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-bloomberg-text-muted mb-1">Delta</div>
              <div className="text-lg font-bold text-bloomberg-text">{formatNumber(analysis.greeks.delta)}</div>
              <div className="text-xs text-bloomberg-text-muted">Net price sensitivity</div>
            </div>
            <div>
              <div className="text-xs text-bloomberg-text-muted mb-1">Gamma</div>
              <div className="text-lg font-bold text-bloomberg-text">{formatNumber(analysis.greeks.gamma)}</div>
              <div className="text-xs text-bloomberg-text-muted">Delta acceleration</div>
            </div>
            <div>
              <div className="text-xs text-bloomberg-text-muted mb-1">Theta</div>
              <div className="text-lg font-bold text-red-400">{formatNumber(analysis.greeks.theta)}</div>
              <div className="text-xs text-bloomberg-text-muted">Time decay per day</div>
            </div>
            <div>
              <div className="text-xs text-bloomberg-text-muted mb-1">Vega</div>
              <div className="text-lg font-bold text-bloomberg-text">{formatNumber(analysis.greeks.vega)}</div>
              <div className="text-xs text-bloomberg-text-muted">IV sensitivity</div>
            </div>
            <div>
              <div className="text-xs text-bloomberg-text-muted mb-1">Rho</div>
              <div className="text-lg font-bold text-bloomberg-text">{formatNumber(analysis.greeks.rho)}</div>
              <div className="text-xs text-bloomberg-text-muted">Interest rate sensitivity</div>
            </div>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Save Paper Trade</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-bloomberg-text-muted mb-1">Trade Name *</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="e.g., NIFTY Call Spread"
                  className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-3 py-2 text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-bloomberg-text-muted mb-1">Notes (optional)</label>
                <textarea
                  value={tradeNotes}
                  onChange={(e) => setTradeNotes(e.target.value)}
                  placeholder="Add any notes about this trade..."
                  rows={3}
                  className="w-full bg-bloomberg-dark border border-bloomberg-border rounded px-3 py-2 text-bloomberg-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setTradeName('');
                    setTradeNotes('');
                  }}
                  className="px-4 py-2 bg-bloomberg-dark border border-bloomberg-border rounded-lg text-bloomberg-text hover:bg-bloomberg-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePaperTrade}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
