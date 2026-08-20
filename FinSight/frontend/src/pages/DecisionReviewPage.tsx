/**
 * DecisionReviewPage - Decision Consequence View
 * 
 * PHASE 20: Consequence Engine (NO ESCAPE)
 * 
 * Route: /decision-review/:id
 * 
 * RULES (NON-NEGOTIABLE):
 * - Side-by-side comparison
 * - Numbers only
 * - No narratives without data
 * - Shows: What FinVest said, What user did, What happened, Who was right
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, AlertTriangle, CheckCircle, XCircle, 
  TrendingUp, TrendingDown, Minus, RefreshCw,
  Calendar, DollarSign, Percent, Target
} from 'lucide-react';
import { getConsequenceAuthority, MandatoryConsequence } from '../analysis/ConsequenceAuthority';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { DecisionSnapshotManager, DecisionSnapshot, verifySnapshotIntegrity } from '../core/DecisionSnapshot';
import { ConsequenceAnalysis, ScenarioOutcome } from '../analysis/ConsequenceEngine';

export default function DecisionReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [snapshot, setSnapshot] = useState<DecisionSnapshot | null>(null);
  const [consequence, setConsequence] = useState<MandatoryConsequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrityValid, setIntegrityValid] = useState(true);
  
  useEffect(() => {
    if (!id) {
      setError('No decision ID provided');
      setLoading(false);
      return;
    }
    
    try {
      const snapshotManager = DecisionSnapshotManager.getInstance();
      const consequenceAuthority = getConsequenceAuthority();
      const snapshotAuthority = getSnapshotAuthority();
      
      // Get snapshot
      const snap = snapshotManager.getSnapshot(id);
      if (!snap) {
        setError(`Decision ${id} not found`);
        setLoading(false);
        return;
      }
      
      // Verify integrity
      const isValid = verifySnapshotIntegrity(snap);
      setIntegrityValid(isValid);
      if (!isValid) {
        setError('Decision snapshot integrity compromised. Data may have been tampered with.');
      }
      
      setSnapshot(snap);
      
      // Get consequence
      const cons = consequenceAuthority.getMandatoryConsequence(id);
      setConsequence(cons);
      
      setLoading(false);
    } catch (e) {
      setError(`Error loading decision: ${String(e)}`);
      setLoading(false);
    }
  }, [id]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e14] text-white flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }
  
  if (error && !snapshot) {
    return (
      <div className="min-h-screen bg-[#0a0e14] text-white p-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        
        <div className="max-w-2xl mx-auto text-center py-16">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Decision Not Found</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }
  
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `₹${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };
  
  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  };
  
  const getVerdictColor = (who: string) => {
    switch (who) {
      case 'FINVEST': return 'text-green-400';
      case 'USER': return 'text-blue-400';
      case 'TIE': return 'text-yellow-400';
      case 'BOTH_WRONG': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };
  
  const getVerdictIcon = (who: string) => {
    switch (who) {
      case 'FINVEST': return <CheckCircle className="w-6 h-6 text-green-400" />;
      case 'USER': return <CheckCircle className="w-6 h-6 text-blue-400" />;
      case 'TIE': return <Minus className="w-6 h-6 text-yellow-400" />;
      case 'BOTH_WRONG': return <XCircle className="w-6 h-6 text-red-400" />;
      default: return <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />;
    }
  };
  
  const renderScenarioCard = (
    title: string, 
    scenario: ScenarioOutcome | null,
    isWinner: boolean,
    color: string
  ) => {
    if (!scenario) {
      return (
        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-gray-400 mb-4">{title}</h3>
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <p>Data not available</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className={`bg-gray-800/50 rounded-lg p-6 border ${isWinner ? `border-${color}-500` : 'border-gray-700'} relative`}>
        {isWinner && (
          <div className={`absolute -top-3 left-4 px-3 py-1 bg-${color}-500 text-white text-xs font-bold rounded`}>
            BEST OUTCOME
          </div>
        )}
        
        <h3 className={`text-lg font-bold ${isWinner ? `text-${color}-400` : 'text-white'} mb-4`}>
          {title}
        </h3>
        
        <p className="text-sm text-gray-400 mb-4">{scenario.description}</p>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Initial Value</span>
            <span className="font-mono">{formatCurrency(scenario.initial_value)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Final Value</span>
            <span className="font-mono">{formatCurrency(scenario.final_value)}</span>
          </div>
          
          <div className="border-t border-gray-700 pt-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Absolute Change</span>
              <span className={`font-mono ${scenario.absolute_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(scenario.absolute_change)}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Percent Change</span>
            <span className={`font-mono ${scenario.percent_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(scenario.percent_change)}
            </span>
          </div>
          
          <div className="border-t border-gray-700 pt-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Tax Incurred</span>
              <span className="font-mono text-orange-400">
                {formatCurrency(scenario.tax_incurred)}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">After-Tax Value</span>
            <span className="font-mono font-bold">{formatCurrency(scenario.after_tax_value)}</span>
          </div>
          
          <div className="flex justify-between text-lg font-bold">
            <span className="text-gray-400">After-Tax Return</span>
            <span className={`font-mono ${scenario.after_tax_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(scenario.after_tax_return)}
            </span>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-[#0a0e14] text-white p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Decision Review</h1>
            <p className="text-gray-400 font-mono text-sm">{id}</p>
          </div>
          
          {!integrityValid && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-medium">Integrity Compromised</span>
            </div>
          )}
        </div>
        
        {/* Snapshot Info */}
        {snapshot && (
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700 mb-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Created</div>
                <div className="font-medium">
                  {new Date(snapshot.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Source</div>
                <div className="font-medium">{snapshot.source}</div>
              </div>
              <div>
                <div className="text-gray-400">Context Status</div>
                <div className={`font-medium ${
                  snapshot.context_status === 'VALID' ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {snapshot.context_status}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Holdings</div>
                <div className="font-medium">{snapshot.inputs.portfolio_holdings_count}</div>
              </div>
              <div>
                <div className="text-gray-400">Integrity</div>
                <div className={`font-medium ${integrityValid ? 'text-green-400' : 'text-red-400'}`}>
                  {integrityValid ? 'VALID' : 'INVALID'}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* What FinVest Said */}
        {snapshot && snapshot.outputs.length > 0 && (
          <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-500/30 mb-8">
            <h2 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              What FinVest Recommended
            </h2>
            
            <div className="space-y-4">
              {snapshot.outputs.map((output, i) => (
                <div key={i} className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${
                        output.action === 'BUY' || output.action === 'INITIATE' 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : output.action === 'SELL' || output.action === 'EXIT'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {output.action}
                      </span>
                      {output.symbol && (
                        <span className="text-xl font-bold text-white">{output.symbol}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">{output.confidence}%</div>
                      <div className="text-xs text-gray-400">Confidence</div>
                    </div>
                  </div>
                  
                  {output.reasoning.length > 0 && (
                    <div className="mt-4 border-t border-gray-700 pt-4">
                      <div className="text-sm text-gray-400 mb-2">Reasoning:</div>
                      <ul className="space-y-1 text-sm">
                        {output.reasoning.map((reason, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span className="text-gray-300">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {output.expected_return !== undefined && (
                    <div className="mt-4 grid grid-cols-3 gap-4 bg-gray-800 rounded-lg p-3">
                      <div>
                        <div className="text-xs text-gray-400">Expected Return</div>
                        <div className={`font-bold ${
                          (output.expected_return || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {formatPercent(output.expected_return)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Tax Impact</div>
                        <div className="font-bold text-orange-400">
                          {formatCurrency(output.expected_tax_impact)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Post-Tax Return</div>
                        <div className={`font-bold ${
                          (output.post_tax_return || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {formatPercent(output.post_tax_return)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Consequence Status */}
        {consequence && (
          <>
            {/* Verdict Banner */}
            <div className={`rounded-lg p-6 mb-8 border ${
              consequence.who_was_right === 'FINVEST' 
                ? 'bg-green-900/20 border-green-500/30'
                : consequence.who_was_right === 'USER'
                  ? 'bg-blue-900/20 border-blue-500/30'
                  : consequence.who_was_right === 'TIE'
                    ? 'bg-yellow-900/20 border-yellow-500/30'
                    : consequence.who_was_right === 'BOTH_WRONG'
                      ? 'bg-red-900/20 border-red-500/30'
                      : 'bg-gray-800/50 border-gray-700'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getVerdictIcon(consequence.who_was_right)}
                  <div>
                    <div className={`text-xl font-bold ${getVerdictColor(consequence.who_was_right)}`}>
                      {consequence.who_was_right === 'PENDING' 
                        ? 'Analysis Pending'
                        : consequence.who_was_right === 'TIE'
                          ? 'Tie - Similar Outcomes'
                          : consequence.who_was_right === 'BOTH_WRONG'
                            ? 'Both Wrong - Holding Was Better'
                            : `${consequence.who_was_right} Was Right`
                      }
                    </div>
                    <div className="text-gray-400">{consequence.verdict}</div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-gray-400">Regret Index</div>
                  <div className={`text-3xl font-bold ${
                    consequence.regret_index < 20 ? 'text-green-400'
                    : consequence.regret_index < 50 ? 'text-yellow-400'
                    : 'text-red-400'
                  }`}>
                    {consequence.regret_index.toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Scenario Comparison */}
            <h2 className="text-lg font-bold text-white mb-4">Side-by-Side Comparison</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {renderScenarioCard(
                'Do Nothing (Baseline)',
                consequence.baseline,
                consequence.who_was_right === 'BOTH_WRONG',
                'yellow'
              )}
              
              {renderScenarioCard(
                'Follow FinVest',
                consequence.finvest_recommendation,
                consequence.who_was_right === 'FINVEST',
                'green'
              )}
              
              {renderScenarioCard(
                'User Action',
                consequence.user_action,
                consequence.who_was_right === 'USER',
                'blue'
              )}
            </div>
            
            {/* Status & Missing Data */}
            {consequence.status !== 'COMPLETE' && (
              <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-500/30">
                <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
                  <AlertTriangle className="w-5 h-5" />
                  Incomplete Analysis
                </div>
                <p className="text-gray-300 text-sm mb-2">
                  Status: {consequence.status}
                </p>
                {consequence.missing_data.length > 0 && (
                  <ul className="text-sm text-gray-400">
                    {consequence.missing_data.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
        
        {!consequence && (
          <div className="bg-gray-800/30 rounded-lg p-8 border border-gray-700 text-center">
            <RefreshCw className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-400 mb-2">No Consequence Analysis Yet</h3>
            <p className="text-gray-500">
              Consequence tracking begins when the decision has measurable outcomes.
              Check back later for the full analysis.
            </p>
          </div>
        )}
        
        {/* Footer with Hash */}
        {snapshot && (
          <div className="mt-8 pt-6 border-t border-gray-700">
            <div className="text-xs text-gray-500 font-mono">
              <div>Snapshot ID: {snapshot.id}</div>
              <div>Integrity Hash: {snapshot.integrity_hash}</div>
              <div>Context ID: {snapshot.decision_context_id}</div>
              <div>Generated: {snapshot.created_at}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

