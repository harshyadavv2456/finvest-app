/**
 * System Health Dashboard
 * Shows per-module freshness from the refresh orchestrator.
 */

import { useState, useEffect } from 'react';
import { Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { API_BASE_URL } from '../config/env';

interface ModuleHealth {
  status: string;
  freshness: string;
  age_hours: number | null;
  last_success: string | null;
  last_attempt: string | null;
  elapsed_seconds: number | null;
  consecutive_failures: number;
  error: string | null;
}

interface HealthData {
  status: string;
  last_orchestration_utc: string | null;
  modules: Record<string, ModuleHealth>;
  intelligence_files: Record<string, number>;
  data_tickers: number;
  timestamp: string;
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/system/health`);
      const data = await resp.json();
      setHealth(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  const freshnessIcon = (f: string) => {
    if (f === 'fresh') return <CheckCircle size={16} className="text-green-400" />;
    if (f === 'stale') return <AlertTriangle size={16} className="text-yellow-400" />;
    if (f === 'outdated') return <XCircle size={16} className="text-red-400" />;
    return <Clock size={16} className="text-gray-400" />;
  };

  const freshnessColor = (f: string) => {
    if (f === 'fresh') return 'bg-green-500/10 border-green-500/30 text-green-400';
    if (f === 'stale') return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
    if (f === 'outdated') return 'bg-red-500/10 border-red-500/30 text-red-400';
    return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-blue-400" size={24} />
            System Health
          </h1>
          <p className="text-sm text-gray-400 mt-1">Pipeline module freshness and data status</p>
        </div>
        <button onClick={fetchHealth} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {health && (
        <>
          {/* Overall Status */}
          <div className={`rounded-xl border p-6 mb-6 ${health.status === 'healthy' ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
            <div className="flex items-center gap-3">
              {health.status === 'healthy' ? <CheckCircle size={24} className="text-green-400" /> : <AlertTriangle size={24} className="text-yellow-400" />}
              <div>
                <h2 className="text-xl font-bold capitalize">{health.status}</h2>
                {health.last_orchestration_utc && (
                  <p className="text-sm text-gray-400">
                    Last orchestration: {new Date(health.last_orchestration_utc).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-6 mt-4 text-sm">
              <span>Intelligence: IN={health.intelligence_files?.IN || 0}, US={health.intelligence_files?.US || 0}</span>
              <span>Data Tickers: {health.data_tickers}</span>
            </div>
          </div>

          {/* Module Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(health.modules).map(([name, mod]) => (
              <div key={name} className={`border rounded-xl p-4 ${freshnessColor(mod.freshness)}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold capitalize">{name.replace(/_/g, ' ')}</h3>
                  {freshnessIcon(mod.freshness)}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span className="capitalize">{mod.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Freshness</span>
                    <span className="capitalize font-medium">{mod.freshness}</span>
                  </div>
                  {mod.age_hours != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Age</span>
                      <span>{mod.age_hours < 1 ? `${Math.round(mod.age_hours * 60)}m` : `${mod.age_hours.toFixed(1)}h`}</span>
                    </div>
                  )}
                  {mod.elapsed_seconds != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Runtime</span>
                      <span>{mod.elapsed_seconds < 60 ? `${mod.elapsed_seconds.toFixed(0)}s` : `${(mod.elapsed_seconds / 60).toFixed(1)}m`}</span>
                    </div>
                  )}
                  {mod.consecutive_failures > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Failures</span>
                      <span className="text-red-400 font-bold">{mod.consecutive_failures}</span>
                    </div>
                  )}
                  {mod.error && (
                    <p className="text-xs text-red-400 mt-1 truncate" title={mod.error}>{mod.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {loading && !health && (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-blue-400" size={32} />
        </div>
      )}
    </div>
  );
}
