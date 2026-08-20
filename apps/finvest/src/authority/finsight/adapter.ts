/**
 * FinSight Authority Adapter
 * 
 * AUTHORITY: LOCKED
 * 
 * This adapter provides READ-ONLY access to FinSight intelligence.
 * It NEVER computes new intelligence - it only reads precomputed outputs.
 * 
 * Rules:
 * - Adapter ONLY reads FinSight outputs
 * - Adapter NEVER computes new intelligence
 * - Adapter enforces schema validation
 * - Adapter enforces timestamps and data freshness
 * - Adapter fails loudly if data is missing
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Market,
  StockIntelligence,
  TopOpportunitiesResponse,
  PortfolioIntelligence,
  AuthorityStatus,
  DataFreshness,
  SCHEMA_VERSION,
  AUTHORITY,
} from './contracts';
import {
  DataMissingError,
  DataStaleError,
  InvalidMarketError,
  SymbolNotFoundError,
} from './errors';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FINSIGHT_ROOT = path.resolve(__dirname, '../../../../finsight');
const INTELLIGENCE_DIR = path.join(FINSIGHT_ROOT, 'public', 'intelligence');
const PORTFOLIO_DIR = path.join(FINSIGHT_ROOT, 'public', 'portfolio');

// Data freshness threshold (hours)
const FRESHNESS_THRESHOLD_HOURS = 48;

// Supported markets
const SUPPORTED_MARKETS: Market[] = ['US', 'IN'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateMarket(market: string): Market {
  const upperMarket = market.toUpperCase() as Market;
  if (!SUPPORTED_MARKETS.includes(upperMarket)) {
    throw new InvalidMarketError(market);
  }
  return upperMarket;
}

function checkDataFreshness(timestamp: string): DataFreshness {
  const generatedAt = new Date(timestamp);
  const now = new Date();
  const hoursOld = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);
  
  return {
    is_fresh: hoursOld <= FRESHNESS_THRESHOLD_HOURS,
    hours_old: hoursOld,
    threshold_hours: FRESHNESS_THRESHOLD_HOURS,
    warning: hoursOld > FRESHNESS_THRESHOLD_HOURS 
      ? `Data is ${hoursOld.toFixed(1)} hours old. Consider running intelligence pipeline.`
      : null,
  };
}

function readJsonFile<T>(filePath: string, resourceName: string): T {
  if (!fs.existsSync(filePath)) {
    throw new DataMissingError(resourceName, { path: filePath });
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    throw new DataMissingError(resourceName, { 
      path: filePath, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class FinSightAdapter {
  private readonly intelligenceDir: string;
  private readonly portfolioDir: string;

  constructor() {
    this.intelligenceDir = INTELLIGENCE_DIR;
    this.portfolioDir = PORTFOLIO_DIR;
  }

  /**
   * Get authority status - shows FinSight health and data freshness
   */
  getStatus(): AuthorityStatus {
    const markets: AuthorityStatus['markets'] = {} as AuthorityStatus['markets'];
    let latestUpdate = '';

    for (const market of SUPPORTED_MARKETS.slice(0, 2) as ('US' | 'IN')[]) {
      const marketDir = path.join(this.intelligenceDir, market);
      
      if (!fs.existsSync(marketDir)) {
        markets[market] = {
          status: 'CLOSED',
          stocks_available: 0,
          last_intelligence_update: 'N/A',
        };
        continue;
      }

      const files = fs.readdirSync(marketDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
      const opportunitiesFile = path.join(marketDir, '_top_opportunities.json');
      
      let lastUpdate = 'N/A';
      if (fs.existsSync(opportunitiesFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(opportunitiesFile, 'utf-8'));
          lastUpdate = data.generated_at || 'N/A';
          if (!latestUpdate || lastUpdate > latestUpdate) {
            latestUpdate = lastUpdate;
          }
        } catch {
          // Ignore parse errors
        }
      }

      markets[market] = {
        status: this.getMarketStatus(market),
        stocks_available: files.length,
        last_intelligence_update: lastUpdate,
      };
    }

    const freshness = latestUpdate 
      ? checkDataFreshness(latestUpdate)
      : { is_fresh: false, hours_old: Infinity, threshold_hours: FRESHNESS_THRESHOLD_HOURS, warning: 'No data available' };

    return {
      authority: AUTHORITY,
      finsight_version: 'v2.0-full-pipeline',
      last_updated: latestUpdate || 'N/A',
      data_freshness: freshness,
      markets,
      schema_version: SCHEMA_VERSION,
    };
  }

  /**
   * Get top opportunities for a market
   */
  getTopOpportunities(market: string): TopOpportunitiesResponse {
    const validMarket = validateMarket(market);
    const filePath = path.join(this.intelligenceDir, validMarket, '_top_opportunities.json');
    
    const data = readJsonFile<Record<string, unknown>>(filePath, `Top opportunities for ${validMarket}`);
    
    // Validate and add authority metadata
    return {
      success: true,
      market: validMarket,
      generated_at: data.generated_at as string || new Date().toISOString(),
      total_stocks: data.total_stocks as number || 0,
      initiate_candidates: data.initiate_candidates as number || 0,
      avoid_candidates: data.avoid_candidates as number || 0,
      intent_counts: data.intent_counts as Record<string, number> || {},
      opportunities: (data.opportunities as unknown[]) || [],
      avoid_list: (data.avoid_list as unknown[]) || [],
      schema_version: SCHEMA_VERSION,
      authority: AUTHORITY,
    } as TopOpportunitiesResponse;
  }

  /**
   * Get intelligence for a specific stock
   */
  getStockIntelligence(market: string, symbol: string): StockIntelligence {
    const validMarket = validateMarket(market);
    const filePath = path.join(this.intelligenceDir, validMarket, `${symbol.toUpperCase()}.json`);
    
    if (!fs.existsSync(filePath)) {
      throw new SymbolNotFoundError(symbol, validMarket);
    }

    const data = readJsonFile<Record<string, unknown>>(filePath, `Intelligence for ${symbol}`);
    
    // Check data freshness
    const generatedAt = data.generated_at as string || data.as_of_date as string;
    if (generatedAt) {
      const freshness = checkDataFreshness(generatedAt);
      if (!freshness.is_fresh) {
        throw new DataStaleError(
          `Intelligence for ${symbol}`,
          freshness.hours_old,
          freshness.threshold_hours
        );
      }
    }

    // Transform to contract schema
    return {
      ticker: symbol.toUpperCase(),
      market: validMarket,
      intent: data.intent as StockIntelligence['intent'] || 'HOLD',
      probability: data.probability as number || 0,
      confidence: data.confidence as number || 0,
      regime: data.regime as StockIntelligence['regime'] || 'NEUTRAL',
      signals: (data.signals as StockIntelligence['signals']) || [],
      risk_metrics: {
        volatility_20d: data.volatility_20d as number | null || null,
        volatility_60d: data.volatility_60d as number | null || null,
        max_drawdown: data.max_drawdown as number | null || null,
        sharpe_ratio: data.sharpe_ratio as number | null || null,
        beta: data.beta as number | null || null,
      },
      generated_at: generatedAt || new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      authority: AUTHORITY,
    };
  }

  /**
   * Get portfolio intelligence for a market
   */
  getPortfolioIntelligence(market: string): PortfolioIntelligence {
    const validMarket = validateMarket(market);
    
    // Try portfolio directory first
    let filePath = path.join(this.portfolioDir, `${validMarket}_ALL.json`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(this.portfolioDir, 'portfolio_snapshot.json');
    }
    
    const data = readJsonFile<Record<string, unknown>>(filePath, `Portfolio intelligence for ${validMarket}`);
    
    return {
      market: validMarket,
      as_of_date: data.as_of_date as string || data.generated_at as string || new Date().toISOString(),
      total_stocks_analyzed: data.total_stocks as number || 0,
      regime_summary: {
        overall: data.overall_regime as PortfolioIntelligence['regime_summary']['overall'] || 'NEUTRAL',
        bull_count: 0,
        bear_count: 0,
        neutral_count: 0,
        volatile_count: 0,
      },
      intent_distribution: data.intent_counts as Record<string, number> || {},
      top_opportunities: [],
      risk_alerts: [],
      schema_version: SCHEMA_VERSION,
      authority: AUTHORITY,
    };
  }

  /**
   * List all available stocks with intelligence for a market
   */
  listStocks(market: string): string[] {
    const validMarket = validateMarket(market);
    const marketDir = path.join(this.intelligenceDir, validMarket);
    
    if (!fs.existsSync(marketDir)) {
      return [];
    }

    return fs.readdirSync(marketDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => f.replace('.json', ''));
  }

  /**
   * Get current market status (simplified)
   */
  private getMarketStatus(market: Market): AuthorityStatus['markets']['US']['status'] {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();

    // Weekend check
    if (utcDay === 0 || utcDay === 6) {
      return 'CLOSED';
    }

    // Simplified market hours (UTC)
    if (market === 'US') {
      // US: 14:30 - 21:00 UTC
      if (utcHour >= 14 && utcHour < 21) {
        return 'OPEN';
      } else if (utcHour >= 9 && utcHour < 14) {
        return 'PRE_MARKET';
      } else if (utcHour >= 21 && utcHour < 23) {
        return 'AFTER_HOURS';
      }
    } else if (market === 'IN') {
      // IN: 03:45 - 10:00 UTC
      if (utcHour >= 4 && utcHour < 10) {
        return 'OPEN';
      } else if (utcHour >= 3 && utcHour < 4) {
        return 'PRE_MARKET';
      }
    }

    return 'CLOSED';
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let adapterInstance: FinSightAdapter | null = null;

export function getFinSightAdapter(): FinSightAdapter {
  if (!adapterInstance) {
    adapterInstance = new FinSightAdapter();
  }
  return adapterInstance;
}

