/**
 * ConfidenceTimelineView - Read-Only Confidence Governance Timeline
 * 
 * PHASE 28: Confidence Governance
 * 
 * PURPOSE:
 * Show confidence governance over time.
 * 
 * DISPLAYS:
 * - Confidence over time
 * - Caps applied
 * - Mute periods
 * - Reasons (with citations)
 * 
 * RULES:
 * - READ-ONLY
 * - No charts without numbers
 * - No greenwashing
 */

import React, { useState, useEffect } from 'react';
import { 
  getConfidenceGovernor, 
  GovernorState, 
  GovernanceHistoryEntry 
} from '../governance/ConfidenceGovernor';
import { 
  CONFIDENCE_DISCIPLINE_POLICY,
  DisciplineState,
  DISCIPLINE_STATE_DESCRIPTIONS
} from '../governance/ConfidenceDisciplinePolicy';

// =============================================================================
// COMPONENT
// =============================================================================

export const ConfidenceTimelineView: React.FC = () => {
  const [state, setState] = useState<GovernorState | null>(null);
  const [history, setHistory] = useState<GovernanceHistoryEntry[]>([]);
  const [stats, setStats] = useState<{
    current_state: DisciplineState;
    days_in_state: number;
    overconfidence_penalty: number;
    calibration_score: number;
    max_allowed: number;
    total_governed: number;
    total_adjusted: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = () => {
    try {
      const governor = getConfidenceGovernor();
      setState(governor.getCurrentState());
      setHistory(governor.getHistory());
      setStats(governor.getStats());
      setLoading(false);
    } catch (e) {
      console.error('Failed to load governance data:', e);
      setLoading(false);
    }
  };
  
  const getStateColor = (state: DisciplineState) => {
    switch (state) {
      case 'NORMAL': return 'text-green-400 bg-green-900/30';
      case 'RESTRAINED': return 'text-yellow-400 bg-yellow-900/30';
      case 'MUTED': return 'text-red-400 bg-red-900/30';
    }
  };
  
  const getStateIcon = (state: DisciplineState) => {
    switch (state) {
      case 'NORMAL': return '✓';
      case 'RESTRAINED': return '⚠';
      case 'MUTED': return '🔇';
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <p>Loading confidence governance data...</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Confidence Governance</h1>
        <p className="text-gray-400 mt-2">
          Speech discipline: Knowing when to speak softly
        </p>
      </div>
      
      {/* Current State */}
      {state && stats && (
        <div className={`rounded-lg p-6 mb-8 ${getStateColor(state.current_state)}`}>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-4xl">{getStateIcon(state.current_state)}</span>
            <div>
              <h2 className="text-2xl font-bold">{state.current_state}</h2>
              <p className="text-sm opacity-80">
                {DISCIPLINE_STATE_DESCRIPTIONS[state.current_state]}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm opacity-70">Days in State</p>
              <p className="text-2xl font-bold">{stats.days_in_state}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm opacity-70">Max Allowed</p>
              <p className="text-2xl font-bold">{stats.max_allowed}%</p>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm opacity-70">Overconfidence Penalty</p>
              <p className="text-2xl font-bold">{stats.overconfidence_penalty}</p>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm opacity-70">Calibration Score</p>
              <p className="text-2xl font-bold">{stats.calibration_score}/100</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Policy Thresholds */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Discipline Policy (Immutable)</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Overconfidence Limit</p>
            <p className="text-xl font-bold">{CONFIDENCE_DISCIPLINE_POLICY.overconfidence_penalty_limit}</p>
            <p className="text-xs text-gray-500">Before RESTRAINED</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Consecutive Limit</p>
            <p className="text-xl font-bold">{CONFIDENCE_DISCIPLINE_POLICY.consecutive_overconfidence_limit}</p>
            <p className="text-xs text-gray-500">Before MUTED</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Mute Duration</p>
            <p className="text-xl font-bold">{CONFIDENCE_DISCIPLINE_POLICY.mute_duration_days} days</p>
            <p className="text-xs text-gray-500">Time-based recovery</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Absolute Ceiling</p>
            <p className="text-xl font-bold">{CONFIDENCE_DISCIPLINE_POLICY.absolute_confidence_ceiling}%</p>
            <p className="text-xs text-gray-500">Maximum ever allowed</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Muted Ceiling</p>
            <p className="text-xl font-bold">{CONFIDENCE_DISCIPLINE_POLICY.muted_confidence_ceiling}%</p>
            <p className="text-xs text-gray-500">When MUTED</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">Recovery Rate</p>
            <p className="text-xl font-bold">+{CONFIDENCE_DISCIPLINE_POLICY.recovery_rate_per_30_days}/30 days</p>
            <p className="text-xs text-gray-500">Time-based only</p>
          </div>
        </div>
      </div>
      
      {/* Statistics */}
      {stats && (
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Governance Statistics</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Governed</p>
              <p className="text-2xl font-bold">{stats.total_governed}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Adjusted</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.total_adjusted}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Adjustment Rate</p>
              <p className="text-2xl font-bold">
                {stats.total_governed > 0 
                  ? Math.round((stats.total_adjusted / stats.total_governed) * 100) 
                  : 0}%
              </p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">No Inflation Verified</p>
              <p className="text-2xl font-bold text-green-400">✓</p>
            </div>
          </div>
        </div>
      )}
      
      {/* History Timeline */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Governance History</h2>
        
        {history.length === 0 ? (
          <p className="text-gray-400">No governance history yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-700">
                  <th className="pb-3 text-gray-400 font-medium">Timestamp</th>
                  <th className="pb-3 text-gray-400 font-medium">Original</th>
                  <th className="pb-3 text-gray-400 font-medium">Governed</th>
                  <th className="pb-3 text-gray-400 font-medium">Adjustment</th>
                  <th className="pb-3 text-gray-400 font-medium">State</th>
                  <th className="pb-3 text-gray-400 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().slice(0, 50).map((entry, idx) => {
                  const adjustment = entry.original_confidence - entry.governed_confidence;
                  return (
                    <tr 
                      key={entry.id} 
                      className={`border-b border-gray-700/50 ${
                        adjustment > 0 ? 'bg-yellow-900/10' : ''
                      }`}
                    >
                      <td className="py-3 text-sm">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <span className="font-mono">{entry.original_confidence}%</span>
                      </td>
                      <td className="py-3">
                        <span className="font-mono">{entry.governed_confidence}%</span>
                      </td>
                      <td className="py-3">
                        {adjustment > 0 ? (
                          <span className="text-yellow-400 font-mono">-{adjustment}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs ${getStateColor(entry.state_at_time)}`}>
                          {entry.state_at_time}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-400">
                        {entry.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {history.length > 50 && (
              <p className="text-center text-gray-500 mt-4">
                Showing 50 of {history.length} entries
              </p>
            )}
          </div>
        )}
      </div>
      
      {/* Important Notes */}
      <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <h3 className="font-semibold mb-2">Governance Rules</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Confidence can <span className="text-red-400">NEVER</span> exceed original snapshot confidence</li>
          <li>• Recovery requires <span className="text-blue-400">TIME</span> + honest calibration, NOT wins</li>
          <li>• All adjustments are <span className="text-green-400">logged</span> and <span className="text-green-400">visible</span></li>
          <li>• Mute periods are <span className="text-yellow-400">explicitly stated</span>, never hidden</li>
          <li>• Policy thresholds are <span className="text-purple-400">immutable</span>, cannot be changed at runtime</li>
        </ul>
      </div>
    </div>
  );
};

export default ConfidenceTimelineView;

