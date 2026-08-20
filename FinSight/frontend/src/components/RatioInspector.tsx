import { useState, useEffect, useMemo } from 'react';
import { X, Search, Edit2 } from 'lucide-react';
import { api, ScreenerRow, FundamentalsResponse, RatioMetadata } from '../lib/api';

interface RatioInspectorProps {
  ticker: string;
  screenerRow: ScreenerRow | null;
  fundamentals: FundamentalsResponse | null;
  currency?: string;
  market?: string;
}

const RATIO_STORAGE_KEY = 'finsight:ratios';

// Default ratios to show in the grid
const DEFAULT_RATIOS = [
  'market_cap',
  'current_price',
  'high_52w',
  'low_52w',
  'pe_trailing',
  'industry_pe',
  'pb_ratio',
  'ev_to_ebitda',
  'peg_ratio',
  'dividend_yield',
  'roe',
  'roce',
  'gross_margin',
  'operating_margin',
  'profit_margin',
  'debt_to_equity',
  'current_ratio',
  'revenue_growth',
  'fcf_yield',
  'beta',
  'analyst_upside',
];

export default function RatioInspector({ ticker, screenerRow, fundamentals, currency, market }: RatioInspectorProps) {
  const [allRatios, setAllRatios] = useState<RatioMetadata[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showEditMode, setShowEditMode] = useState(false);
  const [loadingRatios, setLoadingRatios] = useState(true);

  // Load ratios metadata
  useEffect(() => {
    const loadRatios = async () => {
      try {
        const response = await api.getRatios();
        setAllRatios(response.ratios);
      } catch (error) {
        console.error('Failed to load ratios:', error);
      } finally {
        setLoadingRatios(false);
      }
    };
    loadRatios();
  }, []);

  // Load selected ratios from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${RATIO_STORAGE_KEY}:${ticker}`);
      if (stored) {
        const saved = JSON.parse(stored) as string[];
        setSelectedRatios(saved);
      } else {
        // Default to DEFAULT_RATIOS if nothing saved
        setSelectedRatios(DEFAULT_RATIOS);
      }
    } catch (e) {
      console.error('Failed to load saved ratios:', e);
      setSelectedRatios(DEFAULT_RATIOS);
    }
  }, [ticker]);

  // Save selected ratios to localStorage
  const saveRatios = (ratios: string[]) => {
    try {
      localStorage.setItem(`${RATIO_STORAGE_KEY}:${ticker}`, JSON.stringify(ratios));
    } catch (e) {
      console.error('Failed to save ratios:', e);
    }
  };

  // Filter ratios based on search query
  const filteredRatios = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return allRatios.filter(ratio =>
      ratio.label.toLowerCase().includes(query) ||
      ratio.key.toLowerCase().includes(query) ||
      ratio.category.toLowerCase().includes(query)
    ).slice(0, 10); // Limit to 10 suggestions
  }, [allRatios, searchQuery]);

  // Central formula-based ratio computation
  const computeRatioValue = (ratio: RatioMetadata): { value: number | null; formatted: string } => {
    try {
      if (!screenerRow && !fundamentals) {
        return { value: null, formatted: '—' };
      }

      let rawValue: number | null = null;

    // Formula-based computation for key ratios
    switch (ratio.key) {
      case 'eps':
        // EPS = Net Income / Shares Outstanding
        if (fundamentals) {
          const incomeStmt = fundamentals.income_statement;
          const shares = fundamentals.info?.sharesOutstanding || screenerRow?.shares_outstanding_est;
          if (incomeStmt && shares && shares > 0) {
            const dates = Object.keys(incomeStmt).filter(k => k.length >= 10).sort().reverse();
            if (dates.length > 0) {
              const latest = incomeStmt[dates[0]];
              const netIncome = latest?.['Net Income'] ?? latest?.['netIncome'] ?? latest?.['Net Income Common Stockholders'];
              if (netIncome) {
                rawValue = netIncome / shares;
              }
            }
          }
        }
        break;

      case 'ev_ebitda':
        // EV/EBITDA = (Market Cap + Total Debt - Cash) / EBITDA
        if (fundamentals && screenerRow) {
          const marketCap = screenerRow.market_cap;
          const balanceSheet = fundamentals.balance_sheet;
          const ebitda = fundamentals.info?.ebitda;
          if (balanceSheet && ebitda && ebitda !== 0) {
            const dates = Object.keys(balanceSheet).filter(k => k.length >= 10).sort().reverse();
            if (dates.length > 0) {
              const latest = balanceSheet[dates[0]];
              const totalDebt = latest?.['Total Debt'] ?? latest?.['totalDebt'] ?? 0;
              const cash = latest?.['Cash And Cash Equivalents'] ?? latest?.['cashAndCashEquivalents'] ?? 0;
              if (marketCap) {
                const ev = marketCap + totalDebt - cash;
                rawValue = ev / ebitda;
              }
            }
          }
        }
        break;

      case 'roce':
        // ROCE = EBIT / (Total Assets - Current Liabilities)
        if (fundamentals) {
          const balanceSheet = fundamentals.balance_sheet;
          const incomeStmt = fundamentals.income_statement;
          if (balanceSheet && incomeStmt) {
            const balanceDates = Object.keys(balanceSheet).filter(k => k.length >= 10).sort().reverse();
            const incomeDates = Object.keys(incomeStmt).filter(k => k.length >= 10).sort().reverse();
            if (balanceDates.length > 0 && incomeDates.length > 0) {
              const latestBalance = balanceSheet[balanceDates[0]];
              const latestIncome = incomeStmt[incomeDates[0]];
              const ebit = latestIncome?.['Operating Income'] ?? latestIncome?.['operatingIncome'] ?? latestIncome?.['EBIT'];
              const totalAssets = latestBalance?.['Total Assets'] ?? latestBalance?.['totalAssets'];
              const currentLiab = latestBalance?.['Total Current Liabilities'] ?? latestBalance?.['totalCurrentLiabilities'];
              if (ebit && totalAssets && currentLiab) {
                const capitalEmployed = totalAssets - currentLiab;
                if (capitalEmployed > 0) {
                  rawValue = (ebit / capitalEmployed) * 100;
                }
              }
            }
          }
        }
        // Fallback to screener value
        if (rawValue === null && screenerRow && (screenerRow as any).roce !== null && (screenerRow as any).roce !== undefined) {
          rawValue = (screenerRow as any).roce;
        }
        break;

      case 'dividend_yield':
        // Dividend Yield = (Dividend per Share / Current Price) * 100
        if (screenerRow?.dividend_yield !== null && screenerRow?.dividend_yield !== undefined) {
          rawValue = screenerRow.dividend_yield;
        } else if (fundamentals && screenerRow?.current_price) {
          const dividend = fundamentals.info?.dividendRate || fundamentals.info?.trailingAnnualDividendRate;
          if (dividend && screenerRow.current_price > 0) {
            rawValue = (dividend / screenerRow.current_price) * 100;
          }
        }
        break;

      default:
        // Fall through to original logic
        break;
    }

    // If formula didn't compute, use original logic
    if (rawValue === null) {
      if (ratio.source === 'screener' && screenerRow) {
        // Get from screener row
        rawValue = (screenerRow as any)[ratio.field_path || ratio.key] ?? null;
      } else if (ratio.source === 'fundamentals' && fundamentals) {
        // Get from fundamentals
        // Special handling for specific ratios
        if (ratio.key === 'ev_ebitda' && fundamentals.info) {
          const ev = fundamentals.info.enterpriseValue;
          const ebitda = fundamentals.info.ebitda;
          if (ev && ebitda && ebitda !== 0) {
            rawValue = ev / ebitda;
          }
        } else if (ratio.key === 'sales' || ratio.key === 'net_profit' || ratio.key === 'operating_profit') {
          // Get from income_statement (latest date)
          const incomeStmt = fundamentals.income_statement;
          if (incomeStmt && typeof incomeStmt === 'object') {
            const dates = Object.keys(incomeStmt).filter(k => k.length >= 10).sort().reverse();
            if (dates.length > 0) {
              const latest = incomeStmt[dates[0]];
              if (latest && typeof latest === 'object') {
                if (ratio.key === 'sales') {
                  rawValue = latest['Total Revenue'] ?? latest['totalRevenue'] ?? latest['Revenue'] ?? null;
                } else if (ratio.key === 'net_profit') {
                  rawValue = latest['Net Income'] ?? latest['netIncome'] ?? latest['Net Income Common Stockholders'] ?? null;
                } else if (ratio.key === 'operating_profit') {
                  rawValue = latest['Operating Income'] ?? latest['operatingIncome'] ?? latest['EBIT'] ?? null;
                }
              }
            }
          }
        } else if (ratio.key === 'face_value') {
          rawValue = fundamentals.info?.faceValue ?? null;
        } else if (ratio.key === 'promoter_holding') {
          // For Indian stocks, this might be in heldPercentInsiders
          const holding = fundamentals.info?.heldPercentInsiders ?? null;
          if (holding !== null && holding !== undefined) {
            rawValue = typeof holding === 'number' ? holding * 100 : parseFloat(String(holding)) * 100;
          }
        } else if (ratio.key === 'industry_pe') {
          rawValue = fundamentals.info?.industryPE ?? null;
        } else {
          const path = ratio.field_path || ratio.key;
          if (path.includes('.')) {
            const [section, field] = path.split('.');
            const sectionData = (fundamentals as any)[section];
            if (sectionData && typeof sectionData === 'object') {
              // For income_statement, balance_sheet, etc., get latest date
              if (typeof sectionData === 'object' && !Array.isArray(sectionData)) {
                // Check if it's a date-keyed object
                const dates = Object.keys(sectionData).filter(k => k.length >= 10).sort().reverse();
                if (dates.length > 0) {
                  const latest = sectionData[dates[0]];
                  if (latest && typeof latest === 'object') {
                    // Try multiple field name variations
                    rawValue = latest[field] ?? 
                              latest[field.replace(/\s+/g, '')] ??
                              latest[field.charAt(0).toLowerCase() + field.slice(1)] ??
                              null;
                  }
                } else {
                  // Direct field access
                  rawValue = sectionData[field] ?? null;
                }
              } else {
                rawValue = sectionData[field] ?? null;
              }
            }
          } else {
            // Direct access from info or derived
            rawValue = (fundamentals.info as any)?.[path] ?? (fundamentals.derived as any)?.[path] ?? null;
          }
        }
      }
    }

      // Format the value
      let formatted = '—';
      if (rawValue !== null && rawValue !== undefined && !isNaN(rawValue)) {
      if (ratio.format === 'percent') {
        formatted = `${rawValue >= 0 ? '+' : ''}${rawValue.toFixed(2)}%`;
      } else if (ratio.format === 'currency') {
        const symbol = getCurrencySymbol();
        if (Math.abs(rawValue) >= 1e12) formatted = `${symbol}${(rawValue / 1e12).toFixed(2)}T`;
        else if (Math.abs(rawValue) >= 1e9) formatted = `${symbol}${(rawValue / 1e9).toFixed(2)}B`;
        else if (Math.abs(rawValue) >= 1e6) formatted = `${symbol}${(rawValue / 1e6).toFixed(2)}M`;
        else if (Math.abs(rawValue) >= 1e3) formatted = `${symbol}${(rawValue / 1e3).toFixed(2)}K`;
        else formatted = `${symbol}${rawValue.toFixed(2)}`;
      } else {
        formatted = rawValue.toFixed(2);
      }
    }

      return { value: rawValue, formatted };
    } catch (error) {
      console.error(`Error computing ratio ${ratio.key}:`, error);
      return { value: null, formatted: '—' };
    }
  };

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

  // Get ratios to display (default + custom)
  const displayRatios = useMemo(() => {
    const ratioMap = new Map(allRatios.map(r => [r.key, r]));
    return selectedRatios
      .map(key => ratioMap.get(key))
      .filter((r): r is RatioMetadata => r !== undefined);
  }, [allRatios, selectedRatios]);

  // Add ratio to selection
  const addRatio = (ratioKey: string) => {
    if (!selectedRatios.includes(ratioKey)) {
      const newSelected = [...selectedRatios, ratioKey];
      setSelectedRatios(newSelected);
      saveRatios(newSelected);
    }
    setSearchQuery('');
    setShowAutocomplete(false);
  };

  // Remove ratio from selection
  const removeRatio = (ratioKey: string) => {
    const newSelected = selectedRatios.filter(k => k !== ratioKey);
    setSelectedRatios(newSelected);
    saveRatios(newSelected);
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setSelectedRatios(DEFAULT_RATIOS);
    saveRatios(DEFAULT_RATIOS);
    setShowEditMode(false);
  };

  if (loadingRatios) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-32">
          <div className="text-bloomberg-text-muted">Loading ratios...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-bloomberg-text">Key Ratios</h2>
          <button
            onClick={() => setShowEditMode(!showEditMode)}
            className="px-3 py-1.5 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all flex items-center gap-2"
          >
            <Edit2 size={14} />
            {showEditMode ? 'Done' : 'Edit Ratios'}
          </button>
        </div>

        {/* Default ratios grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {displayRatios.map(ratio => {
            const { formatted } = computeRatioValue(ratio);
            return (
              <div
                key={ratio.key}
                className="bg-bloomberg-dark border border-bloomberg-border rounded-lg p-3 hover:bg-bloomberg-panel transition-colors relative"
              >
                {showEditMode && (
                  <button
                    onClick={() => removeRatio(ratio.key)}
                    className="absolute top-1 right-1 p-1 text-red-400 hover:text-red-300 hover:bg-bloomberg-border rounded transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
                <div className="text-xs text-bloomberg-text-muted mb-1 uppercase tracking-wide truncate">
                  {ratio.label}
                </div>
                <div className="text-lg font-bold text-bloomberg-text truncate">
                  {formatted}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add ratio input */}
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Search size={16} className="text-bloomberg-text-muted" />
            <label className="text-sm font-semibold text-bloomberg-text-muted">Add ratio to table</label>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowAutocomplete(e.target.value.length > 0);
              }}
              onFocus={() => setShowAutocomplete(searchQuery.length > 0)}
              onBlur={() => {
                // Delay to allow click on autocomplete item
                setTimeout(() => setShowAutocomplete(false), 200);
              }}
              placeholder="Type to search ratios..."
              className="w-full px-3 md:px-4 py-2 bg-bloomberg-dark border border-bloomberg-border rounded-lg text-sm md:text-base text-bloomberg-text placeholder-bloomberg-text-muted focus:outline-none focus:border-bloomberg-accent"
            />
            
            {/* Autocomplete dropdown */}
            {showAutocomplete && filteredRatios.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-bloomberg-panel border border-bloomberg-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {filteredRatios.map(ratio => (
                  <button
                    key={ratio.key}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      addRatio(ratio.key);
                    }}
                    disabled={selectedRatios.includes(ratio.key)}
                    className="w-full text-left px-4 py-2 hover:bg-bloomberg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-bloomberg-text font-medium">{ratio.label}</div>
                        <div className="text-xs text-bloomberg-text-muted">{ratio.category}</div>
                      </div>
                      {selectedRatios.includes(ratio.key) && (
                        <span className="text-xs text-bloomberg-accent">Added</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Custom ratios table (if any beyond defaults) */}
        {selectedRatios.length > DEFAULT_RATIOS.length && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-bloomberg-text-muted uppercase tracking-wide">Custom Ratios</h3>
              {showEditMode && (
                <button
                  onClick={resetToDefaults}
                  className="text-xs text-bloomberg-accent hover:text-bloomberg-accent-hover"
                >
                  Reset to Defaults
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bloomberg-dark border-b border-bloomberg-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-bloomberg-text-muted font-semibold">Ratio</th>
                    <th className="px-4 py-2 text-left text-bloomberg-text-muted font-semibold">Category</th>
                    <th className="px-4 py-2 text-right text-bloomberg-text-muted font-semibold">Value</th>
                    {showEditMode && (
                      <th className="px-4 py-2 text-center text-bloomberg-text-muted font-semibold">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayRatios
                    .filter(r => !DEFAULT_RATIOS.includes(r.key))
                    .map(ratio => {
                      const { formatted } = computeRatioValue(ratio);
                      return (
                        <tr key={ratio.key} className="border-b border-bloomberg-border hover:bg-bloomberg-panel">
                          <td className="px-4 py-2 text-bloomberg-text">{ratio.label}</td>
                          <td className="px-4 py-2 text-bloomberg-text-muted text-xs">{ratio.category}</td>
                          <td className="px-4 py-2 text-right text-bloomberg-text font-semibold">{formatted}</td>
                          {showEditMode && (
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => removeRatio(ratio.key)}
                                className="p-1 text-red-400 hover:text-red-300 hover:bg-bloomberg-border rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

