/**
 * MarketTimeline - Centralized Timeline of All Market Events
 * 
 * PHASE 15: Reality Anchor
 * 
 * RULES (NON-NEGOTIABLE):
 * - Single source of truth for all events
 * - Sorted by timestamp (newest first)
 * - Filtered by portfolio relevance
 * - All entries are immutable
 * - Dashboard reads ONLY from this timeline
 */

import { MarketEvent, MarketEventType, EventSeverity, MarketEventFactory } from './MarketEvent';

// =============================================================================
// TIMELINE FILTERS
// =============================================================================

export interface TimelineFilter {
  types?: MarketEventType[];
  severities?: EventSeverity[];
  symbols?: string[];
  market?: 'US' | 'IN' | 'BOTH';
  portfolioRelevantOnly?: boolean;
  actionRequiredOnly?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// =============================================================================
// TIMELINE STATE
// =============================================================================

export interface TimelineState {
  events: MarketEvent[];
  lastUpdated: string;
  portfolioSymbols: Set<string>;
  eventCount: number;
  unreadCount: number;
  actionRequiredCount: number;
}

// =============================================================================
// MARKET TIMELINE MANAGER
// =============================================================================

export class MarketTimeline {
  private static instance: MarketTimeline;
  private events: Map<string, MarketEvent> = new Map();
  private portfolioSymbols: Set<string> = new Set();
  private lastUpdated: string = new Date().toISOString();
  private readEventIds: Set<string> = new Set();
  
  private constructor() {
    // Private constructor for singleton
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): MarketTimeline {
    if (!MarketTimeline.instance) {
      MarketTimeline.instance = new MarketTimeline();
    }
    return MarketTimeline.instance;
  }
  
  /**
   * Set portfolio symbols for relevance filtering
   */
  public setPortfolioSymbols(symbols: string[]): void {
    this.portfolioSymbols = new Set(symbols.map(s => s.toUpperCase()));
    
    // Update portfolio relevance for all events
    for (const [id, event] of this.events) {
      const isRelevant = event.symbols.some(s => this.portfolioSymbols.has(s.toUpperCase()));
      if (event.portfolio_relevant !== isRelevant) {
        // Create new event with updated relevance (immutable)
        this.events.set(id, { ...event, portfolio_relevant: isRelevant });
      }
    }
  }
  
  /**
   * Add an event to the timeline
   * Deduplicated by event ID
   */
  public addEvent(event: MarketEvent): boolean {
    if (this.events.has(event.id)) {
      return false; // Event already exists
    }
    
    // Update portfolio relevance based on current portfolio
    const isRelevant = event.symbols.some(s => this.portfolioSymbols.has(s.toUpperCase()));
    const enrichedEvent: MarketEvent = {
      ...event,
      portfolio_relevant: event.portfolio_relevant || isRelevant
    };
    
    this.events.set(event.id, enrichedEvent);
    this.lastUpdated = new Date().toISOString();
    return true;
  }
  
  /**
   * Add multiple events at once
   */
  public addEvents(events: MarketEvent[]): number {
    let addedCount = 0;
    for (const event of events) {
      if (this.addEvent(event)) {
        addedCount++;
      }
    }
    return addedCount;
  }
  
  /**
   * Get filtered events from timeline
   */
  public getEvents(filter?: TimelineFilter): MarketEvent[] {
    let events = Array.from(this.events.values());
    
    if (filter) {
      // Filter by type
      if (filter.types && filter.types.length > 0) {
        events = events.filter(e => filter.types!.includes(e.type));
      }
      
      // Filter by severity
      if (filter.severities && filter.severities.length > 0) {
        events = events.filter(e => filter.severities!.includes(e.severity));
      }
      
      // Filter by symbols
      if (filter.symbols && filter.symbols.length > 0) {
        const symbolSet = new Set(filter.symbols.map(s => s.toUpperCase()));
        events = events.filter(e => e.symbols.some(s => symbolSet.has(s.toUpperCase())));
      }
      
      // Filter by market
      if (filter.market && filter.market !== 'BOTH') {
        events = events.filter(e => e.market === filter.market || e.market === 'BOTH');
      }
      
      // Filter by portfolio relevance
      if (filter.portfolioRelevantOnly) {
        events = events.filter(e => e.portfolio_relevant);
      }
      
      // Filter by action required
      if (filter.actionRequiredOnly) {
        events = events.filter(e => e.action_required);
      }
      
      // Filter by date range
      if (filter.startDate) {
        const start = new Date(filter.startDate).getTime();
        events = events.filter(e => new Date(e.timestamp).getTime() >= start);
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate).getTime();
        events = events.filter(e => new Date(e.timestamp).getTime() <= end);
      }
    }
    
    // Sort by timestamp (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Apply limit
    if (filter?.limit && filter.limit > 0) {
      events = events.slice(0, filter.limit);
    }
    
    return events;
  }
  
  /**
   * Get events for a specific symbol
   */
  public getEventsBySymbol(symbol: string, limit: number = 20): MarketEvent[] {
    return this.getEvents({
      symbols: [symbol],
      limit
    });
  }
  
  /**
   * Get portfolio-relevant events only
   */
  public getPortfolioEvents(limit: number = 50): MarketEvent[] {
    return this.getEvents({
      portfolioRelevantOnly: true,
      limit
    });
  }
  
  /**
   * Get action-required events
   */
  public getActionRequiredEvents(): MarketEvent[] {
    return this.getEvents({
      actionRequiredOnly: true
    });
  }
  
  /**
   * Get today's events
   */
  public getTodayEvents(limit: number = 100): MarketEvent[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getEvents({
      startDate: today.toISOString(),
      limit
    });
  }
  
  /**
   * Mark event as read
   */
  public markAsRead(eventId: string): void {
    this.readEventIds.add(eventId);
  }
  
  /**
   * Mark all events as read
   */
  public markAllAsRead(): void {
    for (const id of this.events.keys()) {
      this.readEventIds.add(id);
    }
  }
  
  /**
   * Check if event is unread
   */
  public isUnread(eventId: string): boolean {
    return !this.readEventIds.has(eventId);
  }
  
  /**
   * Get timeline state summary
   */
  public getState(): TimelineState {
    const events = this.getEvents();
    const unreadCount = events.filter(e => this.isUnread(e.id)).length;
    const actionRequiredCount = events.filter(e => e.action_required && this.isUnread(e.id)).length;
    
    return {
      events,
      lastUpdated: this.lastUpdated,
      portfolioSymbols: new Set(this.portfolioSymbols),
      eventCount: this.events.size,
      unreadCount,
      actionRequiredCount
    };
  }
  
  /**
   * Get event by ID
   */
  public getEvent(eventId: string): MarketEvent | undefined {
    return this.events.get(eventId);
  }
  
  /**
   * Clear all events (for testing/reset)
   */
  public clear(): void {
    this.events.clear();
    this.readEventIds.clear();
    this.lastUpdated = new Date().toISOString();
  }
  
  /**
   * Get event counts by type
   */
  public getEventCountsByType(): Record<MarketEventType, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events.values()) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts as Record<MarketEventType, number>;
  }
  
  /**
   * Get event counts by severity
   */
  public getEventCountsBySeverity(): Record<EventSeverity, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events.values()) {
      counts[event.severity] = (counts[event.severity] || 0) + 1;
    }
    return counts as Record<EventSeverity, number>;
  }
  
  /**
   * Ingest corporate announcements from API response
   */
  public ingestCorporateAnnouncements(announcements: any[], market: 'US' | 'IN'): number {
    const events = announcements.map(ann => 
      MarketEventFactory.corporateAnnouncement(
        ann.symbol || 'UNKNOWN',
        market,
        ann.category || 'General',
        ann.headline || ann.subject || ann.category || 'Announcement',
        ann.summary || ann.details || '',
        ann.date || new Date().toISOString().split('T')[0]
      )
    );
    return this.addEvents(events);
  }
  
  /**
   * Ingest insider trades from API response
   */
  public ingestInsiderTrades(trades: any[], market: 'US' | 'IN'): number {
    const events = trades
      .filter(trade => trade.symbol && trade.value > 0)
      .map(trade => 
        MarketEventFactory.insiderTrade(
          trade.symbol,
          market,
          trade.insider || 'Unknown Insider',
          trade.type || 'SELL',
          trade.value,
          trade.date || new Date().toISOString().split('T')[0]
        )
      );
    return this.addEvents(events);
  }
  
  /**
   * Ingest signal changes
   */
  public ingestSignalChanges(changes: Array<{
    symbol: string;
    market: 'US' | 'IN';
    oldSignal: string;
    newSignal: string;
    conviction: number;
  }>): number {
    const events = changes.map(change =>
      MarketEventFactory.signalChange(
        change.symbol,
        change.market,
        change.oldSignal,
        change.newSignal,
        change.conviction
      )
    );
    return this.addEvents(events);
  }
}

// Export singleton getter
export const getMarketTimeline = () => MarketTimeline.getInstance();

export default MarketTimeline;

