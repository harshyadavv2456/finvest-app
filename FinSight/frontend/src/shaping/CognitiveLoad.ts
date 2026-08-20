/**
 * CognitiveLoad - Cognitive Load Budget
 * 
 * PHASE 25: Adaptive Decision Shaping (ADS)
 * 
 * PURPOSE:
 * Track cognitive load per user and auto-simplify when exceeded.
 * 
 * TRACKS per user:
 * - avg_time_to_decide
 * - ignore_rate
 * - overload_events
 * 
 * ENFORCES:
 * - max bullets
 * - max metrics
 * - auto-simplification when exceeded
 */

import { getDecisionAdoption, AdoptionStats } from '../adoption/DecisionAdoption';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// =============================================================================
// TYPES
// =============================================================================

/**
 * CognitiveLoadProfile - User's cognitive load profile
 */
export interface CognitiveLoadProfile {
  user_id: string;
  created_at: string;
  updated_at: string;
  
  // Time metrics
  avg_time_to_decide_seconds: number;
  median_time_to_decide_seconds: number;
  fast_decisions: number;      // Under 60 seconds
  slow_decisions: number;      // Over 10 minutes
  
  // Engagement metrics
  ignore_rate: number;         // 0-1
  abandon_rate: number;        // Started reading, gave up
  scroll_depth_avg: number;    // 0-1, how far they scroll
  
  // Overload indicators
  overload_events: number;     // Times they showed overload
  consecutive_ignores: number; // Current streak of ignores
  
  // Derived budget
  max_bullets_budget: number;
  max_metrics_budget: number;
  simplification_level: number; // 0=full, 3=minimal
  
  // Load score (0=easy, 100=overloaded)
  current_load_score: number;
  
  // Trend
  load_trend: 'DECREASING' | 'STABLE' | 'INCREASING';
}

/**
 * OverloadEvent - When user showed signs of overload
 */
export interface OverloadEvent {
  id: string;
  timestamp: string;
  event_type: OverloadEventType;
  decision_id?: string;
  details: Record<string, unknown>;
}

export type OverloadEventType = 
  | 'IGNORE_STREAK'       // Multiple consecutive ignores
  | 'LONG_DECISION_TIME'  // Took too long to decide
  | 'ABANDON'             // Started but didn't finish
  | 'BACK_NAVIGATION'     // Went back multiple times
  | 'HELP_REQUEST';       // Asked for help/clarification

/**
 * SimplificationLevel - Levels of simplification
 */
export interface SimplificationLevel {
  level: number;
  name: string;
  max_bullets: number;
  max_metrics: number;
  hide_charts: boolean;
  hide_scenarios: boolean;
  headline_only_first: boolean;
}

// =============================================================================
// SIMPLIFICATION LEVELS
// =============================================================================

const SIMPLIFICATION_LEVELS: SimplificationLevel[] = [
  {
    level: 0,
    name: 'FULL',
    max_bullets: 8,
    max_metrics: 8,
    hide_charts: false,
    hide_scenarios: false,
    headline_only_first: false
  },
  {
    level: 1,
    name: 'REDUCED',
    max_bullets: 5,
    max_metrics: 5,
    hide_charts: false,
    hide_scenarios: true,
    headline_only_first: false
  },
  {
    level: 2,
    name: 'SIMPLIFIED',
    max_bullets: 3,
    max_metrics: 4,
    hide_charts: true,
    hide_scenarios: true,
    headline_only_first: true
  },
  {
    level: 3,
    name: 'MINIMAL',
    max_bullets: 2,
    max_metrics: 3,
    hide_charts: true,
    hide_scenarios: true,
    headline_only_first: true
  }
];

// =============================================================================
// COGNITIVE LOAD MANAGER
// =============================================================================

export class CognitiveLoadManager {
  private static instance: CognitiveLoadManager;
  private adoption = getDecisionAdoption();
  private auditLog = DecisionAuditLog.getInstance();
  
  // User profiles
  private profiles: Map<string, CognitiveLoadProfile> = new Map();
  
  // Overload events
  private overloadEvents: Map<string, OverloadEvent[]> = new Map();
  
  // Thresholds
  private readonly LONG_DECISION_THRESHOLD = 600; // 10 minutes
  private readonly IGNORE_STREAK_THRESHOLD = 3;
  private readonly HIGH_LOAD_THRESHOLD = 70;
  
  private constructor() {
    this.loadFromStorage();
  }
  
  public static getInstance(): CognitiveLoadManager {
    if (!CognitiveLoadManager.instance) {
      CognitiveLoadManager.instance = new CognitiveLoadManager();
    }
    return CognitiveLoadManager.instance;
  }
  
  // ===========================================================================
  // STORAGE
  // ===========================================================================
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_cognitive_profiles');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, profile] of Object.entries(parsed)) {
          this.profiles.set(id, profile as CognitiveLoadProfile);
        }
      }
      
      const events = localStorage.getItem('finvest_overload_events');
      if (events) {
        const parsed = JSON.parse(events);
        for (const [userId, userEvents] of Object.entries(parsed)) {
          this.overloadEvents.set(userId, userEvents as OverloadEvent[]);
        }
      }
    } catch (e) {
      console.error('Failed to load cognitive profiles:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      const profileStore: Record<string, CognitiveLoadProfile> = {};
      for (const [id, profile] of this.profiles) {
        profileStore[id] = profile;
      }
      localStorage.setItem('finvest_cognitive_profiles', JSON.stringify(profileStore));
      
      const eventStore: Record<string, OverloadEvent[]> = {};
      for (const [userId, events] of this.overloadEvents) {
        eventStore[userId] = events;
      }
      localStorage.setItem('finvest_overload_events', JSON.stringify(eventStore));
    } catch (e) {
      console.error('Failed to save cognitive profiles:', e);
    }
  }
  
  // ===========================================================================
  // PROFILE MANAGEMENT
  // ===========================================================================
  
  /**
   * Get or create user profile
   * Creates default profile if none exists (logged behavior)
   */
  public getProfile(userId: string = 'default'): CognitiveLoadProfile {
    let profile = this.profiles.get(userId);
    
    if (!profile) {
      // Log that we're creating a new profile
      this.auditLog.log({
        event_type: 'CONTEXT_CREATED',
        severity: 'INFO',
        summary: `Creating new cognitive profile for ${userId}`,
        details: { user_id: userId, is_new: true },
        actor: 'ENGINE'
      });
      
      profile = this.createProfile(userId);
      this.profiles.set(userId, profile);
      this.saveToStorage();
    }
    
    return profile;
  }
  
  /**
   * Require existing profile - FAIL CLOSED if not found
   * Use this when profile MUST exist (e.g., after shaping decisions made)
   */
  public requireProfile(userId: string): CognitiveLoadProfile {
    const profile = this.profiles.get(userId);
    
    if (!profile) {
      this.auditLog.log({
        event_type: 'SYSTEM_ERROR',
        severity: 'ERROR',
        summary: `Required cognitive profile not found: ${userId}`,
        details: { user_id: userId },
        actor: 'ENGINE'
      });
      throw new Error(`COGNITIVE_FAIL_CLOSED: Profile for ${userId} not found. Cannot proceed without profile data.`);
    }
    
    return profile;
  }
  
  /**
   * Create new profile
   */
  private createProfile(userId: string): CognitiveLoadProfile {
    const stats = this.adoption.getStats();
    
    return {
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      avg_time_to_decide_seconds: stats.avg_time_to_action_seconds || 300,
      median_time_to_decide_seconds: stats.median_time_to_action_seconds || 180,
      fast_decisions: 0,
      slow_decisions: 0,
      ignore_rate: stats.ignore_rate || 0,
      abandon_rate: 0,
      scroll_depth_avg: 0.5,
      overload_events: 0,
      consecutive_ignores: 0,
      max_bullets_budget: 5,
      max_metrics_budget: 5,
      simplification_level: 0,
      current_load_score: 30,
      load_trend: 'STABLE'
    };
  }
  
  /**
   * Update profile based on new decision data
   */
  public updateProfile(
    userId: string,
    decisionTimeSeconds: number,
    wasIgnored: boolean
  ): void {
    const profile = this.getProfile(userId);
    const now = new Date().toISOString();
    
    // Update time metrics
    const alpha = 0.2; // Exponential moving average
    profile.avg_time_to_decide_seconds = 
      alpha * decisionTimeSeconds + (1 - alpha) * profile.avg_time_to_decide_seconds;
    
    if (decisionTimeSeconds < 60) {
      profile.fast_decisions++;
    } else if (decisionTimeSeconds > this.LONG_DECISION_THRESHOLD) {
      profile.slow_decisions++;
      this.recordOverloadEvent(userId, 'LONG_DECISION_TIME', { time: decisionTimeSeconds });
    }
    
    // Update ignore tracking
    if (wasIgnored) {
      profile.consecutive_ignores++;
      if (profile.consecutive_ignores >= this.IGNORE_STREAK_THRESHOLD) {
        this.recordOverloadEvent(userId, 'IGNORE_STREAK', { 
          streak: profile.consecutive_ignores 
        });
      }
    } else {
      profile.consecutive_ignores = 0;
    }
    
    // Recalculate ignore rate (exponential moving average)
    const newIgnoreValue = wasIgnored ? 1 : 0;
    profile.ignore_rate = alpha * newIgnoreValue + (1 - alpha) * profile.ignore_rate;
    
    // Recalculate load score
    profile.current_load_score = this.calculateLoadScore(profile);
    
    // Update simplification level
    const oldLevel = profile.simplification_level;
    profile.simplification_level = this.determineSimplificationLevel(profile);
    
    // Update budgets
    const levelConfig = SIMPLIFICATION_LEVELS[profile.simplification_level];
    profile.max_bullets_budget = levelConfig.max_bullets;
    profile.max_metrics_budget = levelConfig.max_metrics;
    
    // Update trend
    profile.load_trend = this.calculateTrend(profile, oldLevel);
    
    profile.updated_at = now;
    this.profiles.set(userId, profile);
    this.saveToStorage();
    
    // Log if simplification level changed
    if (oldLevel !== profile.simplification_level) {
      this.auditLog.log({
        event_type: 'POLICY_UPDATE',
        severity: 'INFO',
        summary: `Cognitive load: simplification level ${oldLevel} → ${profile.simplification_level}`,
        details: {
          user_id: userId,
          old_level: oldLevel,
          new_level: profile.simplification_level,
          load_score: profile.current_load_score
        },
        actor: 'ENGINE'
      });
    }
  }
  
  // ===========================================================================
  // LOAD CALCULATION
  // ===========================================================================
  
  /**
   * Calculate current load score
   */
  private calculateLoadScore(profile: CognitiveLoadProfile): number {
    let score = 0;
    
    // Time factor (0-30 points)
    if (profile.avg_time_to_decide_seconds > 600) {
      score += 30;
    } else if (profile.avg_time_to_decide_seconds > 300) {
      score += 20;
    } else if (profile.avg_time_to_decide_seconds > 120) {
      score += 10;
    }
    
    // Ignore rate factor (0-30 points)
    score += profile.ignore_rate * 30;
    
    // Consecutive ignores (0-20 points)
    score += Math.min(20, profile.consecutive_ignores * 5);
    
    // Overload events (0-20 points)
    const recentOverloads = this.getRecentOverloadEvents(profile.user_id, 7);
    score += Math.min(20, recentOverloads.length * 4);
    
    return Math.min(100, Math.round(score));
  }
  
  /**
   * Determine simplification level based on load
   */
  private determineSimplificationLevel(profile: CognitiveLoadProfile): number {
    if (profile.current_load_score >= 80) return 3; // MINIMAL
    if (profile.current_load_score >= 60) return 2; // SIMPLIFIED
    if (profile.current_load_score >= 40) return 1; // REDUCED
    return 0; // FULL
  }
  
  /**
   * Calculate trend
   */
  private calculateTrend(
    profile: CognitiveLoadProfile,
    oldLevel: number
  ): CognitiveLoadProfile['load_trend'] {
    if (profile.simplification_level > oldLevel) return 'INCREASING';
    if (profile.simplification_level < oldLevel) return 'DECREASING';
    return 'STABLE';
  }
  
  // ===========================================================================
  // OVERLOAD EVENTS
  // ===========================================================================
  
  /**
   * Record an overload event
   */
  public recordOverloadEvent(
    userId: string,
    eventType: OverloadEventType,
    details: Record<string, unknown>
  ): void {
    const event: OverloadEvent = {
      id: `OL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      details
    };
    
    if (!this.overloadEvents.has(userId)) {
      this.overloadEvents.set(userId, []);
    }
    
    this.overloadEvents.get(userId)!.push(event);
    
    // Update profile
    const profile = this.getProfile(userId);
    profile.overload_events++;
    this.profiles.set(userId, profile);
    
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'WARNING',
      summary: `Overload event: ${eventType}`,
      details: { user_id: userId, event_type: eventType, ...details },
      actor: 'ENGINE'
    });
  }
  
  /**
   * Get recent overload events
   */
  public getRecentOverloadEvents(userId: string, days: number = 7): OverloadEvent[] {
    const events = this.overloadEvents.get(userId) || [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    
    return events.filter(e => new Date(e.timestamp).getTime() > cutoff);
  }
  
  // ===========================================================================
  // BUDGET ENFORCEMENT
  // ===========================================================================
  
  /**
   * Get current budget for user
   */
  public getBudget(userId: string = 'default'): SimplificationLevel {
    const profile = this.getProfile(userId);
    return SIMPLIFICATION_LEVELS[profile.simplification_level];
  }
  
  /**
   * Check if content exceeds budget
   */
  public exceedsBudget(
    userId: string,
    bulletCount: number,
    metricCount: number
  ): boolean {
    const budget = this.getBudget(userId);
    return bulletCount > budget.max_bullets || metricCount > budget.max_metrics;
  }
  
  /**
   * Get simplified limits
   */
  public getSimplifiedLimits(userId: string = 'default'): {
    maxBullets: number;
    maxMetrics: number;
    hideCharts: boolean;
    hideScenarios: boolean;
  } {
    const budget = this.getBudget(userId);
    return {
      maxBullets: budget.max_bullets,
      maxMetrics: budget.max_metrics,
      hideCharts: budget.hide_charts,
      hideScenarios: budget.hide_scenarios
    };
  }
  
  /**
   * Should auto-simplify
   */
  public shouldAutoSimplify(userId: string = 'default'): boolean {
    const profile = this.getProfile(userId);
    return profile.current_load_score >= this.HIGH_LOAD_THRESHOLD;
  }
  
  // ===========================================================================
  // RESET / RECOVERY
  // ===========================================================================
  
  /**
   * Reset overload state (e.g., after user takes a break)
   */
  public resetOverloadState(userId: string): void {
    const profile = this.getProfile(userId);
    
    profile.consecutive_ignores = 0;
    profile.current_load_score = Math.max(0, profile.current_load_score - 20);
    profile.simplification_level = this.determineSimplificationLevel(profile);
    
    this.profiles.set(userId, profile);
    this.saveToStorage();
    
    this.auditLog.log({
      event_type: 'POLICY_UPDATE',
      severity: 'INFO',
      summary: 'Cognitive load state reset',
      details: { user_id: userId, new_load_score: profile.current_load_score },
      actor: 'USER'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getCognitiveLoad = () => CognitiveLoadManager.getInstance();
export default CognitiveLoadManager;

