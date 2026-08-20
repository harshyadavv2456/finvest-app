import type { Stock, StockDataPoint, StockRatios, StockAnalytics } from '../types';
import { validateRatios } from './dataValidationService';

const YAHOO_QUOTE_API = 'https://query1.finance.yahoo.com/v8/finance/chart/';

interface YahooQuoteResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose: number;
        regularMarketOpen: number;
        regularMarketDayHigh: number;
        regularMarketDayLow: number;
        regularMarketVolume: number;
        averageVolume: number;
        currency: string;
        exchangeName: string;
        shortName: string;
        longName: string;
        regularMarketTime: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: number[];
          open?: number[];
          high?: number[];
          low?: number[];
          volume: number[];
        }>;
      };
    }>;
  };
}

// Calculate technical indicators
const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
};

const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  
  if (losses.length === 0) return 100;
  if (gains.length === 0) return 0;
  
  const avgGain = gains.reduce((sum, g) => sum + g, 0) / period;
  const avgLoss = losses.reduce((sum, l) => sum + l, 0) / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateVolatility = (prices: number[]): number => {
  if (prices.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * 100;
};

const calculateSupportResistance = (prices: number[]): { support: number; resistance: number } => {
  if (prices.length === 0) return { support: 0, resistance: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const support = sorted[Math.floor(sorted.length * 0.1)];
  const resistance = sorted[Math.floor(sorted.length * 0.9)];
  return { support, resistance };
};

const fetchWithTimeout = (url: string, options: RequestInit = {}, timeout: number = 15000): Promise<Response> => {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    ),
  ]);
};

const fetchWithProxies = async (url: string, timeout: number = 10000, retries: number = 2): Promise<Response> => {
  const proxies = [
    `https://api.allorigins.win/get?url=`,
    `https://corsproxy.io/?`,
    `https://api.codetabs.com/v1/proxy?quest=`,
  ];
  
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(500 * attempt, 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Try direct fetch first
    try {
      const directResponse = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        mode: 'cors',
      }, timeout);
      if (directResponse.ok) {
        return directResponse;
      }
    } catch {
      // Continue to proxies
    }
    
    // Try proxies
    for (const proxy of proxies) {
      try {
        const fetchUrl = proxy.includes('allorigins') || proxy.includes('codetabs')
          ? `${proxy}${encodeURIComponent(url)}`
          : `${proxy}${url}`;
        
        const response = await fetchWithTimeout(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors',
        }, timeout);
        
        if (response.ok) {
          return response;
        }
      } catch {
        continue;
      }
    }
  }
  
  throw new Error('All fetch methods failed after retries');
};

export const fetchStockData = async (symbol: string, retries: number = 5, suppressErrors: boolean = false): Promise<Stock | null> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        if (!suppressErrors) {
          console.log(`⏳ Retrying ${symbol} (attempt ${attempt + 1}/${retries}) after ${Math.round(delay)}ms...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const quoteUrl = `${YAHOO_QUOTE_API}${symbol}?interval=1d&range=1mo&includePrePost=false`;
      
      let quoteData: YahooQuoteResponse;
      
      try {
        const timeout = Math.min(15000 + (attempt * 2000), 25000);
        const proxyRetries = Math.min(3 + attempt, 5);
        const response = await fetchWithProxies(quoteUrl, timeout, proxyRetries);
        const text = await response.text();
        
        if (text.startsWith('{') && text.includes('contents')) {
          const proxyData = JSON.parse(text);
          quoteData = JSON.parse(proxyData.contents || proxyData);
        } else {
          quoteData = JSON.parse(text);
        }
        
        if (!quoteData.chart?.result?.[0]) {
          throw new Error('Invalid quote data structure');
        }
        
        const stock = await processQuoteData(quoteData, symbol);
        if (attempt > 0 && !suppressErrors) {
          console.log(`✅ Successfully fetched ${symbol} on retry attempt ${attempt + 1}`);
        }
        return stock;
      } catch (fetchError: any) {
        if (!suppressErrors) {
          console.error(`Fetch error for ${symbol} (attempt ${attempt + 1}):`, fetchError?.message || fetchError);
        }
        
        if (attempt < retries - 1) {
          continue;
        }
      }
    } catch (error: any) {
      if (!suppressErrors) {
        console.error(`Error fetching stock data for ${symbol} (attempt ${attempt + 1}):`, error?.message || error);
      }
      if (attempt === retries - 1) {
        if (!suppressErrors) {
          console.error(`❌ Failed to fetch ${symbol} after ${retries} attempts`);
        }
        return null;
      }
    }
  }
  
  return null;
};

const processQuoteData = async (quoteData: YahooQuoteResponse, symbol: string): Promise<Stock | null> => {
  try {
    if (!quoteData.chart?.result?.[0]) {
      throw new Error(`No data found for ${symbol}`);
    }
    
    const result = quoteData.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    
    // Get Open price
    let openPrice: number | undefined = undefined;
    if (meta.regularMarketOpen && meta.regularMarketOpen > 0) {
      openPrice = meta.regularMarketOpen;
    }
    if (!openPrice && quotes?.open && quotes.open.length > 0) {
      const validOpens = quotes.open.filter((o: number) => o && o > 0 && !isNaN(o));
      if (validOpens.length > 0) {
        openPrice = validOpens[0];
      }
    }
    
    const currentPrice = meta.regularMarketPrice;
    if (!openPrice || openPrice === 0) {
      openPrice = currentPrice;
    }
    
    // Build history
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    
    const history: StockDataPoint[] = timestamps.map((timestamp, index) => ({
      timestamp: timestamp * 1000,
      price: closes[index] || meta.regularMarketPrice,
      volume: volumes[index] || undefined,
    }));
    
    // Calculate analytics
    const prices = history.map(h => h.price).filter(p => p > 0);
    const analytics: StockAnalytics = {
      sma20: prices.length >= 20 ? calculateSMA(prices, 20) : undefined,
      sma50: prices.length >= 50 ? calculateSMA(prices, 50) : undefined,
      rsi: prices.length >= 15 ? calculateRSI(prices, 14) : undefined,
      volatility: prices.length >= 2 ? calculateVolatility(prices) : undefined,
      ...calculateSupportResistance(prices),
    };
    
    // Calculate MACD
    if (prices.length >= 26) {
      const ema12Multiplier = 2 / (12 + 1);
      let ema12 = prices.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
      for (let i = 12; i < prices.length; i++) {
        ema12 = (prices[i] * ema12Multiplier) + (ema12 * (1 - ema12Multiplier));
      }
      
      const ema26Multiplier = 2 / (26 + 1);
      let ema26 = prices.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
      for (let i = 26; i < prices.length; i++) {
        ema26 = (prices[i] * ema26Multiplier) + (ema26 * (1 - ema26Multiplier));
      }
      
      analytics.macd = ema12 - ema26;
    }
    
    // Calculate volume change
    if (volumes.length >= 5 && meta.averageVolume && meta.averageVolume > 0) {
      const recentVolumes = volumes.slice(-5).filter(v => v && v > 0);
      if (recentVolumes.length > 0) {
        const avgRecentVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        analytics.volumeChange = ((avgRecentVolume - meta.averageVolume) / meta.averageVolume) * 100;
      }
    }
    
    // Build ratios with defaults
    const ratios: StockRatios = {
      marketCap: 'N/A',
      peRatio: null,
      eps: 0,
      dividendYield: null,
      beta: 1.0,
      high52Week: currentPrice,
      low52Week: currentPrice,
    };
    
    // Validate ratios
    validateRatios(ratios, currentPrice, symbol);
    
    // Calculate change
    let previousClose = meta.previousClose;
    if (!previousClose || previousClose === 0 || previousClose === currentPrice) {
      if (history.length >= 2) {
        const yesterdayPrice = history[history.length - 2].price;
        if (yesterdayPrice && yesterdayPrice > 0 && yesterdayPrice !== currentPrice) {
          previousClose = yesterdayPrice;
        }
      }
    }
    
    if (!previousClose || previousClose === 0 || previousClose === currentPrice) {
      previousClose = currentPrice * 0.995;
    }
    
    const change = currentPrice - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
    
    const stockName = meta.longName || meta.shortName || symbol;
    
    return {
      symbol,
      name: stockName,
      price: parseFloat(currentPrice.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      history,
      ratios,
      volume: meta.regularMarketVolume,
      averageVolume: meta.averageVolume && meta.averageVolume > 0 ? meta.averageVolume : undefined,
      open: openPrice,
      high: meta.regularMarketDayHigh || undefined,
      low: meta.regularMarketDayLow || undefined,
      previousClose: meta.previousClose || (history.length > 1 ? history[history.length - 2].price : currentPrice),
      analytics,
    };
  } catch (error) {
    console.error(`Error processing stock data for ${symbol}:`, error);
    return null;
  }
};

export const fetchMultipleStocks = async (symbols: string[], suppressErrors: boolean = false): Promise<Stock[]> => {
  const allStocks: Stock[] = [];
  
  if (!suppressErrors) {
    console.log(`🔄 Fetching ${symbols.length} stocks sequentially for reliability...`);
  }
  
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    if (!suppressErrors) {
      console.log(`📦 Fetching ${i + 1}/${symbols.length}: ${symbol}`);
    }
    
    try {
      const timeout = suppressErrors ? 60000 : 30000;
      const stock = await Promise.race([
        fetchStockData(symbol, 5, suppressErrors),
        new Promise<Stock | null>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout fetching ${symbol}`)), timeout)
        ),
      ]);
      
      if (stock) {
        allStocks.push(stock);
      }
      
      if (i < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error: any) {
      if (!suppressErrors) {
        console.error(`❌ Error fetching ${symbol}:`, error?.message || error);
      }
    }
  }
  
  if (!suppressErrors) {
    console.log(`✅ Total stocks loaded: ${allStocks.length}/${symbols.length}`);
  }
  return allStocks;
};
