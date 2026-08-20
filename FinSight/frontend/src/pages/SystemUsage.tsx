/**
 * SystemUsage - UX Observability Dashboard
 * 
 * PHASE 43: Real Deployment & Paper Mode Go-Live
 * 
 * This page displays usage metrics for observability.
 * READ-ONLY - no behavior modification.
 */

import React, { useEffect, useState } from 'react';
import { getUsageTracker, type DailyUsageSummary, type UsageEvent } from '../observability';

const SystemUsage: React.FC = () => {
  const [summary, setSummary] = useState<DailyUsageSummary | null>(null);
  const [recentEvents, setRecentEvents] = useState<UsageEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  
  useEffect(() => {
    const tracker = getUsageTracker();
    
    // Get daily summary
    const dailySummary = tracker.getDailyUsageSummary(selectedDate);
    setSummary(dailySummary);
    
    // Get recent events
    const allEvents = tracker.getAllEvents();
    setRecentEvents(allEvents.slice(-50).reverse());
  }, [selectedDate]);
  
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-400">System Usage</h1>
          <p className="text-gray-400 mt-2">
            UX Observability Dashboard — Read-Only Metrics
          </p>
        </div>
        
        {/* Date Selector */}
        <div className="mb-6">
          <label className="text-gray-400 mr-2">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white"
          />
        </div>
        
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Sessions</div>
              <div className="text-2xl font-bold text-green-400">
                {summary.session_count}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Decisions Viewed</div>
              <div className="text-2xl font-bold text-blue-400">
                {summary.decisions_viewed}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Decisions Acted Upon</div>
              <div className="text-2xl font-bold text-yellow-400">
                {summary.decisions_acted_upon}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Decisions Ignored</div>
              <div className="text-2xl font-bold text-red-400">
                {summary.decisions_ignored}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Avg Hesitation</div>
              <div className="text-2xl font-bold text-purple-400">
                {formatTime(summary.avg_hesitation_ms)}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Question Triggers</div>
              <div className="text-2xl font-bold text-orange-400">
                {summary.question_triggers}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Silence Triggers</div>
              <div className="text-2xl font-bold text-gray-400">
                {summary.silence_triggers}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm">Narrative Opened</div>
              <div className="text-2xl font-bold">
                {summary.narrative_consumption ? (
                  <span className="text-green-400">✓</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Narrative Consumption */}
        {summary?.narrative_consumption && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-8">
            <h2 className="text-lg font-semibold text-green-400 mb-4">
              Narrative Consumption
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Narrative Date:</span>
                <span className="ml-2 text-white">
                  {summary.narrative_consumption.narrative_date}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Time to Open:</span>
                <span className="ml-2 text-white">
                  {summary.narrative_consumption.time_to_open_ms 
                    ? formatTime(summary.narrative_consumption.time_to_open_ms)
                    : '—'
                  }
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Recent Events */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-green-400 mb-4">
            Recent Events
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">Timestamp</th>
                  <th className="text-left py-2">Event Type</th>
                  <th className="text-left py-2">Context</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-4 text-gray-500">
                      No events recorded
                    </td>
                  </tr>
                ) : (
                  recentEvents.map((event) => (
                    <tr key={event.event_id} className="border-b border-gray-700/50">
                      <td className="py-2 text-gray-400 font-mono text-xs">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2">
                        <span className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${event.event_type.includes('APPROVED') ? 'bg-green-900 text-green-300' :
                            event.event_type.includes('REJECTED') ? 'bg-red-900 text-red-300' :
                            event.event_type.includes('IGNORED') ? 'bg-yellow-900 text-yellow-300' :
                            'bg-gray-700 text-gray-300'}
                        `}>
                          {event.event_type}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400 font-mono text-xs">
                        {JSON.stringify(event.context).slice(0, 80)}
                        {JSON.stringify(event.context).length > 80 ? '...' : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>
            This dashboard is for observability only.
            <br />
            No behavior modification. No nudging. No ranking changes.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SystemUsage;

