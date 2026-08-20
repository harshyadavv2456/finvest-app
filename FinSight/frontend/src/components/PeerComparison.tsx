import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ScreenerRow } from '../lib/api';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface PeerComparisonProps {
  ticker: string;
}

export default function PeerComparison({ ticker }: PeerComparisonProps) {
  const navigate = useNavigate();
  const [peers, setPeers] = useState<ScreenerRow[]>([]);
  const [industry, setIndustry] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeoutWarning, setTimeoutWarning] = useState(false);

  useEffect(() => {
    const loadPeers = async () => {
      setLoading(true);
      setError(null);
      setTimeoutWarning(false);
      
      // Show timeout warning after 5 seconds
      const timeoutId = setTimeout(() => {
        setTimeoutWarning(true);
      }, 5000);
      
      try {
        const data = await api.getTickerPeers(ticker, 100);
        clearTimeout(timeoutId);
        setPeers(data.peers);
        setIndustry(data.industry);
        setSector(data.sector);
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('Failed to load peers:', err);
        setError(err?.response?.data?.detail || err?.message || 'Failed to load peer companies');
        setPeers([]);
      } finally {
        setLoading(false);
        setTimeoutWarning(false);
      }
    };

    loadPeers();
  }, [ticker]);

  const formatNumber = (value: number | undefined, decimals = 2): string => {
    if (value === undefined || value === null) return '—';
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(decimals)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number | undefined): string => {
    if (value === undefined || value === null) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bloomberg-accent mb-4"></div>
          <div className="text-bloomberg-text-muted">Loading peers...</div>
          {timeoutWarning && (
            <div className="mt-4 text-sm text-yellow-400">
              Taking longer than usual...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle size={32} className="text-red-400 mb-4" />
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              // Reload
              const loadPeers = async () => {
                try {
                  const data = await api.getTickerPeers(ticker, 100);
                  setPeers(data.peers);
                  setIndustry(data.industry);
                  setSector(data.sector);
                } catch (err: any) {
                  setError(err?.response?.data?.detail || err?.message || 'Failed to load peer companies');
                } finally {
                  setLoading(false);
                }
              };
              loadPeers();
            }}
            className="px-4 py-2 bg-bloomberg-accent text-white rounded-lg hover:bg-bloomberg-accent-hover transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (peers.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold text-bloomberg-text mb-4">Peer Comparison</h2>
        <div className="text-bloomberg-text-muted">
          {industry || sector ? (
            <p>No peers found in {industry || sector}.</p>
          ) : (
            <p>No industry/sector information available for this ticker.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-bloomberg-text mb-2">Peer Comparison</h2>
        <div className="text-sm text-bloomberg-text-muted">
          {industry && <span>Industry: {industry}</span>}
          {sector && <span className="ml-4">Sector: {sector}</span>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bloomberg-dark border-b border-bloomberg-border">
            <tr>
              <th className="px-4 py-3 text-left text-bloomberg-text-muted font-semibold">Name</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">Price</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">Market Cap</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">P/E</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">P/B</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">ROE</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">ROA</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">D/E</th>
              <th className="px-4 py-3 text-right text-bloomberg-text-muted font-semibold">1Y Return</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => (
              <tr
                key={peer.ticker}
                className="border-b border-bloomberg-border hover:bg-bloomberg-panel cursor-pointer transition-colors"
                onClick={() => navigate(`/stock/${peer.ticker}`)}
              >
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium text-bloomberg-text">{peer.ticker}</div>
                    <div className="text-xs text-bloomberg-text-muted">{peer.market}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.current_price ? `$${peer.current_price.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {formatNumber(peer.market_cap)}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.pe_trailing ? peer.pe_trailing.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.pb_ratio ? peer.pb_ratio.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.roe ? `${peer.roe.toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.roa ? `${peer.roa.toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-bloomberg-text">
                  {peer.debt_to_equity ? peer.debt_to_equity.toFixed(2) : '—'}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    peer.ret_1y && peer.ret_1y >= 0
                      ? 'text-green-400'
                      : peer.ret_1y
                      ? 'text-red-400'
                      : 'text-bloomberg-text'
                  }`}
                >
                  {formatPercent(peer.ret_1y)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
