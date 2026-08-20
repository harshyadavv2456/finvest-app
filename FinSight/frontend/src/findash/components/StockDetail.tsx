import React, { useState } from 'react';
import { formatCurrency } from '../utils/currency';
import TradingViewChart from './TradingViewChart';
import type { Stock } from '../types';

interface StockDetailProps {
  stock: Stock;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-[#161b22] rounded-lg p-4 md:p-5 mb-4 border border-gray-700/30 hover:border-green-500/20 transition-all ${className}`}>
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3">{title}</h3>
    {children}
  </div>
);

const RatioItem: React.FC<{ label: string; value: string | number | null }> = ({ label, value }) => (
  <div className="py-2 flex justify-between items-baseline">
    <span className="text-sm text-gray-400">{label}</span>
    <span className="text-base font-semibold text-white">{value ?? 'N/A'}</span>
  </div>
);

const StockDetail: React.FC<StockDetailProps> = ({ stock }) => {
  const [timeframe, setTimeframe] = useState<'1d' | '5d' | '1mo' | '3mo' | '1y'>('1mo');
  const isPositive = stock.change >= 0;

  return (
    <div className="p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 break-words">{stock.name}</h2>
            <p className="text-sm sm:text-base text-gray-400">{stock.symbol} • {stock.ratios.marketCap || 'N/A'} Market Cap</p>
          </div>
          <div className="text-left sm:text-right">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold ${
              isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              <span>{isPositive ? '▲' : '▼'}</span>
              <span>{Math.abs(stock.changePercent).toFixed(2)}%</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4 mt-4">
          <p className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold text-white">{formatCurrency(stock.price, stock.symbol)}</p>
          <div className={`text-lg sm:text-xl font-mono mb-0 sm:mb-2 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <span>{isPositive ? '+' : ''}{formatCurrency(Math.abs(stock.change), stock.symbol)}</span>
            <span className="ml-2">({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      {/* Market Data Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <div className="bg-[#161b22] rounded-lg p-4 border border-gray-700/30 hover:border-green-500/30 transition-all">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Open</p>
          <p className="text-xl font-bold text-white">
            {stock.open ? formatCurrency(stock.open, stock.symbol) : 'N/A'}
          </p>
        </div>
        <div className="bg-[#161b22] rounded-lg p-4 border border-gray-700/30 hover:border-green-500/30 transition-all">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">High</p>
          <p className="text-xl font-bold text-green-400">
            {stock.high ? formatCurrency(stock.high, stock.symbol) : 'N/A'}
          </p>
        </div>
        <div className="bg-[#161b22] rounded-lg p-4 border border-gray-700/30 hover:border-red-500/30 transition-all">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Low</p>
          <p className="text-xl font-bold text-red-400">
            {stock.low ? formatCurrency(stock.low, stock.symbol) : 'N/A'}
          </p>
        </div>
        <div className="bg-[#161b22] rounded-lg p-4 border border-gray-700/30 hover:border-green-500/30 transition-all">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Volume</p>
          <p className="text-xl font-bold text-white">
            {stock.volume ? `${(stock.volume / 1e6).toFixed(2)}M` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-[#161b22] rounded-lg p-4 md:p-5 mb-4 border border-gray-700/30">
        <div className="flex flex-col gap-3 sm:gap-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-lg sm:text-xl font-bold text-white">Price Chart</h3>
            <div className="text-xs text-gray-400">
              Last updated: {new Date(stock.history[stock.history.length - 1]?.timestamp || Date.now()).toLocaleTimeString()}
            </div>
          </div>
          {/* Timeframe Selector */}
          <div className="flex gap-2 bg-[#0d1117] rounded-lg p-1 w-fit">
            {(['1d', '5d', '1mo', '3mo', '1y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                  timeframe === tf
                    ? 'bg-green-500 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-80 md:h-96">
          <TradingViewChart
            symbol={stock.symbol}
            theme="dark"
            interval={timeframe === '1d' ? 'D' : timeframe === '5d' ? 'W' : 'M'}
          />
        </div>
      </div>

      {/* Technical Analytics */}
      {stock.analytics && (
        <Section title="Technical Analytics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stock.analytics.sma20 && (
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">SMA 20</p>
                <p className="text-lg font-bold text-white">{formatCurrency(stock.analytics.sma20, stock.symbol)}</p>
                <p className={`text-xs ${stock.price > stock.analytics.sma20 ? 'text-green-400' : 'text-red-400'}`}>
                  {stock.price > stock.analytics.sma20 ? 'Above' : 'Below'} SMA
                </p>
              </div>
            )}
            {stock.analytics.sma50 && (
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">SMA 50</p>
                <p className="text-lg font-bold text-white">{formatCurrency(stock.analytics.sma50, stock.symbol)}</p>
                <p className={`text-xs ${stock.price > stock.analytics.sma50 ? 'text-green-400' : 'text-red-400'}`}>
                  {stock.price > stock.analytics.sma50 ? 'Above' : 'Below'} SMA
                </p>
              </div>
            )}
            {stock.analytics.rsi !== undefined && (
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">RSI (14)</p>
                <p className="text-lg font-bold text-white">{stock.analytics.rsi.toFixed(2)}</p>
                <p className={`text-xs ${
                  stock.analytics.rsi > 70 ? 'text-red-400' : 
                  stock.analytics.rsi < 30 ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {stock.analytics.rsi > 70 ? 'Overbought' : stock.analytics.rsi < 30 ? 'Oversold' : 'Neutral'}
                </p>
              </div>
            )}
            {stock.analytics.volatility !== undefined && (
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Volatility</p>
                <p className="text-lg font-bold text-white">{stock.analytics.volatility.toFixed(2)}%</p>
                <p className={`text-xs ${
                  stock.analytics.volatility > 3 ? 'text-red-400' : 
                  stock.analytics.volatility < 1 ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {stock.analytics.volatility > 3 ? 'High' : stock.analytics.volatility < 1 ? 'Low' : 'Moderate'}
                </p>
              </div>
            )}
          </div>
          
          {/* Support & Resistance */}
          {(stock.analytics.support || stock.analytics.resistance) && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {stock.analytics.support && (
                <div className="bg-[#0d1117] rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Support Level</p>
                  <p className="text-lg font-bold text-green-400">{formatCurrency(stock.analytics.support, stock.symbol)}</p>
                </div>
              )}
              {stock.analytics.resistance && (
                <div className="bg-[#0d1117] rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Resistance Level</p>
                  <p className="text-lg font-bold text-red-400">{formatCurrency(stock.analytics.resistance, stock.symbol)}</p>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Key Ratios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Key Ratios">
          <div className="grid grid-cols-2 gap-3">
            <RatioItem label="Market Cap" value={stock.ratios.marketCap || 'N/A'} />
            <RatioItem 
              label="P/E Ratio" 
              value={stock.ratios.peRatio !== null ? stock.ratios.peRatio.toFixed(2) : 'N/A'} 
            />
            <RatioItem 
              label="EPS" 
              value={stock.ratios.eps > 0 ? stock.ratios.eps.toFixed(2) : 'N/A'} 
            />
            <RatioItem 
              label="Beta" 
              value={stock.ratios.beta.toFixed(2)} 
            />
            <RatioItem 
              label="52-Wk High" 
              value={stock.ratios.high52Week ? formatCurrency(stock.ratios.high52Week, stock.symbol) : 'N/A'} 
            />
            <RatioItem 
              label="52-Wk Low" 
              value={stock.ratios.low52Week ? formatCurrency(stock.ratios.low52Week, stock.symbol) : 'N/A'} 
            />
            <RatioItem 
              label="Div. Yield" 
              value={stock.ratios.dividendYield !== null ? `${stock.ratios.dividendYield.toFixed(2)}%` : 'N/A'} 
            />
            {stock.previousClose && (
              <RatioItem label="Previous Close" value={formatCurrency(stock.previousClose, stock.symbol)} />
            )}
          </div>
        </Section>

        {/* 52-Week Range Visualization */}
        <Section title="52-Week Range">
          <div className="space-y-4">
            {stock.ratios.high52Week > 0 && stock.ratios.low52Week > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{formatCurrency(stock.ratios.low52Week, stock.symbol)}</span>
                  <span>{formatCurrency(stock.ratios.high52Week, stock.symbol)}</span>
                </div>
                <div className="relative h-3 bg-gray-700 rounded-full">
                  <div 
                    className="absolute h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full"
                    style={{ width: '100%' }}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full transform -translate-y-0 -translate-x-1/2 top-0 shadow-lg"
                    style={{ 
                      left: `${Math.min(100, Math.max(0, ((stock.price - stock.ratios.low52Week) / (stock.ratios.high52Week - stock.ratios.low52Week)) * 100))}%` 
                    }}
                  />
                </div>
                <div className="text-center mt-2">
                  <p className="text-sm text-gray-400">Current Price</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(stock.price, stock.symbol)}</p>
                </div>
              </div>
            )}
            
            {/* Distance from 52-week values */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-[#0d1117] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">From 52W High</p>
                <p className={`text-lg font-bold ${stock.price < stock.ratios.high52Week ? 'text-red-400' : 'text-green-400'}`}>
                  {stock.ratios.high52Week > 0 
                    ? `${(((stock.price - stock.ratios.high52Week) / stock.ratios.high52Week) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">From 52W Low</p>
                <p className={`text-lg font-bold ${stock.price > stock.ratios.low52Week ? 'text-green-400' : 'text-red-400'}`}>
                  {stock.ratios.low52Week > 0 
                    ? `+${(((stock.price - stock.ratios.low52Week) / stock.ratios.low52Week) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default StockDetail;
