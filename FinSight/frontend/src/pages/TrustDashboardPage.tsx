/**
 * TrustDashboardPage - Trust & Proof Dashboard
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * Shows:
 * - "If you followed FinVest for X days"
 * - Accuracy vs confidence
 * - Worst mistakes (top 3)
 * - Best avoided losses
 * - Calibration curve
 * 
 * RULES:
 * - NO marketing language
 * - NO hiding losses
 * - All data from TrustLedger only
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Shield, TrendingUp, TrendingDown, 
  Target, AlertTriangle, CheckCircle, XCircle,
  BarChart3, Lock, Clock, Award, AlertCircle,
  ChevronRight, Info
} from 'lucide-react';

import { getTrustLedger, TrustScore, TrustEntry, LedgerIntegrity } from '../trust/TrustLedger';
import { getConfidenceCalibration, CalibrationReport, CalibrationInsight } from '../trust/ConfidenceCalibration';
import { getExecutionPermission, PermissionStatus, PermissionProgress } from '../trust/ExecutionPermission';

// =============================================================================
// COMPONENT
// =============================================================================

export default function TrustDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [calibration, setCalibration] = useState<CalibrationReport | null>(null);
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [integrity, setIntegrity] = useState<LedgerIntegrity | null>(null);
  const [worstMistakes, setWorstMistakes] = useState<readonly TrustEntry[]>([]);
  const [bestAvoided, setBestAvoided] = useState<readonly TrustEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'calibration' | 'history' | 'permission'>('overview');
  
  const ledger = getTrustLedger();
  const calibrationEngine = getConfidenceCalibration();
  const permissionManager = getExecutionPermission();
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = () => {
    setLoading(true);
    try {
      // Sync and get data
      ledger.sync();
      
      setTrustScore(ledger.getTrustScore());
      setCalibration(calibrationEngine.getCalibrationReport());
      setPermission(permissionManager.evaluate());
      setIntegrity(ledger.verifyIntegrity());
      setWorstMistakes(ledger.getWorstMistakes(3));
      setBestAvoided(ledger.getBestAvoidedLosses(3));
    } catch (e) {
      console.error('Failed to load trust data:', e);
    } finally {
      setLoading(false);
    }
  };
  
  // Format currency
  const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 10000000) {
      return `₹${(value / 10000000).toFixed(2)}Cr`;
    } else if (absValue >= 100000) {
      return `₹${(value / 100000).toFixed(2)}L`;
    } else {
      return `₹${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  };
  
  // Get color for value
  const getValueColor = (value: number): string => {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
  };
  
  // Get trust score color
  const getTrustScoreColor = (score: number): string => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    if (score >= 30) return 'text-orange-400';
    return 'text-red-400';
  };
  
  // Get insight icon
  const getInsightIcon = (type: CalibrationInsight['type']) => {
    switch (type) {
      case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'WARNING': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'INFO': return <Info className="w-5 h-5 text-blue-400" />;
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e14] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#0a0e14] text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Shield className="w-10 h-10 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Trust Dashboard</h1>
              <p className="text-gray-400">Proving FinVest's reliability through data</p>
            </div>
          </div>
          
          {integrity && !integrity.valid && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Integrity Issues</span>
            </div>
          )}
        </div>
        
        {/* Trust Score Hero */}
        {trustScore && (
          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Net Trust Score */}
              <div className="text-center">
                <div className="text-gray-400 mb-2">Net Trust Score</div>
                <div className={`text-6xl font-bold ${getTrustScoreColor(trustScore.net_trust_score)}`}>
                  {trustScore.net_trust_score}
                </div>
                <div className="text-sm text-gray-500 mt-1">out of 100</div>
              </div>
              
              {/* Tracking Summary */}
              <div className="text-center border-l border-r border-gray-700 px-4">
                <div className="text-gray-400 mb-2">If You Followed FinVest</div>
                <div className="text-2xl font-bold text-white">
                  for {trustScore.days_of_tracking} days
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {trustScore.total_sandbox_decisions} decisions tracked
                </div>
              </div>
              
              {/* Financial Impact */}
              <div className="text-center">
                <div className="text-gray-400 mb-2">Net Impact</div>
                <div className={`text-2xl font-bold ${
                  (trustScore.total_regret_avoided - trustScore.total_regret_incurred) >= 0 
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(trustScore.total_regret_avoided - trustScore.total_regret_incurred)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Avoided: {formatCurrency(trustScore.total_regret_avoided)} | 
                  Lost: {formatCurrency(trustScore.total_regret_incurred)}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {['overview', 'calibration', 'history', 'permission'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg font-medium capitalize whitespace-nowrap ${
                activeTab === tab 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && trustScore && (
            <>
              {/* Accuracy Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-sm mb-1">Overall Accuracy</div>
                  <div className="text-2xl font-bold text-white">
                    {(trustScore.overall_accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-sm mb-1">Correct Approvals</div>
                  <div className="text-2xl font-bold text-green-400">
                    {trustScore.correct_approvals}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-sm mb-1">Wrong Approvals</div>
                  <div className="text-2xl font-bold text-red-400">
                    {trustScore.wrong_approvals}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-sm mb-1">Pending</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {trustScore.pending_outcomes}
                  </div>
                </div>
              </div>
              
              {/* Mistakes and Wins */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Worst Mistakes */}
                <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
                  <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Worst Mistakes (Top 3)
                  </h3>
                  {worstMistakes.length === 0 ? (
                    <p className="text-gray-500">No mistakes recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {worstMistakes.map((entry, idx) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded">
                          <div>
                            <div className="font-bold text-white">{idx + 1}. {entry.symbol}</div>
                            <div className="text-xs text-gray-500">
                              {entry.user_decision} {entry.action_recommended}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-red-400 font-bold">
                              -{formatCurrency(Math.abs(entry.regret_amount))}
                            </div>
                            <div className="text-xs text-gray-500">regret</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Best Avoided Losses */}
                <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
                  <h3 className="text-lg font-bold text-green-400 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Best Avoided Losses (Top 3)
                  </h3>
                  {bestAvoided.length === 0 ? (
                    <p className="text-gray-500">No avoided losses recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {bestAvoided.map((entry, idx) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded">
                          <div>
                            <div className="font-bold text-white">{idx + 1}. {entry.symbol}</div>
                            <div className="text-xs text-gray-500">
                              Correctly rejected {entry.action_recommended}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-green-400 font-bold">
                              +{formatCurrency(Math.abs(entry.regret_amount))}
                            </div>
                            <div className="text-xs text-gray-500">saved</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          
          {activeTab === 'calibration' && calibration && (
            <>
              {/* Calibration Status */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-400 text-sm">Calibration Status</div>
                    <div className={`text-2xl font-bold ${calibration.is_well_calibrated ? 'text-green-400' : 'text-yellow-400'}`}>
                      {calibration.is_well_calibrated ? 'Well Calibrated' : 'Needs Improvement'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-400 text-sm">Calibration Error</div>
                    <div className="text-2xl font-bold text-white">
                      {calibration.overall_calibration_error.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bucket Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {['high', 'medium', 'low'].map((bucket) => {
                  const stats = calibration[bucket as 'high' | 'medium' | 'low'];
                  return (
                    <div key={bucket} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-lg font-bold text-white capitalize">{bucket}</div>
                        <div className="text-sm text-gray-500">({stats.confidence_range})</div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Decisions</span>
                          <span className="text-white">{stats.total_decisions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Accuracy</span>
                          <span className={getValueColor(stats.accuracy_percent - stats.expected_accuracy_percent)}>
                            {stats.accuracy_percent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Expected</span>
                          <span className="text-gray-500">{stats.expected_accuracy_percent.toFixed(1)}%</span>
                        </div>
                        {stats.overconfidence_penalty > 0 && (
                          <div className="flex justify-between text-red-400">
                            <span>Overconfidence</span>
                            <span>-{stats.overconfidence_penalty.toFixed(1)}%</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-400">Avg Regret</span>
                          <span className="text-white">{formatCurrency(stats.avg_regret_per_decision)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Calibration Curve */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
                <h3 className="text-lg font-bold text-white mb-4">Calibration Curve</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left p-2">Predicted</th>
                        <th className="text-left p-2">Actual</th>
                        <th className="text-left p-2">Samples</th>
                        <th className="text-left p-2">Deviation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibration.calibration_curve.map((point, idx) => (
                        <tr key={idx} className="border-t border-gray-700">
                          <td className="p-2 text-white">{point.predicted_confidence}%</td>
                          <td className="p-2 text-white">{point.actual_accuracy.toFixed(1)}%</td>
                          <td className="p-2 text-gray-400">{point.sample_size}</td>
                          <td className={`p-2 ${getValueColor(point.actual_accuracy - point.predicted_confidence)}`}>
                            {point.sample_size > 0 
                              ? `${(point.actual_accuracy - point.predicted_confidence) >= 0 ? '+' : ''}${(point.actual_accuracy - point.predicted_confidence).toFixed(1)}%`
                              : '—'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Insights */}
              {calibration.insights.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-bold text-white mb-4">Insights</h3>
                  <div className="space-y-3">
                    {calibration.insights.map((insight, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg flex items-start gap-3 ${
                          insight.type === 'SUCCESS' ? 'bg-green-900/20 border border-green-500/30' :
                          insight.type === 'WARNING' ? 'bg-yellow-900/20 border border-yellow-500/30' :
                          'bg-blue-900/20 border border-blue-500/30'
                        }`}
                      >
                        {getInsightIcon(insight.type)}
                        <div>
                          <div className="text-white">{insight.message}</div>
                          {insight.action_suggested && (
                            <div className="text-sm text-gray-400 mt-1">
                              → {insight.action_suggested}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          {activeTab === 'history' && trustScore && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-bold text-white">Decision History</h3>
                <p className="text-sm text-gray-400">All tracked sandbox decisions</p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50">
                    <tr className="text-gray-400">
                      <th className="text-left p-3">Symbol</th>
                      <th className="text-left p-3">Recommendation</th>
                      <th className="text-left p-3">Your Decision</th>
                      <th className="text-left p-3">Outcome</th>
                      <th className="text-right p-3">Regret</th>
                      <th className="text-right p-3">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.getEntries().slice(0, 20).map((entry) => (
                      <tr key={entry.id} className="border-t border-gray-700">
                        <td className="p-3 font-bold text-white">{entry.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            entry.action_recommended === 'BUY' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {entry.action_recommended}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            entry.user_decision === 'APPROVED' 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {entry.user_decision}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`flex items-center gap-1 ${
                            entry.outcome === 'CORRECT' ? 'text-green-400' :
                            entry.outcome === 'WRONG' ? 'text-red-400' :
                            'text-yellow-400'
                          }`}>
                            {entry.outcome === 'CORRECT' ? <CheckCircle className="w-4 h-4" /> :
                             entry.outcome === 'WRONG' ? <XCircle className="w-4 h-4" /> :
                             <Clock className="w-4 h-4" />}
                            {entry.outcome}
                          </span>
                        </td>
                        <td className={`p-3 text-right ${getValueColor(-Math.abs(entry.regret_amount))}`}>
                          {formatCurrency(entry.regret_amount)}
                        </td>
                        <td className={`p-3 text-right ${getValueColor(entry.return_if_followed)}`}>
                          {entry.return_if_followed >= 0 ? '+' : ''}{entry.return_if_followed.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'permission' && permission && (
            <>
              {/* Current Level */}
              <div className="bg-gray-800/50 rounded-lg p-6 border border-blue-500/30 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <Lock className="w-8 h-8 text-blue-400" />
                  <div>
                    <div className="text-gray-400 text-sm">Current Permission Level</div>
                    <div className="text-2xl font-bold text-white">{permission.current_level}</div>
                  </div>
                </div>
                
                {permission.is_locked && (
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {permission.lock_reason}
                  </div>
                )}
              </div>
              
              {/* Progress to Next Level */}
              {permission.next_level && permission.progress_to_next && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
                  <h3 className="text-lg font-bold text-white mb-4">
                    Progress to {permission.next_level}
                  </h3>
                  
                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Overall Progress</span>
                      <span className="text-white">{permission.progress_to_next.overall_progress_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${permission.progress_to_next.overall_progress_percent}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Requirements */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.sandbox_decisions.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Decisions</span>
                        {permission.progress_to_next.sandbox_decisions.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {permission.progress_to_next.sandbox_decisions.current}/{permission.progress_to_next.sandbox_decisions.required}
                            </span>
                        }
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.accuracy.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Accuracy</span>
                        {permission.progress_to_next.accuracy.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {permission.progress_to_next.accuracy.current.toFixed(1)}% / {permission.progress_to_next.accuracy.required}%
                            </span>
                        }
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.days_of_tracking.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Days Tracked</span>
                        {permission.progress_to_next.days_of_tracking.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {permission.progress_to_next.days_of_tracking.current} / {permission.progress_to_next.days_of_tracking.required}
                            </span>
                        }
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.trust_score.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Trust Score</span>
                        {permission.progress_to_next.trust_score.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {permission.progress_to_next.trust_score.current} / {permission.progress_to_next.trust_score.required}
                            </span>
                        }
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.overconfidence.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Overconfidence</span>
                        {permission.progress_to_next.overconfidence.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {permission.progress_to_next.overconfidence.current.toFixed(1)}% (max {permission.progress_to_next.overconfidence.max_allowed}%)
                            </span>
                        }
                      </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg ${permission.progress_to_next.regret_ratio.met ? 'bg-green-900/20' : 'bg-gray-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Regret Balance</span>
                        {permission.progress_to_next.regret_ratio.met 
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <span className="text-yellow-400">
                              {formatCurrency(permission.progress_to_next.regret_ratio.avoided)} vs {formatCurrency(permission.progress_to_next.regret_ratio.incurred)}
                            </span>
                        }
                      </div>
                    </div>
                  </div>
                  
                  {/* Blocking Requirements */}
                  {permission.progress_to_next.blocking_requirements.length > 0 && (
                    <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                      <div className="text-red-400 font-bold mb-2">Blocking Issues:</div>
                      <ul className="text-sm text-gray-400 space-y-1">
                        {permission.progress_to_next.blocking_requirements.map((req, idx) => (
                          <li key={idx}>• {req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {/* Permission Levels Explained */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-4">Permission Levels</h3>
                <div className="space-y-3">
                  {[
                    { level: 'SANDBOX_ONLY', desc: 'Track recommendations without execution', icon: Shield },
                    { level: 'ALERTS_ONLY', desc: 'Receive alerts for recommendations', icon: AlertCircle },
                    { level: 'PARTIAL_EXECUTION', desc: 'Execute small positions (future)', icon: Target },
                    { level: 'FULL_EXECUTION', desc: 'Full execution capabilities (future)', icon: Award }
                  ].map(({ level, desc, icon: Icon }) => (
                    <div 
                      key={level}
                      className={`p-3 rounded-lg flex items-center justify-between ${
                        permission.current_level === level 
                          ? 'bg-blue-900/20 border border-blue-500/30' 
                          : 'bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${permission.current_level === level ? 'text-blue-400' : 'text-gray-500'}`} />
                        <div>
                          <div className={`font-bold ${permission.current_level === level ? 'text-white' : 'text-gray-400'}`}>
                            {level}
                          </div>
                          <div className="text-xs text-gray-500">{desc}</div>
                        </div>
                      </div>
                      {permission.current_level === level && (
                        <span className="text-blue-400 text-xs">CURRENT</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-gray-900/50 border border-gray-700 rounded-lg text-sm text-gray-500">
          <strong>Note:</strong> This dashboard shows real performance data from sandbox tracking. 
          No marketing language. All losses are visible. Trust must be earned through consistent accuracy.
        </div>
      </div>
    </div>
  );
}

