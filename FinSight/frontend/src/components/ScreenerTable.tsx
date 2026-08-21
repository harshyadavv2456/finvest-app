import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenerRow, api } from '../lib/api';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Download, Star, Save, FolderOpen, X } from 'lucide-react';
import AdvancedFilters from './AdvancedFilters';
import SearchBar from './SearchBar';

type SortField = keyof ScreenerRow;
type SortDirection = 'asc' | 'desc';

interface SavedScreen {
  id: string;
  name: string;
  filters: {
    market: string;
    sector?: string;
    industry?: string;
    min_market_cap: string;
    max_market_cap: string;
    min_pe: string;
    max_pe: string;
    min_roe: string;
    min_ret_3m: string;
    min_ret_1y: string;
  };
  sortField: string;
  sortDir: 'asc' | 'desc';
}

const WATCHLIST_KEY = 'finsight_watchlist';
const SAVED_SCREENS_KEY = 'finsight_saved_screens';

export default function ScreenerTable() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('market_cap');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  
  // Pagination state
  const [page, setPage] = useState(0); // 0-indexed
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState({
    market: '',
    sector: '',
    industry: '',
    min_market_cap: '',
    max_market_cap: '',
    min_pe: '',
    max_pe: '',
    min_roe: '',
    min_ret_3m: '',
    min_ret_1y: '',
  });
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Watchlist
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  
  // Saved screens
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveScreenName, setSaveScreenName] = useState('');
  
  // Request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Load watchlist from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const tickers = JSON.parse(stored) as string[];
        setWatchlist(new Set(tickers));
      }
    } catch (e) {
      console.error('Failed to load watchlist:', e);
    }
  }, []);
  
  // Load saved screens from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_SCREENS_KEY);
      if (stored) {
        const screens = JSON.parse(stored) as SavedScreen[];
        setSavedScreens(screens);
      }
    } catch (e) {
      console.error('Failed to load saved screens:', e);
    }
  }, []);
  
  // Toggle watchlist
  const toggleWatchlist = useCallback((ticker: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    setWatchlist(prev => {
      const newSet = new Set(prev);
      const wasInWatchlist = newSet.has(ticker);
      
      if (wasInWatchlist) {
        newSet.delete(ticker);
        console.log(`Removed ${ticker} from watchlist`);
      } else {
        newSet.add(ticker);
        console.log(`Added ${ticker} to watchlist`);
      }
      
      // Save to localStorage
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(newSet)));
      } catch (e) {
        console.error('Failed to save watchlist:', e);
      }
      
      return newSet;
    });
  }, []);
  
  // Save screen
  const saveScreen = () => {
    if (!saveScreenName.trim()) return;
    
    const screen: SavedScreen = {
      id: Date.now().toString(),
      name: saveScreenName.trim(),
      filters: { ...filters },
      sortField: sortField as string,
      sortDir,
    };
    
    const newScreens = [...savedScreens, screen];
    setSavedScreens(newScreens);
    try {
      localStorage.setItem(SAVED_SCREENS_KEY, JSON.stringify(newScreens));
    } catch (e) {
      console.error('Failed to save screen:', e);
    }
    
    setSaveScreenName('');
    setShowSaveDialog(false);
  };
  
  // Load screen
  const loadScreen = (screen: SavedScreen) => {
    setFilters({
      market: screen.filters.market || '',
      sector: screen.filters.sector || '',
      industry: screen.filters.industry || '',
      min_market_cap: screen.filters.min_market_cap || '',
      max_market_cap: screen.filters.max_market_cap || '',
      min_pe: screen.filters.min_pe || '',
      max_pe: screen.filters.max_pe || '',
      min_roe: screen.filters.min_roe || '',
      min_ret_3m: screen.filters.min_ret_3m || '',
      min_ret_1y: screen.filters.min_ret_1y || '',
    });
    setSortField(screen.sortField as SortField);
    setSortDir(screen.sortDir);
    setPage(0); // Reset to first page
  };
  
  // Delete saved screen
  const deleteScreen = (id: string) => {
    const newScreens = savedScreens.filter(s => s.id !== id);
    setSavedScreens(newScreens);
    try {
      localStorage.setItem(SAVED_SCREENS_KEY, JSON.stringify(newScreens));
    } catch (e) {
      console.error('Failed to delete screen:', e);
    }
  };
  
  // Export to CSV
  const exportToCSV = () => {
    try {
      if (rows.length === 0) {
        alert('No data to export. Please load data first.');
        return;
      }

      const serializeValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') {
          return String(value);
        }
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = [
        'Ticker', 'Company Name', 'Market', 'Sector', 'Industry', 'Price', 'Market Cap',
        'PE', 'PE Fwd', 'PB', 'EV/EBITDA', 'PEG', 'Industry PE', 'Earnings Yield',
        'Div Yield', 'ROE', 'ROA', 'ROCE', 'Gross Margin', 'Op Margin', 'EBITDA Margin',
        'Net Margin', 'D/E', 'Current Ratio', 'FCF Yield', 'Rev Growth', 'Earn Growth',
        'EPS Growth YOY', 'Beta', 'Analyst Upside', '3M Return', '1Y Return', 'RSI',
      ];
      
      const csvRows = [
        headers.join(','),
        ...rows.map(row => [
          serializeValue(row.ticker),
          serializeValue(row.company_name),
          serializeValue(row.market),
          serializeValue(row.sector),
          serializeValue(row.industry),
          serializeValue(row.current_price),
          serializeValue(row.market_cap),
          serializeValue(row.pe_trailing),
          serializeValue(row.pe_forward),
          serializeValue(row.pb_ratio),
          serializeValue(row.ev_to_ebitda),
          serializeValue(row.peg_ratio),
          serializeValue(row.industry_pe),
          serializeValue(row.earnings_yield),
          serializeValue(row.dividend_yield),
          serializeValue(row.roe),
          serializeValue(row.roa),
          serializeValue(row.roce),
          serializeValue(row.gross_margin),
          serializeValue(row.operating_margin),
          serializeValue(row.ebitda_margin),
          serializeValue(row.profit_margin),
          serializeValue(row.debt_to_equity),
          serializeValue(row.current_ratio),
          serializeValue(row.fcf_yield),
          serializeValue(row.revenue_growth),
          serializeValue(row.earnings_growth),
          serializeValue(row.eps_growth_yoy),
          serializeValue(row.beta),
          serializeValue(row.analyst_upside),
          serializeValue(row.ret_3m),
          serializeValue(row.ret_1y),
          serializeValue(row.rsi14),
        ].join(','))
      ];
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finsight-screener-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`Exported ${rows.length} rows to CSV`);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };
  
  const [showRSIColumn, setShowRSIColumn] = useState(true);
  
  // Check RSI data availability - hide column if < 10% of rows have RSI
  useEffect(() => {
    if (rows.length > 0) {
      const rsiCount = rows.filter(row => row.rsi14 != null && !isNaN(row.rsi14)).length;
      const rsiPercentage = (rsiCount / rows.length) * 100;
      setShowRSIColumn(rsiPercentage >= 10); // Show if at least 10% have RSI
    }
  }, [rows]);
  
  const loadData = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    
    console.log('[FinSight] Loading screener data with params:', {
      sort_by: sortField,
      sort_dir: sortDir,
      limit: pageSize,
      offset: page * pageSize,
      market: filters.market,
    });
    
    try {
      const params: any = {
        sort_by: sortField,
        sort_dir: sortDir,
        limit: pageSize,
        offset: page * pageSize,
      };
      
      // Add market filter
      if (filters.market && filters.market.trim() && filters.market !== 'All Markets') {
        params.market = filters.market.trim();
      }
      
      
      // Add numeric filters
      if (filters.min_market_cap && filters.min_market_cap.trim()) {
        params.min_market_cap = parseFloat(filters.min_market_cap);
      }
      if (filters.max_market_cap && filters.max_market_cap.trim()) {
        params.max_market_cap = parseFloat(filters.max_market_cap);
      }
      if (filters.min_pe && filters.min_pe.trim()) {
        params.min_pe = parseFloat(filters.min_pe);
      }
      if (filters.max_pe && filters.max_pe.trim()) {
        params.max_pe = parseFloat(filters.max_pe);
      }
      if (filters.min_roe && filters.min_roe.trim()) {
        params.min_roe = parseFloat(filters.min_roe);
      }
      if (filters.min_ret_3m && filters.min_ret_3m.trim()) {
        params.min_ret_3m = parseFloat(filters.min_ret_3m);
      }
      if (filters.min_ret_1y && filters.min_ret_1y.trim()) {
        params.min_ret_1y = parseFloat(filters.min_ret_1y);
      }
      
      // Add advanced filters - apply ALL advanced filter params
      // These come from AdvancedFilters component as min_*/max_* params
      Object.keys(advancedFilters).forEach(key => {
        const value = advancedFilters[key];
        if (value !== undefined && value !== null && value !== '') {
          const numValue = typeof value === 'string' ? parseFloat(value) : value;
          if (!isNaN(numValue)) {
            params[key] = numValue;
          }
        }
      });
      
      // Add search query
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      
      // Use the api helper with signal support
      const response = await api.getScreener({
        ...params,
        signal,
      });
      
      if (signal.aborted) {
        console.log('[FinSight] Request was cancelled');
        return; // Request was cancelled, don't update state
      }
      
      const rowCount = response.rows?.length || 0;
      const totalCount = response.total_count || response.total || 0;
      
      console.log('[FinSight] Received response:', {
        rowCount,
        totalCount,
        hasRows: !!response.rows,
        rowsType: Array.isArray(response.rows) ? 'array' : typeof response.rows,
      });
      
      if (rowCount > 0) {
        console.log('[FinSight] First row sample:', JSON.stringify(response.rows[0], null, 2));
        console.log('[FinSight] Setting rows in state:', rowCount, 'rows');
      } else {
        console.warn('[FinSight] WARNING: Received 0 rows from API!');
      }
      
      // Ensure we have valid data
      if (!response.rows || !Array.isArray(response.rows)) {
        console.log('[FinSight] Invalid response structure, retrying...', response);
        // Retry after delay
        setTimeout(() => loadData(), 2000);
        return;
      }
      
      const data = response as { rows: ScreenerRow[]; total_count?: number; total?: number };
      
      // Apply watchlist filter if enabled
      let filteredRows = data.rows;
      if (showWatchlistOnly) {
        filteredRows = filteredRows.filter(row => watchlist.has(row.ticker));
        // Adjust total count for watchlist filter
        // Note: This is approximate since we only have the current page
      }
      
      console.log('[FinSight] Setting state:', {
        filteredRowCount: filteredRows.length,
        originalRowCount: data.rows.length,
        totalCount: data.total_count ?? data.total ?? 0,
      });
      
      setRows(filteredRows);
      // Use total_count if available, fallback to total, then 0
      setTotalCount(data.total_count ?? data.total ?? 0);
      
      console.log('[FinSight] State updated successfully');
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        // Request was cancelled, ignore
        return;
      }
      console.log('Retrying screener data load...', error);
      // Retry after delay
      setTimeout(() => {
        loadData();
      }, 2000);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [sortField, sortDir, filters, advancedFilters, searchQuery, page, pageSize, showWatchlistOnly, watchlist]);
  
  // Reset to first page when filters/sort/search change
  useEffect(() => {
    setPage(0);
  }, [sortField, sortDir, filters, advancedFilters, searchQuery, showWatchlistOnly]);
  
  // Check backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await api.getHealth();
        console.log('[FinSight] Backend health check:', JSON.stringify(health, null, 2));
        if (health.ticker_count === 0) {
          console.log('[FinSight] Backend reports 0 tickers, will retry...');
          // Retry health check
          setTimeout(() => checkHealth(), 5000);
        }
      } catch (error) {
        console.error('[FinSight] Failed to check backend health:', error);
      }
    };
    checkHealth();
  }, []);

  // Load data when dependencies change
  useEffect(() => {
    loadData();
    
    // Cleanup: abort on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);
  
  // Listen for filter changes from Sidebar
  useEffect(() => {
    const handleFilterChange = (e: CustomEvent) => {
      const detail = e.detail;
      setFilters((prev) => ({
        ...prev,
        market: detail.market !== undefined ? (detail.market || '') : prev.market,
        min_market_cap: detail.min_market_cap !== undefined ? String(detail.min_market_cap) : prev.min_market_cap,
        max_pe: detail.max_pe !== undefined ? String(detail.max_pe) : prev.max_pe,
        min_roe: detail.min_roe !== undefined ? String(detail.min_roe) : prev.min_roe,
        min_ret_3m: detail.min_ret_3m !== undefined ? String(detail.min_ret_3m) : prev.min_ret_3m,
        min_ret_1y: detail.min_ret_1y !== undefined ? String(detail.min_ret_1y) : prev.min_ret_1y,
      }));
    };
    
    window.addEventListener('filterChange', handleFilterChange as EventListener);
    return () => {
      window.removeEventListener('filterChange', handleFilterChange as EventListener);
    };
  }, []);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0); // Reset to first page
  };
  
  const getCurrencySymbol = (currency?: string, market?: string): string => {
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
  
  const formatNumber = (value: number | undefined, decimals = 2, currency?: string, market?: string): string => {
    if (value === undefined || value === null) return '—';
    const symbol = getCurrencySymbol(currency, market);
    if (Math.abs(value) >= 1e9) return `${symbol}${(value / 1e9).toFixed(decimals)}B`;
    if (Math.abs(value) >= 1e6) return `${symbol}${(value / 1e6).toFixed(decimals)}M`;
    if (Math.abs(value) >= 1e3) return `${symbol}${(value / 1e3).toFixed(decimals)}K`;
    return `${symbol}${value.toFixed(decimals)}`;
  };
  
  const formatPercent = (value: number | undefined): string => {
    if (value === undefined || value === null) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-bloomberg-text-muted" />;
    return sortDir === 'asc' ? (
      <ArrowUp size={14} className="text-bloomberg-accent" />
    ) : (
      <ArrowDown size={14} className="text-bloomberg-accent" />
    );
  };
  
  // Pagination helpers
  const totalPages = Math.ceil(totalCount / pageSize);
  const canGoPrevious = page > 0;
  const canGoNext = page < totalPages - 1;
  
  // Skeleton loader component
  const SkeletonRow = () => (
    <tr className="border-b border-bloomberg-border animate-pulse">
      <td className="px-4 py-3">
        <div className="h-4 bg-bloomberg-panel rounded w-32"></div>
        <div className="h-3 bg-bloomberg-panel rounded w-24 mt-2"></div>
      </td>
      {[...Array(10)].map((_, i) => (
        <td key={i} className="px-4 py-3 text-right">
          <div className="h-4 bg-bloomberg-panel rounded w-16 ml-auto"></div>
        </td>
      ))}
    </tr>
  );
  
  return (
    <div className="h-full flex flex-col bg-bloomberg-dark">
      <div className="p-4 md:p-6 border-b border-bloomberg-border bg-bloomberg-panel">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-bloomberg-text">Stock Screener</h1>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar onSearch={setSearchQuery} placeholder="Search company or ticker..." />
            <button
              onClick={exportToCSV}
              disabled={rows.length === 0}
              className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Save size={16} />
              <span className="hidden sm:inline">Save Screen</span>
            </button>
            {savedScreens.length > 0 && (
              <div className="relative group">
                <button className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all flex items-center gap-2">
                  <FolderOpen size={16} />
                  <span className="hidden sm:inline">Load Screen</span>
                </button>
                <div className="absolute right-0 top-full mt-2 bg-bloomberg-panel border border-bloomberg-border rounded-lg shadow-xl z-50 min-w-[200px] hidden group-hover:block">
                  {savedScreens.map(screen => (
                    <div key={screen.id} className="flex items-center justify-between p-2 hover:bg-bloomberg-dark group/item">
                      <button
                        onClick={() => loadScreen(screen)}
                        className="flex-1 text-left text-sm text-bloomberg-text hover:text-bloomberg-accent"
                      >
                        {screen.name}
                      </button>
                      <button
                        onClick={() => deleteScreen(screen.id)}
                        className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover/item:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                showWatchlistOnly
                  ? 'bg-gradient-to-r from-yellow-600 to-orange-600 text-white'
                  : 'bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border hover:bg-bloomberg-border'
              }`}
            >
              <Star size={16} className={showWatchlistOnly ? 'fill-current' : ''} />
              <span className="hidden sm:inline">Watchlist</span>
            </button>
          </div>
        </div>
        
        <AdvancedFilters onFiltersChange={setAdvancedFilters} />
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-bloomberg-text-muted mb-2 uppercase tracking-wide">Market</label>
            <select
              value={filters.market}
              onChange={(e) => setFilters({ ...filters, market: e.target.value })}
              className="input-field w-full text-sm"
            >
              <option value="">All Markets</option>
              <option value="IN">India</option>
              <option value="US">USA</option>
              <option value="UK">UK</option>
              <option value="JP">Japan</option>
              <option value="CN">China</option>
              <option value="SG">Singapore</option>
              <option value="HK">Hong Kong</option>
              <option value="AU">Australia</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-bloomberg-text-muted mb-2 uppercase tracking-wide">Min Market Cap</label>
            <input
              type="number"
              value={filters.min_market_cap}
              onChange={(e) => setFilters({ ...filters, min_market_cap: e.target.value })}
              placeholder="0"
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-bloomberg-text-muted mb-2 uppercase tracking-wide">Max PE</label>
            <input
              type="number"
              value={filters.max_pe}
              onChange={(e) => setFilters({ ...filters, max_pe: e.target.value })}
              placeholder="50"
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-bloomberg-text-muted mb-2 uppercase tracking-wide">Min ROE %</label>
            <input
              type="number"
              value={filters.min_roe}
              onChange={(e) => setFilters({ ...filters, min_roe: e.target.value })}
              placeholder="0"
              className="input-field w-full text-sm"
            />
          </div>
        </div>
      </div>
      
      {/* Loading state with skeleton */}
      {loading ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bloomberg-panel sticky top-0 z-20">
              <tr>
                <th className="px-4 py-3 text-left border-b border-bloomberg-border">
                  <div className="h-4 bg-bloomberg-dark rounded w-24"></div>
                </th>
                {[...Array(10)].map((_, i) => (
                  <th key={i} className="px-4 py-3 text-right border-b border-bloomberg-border">
                    <div className="h-4 bg-bloomberg-dark rounded w-16 ml-auto"></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(pageSize)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto">
            {/* Desktop table view */}
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead className="bg-bloomberg-panel sticky top-0 z-20">
                  <tr>
                    <th className="px-4 py-3 text-left cursor-pointer hover:bg-bloomberg-border border-b border-bloomberg-border">
                      <div className="flex items-center gap-2 font-semibold text-bloomberg-text-muted">
                        Company
                        <SortIcon field="ticker" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border border-b border-bloomberg-border" onClick={() => handleSort('current_price')}>
                      <div className="flex items-center justify-end gap-2 font-semibold text-bloomberg-text-muted">
                        Price
                        <SortIcon field="current_price" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('market_cap')}>
                      <div className="flex items-center justify-end gap-2">
                        Market Cap
                        <SortIcon field="market_cap" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('pe_trailing')}>
                      <div className="flex items-center justify-end gap-2">
                        PE
                        <SortIcon field="pe_trailing" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('pb_ratio')}>
                      <div className="flex items-center justify-end gap-2">
                        PB
                        <SortIcon field="pb_ratio" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('roe')}>
                      <div className="flex items-center justify-end gap-2">
                        ROE
                        <SortIcon field="roe" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('debt_to_equity')}>
                      <div className="flex items-center justify-end gap-2">
                        D/E
                        <SortIcon field="debt_to_equity" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('ret_3m')}>
                      <div className="flex items-center justify-end gap-2">
                        3M Return
                        <SortIcon field="ret_3m" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('ret_1y')}>
                      <div className="flex items-center justify-end gap-2">
                        1Y Return
                        <SortIcon field="ret_1y" />
                      </div>
                    </th>
                    {showRSIColumn && (
                      <th className="px-4 py-3 text-right cursor-pointer hover:bg-bloomberg-border" onClick={() => handleSort('rsi14')}>
                        <div className="flex items-center justify-end gap-2">
                          RSI
                          <SortIcon field="rsi14" />
                        </div>
                      </th>
                    )}
                    <th className="px-4 py-3 text-center border-b border-bloomberg-border">
                      <div className="text-bloomberg-text-muted text-xs">Watch</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={showRSIColumn ? 11 : 10} className="px-4 py-12 text-center">
                        <div className="text-bloomberg-text-muted text-lg">
                          {searchQuery.trim() ? 'No stocks found matching your search.' : 'No data available. Please check your filters or try again.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.ticker}
                        className="border-b border-bloomberg-border hover:bg-bloomberg-panel cursor-pointer transition-colors"
                        onClick={() => navigate(`/stock/${row.ticker}`)}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-semibold text-bloomberg-text text-base">{row.company_name || row.ticker}</div>
                            <div className="text-xs text-bloomberg-text-muted mt-0.5">{row.ticker} • {row.market}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {row.current_price ? `${getCurrencySymbol(row.currency, row.market)}${row.current_price.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {formatNumber(row.market_cap, 2, row.currency, row.market)}
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {row.pe_trailing ? row.pe_trailing.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {row.pb_ratio ? row.pb_ratio.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {row.roe ? `${row.roe.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-bloomberg-text">
                          {row.debt_to_equity ? row.debt_to_equity.toFixed(2) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            row.ret_3m && row.ret_3m >= 0
                              ? 'text-green-400'
                              : row.ret_3m
                              ? 'text-red-400'
                              : 'text-bloomberg-text'
                          }`}
                        >
                          {formatPercent(row.ret_3m)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            row.ret_1y && row.ret_1y >= 0
                              ? 'text-green-400'
                              : row.ret_1y
                              ? 'text-red-400'
                              : 'text-bloomberg-text'
                          }`}
                        >
                          {formatPercent(row.ret_1y)}
                        </td>
                        {showRSIColumn && (
                          <td className="px-4 py-3 text-right text-bloomberg-text">
                            {row.rsi14 ? row.rsi14.toFixed(1) : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={(e) => toggleWatchlist(row.ticker, e)}
                            className="p-1 hover:bg-bloomberg-border rounded transition-colors"
                            title={watchlist.has(row.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}
                          >
                            <Star size={16} className={watchlist.has(row.ticker) ? 'fill-yellow-400 text-yellow-400' : 'text-bloomberg-text-muted'} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Mobile/Tablet card view */}
            <div className="lg:hidden space-y-3 p-4">
              {rows.length === 0 ? (
                <div className="text-center py-12 text-bloomberg-text-muted">
                  {searchQuery.trim() ? 'No stocks found matching your search.' : 'No data available.'}
                </div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.ticker}
                    onClick={() => navigate(`/stock/${row.ticker}`)}
                    className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4 cursor-pointer hover:bg-bloomberg-dark transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-semibold text-bloomberg-text text-lg mb-1">{row.company_name || row.ticker}</div>
                        <div className="text-xs text-bloomberg-text-muted">{row.ticker} • {row.market}</div>
                      </div>
                      <button
                        onClick={(e) => toggleWatchlist(row.ticker, e)}
                        className="p-2 hover:bg-bloomberg-dark rounded transition-colors"
                        title={watchlist.has(row.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        <Star size={20} className={watchlist.has(row.ticker) ? 'fill-yellow-400 text-yellow-400' : 'text-bloomberg-text-muted'} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-bloomberg-text-muted mb-1">Price</div>
                        <div className="text-bloomberg-text font-semibold">
                          {row.current_price ? `${getCurrencySymbol(row.currency, row.market)}${row.current_price.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-bloomberg-text-muted mb-1">Market Cap</div>
                        <div className="text-bloomberg-text font-semibold">{formatNumber(row.market_cap, 2, row.currency, row.market)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-bloomberg-text-muted mb-1">PE</div>
                        <div className="text-bloomberg-text font-semibold">{row.pe_trailing ? row.pe_trailing.toFixed(2) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-bloomberg-text-muted mb-1">1Y Return</div>
                        <div className={`font-semibold ${row.ret_1y && row.ret_1y >= 0 ? 'text-green-400' : row.ret_1y ? 'text-red-400' : 'text-bloomberg-text'}`}>
                          {formatPercent(row.ret_1y)}
                        </div>
                      </div>
                    </div>
                    {(row.sector || row.industry) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.sector && (
                          <span className="px-2 py-1 bg-bloomberg-dark text-xs text-bloomberg-text-muted rounded">{row.sector}</span>
                        )}
                        {row.industry && (
                          <span className="px-2 py-1 bg-bloomberg-dark text-xs text-bloomberg-text-muted rounded">{row.industry}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Pagination controls */}
          {totalCount > 0 && (
            <div className="p-4 border-t border-bloomberg-border bg-bloomberg-panel flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-bloomberg-text-muted">
                Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(0)}
                  disabled={!canGoPrevious}
                  className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={!canGoPrevious}
                  className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="px-4 py-2 text-bloomberg-text text-sm">
                  Page {page + 1} of {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={!canGoNext}
                  className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={!canGoNext}
                  className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm font-semibold hover:bg-bloomberg-border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                  className="px-3 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg text-sm"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                  <option value={500}>500 per page</option>
                  <option value={1000}>1000 per page</option>
                  <option value={2000}>Show All (max 2000)</option>
                </select>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Save Screen Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Save Screen</h3>
            <input
              type="text"
              value={saveScreenName}
              onChange={(e) => setSaveScreenName(e.target.value)}
              placeholder="Enter screen name..."
              className="input-field w-full mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveScreen();
                } else if (e.key === 'Escape') {
                  setShowSaveDialog(false);
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={saveScreen}
                disabled={!saveScreenName.trim()}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveScreenName('');
                }}
                className="px-4 py-2 bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg font-semibold hover:bg-bloomberg-border transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
