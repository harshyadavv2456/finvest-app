/**
 * Mnemos 2.0 Friction Signals Page
 * Shows real-time friction alerts from the Mnemos engine.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Clock, TrendingDown } from 'lucide-react';
import { API_BASE_URL } from '../config/env';

interface FrictionSignal {
  id: number;
  symbol: string;
  signal_type: string;
  severity: string;
  score: number;
  explanation: string;
  groq_analysis: string | null;
  created_at: string;
}

export default function FrictionPage() {
  const [signals, setSignals] = useState<FrictionSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [status, setStatus] = useState('');

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/mnemos/signals?hours=${hours}&limit=100`);
      const data = await resp.json();
      setSignals(data.signals || []);
      setStatus(data.status);
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSignals(); }, [hours]);

  const severityColor = (s: string) => {
    if (s === 'critical') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (s === 'high') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (s === 'medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={24} />
            Friction Signals
          </h1>
          <p className="text-sm text-gray-400 mt-1">Mnemos 2.0 - Real-time market friction detection</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button onClick={fetchSignals} className="p-2 hover:bg-gray-800 rounded-lg" title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {status === 'mnemos_db_not_found' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 text-yellow-400 text-sm">
          Mnemos 2.0 database not found. Make sure Mnemos is running and has generated data.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-amber-400" size={32} />
        </div>
      ) : signals.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <TrendingDown size={48} className="mx-auto mb-4 opacity-50" />
          <p>No friction signals in the selected time window</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <div key={s.id} className={`border rounded-xl p-4 ${severityColor(s.severity)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">{s.symbol.replace('.NS', '')}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700/50">{s.signal_type}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700/50 uppercase">{s.severity}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-400">
                  <Clock size={14} />
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 mb-2">
                <span className="text-sm">Score: <strong>{s.score.toFixed(2)}</strong></span>
              </div>
              <p className="text-sm text-gray-300">{s.explanation}</p>
              {s.groq_analysis && (
                <p className="text-sm text-gray-400 mt-2 italic">AI: {s.groq_analysis}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
