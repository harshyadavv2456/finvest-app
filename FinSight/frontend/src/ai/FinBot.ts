/**
 * FinBot - AI Pilot
 * 
 * FinBot earns trust by REFUSING to answer without data.
 * 
 * FinBot can ONLY:
 * - Read FinSight outputs
 * - Read portfolio snapshot
 * - Read TaxAwareAllocator output
 * - Read live prices
 * 
 * FinBot CANNOT:
 * - Give opinions without data
 * - Predict prices
 * - Override engines
 * 
 * If data missing:
 * - FinBot must say: "I don't have sufficient data."
 */

import { portfolioCore, EnrichedHolding } from '../integrations/portfolio';
import { 
  taxAwareAllocator, 
  AllocationRecommendation, 
  FinSightSignal 
} from '../engines/TaxAwareAllocator';

// Confidence levels for responses
export type ResponseConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

// Data sources used in response
export type DataSource = 
  | 'FINSIGHT_SIGNALS'
  | 'PORTFOLIO_SNAPSHOT'
  | 'TAX_ALLOCATOR'
  | 'LIVE_PRICES'
  | 'NONE';

/**
 * FinBot response format
 */
export interface FinBotResponse {
  answer: string;
  data_used: DataSource[];
  confidence_level: ResponseConfidence;
  disclaimers: string[];
  
  // Supporting data (if available)
  recommendation?: AllocationRecommendation;
  holding?: EnrichedHolding;
  signal?: FinSightSignal;
  
  // Metadata
  query: string;
  responded_at: string;
}

/**
 * Query types FinBot can handle
 */
export type QueryType = 
  | 'SHOULD_SELL'      // "Should I sell X?"
  | 'SHOULD_BUY'       // "Should I buy X?"
  | 'TAX_IMPACT'       // "What's the tax if I sell X?"
  | 'HOLDING_STATUS'   // "What's my position in X?"
  | 'PORTFOLIO_SUMMARY'// "How is my portfolio doing?"
  | 'LTCG_STATUS'      // "Which stocks qualify for LTCG?"
  | 'UNKNOWN';         // Cannot determine query type

/**
 * FinBot AI Pilot
 */
export class FinBot {
  private static instance: FinBot;
  private signals: Map<string, FinSightSignal> = new Map();

  private constructor() {}

  static getInstance(): FinBot {
    if (!FinBot.instance) {
      FinBot.instance = new FinBot();
    }
    return FinBot.instance;
  }

  /**
   * Update FinSight signals
   */
  updateSignals(signals: FinSightSignal[]): void {
    this.signals.clear();
    signals.forEach(s => this.signals.set(s.symbol.toUpperCase(), s));
  }

  /**
   * Process a user query
   */
  async query(userQuery: string): Promise<FinBotResponse> {
    const query = userQuery.trim();
    const queryType = this.classifyQuery(query);
    const symbol = this.extractSymbol(query);

    const baseResponse: Partial<FinBotResponse> = {
      query,
      responded_at: new Date().toISOString(),
      disclaimers: [
        'This is not financial advice.',
        'Past performance does not guarantee future results.',
        'Please consult a financial advisor before making investment decisions.'
      ]
    };

    // Check if portfolio is connected
    if (!portfolioCore.isAvailable() && this.requiresPortfolio(queryType)) {
      return {
        ...baseResponse,
        answer: "I don't have sufficient data. Your portfolio is not connected. " +
                "Please upload your CAMS CAS or CDSL Easiest file to enable portfolio analysis.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: baseResponse.disclaimers!
      } as FinBotResponse;
    }

    // Route to appropriate handler
    switch (queryType) {
      case 'SHOULD_SELL':
        return this.handleShouldSell(symbol, baseResponse);
      case 'SHOULD_BUY':
        return this.handleShouldBuy(symbol, baseResponse);
      case 'TAX_IMPACT':
        return this.handleTaxImpact(symbol, baseResponse);
      case 'HOLDING_STATUS':
        return this.handleHoldingStatus(symbol, baseResponse);
      case 'PORTFOLIO_SUMMARY':
        return this.handlePortfolioSummary(baseResponse);
      case 'LTCG_STATUS':
        return this.handleLtcgStatus(baseResponse);
      default:
        return this.handleUnknown(query, baseResponse);
    }
  }

  // Query classification

  private classifyQuery(query: string): QueryType {
    const lower = query.toLowerCase();

    if (lower.includes('sell') && (lower.includes('should') || lower.includes('can'))) {
      return 'SHOULD_SELL';
    }
    if (lower.includes('buy') && (lower.includes('should') || lower.includes('can'))) {
      return 'SHOULD_BUY';
    }
    if (lower.includes('tax') && (lower.includes('if') || lower.includes('impact'))) {
      return 'TAX_IMPACT';
    }
    if (lower.includes('position') || lower.includes('holding') || lower.includes('how much')) {
      return 'HOLDING_STATUS';
    }
    if (lower.includes('portfolio') && (lower.includes('doing') || lower.includes('summary') || lower.includes('status'))) {
      return 'PORTFOLIO_SUMMARY';
    }
    if (lower.includes('ltcg') || lower.includes('long term') || lower.includes('long-term')) {
      return 'LTCG_STATUS';
    }

    return 'UNKNOWN';
  }

  private extractSymbol(query: string): string {
    // Extract stock symbols (uppercase words, typically 2-10 chars)
    const words = query.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (clean.length >= 2 && clean.length <= 10) {
        // Check if it looks like a symbol
        if (this.signals.has(clean) || /^[A-Z]+$/.test(clean)) {
          return clean;
        }
      }
    }
    return '';
  }

  private requiresPortfolio(queryType: QueryType): boolean {
    return ['SHOULD_SELL', 'TAX_IMPACT', 'HOLDING_STATUS', 'PORTFOLIO_SUMMARY', 'LTCG_STATUS'].includes(queryType);
  }

  // Query handlers

  private async handleShouldSell(symbol: string, base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    if (!symbol) {
      return {
        ...base,
        answer: "I need to know which stock you're asking about. Please specify a stock symbol.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const holdings = await portfolioCore.getEnrichedHoldings();
    const holding = holdings.find(h => h.symbol.toUpperCase() === symbol);
    const signal = this.signals.get(symbol);
    const recommendation = await taxAwareAllocator.getRecommendation(symbol);

    if (!holding) {
      return {
        ...base,
        answer: `You don't appear to hold ${symbol} in your portfolio. I cannot provide a sell recommendation.`,
        data_used: ['PORTFOLIO_SNAPSHOT'],
        confidence_level: 'HIGH',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const dataUsed: DataSource[] = ['PORTFOLIO_SNAPSHOT'];
    let confidence: ResponseConfidence = 'LOW';
    const answerParts: string[] = [];

    // Holding period analysis
    if (holding.is_ltcg_eligible) {
      answerParts.push(`Your ${symbol} holding qualifies for LTCG (held ${holding.holding_days} days).`);
    } else {
      answerParts.push(`${symbol} is subject to STCG (held ${holding.holding_days} days, ${holding.days_to_ltcg} days to LTCG).`);
    }

    // P&L analysis
    if (holding.unrealized_pnl >= 0) {
      answerParts.push(`Unrealized gain: ₹${holding.unrealized_pnl.toFixed(0)} (${holding.unrealized_pnl_percent.toFixed(1)}%).`);
    } else {
      answerParts.push(`Unrealized loss: ₹${Math.abs(holding.unrealized_pnl).toFixed(0)} (${holding.unrealized_pnl_percent.toFixed(1)}%).`);
    }

    // Tax impact
    answerParts.push(`Tax if sold now: ₹${holding.tax_if_sold_now.toFixed(0)}.`);
    dataUsed.push('TAX_ALLOCATOR');

    // FinSight signal
    if (signal) {
      dataUsed.push('FINSIGHT_SIGNALS');
      confidence = signal.conviction > 0.7 ? 'HIGH' : 'MEDIUM';
      
      if (signal.intent === 'AVOID') {
        answerParts.push(`FinSight signal: AVOID with ${(signal.conviction * 100).toFixed(0)}% conviction.`);
        if (!holding.is_ltcg_eligible && holding.days_to_ltcg <= 30 && holding.unrealized_pnl > 0) {
          answerParts.push(`RECOMMENDATION: Consider waiting ${holding.days_to_ltcg} days for LTCG before selling.`);
        } else {
          answerParts.push(`RECOMMENDATION: Consider exiting this position.`);
        }
      } else if (signal.intent === 'HOLD') {
        answerParts.push(`FinSight signal: HOLD. No strong sell signal.`);
        answerParts.push(`RECOMMENDATION: Continue holding.`);
      } else {
        answerParts.push(`FinSight signal: INITIATE (buy more). Not a sell candidate.`);
        answerParts.push(`RECOMMENDATION: Do not sell.`);
      }
    } else {
      answerParts.push(`No FinSight signal available for ${symbol}.`);
      confidence = 'LOW';
    }

    return {
      ...base,
      answer: answerParts.join(' '),
      data_used: dataUsed,
      confidence_level: confidence,
      disclaimers: base.disclaimers!,
      holding,
      signal,
      recommendation: recommendation || undefined
    } as FinBotResponse;
  }

  private async handleShouldBuy(symbol: string, base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    if (!symbol) {
      return {
        ...base,
        answer: "I need to know which stock you're asking about. Please specify a stock symbol.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const signal = this.signals.get(symbol);
    const dataUsed: DataSource[] = [];
    let confidence: ResponseConfidence = 'LOW';
    const answerParts: string[] = [];

    // Check existing holding
    if (portfolioCore.isAvailable()) {
      const holdings = await portfolioCore.getEnrichedHoldings();
      const holding = holdings.find(h => h.symbol.toUpperCase() === symbol);
      
      if (holding) {
        answerParts.push(`You already hold ${holding.quantity} shares of ${symbol} at avg ₹${holding.avg_price.toFixed(2)}.`);
        dataUsed.push('PORTFOLIO_SNAPSHOT');
      }
    }

    // FinSight signal
    if (signal) {
      dataUsed.push('FINSIGHT_SIGNALS');
      confidence = signal.conviction > 0.7 ? 'HIGH' : 'MEDIUM';

      if (signal.intent === 'INITIATE') {
        answerParts.push(`FinSight signal: INITIATE with ${(signal.conviction * 100).toFixed(0)}% conviction.`);
        answerParts.push(`Expected 30-day return: ${(signal.expected_return_p50 * 100).toFixed(1)}%.`);
        answerParts.push(`Regime: ${signal.regime}.`);
        answerParts.push(`RECOMMENDATION: This stock appears favorable for purchase.`);
      } else if (signal.intent === 'AVOID') {
        answerParts.push(`FinSight signal: AVOID with ${(signal.conviction * 100).toFixed(0)}% conviction.`);
        answerParts.push(`RECOMMENDATION: Do not buy at this time.`);
      } else {
        answerParts.push(`FinSight signal: HOLD. No strong buy signal.`);
        answerParts.push(`RECOMMENDATION: Wait for a clearer opportunity.`);
      }
    } else {
      answerParts.push(`I don't have sufficient data. No FinSight signal available for ${symbol}.`);
      confidence = 'INSUFFICIENT_DATA';
    }

    return {
      ...base,
      answer: answerParts.join(' '),
      data_used: dataUsed.length > 0 ? dataUsed : ['NONE'],
      confidence_level: confidence,
      disclaimers: base.disclaimers!,
      signal
    } as FinBotResponse;
  }

  private async handleTaxImpact(symbol: string, base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    if (!symbol) {
      return {
        ...base,
        answer: "Please specify a stock symbol to calculate tax impact.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const holdings = await portfolioCore.getEnrichedHoldings();
    const holding = holdings.find(h => h.symbol.toUpperCase() === symbol);

    if (!holding) {
      return {
        ...base,
        answer: `You don't hold ${symbol}. No tax calculation possible.`,
        data_used: ['PORTFOLIO_SNAPSHOT'],
        confidence_level: 'HIGH',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const taxProfile = portfolioCore.getTaxProfile();
    const answerParts: string[] = [];

    if (holding.is_ltcg_eligible) {
      answerParts.push(`${symbol} qualifies for LTCG (held ${holding.holding_days} days).`);
      if (holding.unrealized_pnl > 0) {
        const ltcgTax = Math.max(0, holding.unrealized_pnl - taxProfile.ltcg_exemption) * taxProfile.ltcg_rate;
        answerParts.push(`Gain: ₹${holding.unrealized_pnl.toFixed(0)}.`);
        answerParts.push(`LTCG tax (10% above ₹1L exemption): ₹${ltcgTax.toFixed(0)}.`);
      } else {
        answerParts.push(`Loss: ₹${Math.abs(holding.unrealized_pnl).toFixed(0)}. No tax applicable.`);
        answerParts.push(`This loss can be used to offset other capital gains.`);
      }
    } else {
      answerParts.push(`${symbol} is subject to STCG (held ${holding.holding_days} days).`);
      if (holding.unrealized_pnl > 0) {
        const stcgTax = holding.unrealized_pnl * taxProfile.stcg_rate;
        const potentialLtcgTax = Math.max(0, holding.unrealized_pnl - taxProfile.ltcg_exemption) * taxProfile.ltcg_rate;
        answerParts.push(`Gain: ₹${holding.unrealized_pnl.toFixed(0)}.`);
        answerParts.push(`STCG tax (15%): ₹${stcgTax.toFixed(0)}.`);
        answerParts.push(`If you wait ${holding.days_to_ltcg} more days, tax would be ₹${potentialLtcgTax.toFixed(0)} (savings: ₹${(stcgTax - potentialLtcgTax).toFixed(0)}).`);
      } else {
        answerParts.push(`Loss: ₹${Math.abs(holding.unrealized_pnl).toFixed(0)}. No tax applicable.`);
      }
    }

    return {
      ...base,
      answer: answerParts.join(' '),
      data_used: ['PORTFOLIO_SNAPSHOT', 'TAX_ALLOCATOR'],
      confidence_level: 'HIGH',
      disclaimers: base.disclaimers!,
      holding
    } as FinBotResponse;
  }

  private async handleHoldingStatus(symbol: string, base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    if (!symbol) {
      return {
        ...base,
        answer: "Please specify a stock symbol to check your holding status.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const holdings = await portfolioCore.getEnrichedHoldings();
    const holding = holdings.find(h => h.symbol.toUpperCase() === symbol);

    if (!holding) {
      return {
        ...base,
        answer: `You don't hold any shares of ${symbol}.`,
        data_used: ['PORTFOLIO_SNAPSHOT'],
        confidence_level: 'HIGH',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const pnlSign = holding.unrealized_pnl >= 0 ? '+' : '';
    const answer = 
      `${symbol}: ${holding.quantity} shares at avg ₹${holding.avg_price.toFixed(2)}. ` +
      `Current: ₹${holding.current_price.toFixed(2)}. ` +
      `P&L: ${pnlSign}₹${holding.unrealized_pnl.toFixed(0)} (${pnlSign}${holding.unrealized_pnl_percent.toFixed(1)}%). ` +
      `Held: ${holding.holding_days} days. ` +
      `Tax status: ${holding.is_ltcg_eligible ? 'LTCG eligible' : `STCG (${holding.days_to_ltcg} days to LTCG)`}.`;

    return {
      ...base,
      answer,
      data_used: ['PORTFOLIO_SNAPSHOT', 'LIVE_PRICES'],
      confidence_level: 'HIGH',
      disclaimers: base.disclaimers!,
      holding
    } as FinBotResponse;
  }

  private async handlePortfolioSummary(base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    const summary = await portfolioCore.getSummary();

    if (!summary) {
      return {
        ...base,
        answer: "Portfolio not connected. Please upload your CAMS CAS or CDSL file.",
        data_used: ['NONE'],
        confidence_level: 'INSUFFICIENT_DATA',
        disclaimers: base.disclaimers!
      } as FinBotResponse;
    }

    const pnlSign = summary.total_pnl >= 0 ? '+' : '';
    const answer = 
      `Portfolio Summary: ${summary.total_holdings} holdings. ` +
      `Invested: ₹${summary.total_invested.toLocaleString()}. ` +
      `Current Value: ₹${summary.current_value.toLocaleString()}. ` +
      `Total P&L: ${pnlSign}₹${summary.total_pnl.toLocaleString()} (${pnlSign}${summary.total_pnl_percent.toFixed(1)}%). ` +
      `LTCG eligible: ${summary.ltcg_holdings} stocks. ` +
      `STCG holdings: ${summary.stcg_holdings} stocks.`;

    return {
      ...base,
      answer,
      data_used: ['PORTFOLIO_SNAPSHOT', 'LIVE_PRICES', 'TAX_ALLOCATOR'],
      confidence_level: 'HIGH',
      disclaimers: base.disclaimers!
    } as FinBotResponse;
  }

  private async handleLtcgStatus(base: Partial<FinBotResponse>): Promise<FinBotResponse> {
    const holdings = await portfolioCore.getEnrichedHoldings();
    
    const ltcgHoldings = holdings.filter(h => h.is_ltcg_eligible);
    const nearLtcg = holdings.filter(h => !h.is_ltcg_eligible && h.days_to_ltcg <= 60);

    let answer = `LTCG Status: ${ltcgHoldings.length} holdings qualify for LTCG. `;
    
    if (ltcgHoldings.length > 0) {
      const symbols = ltcgHoldings.slice(0, 5).map(h => h.symbol).join(', ');
      answer += `Eligible: ${symbols}${ltcgHoldings.length > 5 ? ` and ${ltcgHoldings.length - 5} more` : ''}. `;
    }

    if (nearLtcg.length > 0) {
      answer += `Near LTCG (within 60 days): `;
      answer += nearLtcg.slice(0, 3).map(h => `${h.symbol} (${h.days_to_ltcg}d)`).join(', ');
      if (nearLtcg.length > 3) answer += ` and ${nearLtcg.length - 3} more`;
      answer += '.';
    }

    return {
      ...base,
      answer,
      data_used: ['PORTFOLIO_SNAPSHOT', 'TAX_ALLOCATOR'],
      confidence_level: 'HIGH',
      disclaimers: base.disclaimers!
    } as FinBotResponse;
  }

  private handleUnknown(_query: string, base: Partial<FinBotResponse>): FinBotResponse {
    return {
      ...base,
      answer: 
        "I can help you with: " +
        "(1) Should I sell/buy [STOCK]? " +
        "(2) What's the tax impact if I sell [STOCK]? " +
        "(3) What's my position in [STOCK]? " +
        "(4) How is my portfolio doing? " +
        "(5) Which stocks qualify for LTCG? " +
        "Please ask one of these questions.",
      data_used: ['NONE'],
      confidence_level: 'LOW',
      disclaimers: base.disclaimers!
    } as FinBotResponse;
  }
}

// Export singleton
export const finBot = FinBot.getInstance();

export default FinBot;

