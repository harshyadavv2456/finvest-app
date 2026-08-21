/**
 * Command Palette (Ctrl+K / Cmd+K) - Workstream B1.
 *
 * Global keyboard-triggered overlay: jump to any page (reuses
 * AppSidebar's own NAV_ITEMS, so there's one source of truth for the
 * page list, not two) or any ticker (fetches the ticker list once via
 * the existing /api/tickers endpoint, cached in-memory for the
 * session - 2,298 tickers is small enough for plain client-side
 * substring filtering, no new backend endpoint needed).
 *
 * No new dependency added (no cmdk/similar) - built directly against
 * this app's existing Tailwind tokens (bloomberg-* classes, used
 * throughout StrataX/Screener/etc.) to match the rest of the app
 * rather than introducing a different visual language.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, TrendingUp } from 'lucide-react';
import { NAV_ITEMS } from './AppSidebar';
import { api, TickerBasic } from '../../lib/api';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tickers, setTickers] = useState<TickerBasic[]>([]);
  const [tickersLoaded, setTickersLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Global Ctrl+K / Cmd+K listener - Escape closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch the ticker list once, lazily, the first time the palette opens -
  // not on every app load, so pages that never touch the palette pay
  // nothing for it.
  useEffect(() => {
    if (open && !tickersLoaded) {
      api.getTickers()
        .then((list) => {
          setTickers(list);
          setTickersLoaded(true);
        })
        .catch(() => setTickersLoaded(true)); // fail open - page jumps still work without ticker search
    }
  }, [open, tickersLoaded]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Focus after the overlay mounts.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const pageResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_ITEMS.filter((item) => !item.disabled).slice(0, 6);
    return NAV_ITEMS.filter((item) => !item.disabled && item.label.toLowerCase().includes(q));
  }, [query]);

  const tickerResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || q.length < 1) return [];
    return tickers
      .filter((t) => t.ticker.toUpperCase().includes(q))
      .sort((a, b) => {
        // Exact/prefix matches first, then by market cap as a relevance proxy.
        const aStarts = a.ticker.toUpperCase().startsWith(q) ? 0 : 1;
        const bStarts = b.ticker.toUpperCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return (b.market_cap || 0) - (a.market_cap || 0);
      })
      .slice(0, 8);
  }, [query, tickers]);

  const results = useMemo(
    () => [
      ...pageResults.map((p) => ({ type: 'page' as const, item: p })),
      ...tickerResults.map((t) => ({ type: 'ticker' as const, item: t })),
    ],
    [pageResults, tickerResults]
  );

  const goTo = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
    },
    [navigate]
  );

  const selectResult = useCallback(
    (index: number) => {
      const result = results[index];
      if (!result) return;
      if (result.type === 'page') {
        goTo(result.item.path);
      } else {
        goTo(`/stock/${result.item.ticker}`);
      }
    },
    [results, goTo]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult(selectedIndex);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 bg-bloomberg-panel border border-bloomberg-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bloomberg-border">
          <Search size={18} className="text-bloomberg-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a page or ticker..."
            className="flex-1 bg-transparent outline-none text-sm text-bloomberg-text placeholder:text-bloomberg-text-muted"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-semibold text-bloomberg-text-muted bg-bloomberg-dark border border-bloomberg-border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-bloomberg-text-muted">
              {query ? `No matches for "${query}"` : 'Start typing to search...'}
            </div>
          )}

          {pageResults.length > 0 && (
            <div className="px-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-bloomberg-text-muted">
                Pages
              </div>
              {pageResults.map((item, i) => {
                const Icon = item.icon;
                const idx = i;
                return (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.path)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left transition-colors ${
                      selectedIndex === idx ? 'bg-blue-500/20 text-blue-400' : 'text-bloomberg-text hover:bg-bloomberg-dark/50'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] text-bloomberg-text-muted bg-bloomberg-dark px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight size={14} className="text-bloomberg-text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {tickerResults.length > 0 && (
            <div className="px-2 mt-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-bloomberg-text-muted">
                Tickers
              </div>
              {tickerResults.map((t, i) => {
                const idx = pageResults.length + i;
                return (
                  <button
                    key={`${t.market}-${t.ticker}`}
                    onClick={() => goTo(`/stock/${t.ticker}`)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left transition-colors ${
                      selectedIndex === idx ? 'bg-blue-500/20 text-blue-400' : 'text-bloomberg-text hover:bg-bloomberg-dark/50'
                    }`}
                  >
                    <TrendingUp size={16} className="shrink-0 text-bloomberg-text-muted" />
                    <span className="font-semibold">{t.ticker}</span>
                    <span className="text-xs text-bloomberg-text-muted">{t.market}</span>
                    <span className="flex-1" />
                    <ArrowRight size={14} className="text-bloomberg-text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
