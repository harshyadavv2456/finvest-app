/**
 * Daily Command Center - The Default Landing Page
 * 
 * PHASE 43: Frontend Product Surface
 * 
 * This is the MAIN landing page of FinVest. It shows:
 * - For each OPEN position: Ticker, Last price, P&L, Decision, Rationale
 * - HOLD is explicit
 * - REDUCE/EXIT shows action buttons
 * - If no positions: Force user to create a PAPER portfolio
 * 
 * RULES (NON-NEGOTIABLE):
 * - Data comes from PositionDataAdapter
 * - NO localStorage trading logic
 * - NO hardcoded values
 * - Execute = calls ExecutionOrchestrator in PAPER mode
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  Activity,
  Target,
  Shield,
  RefreshCw,
  CheckCircle,
  XCircle,
  MinusCircle,
  PlayCircle,
  Pause
} from 'lucide-react';
import { 
  PositionDataAdapter, 
  PositionData, 
  DailyAssessmentSummary,
  PositionDecision 
} from '../adapters/PositionDataAdapter';
import { ExecutionService, PaperExecutionResult } from '../services/ExecutionService';

// =============================================================================
// TYPES
// =============================================================================

interface PositionRow {
  position: PositionData;
  assessment: DailyAssessmentSummary;
}

// =============================================================================
// DECISION BADGE COMPONENT
// =============================================================================

function DecisionBadge({ decision }: { decision: PositionDecision }) {
  const config = {
    INITIATE: { 
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: PlayCircle,
      label: 'INITIATE'
    },
    HOLD: { 
      color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      icon: Pause,
      label: 'HOLD'
    },
    REDUCE: { 
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      icon: MinusCircle,
      label: 'REDUCE'
    },
    EXIT: { 
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: XCircle,
      label: 'EXIT'
    },
    AVOID: { 
      color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      icon: Shield,
      label: 'AVOID'
    }
  };
  
  const { color, icon: Icon, label } = config[decision];
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// =============================================================================
// POSITION ROW COMPONENT
// =============================================================================

function PositionRowCard({ 
  position, 
  assessment, 
  onExecute 
}: PositionRow & { onExecute: (position: PositionData, action: PositionDecision) => void }) {
  const isProfit = position.unrealized_pnl >= 0;
  const requiresAction = assessment.requires_action;
  
  return (
    <div className={`
      rounded-xl border p-4 transition-all
      ${requiresAction 
        ? 'bg-gradient-to-r from-amber-500/5 to-transparent border-amber-500/30 hover:border-amber-500/50' 
        : 'bg-gray-900/30 border-gray-800 hover:border-gray-700'
      }
    `}>
      <div className="flex items-start justify-between gap-4">
        {/* Left: Symbol and Price */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-white">{position.symbol}</h3>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {position.exchange}
            </span>
            {assessment.decision_changed && (
              <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded animate-pulse">
                CHANGED
              </span>
            )}
          </div>
          
          <div className="flex items-baseline gap-4 mb-3">
            <span className="text-2xl font-mono text-white">
              ₹{position.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span className={`flex items-center gap-1 text-sm font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              ₹{Math.abs(position.unrealized_pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              <span className="text-xs opacity-75">
                ({position.unrealized_pnl_percent.toFixed(2)}%)
              </span>
            </span>
          </div>
          
          {/* Rationale */}
          <p className="text-sm text-gray-400 mb-2">
            {assessment.rationale}
          </p>
          
          {/* Yesterday vs Today */}
          {assessment.yesterday_decision && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Yesterday:</span>
              <DecisionBadge decision={assessment.yesterday_decision} />
              <ArrowRight className="w-3 h-3" />
              <span>Today:</span>
              <DecisionBadge decision={assessment.today_decision} />
            </div>
          )}
        </div>
        
        {/* Right: Decision and Action */}
        <div className="flex flex-col items-end gap-3">
          <DecisionBadge decision={assessment.today_decision} />
          
          {requiresAction && (
            <button
              onClick={() => onExecute(position, assessment.today_decision)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm rounded-lg transition-colors"
            >
              <Activity className="w-4 h-4" />
              Execute {assessment.today_decision}
            </button>
          )}
          
          <div className="text-xs text-gray-500 text-right">
            <div>{position.quantity} shares @ ₹{position.average_cost.toLocaleString('en-IN')}</div>
            <div>Value: ₹{position.current_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

function EmptyPortfolioState({ onInitialize }: { onInitialize: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-6">
        <Target className="w-12 h-12 text-amber-400" />
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-2">
        No Positions Yet
      </h2>
      
      <p className="text-gray-400 max-w-md mb-6">
        You need to initialize a paper portfolio before FinVest can provide daily recommendations.
        This will create a simulated portfolio with starter capital.
      </p>
      
      <button
        onClick={onInitialize}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold rounded-lg transition-all shadow-lg shadow-amber-500/20"
      >
        <PlayCircle className="w-5 h-5" />
        Initialize Paper Portfolio
      </button>
      
      <p className="text-xs text-gray-500 mt-4">
        Paper mode only. No real money will be used.
      </p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DailyCommandCenter() {
  const navigate = useNavigate();
  
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [assessments, setAssessments] = useState<DailyAssessmentSummary[]>([]);
  const [summary, setSummary] = useState<{
    total_value: number;
    total_pnl: number;
    total_pnl_percent: number;
    position_count: number;
    requires_action_count: number;
    hold_count: number;
    last_updated: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [executing, setExecuting] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [posResult, assessResult, summaryResult] = await Promise.all([
        PositionDataAdapter.getOpenPositions(),
        PositionDataAdapter.getDailyAssessments(),
        PositionDataAdapter.getPortfolioSummary()
      ]);
      
      if (posResult.status === 'success' && posResult.data) {
        setPositions(posResult.data);
      } else {
        setPositions([]);
      }
      
      if (assessResult.status === 'success' && assessResult.data) {
        setAssessments(assessResult.data);
      } else {
        setAssessments([]);
      }
      
      if (summaryResult.status === 'success' && summaryResult.data) {
        setSummary(summaryResult.data);
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load position data');
      console.error('Failed to load position data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 300000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Handle execution (PAPER mode)
  const handleExecute = async (position: PositionData, action: PositionDecision) => {
    setExecuting(position.position_id);
    
    try {
      // Call ExecutionService in PAPER mode
      const result: PaperExecutionResult = await ExecutionService.execute({
        position_id: position.position_id,
        symbol: position.symbol,
        action: action,
        quantity: position.quantity,
        current_price: position.current_price,
        rationale: `User executed ${action} from Daily Command Center`
      });
      
      // Show result
      if (result.status === 'WOULD_HAVE_EXECUTED') {
        alert(`✓ PAPER MODE EXECUTION\n\n${result.message}\n\nNo real trade was placed.`);
      } else if (result.status === 'BLOCKED') {
        alert(`⚠️ EXECUTION BLOCKED\n\nReason: ${result.details.block_reason}\n\nNo action taken.`);
      } else {
        alert(`❌ EXECUTION FAILED\n\n${result.message}`);
      }
      
      // Refresh data
      await loadData();
    } catch (err) {
      console.error('Execution failed:', err);
      alert('Execution failed. See console for details.');
    } finally {
      setExecuting(null);
    }
  };

  // Handle execute all required actions
  const handleExecuteAll = async () => {
    const actionsRequired = positions.filter(p => {
      const assessment = assessments.find(a => a.position_id === p.position_id);
      return assessment?.requires_action;
    });
    
    if (actionsRequired.length === 0) {
      alert('No actions required today.');
      return;
    }
    
    const confirmMessage = actionsRequired.map(p => {
      const assessment = assessments.find(a => a.position_id === p.position_id);
      return `${assessment?.today_decision} ${p.symbol}`;
    }).join('\n');
    
    if (confirm(`[PAPER MODE]\n\nExecute all required actions?\n\n${confirmMessage}`)) {
      // Build execution requests
      const requests = actionsRequired.map(position => {
        const assessment = assessments.find(a => a.position_id === position.position_id);
        return {
          position_id: position.position_id,
          symbol: position.symbol,
          action: assessment?.today_decision || 'HOLD',
          quantity: position.quantity,
          current_price: position.current_price,
          rationale: assessment?.rationale || 'Bulk execution from Daily Command Center'
        };
      }).filter(r => r.action !== 'HOLD' && r.action !== 'AVOID');
      
      // Execute all
      const results = await ExecutionService.executeAll(requests);
      
      // Show summary
      const executed = results.filter(r => r.status === 'WOULD_HAVE_EXECUTED').length;
      const blocked = results.filter(r => r.status === 'BLOCKED').length;
      
      alert(`✓ BULK EXECUTION COMPLETE\n\nWould have executed: ${executed}\nBlocked: ${blocked}\n\nNo real trades were placed.`);
      
      // Refresh data
      await loadData();
    }
  };

  // Handle initialize portfolio
  const handleInitializePortfolio = () => {
    navigate('/portfolio');
  };

  // Refresh
  const handleRefresh = () => {
    PositionDataAdapter.clearCache();
    loadData();
  };

  // Get position rows
  const positionRows: PositionRow[] = positions.map(position => ({
    position,
    assessment: assessments.find(a => a.position_id === position.position_id) || {
      position_id: position.position_id,
      symbol: position.symbol,
      date: new Date().toISOString().split('T')[0],
      today_decision: position.last_decision,
      yesterday_decision: null,
      decision_changed: false,
      rationale: position.last_decision_reason,
      requires_action: position.last_decision === 'REDUCE' || position.last_decision === 'EXIT',
      news_impact: null,
      confidence: 75
    }
  }));

  // Sort: Action required first, then by P&L
  const sortedRows = [...positionRows].sort((a, b) => {
    if (a.assessment.requires_action && !b.assessment.requires_action) return -1;
    if (!a.assessment.requires_action && b.assessment.requires_action) return 1;
    return b.position.unrealized_pnl - a.position.unrealized_pnl;
  });

  const actionsRequired = positionRows.filter(r => r.assessment.requires_action);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-gray-400">Loading Daily Command Center...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="w-16 h-16 text-red-400" />
          <h2 className="text-xl font-bold text-white">Failed to Load</h2>
          <p className="text-gray-400">{error}</p>
          <button 
            onClick={handleRefresh}
            className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (positions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-6">
        <EmptyPortfolioState onInitialize={handleInitializePortfolio} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Daily Command Center</h1>
          <p className="text-gray-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Last updated: {lastRefresh.toLocaleTimeString()}
            <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              PAPER MODE
            </span>
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Portfolio Value</p>
            <p className="text-xl font-bold text-white">
              ₹{summary.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Unrealized P&L</p>
            <p className={`text-xl font-bold ${summary.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{summary.total_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              <span className="text-sm ml-1">({summary.total_pnl_percent.toFixed(2)}%)</span>
            </p>
          </div>
          
          <div className="rounded-xl bg-gray-900/50 border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Open Positions</p>
            <p className="text-xl font-bold text-white">
              {summary.position_count}
              <span className="text-sm text-gray-400 ml-1">({summary.hold_count} HOLD)</span>
            </p>
          </div>
          
          <div className={`rounded-xl p-4 ${actionsRequired.length > 0 
            ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30' 
            : 'bg-gray-900/50 border border-gray-800'}`}
          >
            <p className="text-xs text-gray-500 mb-1">Actions Required</p>
            <p className={`text-xl font-bold ${actionsRequired.length > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              {actionsRequired.length}
              {actionsRequired.length === 0 && (
                <CheckCircle className="w-5 h-5 inline ml-2" />
              )}
            </p>
          </div>
        </div>
      )}

      {/* Action Required Banner */}
      {actionsRequired.length > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400" />
              <div>
                <p className="text-amber-400 font-bold">
                  {actionsRequired.length} position{actionsRequired.length > 1 ? 's' : ''} require{actionsRequired.length === 1 ? 's' : ''} action today
                </p>
                <p className="text-sm text-gray-400">
                  Review and execute the required actions below
                </p>
              </div>
            </div>
            
            <button
              onClick={handleExecuteAll}
              disabled={executing !== null}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <Activity className="w-5 h-5" />
              Execute All Required Actions
            </button>
          </div>
        </div>
      )}

      {/* Nothing to do banner */}
      {actionsRequired.length === 0 && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <p className="text-green-400 font-bold">Nothing to do today</p>
              <p className="text-sm text-gray-400">
                All positions are on HOLD. No action required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Positions List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Open Positions</h2>
        
        {sortedRows.map(row => (
          <PositionRowCard
            key={row.position.position_id}
            position={row.position}
            assessment={row.assessment}
            onExecute={handleExecute}
          />
        ))}
      </div>
    </div>
  );
}

