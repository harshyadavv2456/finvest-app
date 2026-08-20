/**
 * FinBot Trust Mode
 * 
 * GOAL:
 * FinBot must know when to SHUT UP.
 * 
 * RULES:
 * - If DecisionContext INVALID → refuse
 * - If confidence < 60 → caution response
 * - If tax data missing → refuse tax advice
 * 
 * FinBot must always return:
 * - What it knows
 * - What it doesn't
 * - Why
 */

import { decisionContextManager } from '../core/DecisionContext';
import { FinBotResponse, ResponseConfidence, DataSource } from './FinBot';

// Trust thresholds
export const TRUST_THRESHOLDS = {
  MIN_CONFIDENCE: 60,        // Below this, add caution
  REFUSE_THRESHOLD: 30,      // Below this, refuse to answer
  STALE_DATA_PENALTY: 20,    // Reduce confidence for stale data
  MISSING_DATA_PENALTY: 30   // Reduce confidence for missing data
} as const;

// Response types based on trust level
export type TrustLevel = 'FULL' | 'CAUTIOUS' | 'REFUSE' | 'UNAVAILABLE';

/**
 * Trust evaluation result
 */
export interface TrustEvaluation {
  trust_level: TrustLevel;
  confidence: number;
  can_respond: boolean;
  must_decline: boolean;
  
  // What FinBot knows
  known_data: DataSource[];
  
  // What FinBot doesn't know
  missing_data: DataSource[];
  
  // Why (explanations)
  reasons: string[];
  caveats: string[];
  
  // Response modifications
  required_disclaimers: string[];
  should_suggest_refresh: boolean;
}

/**
 * Trust mode response wrapper
 */
export interface TrustModeResponse {
  // Original response (if allowed)
  response?: FinBotResponse;
  
  // Trust evaluation
  trust: TrustEvaluation;
  
  // Refusal response (if must decline)
  refusal?: {
    message: string;
    reason: string;
    what_to_do: string;
  };
}

/**
 * Query requirements
 */
interface QueryRequirements {
  needs_portfolio: boolean;
  needs_prices: boolean;
  needs_signals: boolean;
  needs_tax_data: boolean;
  needs_regime: boolean;
}

/**
 * FinBotTrustMode
 * 
 * Wraps FinBot responses with trust evaluation.
 */
export class FinBotTrustMode {
  private static instance: FinBotTrustMode;

  private constructor() {}

  static getInstance(): FinBotTrustMode {
    if (!FinBotTrustMode.instance) {
      FinBotTrustMode.instance = new FinBotTrustMode();
    }
    return FinBotTrustMode.instance;
  }

  /**
   * Evaluate trust for a query type
   */
  evaluateTrust(queryType: string): TrustEvaluation {
    const context = decisionContextManager.getContext();
    const requirements = this.getQueryRequirements(queryType);

    const knownData: DataSource[] = [];
    const missingData: DataSource[] = [];
    const reasons: string[] = [];
    const caveats: string[] = [];
    const requiredDisclaimers: string[] = [];
    let confidence = 100;

    // Check context availability
    if (!context) {
      return {
        trust_level: 'UNAVAILABLE',
        confidence: 0,
        can_respond: false,
        must_decline: true,
        known_data: [],
        missing_data: ['PORTFOLIO_SNAPSHOT', 'LIVE_PRICES', 'FINSIGHT_SIGNALS', 'TAX_ALLOCATOR'],
        reasons: ['Decision context not initialized'],
        caveats: [],
        required_disclaimers: [],
        should_suggest_refresh: true
      };
    }

    // Check portfolio
    if (requirements.needs_portfolio) {
      if (context.portfolio_snapshot) {
        knownData.push('PORTFOLIO_SNAPSHOT');
      } else {
        missingData.push('PORTFOLIO_SNAPSHOT');
        reasons.push('Portfolio not connected');
        confidence -= TRUST_THRESHOLDS.MISSING_DATA_PENALTY;
      }
    }

    // Check prices
    if (requirements.needs_prices) {
      const pricesAvailable = context.live_prices.size > 0;
      const stalePrices = context.stale_components.includes('prices');
      
      if (pricesAvailable) {
        knownData.push('LIVE_PRICES');
        if (stalePrices) {
          caveats.push('Price data is stale. Values may not reflect current market.');
          confidence -= TRUST_THRESHOLDS.STALE_DATA_PENALTY;
        }
      } else {
        missingData.push('LIVE_PRICES');
        reasons.push('Live prices unavailable');
        confidence -= TRUST_THRESHOLDS.MISSING_DATA_PENALTY;
      }
    }

    // Check signals
    if (requirements.needs_signals) {
      if (context.finsight_signals.size > 0) {
        knownData.push('FINSIGHT_SIGNALS');
      } else {
        missingData.push('FINSIGHT_SIGNALS');
        caveats.push('FinSight signals not available. Recommendation is based on limited data.');
        confidence -= TRUST_THRESHOLDS.STALE_DATA_PENALTY;
      }
    }

    // Check tax data
    if (requirements.needs_tax_data) {
      if (context.tax_analyses.size > 0) {
        knownData.push('TAX_ALLOCATOR');
      } else {
        missingData.push('TAX_ALLOCATOR');
        reasons.push('Tax analysis data missing');
        confidence -= TRUST_THRESHOLDS.MISSING_DATA_PENALTY;
        requiredDisclaimers.push('Tax calculations are unavailable. Cannot provide tax advice.');
      }
    }

    // Check regime
    if (requirements.needs_regime) {
      if (context.market_regime !== 'UNKNOWN') {
        // Good
      } else {
        caveats.push('Market regime unknown. Using conservative assumptions.');
        confidence -= 10;
      }
    }

    // Check context status
    if (context.status === 'INVALID') {
      confidence = 0;
      reasons.push(context.status_reason);
    } else if (context.status === 'INCOMPLETE') {
      confidence = Math.min(confidence, 50);
      reasons.push(context.status_reason);
    } else if (context.status === 'STALE') {
      confidence -= TRUST_THRESHOLDS.STALE_DATA_PENALTY;
      caveats.push('Some data is stale. Refresh recommended.');
    }

    // Determine trust level
    confidence = Math.max(0, Math.min(100, confidence));
    
    let trustLevel: TrustLevel;
    let canRespond: boolean;
    let mustDecline: boolean;

    if (missingData.includes('PORTFOLIO_SNAPSHOT') && requirements.needs_portfolio) {
      trustLevel = 'REFUSE';
      canRespond = false;
      mustDecline = true;
      reasons.push('Cannot answer portfolio-related questions without portfolio data');
    } else if (missingData.includes('TAX_ALLOCATOR') && requirements.needs_tax_data) {
      trustLevel = 'REFUSE';
      canRespond = false;
      mustDecline = true;
      reasons.push('Cannot provide tax advice without tax analysis data');
    } else if (confidence < TRUST_THRESHOLDS.REFUSE_THRESHOLD) {
      trustLevel = 'REFUSE';
      canRespond = false;
      mustDecline = true;
    } else if (confidence < TRUST_THRESHOLDS.MIN_CONFIDENCE) {
      trustLevel = 'CAUTIOUS';
      canRespond = true;
      mustDecline = false;
      requiredDisclaimers.push('This response has low confidence due to incomplete data.');
    } else {
      trustLevel = 'FULL';
      canRespond = true;
      mustDecline = false;
    }

    return {
      trust_level: trustLevel,
      confidence,
      can_respond: canRespond,
      must_decline: mustDecline,
      known_data: knownData,
      missing_data: missingData,
      reasons,
      caveats,
      required_disclaimers: requiredDisclaimers,
      should_suggest_refresh: context.status === 'STALE' || missingData.length > 0
    };
  }

  /**
   * Wrap a FinBot response with trust evaluation
   */
  wrapResponse(response: FinBotResponse, queryType: string): TrustModeResponse {
    const trust = this.evaluateTrust(queryType);

    if (trust.must_decline) {
      return {
        trust,
        refusal: {
          message: this.generateRefusalMessage(trust),
          reason: trust.reasons.join(' '),
          what_to_do: this.generateActionSuggestion(trust)
        }
      };
    }

    // Modify response based on trust level
    const modifiedResponse: FinBotResponse = {
      ...response,
      confidence_level: this.adjustConfidenceLevel(response.confidence_level, trust.confidence),
      disclaimers: [
        ...response.disclaimers,
        ...trust.required_disclaimers,
        ...trust.caveats
      ]
    };

    // Add trust info to answer if cautious
    if (trust.trust_level === 'CAUTIOUS') {
      modifiedResponse.answer = `⚠️ LOW CONFIDENCE: ${modifiedResponse.answer}`;
    }

    return {
      response: modifiedResponse,
      trust
    };
  }

  /**
   * Generate a "what I know / don't know / why" response
   */
  generateTransparencyStatement(trust: TrustEvaluation): string {
    const parts: string[] = [];

    // What I know
    if (trust.known_data.length > 0) {
      const dataNames = trust.known_data.map(d => this.dataSourceToName(d));
      parts.push(`I have access to: ${dataNames.join(', ')}.`);
    }

    // What I don't know
    if (trust.missing_data.length > 0) {
      const dataNames = trust.missing_data.map(d => this.dataSourceToName(d));
      parts.push(`I don't have: ${dataNames.join(', ')}.`);
    }

    // Why
    if (trust.reasons.length > 0) {
      parts.push(`Reason: ${trust.reasons.join('; ')}.`);
    }

    // Caveats
    if (trust.caveats.length > 0) {
      parts.push(`Note: ${trust.caveats.join('; ')}.`);
    }

    return parts.join(' ');
  }

  // Private methods

  private getQueryRequirements(queryType: string): QueryRequirements {
    const requirements: Record<string, QueryRequirements> = {
      'SHOULD_SELL': {
        needs_portfolio: true,
        needs_prices: true,
        needs_signals: true,
        needs_tax_data: true,
        needs_regime: true
      },
      'SHOULD_BUY': {
        needs_portfolio: false,
        needs_prices: true,
        needs_signals: true,
        needs_tax_data: false,
        needs_regime: true
      },
      'TAX_IMPACT': {
        needs_portfolio: true,
        needs_prices: true,
        needs_signals: false,
        needs_tax_data: true,
        needs_regime: false
      },
      'HOLDING_STATUS': {
        needs_portfolio: true,
        needs_prices: true,
        needs_signals: false,
        needs_tax_data: false,
        needs_regime: false
      },
      'PORTFOLIO_SUMMARY': {
        needs_portfolio: true,
        needs_prices: true,
        needs_signals: false,
        needs_tax_data: true,
        needs_regime: false
      },
      'LTCG_STATUS': {
        needs_portfolio: true,
        needs_prices: false,
        needs_signals: false,
        needs_tax_data: true,
        needs_regime: false
      }
    };

    return requirements[queryType] || {
      needs_portfolio: false,
      needs_prices: false,
      needs_signals: false,
      needs_tax_data: false,
      needs_regime: false
    };
  }

  private generateRefusalMessage(trust: TrustEvaluation): string {
    if (trust.missing_data.includes('PORTFOLIO_SNAPSHOT')) {
      return "I cannot answer this question because your portfolio is not connected. Please upload your CAMS CAS or CDSL Easiest file first.";
    }

    if (trust.missing_data.includes('TAX_ALLOCATOR')) {
      return "I cannot provide tax advice because tax analysis data is not available. Please ensure your portfolio is connected and refresh the data.";
    }

    if (trust.confidence < TRUST_THRESHOLDS.REFUSE_THRESHOLD) {
      return "I don't have sufficient data to answer this question with confidence. Please refresh the data or connect your portfolio.";
    }

    return "I cannot answer this question due to missing or insufficient data.";
  }

  private generateActionSuggestion(trust: TrustEvaluation): string {
    if (trust.missing_data.includes('PORTFOLIO_SNAPSHOT')) {
      return "Go to Portfolio → Upload your CAMS CAS or CDSL Easiest file.";
    }

    if (trust.should_suggest_refresh) {
      return "Try refreshing the data from the System Health panel.";
    }

    return "Please check your data connections in Settings.";
  }

  private adjustConfidenceLevel(original: ResponseConfidence, trustConfidence: number): ResponseConfidence {
    if (trustConfidence < TRUST_THRESHOLDS.REFUSE_THRESHOLD) {
      return 'INSUFFICIENT_DATA';
    }
    if (trustConfidence < TRUST_THRESHOLDS.MIN_CONFIDENCE) {
      return 'LOW';
    }
    if (trustConfidence < 80) {
      return 'MEDIUM';
    }
    return original;
  }

  private dataSourceToName(source: DataSource): string {
    const names: Record<DataSource, string> = {
      'PORTFOLIO_SNAPSHOT': 'portfolio data',
      'LIVE_PRICES': 'live prices',
      'FINSIGHT_SIGNALS': 'FinSight intelligence',
      'TAX_ALLOCATOR': 'tax analysis',
      'NONE': 'no data'
    };
    return names[source] || source;
  }
}

// Export singleton
export const finBotTrustMode = FinBotTrustMode.getInstance();

export default FinBotTrustMode;

