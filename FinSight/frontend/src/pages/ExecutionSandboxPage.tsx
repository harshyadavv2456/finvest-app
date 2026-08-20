/**
 * ExecutionSandboxPage - Sandbox Performance Dashboard
 * 
 * PHASE 22: Execution Sandbox
 * 
 * Shows:
 * - Approved vs Rejected decisions
 * - "If followed" portfolio value
 * - Regret avoided / incurred
 * - Accuracy by confidence bucket
 * 
 * RULES:
 * - NO charts without numbers
 * - ALL data must come from sandbox
 * - FAIL CLOSED if data missing
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Shield, CheckCircle, XCircle, 
  TrendingUp, TrendingDown, DollarSign, 
  AlertTriangle, Target, Clock, RefreshCw,
  ChevronRight, Lock
} from 'lucide-react';

import { 
  ExecutionSandbox, 
  getExecutionSandbox, 
  IntentRecord, 
  IntentPerformance,
  SandboxStats 
} from '../execution/ExecutionSandbox';
import { getConsequenceEngine, ConsequenceTimeSeries } from '../analysis/ConsequenceEngine';

// =============================================================================
// TYPES
// =============================================================================

interface PerformanceRow {
  intent: IntentRecord;
  performance: IntentPerformance | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ExecutionSandboxPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [intents, setIntents] = useState<PerformanceRow[]>([]);
  const [missedOpportunities, setMissedOpportunities] = useState<PerformanceRow[]>([]);
  const [userWins, setUserWins] = useState<PerformanceRow[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'decisions' | 'missed' | 'wins'>('overview');
  
  const sandbox = getExecutionSandbox();
  const consequenceEngine = getConsequenceEngine();
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = () => {
    setLoading(true);
    
    try {
      // Get stats
      const sandboxStats = sandbox.getStats();
      setStats(sandboxStats);
      
      // Get all intents with performance
      const allIntents = sandbox.getIntents();
      const intentRows: PerformanceRow[] = allIntents.map(intent => ({
        intent,
        performance: sandbox.getPerformance(intent.id)
      }));
      setIntents(intentRows);
      
      // Get missed opportunities
      const missed = sandbox.getMissedOpportunities();
      setMissedOpportunities(missed.map(m => ({ intent: m.intent, performance: m.performance })));
      
      // Get user wins
      const wins = sandbox.getUserWins();
      setUserWins(wins.map(w => ({ intent: w.intent, performance: w.performance })));
    } catch (e) {
      console.error('Failed to load sandbox data:', e);
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
  
  // Format percent
  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };
  
  // Get color for value
  const getValueColor = (value: number): string => {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e14] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
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
            <Shield className="w-10 h-10 text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Execution Sandbox</h1>
              <p className="text-gray-400">NO REAL MONEY - Performance Tracking Only</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 rounded-lg">
            <Lock className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 font-bold">SANDBOX MODE</span>
          </div>
        </div>
        
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total Decisions</div>
              <div className="text-2xl font-bold text-white">{stats.total_intents}</div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.approved_count} approved, {stats.rejected_count} rejected
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">If Followed All</div>
              <div className={`text-2xl font-bold ${getValueColor(stats.delta_value)}`}>
                {formatCurrency(stats.if_followed_value)}
              </div>
              <div className={`text-xs mt-1 ${getValueColor(stats.delta_percent)}`}>
                {formatPercent(stats.delta_percent)} vs actual
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total Regret</div>
              <div className={`text-2xl font-bold ${stats.total_regret > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {formatCurrency(stats.total_regret)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Avg: {stats.average_regret_percent.toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Opportunity Cost</div>
              <div className="text-2xl font-bold text-orange-400">
                {formatCurrency(stats.total_opportunity_cost)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                From rejected recommendations
              </div>
            </div>
          </div>
        )}
        
        {/* Accuracy by Confidence */}
        {stats && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-8">
            <h3 className="text-lg font-bold text-white mb-4">Accuracy by Confidence Bucket</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">High Confidence (80-100)</div>
                <div className="text-3xl font-bold text-green-400">
                  {(stats.accuracy_by_confidence.high.rate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.accuracy_by_confidence.high.correct}/{stats.accuracy_by_confidence.high.total} correct
                </div>
              </div>
              
              <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">Medium Confidence (60-79)</div>
                <div className="text-3xl font-bold text-yellow-400">
                  {(stats.accuracy_by_confidence.medium.rate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.accuracy_by_confidence.medium.correct}/{stats.accuracy_by_confidence.medium.total} correct
                </div>
              </div>
              
              <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">Low Confidence (0-59)</div>
                <div className="text-3xl font-bold text-red-400">
                  {(stats.accuracy_by_confidence.low.rate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.accuracy_by_confidence.low.correct}/{stats.accuracy_by_confidence.low.total} correct
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'overview' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('decisions')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'decisions' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            All Decisions ({intents.length})
          </button>
          <button
            onClick={() => setActiveTab('missed')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'missed' 
                ? 'bg-red-500 text-white' 
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Missed Opportunities ({missedOpportunities.length})
          </button>
          <button
            onClick={() => setActiveTab('wins')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'wins' 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Your Wins ({userWins.length})
          </button>
        </div>
        
        {/* Content */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700">
          {activeTab === 'overview' && (
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6">Performance Summary</h3>
              
              {/* Value Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900/50 rounded-lg p-6">
                  <div className="text-gray-400 mb-2">Actual Portfolio Value</div>
                  <div className="text-4xl font-bold text-white">
                    {stats ? formatCurrency(stats.actual_value) : '—'}
                  </div>
                  <div className="text-sm text-gray-500 mt-2">Based on your decisions</div>
                </div>
                
                <div className="bg-gray-900/50 rounded-lg p-6">
                  <div className="text-gray-400 mb-2">If Followed FinVest</div>
                  <div className={`text-4xl font-bold ${stats && stats.delta_value > 0 ? 'text-green-400' : 'text-white'}`}>
                    {stats ? formatCurrency(stats.if_followed_value) : '—'}
                  </div>
                  <div className={`text-sm mt-2 ${stats && stats.delta_value > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                    {stats && stats.delta_value > 0 
                      ? `+${formatCurrency(stats.delta_value)} potential gain`
                      : 'No additional gain'
                    }
                  </div>
                </div>
              </div>
              
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-900/30 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    Approved
                  </div>
                  <div className="text-2xl font-bold text-white">{stats?.approved_count || 0}</div>
                </div>
                
                <div className="p-4 bg-gray-900/30 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <XCircle className="w-4 h-4 text-red-400" />
                    Rejected
                  </div>
                  <div className="text-2xl font-bold text-white">{stats?.rejected_count || 0}</div>
                </div>
                
                <div className="p-4 bg-gray-900/30 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    Missed Gains
                  </div>
                  <div className="text-2xl font-bold text-red-400">
                    {missedOpportunities.length}
                  </div>
                </div>
                
                <div className="p-4 bg-gray-900/30 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    Good Rejections
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    {userWins.length}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'decisions' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="text-left p-4 text-gray-400 font-medium">Symbol</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Action</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Entry Price</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Current</th>
                    <th className="text-right p-4 text-gray-400 font-medium">P&L</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Regret</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {intents.map(({ intent, performance }) => (
                    <tr 
                      key={intent.id}
                      className="border-t border-gray-700 hover:bg-gray-800/50"
                    >
                      <td className="p-4">
                        <div className="font-bold text-white">{intent.symbol}</div>
                        <div className="text-xs text-gray-500">{intent.market}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          intent.action === 'BUY' ? 'bg-green-500/20 text-green-400' :
                          intent.action === 'SELL' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {intent.action}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`flex items-center gap-1 ${
                          intent.status === 'APPROVED' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {intent.status === 'APPROVED' 
                            ? <CheckCircle className="w-4 h-4" /> 
                            : <XCircle className="w-4 h-4" />
                          }
                          {intent.status}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-white">
                        ₹{intent.price_at_intent.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-mono text-white">
                        {intent.current_price ? `₹${intent.current_price.toFixed(2)}` : '—'}
                      </td>
                      <td className={`p-4 text-right font-mono ${getValueColor(intent.unrealized_pnl || 0)}`}>
                        {intent.unrealized_pnl ? formatPercent(intent.unrealized_pnl_percent || 0) : '—'}
                      </td>
                      <td className={`p-4 text-right font-mono ${performance && performance.regret_amount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {performance ? formatCurrency(performance.regret_amount) : '—'}
                      </td>
                      <td className="p-4 text-gray-400 text-sm">
                        {new Date(intent.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  
                  {intents.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        No decisions recorded yet. Approve or reject recommendations to track performance.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          
          {activeTab === 'missed' && (
            <div className="p-6">
              <h3 className="text-xl font-bold text-red-400 mb-4">
                Missed Opportunities
              </h3>
              <p className="text-gray-400 mb-6">
                Recommendations you rejected that would have been profitable.
              </p>
              
              {missedOpportunities.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No missed opportunities yet. Your rejections have been accurate!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {missedOpportunities.map(({ intent, performance }) => (
                    <div 
                      key={intent.id}
                      className="bg-red-900/20 border border-red-500/30 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-white">{intent.symbol}</span>
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                            REJECTED {intent.action}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-red-400 font-bold text-lg">
                            -{formatCurrency(performance?.opportunity_cost || 0)}
                          </div>
                          <div className="text-xs text-gray-500">Opportunity Cost</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                        <div>
                          <div className="text-gray-400">If Followed</div>
                          <div className="text-green-400 font-bold">
                            {performance ? formatPercent(performance.return_if_followed) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Your Return</div>
                          <div className="text-white font-bold">
                            {performance ? formatPercent(performance.return_actual) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Days Since</div>
                          <div className="text-white font-bold">
                            {performance?.days_since_intent || 0} days
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'wins' && (
            <div className="p-6">
              <h3 className="text-xl font-bold text-green-400 mb-4">
                Your Smart Rejections
              </h3>
              <p className="text-gray-400 mb-6">
                Recommendations you correctly rejected - you knew better!
              </p>
              
              {userWins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No winning rejections yet. FinVest has been accurate so far!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userWins.map(({ intent, performance }) => (
                    <div 
                      key={intent.id}
                      className="bg-green-900/20 border border-green-500/30 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-white">{intent.symbol}</span>
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                            GOOD REJECTION
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-bold text-lg">
                            +{formatCurrency(Math.abs(performance?.regret_amount || 0))}
                          </div>
                          <div className="text-xs text-gray-500">Loss Avoided</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                        <div>
                          <div className="text-gray-400">If Followed</div>
                          <div className="text-red-400 font-bold">
                            {performance ? formatPercent(performance.return_if_followed) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Your Return</div>
                          <div className="text-white font-bold">
                            {performance ? formatPercent(performance.return_actual) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">FinVest Was</div>
                          <div className="text-red-400 font-bold">WRONG</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Sandbox Notice */}
        <div className="mt-8 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
            <div>
              <div className="font-bold text-yellow-400">Sandbox Mode Active</div>
              <div className="text-sm text-gray-400 mt-1">
                This is a simulation environment. No real trades are executed. 
                The execution engine remains <strong className="text-yellow-400">LOCKED</strong>. 
                All data is for performance tracking only.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

