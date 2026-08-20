/**
 * UsageTracker - UX Observability Tracking
 * 
 * PHASE 43: Real Deployment & Paper Mode Go-Live
 * 
 * This module tracks user behavior for observability ONLY.
 * 
 * TRACKED METRICS:
 * - Time between narrative generation and user open
 * - Decisions ignored vs acted upon
 * - Positions held without user review
 * - Question-first triggers
 * - Silence triggers
 * - Hesitation (time-to-decision)
 * 
 * RULES:
 * - NO behavior modification
 * - NO nudging
 * - NO ranking changes
 * - Observation ONLY
 */

// =============================================================================
// TYPES
// =============================================================================

export type UserAction = 
  | 'NARRATIVE_OPENED'
  | 'DECISION_VIEWED'
  | 'DECISION_APPROVED'
  | 'DECISION_REJECTED'
  | 'DECISION_IGNORED'
  | 'POSITION_REVIEWED'
  | 'QUESTION_ANSWERED'
  | 'QUESTION_IGNORED'
  | 'SILENCE_ACKNOWLEDGED'
  | 'PAGE_VISIT'
  | 'SESSION_START'
  | 'SESSION_END';

export interface UsageEvent {
  readonly event_id: string;
  readonly event_type: UserAction;
  readonly timestamp: string;
  readonly context: Record<string, unknown>;
  readonly session_id: string;
}

export interface HesitationMetric {
  readonly decision_id: string;
  readonly time_to_view_ms: number;
  readonly time_to_action_ms: number | null;
  readonly action_taken: 'APPROVED' | 'REJECTED' | 'IGNORED';
}

export interface NarrativeConsumption {
  readonly narrative_date: string;
  readonly generated_at: string;
  readonly opened_at: string | null;
  readonly time_to_open_ms: number | null;
  readonly fully_read: boolean;
  readonly positions_reviewed: string[];
}

export interface DailyUsageSummary {
  readonly date: string;
  readonly session_count: number;
  readonly total_session_time_ms: number;
  readonly decisions_viewed: number;
  readonly decisions_acted_upon: number;
  readonly decisions_ignored: number;
  readonly avg_hesitation_ms: number;
  readonly narrative_consumption: NarrativeConsumption | null;
  readonly question_triggers: number;
  readonly silence_triggers: number;
}

// =============================================================================
// USAGE TRACKER
// =============================================================================

export class UsageTracker {
  private static instance: UsageTracker;
  private events: UsageEvent[] = [];
  private currentSessionId: string | null = null;
  private sessionStartTime: number | null = null;
  private decisionViewTimes: Map<string, number> = new Map();
  
  private constructor() {
    this.loadFromStorage();
    this.startSession();
  }
  
  public static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_usage_events');
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch {}
  }
  
  private saveToStorage(): void {
    try {
      // Keep only last 1000 events
      const recent = this.events.slice(-1000);
      localStorage.setItem('finvest_usage_events', JSON.stringify(recent));
    } catch {}
  }
  
  private generateEventId(): string {
    return `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateSessionId(): string {
    return `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Start a new session
   */
  private startSession(): void {
    this.currentSessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    
    this.track('SESSION_START', {});
  }
  
  /**
   * End the current session
   */
  public endSession(): void {
    if (this.currentSessionId && this.sessionStartTime) {
      const duration = Date.now() - this.sessionStartTime;
      this.track('SESSION_END', { duration_ms: duration });
    }
    
    this.currentSessionId = null;
    this.sessionStartTime = null;
  }
  
  /**
   * Track a usage event
   */
  public track(eventType: UserAction, context: Record<string, unknown>): void {
    const event: UsageEvent = {
      event_id: this.generateEventId(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      context,
      session_id: this.currentSessionId || 'UNKNOWN'
    };
    
    this.events.push(event);
    this.saveToStorage();
    
    console.debug(`[USAGE] ${eventType}`, context);
  }
  
  // ===========================================================================
  // SPECIFIC TRACKING METHODS
  // ===========================================================================
  
  /**
   * Track when daily narrative is opened
   */
  public trackNarrativeOpened(narrativeDate: string, generatedAt: string): void {
    const timeToOpen = Date.now() - new Date(generatedAt).getTime();
    
    this.track('NARRATIVE_OPENED', {
      narrative_date: narrativeDate,
      generated_at: generatedAt,
      time_to_open_ms: timeToOpen
    });
  }
  
  /**
   * Track when a decision is viewed
   */
  public trackDecisionViewed(decisionId: string, symbol: string): void {
    this.decisionViewTimes.set(decisionId, Date.now());
    
    this.track('DECISION_VIEWED', {
      decision_id: decisionId,
      symbol
    });
  }
  
  /**
   * Track when a decision is acted upon
   */
  public trackDecisionAction(
    decisionId: string, 
    action: 'APPROVED' | 'REJECTED' | 'IGNORED',
    reason?: string
  ): void {
    const viewTime = this.decisionViewTimes.get(decisionId);
    const hesitationMs = viewTime ? Date.now() - viewTime : null;
    
    const eventType = action === 'APPROVED' ? 'DECISION_APPROVED' :
                      action === 'REJECTED' ? 'DECISION_REJECTED' : 
                      'DECISION_IGNORED';
    
    this.track(eventType, {
      decision_id: decisionId,
      hesitation_ms: hesitationMs,
      reason
    });
  }
  
  /**
   * Track when a position is reviewed
   */
  public trackPositionReviewed(positionId: string, symbol: string): void {
    this.track('POSITION_REVIEWED', {
      position_id: positionId,
      symbol
    });
  }
  
  /**
   * Track question-first trigger
   */
  public trackQuestionTrigger(reason: string, question: string): void {
    this.track('QUESTION_ANSWERED', {
      trigger_reason: reason,
      question
    });
  }
  
  /**
   * Track silence trigger
   */
  public trackSilenceTrigger(reason: string): void {
    this.track('SILENCE_ACKNOWLEDGED', {
      trigger_reason: reason
    });
  }
  
  /**
   * Track page visit
   */
  public trackPageVisit(pagePath: string): void {
    this.track('PAGE_VISIT', {
      path: pagePath
    });
  }
  
  // ===========================================================================
  // ANALYTICS METHODS
  // ===========================================================================
  
  /**
   * Get daily usage summary
   */
  public getDailyUsageSummary(date: string): DailyUsageSummary {
    const dayEvents = this.events.filter(e => 
      e.timestamp.startsWith(date)
    );
    
    // Calculate metrics
    const sessionEvents = dayEvents.filter(e => 
      e.event_type === 'SESSION_START' || e.event_type === 'SESSION_END'
    );
    const sessionCount = sessionEvents.filter(e => e.event_type === 'SESSION_START').length;
    
    const decisionViewed = dayEvents.filter(e => e.event_type === 'DECISION_VIEWED').length;
    const decisionApproved = dayEvents.filter(e => e.event_type === 'DECISION_APPROVED').length;
    const decisionRejected = dayEvents.filter(e => e.event_type === 'DECISION_REJECTED').length;
    const decisionIgnored = dayEvents.filter(e => e.event_type === 'DECISION_IGNORED').length;
    
    const hesitations = dayEvents
      .filter(e => ['DECISION_APPROVED', 'DECISION_REJECTED', 'DECISION_IGNORED'].includes(e.event_type))
      .map(e => (e.context.hesitation_ms as number) || 0)
      .filter(h => h > 0);
    
    const avgHesitation = hesitations.length > 0 
      ? hesitations.reduce((a, b) => a + b, 0) / hesitations.length 
      : 0;
    
    const narrativeEvent = dayEvents.find(e => e.event_type === 'NARRATIVE_OPENED');
    
    const questionTriggers = dayEvents.filter(e => e.event_type === 'QUESTION_ANSWERED').length;
    const silenceTriggers = dayEvents.filter(e => e.event_type === 'SILENCE_ACKNOWLEDGED').length;
    
    return {
      date,
      session_count: sessionCount,
      total_session_time_ms: 0, // Would need to calculate from session pairs
      decisions_viewed: decisionViewed,
      decisions_acted_upon: decisionApproved + decisionRejected,
      decisions_ignored: decisionIgnored,
      avg_hesitation_ms: avgHesitation,
      narrative_consumption: narrativeEvent ? {
        narrative_date: (narrativeEvent.context.narrative_date as string) || date,
        generated_at: (narrativeEvent.context.generated_at as string) || '',
        opened_at: narrativeEvent.timestamp,
        time_to_open_ms: (narrativeEvent.context.time_to_open_ms as number) || null,
        fully_read: false,
        positions_reviewed: []
      } : null,
      question_triggers: questionTriggers,
      silence_triggers: silenceTriggers
    };
  }
  
  /**
   * Get all events (for debugging/export)
   */
  public getAllEvents(): readonly UsageEvent[] {
    return Object.freeze([...this.events]);
  }
  
  /**
   * Clear all events (for testing)
   */
  public clearEvents(): void {
    this.events = [];
    this.saveToStorage();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getUsageTracker = () => UsageTracker.getInstance();

export default UsageTracker;

