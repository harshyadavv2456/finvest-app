import { fetchMultipleStocks, fetchStockData } from './yahooFinanceService';
import { STOCK_SYMBOLS } from '../constants';
import type { Stock } from '../types';

// Cache to avoid excessive API calls
const cache = new Map<string, { data: Stock; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute cache

export const initializeStocks = async (retries: number = 3): Promise<Stock[]> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const symbols = STOCK_SYMBOLS.map(s => s.symbol);
      
      // Start with just 3 for fast initial load
      const INITIAL_BATCH_SIZE = 3;
      const initialSymbols = symbols.slice(0, INITIAL_BATCH_SIZE);
      
      const timeoutMs = Math.min(60000 + (attempt * 10000), 90000);
      const stocksPromise = fetchMultipleStocks(initialSymbols, true);
      const timeoutPromise = new Promise<Stock[]>((_, reject) => {
        setTimeout(() => reject(new Error('Initial load timeout')), timeoutMs);
      });
      
      const initialStocks = await Promise.race([stocksPromise, timeoutPromise]);
      
      // Cache the results
      initialStocks.forEach(stock => {
        cache.set(stock.symbol, { data: stock, timestamp: Date.now() });
      });
      
      if (initialStocks.length > 0) {
        console.log(`✅ Initial batch loaded: ${initialStocks.length} stocks - Dashboard ready!`);
        console.log(`📝 Remaining stocks will load in background via Dashboard component`);
        return initialStocks;
      }
    } catch (error: any) {
      if (attempt === retries - 1) {
        return [];
      }
    }
  }
  
  return [];
};

export const updateStockData = async (symbols: string[]): Promise<Stock[]> => {
  try {
    const now = Date.now();
    const symbolsToFetch: string[] = [];
    const cachedStocks: Stock[] = [];
    
    symbols.forEach(symbol => {
      const cached = cache.get(symbol);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        cachedStocks.push(cached.data);
      } else {
        symbolsToFetch.push(symbol);
      }
    });
    
    let fetchedStocks: Stock[] = [];
    if (symbolsToFetch.length > 0) {
      fetchedStocks = await fetchMultipleStocks(symbolsToFetch);
      
      fetchedStocks.forEach(stock => {
        cache.set(stock.symbol, { data: stock, timestamp: Date.now() });
      });
    }
    
    const allStocks = [...cachedStocks, ...fetchedStocks];
    
    return symbols.map(symbol => 
      allStocks.find(s => s.symbol === symbol)
    ).filter((s): s is Stock => s !== undefined);
  } catch (error) {
    console.error('Error updating stock data:', error);
    return symbols.map(symbol => {
      const cached = cache.get(symbol);
      return cached?.data;
    }).filter((s): s is Stock => s !== undefined);
  }
};

export const refreshStock = async (symbol: string): Promise<Stock | null> => {
  try {
    const stock = await fetchStockData(symbol);
    if (stock) {
      cache.set(symbol, { data: stock, timestamp: Date.now() });
    }
    return stock;
  } catch (error) {
    console.error(`Error refreshing stock ${symbol}:`, error);
    return null;
  }
};

export const searchStock = async (symbol: string): Promise<Stock | null> => {
  try {
    let normalizedSymbol = symbol.trim().toUpperCase();
    
    const cached = cache.get(normalizedSymbol);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }
    
    // Handle Indian stocks
    if (normalizedSymbol.length > 0 && !normalizedSymbol.includes('.') && !normalizedSymbol.startsWith('^')) {
      const indianStocks = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'HDFC', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'HINDUNILVR', 'ITC', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN', 'NESTLEIND', 'ULTRACEMCO', 'SUNPHARMA', 'BAJFINANCE', 'WIPRO', 'TECHM', 'ONGC', 'NTPC', 'POWERGRID'];
      
      if (indianStocks.includes(normalizedSymbol)) {
        const nseSymbol = `${normalizedSymbol}.NS`;
        let stock = await fetchStockData(nseSymbol);
        if (stock) {
          cache.set(nseSymbol, { data: stock, timestamp: Date.now() });
          return stock;
        }
        
        const bseSymbol = `${normalizedSymbol}.BO`;
        stock = await fetchStockData(bseSymbol);
        if (stock) {
          cache.set(bseSymbol, { data: stock, timestamp: Date.now() });
          return stock;
        }
      }
    }
    
    const stock = await fetchStockData(normalizedSymbol);
    if (stock) {
      cache.set(normalizedSymbol, { data: stock, timestamp: Date.now() });
    }
    return stock;
  } catch (error) {
    console.error(`Error searching stock ${symbol}:`, error);
    return null;
  }
};
