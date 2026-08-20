/**
 * InfluenceBudgetEngine - Global Influence Limiting
 * 
 * PHASE 38: Self-Limiting Growth & Power Containment (SLG)
 * 
 * PURPOSE:
 * Cap how much advice the system may give per time window.
 * Higher trust → LOWER advice budget.
 * Higher adoption → LOWER advice frequency.
 * 
 * DESIGN LAW:
 * If FinVest gets too good, too trusted, or too central —
 * it must reduce output, not increase it.
 * 
 * This is the opposite of SaaS logic. That's why it matters.
 */

import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * InfluenceBudget - Caps system advice output
 */
export interface InfluenceBudget {
  readonly window: 'DAY' | 'WEEK' | 'MONTH';
  readonly window_start: string;
  readonly window_end: string;
  readonly max_advice_events: number;
  readonly used_events: number;
  readonly remaining_events: number;
  readonly decay_rate: number; // slower recovery as trust increases (0-1)
  readonly exhausted: boolean;
  readonly _frozen: true;
}

/**
 * BudgetAllocation - Why budget was allocated this way
 */
export interface BudgetAllocation {
  readonly base_budget: number;
  readonly trust_penalty: number;
  readonly adoption_penalty: number;
  readonly dependency_penalty: number;
  readonly final_budget: number;
  readonly allocation_reason: string;
  readonly _frozen: true;
}

/**
 * BudgetExhaustionEvent - When budget runs out
 */
export interface BudgetExhaustionEvent {
  readonly event_id: string;
  readonly timestamp: string;
  readonly window: 'DAY' | 'WEEK' | 'MONTH';
  readonly used_events: number;
  readonly max_events: number;
  readonly recovery_at: string;
  readonly _frozen: true;
}

/**
 * SelfLimitEvent - Logged when system suppresses itself
 */
export interface SelfLimitEvent {
  readonly event_id: string;
  readonly timestamp: string;
  readonly reason: 'CENTRALITY_RISK' | 'INFLUENCE_EXHAUSTED' | 'DEPENDENCY_PREVENTION' | 'TRUST_TOO_HIGH';
  readonly snapshot_id?: string;
  readonly details: string;
  readonly _frozen: true;
}

// =============================================================================
// CONSTANTS (STRUCTURAL - NOT CONFIGURABLE)
// =============================================================================

/**
 * Base budget limits (before penalties)
 * These are structural, not adjustable.
 */
const BASE_BUDGETS = Object.freeze({
  DAY: 20,
  WEEK: 100,
  MONTH: 300
});

/**
 * Trust thresholds for budget reduction
 * Higher trust = LOWER budget (anti-SaaS logic)
 */
const TRUST_THRESHOLDS = Object.freeze({
  HIGH: 80,      // Trust >= 80 → heavy penalty
  MEDIUM: 60,    // Trust >= 60 → moderate penalty
  LOW: 40        // Trust >= 40 → light penalty
});

/**
 * Adoption rate thresholds
 */
const ADOPTION_THRESHOLDS = Object.freeze({
  HIGH: 0.85,    // 85% adoption → heavy penalty
  MEDIUM: 0.70,  // 70% adoption → moderate penalty
  LOW: 0.50      // 50% adoption → light penalty
});

/**
 * Dependency risk thresholds (user accepts rate)
 */
const DEPENDENCY_THRESHOLDS = Object.freeze({
  CRITICAL: 0.95,  // 95% acceptance → HARD CAP
  HIGH: 0.90,      // 90% → heavy penalty
  MEDIUM: 0.80     // 80% → moderate penalty
});

// =============================================================================
// INFLUENCE BUDGET ENGINE
// =============================================================================

export class InfluenceBudgetEngine {
  private static instance: InfluenceBudgetEngine;
  private auditLog = DecisionAuditLog.getInstance();
  
  // Current budgets (initialized in initializeBudgets via constructor)
  private dailyBudget!: InfluenceBudget;
  private weeklyBudget!: InfluenceBudget;
  private monthlyBudget!: InfluenceBudget;
  
  // Self-limit events
  private selfLimitEvents: SelfLimitEvent[] = [];
  
  // Metrics (read from TrustLedger, AdoptionScore, etc.)
  private currentTrustScore: number = 50;
  private currentAdoptionRate: number = 0.5;
  private currentAcceptanceRate: number = 0.7;
  
  private constructor() {
    this.loadFromStorage();
    this.initializeBudgets();
  }
  
  public static getInstance(): InfluenceBudgetEngine {
    if (!InfluenceBudgetEngine.instance) {
      InfluenceBudgetEngine.instance = new InfluenceBudgetEngine();
    }
    return InfluenceBudgetEngine.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_influence_budget');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.selfLimitEvents = parsed.selfLimitEvents || [];
        this.currentTrustScore = parsed.currentTrustScore || 50;
        this.currentAdoptionRate = parsed.currentAdoptionRate || 0.5;
        this.currentAcceptanceRate = parsed.currentAcceptanceRate || 0.7;
        
        // Restore budgets if valid
        if (parsed.dailyBudget && this.isWindowValid(parsed.dailyBudget)) {
          this.dailyBudget = parsed.dailyBudget;
        }
        if (parsed.weeklyBudget && this.isWindowValid(parsed.weeklyBudget)) {
          this.weeklyBudget = parsed.weeklyBudget;
        }
        if (parsed.monthlyBudget && this.isWindowValid(parsed.monthlyBudget)) {
          this.monthlyBudget = parsed.monthlyBudget;
        }
      }
    } catch (e) {
      console.error('Failed to load influence budget:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = {
        dailyBudget: this.dailyBudget,
        weeklyBudget: this.weeklyBudget,
        monthlyBudget: this.monthlyBudget,
        selfLimitEvents: this.selfLimitEvents.slice(-1000), // Keep last 1000
        currentTrustScore: this.currentTrustScore,
        currentAdoptionRate: this.currentAdoptionRate,
        currentAcceptanceRate: this.currentAcceptanceRate
      };
      localStorage.setItem('finvest_influence_budget', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save influence budget:', e);
    }
  }
  
  private isWindowValid(budget: InfluenceBudget): boolean {
    const now = new Date();
    const end = new Date(budget.window_end);
    return now < end;
  }
  
  // ===========================================================================
  // BUDGET INITIALIZATION
  // ===========================================================================
  
  private initializeBudgets(): void {
    const now = new Date();
    
    // Daily budget
    if (!this.dailyBudget || !this.isWindowValid(this.dailyBudget)) {
      this.dailyBudget = this.createBudget('DAY', now);
    }
    
    // Weekly budget
    if (!this.weeklyBudget || !this.isWindowValid(this.weeklyBudget)) {
      this.weeklyBudget = this.createBudget('WEEK', now);
    }
    
    // Monthly budget
    if (!this.monthlyBudget || !this.isWindowValid(this.monthlyBudget)) {
      this.monthlyBudget = this.createBudget('MONTH', now);
    }
    
    this.saveToStorage();
  }
  
  private createBudget(window: 'DAY' | 'WEEK' | 'MONTH', from: Date): InfluenceBudget {
    const allocation = this.computeAllocation(window);
    const windowDates = this.computeWindowDates(window, from);
    
    return Object.freeze({
      window,
      window_start: windowDates.start.toISOString(),
      window_end: windowDates.end.toISOString(),
      max_advice_events: allocation.final_budget,
      used_events: 0,
      remaining_events: allocation.final_budget,
      decay_rate: this.computeDecayRate(),
      exhausted: false,
      _frozen: true
    });
  }
  
  private computeWindowDates(window: 'DAY' | 'WEEK' | 'MONTH', from: Date): { start: Date; end: Date } {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    switch (window) {
      case 'DAY':
        end.setDate(end.getDate() + 1);
        break;
      case 'WEEK':
        end.setDate(end.getDate() + 7);
        break;
      case 'MONTH':
        end.setMonth(end.getMonth() + 1);
        break;
    }
    
    return { start, end };
  }
  
  // ===========================================================================
  // BUDGET COMPUTATION (ANTI-SAAS LOGIC)
  // ===========================================================================
  
  /**
   * Compute budget allocation with penalties
   * HIGHER TRUST = LOWER BUDGET
   */
  private computeAllocation(window: 'DAY' | 'WEEK' | 'MONTH'): BudgetAllocation {
    const baseBudget = BASE_BUDGETS[window];
    
    // Trust penalty: higher trust = less advice allowed
    let trustPenalty = 0;
    if (this.currentTrustScore >= TRUST_THRESHOLDS.HIGH) {
      trustPenalty = baseBudget * 0.40; // 40% reduction
    } else if (this.currentTrustScore >= TRUST_THRESHOLDS.MEDIUM) {
      trustPenalty = baseBudget * 0.25; // 25% reduction
    } else if (this.currentTrustScore >= TRUST_THRESHOLDS.LOW) {
      trustPenalty = baseBudget * 0.10; // 10% reduction
    }
    
    // Adoption penalty: higher adoption = less advice allowed
    let adoptionPenalty = 0;
    if (this.currentAdoptionRate >= ADOPTION_THRESHOLDS.HIGH) {
      adoptionPenalty = baseBudget * 0.30; // 30% reduction
    } else if (this.currentAdoptionRate >= ADOPTION_THRESHOLDS.MEDIUM) {
      adoptionPenalty = baseBudget * 0.15; // 15% reduction
    } else if (this.currentAdoptionRate >= ADOPTION_THRESHOLDS.LOW) {
      adoptionPenalty = baseBudget * 0.05; // 5% reduction
    }
    
    // Dependency penalty: high acceptance = HARD CAP
    let dependencyPenalty = 0;
    if (this.currentAcceptanceRate >= DEPENDENCY_THRESHOLDS.CRITICAL) {
      dependencyPenalty = baseBudget * 0.70; // 70% reduction (hard cap)
    } else if (this.currentAcceptanceRate >= DEPENDENCY_THRESHOLDS.HIGH) {
      dependencyPenalty = baseBudget * 0.40; // 40% reduction
    } else if (this.currentAcceptanceRate >= DEPENDENCY_THRESHOLDS.MEDIUM) {
      dependencyPenalty = baseBudget * 0.15; // 15% reduction
    }
    
    const totalPenalty = trustPenalty + adoptionPenalty + dependencyPenalty;
    const finalBudget = Math.max(1, Math.floor(baseBudget - totalPenalty)); // Minimum 1
    
    let reason = 'Normal allocation';
    if (this.currentAcceptanceRate >= DEPENDENCY_THRESHOLDS.CRITICAL) {
      reason = 'HARD CAP: User dependency risk critical';
    } else if (trustPenalty > adoptionPenalty && trustPenalty > dependencyPenalty) {
      reason = 'Trust too high - reducing influence';
    } else if (adoptionPenalty > dependencyPenalty) {
      reason = 'Adoption too high - reducing frequency';
    } else if (dependencyPenalty > 0) {
      reason = 'Dependency risk - limiting advice';
    }
    
    return Object.freeze({
      base_budget: baseBudget,
      trust_penalty: Math.floor(trustPenalty),
      adoption_penalty: Math.floor(adoptionPenalty),
      dependency_penalty: Math.floor(dependencyPenalty),
      final_budget: finalBudget,
      allocation_reason: reason,
      _frozen: true
    });
  }
  
  /**
   * Compute decay rate: slower recovery as trust increases
   */
  private computeDecayRate(): number {
    // Higher trust = slower budget recovery
    if (this.currentTrustScore >= TRUST_THRESHOLDS.HIGH) {
      return 0.3; // Very slow recovery
    } else if (this.currentTrustScore >= TRUST_THRESHOLDS.MEDIUM) {
      return 0.5; // Slow recovery
    } else if (this.currentTrustScore >= TRUST_THRESHOLDS.LOW) {
      return 0.7; // Moderate recovery
    }
    return 1.0; // Normal recovery
  }
  
  // ===========================================================================
  // MAIN API
  // ===========================================================================
  
  /**
   * Update metrics from external sources
   */
  public updateMetrics(params: {
    trustScore?: number;
    adoptionRate?: number;
    acceptanceRate?: number;
  }): void {
    if (params.trustScore !== undefined) {
      this.currentTrustScore = Math.max(0, Math.min(100, params.trustScore));
    }
    if (params.adoptionRate !== undefined) {
      this.currentAdoptionRate = Math.max(0, Math.min(1, params.adoptionRate));
    }
    if (params.acceptanceRate !== undefined) {
      this.currentAcceptanceRate = Math.max(0, Math.min(1, params.acceptanceRate));
    }
    
    // Recalculate budgets if metrics changed significantly
    this.recalculateBudgetsIfNeeded();
    this.saveToStorage();
  }
  
  private recalculateBudgetsIfNeeded(): void {
    // Check if current budgets are still valid
    this.initializeBudgets();
  }
  
  /**
   * Check if advice is allowed
   * Returns true if budget allows, false if exhausted
   */
  public canAdvise(): boolean {
    this.initializeBudgets(); // Ensure budgets are current
    
    // Check all windows - ALL must have budget remaining
    if (this.dailyBudget.remaining_events <= 0) return false;
    if (this.weeklyBudget.remaining_events <= 0) return false;
    if (this.monthlyBudget.remaining_events <= 0) return false;
    
    return true;
  }
  
  /**
   * Consume budget for an advice event
   * THROWS if budget exhausted
   */
  public consumeBudget(snapshotId?: string): void {
    this.initializeBudgets();
    
    if (!this.canAdvise()) {
      // Log self-limit event
      this.recordSelfLimit('INFLUENCE_EXHAUSTED', snapshotId, 
        'Budget exhausted - cannot advise until window resets');
      
      throw new Error(
        `INFLUENCE_BUDGET_EXHAUSTED: Cannot advise. ` +
        `Daily: ${this.dailyBudget.remaining_events}/${this.dailyBudget.max_advice_events}, ` +
        `Weekly: ${this.weeklyBudget.remaining_events}/${this.weeklyBudget.max_advice_events}, ` +
        `Monthly: ${this.monthlyBudget.remaining_events}/${this.monthlyBudget.max_advice_events}`
      );
    }
    
    // Consume from all windows
    this.dailyBudget = this.decrementBudget(this.dailyBudget);
    this.weeklyBudget = this.decrementBudget(this.weeklyBudget);
    this.monthlyBudget = this.decrementBudget(this.monthlyBudget);
    
    this.saveToStorage();
  }
  
  private decrementBudget(budget: InfluenceBudget): InfluenceBudget {
    const newUsed = budget.used_events + 1;
    const newRemaining = Math.max(0, budget.max_advice_events - newUsed);
    
    return Object.freeze({
      ...budget,
      used_events: newUsed,
      remaining_events: newRemaining,
      exhausted: newRemaining <= 0,
      _frozen: true
    });
  }
  
  /**
   * Get current budget status
   */
  public getBudgetStatus(): {
    daily: InfluenceBudget;
    weekly: InfluenceBudget;
    monthly: InfluenceBudget;
    allocation: BudgetAllocation;
  } {
    this.initializeBudgets();
    
    return {
      daily: this.dailyBudget,
      weekly: this.weeklyBudget,
      monthly: this.monthlyBudget,
      allocation: this.computeAllocation('DAY')
    };
  }
  
  /**
   * Record a self-limit event
   */
  public recordSelfLimit(
    reason: SelfLimitEvent['reason'],
    snapshotId?: string,
    details?: string
  ): void {
    const event: SelfLimitEvent = Object.freeze({
      event_id: `SELFLIMIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      reason,
      snapshot_id: snapshotId,
      details: details || `Self-limit triggered: ${reason}`,
      _frozen: true
    });
    
    this.selfLimitEvents.push(event);
    this.saveToStorage();
    
    // Log to audit
    this.auditLog.log({
      event_type: 'SELF_LIMIT_EVENT' as any,
      severity: 'WARNING',
      summary: `System self-limited: ${reason}`,
      details: {
        reason,
        snapshot_id: snapshotId,
        daily_remaining: this.dailyBudget.remaining_events,
        trust_score: this.currentTrustScore,
        acceptance_rate: this.currentAcceptanceRate
      },
      actor: 'SYSTEM'
    });
  }
  
  /**
   * Get self-limit events
   */
  public getSelfLimitEvents(limit: number = 50): readonly SelfLimitEvent[] {
    return Object.freeze([...this.selfLimitEvents].reverse().slice(0, limit));
  }
  
  /**
   * Get metrics
   */
  public getMetrics(): {
    trust_score: number;
    adoption_rate: number;
    acceptance_rate: number;
  } {
    return {
      trust_score: this.currentTrustScore,
      adoption_rate: this.currentAdoptionRate,
      acceptance_rate: this.currentAcceptanceRate
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getInfluenceBudgetEngine = () => InfluenceBudgetEngine.getInstance();
export default InfluenceBudgetEngine;
