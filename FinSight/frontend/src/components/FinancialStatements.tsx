import { useState } from 'react';
import { FundamentalsResponse } from '../lib/api';

interface FinancialStatementsProps {
  fundamentals: FundamentalsResponse;
  currency?: string;
  market?: string;
}

export default function FinancialStatements({ fundamentals, currency, market }: FinancialStatementsProps) {
  const [activeStatement, setActiveStatement] = useState<'income' | 'balance' | 'cashflow'>('income');

  const balanceSheet = fundamentals.balance_sheet || {};
  const incomeStatement = fundamentals.income_statement || {};
  const cashflowStatement = fundamentals.cashflow_statement || {};

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

  // Get available dates
  const getDates = (statement: Record<string, any>): string[] => {
    return Object.keys(statement)
      .filter((key) => key.length > 10 && !isNaN(Date.parse(key)))
      .sort()
      .reverse()
      .slice(0, 10);
  };

  const incomeDates = getDates(incomeStatement);
  const balanceDates = getDates(balanceSheet);
  const cashflowDates = getDates(cashflowStatement);

  const getIncomeStatementRows = () => {
    // Map common field names to actual keys in the data
    const fieldMapping: Record<string, string[]> = {
      'Total Revenue': ['Total Revenue', 'totalRevenue', 'Revenue'],
      'Cost of Revenue': ['Reconciled Cost Of Revenue', 'costOfRevenue', 'Cost Of Revenue'],
      'Gross Profit': ['Gross Profit', 'grossProfit'],
      'Operating Expenses': ['Operating Expense', 'operatingExpenses', 'Total Operating Expenses'],
      'Operating Income': ['Operating Income', 'operatingIncome', 'EBIT'],
      'EBITDA': ['EBITDA', 'Normalized EBITDA'],
      'Other Income/Expenses': ['Other Income Expense', 'otherIncomeExpenses', 'Total Unusual Items'],
      'Interest Expense': ['Interest Expense', 'interestExpense'],
      'Depreciation': ['Reconciled Depreciation', 'depreciation', 'Depreciation'],
      'Income Before Tax': ['Pretax Income', 'incomeBeforeTax', 'EBT'],
      'Tax Rate %': ['Tax Rate For Calcs', 'taxRate', 'Tax Rate'],
      'Net Income': ['Net Income', 'netIncome', 'Net Income From Continuing Operation Net Minority Interest'],
      'Basic EPS': ['Basic EPS', 'basicEPS', 'Diluted EPS'],
    };

    const rows: Array<{ label: string; keys: string[]; format?: string }> = [
      { label: 'Total Revenue', keys: fieldMapping['Total Revenue'] },
      { label: 'Cost of Revenue', keys: fieldMapping['Cost of Revenue'] },
      { label: 'Gross Profit', keys: fieldMapping['Gross Profit'] },
      { label: 'Operating Expenses', keys: fieldMapping['Operating Expenses'] },
      { label: 'Operating Income', keys: fieldMapping['Operating Income'] },
      { label: 'EBITDA', keys: fieldMapping['EBITDA'] },
      { label: 'Other Income/Expenses', keys: fieldMapping['Other Income/Expenses'] },
      { label: 'Interest Expense', keys: fieldMapping['Interest Expense'] },
      { label: 'Depreciation', keys: fieldMapping['Depreciation'] },
      { label: 'Income Before Tax', keys: fieldMapping['Income Before Tax'] },
      { label: 'Tax Rate %', keys: fieldMapping['Tax Rate %'], format: 'percent' },
      { label: 'Net Income', keys: fieldMapping['Net Income'] },
      { label: 'Basic EPS', keys: fieldMapping['Basic EPS'] },
    ];

    return rows.map((row) => {
      const getValue = (date: string) => {
        const dateData = incomeStatement[date] || {};
        // Try each key until we find a value
        for (const key of row.keys) {
          if (dateData[key] !== undefined && dateData[key] !== null) {
            return dateData[key];
          }
        }
        return null;
      };

      return {
        label: row.label,
        key: row.keys[0],
        format: row.format,
        values: incomeDates.map((date) => getValue(date)),
      };
    });
  };

  const getBalanceSheetRows = () => {
    const fieldMapping: Record<string, string[]> = {
      'Cash and Cash Equivalents': ['Cash And Cash Equivalents', 'cash', 'Cash Cash Equivalents And Short Term Investments'],
      'Short Term Investments': ['Short Term Investments', 'shortTermInvestments'],
      'Total Current Assets': ['Current Assets', 'totalCurrentAssets', 'Total Current Assets'],
      'Property Plant Equipment': ['Net PPE', 'propertyPlantEquipment', 'Properties'],
      'Long Term Investments': ['Long Term Investments', 'longTermInvestments', 'Investments And Advances'],
      'Total Assets': ['Total Assets', 'totalAssets'],
      'Accounts Payable': ['Accounts Payable', 'accountsPayable', 'Payables'],
      'Short Term Debt': ['Current Debt', 'shortLongTermDebt', 'Current Debt And Capital Lease Obligation'],
      'Total Current Liabilities': ['Current Liabilities', 'totalCurrentLiabilities', 'Total Current Liabilities'],
      'Long Term Debt': ['Long Term Debt', 'longTermDebt', 'Long Term Debt And Capital Lease Obligation'],
      'Total Liabilities': ['Total Liabilities Net Minority Interest', 'totalLiab', 'Total Liabilities'],
      'Common Stock': ['Common Stock', 'commonStock', 'Stockholders Equity'],
      'Retained Earnings': ['Retained Earnings', 'retainedEarnings'],
      'Total Stockholder Equity': ['Stockholders Equity', 'totalStockholderEquity', 'Total Equity Gross Minority Interest'],
    };

    const rows: Array<{ label: string; keys: string[] }> = [
      { label: 'Cash and Cash Equivalents', keys: fieldMapping['Cash and Cash Equivalents'] },
      { label: 'Short Term Investments', keys: fieldMapping['Short Term Investments'] },
      { label: 'Total Current Assets', keys: fieldMapping['Total Current Assets'] },
      { label: 'Property Plant Equipment', keys: fieldMapping['Property Plant Equipment'] },
      { label: 'Long Term Investments', keys: fieldMapping['Long Term Investments'] },
      { label: 'Total Assets', keys: fieldMapping['Total Assets'] },
      { label: 'Accounts Payable', keys: fieldMapping['Accounts Payable'] },
      { label: 'Short Term Debt', keys: fieldMapping['Short Term Debt'] },
      { label: 'Total Current Liabilities', keys: fieldMapping['Total Current Liabilities'] },
      { label: 'Long Term Debt', keys: fieldMapping['Long Term Debt'] },
      { label: 'Total Liabilities', keys: fieldMapping['Total Liabilities'] },
      { label: 'Common Stock', keys: fieldMapping['Common Stock'] },
      { label: 'Retained Earnings', keys: fieldMapping['Retained Earnings'] },
      { label: 'Total Stockholder Equity', keys: fieldMapping['Total Stockholder Equity'] },
    ];

    return rows.map((row) => {
      const getValue = (date: string) => {
        const dateData = balanceSheet[date] || {};
        for (const key of row.keys) {
          if (dateData[key] !== undefined && dateData[key] !== null) {
            return dateData[key];
          }
        }
        return null;
      };

      return {
        label: row.label,
        key: row.keys[0],
        values: balanceDates.map((date) => getValue(date)),
      };
    });
  };

  const getCashFlowRows = () => {
    const fieldMapping: Record<string, string[]> = {
      'Net Income': ['Net Income', 'netIncome'],
      'Depreciation': ['Depreciation', 'depreciation', 'Reconciled Depreciation'],
      'Change To Netincome': ['Changes In Cash', 'changeToNetincome'],
      'Change To Operating Activities': ['Change In Working Capital', 'changeToOperatingActivities'],
      'Total Cash From Operating Activities': ['Operating Cash Flow', 'totalCashFromOperatingActivities', 'Cash From Operating Activities'],
      'Capital Expenditures': ['Capital Expenditure', 'capitalExpenditures', 'Capital Expenditures'],
      'Investments': ['Purchase Of Investment', 'investments', 'Investments'],
      'Total Cashflows From Investing Activities': ['Investing Cash Flow', 'totalCashflowsFromInvestingActivities', 'Cash From Investing Activities'],
      'Dividends Paid': ['Dividends Paid', 'dividendsPaid', 'Common Stock Dividends Paid'],
      'Net Borrowings': ['Net Issuance Of Debt', 'netBorrowings', 'Issuance Of Debt'],
      'Total Cash From Financing Activities': ['Financing Cash Flow', 'totalCashFromFinancingActivities', 'Cash From Financing Activities'],
      'Change In Cash': ['Changes In Cash', 'changeInCash', 'Free Cash Flow'],
      'Repurchase Of Stock': ['Repurchase Of Capital Stock', 'repurchaseOfStock', 'Repurchase Of Stock'],
    };

    const rows: Array<{ label: string; keys: string[] }> = [
      { label: 'Net Income', keys: fieldMapping['Net Income'] },
      { label: 'Depreciation', keys: fieldMapping['Depreciation'] },
      { label: 'Change To Netincome', keys: fieldMapping['Change To Netincome'] },
      { label: 'Change To Operating Activities', keys: fieldMapping['Change To Operating Activities'] },
      { label: 'Total Cash From Operating Activities', keys: fieldMapping['Total Cash From Operating Activities'] },
      { label: 'Capital Expenditures', keys: fieldMapping['Capital Expenditures'] },
      { label: 'Investments', keys: fieldMapping['Investments'] },
      { label: 'Total Cashflows From Investing Activities', keys: fieldMapping['Total Cashflows From Investing Activities'] },
      { label: 'Dividends Paid', keys: fieldMapping['Dividends Paid'] },
      { label: 'Net Borrowings', keys: fieldMapping['Net Borrowings'] },
      { label: 'Total Cash From Financing Activities', keys: fieldMapping['Total Cash From Financing Activities'] },
      { label: 'Change In Cash', keys: fieldMapping['Change In Cash'] },
      { label: 'Repurchase Of Stock', keys: fieldMapping['Repurchase Of Stock'] },
    ];

    return rows.map((row) => {
      const getValue = (date: string) => {
        const dateData = cashflowStatement[date] || {};
        for (const key of row.keys) {
          if (dateData[key] !== undefined && dateData[key] !== null) {
            return dateData[key];
          }
        }
        return null;
      };

      return {
        label: row.label,
        key: row.keys[0],
        values: cashflowDates.map((date) => getValue(date)),
      };
    });
  };

  const getRows = (): Array<{ label: string; key: string; format?: string; values: any[] }> => {
    switch (activeStatement) {
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

  const getDatesForStatement = () => {
    switch (activeStatement) {
      case 'income':
        return incomeDates;
      case 'balance':
        return balanceDates;
      case 'cashflow':
        return cashflowDates;
      default:
        return [];
    }
  };

  const formatValue = (value: any, format?: string) => {
    if (format === 'percent') {
      if (value === undefined || value === null) return '—';
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num)) return '—';
      return `${(num * 100).toFixed(2)}%`;
    }
    return formatNumber(value);
  };

  const dates = getDatesForStatement();

  return (
    <div className="card">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-bloomberg-text mb-4">Financial Statements</h2>
        
        <div className="flex gap-4 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveStatement('income')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeStatement === 'income'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Profit & Loss
            </button>
            <button
              onClick={() => setActiveStatement('balance')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeStatement === 'balance'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Balance Sheet
            </button>
            <button
              onClick={() => setActiveStatement('cashflow')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeStatement === 'cashflow'
                  ? 'bg-bloomberg-accent text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text hover:bg-bloomberg-border'
              }`}
            >
              Cash Flow
            </button>
          </div>
        </div>
      </div>

      {dates.length === 0 ? (
        <div className="text-bloomberg-text-muted">No financial statement data available.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bloomberg-dark border-b border-bloomberg-border">
              <tr>
                <th className="px-4 py-3 text-left text-bloomberg-text-muted font-semibold sticky left-0 bg-bloomberg-dark z-10">
                  Item
                </th>
                {dates.map((date) => (
                  <th
                    key={date}
                    className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold min-w-[140px]"
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
                  className="border-b border-bloomberg-border hover:bg-bloomberg-panel transition-colors"
                >
                  <td className="px-4 py-3 text-bloomberg-text font-medium sticky left-0 bg-bloomberg-panel z-10">
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
      )}
    </div>
  );
}

