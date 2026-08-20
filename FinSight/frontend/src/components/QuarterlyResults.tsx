import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface QuarterlyResultsProps {
  ticker: string;
  currency?: string;
  market?: string;
}

export default function QuarterlyResults({ ticker, currency, market }: QuarterlyResultsProps) {
  const [quarterlyData, setQuarterlyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<'income' | 'balance' | 'cashflow'>('income');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setTimeoutWarning(false);
      
      // Show timeout warning after 5 seconds
      const timeoutId = setTimeout(() => {
        setTimeoutWarning(true);
      }, 5000);
      
      try {
        const data = await api.getTickerQuarterly(ticker);
        clearTimeout(timeoutId);
        setQuarterlyData(data);
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.log('Retrying quarterly data load...', err);
        // Retry after delay
        setTimeout(() => loadData(), 2000);
        return;
      } finally {
        setLoading(false);
        setTimeoutWarning(false);
      }
    };

    loadData();
  }, [ticker]);

  const getCurrencySymbol = (): string => {
    if (currency) {
      const currencyMap: Record<string, string> = {
        'USD': '$',
        'INR': '₹',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'SGD': 'S$',
        'HKD': 'HK$',
      };
      return currencyMap[currency] || currency;
    }
    const marketMap: Record<string, string> = {
      'IN': '₹',
      'US': '$',
      'UK': '£',
      'JP': '¥',
      'CN': '¥',
      'SG': 'S$',
      'HK': 'HK$',
    };
    return marketMap[market || ''] || '$';
  };

  const formatNumber = (value: any): string => {
    if (value === undefined || value === null || value === '') return '—';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '—';
    const symbol = getCurrencySymbol();
    if (Math.abs(num) >= 1e12) return `${symbol}${(num / 1e12).toFixed(2)}T`;
    if (Math.abs(num) >= 1e9) return `${symbol}${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `${symbol}${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `${symbol}${(num / 1e3).toFixed(2)}K`;
    return `${symbol}${num.toFixed(2)}`;
  };

  const formatPercent = (value: any): string => {
    if (value === undefined || value === null || value === '') return '—';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '—';
    return `${num.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bloomberg-accent mb-4"></div>
          <div className="text-bloomberg-text-muted">Loading quarterly data...</div>
          {timeoutWarning && (
            <div className="mt-4 text-sm text-yellow-400">
              Taking longer than usual...
            </div>
          )}
        </div>
      </div>
    );
  }


  if (!quarterlyData || quarterlyData.quarters.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold text-bloomberg-text mb-4">Quarterly Results</h2>
        <div className="text-bloomberg-text-muted">No quarterly data available.</div>
      </div>
    );
  }

  const quarters = quarterlyData.quarters.slice(0, 12);
  const dates = quarters.map((q: any) => q.date);

  const getIncomeStatementRows = () => {
    const keyMapping: Array<{ label: string; possibleKeys: string[]; format?: string }> = [
      { label: 'Sales', possibleKeys: ['Total Revenue', 'totalRevenue', 'Revenue', 'Reconciled Cost Of Revenue'] },
      { label: 'Expenses', possibleKeys: ['Total Expenses', 'totalExpenses', 'Cost Of Revenue', 'Reconciled Cost Of Revenue'] },
      { label: 'Operating Profit', possibleKeys: ['Operating Income', 'operatingIncome', 'EBIT', 'EBITDA'] },
      { label: 'OPM %', possibleKeys: ['Operating Margin', 'operatingMargin'], format: 'percent' },
      { label: 'Other Income', possibleKeys: ['Other Income Expenses', 'otherIncomeExpenses', 'Other Non Operating Income Expenses'] },
      { label: 'Interest', possibleKeys: ['Interest Expense', 'interestExpense', 'Net Interest Income'] },
      { label: 'Depreciation', possibleKeys: ['Depreciation And Amortization', 'depreciation', 'Reconciled Depreciation', 'Depreciation Income Statement'] },
      { label: 'Profit before tax', possibleKeys: ['Pretax Income', 'incomeBeforeTax', 'Pretax Income'] },
      { label: 'Tax %', possibleKeys: ['Tax Rate For Calcs', 'taxRate'], format: 'percent' },
      { label: 'Net Profit', possibleKeys: ['Net Income', 'netIncome', 'Net Income Common Stockholders', 'Net Income From Continuing Operation Net Minority Interest'] },
      { label: 'EPS (Rs)', possibleKeys: ['Basic EPS', 'basicEPS', 'Diluted EPS', 'Diluted EPS'] },
    ];

    return keyMapping.map((row) => ({
      label: row.label,
      format: row.format,
      values: dates.map((date: string) => {
        const quarter = quarters.find((q: any) => q.date === date);
        const stmt = quarter?.income_statement || {};
        for (const key of row.possibleKeys) {
          if (stmt[key] !== undefined && stmt[key] !== null) {
            return stmt[key];
          }
        }
        return undefined;
      }),
    }));
  };

  const getBalanceSheetRows = () => {
    const keyMapping: Array<{ label: string; possibleKeys: string[] }> = [
      { label: 'Equity Capital', possibleKeys: ['Common Stock', 'commonStock', 'Capital Stock', 'Share Issued'] },
      { label: 'Reserves', possibleKeys: ['Retained Earnings', 'retainedEarnings', 'Other Equity Interest'] },
      { label: 'Borrowings', possibleKeys: ['Total Debt', 'totalDebt', 'Net Debt', 'Long Term Debt'] },
      { label: 'Other Liabilities', possibleKeys: ['Other Liab', 'otherLiab', 'Other Non Current Liabilities'] },
      { label: 'Total Liabilities', possibleKeys: ['Total Liabilities Net Minority Interest', 'totalStockholderEquity', 'Total Stockholder Equity'] },
      { label: 'Fixed Assets', possibleKeys: ['Property Plant Equipment', 'propertyPlantEquipment', 'Net PPE'] },
      { label: 'Investments', possibleKeys: ['Long Term Investments', 'longTermInvestments', 'Investmentin Financial Assets'] },
      { label: 'Other Assets', possibleKeys: ['Other Assets', 'otherAssets', 'Other Non Current Assets'] },
      { label: 'Total Assets', possibleKeys: ['Total Assets', 'totalAssets'] },
    ];

    return keyMapping.map((row) => ({
      label: row.label,
      values: dates.map((date: string) => {
        const quarter = quarters.find((q: any) => q.date === date);
        const bs = quarter?.balance_sheet || {};
        for (const key of row.possibleKeys) {
          if (bs[key] !== undefined && bs[key] !== null) {
            return bs[key];
          }
        }
        return undefined;
      }),
    }));
  };

  const getCashFlowRows = () => {
    const keyMapping: Array<{ label: string; possibleKeys: string[] }> = [
      { label: 'Cash from Operating', possibleKeys: ['Operating Cash Flow', 'totalCashFromOperatingActivities', 'Operating Cash Flow'] },
      { label: 'Cash from Investing', possibleKeys: ['Investing Cash Flow', 'totalCashflowsFromInvestingActivities', 'Investing Cash Flow'] },
      { label: 'Cash from Financing', possibleKeys: ['Financing Cash Flow', 'totalCashFromFinancingActivities', 'Financing Cash Flow'] },
      { label: 'Net Cash Flow', possibleKeys: ['Changes In Cash', 'changeInCash', 'Changes In Cash'] },
    ];

    return keyMapping.map((row) => ({
      label: row.label,
      values: dates.map((date: string) => {
        const quarter = quarters.find((q: any) => q.date === date);
        const cf = quarter?.cashflow || {};
        for (const key of row.possibleKeys) {
          if (cf[key] !== undefined && cf[key] !== null) {
            return cf[key];
          }
        }
        return undefined;
      }),
    }));
  };

  const getRows = (): Array<{ label: string; format?: string; values: any[] }> => {
    switch (selectedStatement) {
      case 'income':
        return getIncomeStatementRows();
      case 'balance':
        return getBalanceSheetRows();
      case 'cashflow':
        return getCashFlowRows();
      default:
        return [];
    }
  };

  const formatValue = (value: any, format?: string) => {
    if (format === 'percent') {
      return formatPercent(value);
    }
    return formatNumber(value);
  };

  return (
    <div className="card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-bloomberg-text mb-4">Quarterly Results</h2>
        
        <div className="flex gap-4 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedStatement('income')}
              className={`px-4 py-2 rounded-md text-sm ${
                selectedStatement === 'income'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Profit & Loss
            </button>
            <button
              onClick={() => setSelectedStatement('balance')}
              className={`px-4 py-2 rounded-md text-sm ${
                selectedStatement === 'balance'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Balance Sheet
            </button>
            <button
              onClick={() => setSelectedStatement('cashflow')}
              className={`px-4 py-2 rounded-md text-sm ${
                selectedStatement === 'cashflow'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Cash Flow
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bloomberg-dark border-b border-bloomberg-border">
            <tr>
              <th className="px-4 py-3 text-left text-bloomberg-text-muted font-semibold sticky left-0 bg-bloomberg-dark">
                Item
              </th>
              {dates.map((date: string) => (
                <th
                  key={date}
                  className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold min-w-[120px]"
                >
                  {new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getRows().map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-bloomberg-border hover:bg-bloomberg-panel"
              >
                <td className="px-4 py-3 text-bloomberg-text font-medium sticky left-0 bg-bloomberg-panel">
                  {row.label}
                </td>
                {row.values.map((value: any, valIdx: number) => (
                  <td
                    key={valIdx}
                    className="px-4 py-3 text-right text-bloomberg-text"
                  >
                    {formatValue(value, row.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
