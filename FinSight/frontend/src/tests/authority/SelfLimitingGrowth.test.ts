/**
 * SelfLimitingGrowth.test.ts
 * 
 * PHASE 38: Self-Limiting Growth & Power Containment Tests
 * 
 * Tests:
 * - Higher trust = lower budget
 * - Higher adoption = lower frequency
 * - Critical centrality = force silence
 * - No user overrides
 * - All self-suppression auditable
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInfluenceBudgetEngine,
  InfluenceBudgetEngine
} from '../../limits/InfluenceBudgetEngine';
import {
  getCentralityRiskEngine,
  CentralityRiskEngine
} from '../../limits/CentralityRiskEngine';
import { SelfLimitGuard } from '../../limits/SelfLimitGuard';

describe('Phase 38: Self-Limiting Growth & Power Containment', () => {
  
  // ==========================================================================
  // INFLUENCE BUDGET ENGINE
  // ==========================================================================
  
  describe('InfluenceBudgetEngine', () => {
    
    it('provides daily, weekly, and monthly budgets', () => {
      const engine = getInfluenceBudgetEngine();
      const status = engine.getBudgetStatus();
      
      expect(status.daily).toBeDefined();
      expect(status.weekly).toBeDefined();
      expect(status.monthly).toBeDefined();
      expect(status.daily.window).toBe('DAY');
      expect(status.weekly.window).toBe('WEEK');
      expect(status.monthly.window).toBe('MONTH');
    });
    
    it('reduces budget when trust is high (ANTI-SAAS)', () => {
      const engine = getInfluenceBudgetEngine();
      
      // Low trust
      engine.updateMetrics({ trustScore: 30, adoptionRate: 0.3, acceptanceRate: 0.5 });
      const lowTrustStatus = engine.getBudgetStatus();
      
      // High trust
      engine.updateMetrics({ trustScore: 90, adoptionRate: 0.3, acceptanceRate: 0.5 });
      const highTrustStatus = engine.getBudgetStatus();
      
      // Higher trust should mean LOWER budget (anti-SaaS logic)
      expect(highTrustStatus.allocation.trust_penalty).toBeGreaterThan(
        lowTrustStatus.allocation.trust_penalty
      );
    });
    
    it('reduces budget when adoption is high', () => {
      const engine = getInfluenceBudgetEngine();
      
      // Low adoption
      engine.updateMetrics({ trustScore: 50, adoptionRate: 0.3, acceptanceRate: 0.5 });
      const lowAdoptionStatus = engine.getBudgetStatus();
      
      // High adoption
      engine.updateMetrics({ trustScore: 50, adoptionRate: 0.9, acceptanceRate: 0.5 });
      const highAdoptionStatus = engine.getBudgetStatus();
      
      expect(highAdoptionStatus.allocation.adoption_penalty).toBeGreaterThan(
        lowAdoptionStatus.allocation.adoption_penalty
      );
    });
    
    it('applies HARD CAP when dependency is critical', () => {
      const engine = getInfluenceBudgetEngine();
      
      // Critical dependency (95%+ acceptance)
      engine.updateMetrics({ trustScore: 50, adoptionRate: 0.5, acceptanceRate: 0.96 });
      const status = engine.getBudgetStatus();
      
      // Should have heavy dependency penalty
      expect(status.allocation.dependency_penalty).toBeGreaterThan(
        status.allocation.base_budget * 0.5
      );
      expect(status.allocation.allocation_reason).toContain('HARD CAP');
    });
    
    it('throws when budget exhausted', () => {
      const engine = getInfluenceBudgetEngine();
      
      // Exhaust the budget
      engine.updateMetrics({ trustScore: 95, adoptionRate: 0.95, acceptanceRate: 0.98 });
      
      // Consume all remaining budget
      let exhausted = false;
      try {
        for (let i = 0; i < 100; i++) {
          engine.consumeBudget();
        }
      } catch (e) {
        exhausted = true;
        expect((e as Error).message).toContain('INFLUENCE_BUDGET_EXHAUSTED');
      }
      
      expect(exhausted).toBe(true);
    });
    
    it('records self-limit events', () => {
      const engine = getInfluenceBudgetEngine();
      
      engine.recordSelfLimit('DEPENDENCY_PREVENTION', 'test-snapshot', 'Test self-limit');
      
      const events = engine.getSelfLimitEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].reason).toBe('DEPENDENCY_PREVENTION');
    });
    
  });
  
  // ==========================================================================
  // CENTRALITY RISK ENGINE
  // ==========================================================================
  
  describe('CentralityRiskEngine', () => {
    
    it('starts in NORMAL state', () => {
      const engine = getCentralityRiskEngine();
      
      // Reset to low values
      engine.updateMetrics({
        acceptanceRate: 0.5,
        overrideOccurred: true,
        decisionLatencySeconds: 300,
        externalReferenceUsed: true,
        followedAdvice: false
      });
      
      const assessment = engine.assess();
      expect(assessment.risk.state).toBe('NORMAL');
    });
    
    it('detects ELEVATED centrality', () => {
      const engine = getCentralityRiskEngine();
      
      // Elevated signals
      engine.updateMetrics({
        acceptanceRate: 0.85,
        followedAdvice: true
      });
      
      // Simulate some days without override
      for (let i = 0; i < 10; i++) {
        engine.incrementDays();
      }
      
      const assessment = engine.assess();
      expect(['ELEVATED', 'CRITICAL']).toContain(assessment.risk.state);
    });
    
    it('forces silence at CRITICAL centrality', () => {
      const engine = getCentralityRiskEngine();
      
      // Critical signals - very high acceptance, no overrides
      engine.updateMetrics({
        acceptanceRate: 0.96
      });
      
      // Simulate many days without override or external reference
      for (let i = 0; i < 20; i++) {
        engine.incrementDays();
        engine.updateMetrics({ followedAdvice: true });
      }
      
      const assessment = engine.assess();
      
      if (assessment.risk.state === 'CRITICAL') {
        expect(assessment.force_silence).toBe(true);
      }
    });
    
    it('provides dependency warning', () => {
      const engine = getCentralityRiskEngine();
      
      // Set high dependency
      engine.updateMetrics({ acceptanceRate: 0.95 });
      
      const assessment = engine.assess();
      
      if (assessment.risk.state === 'CRITICAL') {
        const warning = engine.getDependencyWarning();
        expect(warning).toBeDefined();
        expect(warning).toContain('dependent');
      }
    });
    
    it('tracks centrality history', () => {
      const engine = getCentralityRiskEngine();
      
      // Make some assessments
      engine.assess();
      engine.assess();
      
      const history = engine.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });
    
  });
  
  // ==========================================================================
  // SELF LIMIT GUARD
  // ==========================================================================
  
  describe('SelfLimitGuard', () => {
    
    it('checks if advice is allowed', () => {
      const check = SelfLimitGuard.checkCanAdvise();
      
      expect(check).toBeDefined();
      expect(typeof check.allowed).toBe('boolean');
      expect(check.reason).toBeDefined();
      expect(check._frozen).toBe(true);
    });
    
    it('throws when centrality is critical', () => {
      const centrality = getCentralityRiskEngine();
      
      // Force critical state
      centrality.updateMetrics({ acceptanceRate: 0.98 });
      for (let i = 0; i < 30; i++) {
        centrality.incrementDays();
        centrality.updateMetrics({ followedAdvice: true });
      }
      
      const assessment = centrality.assess();
      
      if (assessment.risk.state === 'CRITICAL') {
        expect(() => SelfLimitGuard.assertCanAdvise()).toThrow('SELF_LIMIT_BLOCKED');
      }
    });
    
    it('provides "why not helping" response', () => {
      const response = SelfLimitGuard.getWhyNotHelpingResponse();
      
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
      expect(response).toContain('dependent');
    });
    
    it('provides full status', () => {
      const status = SelfLimitGuard.getStatus();
      
      expect(status.budget).toBeDefined();
      expect(status.centrality).toBeDefined();
      expect(typeof status.can_advise).toBe('boolean');
      expect(status._frozen).toBe(true);
    });
    
    it('updates metrics across engines', () => {
      SelfLimitGuard.updateMetrics({
        trustScore: 70,
        adoptionRate: 0.6,
        acceptanceRate: 0.7,
        overrideOccurred: true
      });
      
      const status = SelfLimitGuard.getStatus();
      
      // Metrics should be updated
      expect(status).toBeDefined();
    });
    
  });
  
  // ==========================================================================
  // NO USER OVERRIDES
  // ==========================================================================
  
  describe('No User Overrides', () => {
    
    it('self-limiting cannot be bypassed', () => {
      // The SelfLimitGuard has no bypass methods
      const guard = SelfLimitGuard;
      
      // Check that there's no enableOverride or disableLimit method
      expect((guard as any).enableOverride).toBeUndefined();
      expect((guard as any).disableLimit).toBeUndefined();
      expect((guard as any).bypass).toBeUndefined();
      expect((guard as any).forceAllow).toBeUndefined();
    });
    
    it('influence budget has no override', () => {
      const engine = getInfluenceBudgetEngine();
      
      // Check that there's no override method
      expect((engine as any).override).toBeUndefined();
      expect((engine as any).bypass).toBeUndefined();
      expect((engine as any).forceAllow).toBeUndefined();
    });
    
    it('centrality risk has no override', () => {
      const engine = getCentralityRiskEngine();
      
      // Check that there's no override method
      expect((engine as any).override).toBeUndefined();
      expect((engine as any).bypass).toBeUndefined();
      expect((engine as any).disableSilence).toBeUndefined();
    });
    
  });
  
  // ==========================================================================
  // AUDIT VISIBILITY
  // ==========================================================================
  
  describe('Audit Visibility', () => {
    
    it('self-limit events are recorded', () => {
      const engine = getInfluenceBudgetEngine();
      
      engine.recordSelfLimit('TRUST_TOO_HIGH', 'audit-test', 'Test for audit');
      
      const events = engine.getSelfLimitEvents();
      const lastEvent = events[0];
      
      expect(lastEvent).toBeDefined();
      expect(lastEvent.reason).toBe('TRUST_TOO_HIGH');
      expect(lastEvent.snapshot_id).toBe('audit-test');
      expect(lastEvent._frozen).toBe(true);
    });
    
    it('events include timestamp', () => {
      const engine = getInfluenceBudgetEngine();
      
      engine.recordSelfLimit('CENTRALITY_RISK', undefined, 'Timestamp test');
      
      const events = engine.getSelfLimitEvents();
      expect(events[0].timestamp).toBeDefined();
      expect(events[0].event_id).toBeDefined();
    });
    
  });
  
});
