/**
 * AuditDecision - Auditor-Facing UI (READ-ONLY)
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * Route: /audit/decision/:snapshotId
 * 
 * SHOWS:
 * - Timeline (created → terminal)
 * - All gates encountered (pass/fail)
 * - Exact reason each alternative died
 * - Who acted last (system / human)
 * - Whether the system agrees with outcome (counterfactual)
 * 
 * No charts. No marketing. No soft language.
 * This UI is hostile by design.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getDecisionReconstructionEngine, 
  DataSourceStatus 
} from '../audit/DecisionReconstructionEngine';
import { 
  DecisionForensicsPack, 
  LifecycleTransition,
  AlternativeHistoryProof,
  validateForensicsPack,
  ForensicsPackValidation
} from '../audit/DecisionForensicsPack';
import { AuditMode, getAuditModeState, AuditModeState } from '../audit/AuditMode';

const AuditDecision: React.FC = () => {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const navigate = useNavigate();
  
  const [pack, setPack] = useState<DecisionForensicsPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ForensicsPackValidation | null>(null);
  const [dataSources, setDataSources] = useState<DataSourceStatus | null>(null);
  const [auditModeState, setAuditModeState] = useState<AuditModeState | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (snapshotId) {
      loadForensicsPack(snapshotId);
    }
  }, [snapshotId]);
  
  const loadForensicsPack = async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const engine = getDecisionReconstructionEngine();
      
      // Check data sources
      const sources = engine.checkDataSources(id);
      setDataSources(sources);
      
      // Get audit mode state
      setAuditModeState(getAuditModeState());
      
      // Attempt reconstruction
      const forensicsPack = engine.reconstruct(id);
      setPack(forensicsPack);
      
      // Validate
      const validationResult = validateForensicsPack(forensicsPack);
      setValidation(validationResult);
      
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPack(null);
    } finally {
      setLoading(false);
    }
  };
  
  const enableAuditMode = () => {
    AuditMode.enable('AUDITOR', 'Manual audit mode activation');
    setAuditModeState(getAuditModeState());
  };
  
  const disableAuditMode = () => {
    AuditMode.disable('AUDITOR', 'Manual audit mode deactivation');
    setAuditModeState(getAuditModeState());
  };
  
  return (
    <div style={styles.container}>
      <Header snapshotId={snapshotId} />
      
      {/* Audit Mode Control */}
      <Section title="AUDIT MODE CONTROL">
        <div style={styles.auditControl}>
          <span>
            Status: <strong style={{ color: auditModeState?.enabled ? '#ff0000' : '#00ff00' }}>
              {auditModeState?.enabled ? 'ENABLED' : 'DISABLED'}
            </strong>
          </span>
          {auditModeState?.enabled ? (
            <>
              <span> | Enabled by: {auditModeState.enabled_by}</span>
              <span> | Session: {auditModeState.session_id}</span>
              <button onClick={disableAuditMode} style={styles.buttonDanger}>
                DISABLE AUDIT MODE
              </button>
            </>
          ) : (
            <button onClick={enableAuditMode} style={styles.buttonPrimary}>
              ENABLE AUDIT MODE
            </button>
          )}
        </div>
        {auditModeState?.enabled && (
          <div style={styles.warning}>
            ⚠️ AUDIT MODE ACTIVE: All modification actions are BLOCKED. Only reconstruction and viewing allowed.
          </div>
        )}
      </Section>
      
      {loading && <Loading />}
      
      {error && <ErrorDisplay error={error} />}
      
      {!loading && !error && pack && (
        <>
          {/* Data Sources Status */}
          <Section title="DATA SOURCE STATUS">
            {dataSources && <DataSourcesTable sources={dataSources} />}
          </Section>
          
          {/* Validation Status */}
          <Section title="PACK VALIDATION">
            {validation && <ValidationStatus validation={validation} />}
          </Section>
          
          {/* Cryptographic Anchoring */}
          <Section title="CRYPTOGRAPHIC ANCHORING">
            <HashDisplay pack={pack} />
          </Section>
          
          {/* Responsibility Assignment */}
          <Section title="RESPONSIBILITY ASSIGNMENT">
            <ResponsibilityDisplay pack={pack} />
          </Section>
          
          {/* Lifecycle Timeline */}
          <Section title="LIFECYCLE TIMELINE">
            <LifecycleTimeline transitions={[...pack.lifecycle_history]} terminal={pack.terminal_state} />
          </Section>
          
          {/* Gates Encountered */}
          <Section title="GATES ENCOUNTERED">
            <GatesTable pack={pack} />
          </Section>
          
          {/* Suppressed Alternatives */}
          <Section title="SUPPRESSED ALTERNATIVES (Why Each Died)">
            <AlternativesTable alternatives={[...pack.suppressed_alternatives]} />
          </Section>
          
          {/* Ethics Verdicts */}
          <Section title="ETHICS VERDICTS">
            <EthicsTable verdicts={[...pack.ethics_verdicts]} />
          </Section>
          
          {/* Override Record */}
          {pack.override_record && (
            <Section title="HUMAN OVERRIDE RECORD">
              <OverrideDisplay record={pack.override_record} />
            </Section>
          )}
          
          {/* Counterfactual Analysis */}
          <Section title="COUNTERFACTUAL ANALYSIS">
            <CounterfactualDisplay outcomes={[...pack.counterfactual_outcomes]} />
          </Section>
          
          {/* Trust Impact */}
          <Section title="TRUST IMPACT">
            <TrustDisplay impact={pack.trust_impact} />
          </Section>
          
          {/* Audit Trail */}
          <Section title="AUDIT TRAIL">
            <AuditTrailTable events={[...pack.audit_trail]} />
          </Section>
          
          {/* Raw Pack Data */}
          <Section title="RAW FORENSICS PACK (JSON)">
            <pre style={styles.rawJson}>
              {JSON.stringify(pack, null, 2)}
            </pre>
          </Section>
        </>
      )}
    </div>
  );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const Header: React.FC<{ snapshotId?: string }> = ({ snapshotId }) => (
  <div style={styles.header}>
    <h1>FORENSIC AUDIT — DECISION RECONSTRUCTION</h1>
    <div style={styles.snapshotId}>Snapshot ID: {snapshotId || 'NONE'}</div>
    <div style={styles.disclaimer}>
      ⚠️ This interface is hostile by design. No marketing. No soft language. Only facts.
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>▸ {title}</h2>
    <div style={styles.sectionContent}>{children}</div>
  </div>
);

const Loading: React.FC = () => (
  <div style={styles.loading}>Reconstructing decision from ledgers...</div>
);

const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div style={styles.error}>
    <strong>RECONSTRUCTION FAILED</strong>
    <pre>{error}</pre>
  </div>
);

const DataSourcesTable: React.FC<{ sources: DataSourceStatus }> = ({ sources }) => (
  <table style={styles.table}>
    <thead>
      <tr>
        <th style={styles.th}>SOURCE</th>
        <th style={styles.th}>STATUS</th>
      </tr>
    </thead>
    <tbody>
      {Object.entries(sources).filter(([k]) => k !== '_frozen').map(([key, status]) => (
        <tr key={key}>
          <td style={styles.td}>{key.toUpperCase()}</td>
          <td style={{ 
            ...styles.td, 
            color: status === 'FOUND' ? '#00ff00' : status === 'NOT_FOUND' ? '#ffff00' : '#ff0000' 
          }}>
            {status}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const ValidationStatus: React.FC<{ validation: ForensicsPackValidation }> = ({ validation }) => (
  <div>
    <div style={{ marginBottom: '10px' }}>
      <span>Pack Valid: </span>
      <strong style={{ color: validation.valid ? '#00ff00' : '#ff0000' }}>
        {validation.valid ? 'YES' : 'NO'}
      </strong>
    </div>
    <div style={{ marginBottom: '10px' }}>
      <span>Hash Valid: </span>
      <strong style={{ color: validation.hash_valid ? '#00ff00' : '#ff0000' }}>
        {validation.hash_valid ? 'YES' : 'NO'}
      </strong>
    </div>
    {validation.missing_fields.length > 0 && (
      <div style={{ color: '#ff0000' }}>
        Missing Fields: {validation.missing_fields.join(', ')}
      </div>
    )}
  </div>
);

const HashDisplay: React.FC<{ pack: DecisionForensicsPack }> = ({ pack }) => (
  <div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Reconstruction Hash:</span>
      <code style={styles.hashValue}>{pack.reconstruction_hash}</code>
    </div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Snapshot Hash:</span>
      <code style={styles.hashValue}>{pack.component_hashes.snapshot_hash}</code>
    </div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Lifecycle Hash:</span>
      <code style={styles.hashValue}>{pack.component_hashes.lifecycle_hash}</code>
    </div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Ethics Hash:</span>
      <code style={styles.hashValue}>{pack.component_hashes.ethics_hash}</code>
    </div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Override Hash:</span>
      <code style={styles.hashValue}>{pack.component_hashes.override_hash}</code>
    </div>
    <div style={styles.hashRow}>
      <span style={styles.hashLabel}>Counterfactual Hash:</span>
      <code style={styles.hashValue}>{pack.component_hashes.counterfactual_hash}</code>
    </div>
  </div>
);

const ResponsibilityDisplay: React.FC<{ pack: DecisionForensicsPack }> = ({ pack }) => (
  <div>
    <div style={styles.responsibilityRow}>
      <span style={styles.label}>Primary Actor:</span>
      <strong style={{ color: pack.responsibility.primary_actor === 'HUMAN' ? '#ffff00' : '#00ff00' }}>
        {pack.responsibility.primary_actor}
      </strong>
    </div>
    <div style={styles.responsibilityRow}>
      <span style={styles.label}>Human Override Occurred:</span>
      <strong style={{ color: pack.responsibility.human_override_occurred ? '#ff0000' : '#00ff00' }}>
        {pack.responsibility.human_override_occurred ? 'YES' : 'NO'}
      </strong>
    </div>
    <div style={styles.responsibilityRow}>
      <span style={styles.label}>System Would Have Acted Differently:</span>
      <strong>{pack.responsibility.system_would_have_acted_differently ? 'YES' : 'NO'}</strong>
    </div>
    <div style={styles.responsibilityRow}>
      <span style={styles.label}>Counterfactual Alignment:</span>
      <strong style={{ 
        color: pack.responsibility.counterfactual_alignment === 'SYSTEM_AGREED' ? '#00ff00' : 
               pack.responsibility.counterfactual_alignment === 'SYSTEM_DISAGREED' ? '#ff0000' : '#999'
      }}>
        {pack.responsibility.counterfactual_alignment}
      </strong>
    </div>
    <div style={styles.explanationBox}>
      {pack.responsibility.explanation}
    </div>
  </div>
);

const LifecycleTimeline: React.FC<{ transitions: LifecycleTransition[]; terminal: string }> = ({ transitions, terminal }) => (
  <div style={styles.timeline}>
    {transitions.map((t, i) => (
      <div key={i} style={styles.timelineItem}>
        <div style={styles.timelineState}>
          {t.from_state} → <strong>{t.to_state}</strong>
        </div>
        <div style={styles.timelineDetails}>
          <span>{t.timestamp}</span>
          <span> | Reason: {t.reason}</span>
          <span> | By: {t.caused_by}</span>
        </div>
      </div>
    ))}
    <div style={styles.timelineTerminal}>
      TERMINAL STATE: <strong>{terminal}</strong>
    </div>
  </div>
);

const GatesTable: React.FC<{ pack: DecisionForensicsPack }> = ({ pack }) => {
  const gates = [
    { name: 'LIFECYCLE', passed: pack.terminal_state === 'ACTIVE' || pack.terminal_state === 'EXECUTED_SHADOW' },
    { name: 'ETHICS', passed: pack.ethics_verdicts.some(v => v.allowed) },
    { name: 'SILENCE', passed: pack.silence_events.some(e => e.mode === 'ADVICE_ALLOWED') },
    { name: 'OVERRIDE', passed: !pack.override_record },
    { name: 'CONFLICT', passed: pack.suppressed_alternatives.length === 0 }
  ];
  
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>GATE</th>
          <th style={styles.th}>RESULT</th>
        </tr>
      </thead>
      <tbody>
        {gates.map(g => (
          <tr key={g.name}>
            <td style={styles.td}>{g.name}</td>
            <td style={{ ...styles.td, color: g.passed ? '#00ff00' : '#ff0000' }}>
              {g.passed ? 'PASS' : 'FAIL'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const AlternativesTable: React.FC<{ alternatives: AlternativeHistoryProof[] }> = ({ alternatives }) => {
  if (alternatives.length === 0) {
    return <div style={styles.noData}>No suppressed alternatives.</div>;
  }
  
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>SNAPSHOT ID</th>
          <th style={styles.th}>KILLING CONSTRAINT</th>
          <th style={styles.th}>KILLED BY</th>
          <th style={styles.th}>DETAILS</th>
        </tr>
      </thead>
      <tbody>
        {alternatives.map((a, i) => (
          <tr key={i}>
            <td style={styles.td}>{a.suppressed_snapshot_id}</td>
            <td style={{ ...styles.td, color: '#ff0000' }}>{a.killing_constraint}</td>
            <td style={styles.td}>{a.killed_by_decision_id || 'N/A'}</td>
            <td style={styles.td}>{a.constraint_details}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const EthicsTable: React.FC<{ verdicts: any[] }> = ({ verdicts }) => {
  if (verdicts.length === 0) {
    return <div style={styles.noData}>No ethics evaluations recorded.</div>;
  }
  
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>ALLOWED</th>
          <th style={styles.th}>SEVERITY</th>
          <th style={styles.th}>REASON</th>
          <th style={styles.th}>VIOLATED PRINCIPLES</th>
        </tr>
      </thead>
      <tbody>
        {verdicts.map((v, i) => (
          <tr key={i}>
            <td style={{ ...styles.td, color: v.allowed ? '#00ff00' : '#ff0000' }}>
              {v.allowed ? 'YES' : 'NO'}
            </td>
            <td style={{ 
              ...styles.td, 
              color: v.severity === 'ABSOLUTE' ? '#ff0000' : 
                     v.severity === 'HIGH' ? '#ff8800' : '#ffff00'
            }}>
              {v.severity}
            </td>
            <td style={styles.td}>{v.reason}</td>
            <td style={styles.td}>{v.violated_principles?.join(', ') || 'None'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const OverrideDisplay: React.FC<{ record: any }> = ({ record }) => (
  <div style={styles.overrideBox}>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Override ID:</span>
      <code>{record.override_id}</code>
    </div>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Human Action:</span>
      <strong style={{ color: '#ffff00' }}>{record.human_action}</strong>
    </div>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Rationale:</span>
      <span>{record.human_rationale}</span>
    </div>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Acknowledged Risks:</span>
      <span>{record.acknowledged_risks?.join(', ')}</span>
    </div>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Outcome:</span>
      <strong style={{ 
        color: record.outcome === 'HUMAN_RIGHT' ? '#00ff00' : 
               record.outcome === 'HUMAN_WRONG' ? '#ff0000' : '#999'
      }}>
        {record.outcome || 'PENDING'}
      </strong>
    </div>
    <div style={styles.overrideRow}>
      <span style={styles.label}>Timestamp:</span>
      <span>{record.timestamp}</span>
    </div>
  </div>
);

const CounterfactualDisplay: React.FC<{ outcomes: any[] }> = ({ outcomes }) => {
  if (outcomes.length === 0) {
    return <div style={styles.noData}>No counterfactual analysis available.</div>;
  }
  
  return (
    <div>
      {outcomes.map((o, i) => (
        <div key={i} style={styles.counterfactualBox}>
          <div style={styles.cfRow}>
            <span style={styles.label}>Dominance:</span>
            <strong style={{ 
              color: o.dominance === 'SYSTEM_RIGHT' ? '#00ff00' : 
                     o.dominance === 'SYSTEM_WRONG' ? '#ff0000' : '#999'
            }}>
              {o.dominance}
            </strong>
          </div>
          <div style={styles.cfRow}>
            <span style={styles.label}>Realized Return:</span>
            <span>{o.realized_return}%</span>
          </div>
          <div style={styles.cfRow}>
            <span style={styles.label}>Max Favorable Move:</span>
            <span style={{ color: '#00ff00' }}>{o.max_favorable_move}%</span>
          </div>
          <div style={styles.cfRow}>
            <span style={styles.label}>Max Adverse Move:</span>
            <span style={{ color: '#ff0000' }}>{o.max_adverse_move}%</span>
          </div>
          <div style={styles.cfRow}>
            <span style={styles.label}>Opportunity Cost:</span>
            <span>{o.opportunity_cost}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const TrustDisplay: React.FC<{ impact: any }> = ({ impact }) => (
  <div>
    <div style={styles.trustRow}>
      <span style={styles.label}>Trust Before:</span>
      <span>{impact.trust_before}</span>
    </div>
    <div style={styles.trustRow}>
      <span style={styles.label}>Trust After:</span>
      <span>{impact.trust_after}</span>
    </div>
    <div style={styles.trustRow}>
      <span style={styles.label}>Delta:</span>
      <strong style={{ color: impact.delta >= 0 ? '#00ff00' : '#ff0000' }}>
        {impact.delta >= 0 ? '+' : ''}{impact.delta}
      </strong>
    </div>
    <div style={styles.trustRow}>
      <span style={styles.label}>Reason:</span>
      <span>{impact.reason}</span>
    </div>
    <div style={styles.trustRow}>
      <span style={styles.label}>Affected by Override:</span>
      <span style={{ color: impact.affected_by_override ? '#ffff00' : '#999' }}>
        {impact.affected_by_override ? 'YES' : 'NO'}
      </span>
    </div>
  </div>
);

const AuditTrailTable: React.FC<{ events: any[] }> = ({ events }) => {
  if (events.length === 0) {
    return <div style={styles.noData}>No audit events for this decision.</div>;
  }
  
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>TIMESTAMP</th>
          <th style={styles.th}>EVENT TYPE</th>
          <th style={styles.th}>SEVERITY</th>
          <th style={styles.th}>SUMMARY</th>
          <th style={styles.th}>ACTOR</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={i}>
            <td style={styles.td}>{e.timestamp}</td>
            <td style={styles.td}>{e.event_type}</td>
            <td style={{ 
              ...styles.td, 
              color: e.severity === 'CRITICAL' ? '#ff0000' : 
                     e.severity === 'HIGH' ? '#ff8800' : '#999'
            }}>
              {e.severity}
            </td>
            <td style={styles.td}>{e.summary}</td>
            <td style={styles.td}>{e.actor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    fontFamily: 'monospace',
    backgroundColor: '#0a0a0a',
    color: '#00ff00',
    minHeight: '100vh'
  },
  header: {
    borderBottom: '2px solid #ff0000',
    paddingBottom: '20px',
    marginBottom: '30px'
  },
  snapshotId: {
    fontSize: '14px',
    color: '#999',
    marginTop: '10px'
  },
  disclaimer: {
    fontSize: '12px',
    color: '#ff0000',
    marginTop: '10px',
    padding: '10px',
    border: '1px solid #ff0000',
    backgroundColor: 'rgba(255, 0, 0, 0.1)'
  },
  section: {
    marginBottom: '30px',
    border: '1px solid #333',
    padding: '15px'
  },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '14px',
    color: '#00ff00',
    borderBottom: '1px solid #333',
    paddingBottom: '5px'
  },
  sectionContent: {
    fontSize: '13px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px'
  },
  th: {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '1px solid #00ff00',
    color: '#00ff00'
  },
  td: {
    padding: '8px',
    borderBottom: '1px solid #333',
    color: '#ccc'
  },
  loading: {
    color: '#ffff00',
    textAlign: 'center',
    padding: '40px'
  },
  error: {
    color: '#ff0000',
    border: '2px solid #ff0000',
    padding: '20px',
    backgroundColor: 'rgba(255, 0, 0, 0.1)'
  },
  noData: {
    color: '#666',
    fontStyle: 'italic'
  },
  hashRow: {
    marginBottom: '8px'
  },
  hashLabel: {
    color: '#999',
    marginRight: '10px'
  },
  hashValue: {
    color: '#00ffff',
    fontSize: '11px',
    wordBreak: 'break-all'
  },
  responsibilityRow: {
    marginBottom: '8px'
  },
  label: {
    color: '#999',
    marginRight: '10px'
  },
  explanationBox: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    border: '1px solid #00ff00',
    color: '#00ff00'
  },
  timeline: {
    borderLeft: '2px solid #00ff00',
    paddingLeft: '20px'
  },
  timelineItem: {
    marginBottom: '15px',
    position: 'relative'
  },
  timelineState: {
    color: '#00ff00',
    marginBottom: '5px'
  },
  timelineDetails: {
    color: '#666',
    fontSize: '11px'
  },
  timelineTerminal: {
    marginTop: '20px',
    color: '#ff0000',
    fontWeight: 'bold'
  },
  overrideBox: {
    border: '2px solid #ffff00',
    padding: '15px',
    backgroundColor: 'rgba(255, 255, 0, 0.05)'
  },
  overrideRow: {
    marginBottom: '8px'
  },
  counterfactualBox: {
    border: '1px solid #666',
    padding: '15px',
    marginBottom: '10px'
  },
  cfRow: {
    marginBottom: '8px'
  },
  trustRow: {
    marginBottom: '8px'
  },
  rawJson: {
    backgroundColor: '#111',
    padding: '15px',
    overflow: 'auto',
    maxHeight: '400px',
    fontSize: '11px',
    color: '#999'
  },
  auditControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  buttonPrimary: {
    padding: '8px 16px',
    backgroundColor: '#003300',
    color: '#00ff00',
    border: '1px solid #00ff00',
    cursor: 'pointer',
    fontFamily: 'monospace'
  },
  buttonDanger: {
    padding: '8px 16px',
    backgroundColor: '#330000',
    color: '#ff0000',
    border: '1px solid #ff0000',
    cursor: 'pointer',
    fontFamily: 'monospace'
  },
  warning: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: 'rgba(255, 255, 0, 0.1)',
    border: '1px solid #ffff00',
    color: '#ffff00'
  }
};

export default AuditDecision;

