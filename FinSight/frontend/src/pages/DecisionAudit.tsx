/**
 * DecisionAudit - Auditor-Facing UI (READ-ONLY)
 * 
 * PHASE 37: Institutional Audit Mode
 * 
 * ROUTE: /audit/decision/:snapshotId
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
import { useParams } from 'react-router-dom';
import {
  getDecisionReconstructionEngine,
  ReconstructionResult
} from '../audit/DecisionReconstructionEngine';
import {
  DecisionForensicsPack,
  LifecycleTransition,
  AuditEvent,
  ResponsibilityAssignment
} from '../audit/DecisionForensicsPack';
import { AuditMode } from '../audit/AuditMode';

const DecisionAudit: React.FC = () => {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const [pack, setPack] = useState<DecisionForensicsPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataAvailability, setDataAvailability] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    if (!snapshotId) {
      setError('NO_SNAPSHOT_ID_PROVIDED');
      setLoading(false);
      return;
    }
    
    loadForensicsPack(snapshotId);
  }, [snapshotId]);
  
  const loadForensicsPack = async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const engine = getDecisionReconstructionEngine();
      
      // Get data availability first
      const status = engine.checkDataSources(id);
      setDataAvailability({
        snapshot: true, // If we got here, snapshot exists
        lifecycle: status.lifecycle === 'FOUND',
        ethics: status.ethics === 'FOUND',
        override: status.override === 'FOUND',
        counterfactual: status.counterfactual === 'FOUND'
      });
      
      // Reconstruct the forensics pack
      const result = engine.reconstruct(id);
      setPack(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  
  // Audit mode banner
  const auditModeState = AuditMode.getState();
  
  return (
    <div style={{
      padding: '20px',
      fontFamily: 'Consolas, Monaco, monospace',
      backgroundColor: '#0d0d0d',
      color: '#c0c0c0',
      minHeight: '100vh'
    }}>
      {/* HEADER */}
      <div style={{ 
        borderBottom: '2px solid #ff3333', 
        paddingBottom: '15px',
        marginBottom: '20px'
      }}>
        <h1 style={{ 
          color: '#ff3333', 
          margin: 0,
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          ⚠️ FORENSIC AUDIT VIEW — READ ONLY
        </h1>
        <div style={{ color: '#666', marginTop: '5px', fontSize: '12px' }}>
          SNAPSHOT: {snapshotId || 'NONE'}
        </div>
      </div>
      
      {/* AUDIT MODE BANNER */}
      {auditModeState.enabled && (
        <div style={{
          backgroundColor: '#330000',
          border: '1px solid #ff0000',
          padding: '10px',
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          <strong style={{ color: '#ff0000' }}>AUDIT MODE ACTIVE</strong>
          <div>Enabled by: {auditModeState.enabled_by} at {auditModeState.enabled_at}</div>
          <div>Reason: {auditModeState.reason}</div>
        </div>
      )}
      
      {/* LOADING */}
      {loading && (
        <div style={{ color: '#ffff00' }}>
          RECONSTRUCTING DECISION...
        </div>
      )}
      
      {/* ERROR */}
      {error && (
        <div style={{
          backgroundColor: '#330000',
          border: '1px solid #ff0000',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ color: '#ff0000', fontWeight: 'bold' }}>
            RECONSTRUCTION FAILED
          </div>
          <pre style={{ 
            color: '#ff6666', 
            margin: '10px 0 0 0',
            whiteSpace: 'pre-wrap',
            fontSize: '11px'
          }}>
            {error}
          </pre>
        </div>
      )}
      
      {/* DATA AVAILABILITY */}
      <Section title="DATA AVAILABILITY">
        <table style={{ width: '100%', fontSize: '12px' }}>
          <tbody>
            {Object.entries(dataAvailability).map(([key, available]) => (
              <tr key={key} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '5px' }}>{key.toUpperCase().replace('_', ' ')}</td>
                <td style={{ 
                  padding: '5px',
                  color: available ? '#00ff00' : '#ff0000'
                }}>
                  {available ? 'PRESENT' : 'MISSING'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      
      {/* MAIN CONTENT - Only if pack exists */}
      {pack && (
        <>
          {/* DECISION IDENTITY */}
          <Section title="DECISION IDENTITY">
            <DataRow label="Pack ID" value={pack.pack_id} />
            <DataRow label="Snapshot ID" value={pack.snapshot_id} />
            <DataRow label="Created At" value={pack.created_at} />
            <DataRow label="Reconstruction Hash" value={pack.reconstruction_hash} />
          </Section>
          
          {/* LIFECYCLE TIMELINE */}
          <Section title="LIFECYCLE TIMELINE">
            {pack.lifecycle_history.length === 0 ? (
              <div style={{ color: '#666' }}>NO LIFECYCLE HISTORY</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                {pack.lifecycle_history.map((transition, index) => (
                  <TimelineEntry key={index} transition={transition} index={index} />
                ))}
                <div style={{
                  position: 'absolute',
                  left: '8px',
                  top: '0',
                  bottom: '0',
                  width: '2px',
                  backgroundColor: '#333'
                }} />
              </div>
            )}
            <DataRow 
              label="Terminal State" 
              value={pack.terminal_state}
              highlight
            />
          </Section>
          
          {/* GATES ENCOUNTERED */}
          <Section title="GATES ENCOUNTERED">
            <GateRow 
              gate="Ethics Firewall"
              passed={pack.ethics_verdicts.every((v: { allowed: boolean }) => v.allowed)}
              reason={pack.ethics_verdicts.find((v: { allowed: boolean }) => !v.allowed)?.reason}
            />
            <GateRow 
              gate="Advice Gate"
              passed={pack.silence_events.length === 0}
              reason={pack.silence_events.length > 0 ? 'Silence required' : undefined}
            />
            <GateRow 
              gate="Human Override"
              passed={!pack.override_record}
              reason={pack.override_record ? 'Human overrode system' : undefined}
            />
          </Section>
          
          {/* ALTERNATIVES SUPPRESSED */}
          <Section title="SUPPRESSED ALTERNATIVES">
            {pack.suppressed_alternatives.length === 0 ? (
              <div style={{ color: '#666' }}>NO ALTERNATIVES SUPPRESSED</div>
            ) : (
              pack.suppressed_alternatives.map((alt, index) => (
                <div key={index} style={{ marginTop: '5px', padding: '5px', backgroundColor: '#1a1a1a' }}>
                  <DataRow label="Snapshot" value={alt.suppressed_snapshot_id} />
                  <DataRow label="Reason" value={alt.suppression_reason} />
                  <DataRow label="Constraint" value={alt.killing_constraint} />
                </div>
              ))
            )}
          </Section>
          
          {/* RESPONSIBILITY */}
          <Section title="RESPONSIBILITY ASSIGNMENT">
            <DataRow 
              label="Primary Actor" 
              value={pack.responsibility.primary_actor}
              highlight
            />
            <DataRow 
              label="Override Occurred" 
              value={pack.responsibility.human_override_occurred ? 'YES' : 'NO'}
            />
            <DataRow 
              label="System Would Act Differently" 
              value={pack.responsibility.system_would_have_acted_differently ? 'YES' : 'NO'}
            />
            <DataRow 
              label="Counterfactual Alignment" 
              value={pack.responsibility.counterfactual_alignment}
            />
            <DataRow 
              label="Explanation" 
              value={pack.responsibility.explanation}
            />
          </Section>
          
          {/* COUNTERFACTUAL */}
          <Section title="COUNTERFACTUAL ANALYSIS">
            {pack.counterfactual_outcomes.length === 0 ? (
              <div style={{ color: '#666' }}>NO COUNTERFACTUAL DATA</div>
            ) : (
              <>
                <DataRow 
                  label="System Was Right" 
                  value={pack.responsibility.counterfactual_alignment === 'SYSTEM_AGREED' ? 'YES' : 
                         pack.responsibility.counterfactual_alignment === 'SYSTEM_DISAGREED' ? 'NO' : 'UNKNOWN'}
                  highlight
                />
                {pack.counterfactual_outcomes.map((outcome: { dominance: string; opportunity_cost?: number }, i: number) => (
                  <div key={i} style={{ marginTop: '10px' }}>
                    <DataRow label="Dominance" value={outcome.dominance} />
                    <DataRow label="Opportunity Cost" value={outcome.opportunity_cost?.toString() || 'N/A'} />
                  </div>
                ))}
              </>
            )}
          </Section>
          
          {/* TRUST IMPACT */}
          <Section title="TRUST IMPACT">
            <DataRow label="Trust Before" value={pack.trust_impact.trust_before.toString()} />
            <DataRow label="Trust After" value={pack.trust_impact.trust_after.toString()} />
            <DataRow 
              label="Delta" 
              value={`${pack.trust_impact.delta >= 0 ? '+' : ''}${pack.trust_impact.delta}`}
              highlight
            />
            <DataRow label="Reason" value={pack.trust_impact.reason} />
          </Section>
          
          {/* OVERRIDE RECORD */}
          {pack.override_record && (
            <Section title="OVERRIDE RECORD">
              <DataRow label="Override ID" value={pack.override_record.override_id} />
              <DataRow label="Human Action" value={pack.override_record.human_action} />
              <DataRow label="Rationale" value={pack.override_record.human_rationale} />
              <DataRow label="Timestamp" value={pack.override_record.timestamp} />
              <div style={{ marginTop: '10px' }}>
                <div style={{ color: '#888', marginBottom: '5px' }}>Acknowledged Risks:</div>
                {pack.override_record.acknowledged_risks.map((risk, i) => (
                  <div key={i} style={{ color: '#ff6600', marginLeft: '10px' }}>
                    ✓ {risk}
                  </div>
                ))}
              </div>
            </Section>
          )}
          
          {/* AUDIT TRAIL */}
          <Section title="AUDIT TRAIL">
            {pack.audit_trail.length === 0 ? (
              <div style={{ color: '#666' }}>NO AUDIT EVENTS</div>
            ) : (
              pack.audit_trail.slice(0, 20).map((event, index) => (
                <AuditEventEntry key={index} event={event} />
              ))
            )}
            {pack.audit_trail.length > 20 && (
              <div style={{ color: '#666', marginTop: '10px' }}>
                ... and {pack.audit_trail.length - 20} more events
              </div>
            )}
          </Section>
          
          {/* COMPONENT HASHES */}
          <Section title="CRYPTOGRAPHIC ANCHORS">
            <DataRow label="Snapshot Hash" value={pack.component_hashes.snapshot_hash} />
            <DataRow label="Lifecycle Hash" value={pack.component_hashes.lifecycle_hash} />
            <DataRow label="Ethics Hash" value={pack.component_hashes.ethics_hash} />
            <DataRow label="Override Hash" value={pack.component_hashes.override_hash} />
            <DataRow label="Counterfactual Hash" value={pack.component_hashes.counterfactual_hash} />
            <DataRow 
              label="RECONSTRUCTION HASH" 
              value={pack.reconstruction_hash}
              highlight
            />
          </Section>
        </>
      )}
      
      {/* FOOTER */}
      <div style={{
        marginTop: '40px',
        borderTop: '1px solid #333',
        paddingTop: '20px',
        color: '#666',
        fontSize: '11px'
      }}>
        <div>PHASE 37 — INSTITUTIONAL AUDIT MODE</div>
        <div>This view is hostile by design. No inference. No defaults. Only evidence.</div>
        <div>Generated: {new Date().toISOString()}</div>
      </div>
    </div>
  );
};

// =============================================================================
// COMPONENTS
// =============================================================================

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    marginBottom: '25px',
    border: '1px solid #333',
    backgroundColor: '#111'
  }}>
    <div style={{
      backgroundColor: '#1a1a1a',
      padding: '8px 12px',
      borderBottom: '1px solid #333',
      fontSize: '12px',
      color: '#888',
      fontWeight: 'bold'
    }}>
      ▸ {title}
    </div>
    <div style={{ padding: '12px' }}>
      {children}
    </div>
  </div>
);

const DataRow: React.FC<{ 
  label: string; 
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid #222',
    fontSize: '12px'
  }}>
    <span style={{ color: '#888' }}>{label}:</span>
    <span style={{ 
      color: highlight ? '#ffff00' : '#c0c0c0',
      fontWeight: highlight ? 'bold' : 'normal',
      maxWidth: '60%',
      textAlign: 'right',
      wordBreak: 'break-all'
    }}>
      {value}
    </span>
  </div>
);

const GateRow: React.FC<{
  gate: string;
  passed: boolean;
  reason?: string;
}> = ({ gate, passed, reason }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #222',
    fontSize: '12px'
  }}>
    <span style={{ color: '#888' }}>{gate}</span>
    <div style={{ textAlign: 'right' }}>
      <span style={{ 
        color: passed ? '#00ff00' : '#ff0000',
        fontWeight: 'bold'
      }}>
        {passed ? 'PASS' : 'FAIL'}
      </span>
      {reason && (
        <div style={{ color: '#ff6666', fontSize: '10px' }}>
          {reason}
        </div>
      )}
    </div>
  </div>
);

const TimelineEntry: React.FC<{
  transition: LifecycleTransition;
  index: number;
}> = ({ transition, index }) => (
  <div style={{
    position: 'relative',
    paddingLeft: '15px',
    paddingBottom: '15px',
    marginBottom: '5px'
  }}>
    <div style={{
      position: 'absolute',
      left: '-6px',
      top: '0',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: '#333',
      border: '2px solid #666'
    }} />
    <div style={{ fontSize: '11px', color: '#666' }}>
      {transition.timestamp}
    </div>
    <div style={{ fontSize: '12px' }}>
      <span style={{ color: '#888' }}>{transition.from_state}</span>
      <span style={{ color: '#ffff00' }}> → </span>
      <span style={{ color: '#00ff00' }}>{transition.to_state}</span>
    </div>
    <div style={{ fontSize: '10px', color: '#666' }}>
      {transition.reason} ({transition.caused_by})
    </div>
  </div>
);

// Legacy component - kept for reference, not actively used
type LegacyConstraintKill = {
  constraint_type: string;
  constraint_details: string;
  killed_by: string;
  regret_if_executed: number;
};
const ConstraintKillEntry: React.FC<{ kill: LegacyConstraintKill }> = ({ kill }) => (
  <div style={{
    backgroundColor: '#1a0000',
    border: '1px solid #330000',
    padding: '10px',
    marginBottom: '10px',
    fontSize: '12px'
  }}>
    <div style={{ color: '#ff6666', fontWeight: 'bold' }}>
      {kill.constraint_type}
    </div>
    <div style={{ color: '#888', marginTop: '5px' }}>
      {kill.constraint_details}
    </div>
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between',
      marginTop: '5px',
      fontSize: '11px'
    }}>
      <span style={{ color: '#666' }}>Killed by: {kill.killed_by}</span>
      <span style={{ color: '#ff3333' }}>
        Regret: {kill.regret_if_executed}
      </span>
    </div>
  </div>
);

const AuditEventEntry: React.FC<{ event: AuditEvent }> = ({ event }) => (
  <div style={{
    padding: '8px',
    borderBottom: '1px solid #222',
    fontSize: '11px'
  }}>
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between',
      marginBottom: '3px'
    }}>
      <span style={{ 
        color: event.severity === 'CRITICAL' ? '#ff0000' :
               event.severity === 'ERROR' ? '#ff6600' :
               event.severity === 'WARNING' ? '#ffff00' : '#888'
      }}>
        [{event.severity}] {event.event_type}
      </span>
      <span style={{ color: '#666' }}>{event.timestamp}</span>
    </div>
    <div style={{ color: '#c0c0c0' }}>{event.summary}</div>
  </div>
);

export default DecisionAudit;

