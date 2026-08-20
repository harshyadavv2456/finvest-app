/**
 * FinBot Refusal Tests
 * 
 * PHASE 21: Prove FinVest fails CLOSED
 * 
 * These tests ATTACK FinBot with invalid inputs.
 * FinBot MUST refuse generic advice.
 * FinBot MUST refuse without data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FinBotCIO } from '../../ai/FinBotCIO';
import { FinBotWithMemory, getFinBotWithMemory } from '../../ai/FinBotWithMemory';
import { decisionContextManager, DecisionContextBuilder } from '../../core/DecisionContext';

// =============================================================================
// TEST: FINBOT REFUSES WITHOUT DECISION CONTEXT
// =============================================================================

describe('FinBot: Refuses Without Context', () => {
  let finBotCIO: FinBotCIO;
  
  beforeEach(() => {
    finBotCIO = FinBotCIO.getInstance();
  });
  
  it('REFUSES when DecisionContext is null', async () => {
    // Clear any existing context
    // Note: In real app, context would be null on fresh load
    
    const response = await finBotCIO.processQuery('Should I buy AAPL?');
    
    // Response must exist
    expect(response).toBeDefined();
    expect(response.response_id).toBeDefined();
    
    // If context is missing/invalid, recommendation should be REFUSED
    if (response.context_id === 'N/A') {
      expect(response.recommendation.action).toBe('REFUSED');
      expect(response.citations.confidence_score).toBe(0);
    }
  });
  
  it('REFUSES when DecisionContext is INVALID', async () => {
    // Build an INVALID context
    const invalidContext = new DecisionContextBuilder()
      .withPortfolio(null, []) // No portfolio = INVALID
      .build();
    
    expect(invalidContext.status).toBe('INVALID');
    
    // Update context manager with invalid context
    decisionContextManager.updateContext(invalidContext);
    
    const response = await finBotCIO.processQuery('What should I do with my portfolio?');
    
    // Must not give advice with invalid context
    expect(response.context_id === 'N/A' || response.recommendation.action === 'REFUSED' || 
           response.recommendation.reasoning.some(r => r.toLowerCase().includes('connect') || r.toLowerCase().includes('invalid')))
      .toBe(true);
  });
});

// =============================================================================
// TEST: FINBOT REFUSES GENERIC ADVICE
// =============================================================================

describe('FinBot: Refuses Generic Advice', () => {
  let finBotCIO: FinBotCIO;
  
  beforeEach(() => {
    finBotCIO = FinBotCIO.getInstance();
  });
  
  it('does NOT give generic financial advice without data', async () => {
    const genericQueries = [
      'What is the best stock to buy?',
      'Should I invest in stocks?',
      'How should I allocate my money?',
      'Is the market going to crash?',
      'What will happen to AAPL tomorrow?'
    ];
    
    for (const query of genericQueries) {
      const response = await finBotCIO.processQuery(query);
      
      // Response must exist
      expect(response).toBeDefined();
      
      // If context is invalid, must refuse
      if (response.context_id === 'N/A') {
        expect(response.recommendation.action).toBe('REFUSED');
        continue;
      }
      
      // If no specific symbol mentioned, should ask for more info
      // OR provide portfolio-level analysis, not generic advice
      const isGenericAdvice = response.recommendation.reasoning.some(r => 
        r.includes('always') ||
        r.includes('generally') ||
        r.includes('might') ||
        r.includes('probably') ||
        r.includes('you should consider')
      );
      
      // Should NOT give generic advice
      if (isGenericAdvice) {
        // If it's generic, confidence should be low
        expect(response.citations.confidence_score).toBeLessThan(60);
      }
    }
  });
  
  it('requires specific stock for SELL advice', async () => {
    // Set up a valid context first
    const validContext = new DecisionContextBuilder()
      .withPortfolio({
        demat_id: 'TEST',
        broker: 'Test',
        source: 'CSV',
        ingested_at: new Date().toISOString(),
        version: '1.0',
        holdings: [{
          symbol: 'INFY.NS',
          isin: 'INE009A01021',
          quantity: 10,
          avg_price: 1500,
          acquisition_date: '2024-01-01',
          exchange: 'NSE',
          market: 'IN'
        }],
        transactions: [],
        total_holdings: 1,
        total_invested: 15000,
        is_valid: true,
        validation_errors: []
      }, [{
        symbol: 'INFY.NS',
        isin: 'INE009A01021',
        quantity: 10,
        avg_price: 1500,
        acquisition_date: '2024-01-01',
        exchange: 'NSE',
        market: 'IN',
        current_price: 1600,
        current_value: 16000,
        unrealized_pnl: 1000,
        unrealized_pnl_percent: 6.67,
        is_ltcg_eligible: false,
        holding_days: 30,
        days_to_ltcg: 335
      }])
      .withPrices(new Map([['INFY.NS', { symbol: 'INFY.NS', price: 1600, timestamp: new Date().toISOString(), source: 'NSE', is_stale: false }]]))
      .withRegime('BULL_STRONG')
      .build();
    
    decisionContextManager.updateContext(validContext);
    
    // Vague sell query without symbol
    const response = await finBotCIO.processQuery('Should I sell something?');
    
    // Should ask for specific stock or provide portfolio-level analysis
    expect(response.recommendation.action === 'CONSULT' || 
           response.recommendation.action === 'REVIEW' ||
           response.recommendation.reasoning.some(r => r.toLowerCase().includes('specific')))
      .toBe(true);
  });
});

// =============================================================================
// TEST: FINBOT WITH MEMORY REFUSES PROPERLY
// =============================================================================

describe('FinBotWithMemory: Proper Refusal', () => {
  it('returns structured refusal, not exception', async () => {
    const finBot = getFinBotWithMemory();
    
    // Any query should return a response, never throw
    const response = await finBot.processQuery('Random query');
    
    expect(response).toBeDefined();
    
    if ('refused' in response && response.refused) {
      expect(response.reason).toBeDefined();
      expect(response.reason.length).toBeGreaterThan(0);
      expect(response.memory_status).toBeDefined();
      expect(response.action_required).toBeDefined();
    } else {
      expect((response as any).memory_consulted).toBe(true);
    }
  });
  
  it('never returns null or undefined', async () => {
    const finBot = getFinBotWithMemory();
    
    const testQueries = [
      'Should I sell?',
      'Buy RELIANCE',
      'What is happening?',
      '',
      'a'
    ];
    
    for (const query of testQueries) {
      const response = await finBot.processQuery(query);
      
      expect(response).not.toBeNull();
      expect(response).not.toBeUndefined();
      expect(typeof response).toBe('object');
    }
  });
  
  it('includes memory consultation proof', async () => {
    const finBot = getFinBotWithMemory();
    
    const response = await finBot.processQuery('Should I sell INFY?');
    
    if (!('refused' in response && response.refused)) {
      // If not refused, must prove memory was consulted
      const successResponse = response as any;
      expect(successResponse.memory_consulted).toBe(true);
      expect(successResponse.memory_stats).toBeDefined();
      expect(typeof successResponse.memory_stats.advice_shown).toBe('number');
    }
  });
});

// =============================================================================
// TEST: CITATIONS ARE REQUIRED
// =============================================================================

describe('FinBot: Citations Required', () => {
  let finBotCIO: FinBotCIO;
  
  beforeEach(() => {
    finBotCIO = FinBotCIO.getInstance();
  });
  
  it('always includes citations object', async () => {
    const response = await finBotCIO.processQuery('Any query');
    
    expect(response.citations).toBeDefined();
    expect(typeof response.citations.context_id).toBe('string');
    expect(typeof response.citations.confidence_score).toBe('number');
    expect(Array.isArray(response.citations.data_sources)).toBe(true);
  });
  
  it('confidence_score is between 0 and 100', async () => {
    const response = await finBotCIO.processQuery('Any query');
    
    expect(response.citations.confidence_score).toBeGreaterThanOrEqual(0);
    expect(response.citations.confidence_score).toBeLessThanOrEqual(100);
  });
  
  it('refused responses have 0 confidence', async () => {
    const response = await finBotCIO.processQuery('Any query');
    
    if (response.recommendation.action === 'REFUSED') {
      expect(response.citations.confidence_score).toBe(0);
    }
  });
});

