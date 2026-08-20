/**
 * ExecutionPreAuthorization - Pre-Authorization for Execution
 * 
 * PHASE 26: Execution Pre-Authorization (NO REAL TRADES)
 * 
 * PURPOSE:
 * Track user consent per decision pattern.
 * Pre-authorization ≠ execution.
 * No path may place trades.
 * 
 * CONDITIONS for pre-auth:
 * - confidence ≥ X
 * - trust score ≥ Y
 * - adoption score ≥ Z
 * 
 * RULES:
 * - One-time ask only (never repeated)
 * - Fully auditable
 * - Revocable by user
 * - NO broker APIs
 * - NO execution
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getTrustLedger, TrustEntry } from '../trust/TrustLedger';
import { getAdoptionScore, AdoptionScoreResult } from '../adoption/AdoptionScore';
import { getExecutionPermission, PermissionLevel } from '../trust/ExecutionPermission';

// =============================================================================
// TYPES
// =============================================================================

/**
 * PreAuthStatus - Result of pre-authorization check
 */
export interface PreAuthStatus {
  readonly allowed: boolean;
  readonly reason: string;
  readonly granted_at?: string;
  readonly revoked_at?: string;
  readonly conditions_met: PreAuthConditions;
  readonly pattern_id: string;
  readonly user_id: string;
}

/**
 * PreAuthConditions - Conditions for pre-authorization
 */
export interface PreAuthConditions {
  readonly min_confidence: number;
  readonly min_trust_score: number;
  readonly min_adoption_score: number;
  readonly actual_confidence?: number;
  readonly actual_trust_score?: number;
  readonly actual_adoption_score?: number;
  readonly confidence_met: boolean;
  readonly trust_met: boolean;
  readonly adoption_met: boolean;
  readonly all_met: boolean;
}

/**
 * PreAuthGrant - A granted pre-authorization
 */
export interface PreAuthGrant {
  readonly id: string;
  readonly user_id: string;
  readonly pattern_id: string;
  readonly pattern_type: DecisionPatternType;
  readonly granted_at: string;
  readonly revoked_at?: string;
  readonly conditions_at_grant: PreAuthConditions;
  readonly consent_text: string;
  readonly is_active: boolean;
  readonly _frozen: true;
}

/**
 * DecisionPatternType - Types of decision patterns
 */
export type DecisionPatternType = 
  | 'BUY_HIGH_CONFIDENCE'      // BUY with confidence ≥ 80
  | 'SELL_TAX_OPTIMIZED'       // SELL for tax reasons
  | 'REBALANCE'                // Portfolio rebalancing
  | 'STOP_LOSS'                // Stop loss trigger
  | 'PROFIT_TAKING';           // Taking profits

/**
 * PreAuthRequest - Request for pre-authorization
 */
export interface PreAuthRequest {
  user_id: string;
  pattern_type: DecisionPatternType;
  current_confidence: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * HARD LOCK: Pre-authorization NEVER leads to execution
 */
const EXECUTION_BLOCKED = true as const;

/**
 * Default thresholds for pre-authorization
 */
const DEFAULT_THRESHOLDS = {
  min_confidence: 75,
  min_trust_score: 60,
  min_adoption_score: 50
} as const;

/**
 * Consent text templates
 */
const CONSENT_TEMPLATES: Record<DecisionPatternType, string> = {
  BUY_HIGH_CONFIDENCE: 'I authorize FinVest to flag high-confidence BUY opportunities for my review.',
  SELL_TAX_OPTIMIZED: 'I authorize FinVest to flag tax-optimized SELL opportunities for my review.',
  REBALANCE: 'I authorize FinVest to flag portfolio rebalancing opportunities for my review.',
  STOP_LOSS: 'I authorize FinVest to flag stop-loss triggers for my review.',
  PROFIT_TAKING: 'I authorize FinVest to flag profit-taking opportunities for my review.'
};

// =============================================================================
// EXECUTION PRE-AUTHORIZATION
// =============================================================================

export class ExecutionPreAuthorization {
  private static instance: ExecutionPreAuthorization;
  private auditLog = DecisionAuditLog.getInstance();
  private trustLedger = getTrustLedger();
  private adoptionScore = getAdoptionScore();
  private executionPermission = getExecutionPermission();
  
  // Grants storage
  private grants: Map<string, PreAuthGrant> = new Map();
  
  // Track asked patterns (one-time ask only)
  private askedPatterns: Map<string, Set<DecisionPatternType>> = new Map();
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): ExecutionPreAuthorization {
    if (!ExecutionPreAuthorization.instance) {
      ExecutionPreAuthorization.instance = new ExecutionPreAuthorization();
    }
    return ExecutionPreAuthorization.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_preauth_grants');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, grant] of Object.entries(parsed.grants || {})) {
          this.grants.set(id, grant as PreAuthGrant);
        }
        
        for (const [userId, patterns] of Object.entries(parsed.askedPatterns || {})) {
          this.askedPatterns.set(userId, new Set(patterns as DecisionPatternType[]));
        }
      }
    } catch (e) {
      console.error('Failed to load pre-auth grants:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const grantStore: Record<string, PreAuthGrant> = {};
      for (const [id, grant] of this.grants) {
        grantStore[id] = grant;
      }
      
      const askedStore: Record<string, DecisionPatternType[]> = {};
      for (const [userId, patterns] of this.askedPatterns) {
        askedStore[userId] = Array.from(patterns);
      }
      
      localStorage.setItem('finvest_preauth_grants', JSON.stringify({
        grants: grantStore,
        askedPatterns: askedStore
      }));
    } catch (e) {
      console.error('Failed to save pre-auth grants:', e);
    }
  }
  
  // ===========================================================================
  // CORE API
  // ===========================================================================
  
  /**
   * Check pre-authorization status for a pattern
   */
  public checkPreAuth(request: PreAuthRequest): PreAuthStatus {
    const { user_id, pattern_type, current_confidence } = request;
    const pattern_id = this.getPatternId(user_id, pattern_type);
    
    // Get current scores
    const trustEntry = this.trustLedger.getLatestEntry();
    const adoptionResult = this.adoptionScore.calculateScore();
    
    // Build conditions
    const conditions = this.buildConditions(
      current_confidence,
      trustEntry?.net_trust_score || 0,
      adoptionResult.net_adoption_score
    );
    
    // Check for existing grant
    const existingGrant = this.getActiveGrant(user_id, pattern_type);
    
    if (existingGrant) {
      return {
        allowed: conditions.all_met,
        reason: conditions.all_met 
          ? 'Pre-authorization active, conditions met'
          : `Pre-authorization active but conditions not met: ${this.getUnmetCondition(conditions)}`,
        granted_at: existingGrant.granted_at,
        conditions_met: conditions,
        pattern_id,
        user_id
      };
    }
    
    // No grant - check if we should ask
    return {
      allowed: false,
      reason: 'No pre-authorization granted',
      conditions_met: conditions,
      pattern_id,
      user_id
    };
  }
  
  /**
   * Check if we should ask user for pre-authorization
   * ONE-TIME ASK ONLY - never repeated for same pattern
   */
  public shouldAskForPreAuth(user_id: string, pattern_type: DecisionPatternType): boolean {
    // Already asked?
    const asked = this.askedPatterns.get(user_id);
    if (asked?.has(pattern_type)) {
      return false; // Never ask again
    }
    
    // Already have grant?
    const existingGrant = this.getActiveGrant(user_id, pattern_type);
    if (existingGrant) {
      return false; // Already granted
    }
    
    // Check if conditions could be met
    const trustEntry = this.trustLedger.getLatestEntry();
    const adoptionResult = this.adoptionScore.calculateScore();
    
    // Only ask if trust and adoption scores are sufficient
    if ((trustEntry?.net_trust_score || 0) < DEFAULT_THRESHOLDS.min_trust_score) {
      return false; // Trust too low
    }
    
    if (adoptionResult.net_adoption_score < DEFAULT_THRESHOLDS.min_adoption_score) {
      return false; // Adoption too low
    }
    
    return true; // Can ask
  }
  
  /**
   * Grant pre-authorization
   */
  public grantPreAuth(
    user_id: string,
    pattern_type: DecisionPatternType,
    current_confidence: number
  ): PreAuthGrant {
    const pattern_id = this.getPatternId(user_id, pattern_type);
    
    // Get current scores
    const trustEntry = this.trustLedger.getLatestEntry();
    const adoptionResult = this.adoptionScore.calculateScore();
    
    // Build conditions
    const conditions = this.buildConditions(
      current_confidence,
      trustEntry?.net_trust_score || 0,
      adoptionResult.net_adoption_score
    );
    
    // Create grant
    const grant: PreAuthGrant = Object.freeze({
      id: `PREAUTH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id,
      pattern_id,
      pattern_type,
      granted_at: new Date().toISOString(),
      conditions_at_grant: conditions,
      consent_text: CONSENT_TEMPLATES[pattern_type],
      is_active: true,
      _frozen: true
    });
    
    this.grants.set(grant.id, grant);
    
    // Mark as asked
    if (!this.askedPatterns.has(user_id)) {
      this.askedPatterns.set(user_id, new Set());
    }
    this.askedPatterns.get(user_id)!.add(pattern_type);
    
    this.saveToStorage();
    
    // Audit
    this.auditLog.log({
      event_type: 'USER_CONFIRMATION',
      severity: 'INFO',
      summary: `Pre-authorization granted: ${pattern_type}`,
      details: {
        grant_id: grant.id,
        user_id,
        pattern_type,
        conditions,
        consent_text: grant.consent_text
      },
      actor: 'USER'
    });
    
    return grant;
  }
  
  /**
   * Revoke pre-authorization
   */
  public revokePreAuth(grant_id: string): PreAuthGrant | null {
    const grant = this.grants.get(grant_id);
    
    if (!grant || !grant.is_active) {
      return null;
    }
    
    // Create revoked version
    const revokedGrant: PreAuthGrant = Object.freeze({
      ...grant,
      revoked_at: new Date().toISOString(),
      is_active: false,
      _frozen: true
    });
    
    this.grants.set(grant_id, revokedGrant);
    this.saveToStorage();
    
    // Audit
    this.auditLog.log({
      event_type: 'USER_REJECTION',
      severity: 'INFO',
      summary: `Pre-authorization revoked: ${grant.pattern_type}`,
      details: {
        grant_id,
        user_id: grant.user_id,
        pattern_type: grant.pattern_type,
        revoked_at: revokedGrant.revoked_at
      },
      actor: 'USER'
    });
    
    return revokedGrant;
  }
  
  /**
   * Record that user was asked (declined or dismissed)
   */
  public recordAsked(user_id: string, pattern_type: DecisionPatternType): void {
    if (!this.askedPatterns.has(user_id)) {
      this.askedPatterns.set(user_id, new Set());
    }
    this.askedPatterns.get(user_id)!.add(pattern_type);
    
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'USER_REJECTION',
      severity: 'INFO',
      summary: `Pre-authorization declined: ${pattern_type}`,
      details: { user_id, pattern_type },
      actor: 'USER'
    });
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get active grant for user and pattern
   */
  public getActiveGrant(user_id: string, pattern_type: DecisionPatternType): PreAuthGrant | null {
    for (const grant of this.grants.values()) {
      if (grant.user_id === user_id && 
          grant.pattern_type === pattern_type && 
          grant.is_active) {
        return grant;
      }
    }
    return null;
  }
  
  /**
   * Get all grants for user
   */
  public getGrantsForUser(user_id: string): PreAuthGrant[] {
    return Array.from(this.grants.values())
      .filter(g => g.user_id === user_id);
  }
  
  /**
   * Get all active grants for user
   */
  public getActiveGrantsForUser(user_id: string): PreAuthGrant[] {
    return this.getGrantsForUser(user_id).filter(g => g.is_active);
  }
  
  /**
   * Check if pattern was already asked
   */
  public wasPatternAsked(user_id: string, pattern_type: DecisionPatternType): boolean {
    return this.askedPatterns.get(user_id)?.has(pattern_type) || false;
  }
  
  // ===========================================================================
  // CONDITIONS
  // ===========================================================================
  
  private buildConditions(
    confidence: number,
    trustScore: number,
    adoptionScore: number
  ): PreAuthConditions {
    const confidenceMet = confidence >= DEFAULT_THRESHOLDS.min_confidence;
    const trustMet = trustScore >= DEFAULT_THRESHOLDS.min_trust_score;
    const adoptionMet = adoptionScore >= DEFAULT_THRESHOLDS.min_adoption_score;
    
    return {
      min_confidence: DEFAULT_THRESHOLDS.min_confidence,
      min_trust_score: DEFAULT_THRESHOLDS.min_trust_score,
      min_adoption_score: DEFAULT_THRESHOLDS.min_adoption_score,
      actual_confidence: confidence,
      actual_trust_score: trustScore,
      actual_adoption_score: adoptionScore,
      confidence_met: confidenceMet,
      trust_met: trustMet,
      adoption_met: adoptionMet,
      all_met: confidenceMet && trustMet && adoptionMet
    };
  }
  
  private getUnmetCondition(conditions: PreAuthConditions): string {
    const unmet: string[] = [];
    if (!conditions.confidence_met) unmet.push('confidence');
    if (!conditions.trust_met) unmet.push('trust');
    if (!conditions.adoption_met) unmet.push('adoption');
    return unmet.join(', ');
  }
  
  private getPatternId(user_id: string, pattern_type: DecisionPatternType): string {
    return `${user_id}:${pattern_type}`;
  }
  
  // ===========================================================================
  // EXECUTION BLOCK (CRITICAL)
  // ===========================================================================
  
  /**
   * HARD LOCK: Execution is ALWAYS blocked
   * Pre-authorization NEVER leads to actual execution
   */
  public readonly EXECUTION_BLOCKED = EXECUTION_BLOCKED;
  
  /**
   * Check if execution would be allowed
   * ALWAYS returns false - execution is blocked
   */
  public isExecutionAllowed(): false {
    // This ALWAYS returns false
    // Pre-authorization ≠ execution
    return false;
  }
  
  /**
   * Attempt execution - ALWAYS throws
   */
  public attemptExecution(): never {
    this.auditLog.log({
      event_type: 'SYSTEM_ERROR',
      severity: 'ERROR',
      summary: 'EXECUTION BLOCKED: Pre-authorization does not permit execution',
      details: {
        reason: 'Pre-authorization is for flagging only, not execution',
        execution_blocked: true
      },
      actor: 'ENGINE'
    });
    
    throw new Error(
      'EXECUTION_BLOCKED: Pre-authorization does NOT grant execution permission. ' +
      'This is by design. Pre-auth flags opportunities for user review only.'
    );
  }
  
  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  
  public getStats(): {
    total_grants: number;
    active_grants: number;
    revoked_grants: number;
    patterns_asked: number;
    execution_blocked: true;
  } {
    const all = Array.from(this.grants.values());
    const active = all.filter(g => g.is_active);
    const revoked = all.filter(g => !g.is_active);
    
    let patternsAsked = 0;
    for (const patterns of this.askedPatterns.values()) {
      patternsAsked += patterns.size;
    }
    
    return {
      total_grants: all.length,
      active_grants: active.length,
      revoked_grants: revoked.length,
      patterns_asked: patternsAsked,
      execution_blocked: true
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getExecutionPreAuthorization = () => ExecutionPreAuthorization.getInstance();
export default ExecutionPreAuthorization;

