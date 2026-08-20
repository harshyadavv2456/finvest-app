import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/env';
import { AlertTriangle, TrendingUp, Calendar, ChevronDown, ChevronRight, Globe, BarChart3, Users } from 'lucide-react';

interface Signal {
  date: string;
  signal: string;
  facts: string[];
  entities: string[];
  signal_type: string;
  confidence_score: number;
  confidence_level: string;
  actionable: boolean;
  weighted_score: number;
  recency_weight: number;
  sources: string[];
}

interface HistoryDay {
  date: string;
  recency_weight: number;
  top_signals_count: number;
  india_items_count: number;
  global_items_count: number;
  corporate_items_count: number;
  signal_headlines: string[];
}

interface DailyAnalysis {
  date: string;
  market_snapshot: any;
  top_signals: any[];
  india_policy: any[];
  global_macro: any[];
  corporate: any[];
  risk_views: any;
}

type ActiveTab = 'signals' | 'history' | 'entities' | 'theses';

export default function MarketIntelPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('signals');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dailyDetail, setDailyDetail] = useState<DailyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [signalsResp, historyResp, healthResp] = await Promise.all([
        fetch(`${API_BASE_URL}/api/mnemos/signals?days=${days}&limit=100`),
        fetch(`${API_BASE_URL}/api/mnemos/history?days=50`),
        fetch(`${API_BASE_URL}/api/mnemos/health`),
      ]);
      if (signalsResp.ok) setSignals((await signalsResp.json()).signals || []);
      if (historyResp.ok) setHistory((await historyResp.json()).history || []);
      if (healthResp.ok) setHealth(await healthResp.json());
    } catch (err) {
      console.error('Failed to load Mnemos data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEntities = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/mnemos/entities?limit=50`);
      if (resp.ok) setEntities((await resp.json()).entities || []);
    } catch (err) { console.error(err); }
  };

  const loadTheses = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/mnemos/theses`);
      if (resp.ok) setTheses((await resp.json()).theses || []);
    } catch (err) { console.error(err); }
  };

  const loadDailyDetail = async (dateStr: string) => {
    if (expandedDate === dateStr) {
      setExpandedDate(null);
      setDailyDetail(null);
      return;
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/api/mnemos/daily/${dateStr}`);
      if (resp.ok) {
        setDailyDetail(await resp.json());
        setExpandedDate(dateStr);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'entities' && entities.length === 0) loadEntities();
    if (activeTab === 'theses' && theses.length === 0) loadTheses();
  }, [activeTab]);

  const confColor = (level: string) => {
    if (level === 'HIGH') return 'text-green-400 bg-green-500/10';
    if (level === 'MEDIUM') return 'text-yellow-400 bg-yellow-500/10';
    return 'text-gray-400 bg-gray-500/10';
  };

  const tabs = [
    { id: 'signals' as ActiveTab, label: 'Top Signals', icon: TrendingUp },
    { id: 'history' as ActiveTab, label: 'Daily History', icon: Calendar },
    { id: 'entities' as ActiveTab, label: 'Entities', icon: Users },
    { id: 'theses' as ActiveTab, label: 'Theses', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-bloomberg-text flex items-center gap-2">
              <Globe size={24} className="text-teal-400" />
              Market Intelligence
            </h1>
            <p className="text-sm text-bloomberg-text-muted mt-1">
              Mnemos Buy-Side Intelligence - {health?.total_analysis_days || 0} days of analysis
              {health?.latest_analysis && <span> (latest: {health.latest_analysis})</span>}
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-bloomberg-panel border border-bloomberg-border rounded-lg px-3 py-2 text-sm text-bloomberg-text"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={50}>Last 50 days</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-bloomberg-panel rounded-lg p-1 border border-bloomberg-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-bloomberg-accent text-white'
                  : 'text-bloomberg-text-muted hover:text-bloomberg-text hover:bg-bloomberg-dark'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="text-bloomberg-text-muted">Loading intelligence data...</div>
          </div>
        ) : (
          <>
            {/* Signals Tab */}
            {activeTab === 'signals' && (
              <div className="space-y-3">
                {signals.length === 0 ? (
                  <div className="text-center py-12 text-bloomberg-text-muted">
                    <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No signals available for the selected period</p>
                  </div>
                ) : (
                  signals.map((sig, i) => (
                    <div key={i} className="card hover:border-bloomberg-accent/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-bloomberg-text-muted">{sig.date}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${confColor(sig.confidence_level)}`}>
                              {sig.confidence_level}
                            </span>
                            {sig.actionable && (
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                                Actionable
                              </span>
                            )}
                            {sig.signal_type && (
                              <span className="text-xs text-bloomberg-text-muted px-2 py-0.5 bg-bloomberg-dark rounded">
                                {sig.signal_type.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <p className="text-bloomberg-text font-medium mb-2">{sig.signal}</p>
                          {sig.facts.length > 0 && (
                            <ul className="text-sm text-bloomberg-text-muted space-y-1">
                              {sig.facts.slice(0, 3).map((f, j) => (
                                <li key={j} className="flex items-start gap-2">
                                  <span className="text-bloomberg-accent mt-1">-</span>
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {sig.entities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {sig.entities.map((e, j) => (
                                <span key={j} className="text-xs px-2 py-0.5 bg-bloomberg-dark rounded text-bloomberg-text-muted">
                                  {e}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-bloomberg-text">{(sig.weighted_score * 100).toFixed(0)}</div>
                          <div className="text-xs text-bloomberg-text-muted">score</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {history.map((day) => (
                  <div key={day.date}>
                    <button
                      onClick={() => loadDailyDetail(day.date)}
                      className="w-full card hover:border-bloomberg-accent/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {expandedDate === day.date ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <div className="text-left">
                            <div className="font-medium text-bloomberg-text">{day.date}</div>
                            <div className="text-xs text-bloomberg-text-muted">
                              {day.top_signals_count} signals | {day.india_items_count} India | {day.global_items_count} Global | {day.corporate_items_count} Corporate
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-2 bg-bloomberg-dark rounded-full overflow-hidden">
                            <div className="h-full bg-bloomberg-accent rounded-full" style={{ width: `${day.recency_weight * 100}%` }} />
                          </div>
                          <span className="text-xs text-bloomberg-text-muted w-12 text-right">{(day.recency_weight * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      {day.signal_headlines.length > 0 && (
                        <div className="mt-2 pl-8">
                          {day.signal_headlines.slice(0, 3).map((h, i) => (
                            <div key={i} className="text-xs text-bloomberg-text-muted truncate">- {h}</div>
                          ))}
                        </div>
                      )}
                    </button>
                    {expandedDate === day.date && dailyDetail && (
                      <div className="ml-8 mt-2 space-y-4 border-l-2 border-bloomberg-accent/30 pl-4 pb-4">
                        {dailyDetail.market_snapshot?.indices?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-bloomberg-text mb-2">Market Snapshot</h4>
                            <div className="flex flex-wrap gap-3">
                              {dailyDetail.market_snapshot.indices.map((idx: any, i: number) => (
                                <div key={i} className="text-xs bg-bloomberg-panel px-3 py-1.5 rounded">
                                  <span className="text-bloomberg-text-muted">{idx.name}: </span>
                                  <span className={idx.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    {idx.change >= 0 ? '+' : ''}{idx.change}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {dailyDetail.top_signals?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-bloomberg-text mb-2">Signals ({dailyDetail.top_signals.length})</h4>
                            <div className="space-y-2">
                              {dailyDetail.top_signals.slice(0, 5).map((s: any, i: number) => (
                                <div key={i} className="text-sm text-bloomberg-text-muted bg-bloomberg-panel p-2 rounded">
                                  {s.signal}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Entities Tab */}
            {activeTab === 'entities' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {entities.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-bloomberg-text-muted">No entities tracked</div>
                ) : entities.map((entity, i) => (
                  <div key={i} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-bloomberg-text">{entity.name}</span>
                      <div className="flex items-center gap-2">
                        {entity.conviction > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${entity.conviction > 0.6 ? 'bg-green-500/20 text-green-400' : entity.conviction > 0.4 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {(entity.conviction * 100).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-xs text-bloomberg-text-muted">{entity.mention_count} signal{entity.mention_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="text-xs text-bloomberg-text-muted">
                      {entity.first_seen && <span>First: {entity.first_seen}</span>}
                      {entity.last_seen && <span> | Last: {entity.last_seen}</span>}
                    </div>
                    {entity.categories?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entity.categories.slice(0, 3).map((c: string, j: number) => (
                          <span key={j} className="text-xs px-2 py-0.5 bg-bloomberg-dark rounded text-bloomberg-text-muted">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Theses Tab */}
            {activeTab === 'theses' && (
              <div className="space-y-3">
                {theses.length === 0 ? (
                  <div className="text-center py-12 text-bloomberg-text-muted">No active theses tracked</div>
                ) : (
                  theses.map((thesis: any, i: number) => (
                    <div key={i} className="card">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-bloomberg-text">{thesis.title || thesis.name || `Thesis ${i + 1}`}</h3>
                        {thesis.type && <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">{thesis.type.replace(/_/g, ' ')}</span>}
                      </div>
                      <p className="text-sm text-bloomberg-text-muted mb-2">{thesis.description || thesis.summary || ''}</p>
                      {thesis.catalysts?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {thesis.catalysts.map((c: string, j: number) => (
                            <span key={j} className="text-xs px-2 py-0.5 bg-bloomberg-dark rounded text-bloomberg-text-muted">{c}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-bloomberg-text-muted">
                        {thesis.detected_date && <span>Detected: {thesis.detected_date}</span>}
                        {thesis.status && <span className={thesis.status === 'ACTIVE' ? 'text-green-400' : 'text-gray-400'}>{thesis.status}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
