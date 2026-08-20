/**
 * Data Freshness Badge
 *
 * Surfaces /api/system/health (already existed, built for exactly this,
 * just never had a UI). Shows how stale each data source is - the single
 * best trust signal for a system about to go public: a visitor can see
 * "market data: 2h ago, news: 4 min ago" instead of wondering if it's
 * stale. See REPO_AUDIT_REPORT.md §9.1.
 */

import { useState, useEffect } from 'react';
import { Circle } from 'lucide-react';
import { api } from '../lib/api';

interface ModuleHealth {
  freshness: 'fresh' | 'stale' | 'outdated' | 'never_run';
  age_hours: number | null;
}

interface HealthResponse {
  status: 'healthy' | 'degraded';
  modules: Record<string, ModuleHealth>;
}

const FRESHNESS_COLOR: Record<string, string> = {
  fresh: 'text-emerald-400',
  stale: 'text-amber-400',
  outdated: 'text-rose-400',
  never_run: 'text-gray-600',
};

function formatAge(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${hours.toFixed(1)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function DataFreshnessBadge({ collapsed }: { collapsed: boolean }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await api.get('/api/system/health');
        setHealth(res.data);
      } catch {
        setHealth(null); // silent - this is a trust indicator, not a critical path
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 5 * 60 * 1000); // every 5 min, no need for tighter polling
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  // Collapsed sidebar: just an overall status dot
  if (collapsed) {
    const overallColor = health.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400';
    return (
      <div className="flex justify-center py-2" title={`System: ${health.status}`}>
        <Circle size={8} className={`${overallColor} fill-current`} />
      </div>
    );
  }

  const priorityModules = ['market_data', 'intelligence', 'insider_flow'];
  const entries = priorityModules
    .filter((m) => health.modules[m])
    .map((m) => [m, health.modules[m]] as [string, ModuleHealth]);

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-1">Data freshness</div>
      {entries.map(([name, mod]) => (
        <div key={name} className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500 capitalize">{name.replace('_', ' ')}</span>
          <span className={`font-mono ${FRESHNESS_COLOR[mod.freshness]}`}>
            {formatAge(mod.age_hours)}
          </span>
        </div>
      ))}
    </div>
  );
}
