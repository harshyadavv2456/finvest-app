/**
 * MarketEvent - Single Source of Truth for All Market Events
 * 
 * PHASE 15: Reality Anchor
 * 
 * RULES (NON-NEGOTIABLE):
 * - Every event is immutable once created
 * - Every event has a source citation
 * - No duplicate events (deduplicated by id)
 * - Events are sorted by timestamp
 */

// =============================================================================
// EVENT TYPES
// =============================================================================

export type MarketEventType = 
  | 'PRICE_MOVE'           // Significant price change
  | 'CORPORATE_ANNOUNCEMENT' // Company announcements, filings
  | 'SIGNAL_CHANGE'        // FinSight signal changed (INITIATE -> HOLD, etc.)
  | 'PORTFOLIO_ACTION'     // User action on portfolio
  | 'TAX_THRESHOLD_CROSSED' // STCG -> LTCG, or tax event triggered
  | 'SCENARIO_SIMULATED'   // User ran a what-if scenario
  | 'INSIDER_TRADE'        // Form 4 filing
  | 'HEDGE_FUND_MOVE'      // 13F filing change
  | 'FII_DII_FLOW'         // Institutional flow event
  | 'SYSTEM_EVENT';        // FinVest system events

export type EventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EventSource = 
  | 'FINSIGHT_PIPELINE'
  | 'PRICE_AUTHORITY'
  | 'PORTFOLIO_CORE'
  | 'TAX_ENGINE'
  | 'SCENARIO_ENGINE'
  | 'ANNOUNCEMENTS_API'
  | 'INSIDER_API'
  | 'HEDGE_FUND_API'
  | 'FII_DII_API'
  | 'USER_ACTION'
  | 'SYSTEM';

// =============================================================================
// MARKET EVENT INTERFACE
// =============================================================================

export interface MarketEvent {
  // Identity
  id: string;                    // Unique event ID (UUID or composite)
  timestamp: string;             // ISO timestamp when event occurred
  created_at: string;            // ISO timestamp when event was recorded
  
  // Classification
  type: MarketEventType;
  severity: EventSeverity;
  
  // Content
  title: string;                 // Short summary (max 80 chars)
  description: string;           // Detailed description
  
  // Context
  symbols: string[];             // Affected symbols (tickers)
  market: 'US' | 'IN' | 'BOTH';
  
  // Source Citation (REQUIRED)
  source: EventSource;
  source_id?: string;            // Reference ID from source system
  source_url?: string;           // Link to original source
  
  // Relevance
  portfolio_relevant: boolean;   // Does this affect user's portfolio?
  action_required: boolean;      // Does user need to take action?
  
  // Metadata
  data: Record<string, any>;     // Event-specific data
  tags: string[];                // Searchable tags
  
  // Immutability
  readonly checksum: string;     // For integrity verification
}

// =============================================================================
// EVENT BUILDERS
// =============================================================================

/**
 * Generate a unique event ID
 */
function generateEventId(type: MarketEventType, symbols: string[], timestamp: string): string {
  const symbolStr = symbols.sort().join('-');
  const hash = `${type}-${symbolStr}-${timestamp}`.split('')
    .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `EVT-${type.slice(0, 4)}-${Math.abs(hash).toString(36).toUpperCase()}`;
}

/**
 * Calculate event checksum for integrity
 */
function calculateChecksum(event: Omit<MarketEvent, 'checksum'>): string {
  const data = JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    type: event.type,
    title: event.title,
    symbols: event.symbols,
    source: event.source
  });
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// =============================================================================
// EVENT FACTORY
// =============================================================================

export class MarketEventFactory {
  
  /**
   * Create a price move event
   */
  static priceMove(
    symbol: string,
    market: 'US' | 'IN',
    oldPrice: number,
    newPrice: number,
    changePercent: number
  ): MarketEvent {
    const timestamp = new Date().toISOString();
    const severity: EventSeverity = 
      Math.abs(changePercent) >= 10 ? 'CRITICAL' :
      Math.abs(changePercent) >= 5 ? 'HIGH' :
      Math.abs(changePercent) >= 3 ? 'MEDIUM' : 'LOW';
    
    const baseEvent = {
      id: generateEventId('PRICE_MOVE', [symbol], timestamp),
      timestamp,
      created_at: timestamp,
      type: 'PRICE_MOVE' as MarketEventType,
      severity,
      title: `${symbol} ${changePercent >= 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(1)}%`,
      description: `${symbol} moved from ${oldPrice.toFixed(2)} to ${newPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
      symbols: [symbol],
      market,
      source: 'PRICE_AUTHORITY' as EventSource,
      portfolio_relevant: false, // Will be updated by MarketTimeline based on user's portfolio
      action_required: severity === 'CRITICAL' || severity === 'HIGH',
      data: { oldPrice, newPrice, changePercent },
      tags: ['price', 'market-move', severity.toLowerCase()]
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create a corporate announcement event
   */
  static corporateAnnouncement(
    symbol: string,
    market: 'US' | 'IN',
    category: string,
    headline: string,
    summary: string,
    date: string
  ): MarketEvent {
    const timestamp = new Date(date).toISOString();
    const severity: EventSeverity = 
      category.toLowerCase().includes('acquisition') || category.toLowerCase().includes('merger') ? 'HIGH' :
      category.toLowerCase().includes('dividend') || category.toLowerCase().includes('bonus') ? 'MEDIUM' : 'LOW';
    
    const baseEvent = {
      id: generateEventId('CORPORATE_ANNOUNCEMENT', [symbol], timestamp),
      timestamp,
      created_at: new Date().toISOString(),
      type: 'CORPORATE_ANNOUNCEMENT' as MarketEventType,
      severity,
      title: headline.slice(0, 80),
      description: summary,
      symbols: [symbol],
      market,
      source: 'ANNOUNCEMENTS_API' as EventSource,
      portfolio_relevant: false,
      action_required: severity === 'HIGH',
      data: { category, headline, summary, date },
      tags: ['announcement', category.toLowerCase(), market.toLowerCase()]
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create a signal change event
   */
  static signalChange(
    symbol: string,
    market: 'US' | 'IN',
    oldSignal: string,
    newSignal: string,
    conviction: number
  ): MarketEvent {
    const timestamp = new Date().toISOString();
    const isUpgrade = newSignal === 'INITIATE' || (oldSignal === 'AVOID' && newSignal !== 'AVOID');
    const severity: EventSeverity = 
      newSignal === 'INITIATE' || newSignal === 'AVOID' ? 'HIGH' : 'MEDIUM';
    
    const baseEvent = {
      id: generateEventId('SIGNAL_CHANGE', [symbol], timestamp),
      timestamp,
      created_at: timestamp,
      type: 'SIGNAL_CHANGE' as MarketEventType,
      severity,
      title: `${symbol}: ${oldSignal} → ${newSignal}`,
      description: `FinSight signal for ${symbol} changed from ${oldSignal} to ${newSignal} with ${conviction.toFixed(0)}% conviction`,
      symbols: [symbol],
      market,
      source: 'FINSIGHT_PIPELINE' as EventSource,
      portfolio_relevant: false,
      action_required: severity === 'HIGH',
      data: { oldSignal, newSignal, conviction, isUpgrade },
      tags: ['signal', newSignal.toLowerCase(), isUpgrade ? 'upgrade' : 'downgrade']
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create a portfolio action event
   */
  static portfolioAction(
    action: 'BUY' | 'SELL' | 'HOLD',
    symbol: string,
    market: 'US' | 'IN',
    quantity: number,
    price: number,
    reason: string
  ): MarketEvent {
    const timestamp = new Date().toISOString();
    
    const baseEvent = {
      id: generateEventId('PORTFOLIO_ACTION', [symbol], timestamp),
      timestamp,
      created_at: timestamp,
      type: 'PORTFOLIO_ACTION' as MarketEventType,
      severity: 'HIGH' as EventSeverity,
      title: `${action} ${quantity} ${symbol} @ ${price.toFixed(2)}`,
      description: `Portfolio action: ${action} ${quantity} shares of ${symbol} at ${price.toFixed(2)}. Reason: ${reason}`,
      symbols: [symbol],
      market,
      source: 'USER_ACTION' as EventSource,
      portfolio_relevant: true,
      action_required: false, // Already actioned
      data: { action, quantity, price, reason, value: quantity * price },
      tags: ['portfolio', action.toLowerCase()]
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create a tax threshold event
   */
  static taxThresholdCrossed(
    symbol: string,
    market: 'US' | 'IN',
    eventType: 'STCG_TO_LTCG' | 'LTCG_ELIGIBLE' | 'WASH_SALE_CLEAR',
    holdingDays: number,
    gainAmount: number
  ): MarketEvent {
    const timestamp = new Date().toISOString();
    
    const baseEvent = {
      id: generateEventId('TAX_THRESHOLD_CROSSED', [symbol], timestamp),
      timestamp,
      created_at: timestamp,
      type: 'TAX_THRESHOLD_CROSSED' as MarketEventType,
      severity: 'HIGH' as EventSeverity,
      title: `${symbol}: ${eventType.replace(/_/g, ' ')}`,
      description: `Tax event for ${symbol}: ${eventType.replace(/_/g, ' ')} after ${holdingDays} days holding. Unrealized gain: ₹${gainAmount.toLocaleString()}`,
      symbols: [symbol],
      market,
      source: 'TAX_ENGINE' as EventSource,
      portfolio_relevant: true,
      action_required: true,
      data: { eventType, holdingDays, gainAmount },
      tags: ['tax', eventType.toLowerCase()]
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create a scenario simulated event
   */
  static scenarioSimulated(
    symbols: string[],
    market: 'US' | 'IN',
    scenarioId: string,
    action: string,
    outcome: string
  ): MarketEvent {
    const timestamp = new Date().toISOString();
    
    const baseEvent = {
      id: `SCEN-${scenarioId}`,
      timestamp,
      created_at: timestamp,
      type: 'SCENARIO_SIMULATED' as MarketEventType,
      severity: 'INFO' as EventSeverity,
      title: `Scenario: ${action} ${symbols.join(', ')}`,
      description: outcome,
      symbols,
      market,
      source: 'SCENARIO_ENGINE' as EventSource,
      source_id: scenarioId,
      portfolio_relevant: true,
      action_required: false,
      data: { scenarioId, action, outcome },
      tags: ['scenario', 'simulation']
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
  
  /**
   * Create an insider trade event
   */
  static insiderTrade(
    symbol: string,
    market: 'US' | 'IN',
    insiderName: string,
    tradeType: 'BUY' | 'SELL',
    value: number,
    date: string
  ): MarketEvent {
    const timestamp = new Date(date).toISOString();
    const severity: EventSeverity = value >= 10000000 ? 'HIGH' : value >= 1000000 ? 'MEDIUM' : 'LOW';
    
    const baseEvent = {
      id: generateEventId('INSIDER_TRADE', [symbol], timestamp),
      timestamp,
      created_at: new Date().toISOString(),
      type: 'INSIDER_TRADE' as MarketEventType,
      severity,
      title: `${symbol}: Insider ${tradeType} $${(value / 1000000).toFixed(1)}M`,
      description: `${insiderName} ${tradeType === 'BUY' ? 'bought' : 'sold'} $${value.toLocaleString()} worth of ${symbol}`,
      symbols: [symbol],
      market,
      source: 'INSIDER_API' as EventSource,
      portfolio_relevant: false,
      action_required: severity === 'HIGH' && tradeType === 'SELL',
      data: { insiderName, tradeType, value, date },
      tags: ['insider', tradeType.toLowerCase(), 'form4']
    };
    
    return {
      ...baseEvent,
      checksum: calculateChecksum(baseEvent)
    };
  }
}

export default MarketEventFactory;

