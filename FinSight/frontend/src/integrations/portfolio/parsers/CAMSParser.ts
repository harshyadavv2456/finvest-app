/**
 * CAMS Consolidated Account Statement (CAS) Parser
 * 
 * Parses PDF statements from CAMS to extract mutual fund holdings.
 * 
 * NOTE: Full PDF parsing requires a backend service with pdf-parse or similar.
 * This frontend module handles the parsed CSV/JSON output from that service.
 * 
 * CAMS CAS typically contains:
 * - Folio Number
 * - Scheme Name
 * - Units
 * - NAV
 * - Current Value
 * - Transaction history
 */

import { 
  PortfolioSnapshot, 
  Holding, 
  Transaction, 
  IngestionResult 
} from '../types';

// Expected columns in CAMS CAS CSV export
// These types document the expected structure but parsing is dynamic
// interface CAMSHoldingRow { folio_number, scheme_name, isin, units, nav, current_value, purchase_date, purchase_nav }
// interface CAMSTransactionRow { folio_number, scheme_name, isin, transaction_date, transaction_type, units, nav, amount }

/**
 * Parse CAMS CAS CSV data
 * In production, this would receive data from a backend PDF parser
 */
export function parseCAMSCSV(csvContent: string): IngestionResult {
  const warnings: string[] = [];
  
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return {
        success: false,
        error: 'Invalid CAMS file: No data rows found',
        warnings
      };
    }

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    // Detect if this is holdings or transactions
    const isHoldings = headers.includes('units') && headers.includes('nav');
    const isTransactions = headers.includes('transaction_date') || headers.includes('trans_date');

    const holdings: Holding[] = [];
    const transactions: Transaction[] = [];
    let totalInvested = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) {
        warnings.push(`Row ${i + 1}: Incomplete data, skipping`);
        continue;
      }

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || '';
      });

      if (isHoldings) {
        const holding = parseHoldingRow(row, i, warnings);
        if (holding) {
          holdings.push(holding);
          totalInvested += holding.quantity * holding.avg_price;
        }
      }

      if (isTransactions) {
        const transaction = parseTransactionRow(row, i, warnings);
        if (transaction) {
          transactions.push(transaction);
        }
      }
    }

    if (holdings.length === 0 && transactions.length === 0) {
      return {
        success: false,
        error: 'No valid holdings or transactions found in file',
        warnings
      };
    }

    const now = new Date();
    const snapshot: PortfolioSnapshot = {
      demat_id: 'CAMS-MF',
      broker: 'CAMS',
      source: 'CAMS_CAS',
      ingested_at: now.toISOString(),
      version: `${now.toISOString().slice(0, 13).replace(/[:-]/g, '')}`,
      holdings,
      transactions,
      total_holdings: holdings.length,
      total_invested: totalInvested,
      is_valid: warnings.length === 0,
      validation_errors: warnings.filter(w => w.startsWith('ERROR:'))
    };

    return {
      success: true,
      snapshot,
      warnings
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse CAMS file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      warnings
    };
  }
}

function parseHoldingRow(row: Record<string, string>, rowIndex: number, warnings: string[]): Holding | null {
  const units = parseFloat(row['units'] || row['unit'] || '0');
  const nav = parseFloat(row['nav'] || row['purchase_nav'] || '0');
  const isin = row['isin'] || '';

  if (!isin) {
    warnings.push(`Row ${rowIndex + 1}: Missing ISIN, skipping`);
    return null;
  }

  if (units <= 0) {
    warnings.push(`Row ${rowIndex + 1}: Zero or negative units, skipping`);
    return null;
  }

  // Extract symbol from scheme name (best effort)
  const schemeName = row['scheme_name'] || row['scheme'] || '';
  const symbol = extractSymbolFromScheme(schemeName);

  // Parse acquisition date
  let acquisitionDate = row['purchase_date'] || row['trans_date'] || '';
  if (!acquisitionDate || acquisitionDate === '-') {
    acquisitionDate = new Date().toISOString().slice(0, 10);
    warnings.push(`Row ${rowIndex + 1}: Missing purchase date, using today`);
  }

  return {
    symbol: symbol || isin.slice(0, 12),
    isin,
    quantity: units,
    avg_price: nav,
    acquisition_date: normalizeDate(acquisitionDate),
    exchange: 'NSE',  // MF units are typically on NSE
    market: 'IN'
  };
}

function parseTransactionRow(row: Record<string, string>, rowIndex: number, warnings: string[]): Transaction | null {
  const units = parseFloat(row['units'] || row['unit'] || '0');
  const nav = parseFloat(row['nav'] || '0');
  const isin = row['isin'] || '';
  const transType = (row['transaction_type'] || row['type'] || '').toUpperCase();

  if (!isin) {
    warnings.push(`Row ${rowIndex + 1}: Missing ISIN in transaction, skipping`);
    return null;
  }

  if (units === 0) {
    return null; // Skip zero-unit transactions
  }

  const type: 'BUY' | 'SELL' = transType.includes('REDEEM') || transType.includes('SELL') ? 'SELL' : 'BUY';
  const schemeName = row['scheme_name'] || row['scheme'] || '';

  return {
    symbol: extractSymbolFromScheme(schemeName) || isin.slice(0, 12),
    isin,
    date: normalizeDate(row['transaction_date'] || row['trans_date'] || ''),
    type,
    quantity: Math.abs(units),
    price: nav,
    charges: parseFloat(row['stamp_duty'] || '0') + parseFloat(row['stt'] || '0'),
    exchange: 'NSE'
  };
}

function extractSymbolFromScheme(schemeName: string): string {
  // Extract AMC name as symbol approximation
  const amcPatterns = [
    'HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'NIPPON', 'BIRLA', 
    'UTI', 'TATA', 'DSP', 'MIRAE', 'PPFAS', 'QUANT'
  ];
  
  const upperScheme = schemeName.toUpperCase();
  for (const amc of amcPatterns) {
    if (upperScheme.includes(amc)) {
      return `${amc}-MF`;
    }
  }
  return schemeName.slice(0, 20).replace(/[^A-Za-z0-9]/g, '');
}

function normalizeDate(dateStr: string): string {
  // Handle DD-MMM-YYYY, DD/MM/YYYY, YYYY-MM-DD formats
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  
  // DD-MMM-YYYY (e.g., 15-Jan-2024)
  const dmy = dateStr.match(/(\d{1,2})[-\/](\w{3}|\d{1,2})[-\/](\d{2,4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    let month = dmy[2];
    let year = dmy[3];
    
    if (year.length === 2) {
      year = (parseInt(year) > 50 ? '19' : '20') + year;
    }
    
    // Convert month name to number
    const monthMap: Record<string, string> = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    
    if (isNaN(parseInt(month))) {
      month = monthMap[month.toLowerCase().slice(0, 3)] || '01';
    } else {
      month = month.padStart(2, '0');
    }
    
    return `${year}-${month}-${day}`;
  }
  
  return new Date().toISOString().slice(0, 10);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

export default {
  parseCAMSCSV
};

