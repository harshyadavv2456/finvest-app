import { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { FundamentalsResponse } from '../lib/api';

interface FinancialsChartsProps {
  fundamentals: FundamentalsResponse;
  currency?: string;
  market?: string;
}

export default function FinancialsCharts({ fundamentals, currency, market }: FinancialsChartsProps) {
  const [timeframe, setTimeframe] = useState<'semiannual' | 'annual'>('semiannual');

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

  const symbol = getCurrencySymbol();

  // Process income statement data
  const performanceData = useMemo(() => {
    const income = fundamentals.income_statement || {};
    const dates = Object.keys(income)
      .filter(k => k.length >= 10)
      .sort()
      .reverse()
      .slice(0, 8);

    return dates.map(date => {
      const stmt = income[date] || {};
      const revenue = stmt['Total Revenue'] || stmt['totalRevenue'] || 0;
      const netIncome = stmt['Net Income'] || stmt['netIncome'] || 0;
      const netMargin = revenue ? (netIncome / revenue) * 100 : 0;
      
      const dateObj = new Date(date);
      const period = timeframe === 'semiannual' 
        ? `${dateObj.getFullYear()}-H${dateObj.getMonth() < 6 ? '1' : '2'}`
        : dateObj.getFullYear().toString();

      return {
        period,
        revenue: revenue / 1e6, // Convert to millions
        netIncome: netIncome / 1e6,
        netMargin: netMargin,
      };
    }).reverse();
  }, [fundamentals.income_statement, timeframe]);

  // Revenue to profit conversion
  const conversionData = useMemo(() => {
    const income = fundamentals.income_statement || {};
    const latestDate = Object.keys(income)
      .filter(k => k.length >= 10)
      .sort()
      .reverse()[0];
    
    if (!latestDate) return null;
    
    const stmt = income[latestDate] || {};
    const revenue = stmt['Total Revenue'] || stmt['totalRevenue'] || 0;
    const cogs = stmt['Cost Of Revenue'] || stmt['costOfRevenue'] || 0;
    const grossProfit = revenue - cogs;
    const opExpenses = stmt['Operating Expenses'] || stmt['operatingExpenses'] || 0;
    const opIncome = stmt['Operating Income'] || stmt['operatingIncome'] || 0;
    const nonOpIncome = stmt['Other Income Expenses'] || stmt['otherIncomeExpenses'] || 0;
    const taxes = stmt['Tax Provision'] || stmt['taxProvision'] || 0;
    const netIncome = stmt['Net Income'] || stmt['netIncome'] || 0;

    return [
      { name: 'Revenue', value: revenue / 1e6, type: 'revenue' },
      { name: 'COGS', value: -cogs / 1e6, type: 'expense' },
      { name: 'Gross profit', value: grossProfit / 1e6, type: 'profit' },
      { name: 'Op expenses', value: -opExpenses / 1e6, type: 'expense' },
      { name: 'Op income', value: opIncome / 1e6, type: 'profit' },
      { name: 'Non-Op income/expenses', value: nonOpIncome / 1e6, type: 'other' },
      { name: 'Taxes & Other', value: -taxes / 1e6, type: 'expense' },
      { name: 'Net income', value: netIncome / 1e6, type: 'profit' },
    ];
  }, [fundamentals.income_statement]);

  // Debt and cash data
  const debtData = useMemo(() => {
    const balance = fundamentals.balance_sheet || {};
    const dates = Object.keys(balance)
      .filter(k => k.length >= 10)
      .sort()
      .reverse()
      .slice(0, 4);

    return dates.map(date => {
      const bs = balance[date] || {};
      const debt = bs['Total Debt'] || bs['totalDebt'] || 0;
      const cash = bs['Cash And Cash Equivalents'] || bs['cashAndCashEquivalents'] || 0;
      
      const dateObj = new Date(date);
      const period = timeframe === 'semiannual'
        ? `${dateObj.getFullYear()}-H${dateObj.getMonth() < 6 ? '1' : '2'}`
        : dateObj.getFullYear().toString();

      return {
        period,
        debt: debt / 1e6,
        cash: cash / 1e6,
      };
    }).reverse();
  }, [fundamentals.balance_sheet, timeframe]);

  // Earnings data
  const earningsData = useMemo(() => {
    const income = fundamentals.income_statement || {};
    const dates = Object.keys(income)
      .filter(k => k.length >= 10)
      .sort()
      .reverse()
      .slice(0, 6);

    return dates.map(date => {
      const stmt = income[date] || {};
      const netIncome = stmt['Net Income'] || stmt['netIncome'] || 0;
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();

      return {
        year: year.toString(),
        actual: netIncome / 1e6,
        estimate: 0, // We don't have estimates, set to 0
      };
    }).reverse();
  }, [fundamentals.income_statement]);

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000) return `${symbol}${(value / 1000).toFixed(1)}B`;
    return `${symbol}${value.toFixed(1)}M`;
  };

  return (
    <div className="space-y-6">
      {/* Performance Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-bloomberg-text">Performance</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeframe('semiannual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'semiannual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Semiannual
            </button>
            <button
              onClick={() => setTimeframe('annual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'annual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Annual
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="period" stroke="#9CA3AF" />
            <YAxis yAxisId="left" stroke="#9CA3AF" />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '4px' }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="revenue" fill="#3B82F6" name="Revenue" />
            <Bar yAxisId="left" dataKey="netIncome" fill="#14B8A6" name="Net income" />
            <Line yAxisId="right" type="monotone" dataKey="netMargin" stroke="#60A5FA" strokeWidth={2} name="Net margin %" dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue to Profit Conversion */}
      {conversionData && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-bloomberg-text">Revenue to profit conversion</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeframe('semiannual')}
                className={`px-3 py-1 text-sm rounded ${timeframe === 'semiannual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
              >
                Semiannual
              </button>
              <button
                onClick={() => setTimeframe('annual')}
                className={`px-3 py-1 text-sm rounded ${timeframe === 'annual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
              >
                Annual
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '4px' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="value" fill="#14B8A6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Debt Level and Coverage */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-bloomberg-text">Debt level and coverage</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeframe('semiannual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'semiannual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Semiannual
            </button>
            <button
              onClick={() => setTimeframe('annual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'annual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Annual
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={debtData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="period" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '4px' }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend />
            <Bar dataKey="debt" fill="#EC4899" name="Debt" />
            <Bar dataKey="cash" fill="#3B82F6" name="Cash & equivalents" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Earnings Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-bloomberg-text">Earnings</h3>
            <p className="text-sm text-bloomberg-text-muted">Next: N/A</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeframe('semiannual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'semiannual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Semiannual
            </button>
            <button
              onClick={() => setTimeframe('annual')}
              className={`px-3 py-1 text-sm rounded ${timeframe === 'annual' ? 'bg-bloomberg-accent text-white' : 'bg-bloomberg-panel text-bloomberg-text'}`}
            >
              Annual
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={earningsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="year" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '4px' }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend />
            <Line type="monotone" dataKey="actual" stroke="#14B8A6" strokeWidth={2} name="Actual" dot={{ r: 5, fill: '#14B8A6' }} />
            <Line type="monotone" dataKey="estimate" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 5" name="Estimate" dot={{ r: 5, fill: '#9CA3AF' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

