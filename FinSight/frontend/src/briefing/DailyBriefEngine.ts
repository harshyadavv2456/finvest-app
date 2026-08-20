/**
 * DailyBriefEngine - Daily Investment Brief Generator
 * 
 * PHASE 16: Replace Alerts with Understanding
 * 
 * RULES (NON-NEGOTIABLE):
 * - If nothing matters → say "Nothing material changed"
 * - No hype language
 * - Max 7 bullet points
 * - Only includes what's actionable or informative
 * - Every item must cite source
 */

import { MarketTimeline, getMarketTimeline } from '../core/MarketTimeline';
import { MarketEvent, EventSeverity } from '../core/MarketEvent';
import { DecisionContext } from '../core/DecisionContext';
import { PortfolioSnapshot } from '../integrations/portfolio/types';

// =============================================================================
// TYPES
// =============================================================================

export type BriefItemPriority = 'CRITICAL' | 'ACTION_REQUIRED' | 'WATCH' | 'INFO';

export interface BriefItem {
  priority: BriefItemPriority;
  title: string;
  detail: string;
  symbols: string[];
  source: string;
  eventId?: string;
}

export interface TaxEvent {
  symbol: string;
  eventType: 'STCG_TO_LTCG' | 'APPROACHING_LTCG' | 'WASH_SALE_CLEAR';
  daysToEvent: number;
  potentialSaving: number;
}

export interface SignalChange {
  symbol: string;
  oldSignal: string;
  newSignal: string;
  conviction: number;
}

export interface DailyBrief {
  date: string;
  generated_at: string;
  
  // Summary
  portfolio_impact_summary: string;
  overall_sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
  
  // Key sections
  signals_changed: SignalChange[];
  tax_events: TaxEvent[];
  announcements_relevant: BriefItem[];
  
  // Action items
  what_requires_attention: BriefItem[];
  what_can_wait: BriefItem[];
  
  // Stats
  total_events: number;
  portfolio_relevant_events: number;
  action_required_count: number;
  
  // Source
  context_id?: string;
  events_used: string[];
}

// =============================================================================
// DAILY BRIEF ENGINE
// =============================================================================

export class DailyBriefEngine {
  private timeline: MarketTimeline;
  private context: DecisionContext | null = null;
  
  constructor() {
    this.timeline = getMarketTimeline();
  }
  
  /**
   * Set decision context for enriched analysis
   */
  public setContext(context: DecisionContext): void {
    this.context = context;
  }
  
  /**
   * Generate daily brief
   */
  public generateBrief(portfolio: PortfolioSnapshot | null): DailyBrief {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const generated_at = now.toISOString();
    
    // Get today's events
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const allEvents = this.timeline.getEvents({
      startDate: todayStart.toISOString(),
      limit: 200
    });
    
    // Set portfolio symbols for relevance
    if (portfolio) {
      this.timeline.setPortfolioSymbols(portfolio.holdings.map(h => h.symbol));
    }
    
    const portfolioEvents = allEvents.filter(e => e.portfolio_relevant);
    const actionEvents = allEvents.filter(e => e.action_required);
    
    // Extract signal changes
    const signals_changed = this.extractSignalChanges(allEvents);
    
    // Extract tax events
    const tax_events = this.extractTaxEvents(allEvents, portfolio);
    
    // Extract relevant announcements
    const announcements_relevant = this.extractRelevantAnnouncements(portfolioEvents);
    
    // Categorize into action vs wait
    const { what_requires_attention, what_can_wait } = this.categorizeItems(allEvents, portfolio);
    
    // Generate portfolio impact summary
    const portfolio_impact_summary = this.generateImpactSummary(
      portfolioEvents,
      signals_changed,
      tax_events
    );
    
    // Determine overall sentiment
    const overall_sentiment = this.determineOverallSentiment(allEvents);
    
    // Collect event IDs used
    const events_used = allEvents.slice(0, 50).map(e => e.id);
    
    return {
      date: today,
      generated_at,
      portfolio_impact_summary,
      overall_sentiment,
      signals_changed: signals_changed.slice(0, 5),
      tax_events: tax_events.slice(0, 5),
      announcements_relevant: announcements_relevant.slice(0, 7),
      what_requires_attention: what_requires_attention.slice(0, 7),
      what_can_wait: what_can_wait.slice(0, 7),
      total_events: allEvents.length,
      portfolio_relevant_events: portfolioEvents.length,
      action_required_count: actionEvents.length,
      context_id: this.context?.id,
      events_used
    };
  }
  
  /**
   * Extract signal changes from events
   */
  private extractSignalChanges(events: MarketEvent[]): SignalChange[] {
    return events
      .filter(e => e.type === 'SIGNAL_CHANGE')
      .map(e => ({
        symbol: e.symbols[0],
        oldSignal: e.data.oldSignal || 'UNKNOWN',
        newSignal: e.data.newSignal || 'UNKNOWN',
        conviction: e.data.conviction || 0
      }));
  }
  
  /**
   * Extract tax events from events and portfolio
   */
  private extractTaxEvents(events: MarketEvent[], portfolio: PortfolioSnapshot | null): TaxEvent[] {
    const taxEvents: TaxEvent[] = [];
    
    // From timeline events
    events
      .filter(e => e.type === 'TAX_THRESHOLD_CROSSED')
      .forEach(e => {
        taxEvents.push({
          symbol: e.symbols[0],
          eventType: e.data.eventType || 'STCG_TO_LTCG',
          daysToEvent: 0,
          potentialSaving: e.data.gainAmount || 0
        });
      });
    
    // Check portfolio for upcoming LTCG conversions
    if (portfolio) {
      const today = new Date();
      portfolio.holdings.forEach(h => {
        if (h.acquisition_date) {
          const acqDate = new Date(h.acquisition_date);
          const daysSinceAcq = Math.floor((today.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysToLTCG = 365 - daysSinceAcq;
          
          // Alert if LTCG eligible within 30 days
          if (daysToLTCG > 0 && daysToLTCG <= 30) {
            const unrealizedGain = ((h as any).current_value || 0) - (h.quantity * h.avg_price);
            if (unrealizedGain > 0) {
              const potentialSaving = unrealizedGain * 0.05; // Approximate 5% difference STCG vs LTCG
              taxEvents.push({
                symbol: h.symbol,
                eventType: 'APPROACHING_LTCG',
                daysToEvent: daysToLTCG,
                potentialSaving
              });
            }
          }
        }
      });
    }
    
    return taxEvents.sort((a, b) => a.daysToEvent - b.daysToEvent);
  }
  
  /**
   * Extract relevant announcements
   */
  private extractRelevantAnnouncements(portfolioEvents: MarketEvent[]): BriefItem[] {
    return portfolioEvents
      .filter(e => e.type === 'CORPORATE_ANNOUNCEMENT' || e.type === 'INSIDER_TRADE')
      .map(e => ({
        priority: this.severityToPriority(e.severity),
        title: e.title,
        detail: e.description,
        symbols: e.symbols,
        source: e.source,
        eventId: e.id
      }));
  }
  
  /**
   * Categorize items into action required vs can wait
   */
  private categorizeItems(
    events: MarketEvent[],
    _portfolio: PortfolioSnapshot | null
  ): { what_requires_attention: BriefItem[]; what_can_wait: BriefItem[] } {
    const attention: BriefItem[] = [];
    const canWait: BriefItem[] = [];
    
    for (const event of events) {
      const item: BriefItem = {
        priority: this.severityToPriority(event.severity),
        title: event.title,
        detail: event.description,
        symbols: event.symbols,
        source: event.source,
        eventId: event.id
      };
      
      if (event.action_required || event.severity === 'CRITICAL' || event.severity === 'HIGH') {
        attention.push(item);
      } else {
        canWait.push(item);
      }
    }
    
    // Sort by priority
    const priorityOrder: Record<BriefItemPriority, number> = {
      'CRITICAL': 0,
      'ACTION_REQUIRED': 1,
      'WATCH': 2,
      'INFO': 3
    };
    
    attention.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    canWait.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    return { what_requires_attention: attention, what_can_wait: canWait };
  }
  
  /**
   * Convert severity to priority
   */
  private severityToPriority(severity: EventSeverity): BriefItemPriority {
    switch (severity) {
      case 'CRITICAL': return 'CRITICAL';
      case 'HIGH': return 'ACTION_REQUIRED';
      case 'MEDIUM': return 'WATCH';
      default: return 'INFO';
    }
  }
  
  /**
   * Generate portfolio impact summary
   */
  private generateImpactSummary(
    portfolioEvents: MarketEvent[],
    signalChanges: SignalChange[],
    taxEvents: TaxEvent[]
  ): string {
    if (portfolioEvents.length === 0 && signalChanges.length === 0 && taxEvents.length === 0) {
      return "Nothing material changed today. Your portfolio remains stable.";
    }
    
    const parts: string[] = [];
    
    // Signal changes
    const upgrades = signalChanges.filter(s => s.newSignal === 'INITIATE' || s.newSignal === 'BUY');
    const downgrades = signalChanges.filter(s => s.newSignal === 'AVOID' || s.newSignal === 'SELL');
    
    if (upgrades.length > 0) {
      parts.push(`${upgrades.length} signal upgrade${upgrades.length > 1 ? 's' : ''}`);
    }
    if (downgrades.length > 0) {
      parts.push(`${downgrades.length} signal downgrade${downgrades.length > 1 ? 's' : ''}`);
    }
    
    // Tax events
    if (taxEvents.length > 0) {
      const imminent = taxEvents.filter(t => t.daysToEvent <= 7).length;
      if (imminent > 0) {
        parts.push(`${imminent} imminent tax event${imminent > 1 ? 's' : ''}`);
      }
    }
    
    // Announcements
    const criticalAnn = portfolioEvents.filter(e => 
      (e.type === 'CORPORATE_ANNOUNCEMENT' || e.type === 'INSIDER_TRADE') && 
      e.severity === 'HIGH'
    ).length;
    if (criticalAnn > 0) {
      parts.push(`${criticalAnn} important announcement${criticalAnn > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) {
      return "Minor activity in your portfolio. No immediate action required.";
    }
    
    return `Today: ${parts.join(', ')}. Review recommended.`;
  }
  
  /**
   * Determine overall sentiment
   */
  private determineOverallSentiment(events: MarketEvent[]): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' {
    if (events.length === 0) return 'NEUTRAL';
    
    let positive = 0;
    let negative = 0;
    
    for (const event of events) {
      // Count positive signals
      if (event.type === 'SIGNAL_CHANGE' && event.data.newSignal === 'INITIATE') positive++;
      if (event.type === 'INSIDER_TRADE' && event.data.tradeType === 'BUY') positive++;
      if (event.type === 'PRICE_MOVE' && event.data.changePercent > 0) positive++;
      
      // Count negative signals
      if (event.type === 'SIGNAL_CHANGE' && event.data.newSignal === 'AVOID') negative++;
      if (event.type === 'INSIDER_TRADE' && event.data.tradeType === 'SELL') negative++;
      if (event.type === 'PRICE_MOVE' && event.data.changePercent < 0) negative++;
    }
    
    if (positive > 0 && negative > 0) {
      if (positive > negative * 2) return 'POSITIVE';
      if (negative > positive * 2) return 'NEGATIVE';
      return 'MIXED';
    }
    
    if (positive > 0) return 'POSITIVE';
    if (negative > 0) return 'NEGATIVE';
    return 'NEUTRAL';
  }
  
  /**
   * Generate shareable brief (read-only format)
   */
  public generateShareableBrief(portfolio: PortfolioSnapshot | null): string {
    const brief = this.generateBrief(portfolio);
    
    const lines: string[] = [
      `📊 FinVest Daily Brief - ${brief.date}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      '',
      `📝 Summary: ${brief.portfolio_impact_summary}`,
      `📈 Sentiment: ${brief.overall_sentiment}`,
      ''
    ];
    
    if (brief.what_requires_attention.length > 0) {
      lines.push('🔴 REQUIRES ATTENTION:');
      brief.what_requires_attention.slice(0, 5).forEach((item, i) => {
        lines.push(`   ${i + 1}. ${item.title}`);
      });
      lines.push('');
    }
    
    if (brief.signals_changed.length > 0) {
      lines.push('🎯 SIGNAL CHANGES:');
      brief.signals_changed.slice(0, 5).forEach(s => {
        lines.push(`   • ${s.symbol}: ${s.oldSignal} → ${s.newSignal}`);
      });
      lines.push('');
    }
    
    if (brief.tax_events.length > 0) {
      lines.push('💰 TAX EVENTS:');
      brief.tax_events.slice(0, 3).forEach(t => {
        lines.push(`   • ${t.symbol}: ${t.eventType} in ${t.daysToEvent} days`);
      });
      lines.push('');
    }
    
    if (brief.what_can_wait.length > 0) {
      lines.push('⏳ CAN WAIT:');
      brief.what_can_wait.slice(0, 3).forEach((item, i) => {
        lines.push(`   ${i + 1}. ${item.title}`);
      });
      lines.push('');
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`Generated by FinVest at ${brief.generated_at}`);
    
    return lines.join('\n');
  }
}

// Export singleton getter
let briefEngineInstance: DailyBriefEngine | null = null;
export const getDailyBriefEngine = (): DailyBriefEngine => {
  if (!briefEngineInstance) {
    briefEngineInstance = new DailyBriefEngine();
  }
  return briefEngineInstance;
};

export default DailyBriefEngine;

