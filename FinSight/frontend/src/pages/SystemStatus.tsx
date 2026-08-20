/**
 * SystemStatus - Brutally Honest Debug Page
 * 
 * PHASE 36: System Reality Check (SRC)
 * 
 * PURPOSE:
 * Show raw system truth. No charts. No styling. Just facts.
 * 
 * SHOWS:
 * - Authority layers (ON / BLOCKED / FAILED)
 * - Decision counts
 * - Last 10 audit events
 * - Current silence mode
 * - Confidence discipline state
 * - Ethics permanent blocks
 */

import React, { useState, useEffect } from 'react';
import { getSystemExecutionMap, SystemHealthStatus, ExecutionPathResult } from '../debug/SystemExecutionMap';
import { getAuthorityScenarioRunner, ScenarioResult } from '../debug/AuthorityScenarioRunner';
import { getHumanOverrideProtocol } from '../override/HumanOverrideProtocol';
import { getExecutionEthicsFirewall } from '../ethics/ExecutionEthicsFirewall';
import { getCounterfactualLedger } from '../counterfactual/CounterfactualLedger';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { SelfLimitGuard } from '../limits/SelfLimitGuard';
import { getInfluenceBudgetEngine } from '../limits/InfluenceBudgetEngine';
import { getCentralityRiskEngine } from '../limits/CentralityRiskEngine';
import { ShutdownGovernanceEngine, ShutdownGuard } from '../shutdown';

const SystemStatus: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [probeResults, setProbeResults] = useState<ExecutionPathResult[] | null>(null);
  const [scenarioResults, setScenarioResults] = useState<ScenarioResult[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [overrideStats, setOverrideStats] = useState<any>(null);
  const [counterfactualStats, setCounterfactualStats] = useState<any>(null);
  const [isRunningScenarios, setIsRunningScenarios] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  
  useEffect(() => {
    refreshSystemStatus();
  }, []);
  
  const refreshSystemStatus = () => {
    try {
      // Get system health
      const map = getSystemExecutionMap();
      setHealth(map.getSystemHealth());
      
      // Probe a test snapshot
      const testSnapshotId = `probe-test-${Date.now()}`;
      const probeResult = map.probe(testSnapshotId);
      setProbeResults([...probeResult.paths]);
      
      // Get override stats
      const override = getHumanOverrideProtocol();
      setOverrideStats(override.getOverrideStatistics());
      
      // Get counterfactual stats
      const ledger = getCounterfactualLedger();
      setCounterfactualStats(ledger.getSummary());
      
      // Get audit events (last 10)
      const audit = DecisionAuditLog.getInstance();
      const events = audit.getRecentEvents ? audit.getRecentEvents(10) : [];
      setAuditEvents(events);
    } catch (e) {
      console.error('Failed to refresh system status:', e);
    }
  };
  
  const runScenarios = () => {
    setIsRunningScenarios(true);
    setScenarioError(null);
    
    try {
      const runner = getAuthorityScenarioRunner();
      const result = runner.runAllScenarios();
      setScenarioResults([...result.scenarios]);
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunningScenarios(false);
    }
  };
  
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace', 
      backgroundColor: '#0a0a0a', 
      color: '#00ff00',
      minHeight: '100vh'
    }}>
      <h1 style={{ borderBottom: '2px solid #00ff00', paddingBottom: '10px' }}>
        SYSTEM STATUS — RAW TRUTH
      </h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={refreshSystemStatus}
          style={{ 
            padding: '10px 20px', 
            marginRight: '10px',
            backgroundColor: '#003300',
            color: '#00ff00',
            border: '1px solid #00ff00',
            cursor: 'pointer',
            fontFamily: 'monospace'
          }}
        >
          REFRESH STATUS
        </button>
        <button 
          onClick={runScenarios}
          disabled={isRunningScenarios}
          style={{ 
            padding: '10px 20px',
            backgroundColor: isRunningScenarios ? '#333' : '#330000',
            color: isRunningScenarios ? '#666' : '#ff0000',
            border: '1px solid #ff0000',
            cursor: isRunningScenarios ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace'
          }}
        >
          {isRunningScenarios ? 'RUNNING...' : 'RUN SCENARIO TESTS'}
        </button>
      </div>
      
      {/* SYSTEM HEALTH */}
      <Section title="SYSTEM HEALTH">
        {health ? (
          <pre style={{ margin: 0 }}>
{`STATUS: ${health.status}
CHECKED_AT: ${health.checked_at}

DECISIONS:
  Active:       ${health.active_decisions}
  Suppressed:   ${health.suppressed_decisions}
  Overridden:   ${health.overridden_decisions}

ETHICS:
  Permanent Blocks: ${health.permanent_ethics_blocks}

CONFIDENCE:
  Discipline State: ${health.confidence_discipline_state}

SILENCE:
  Mode Active: ${health.silence_mode_active ? 'YES' : 'NO'}`}
          </pre>
        ) : (
          <pre>Loading...</pre>
        )}
      </Section>
      
      {/* OVERRIDE STATISTICS */}
      <Section title="OVERRIDE STATISTICS">
        {overrideStats ? (
          <pre style={{ margin: 0 }}>
{`TOTAL OVERRIDES: ${overrideStats.total_overrides}
HUMAN RIGHT:     ${overrideStats.human_right_count}
HUMAN WRONG:     ${overrideStats.human_wrong_count}
PENDING:         ${overrideStats.pending_count}
OVERRIDE PENALTY: ${overrideStats.override_penalty}`}
          </pre>
        ) : (
          <pre>Loading...</pre>
        )}
      </Section>
      
      {/* COUNTERFACTUAL STATISTICS */}
      <Section title="COUNTERFACTUAL LEDGER">
        {counterfactualStats ? (
          <pre style={{ margin: 0 }}>
{`TOTAL SUPPRESSIONS:    ${counterfactualStats.total_suppressions}
WITH COUNTERFACTUALS:  ${counterfactualStats.with_counterfactuals}
SYSTEM RIGHT:          ${counterfactualStats.system_right_count}
SYSTEM WRONG:          ${counterfactualStats.system_wrong_count}
AMBIGUOUS:             ${counterfactualStats.ambiguous_count}

FINANCIAL IMPACT:
  Opportunity Cost:  ${counterfactualStats.total_opportunity_cost}
  Regret Avoided:    ${counterfactualStats.total_regret_avoided}
  Net Impact:        ${counterfactualStats.net_suppression_impact}`}
          </pre>
        ) : (
          <pre>Loading...</pre>
        )}
      </Section>
      
      {/* EXECUTION PATH PROBES */}
      <Section title="EXECUTION PATH PROBES">
        {probeResults ? (
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            marginTop: '10px'
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #00ff00' }}>
                <th style={{ textAlign: 'left', padding: '5px' }}>PATH</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>ALLOWED</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>BLOCKED_BY</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>TIME_MS</th>
              </tr>
            </thead>
            <tbody>
              {probeResults.map((result, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #003300' }}>
                  <td style={{ padding: '5px' }}>{result.path}</td>
                  <td style={{ 
                    padding: '5px',
                    color: result.allowed ? '#00ff00' : '#ff0000'
                  }}>
                    {result.allowed ? 'YES' : 'NO'}
                  </td>
                  <td style={{ padding: '5px', color: '#ffff00' }}>
                    {result.blocked_by?.join(', ') || '-'}
                  </td>
                  <td style={{ padding: '5px' }}>{result.execution_time_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre>Loading...</pre>
        )}
      </Section>
      
      {/* SCENARIO TEST RESULTS */}
      <Section title="SCENARIO TEST RESULTS">
        {scenarioError && (
          <pre style={{ color: '#ff0000', marginBottom: '10px' }}>
            ERROR: {scenarioError}
          </pre>
        )}
        {scenarioResults ? (
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            marginTop: '10px'
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #00ff00' }}>
                <th style={{ textAlign: 'left', padding: '5px' }}>SCENARIO</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>PASSED</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>ACTUAL</th>
                <th style={{ textAlign: 'left', padding: '5px' }}>TIME_MS</th>
              </tr>
            </thead>
            <tbody>
              {scenarioResults.map((result, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #003300' }}>
                  <td style={{ padding: '5px' }}>{result.scenario}</td>
                  <td style={{ 
                    padding: '5px',
                    color: result.passed ? '#00ff00' : '#ff0000'
                  }}>
                    {result.passed ? 'PASS' : 'FAIL'}
                  </td>
                  <td style={{ padding: '5px' }}>{result.actual_behavior}</td>
                  <td style={{ padding: '5px' }}>{result.execution_time_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre style={{ color: '#666' }}>
            Click "RUN SCENARIO TESTS" to verify system behavior
          </pre>
        )}
      </Section>
      
      {/* LAST 10 AUDIT EVENTS */}
      <Section title="LAST 10 AUDIT EVENTS">
        {auditEvents.length > 0 ? (
          <pre style={{ margin: 0 }}>
            {auditEvents.map((event, i) => (
              `[${i + 1}] ${event.event_type || 'UNKNOWN'} - ${event.summary || 'No summary'}\n`
            )).join('')}
          </pre>
        ) : (
          <pre style={{ color: '#666' }}>No audit events available</pre>
        )}
      </Section>
      
      {/* SELF-LIMITING STATUS (PHASE 38) */}
      <Section title="SELF-LIMITING GROWTH (PHASE 38)">
        <SelfLimitingDisplay />
      </Section>
      
      {/* SHUTDOWN STATUS (PHASE 39) */}
      <Section title="SHUTDOWN GOVERNANCE (PHASE 39)">
        <ShutdownDisplay />
      </Section>
      
      {/* AUTHORITY LAYER STATUS */}
      <Section title="AUTHORITY LAYERS">
        <pre style={{ margin: 0 }}>
{`LAYER                     STATUS
─────────────────────────────────────
ShutdownGovernanceEngine  ${getLayerStatus('shutdown')}
DecisionLifecycleEngine   ${getLayerStatus('lifecycle')}
ExecutionEthicsFirewall   ${getLayerStatus('ethics')}
QuestionFirstGovernor     ${getLayerStatus('silence')}
HumanOverrideProtocol     ${getLayerStatus('override')}
TemporalReservationEngine ${getLayerStatus('reservation')}
ConflictResolutionEngine  ${getLayerStatus('conflict')}
CounterfactualLedger      ${getLayerStatus('counterfactual')}
InfluenceBudgetEngine     ${getLayerStatus('influence')}
CentralityRiskEngine      ${getLayerStatus('centrality')}`}
        </pre>
      </Section>
      
      <div style={{ 
        marginTop: '40px', 
        borderTop: '2px solid #00ff00', 
        paddingTop: '20px',
        color: '#666'
      }}>
        <pre>
{`PHASE 36 — SYSTEM REALITY CHECK
No charts. No styling. Raw truth.
Last updated: ${new Date().toISOString()}`}
        </pre>
      </div>
    </div>
  );
};

// Helper function to check layer status
const getLayerStatus = (layer: string): string => {
  try {
    switch (layer) {
      case 'shutdown':
        const shutdownState = ShutdownGovernanceEngine.getState();
        if (shutdownState.is_terminal) return 'TERMINAL';
        if (!shutdownState.is_alive) return shutdownState.mode;
        return 'ON';
      case 'lifecycle':
        getSystemExecutionMap();
        return 'ON';
      case 'ethics':
        getExecutionEthicsFirewall();
        return 'ON';
      case 'silence':
        return 'ON';
      case 'override':
        getHumanOverrideProtocol();
        return 'ON';
      case 'reservation':
        return 'ON';
      case 'conflict':
        return 'ON';
      case 'counterfactual':
        getCounterfactualLedger();
        return 'ON';
      case 'influence':
        getInfluenceBudgetEngine();
        return 'ON';
      case 'centrality':
        getCentralityRiskEngine();
        return 'ON';
      default:
        return 'UNKNOWN';
    }
  } catch {
    return 'FAILED';
  }
};

// Self-Limiting Display Component
const SelfLimitingDisplay: React.FC = () => {
  const status = SelfLimitGuard.getStatus();
  const budgetEngine = getInfluenceBudgetEngine();
  const centralityEngine = getCentralityRiskEngine();
  
  const metrics = budgetEngine.getMetrics();
  const selfLimitEvents = budgetEngine.getSelfLimitEvents(5);
  
  return (
    <div>
      <pre style={{ margin: 0 }}>
{`INFLUENCE BUDGET:
  Daily:   ${status.budget.daily.remaining_events}/${status.budget.daily.max_advice_events} remaining
  Weekly:  ${status.budget.weekly.remaining_events}/${status.budget.weekly.max_advice_events} remaining
  Monthly: ${status.budget.monthly.remaining_events}/${status.budget.monthly.max_advice_events} remaining

CENTRALITY RISK:
  Score:   ${status.centrality.risk.score}/100
  State:   ${status.centrality.risk.state}
  Silence: ${status.centrality.force_silence ? 'FORCED' : 'NOT FORCED'}

CURRENT METRICS:
  Trust Score:      ${metrics.trust_score}
  Adoption Rate:    ${(metrics.adoption_rate * 100).toFixed(0)}%
  Acceptance Rate:  ${(metrics.acceptance_rate * 100).toFixed(0)}%

CAN ADVISE: ${status.can_advise ? 'YES' : 'NO'}
${status.silence_reason ? `SILENCE REASON: ${status.silence_reason}` : ''}`}
      </pre>
      
      {status.centrality.risk.state !== 'NORMAL' && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: status.centrality.risk.state === 'CRITICAL' ? '#330000' : '#333300',
          border: `1px solid ${status.centrality.risk.state === 'CRITICAL' ? '#ff0000' : '#ffff00'}`
        }}>
          <strong style={{ color: status.centrality.risk.state === 'CRITICAL' ? '#ff0000' : '#ffff00' }}>
            CENTRALITY WARNING
          </strong>
          <p style={{ margin: '5px 0 0 0' }}>{status.centrality.explanation}</p>
        </div>
      )}
      
      {selfLimitEvents.length > 0 && (
        <div style={{ marginTop: '15px' }}>
          <strong>RECENT SELF-LIMIT EVENTS:</strong>
          <pre style={{ margin: '5px 0 0 0', color: '#ff8800' }}>
{selfLimitEvents.map((e, i) => 
  `[${i + 1}] ${e.reason} - ${e.details} (${e.timestamp})\n`
).join('')}
          </pre>
        </div>
      )}
      
      <div style={{ marginTop: '15px', color: '#666', fontStyle: 'italic' }}>
        Note: Self-limiting cannot be overridden. This is structural, not configurable.
      </div>
    </div>
  );
};

// Shutdown Display Component (Phase 39)
const ShutdownDisplay: React.FC = () => {
  const state = ShutdownGovernanceEngine.getState();
  const metrics = ShutdownGovernanceEngine.getMetrics();
  const history = ShutdownGovernanceEngine.getHistory();
  
  const modeColor = {
    'NONE': '#00ff00',
    'SOFT_SHUTDOWN': '#ffff00',
    'HARD_SHUTDOWN': '#ff8800',
    'ABSOLUTE_SHUTDOWN': '#ff0000'
  }[state.mode];
  
  return (
    <div>
      <pre style={{ margin: 0 }}>
{`CURRENT MODE: `}<span style={{ color: modeColor, fontWeight: 'bold' }}>{state.mode}</span>
{`
MODE ENTERED: ${state.mode_entered_at}
TRIGGER:      ${state.trigger || 'N/A'}
TRIGGERED BY: ${state.triggered_by || 'N/A'}
REASON:       ${state.reason || 'N/A'}

STATUS:
  Is Alive:     ${state.is_alive ? 'YES' : 'NO'}
  Can Advise:   ${state.can_advise ? 'YES' : 'NO'}
  Can Audit:    ${state.can_audit ? 'YES' : 'NO'}
  Is Terminal:  ${state.is_terminal ? 'YES' : 'NO'}

AUTO-SHUTDOWN METRICS:
  Ethics ABSOLUTE Count:    ${metrics.ethics_absolute_count}/5 (threshold)
  Centrality CRITICAL Days: ${metrics.centrality_critical_days}/30 (threshold)`}
      </pre>
      
      {state.mode === 'ABSOLUTE_SHUTDOWN' && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#330000',
          border: '2px solid #ff0000'
        }}>
          <strong style={{ color: '#ff0000', fontSize: '16px' }}>
            ⚠️ ABSOLUTE SHUTDOWN - SYSTEM IS PERMANENTLY INERT
          </strong>
          <p style={{ margin: '10px 0 0 0', color: '#ff6666' }}>
            No operations are possible. No recovery path exists.
            This is IRREVERSIBLE by design.
          </p>
        </div>
      )}
      
      {state.mode === 'HARD_SHUTDOWN' && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#332200',
          border: '1px solid #ff8800'
        }}>
          <strong style={{ color: '#ff8800' }}>
            HARD SHUTDOWN ACTIVE
          </strong>
          <p style={{ margin: '10px 0 0 0' }}>
            All outputs disabled. Only audit read access remains.
          </p>
        </div>
      )}
      
      {state.mode === 'SOFT_SHUTDOWN' && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#333300',
          border: '1px solid #ffff00'
        }}>
          <strong style={{ color: '#ffff00' }}>
            SOFT SHUTDOWN ACTIVE
          </strong>
          <p style={{ margin: '10px 0 0 0' }}>
            Advisory functions disabled. Audit access remains.
          </p>
        </div>
      )}
      
      {history.length > 0 && (
        <div style={{ marginTop: '15px' }}>
          <strong>SHUTDOWN HISTORY:</strong>
          <pre style={{ margin: '5px 0 0 0', color: '#ff8800' }}>
{history.map((h, i) => 
  `[${i + 1}] ${h.previous_mode} → ${h.new_mode} | ${h.trigger} | ${h.timestamp}\n`
).join('')}
          </pre>
        </div>
      )}
      
      <div style={{ marginTop: '15px', color: '#666', fontStyle: 'italic' }}>
        Note: Shutdown modes can only move FORWARD. ABSOLUTE is terminal and irreversible.
      </div>
    </div>
  );
};

// Section component
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ 
    marginBottom: '30px',
    border: '1px solid #003300',
    padding: '15px'
  }}>
    <h2 style={{ 
      margin: '0 0 15px 0', 
      fontSize: '14px',
      color: '#00ff00',
      borderBottom: '1px solid #003300',
      paddingBottom: '5px'
    }}>
      ▸ {title}
    </h2>
    {children}
  </div>
);

export default SystemStatus;

