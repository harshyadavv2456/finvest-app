/**
 * CDSL Easiest / EasiestEST CSV Parser
 * 
 * Parses CSV statements from CDSL to extract equity holdings.
 * 
 * CDSL Easiest format typically contains:
 * - BO ID (Beneficial Owner ID)
 * - ISIN
 * - Company Name
 * - Quantity
 * - Free Balance
 * - Pledged Quantity
 * 
 * This parser handles the standard CDSL CSV export format.
 */

import { 
  PortfolioSnapshot, 
  Holding, 
  IngestionResult,
  Exchange
} from '../types';

// Expected columns in CDSL Easiest CSV
// These types document the expected structure but parsing is dynamic
// interface CDSLHoldingRow { bo_id, isin, company_name, quantity, free_balance, pledged_qty, market_value, avg_cost }

// NSE Symbol mapping (common stocks)
const ISIN_TO_SYMBOL: Record<string, string> = {
  'INE002A01018': 'RELIANCE',
  'INE009A01021': 'INFY',
  'INE467B01029': 'TCS',
  'INE040A01034': 'HDFCBANK',
  'INE154A01025': 'ITC',
  'INE090A01021': 'ICICIBANK',
  'INE585B01010': 'MARUTI',
  'INE028A01039': 'HINDUNILVR',
  'INE176A01028': 'TATAMOTORS',
  'INE081A01020': 'BHARTIARTL',
  'INE030A01027': 'ONGC',
  'INE018A01030': 'BAJFINANCE',
  'INE102D01028': 'LT',
  'INE019A01038': 'SBIN',
  'INE001A01036': 'HDFC',
  'INE158A01026': 'WIPRO',
  'INE017A01032': 'TITAN',
  'INE066A01021': 'AXISBANK',
  'INE159A01016': 'TECHM',
  'INE062A01020': 'SUNPHARMA',
  'INE239A01016': 'NESTLEIND',
  'INE047A01021': 'ASIANPAINT',
  'INE237A01028': 'KOTAKBANK',
  'INE118H01025': 'ADANIENT',
  'INE092T01019': 'ADANIGREEN',
  'INE742F01042': 'ADANIPORTS',
  'INE101A01026': 'HCLTECH',
  'INE115A01026': 'DRREDDY',
  'INE341K01019': 'ZOMATO',
  'INE758T01015': 'PAYTM',
  'INE121J01017': 'NYKAA',
};

/**
 * Parse CDSL Easiest CSV data
 */
export function parseCDSLCSV(csvContent: string, dematId?: string): IngestionResult {
  const warnings: string[] = [];
  
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return {
        success: false,
        error: 'Invalid CDSL file: No data rows found',
        warnings
      };
    }

    // Find header row (CDSL files sometimes have metadata rows at top)
    let headerIndex = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].toLowerCase();
      if (line.includes('isin') || line.includes('company') || line.includes('symbol')) {
        headerIndex = i;
        break;
      }
    }

    const headers = lines[headerIndex].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
    
    const holdings: Holding[] = [];
    let totalInvested = 0;
    let extractedDematId = dematId || '';

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 2) continue; // Skip empty rows

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim().replace(/['"]/g, '') || '';
      });

      // Extract BO ID / Demat ID if present
      if (!extractedDematId && (row['bo_id'] || row['dp_id'] || row['client_id'])) {
        extractedDematId = row['bo_id'] || row['dp_id'] || row['client_id'];
      }

      const holding = parseHoldingRow(row, i, warnings);
      if (holding) {
        holdings.push(holding);
        totalInvested += holding.quantity * holding.avg_price;
      }
    }

    if (holdings.length === 0) {
      return {
        success: false,
        error: 'No valid holdings found in CDSL file. Please ensure the file contains ISIN and quantity columns.',
        warnings
      };
    }

    const now = new Date();
    const snapshot: PortfolioSnapshot = {
      demat_id: extractedDematId || `CDSL-${now.getTime()}`,
      broker: detectBroker(extractedDematId),
      source: 'CDSL_EASIEST',
      ingested_at: now.toISOString(),
      version: `${now.toISOString().slice(0, 13).replace(/[:-]/g, '')}`,
      holdings,
      transactions: [], // CDSL Easiest doesn't include transaction history
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
      error: `Failed to parse CDSL file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      warnings
    };
  }
}

function parseHoldingRow(row: Record<string, string>, rowIndex: number, warnings: string[]): Holding | null {
  // Find ISIN column (various possible names)
  const isin = row['isin'] || row['isin_no'] || row['isin_number'] || '';
  
  if (!isin || isin.length !== 12 || !isin.startsWith('IN')) {
    if (Object.values(row).some(v => v.length > 0)) {
      warnings.push(`Row ${rowIndex + 1}: Invalid or missing ISIN "${isin}", skipping`);
    }
    return null;
  }

  // Find quantity (various possible names)
  const quantityStr = row['quantity'] || row['qty'] || row['free_balance'] || 
                      row['total_qty'] || row['holding_qty'] || '0';
  const quantity = parseFloat(quantityStr.replace(/,/g, ''));

  if (quantity <= 0 || isNaN(quantity)) {
    warnings.push(`Row ${rowIndex + 1}: Zero or invalid quantity for ${isin}, skipping`);
    return null;
  }

  // Find average cost (various possible names)
  const avgCostStr = row['avg_cost'] || row['average_cost'] || row['purchase_price'] || 
                     row['cost_price'] || row['price'] || '0';
  const avgCost = parseFloat(avgCostStr.replace(/,/g, '')) || 0;

  // Company name
  const companyName = row['company_name'] || row['company'] || row['scrip_name'] || 
                      row['security_name'] || row['name'] || '';

  // Map ISIN to symbol
  const symbol = ISIN_TO_SYMBOL[isin] || extractSymbolFromName(companyName) || isin;

  // Determine exchange (default NSE for Indian stocks)
  const exchange: Exchange = 'NSE';

  // Default acquisition date (if not provided, we use a placeholder)
  const acquisitionDate = row['purchase_date'] || row['trans_date'] || row['date'] || '';

  return {
    symbol,
    isin,
    quantity,
    avg_price: avgCost,
    acquisition_date: acquisitionDate ? normalizeDate(acquisitionDate) : 'UNKNOWN',
    exchange,
    market: 'IN'
  };
}

function extractSymbolFromName(companyName: string): string {
  if (!companyName) return '';
  
  // Common patterns in company names
  const cleanName = companyName
    .toUpperCase()
    .replace(/LIMITED|LTD|INDIA|INDUSTRIES|CORPORATION|CORP|PVT|PRIVATE/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .trim()
    .split(' ')[0];
  
  return cleanName.slice(0, 12);
}

function detectBroker(dematId: string): string {
  if (!dematId) return 'Unknown';
  
  const id = dematId.toUpperCase();
  
  // Common DP ID patterns
  if (id.includes('1201') || id.includes('ZERODHA')) return 'Zerodha';
  if (id.includes('1202') || id.includes('GROWW')) return 'Groww';
  if (id.includes('1203') || id.includes('UPSTOX')) return 'Upstox';
  if (id.includes('1204') || id.includes('ANGEL')) return 'Angel One';
  if (id.includes('1205') || id.includes('ICICI')) return 'ICICI Direct';
  if (id.includes('1206') || id.includes('HDFC')) return 'HDFC Securities';
  if (id.includes('1207') || id.includes('KOTAK')) return 'Kotak Securities';
  
  return 'Unknown';
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return 'UNKNOWN';
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  
  // DD-MMM-YYYY or DD/MM/YYYY
  const dmy = dateStr.match(/(\d{1,2})[-\/](\w{3}|\d{1,2})[-\/](\d{2,4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    let month = dmy[2];
    let year = dmy[3];
    
    if (year.length === 2) {
      year = (parseInt(year) > 50 ? '19' : '20') + year;
    }
    
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
  
  return 'UNKNOWN';
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

/**
 * Generate a sample CDSL CSV template for users to fill
 */
export function generateCDSLTemplate(): string {
  return `ISIN,Company Name,Quantity,Average Cost,Purchase Date
INE002A01018,RELIANCE INDUSTRIES LTD,10,2450.50,2023-06-15
INE009A01021,INFOSYS LIMITED,25,1380.00,2023-08-20
INE467B01029,TATA CONSULTANCY SERVICES,15,3520.75,2024-01-10
INE040A01034,HDFC BANK LIMITED,50,1650.25,2023-03-05

INSTRUCTIONS:
1. Add your holdings in the format above
2. ISIN is required (12 characters starting with IN)
3. Quantity must be positive
4. Average Cost is the price you paid per share
5. Purchase Date should be in YYYY-MM-DD format
6. Delete this instruction block before uploading`;
}

export default {
  parseCDSLCSV,
  generateCDSLTemplate
};

