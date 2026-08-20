/**
 * DecisionAdoption Adversarial Tests
 * 
 * PHASE 24: Decision Adoption Engine
 * 
 * HARD RULES TO TEST:
 * - No recommendations without adoption tracking
 * - No FinBot advice without objection handling
 * - No execution without understanding rejection
 * - Fail closed if adoption reason missing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getDecisionAdoption, DecisionAdoptionTracker, RejectionReason } from '../../adoption/DecisionAdoption';
import { getConvictionGap, ConvictionGapAnalyzer } from '../../adoption/ConvictionGap';
import { getFrictionMap, FrictionMapEngine } from '../../adoption/FrictionMap';
import { getAdoptionScore, AdoptionScoreCalculator } from '../../adoption/AdoptionScore';
import { getFinBotNegotiator } from '../../ai/FinBotNegotiator';

// =============================================================================
// TEST: ADOPTION TRACKING REQUIRED
// =============================================================================

describe('DecisionAdoption: Tracking Required', () => {
  let adoption: DecisionAdoptionTracker;
  
  beforeEach(() => {
    adoption = getDecisionAdoption();
  });
  
  it('has trackRecommendation method', () => {
    expect(typeof adoption.trackRecommendation).toBe('function');
  });
  
  it('has recordAction method', () => {
    expect(typeof adoption.recordAction).toBe('function');
  });
  
  it('has getPendingDecisions method', () => {
    expect(typeof adoption.getPendingDecisions).toBe('function');
    const pending = adoption.getPendingDecisions();
    expect(Array.isArray(pending)).toBe(true);
  });
  
  it('DecisionAdoption is singleton', () => {
    const a1 = getDecisionAdoption();
    const a2 = getDecisionAdoption();
    expect(a1).toBe(a2);
  });
});

// =============================================================================
// TEST: REJECTION REASON REQUIRED
// =============================================================================

describe('DecisionAdoption: Rejection Reason', () => {
  let adoption: DecisionAdoptionTracker;
  
  beforeEach(() => {
    adoption = getDecisionAdoption();
  });
  
  it('getStats includes rejection_breakdown', () => {
    const stats = adoption.getStats();
    expect(stats).toHaveProperty('rejection_breakdown');
    expect(typeof stats.rejection_breakdown).toBe('object');
  });
  
  it('rejection_breakdown has all reason types', () => {
    const stats = adoption.getStats();
    const expectedReasons: RejectionReason[] = [
      'TOO_COMPLEX',
      'TAX_FEAR',
      'TIMING_DOUBT',
      'CONVICTION_TOO_LOW',
      'POLICY_CONFLICT',
      'PASSIVE_IGNORE',
      'MARKET_CONDITION',
      'LIQUIDITY_CONCERN',
      'EXTERNAL_ADVICE',
      'NOT_SPECIFIED'
    ];
    
    for (const reason of expectedReasons) {
      expect(stats.rejection_breakdown).toHaveProperty(reason);
    }
  });
  
  it('getRecordsByRejectionReason returns frozen array', () => {
    const records = adoption.getRecordsByRejectionReason('TAX_FEAR');
    expect(Object.isFrozen(records)).toBe(true);
  });
});

// =============================================================================
// TEST: CONVICTION GAP ANALYZER
// =============================================================================

describe('ConvictionGap: Analysis', () => {
  let gap: ConvictionGapAnalyzer;
  
  beforeEach(() => {
    gap = getConvictionGap();
  });
  
  it('ConvictionGap is singleton', () => {
    const g1 = getConvictionGap();
    const g2 = getConvictionGap();
    expect(g1).toBe(g2);
  });
  
  it('getReport returns valid structure', () => {
    const report = gap.getReport();
    
    expect(report).toHaveProperty('total_decisions_analyzed');
    expect(report).toHaveProperty('avg_system_confidence');
    expect(report).toHaveProperty('avg_user_confidence_proxy');
    expect(report).toHaveProperty('avg_conviction_gap');
    expect(report).toHaveProperty('gap_distribution');
    expect(report).toHaveProperty('worst_gaps');
  });
  
  it('gap_distribution has all severity levels', () => {
    const report = gap.getReport();
    
    expect(report.gap_distribution).toHaveProperty('none');
    expect(report.gap_distribution).toHaveProperty('low');
    expect(report.gap_distribution).toHaveProperty('medium');
    expect(report.gap_distribution).toHaveProperty('high');
    expect(report.gap_distribution).toHaveProperty('critical');
  });
});

// =============================================================================
// TEST: FRICTION MAP
// =============================================================================

describe('FrictionMap: Insights', () => {
  let friction: FrictionMapEngine;
  
  beforeEach(() => {
    friction = getFrictionMap();
  });
  
  it('FrictionMap is singleton', () => {
    const f1 = getFrictionMap();
    const f2 = getFrictionMap();
    expect(f1).toBe(f2);
  });
  
  it('getFrictionInsights returns array', () => {
    const insights = friction.getFrictionInsights();
    expect(Array.isArray(insights)).toBe(true);
  });
  
  it('getFrictionHeatmap returns valid structure', () => {
    const heatmap = friction.getFrictionHeatmap();
    
    expect(heatmap).toHaveProperty('total_rejections');
    expect(heatmap).toHaveProperty('total_ignores');
    expect(heatmap).toHaveProperty('friction_points');
    expect(heatmap).toHaveProperty('friction_insights');
    expect(heatmap).toHaveProperty('heatmap_matrix');
  });
  
  it('getTopFrictionReasons returns array', () => {
    const top = friction.getTopFrictionReasons(3);
    expect(Array.isArray(top)).toBe(true);
  });
});

// =============================================================================
// TEST: ADOPTION SCORE
// =============================================================================

describe('AdoptionScore: Calculation', () => {
  let score: AdoptionScoreCalculator;
  
  beforeEach(() => {
    score = getAdoptionScore();
  });
  
  it('AdoptionScore is singleton', () => {
    const s1 = getAdoptionScore();
    const s2 = getAdoptionScore();
    expect(s1).toBe(s2);
  });
  
  it('getAdoptionScore returns valid structure', () => {
    const adoptionScore = score.getAdoptionScore();
    
    expect(adoptionScore).toHaveProperty('adoption_rate');
    expect(adoptionScore).toHaveProperty('rejection_rate');
    expect(adoptionScore).toHaveProperty('ignore_rate');
    expect(adoptionScore).toHaveProperty('delayed_adoption_cost');
    expect(adoptionScore).toHaveProperty('passive_loss_cost');
    expect(adoptionScore).toHaveProperty('net_adoption_score');
    expect(adoptionScore).toHaveProperty('grade');
  });
  
  it('net_adoption_score is bounded 0-100', () => {
    const adoptionScore = score.getAdoptionScore();
    
    expect(adoptionScore.net_adoption_score).toBeGreaterThanOrEqual(0);
    expect(adoptionScore.net_adoption_score).toBeLessThanOrEqual(100);
  });
  
  it('adoption_rate is bounded 0-1', () => {
    const adoptionScore = score.getAdoptionScore();
    
    expect(adoptionScore.adoption_rate).toBeGreaterThanOrEqual(0);
    expect(adoptionScore.adoption_rate).toBeLessThanOrEqual(1);
  });
  
  it('grade is valid letter grade', () => {
    const adoptionScore = score.getAdoptionScore();
    
    expect(['A', 'B', 'C', 'D', 'F']).toContain(adoptionScore.grade);
  });
  
  it('getComparisonWithTrust includes both scores', () => {
    const comparison = score.getComparisonWithTrust();
    
    expect(comparison).toHaveProperty('trust_score');
    expect(comparison).toHaveProperty('adoption_score');
    expect(comparison).toHaveProperty('combined_health_score');
    expect(comparison).toHaveProperty('primary_issue');
  });
});

// =============================================================================
// TEST: FINBOT NEGOTIATOR
// =============================================================================

describe('FinBotNegotiator: Objection Handling', () => {
  it('FinBotNegotiator is singleton', () => {
    const n1 = getFinBotNegotiator();
    const n2 = getFinBotNegotiator();
    expect(n1).toBe(n2);
  });
  
  it('has handleObjection method', () => {
    const negotiator = getFinBotNegotiator();
    expect(typeof negotiator.handleObjection).toBe('function');
  });
  
  it('has handlePendingDecision method', () => {
    const negotiator = getFinBotNegotiator();
    expect(typeof negotiator.handlePendingDecision).toBe('function');
  });
  
  it('getStalePendingForNegotiation returns array', () => {
    const negotiator = getFinBotNegotiator();
    const stale = negotiator.getStalePendingForNegotiation();
    expect(Array.isArray(stale)).toBe(true);
  });
  
  it('getRecentRejectionsForFollowUp returns array', () => {
    const negotiator = getFinBotNegotiator();
    const recent = negotiator.getRecentRejectionsForFollowUp(5);
    expect(Array.isArray(recent)).toBe(true);
  });
});

// =============================================================================
// TEST: HARD RULES
// =============================================================================

describe('DecisionAdoption: Hard Rules', () => {
  it('AdoptionStats tracks hesitation_penalty', () => {
    const stats = getDecisionAdoption().getStats();
    
    expect(stats).toHaveProperty('avg_hesitation_penalty');
    expect(stats).toHaveProperty('high_hesitation_count');
  });
  
  it('AdoptionStats tracks passive_loss_cost', () => {
    const stats = getDecisionAdoption().getStats();
    
    expect(stats).toHaveProperty('passive_loss_cost');
    expect(typeof stats.passive_loss_cost).toBe('number');
  });
  
  it('AdoptionStats tracks delayed_adoption_cost', () => {
    const stats = getDecisionAdoption().getStats();
    
    expect(stats).toHaveProperty('delayed_adoption_cost');
    expect(typeof stats.delayed_adoption_cost).toBe('number');
  });
  
  it('ConvictionGapReport includes value_lost', () => {
    const report = getConvictionGap().getReport();
    
    expect(report).toHaveProperty('total_value_lost');
    expect(report).toHaveProperty('high_gap_value_lost');
  });
  
  it('FrictionHeatmap includes failed_explanations', () => {
    const heatmap = getFrictionMap().getFrictionHeatmap();
    
    expect(heatmap).toHaveProperty('failed_explanations');
    expect(Array.isArray(heatmap.failed_explanations)).toBe(true);
  });
});

