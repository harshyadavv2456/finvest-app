/**
 * CSV Provider - Manual Import from Broker Statements
 * 
 * This is the ONLY currently available provider.
 * Used as fallback when no direct broker integration is available.
 * 
 * SUPPORTED FORMATS:
 * - Zerodha Console Holdings Export
 * - Groww Holdings Export
 * - Generic Holdings CSV
 * 
 * RULES:
 * - READ-ONLY
 * - No real-time updates
 * - User must manually refresh
 */

import {
  DematProviderType,
  AuthState,
  Holding,
  Trade,
  CashBalance,
  ProviderCapabilities,
  DematDataError,
} from '../types';
import { BaseDematProvider } from '../DematProvider';

// =============================================================================
// CSV COLUMN MAPPINGS
// =============================================================================

interface CSVColumnMapping {
  ticker: string[];
  quantity: string[];
  avgPrice: string[];
  currentPrice: string[];
  companyName?: string[];
  exchange?: string[];
  isin?: string[];
  buyDate?: string[];
}

const CSV_MAPPINGS: Record<string, CSVColumnMapping> = {
  zerodha: {
    ticker: ['Instrument', 'Symbol', 'Trading Symbol'],
    quantity: ['Qty.', 'Quantity', 'Qty'],
    avgPrice: ['Avg. cost', 'Average Price', 'Avg Cost'],
    currentPrice: ['LTP', 'Last Price', 'Current Price'],
    companyName: ['Instrument'],
    exchange: ['Exchange'],
    isin: ['ISIN'],
  },
  groww: {
    ticker: ['Symbol', 'Stock Symbol', 'Scrip'],
    quantity: ['Quantity', 'Qty', 'Units'],
    avgPrice: ['Avg Price', 'Average Price', 'Buy Avg'],
    currentPrice: ['Current Price', 'LTP', 'Market Price'],
    companyName: ['Company Name', 'Name'],
  },
  generic: {
    ticker: ['ticker', 'symbol', 'stock', 'scrip', 'instrument'],
    quantity: ['quantity', 'qty', 'units', 'shares'],
    avgPrice: ['avg_price', 'average_price', 'buy_price', 'cost'],
    currentPrice: ['current_price', 'ltp', 'market_price', 'price'],
    companyName: ['name', 'company', 'company_name'],
    exchange: ['exchange'],
    isin: ['isin'],
    buyDate: ['buy_date', 'purchase_date', 'date'],
  },
};

// =============================================================================
// CSV PROVIDER
// =============================================================================

export class CSVProvider extends BaseDematProvider {
  readonly id: DematProviderType = 'csv';
  readonly name = 'CSV Import';
  readonly capabilities: ProviderCapabilities = {
    holdings: true,
    trades: true,
    cash: false,
    taxLots: 'derived',
    realtime: false,
    oauth: false,
    apiKey: false,
  };

  private importedHoldings: Holding[] = [];
  private importedTrades: Trade[] = [];
  private importSource: string | null = null;
  private importTimestamp: string | null = null;

  async connect(): Promise<AuthState> {
    // CSV provider doesn't need connection
    // It's "connected" when data has been imported
    if (this.importedHoldings.length > 0) {
      this.setAuthState({
        status: 'connected',
        provider: this.id,
        accountId: 'csv-import',
        lastSync: this.importTimestamp || new Date().toISOString(),
      });
      this.setAccount({
        id: 'csv-import',
        provider: this.id,
        name: `CSV Import (${this.importSource || 'Manual'})`,
        clientId: 'csv-user',
        status: 'connected',
        lastSync: this.importTimestamp,
        error: null,
        isPrimary: true,
      });
    } else {
      this.setAuthState({ status: 'disconnected' });
    }
    return this.authState;
  }

  async disconnect(): Promise<void> {
    this.importedHoldings = [];
    this.importedTrades = [];
    this.importSource = null;
    this.importTimestamp = null;
    this.setAuthState({ status: 'disconnected' });
    this.setAccount(null);
  }

  async fetchHoldings(): Promise<Holding[]> {
    if (this.importedHoldings.length === 0) {
      throw new DematDataError(
        this.id,
        'holdings',
        'No holdings imported. Please import a CSV file first.'
      );
    }
    return [...this.importedHoldings];
  }

  async fetchTrades(fromDate: string, toDate: string): Promise<Trade[]> {
    // Filter trades by date range
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    
    return this.importedTrades.filter(t => {
      const tradeTime = new Date(t.timestamp).getTime();
      return tradeTime >= from && tradeTime <= to;
    });
  }

  async fetchCash(): Promise<CashBalance> {
    throw new DematDataError(
      this.id,
      'cash',
      'Cash balance not available from CSV import. Connect a broker for real-time data.'
    );
  }

  /**
   * Parse CSV content and import holdings
   */
  async importHoldingsFromCSV(
    csvContent: string,
    format: 'zerodha' | 'groww' | 'generic' = 'generic'
  ): Promise<{ holdings: Holding[]; errors: string[] }> {
    const errors: string[] = [];
    const holdings: Holding[] = [];
    const mapping = CSV_MAPPINGS[format] || CSV_MAPPINGS.generic;

    try {
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      // Parse header
      const headerLine = lines[0];
      const headers = this.parseCSVLine(headerLine).map(h => h.toLowerCase().trim());
      
      // Find column indices
      const tickerIdx = this.findColumnIndex(headers, mapping.ticker);
      const qtyIdx = this.findColumnIndex(headers, mapping.quantity);
      const avgPriceIdx = this.findColumnIndex(headers, mapping.avgPrice);
      const currentPriceIdx = this.findColumnIndex(headers, mapping.currentPrice);
      const nameIdx = mapping.companyName ? this.findColumnIndex(headers, mapping.companyName) : -1;
      const exchangeIdx = mapping.exchange ? this.findColumnIndex(headers, mapping.exchange) : -1;
      const isinIdx = mapping.isin ? this.findColumnIndex(headers, mapping.isin) : -1;

      if (tickerIdx === -1) {
        throw new Error('Could not find ticker/symbol column');
      }
      if (qtyIdx === -1) {
        throw new Error('Could not find quantity column');
      }
      if (avgPriceIdx === -1) {
        throw new Error('Could not find average price column');
      }

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = this.parseCSVLine(lines[i]);
          if (values.length < Math.max(tickerIdx, qtyIdx, avgPriceIdx) + 1) {
            continue; // Skip incomplete rows
          }

          const ticker = values[tickerIdx]?.trim();
          const quantity = this.parseNumber(values[qtyIdx]);
          const avgBuyPrice = this.parseNumber(values[avgPriceIdx]);
          const currentPrice = currentPriceIdx !== -1 
            ? this.parseNumber(values[currentPriceIdx]) 
            : avgBuyPrice;

          if (!ticker || quantity <= 0) {
            continue; // Skip invalid rows
          }

          const holding: Holding = {
            id: `csv_${ticker}_${Date.now()}_${i}`,
            ticker: ticker.toUpperCase(),
            exchange: exchangeIdx !== -1 ? values[exchangeIdx]?.trim() || 'NSE' : 'NSE',
            isin: isinIdx !== -1 ? values[isinIdx]?.trim() : undefined,
            companyName: nameIdx !== -1 ? values[nameIdx]?.trim() || ticker : ticker,
            quantity,
            avgBuyPrice,
            currentPrice,
            priceTimestamp: new Date().toISOString(),
            unrealizedPnL: (currentPrice - avgBuyPrice) * quantity,
            unrealizedPnLPercent: avgBuyPrice > 0 
              ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 
              : 0,
            dayChange: 0,
            dayChangePercent: 0,
            marketValue: currentPrice * quantity,
            costBasis: avgBuyPrice * quantity,
            productType: 'CNC',
            dematAccountId: 'csv-import',
          };

          holdings.push(holding);
        } catch (rowError: any) {
          errors.push(`Row ${i + 1}: ${rowError.message}`);
        }
      }

      if (holdings.length === 0) {
        throw new Error('No valid holdings found in CSV');
      }

      // Store imported data
      this.importedHoldings = holdings;
      this.importSource = format;
      this.importTimestamp = new Date().toISOString();

      // Auto-connect
      await this.connect();

      return { holdings, errors };
    } catch (error: any) {
      throw new DematDataError(
        this.id,
        'holdings',
        `Failed to parse CSV: ${error.message}`
      );
    }
  }

  /**
   * Import trades from CSV
   */
  async importTradesFromCSV(csvContent: string): Promise<{ trades: Trade[]; errors: string[] }> {
    const errors: string[] = [];
    const trades: Trade[] = [];

    try {
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      const headers = this.parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

      // Expected columns for trades
      const tickerIdx = this.findColumnIndex(headers, ['symbol', 'ticker', 'instrument']);
      const typeIdx = this.findColumnIndex(headers, ['type', 'transaction_type', 'trade_type', 'buy/sell']);
      const qtyIdx = this.findColumnIndex(headers, ['quantity', 'qty', 'units']);
      const priceIdx = this.findColumnIndex(headers, ['price', 'trade_price', 'rate']);
      const dateIdx = this.findColumnIndex(headers, ['date', 'trade_date', 'timestamp']);

      if (tickerIdx === -1 || typeIdx === -1 || qtyIdx === -1 || priceIdx === -1 || dateIdx === -1) {
        throw new Error('Missing required columns in trade CSV');
      }

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = this.parseCSVLine(lines[i]);
          
          const ticker = values[tickerIdx]?.trim().toUpperCase();
          const type = values[typeIdx]?.trim().toUpperCase();
          const quantity = this.parseNumber(values[qtyIdx]);
          const price = this.parseNumber(values[priceIdx]);
          const dateStr = values[dateIdx]?.trim();

          if (!ticker || !type || quantity <= 0 || price <= 0) {
            continue;
          }

          const transactionType: 'BUY' | 'SELL' = 
            type === 'BUY' || type === 'B' ? 'BUY' : 'SELL';

          const trade: Trade = {
            tradeId: `csv_trade_${i}_${Date.now()}`,
            orderId: `csv_order_${i}_${Date.now()}`,
            ticker,
            exchange: 'NSE',
            transactionType,
            quantity,
            price,
            value: quantity * price,
            timestamp: new Date(dateStr).toISOString(),
            tradeDate: dateStr,
            productType: 'CNC',
            orderType: 'MARKET',
            dematAccountId: 'csv-import',
            status: 'COMPLETE',
          };

          trades.push(trade);
        } catch (rowError: any) {
          errors.push(`Row ${i + 1}: ${rowError.message}`);
        }
      }

      this.importedTrades = trades;
      return { trades, errors };
    } catch (error: any) {
      throw new DematDataError(
        this.id,
        'trades',
        `Failed to parse trades CSV: ${error.message}`
      );
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private findColumnIndex(headers: string[], candidates: string[]): number {
    const normalizedCandidates = candidates.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    for (let i = 0; i < headers.length; i++) {
      const normalizedHeader = headers[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedCandidates.some(c => normalizedHeader.includes(c) || c.includes(normalizedHeader))) {
        return i;
      }
    }
    return -1;
  }

  private parseNumber(value: string | undefined): number {
    if (!value) return 0;
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
}

// Export singleton
export const csvProvider = new CSVProvider();

