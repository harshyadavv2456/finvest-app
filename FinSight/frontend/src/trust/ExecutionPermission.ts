/**
 * ExecutionPermission - Permission Gates
 * 
 * PHASE 23: Trust & Proof Layer
 * 
 * PURPOSE:
 * Control execution permissions based on trust history.
 * ExecutionEngine remains LOCKED until trust is proven.
 * 
 * LEVELS:
 * - SANDBOX_ONLY: Default, no real execution
 * - ALERTS_ONLY: Can send alerts, no execution
 * - PARTIAL_EXECUTION: Future - limited execution
 * - FULL_EXECUTION: Future - full execution
 * 
 * RULES:
 * - Permission increases ONLY if trust requirements met
 * - NO manual overrides
 * - FAIL CLOSED if trust data incomplete
 */

import { getTrustLedger, TrustScore, LedgerIntegrity } from './TrustLedger';
import { getConfidenceCalibration, CalibrationReport } from './ConfidenceCalibration';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

export type PermissionLevel = 
  | 'SANDBOX_ONLY'
  | 'ALERTS_ONLY'
  | 'PARTIAL_EXECUTION'  // Future
  | 'FULL_EXECUTION';    // Future

/**
 * PermissionRequirements - What's needed to unlock a level
 */
export interface PermissionRequirements {
  level: PermissionLevel;
  
  // Minimum requirements
  min_sandbox_decisions: number;
  min_accuracy_percent: number;
  min_days_of_tracking: number;
  min_trust_score: number;
  
  // Ratio requirements
  max_overconfidence_penalty: number;
  max_user_override_rate: number;  // How often user ignored FinVest and was right
  
  // Financial requirements
  regret_avoided_must_exceed_incurred: boolean;
  max_avg_regret_per_decision: number;
}

/**
 * PermissionStatus - Current permission state
 */
export interface PermissionStatus {
  current_level: PermissionLevel;
  next_level: PermissionLevel | null;
  
  // Current state
  is_locked: boolean;
  lock_reason: string;
  
  // Requirements for next level
  requirements_for_next: PermissionRequirements | null;
  progress_to_next: PermissionProgress | null;
  
  // Trust data
  trust_score: number;
  accuracy_percent: number;
  decisions_count: number;
  days_of_tracking: number;
  
  // Audit
  last_evaluated: string;
  evaluation_id: string;
}

/**
 * PermissionProgress - Progress towards next level
 */
export interface PermissionProgress {
  sandbox_decisions: { current: number; required: number; met: boolean };
  accuracy: { current: number; required: number; met: boolean };
  days_of_tracking: { current: number; required: number; met: boolean };
  trust_score: { current: number; required: number; met: boolean };
  overconfidence: { current: number; max_allowed: number; met: boolean };
  regret_ratio: { avoided: number; incurred: number; met: boolean };
  
  overall_progress_percent: number;
  blocking_requirements: string[];
}

/**
 * PermissionGate - Gate check result
 */
export interface PermissionGate {
  allowed: boolean;
  current_level: PermissionLevel;
  required_level: PermissionLevel;
  reason: string;
  missing_requirements: string[];
}

// =============================================================================
// REQUIREMENTS DEFINITIONS
// =============================================================================

const PERMISSION_REQUIREMENTS: Record<PermissionLevel, PermissionRequirements> = {
  SANDBOX_ONLY: {
    level: 'SANDBOX_ONLY',
    min_sandbox_decisions: 0,
    min_accuracy_percent: 0,
    min_days_of_tracking: 0,
    min_trust_score: 0,
    max_overconfidence_penalty: 100,
    max_user_override_rate: 100,
    regret_avoided_must_exceed_incurred: false,
    max_avg_regret_per_decision: Infinity
  },
  ALERTS_ONLY: {
    level: 'ALERTS_ONLY',
    min_sandbox_decisions: 10,
    min_accuracy_percent: 55,
    min_days_of_tracking: 14,
    min_trust_score: 30,
    max_overconfidence_penalty: 25,
    max_user_override_rate: 50,
    regret_avoided_must_exceed_incurred: false,
    max_avg_regret_per_decision: 50000
  },
  PARTIAL_EXECUTION: {
    level: 'PARTIAL_EXECUTION',
    min_sandbox_decisions: 50,
    min_accuracy_percent: 65,
    min_days_of_tracking: 60,
    min_trust_score: 60,
    max_overconfidence_penalty: 15,
    max_user_override_rate: 30,
    regret_avoided_must_exceed_incurred: true,
    max_avg_regret_per_decision: 25000
  },
  FULL_EXECUTION: {
    level: 'FULL_EXECUTION',
    min_sandbox_decisions: 100,
    min_accuracy_percent: 70,
    min_days_of_tracking: 180,
    min_trust_score: 75,
    max_overconfidence_penalty: 10,
    max_user_override_rate: 20,
    regret_avoided_must_exceed_incurred: true,
    max_avg_regret_per_decision: 15000
  }
};

const LEVEL_ORDER: PermissionLevel[] = [
  'SANDBOX_ONLY',
  'ALERTS_ONLY',
  'PARTIAL_EXECUTION',
  'FULL_EXECUTION'
];

// =============================================================================
// EXECUTION PERMISSION MANAGER
// =============================================================================

export class ExecutionPermissionManager {
  private static instance: ExecutionPermissionManager;
  private trustLedger = getTrustLedger();
  private calibration = getConfidenceCalibration();
  private auditLog = DecisionAuditLog.getInstance();
  
  // Current level (always starts at SANDBOX_ONLY)
  private currentLevel: PermissionLevel = 'SANDBOX_ONLY';
  
  // ExecutionEngine remains LOCKED
  private readonly EXECUTION_LOCKED = true;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ExecutionPermissionManager {
    if (!ExecutionPermissionManager.instance) {
      ExecutionPermissionManager.instance = new ExecutionPermissionManager();
    }
    return ExecutionPermissionManager.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_permission_level');
      if (stored) {
        const level = JSON.parse(stored) as PermissionLevel;
        // Validate level
        if (LEVEL_ORDER.includes(level)) {
          // Re-evaluate to ensure it's still valid
          this.evaluate();
        }
      }
    } catch (e) {
      // Start at SANDBOX_ONLY
      this.currentLevel = 'SANDBOX_ONLY';
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('finvest_permission_level', JSON.stringify(this.currentLevel));
    } catch (e) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'WARNING',
        summary: 'Failed to save permission level',
        details: { error: String(e) },
        actor: 'SYSTEM'
      });
    }
  }
  
  // ===========================================================================
  // EVALUATION
  // ===========================================================================
  
  /**
   * Evaluate current permission level
   * Level can only go UP, never down
   */
  public evaluate(): PermissionStatus {
    const evaluationId = `EVAL-${Date.now()}`;
    
    // Get trust data
    const trustScore = this.trustLedger.getTrustScore();
    const calibration = this.calibration.getCalibrationReport();
    const integrity = this.trustLedger.verifyIntegrity();
    
    // Check integrity first
    if (!integrity.valid) {
      this.auditLog.log({
        event_type: 'EXECUTION_BLOCKED',
        severity: 'WARNING',
        summary: 'Permission evaluation blocked: ledger integrity failed',
        details: { errors: integrity.errors },
        actor: 'ENGINE'
      });
      
      return this.createLockedStatus(
        'Trust ledger integrity check failed',
        trustScore,
        calibration,
        evaluationId
      );
    }
    
    // Find the highest level we qualify for
    let qualifiedLevel: PermissionLevel = 'SANDBOX_ONLY';
    
    for (const level of LEVEL_ORDER) {
      if (this.meetsRequirements(level, trustScore, calibration)) {
        qualifiedLevel = level;
      } else {
        break; // Stop at first unmet level
      }
    }
    
    // Level can only go up
    const currentIndex = LEVEL_ORDER.indexOf(this.currentLevel);
    const qualifiedIndex = LEVEL_ORDER.indexOf(qualifiedLevel);
    
    if (qualifiedIndex > currentIndex) {
      this.currentLevel = qualifiedLevel;
      this.saveToStorage();
      
      this.auditLog.log({
        event_type: 'USER_CONFIRMATION',
        severity: 'INFO',
        summary: `Permission level upgraded to ${qualifiedLevel}`,
        details: {
          from_level: LEVEL_ORDER[currentIndex],
          to_level: qualifiedLevel,
          trust_score: trustScore.net_trust_score,
          accuracy: trustScore.overall_accuracy * 100
        },
        actor: 'ENGINE'
      });
    }
    
    // Get next level requirements
    const nextLevelIndex = LEVEL_ORDER.indexOf(this.currentLevel) + 1;
    const nextLevel = nextLevelIndex < LEVEL_ORDER.length 
      ? LEVEL_ORDER[nextLevelIndex] 
      : null;
    
    const progress = nextLevel 
      ? this.computeProgress(nextLevel, trustScore, calibration)
      : null;
    
    return {
      current_level: this.currentLevel,
      next_level: nextLevel,
      is_locked: this.EXECUTION_LOCKED,
      lock_reason: this.EXECUTION_LOCKED 
        ? 'Execution is LOCKED. FinVest is in trust-building phase.'
        : '',
      requirements_for_next: nextLevel ? PERMISSION_REQUIREMENTS[nextLevel] : null,
      progress_to_next: progress,
      trust_score: trustScore.net_trust_score,
      accuracy_percent: trustScore.overall_accuracy * 100,
      decisions_count: trustScore.total_sandbox_decisions,
      days_of_tracking: trustScore.days_of_tracking,
      last_evaluated: new Date().toISOString(),
      evaluation_id: evaluationId
    };
  }
  
  /**
   * Check if requirements are met for a level
   */
  private meetsRequirements(
    level: PermissionLevel,
    trust: TrustScore,
    calibration: CalibrationReport
  ): boolean {
    const req = PERMISSION_REQUIREMENTS[level];
    
    if (trust.total_sandbox_decisions < req.min_sandbox_decisions) return false;
    if ((trust.overall_accuracy * 100) < req.min_accuracy_percent) return false;
    if (trust.days_of_tracking < req.min_days_of_tracking) return false;
    if (trust.net_trust_score < req.min_trust_score) return false;
    if (calibration.high.overconfidence_penalty > req.max_overconfidence_penalty) return false;
    
    if (req.regret_avoided_must_exceed_incurred) {
      if (trust.total_regret_incurred >= trust.total_regret_avoided) return false;
    }
    
    const avgRegret = trust.total_sandbox_decisions > 0
      ? (trust.total_regret_incurred / trust.total_sandbox_decisions)
      : 0;
    if (avgRegret > req.max_avg_regret_per_decision) return false;
    
    return true;
  }
  
  /**
   * Compute progress towards next level
   */
  private computeProgress(
    nextLevel: PermissionLevel,
    trust: TrustScore,
    calibration: CalibrationReport
  ): PermissionProgress {
    const req = PERMISSION_REQUIREMENTS[nextLevel];
    const blocking: string[] = [];
    let metCount = 0;
    const totalReqs = 6;
    
    // Sandbox decisions
    const decisionsMet = trust.total_sandbox_decisions >= req.min_sandbox_decisions;
    if (!decisionsMet) blocking.push(`Need ${req.min_sandbox_decisions - trust.total_sandbox_decisions} more decisions`);
    if (decisionsMet) metCount++;
    
    // Accuracy
    const accuracyPct = trust.overall_accuracy * 100;
    const accuracyMet = accuracyPct >= req.min_accuracy_percent;
    if (!accuracyMet) blocking.push(`Accuracy ${accuracyPct.toFixed(1)}% < required ${req.min_accuracy_percent}%`);
    if (accuracyMet) metCount++;
    
    // Days
    const daysMet = trust.days_of_tracking >= req.min_days_of_tracking;
    if (!daysMet) blocking.push(`Need ${req.min_days_of_tracking - trust.days_of_tracking} more days`);
    if (daysMet) metCount++;
    
    // Trust score
    const scoreMet = trust.net_trust_score >= req.min_trust_score;
    if (!scoreMet) blocking.push(`Trust score ${trust.net_trust_score} < required ${req.min_trust_score}`);
    if (scoreMet) metCount++;
    
    // Overconfidence
    const overconfMet = calibration.high.overconfidence_penalty <= req.max_overconfidence_penalty;
    if (!overconfMet) blocking.push(`Overconfidence penalty ${calibration.high.overconfidence_penalty.toFixed(1)}% > max ${req.max_overconfidence_penalty}%`);
    if (overconfMet) metCount++;
    
    // Regret ratio
    const regretMet = !req.regret_avoided_must_exceed_incurred || 
      trust.total_regret_avoided > trust.total_regret_incurred;
    if (!regretMet) blocking.push('Regret avoided must exceed regret incurred');
    if (regretMet) metCount++;
    
    return {
      sandbox_decisions: {
        current: trust.total_sandbox_decisions,
        required: req.min_sandbox_decisions,
        met: decisionsMet
      },
      accuracy: {
        current: accuracyPct,
        required: req.min_accuracy_percent,
        met: accuracyMet
      },
      days_of_tracking: {
        current: trust.days_of_tracking,
        required: req.min_days_of_tracking,
        met: daysMet
      },
      trust_score: {
        current: trust.net_trust_score,
        required: req.min_trust_score,
        met: scoreMet
      },
      overconfidence: {
        current: calibration.high.overconfidence_penalty,
        max_allowed: req.max_overconfidence_penalty,
        met: overconfMet
      },
      regret_ratio: {
        avoided: trust.total_regret_avoided,
        incurred: trust.total_regret_incurred,
        met: regretMet
      },
      overall_progress_percent: Math.round((metCount / totalReqs) * 100),
      blocking_requirements: blocking
    };
  }
  
  /**
   * Create locked status
   */
  private createLockedStatus(
    reason: string,
    trust: TrustScore,
    calibration: CalibrationReport,
    evaluationId: string
  ): PermissionStatus {
    return {
      current_level: 'SANDBOX_ONLY',
      next_level: 'ALERTS_ONLY',
      is_locked: true,
      lock_reason: reason,
      requirements_for_next: PERMISSION_REQUIREMENTS.ALERTS_ONLY,
      progress_to_next: this.computeProgress('ALERTS_ONLY', trust, calibration),
      trust_score: trust.net_trust_score,
      accuracy_percent: trust.overall_accuracy * 100,
      decisions_count: trust.total_sandbox_decisions,
      days_of_tracking: trust.days_of_tracking,
      last_evaluated: new Date().toISOString(),
      evaluation_id: evaluationId
    };
  }
  
  // ===========================================================================
  // PERMISSION CHECKS
  // ===========================================================================
  
  /**
   * Check if an action is allowed
   */
  public checkPermission(requiredLevel: PermissionLevel): PermissionGate {
    const status = this.evaluate();
    
    const currentIndex = LEVEL_ORDER.indexOf(status.current_level);
    const requiredIndex = LEVEL_ORDER.indexOf(requiredLevel);
    
    const allowed = currentIndex >= requiredIndex && !this.EXECUTION_LOCKED;
    
    const missing: string[] = [];
    if (this.EXECUTION_LOCKED) {
      missing.push('Execution is LOCKED');
    }
    if (currentIndex < requiredIndex) {
      missing.push(`Current level ${status.current_level} < required ${requiredLevel}`);
    }
    if (status.progress_to_next) {
      missing.push(...status.progress_to_next.blocking_requirements);
    }
    
    return {
      allowed,
      current_level: status.current_level,
      required_level: requiredLevel,
      reason: allowed 
        ? 'Permission granted' 
        : `Permission denied: ${missing.join('; ')}`,
      missing_requirements: missing
    };
  }
  
  /**
   * Get current level
   */
  public getCurrentLevel(): PermissionLevel {
    return this.currentLevel;
  }
  
  /**
   * Check if execution is locked
   */
  public isExecutionLocked(): boolean {
    return this.EXECUTION_LOCKED;
  }
  
  /**
   * Get requirements for a level
   */
  public getRequirements(level: PermissionLevel): PermissionRequirements {
    return { ...PERMISSION_REQUIREMENTS[level] };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getExecutionPermission = () => ExecutionPermissionManager.getInstance();
export default ExecutionPermissionManager;

