import React, { useState, useEffect, useMemo } from 'react';
import { initializeStocks, updateStockData, searchStock } from '../services/stockDataService';
import StockList from './StockList';
import StockDetail from './StockDetail';
import LoadingSpinner from './LoadingSpinner';
import { STOCK_SYMBOLS } from '../constants';
import { formatCurrency } from '../utils/currency';
import type { Stock } from '../types';

interface DashboardProps {
  searchQuery?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ searchQuery = '' }) => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [searching, setSearching] = useState(false);

  // Initialize stocks on mount
  useEffect(() => {
    const loadStocks = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const timeoutPromise = new Promise<Stock[]>((_, reject) => {
          setTimeout(() => reject(new Error('Stock loading timeout')), 90000);
        });
        
        const stocksPromise = initializeStocks(3);
        const initialStocks = await Promise.race([stocksPromise, timeoutPromise]);
        
        if (initialStocks.length > 0) {
          setStocks(initialStocks);
          setSelectedStockSymbol(initialStocks[0].symbol);
        } else {
          setError('No stock data available. Please check your connection and try again.');
        }
      } catch (err: any) {
        if (stocks.length === 0) {
          if (err?.message?.includes('timeout')) {
            setError('Loading is taking longer than expected. Please wait or refresh the page.');
          } else {
            setError('Failed to load stock data. Please try again later.');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadStocks();
  }, []);

  // Update stocks periodically
  useEffect(() => {
    if (stocks.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const symbols = stocks.map(s => s.symbol);
        const updatedStocks = await updateStockData(symbols);
        if (updatedStocks.length > 0) {
          setStocks(updatedStocks);
          setLastUpdate(new Date());
        }
      } catch (err) {
        console.error('Error updating stocks:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [stocks.length]);

  // Load remaining stocks after initial load
  useEffect(() => {
    if (stocks.length > 0 && stocks.length < STOCK_SYMBOLS.length) {
      const loadRemaining = async () => {
        try {
          const loadedSymbols = stocks.map(s => s.symbol);
          const allSymbols = STOCK_SYMBOLS.map(s => s.symbol);
          const missingSymbols = allSymbols.filter(s => !loadedSymbols.includes(s));
          
          if (missingSymbols.length > 0) {
            console.log(`📦 Loading remaining ${missingSymbols.length} stocks in background...`);
            const remainingStocks = await updateStockData(missingSymbols);
            if (remainingStocks.length > 0) {
              console.log(`✅ Background load complete: ${remainingStocks.length} additional stocks`);
              setStocks(prev => [...prev, ...remainingStocks]);
            }
          }
        } catch (err) {
          console.error('Error loading remaining stocks:', err);
        }
      };
      
      const timer = setTimeout(loadRemaining, 3000);
      return () => clearTimeout(timer);
    }
  }, [stocks.length]);

  const selectedStock = useMemo(() => {
    return [...stocks, ...searchResults].find(s => s.symbol === selectedStockSymbol);
  }, [stocks, selectedStockSymbol, searchResults]);

  // Handle search
  useEffect(() => {
    const performSearch = async () => {
      const query = searchQuery.trim().toUpperCase();
      
      if (!query) {
        setSearchResults([]);
        return;
      }

      const existingMatches = stocks.filter(
        stock =>
          stock.symbol.toUpperCase().includes(query) ||
          stock.name.toUpperCase().includes(query)
      );

      if (/^[\^]?[A-Z0-9.]+$/.test(query) && query.length >= 1 && query.length <= 20) {
        setSearching(true);
        try {
          const foundStock = await searchStock(query);
          if (foundStock) {
            const alreadyExists = stocks.some(s => s.symbol === foundStock.symbol);
            if (!alreadyExists) {
              setSearchResults([foundStock, ...existingMatches]);
            } else {
              setSearchResults(existingMatches);
            }
          } else {
            if (!query.includes('.') && !query.startsWith('^')) {
              const nseStock = await searchStock(`${query}.NS`);
              if (nseStock) {
                setSearchResults([nseStock, ...existingMatches]);
              } else {
                setSearchResults(existingMatches);
              }
            } else {
              setSearchResults(existingMatches);
            }
          }
        } catch (error) {
          console.error('Search error:', error);
          setSearchResults(existingMatches);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults(existingMatches);
      }
    };

    const timeoutId = setTimeout(performSearch, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, stocks]);

  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) return stocks;
    if (searchResults.length > 0) {
      return searchResults;
    }
    const query = searchQuery.toLowerCase();
    return stocks.filter(
      stock =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query)
    );
  }, [stocks, searchQuery, searchResults]);

  const comparisonStocks = useMemo(() => {
    const allStocks = [...stocks, ...searchResults];
    return allStocks.filter(s => selectedForComparison.includes(s.symbol));
  }, [stocks, searchResults, selectedForComparison]);

  const handleToggleComparison = (symbol: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(symbol)) {
        return prev.filter(s => s !== symbol);
      } else if (prev.length < 5) {
        return [...prev, symbol];
      }
      return prev;
    });
  };

  const handleRemoveFromComparison = (symbol: string) => {
    setSelectedForComparison(prev => prev.filter(s => s !== symbol));
  };

  const handleRetry = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const timeoutPromise = new Promise<Stock[]>((_, reject) => {
        setTimeout(() => reject(new Error('Stock loading timeout after 25 seconds')), 25000);
      });
      
      const stocksPromise = initializeStocks();
      const initialStocks = await Promise.race([stocksPromise, timeoutPromise]);
      
      if (initialStocks.length > 0) {
        setStocks(initialStocks);
        setSelectedStockSymbol(initialStocks[0].symbol);
      } else {
        setError('No stock data available. Please check your internet connection and try again.');
      }
    } catch (err: any) {
      const errorMessage = err?.message?.includes('timeout') 
        ? 'Loading is taking too long. Please check your internet connection and try again.'
        : 'Failed to load stock data. Please check your connection and try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-72px)]">
        <div className="text-center animate-fade-in">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-400">Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-72px)]">
        <div className="text-center p-8 animate-fade-in">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-red-400 text-lg mb-2 font-semibold">Unable to Load Stock Data</p>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">{error}</p>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="px-6 py-3 bg-green-500 text-black rounded-md hover:bg-green-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-72px)] relative">
      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden fixed top-20 left-4 z-50 bg-green-500 text-black p-2 rounded-lg shadow-lg hover:bg-green-400 transition-all"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Compare Button */}
      {!mobileMenuOpen && (
        <button
          onClick={() => setComparisonMode(!comparisonMode)}
          className={`md:hidden fixed top-20 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all ${
            comparisonMode
              ? 'bg-green-500 text-black'
              : 'bg-gray-800 text-white border border-green-500/50 hover:bg-green-500/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm font-semibold">Compare</span>
            {comparisonMode && selectedForComparison.length > 0 && (
              <span className="bg-black text-green-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {selectedForComparison.length}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative
        top-0 left-0
        w-80 md:w-1/4 md:max-w-xs
        h-full md:h-auto
        border-r border-gray-700/50
        overflow-y-auto
        bg-[#0d1117]/95 md:bg-[#0d1117]/50
        backdrop-blur-md md:backdrop-blur-sm
        z-40 md:z-auto
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="sticky top-0 bg-[#0d1117]/95 backdrop-blur-sm border-b border-gray-700/50 p-2 sm:p-3 z-10">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-base sm:text-lg text-white">Watchlist</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={() => setComparisonMode(!comparisonMode)}
                className={`px-2 py-1 text-xs rounded transition-all ${
                  comparisonMode
                    ? 'bg-green-500 text-black'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Compare
              </button>
              <span className="text-xs text-gray-400 hidden sm:inline">
                {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
          </div>
          {comparisonMode && selectedForComparison.length > 0 && (
            <div className="mt-2 text-xs text-green-400">
              {selectedForComparison.length} stock{selectedForComparison.length !== 1 ? 's' : ''} selected
            </div>
          )}
          {searchQuery && (
            <div className="flex items-center gap-2">
              {searching && (
                <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              )}
              <p className="text-xs text-gray-400">
                {filteredStocks.length} result{filteredStocks.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
        <StockList
          stocks={filteredStocks}
          selectedStockSymbol={selectedStockSymbol}
          onSelectStock={(symbol) => {
            setSelectedStockSymbol(symbol);
            setMobileMenuOpen(false);
          }}
          comparisonMode={comparisonMode}
          selectedForComparison={selectedForComparison}
          onToggleComparison={handleToggleComparison}
        />
      </div>

      {/* Main Content */}
      <div className="w-full md:w-3/4 flex-1 overflow-y-auto pt-12 md:pt-0">
        {comparisonMode && !mobileMenuOpen && (
          <div className="md:hidden fixed top-28 left-4 right-4 z-40 bg-green-500/10 border border-green-500/30 rounded-lg p-2 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-semibold">
                  {selectedForComparison.length} stock{selectedForComparison.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <button
                onClick={() => setComparisonMode(false)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
        )}

        {comparisonMode && comparisonStocks.length >= 2 ? (
          <ComparisonView
            stocks={comparisonStocks}
            onRemoveStock={handleRemoveFromComparison}
          />
        ) : comparisonMode && comparisonStocks.length > 0 ? (
          <div className="p-8 text-center text-gray-400 animate-fade-in">
            <p className="text-lg">Select at least 2 stocks to compare</p>
            <p className="text-sm text-gray-500 mt-2">Use checkboxes in the watchlist to select stocks</p>
          </div>
        ) : selectedStock ? (
          <StockDetail key={selectedStock.symbol} stock={selectedStock} />
        ) : (
          <div className="p-8 text-center text-gray-400 animate-fade-in">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg">Select a stock to view detailed analytics</p>
            <p className="text-sm text-gray-500 mt-2">Choose from the watchlist to see real-time data and technical indicators</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Comparison View Component
const ComparisonView: React.FC<{ stocks: Stock[]; onRemoveStock: (symbol: string) => void }> = ({ stocks, onRemoveStock }) => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Stock Comparison</h2>
          <p className="text-sm text-gray-400">Compare key metrics and performance across {stocks.length} stocks</p>
        </div>
      </div>

      {/* Selected Stocks Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stocks.map((stock) => {
          const isPositive = stock.change >= 0;
          
          return (
            <div
              key={stock.symbol}
              className="bg-[#161b22] rounded-xl p-4 border border-gray-700/30 hover:border-green-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{stock.symbol}</h3>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{stock.name}</p>
                </div>
                <button
                  onClick={() => onRemoveStock(stock.symbol)}
                  className="ml-2 text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-2">
                <div>
                  <p className="text-2xl font-mono font-bold text-white">
                    {formatCurrency(stock.price, stock.symbol)}
                  </p>
                  <p className={`text-sm font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}{formatCurrency(stock.change, stock.symbol)} ({isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                  </p>
                </div>
                
                <div className="pt-2 border-t border-gray-700/30 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">P/E</span>
                    <p className="text-white font-medium">{stock.ratios.peRatio?.toFixed(2) || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Beta</span>
                    <p className="text-white font-medium">{stock.ratios.beta.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Volume</span>
                    <p className="text-white font-medium">{stock.volume ? `${(stock.volume / 1e6).toFixed(1)}M` : 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Market Cap</span>
                    <p className="text-white font-medium">{stock.ratios.marketCap || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-[#161b22] rounded-xl p-4 sm:p-6 border border-gray-700/30">
        <h3 className="text-xl font-bold text-white mb-4">Detailed Metrics Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Metric</th>
                {stocks.map(stock => (
                  <th key={stock.symbol} className="text-right py-3 px-4 text-gray-400 text-sm font-medium">
                    {stock.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">Price</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {formatCurrency(stock.price, stock.symbol)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">Change %</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className={`text-right py-3 px-4 font-mono ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">P/E Ratio</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {stock.ratios.peRatio?.toFixed(2) || 'N/A'}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">EPS</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {stock.ratios.eps > 0 ? stock.ratios.eps.toFixed(2) : 'N/A'}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">Beta</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {stock.ratios.beta.toFixed(2)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">52W High</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {formatCurrency(stock.ratios.high52Week, stock.symbol)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/30">
                <td className="py-3 px-4 text-gray-400">52W Low</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {formatCurrency(stock.ratios.low52Week, stock.symbol)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-400">Market Cap</td>
                {stocks.map(stock => (
                  <td key={stock.symbol} className="text-right py-3 px-4 text-white font-mono">
                    {stock.ratios.marketCap || 'N/A'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
