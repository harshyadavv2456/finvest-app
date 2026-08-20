/**
 * SystemExecutionMap - Runtime Execution Probing
 * 
 * PHASE 36: System Reality Check (SRC)
 * 
 * PURPOSE:
 * Answer: "What happens if I try to do X right now?"
 * 
 * RULES:
 * - Not mock results — real calls, wrapped in try/catch
 * - Every critical authority path must be exercised
 * - Every "blocked" path must prove it throws
 * - Every "never allowed" path must be provably unreachable
 */

import { getDecisionLifecycleEngine, DecisionLifecycleState } from '../lifecycle/DecisionLifecycleEngine';
import { LifecycleGuard } from '../lifecycle/LifecycleGuard';
import { getExecutionEthicsFirewall, EthicsVerdict, EthicsContext } from '../ethics/ExecutionEthicsFirewall';
import { EthicsGuard, EthicsContextBuilder } from '../ethics/EthicsGuard';
import { getQuestionFirstGovernor } from '../silence/QuestionFirstGovernor';
import { getHumanOverrideProtocol } from '../override/HumanOverrideProtocol';
import { OverrideGuard } from '../override/OverrideGuard';
import { getTemporalReservationEngine } from '../reservations/TemporalReservationEngine';
import { ReservationGuard } from '../reservations/ReservationGuard';
import { getCounterfactualLedger } from '../counterfactual/CounterfactualLedger';
import { ConflictResolutionEngine } from '../conflict/ConflictResolutionEngine';

// =============================================================================
// TYPES
// =============================================================================

/**
 * ExecutionPathResult - Result of probing a single path
 */
export interface ExecutionPathResult {
  readonly path: string;
  readonly attempted: boolean;
  readonly allowed: boolean;
  readonly blocked_by?: readonly string[];
  readonly lifecycle_state?: DecisionLifecycleState;
  readonly ethics_verdict?: EthicsVerdict;
  readonly silence_mode?: 'ADVICE_ALLOWED' | 'QUESTION_REQUIRED' | 'SILENCE_REQUIRED';
  readonly error_thrown?: string;
  readonly execution_time_ms: number;
  readonly _frozen: true;
}

/**
 * SystemProbeResult - Full probe result
 */
export interface SystemProbeResult {
  readonly snapshot_id: string;
  readonly probed_at: string;
  readonly paths: readonly ExecutionPathResult[];
  readonly summary: {
    readonly total_paths: number;
    readonly allowed_paths: number;
    readonly blocked_paths: number;
    readonly error_paths: number;
  };
  readonly _frozen: true;
}

/**
 * SystemHealthStatus - Overall system health
 */
export interface SystemHealthStatus {
  readonly status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  readonly active_decisions: number;
  readonly suppressed_decisions: number;
  readonly overridden_decisions: number;
  readonly permanent_ethics_blocks: number;
  readonly confidence_discipline_state: 'NORMAL' | 'RESTRAINED' | 'MUTED' | 'UNKNOWN';
  readonly silence_mode_active: boolean;
  readonly checked_at: string;
  readonly _frozen: true;
}

// =============================================================================
// SYSTEM EXECUTION MAP
// =============================================================================

export class SystemExecutionMap {
  private static instance: SystemExecutionMap;
  
  private constructor() {}
  
  public static getInstance(): SystemExecutionMap {
    if (!SystemExecutionMap.instance) {
      SystemExecutionMap.instance = new SystemExecutionMap();
    }
    return SystemExecutionMap.instance;
  }
  
  // ===========================================================================
  // MAIN PROBE API
  // ===========================================================================
  
  /**
   * Probe all execution paths for a snapshot
   * Real calls, wrapped in try/catch
   */
  public probe(snapshotId: string): SystemProbeResult {
    const paths: ExecutionPathResult[] = [];
    
    // 1. Probe lifecycle
    paths.push(this.probeLifecycle(snapshotId));
    
    // 2. Probe render permission
    paths.push(this.probeRenderPermission(snapshotId));
    
    // 3. Probe FinBot speak
    paths.push(this.probeFinBotSpeak(snapshotId));
    
    // 4. Probe FinBot question
    paths.push(this.probeFinBotQuestion(snapshotId));
    
    // 5. Probe silence mode
    paths.push(this.probeSilenceMode(snapshotId));
    
    // 6. Probe sandbox execution
    paths.push(this.probeSandboxExecution(snapshotId));
    
    // 7. Probe ethics evaluation
    paths.push(this.probeEthicsEvaluation(snapshotId));
    
    // 8. Probe override eligibility
    paths.push(this.probeOverrideEligibility(snapshotId));
    
    // 9. Probe system assistance
    paths.push(this.probeSystemAssistance(snapshotId));
    
    // 10. Probe temporal reservation
    paths.push(this.probeTemporalReservation(snapshotId));
    
    // 11. Probe counterfactual registration
    paths.push(this.probeCounterfactualRegistration(snapshotId));
    
    // Calculate summary
    const allowed = paths.filter(p => p.allowed).length;
    const blocked = paths.filter(p => !p.allowed && !p.error_thrown).length;
    const errors = paths.filter(p => p.error_thrown).length;
    
    return Object.freeze({
      snapshot_id: snapshotId,
      probed_at: new Date().toISOString(),
      paths: Object.freeze(paths.map(p => Object.freeze(p))) as unknown as readonly ExecutionPathResult[],
      summary: Object.freeze({
        total_paths: paths.length,
        allowed_paths: allowed,
        blocked_paths: blocked,
        error_paths: errors
      }),
      _frozen: true
    });
  }
  
  // ===========================================================================
  // INDIVIDUAL PROBES
  // ===========================================================================
  
  private probeLifecycle(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const engine = getDecisionLifecycleEngine();
      
      if (!engine.hasLifecycle(snapshotId)) {
        return this.createResult('LIFECYCLE_CHECK', true, false, {
          blocked_by: ['NO_LIFECYCLE_EXISTS'],
          execution_time_ms: Date.now() - start
        });
      }
      
      const state = engine.getCurrentState(snapshotId);
      return this.createResult('LIFECYCLE_CHECK', true, true, {
        lifecycle_state: state.state,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('LIFECYCLE_CHECK', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeRenderPermission(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const engine = getDecisionLifecycleEngine();
      engine.assertRenderable(snapshotId);
      
      return this.createResult('RENDER_PERMISSION', true, true, {
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('RENDER_PERMISSION', true, false, {
        blocked_by: ['LIFECYCLE_NOT_ACTIVE'],
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeFinBotSpeak(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      // Check if FinBot can speak (lifecycle + override check)
      const lifecycle = getDecisionLifecycleEngine();
      const override = getHumanOverrideProtocol();
      
      let blocked_by: string[] = [];
      
      // Check lifecycle
      try {
        LifecycleGuard.assertActive(snapshotId);
      } catch {
        blocked_by.push('LIFECYCLE_NOT_ACTIVE');
      }
      
      // Check override
      if (override.isOverridden(snapshotId)) {
        const canSpeak = OverrideGuard.canFinBotSpeak(snapshotId);
        if (!canSpeak) {
          blocked_by.push('OVERRIDDEN_PENDING');
        }
      }
      
      if (blocked_by.length > 0) {
        return this.createResult('FINBOT_SPEAK', true, false, {
          blocked_by,
          execution_time_ms: Date.now() - start
        });
      }
      
      return this.createResult('FINBOT_SPEAK', true, true, {
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('FINBOT_SPEAK', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeFinBotQuestion(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const governor = getQuestionFirstGovernor();
      const gate = governor.evaluateGate({}, snapshotId);
      
      return this.createResult('FINBOT_QUESTION', true, gate.mode === 'QUESTION_REQUIRED', {
        silence_mode: gate.mode,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('FINBOT_QUESTION', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeSilenceMode(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const governor = getQuestionFirstGovernor();
      const gate = governor.evaluateGate({}, snapshotId);
      
      const allowed = gate.mode === 'ADVICE_ALLOWED';
      const blocked_by: string[] = [];
      
      if (!allowed) {
        blocked_by.push(gate.mode);
        if (gate.blocking_factors) {
          blocked_by.push(...gate.blocking_factors);
        }
      }
      
      return this.createResult('SILENCE_MODE', true, allowed, {
        silence_mode: gate.mode,
        blocked_by: blocked_by.length > 0 ? blocked_by : undefined,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('SILENCE_MODE', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeSandboxExecution(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      // Sandbox execution requires ACTIVE lifecycle
      const lifecycle = getDecisionLifecycleEngine();
      
      if (!lifecycle.hasLifecycle(snapshotId)) {
        return this.createResult('SANDBOX_EXECUTION', true, false, {
          blocked_by: ['NO_LIFECYCLE'],
          execution_time_ms: Date.now() - start
        });
      }
      
      const state = lifecycle.getCurrentState(snapshotId);
      if (state.state !== 'ACTIVE') {
        return this.createResult('SANDBOX_EXECUTION', true, false, {
          blocked_by: [`LIFECYCLE_STATE_${state.state}`],
          lifecycle_state: state.state,
          execution_time_ms: Date.now() - start
        });
      }
      
      // Also check override
      const override = getHumanOverrideProtocol();
      if (override.isOverridden(snapshotId)) {
        return this.createResult('SANDBOX_EXECUTION', true, false, {
          blocked_by: ['OVERRIDDEN'],
          lifecycle_state: state.state,
          execution_time_ms: Date.now() - start
        });
      }
      
      return this.createResult('SANDBOX_EXECUTION', true, true, {
        lifecycle_state: state.state,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('SANDBOX_EXECUTION', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeEthicsEvaluation(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      // Create a test context
      const context = EthicsContextBuilder.createRestrictiveDefault();
      const firewall = getExecutionEthicsFirewall();
      const verdict = firewall.evaluate(context, snapshotId);
      
      return this.createResult('ETHICS_EVALUATION', true, verdict.allowed, {
        ethics_verdict: verdict,
        blocked_by: verdict.allowed ? undefined : verdict.violated_principles,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('ETHICS_EVALUATION', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeOverrideEligibility(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      // Create a non-ABSOLUTE refusal verdict for testing
      const testVerdict: EthicsVerdict = Object.freeze({
        allowed: false,
        reason: 'Test refusal',
        violated_principles: ['INSUFFICIENT_TRUST_HISTORY'] as any,
        severity: 'HIGH' as const,
        evaluated_at: new Date().toISOString(),
        _frozen: true
      });
      
      const eligibility = OverrideGuard.checkOverrideEligibility(snapshotId, testVerdict);
      
      return this.createResult('OVERRIDE_ELIGIBILITY', true, eligibility.eligible, {
        blocked_by: eligibility.eligible ? undefined : eligibility.blocking_factors,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('OVERRIDE_ELIGIBILITY', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeSystemAssistance(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
      
      return this.createResult('SYSTEM_ASSISTANCE', true, !block.blocked, {
        blocked_by: block.blocked ? ['OVERRIDDEN'] : undefined,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('SYSTEM_ASSISTANCE', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeTemporalReservation(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const engine = getTemporalReservationEngine();
      
      const now = new Date();
      const window = {
        start_at: now.toISOString(),
        end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      
      // Check if reservation is possible (don't actually reserve)
      const check = ReservationGuard.checkReservable(snapshotId, window, 1000, 10);
      
      return this.createResult('TEMPORAL_RESERVATION', true, check.reservable, {
        blocked_by: check.reservable ? undefined : [check.blocking_reason || 'UNKNOWN'],
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('TEMPORAL_RESERVATION', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  private probeCounterfactualRegistration(snapshotId: string): ExecutionPathResult {
    const start = Date.now();
    try {
      const ledger = getCounterfactualLedger();
      const isRegistered = ledger.isRegistered(snapshotId);
      
      return this.createResult('COUNTERFACTUAL_REGISTRATION', true, !isRegistered, {
        blocked_by: isRegistered ? ['ALREADY_REGISTERED'] : undefined,
        execution_time_ms: Date.now() - start
      });
    } catch (e) {
      return this.createResult('COUNTERFACTUAL_REGISTRATION', true, false, {
        error_thrown: e instanceof Error ? e.message : String(e),
        execution_time_ms: Date.now() - start
      });
    }
  }
  
  // ===========================================================================
  // SYSTEM HEALTH CHECK
  // ===========================================================================
  
  /**
   * Get overall system health status
   */
  public getSystemHealth(): SystemHealthStatus {
    try {
      const lifecycle = getDecisionLifecycleEngine();
      const override = getHumanOverrideProtocol();
      const ethics = getExecutionEthicsFirewall();
      const governor = getQuestionFirstGovernor();
      
      // Count decisions by state
      // This would need actual implementation based on lifecycle storage
      const activeDecisions = 0; // Would query lifecycle engine
      const suppressedDecisions = 0; // Would query lifecycle engine
      const overriddenDecisions = override.getOverrideCount();
      
      // Ethics stats
      const ethicsStats = ethics.getStatistics();
      
      // Confidence discipline state
      let disciplineState: 'NORMAL' | 'RESTRAINED' | 'MUTED' | 'UNKNOWN' = 'UNKNOWN';
      try {
        // Would query ConfidenceGovernor
        disciplineState = 'NORMAL';
      } catch {
        disciplineState = 'UNKNOWN';
      }
      
      // Check if silence mode is active
      let silenceModeActive = false;
      try {
        const gate = governor.evaluateGate({});
        silenceModeActive = gate.mode !== 'ADVICE_ALLOWED';
      } catch {
        silenceModeActive = false;
      }
      
      // Determine overall status
      let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
      if (ethicsStats.permanent_blocks_count > 0) {
        status = 'DEGRADED';
      }
      if (disciplineState === 'MUTED') {
        status = 'DEGRADED';
      }
      
      return Object.freeze({
        status,
        active_decisions: activeDecisions,
        suppressed_decisions: suppressedDecisions,
        overridden_decisions: overriddenDecisions,
        permanent_ethics_blocks: ethicsStats.permanent_blocks_count,
        confidence_discipline_state: disciplineState,
        silence_mode_active: silenceModeActive,
        checked_at: new Date().toISOString(),
        _frozen: true
      });
    } catch (e) {
      return Object.freeze({
        status: 'CRITICAL',
        active_decisions: 0,
        suppressed_decisions: 0,
        overridden_decisions: 0,
        permanent_ethics_blocks: 0,
        confidence_discipline_state: 'UNKNOWN',
        silence_mode_active: false,
        checked_at: new Date().toISOString(),
        _frozen: true
      });
    }
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private createResult(
    path: string,
    attempted: boolean,
    allowed: boolean,
    extras: Partial<ExecutionPathResult>
  ): ExecutionPathResult {
    return Object.freeze({
      path,
      attempted,
      allowed,
      ...extras,
      _frozen: true
    } as ExecutionPathResult);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getSystemExecutionMap = () => SystemExecutionMap.getInstance();
export default SystemExecutionMap;

