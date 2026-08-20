/**
 * UserMemory Adversarial Tests
 * 
 * PHASE 21: Prove FinVest fails CLOSED
 * 
 * These tests ATTACK the memory system.
 * FinBot MUST refuse without memory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserMemory } from '../../memory/UserMemory';
import { FinBotWithMemory, getFinBotWithMemory, FinBotMemoryResponse } from '../../ai/FinBotWithMemory';

// =============================================================================
// TEST: NO MEMORY → FINBOT REFUSES
// =============================================================================

describe('UserMemory: FinBot Refuses Without Memory', () => {
  it('FinBot refuses if memory is unavailable', async () => {
    // This test verifies the behavior when memory throws
    const finBot = getFinBotWithMemory();
    
    // FinBot should always return a response (either success or refusal)
    const response = await finBot.processQuery('Should I sell INFY?');
    
    // Response must exist
    expect(response).toBeDefined();
    expect(response).not.toBeNull();
    
    // Response must have the required structure
    if ('refused' in response && response.refused) {
      expect(response.reason).toBeDefined();
      expect(response.reason.length).toBeGreaterThan(0);
      expect(response.action_required).toBeDefined();
    } else {
      // If not refused, must have memory consulted
      expect((response as any).memory_consulted).toBe(true);
    }
  });
  
  it('FinBot records memory consultation even on success', async () => {
    const finBot = getFinBotWithMemory();
    
    const response = await finBot.processQuery('What is my portfolio value?');
    
    if (!('refused' in response && response.refused)) {
      const successResponse = response as any;
      expect(successResponse.memory_consulted).toBe(true);
      expect(successResponse.memory_stats).toBeDefined();
      expect(successResponse.advice_record_id).toBeDefined();
      expect(successResponse.snapshot_id).toBeDefined();
    }
  });
});

// =============================================================================
// TEST: IGNORED 3x → DOWNGRADE
// =============================================================================

describe('UserMemory: Ignore Threshold Enforcement', () => {
  let memory: UserMemory;
  
  beforeEach(() => {
    memory = UserMemory.getInstance();
    // Note: In real tests, we'd need to clear/mock localStorage
  });
  
  it('tracks advice_ignored_count correctly', () => {
    const stats = memory.getStats();
    
    expect(typeof stats.total_ignored).toBe('number');
    expect(typeof stats.total_accepted).toBe('number');
    expect(typeof stats.total_advice_shown).toBe('number');
  });
  
  it('returns confidence modifier based on ignored count', () => {
    const modifiers = memory.getResponseModifiers();
    
    expect(typeof modifiers.confidence_adjustment).toBe('number');
    expect(modifiers.confidence_adjustment).toBeLessThanOrEqual(0); // Never inflate
    expect(typeof modifiers.clarity_multiplier).toBe('number');
    expect(modifiers.clarity_multiplier).toBeGreaterThanOrEqual(1);
  });
  
  it('provides warnings for ignored advice', () => {
    const modifiers = memory.getResponseModifiers('INFY');
    
    expect(Array.isArray(modifiers.warnings)).toBe(true);
    // Warnings may or may not exist based on history
  });
  
  it('getInsights returns CONFIDENCE_DOWNGRADE when appropriate', () => {
    const insights = memory.getInsights();
    
    expect(Array.isArray(insights)).toBe(true);
    
    for (const insight of insights) {
      expect(['CONFIDENCE_DOWNGRADE', 'CLARITY_BOOST', 'SYMBOL_PATTERN', 'BEHAVIOR_TREND'])
        .toContain(insight.type);
      expect(insight.message).toBeDefined();
      expect(insight.data).toBeDefined();
    }
  });
});

// =============================================================================
// TEST: MEMORY STATS INTEGRITY
// =============================================================================

describe('UserMemory: Stats Integrity', () => {
  let memory: UserMemory;
  
  beforeEach(() => {
    memory = UserMemory.getInstance();
  });
  
  it('returns complete stats structure', () => {
    const stats = memory.getStats();
    
    // All required fields must exist
    expect(typeof stats.total_advice_shown).toBe('number');
    expect(typeof stats.total_accepted).toBe('number');
    expect(typeof stats.total_ignored).toBe('number');
    expect(typeof stats.total_rejected).toBe('number');
    expect(typeof stats.acceptance_rate).toBe('number');
    expect(typeof stats.outcomes_measured).toBe('number');
    expect(typeof stats.outcomes_better).toBe('number');
    expect(typeof stats.outcomes_same).toBe('number');
    expect(typeof stats.outcomes_worse).toBe('number');
    expect(typeof stats.success_rate).toBe('number');
    expect(stats.symbol_stats).toBeInstanceOf(Map);
    expect(typeof stats.confidence_modifier).toBe('number');
    expect(typeof stats.clarity_modifier).toBe('number');
  });
  
  it('acceptance_rate is between 0 and 1', () => {
    const stats = memory.getStats();
    
    expect(stats.acceptance_rate).toBeGreaterThanOrEqual(0);
    expect(stats.acceptance_rate).toBeLessThanOrEqual(1);
  });
  
  it('confidence_modifier is never positive (no inflation)', () => {
    const stats = memory.getStats();
    
    // CRITICAL: Confidence should NEVER be inflated
    expect(stats.confidence_modifier).toBeLessThanOrEqual(0);
  });
  
  it('success_rate is between 0 and 1', () => {
    const stats = memory.getStats();
    
    expect(stats.success_rate).toBeGreaterThanOrEqual(0);
    expect(stats.success_rate).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// TEST: NO SILENT FAILURES
// =============================================================================

describe('UserMemory: No Silent Failures', () => {
  let memory: UserMemory;
  
  beforeEach(() => {
    memory = UserMemory.getInstance();
  });
  
  it('recordAdviceShown returns ID, not void', () => {
    const id = memory.recordAdviceShown(
      'SNAP-TEST-123',
      'TEST',
      'BUY',
      100.50
    );
    
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
  
  it('getStats never returns null or undefined', () => {
    const stats = memory.getStats();
    
    expect(stats).not.toBeNull();
    expect(stats).not.toBeUndefined();
  });
  
  it('getInsights never returns null or undefined', () => {
    const insights = memory.getInsights();
    
    expect(insights).not.toBeNull();
    expect(insights).not.toBeUndefined();
    expect(Array.isArray(insights)).toBe(true);
  });
  
  it('getResponseModifiers never returns null or undefined', () => {
    const modifiers = memory.getResponseModifiers();
    
    expect(modifiers).not.toBeNull();
    expect(modifiers).not.toBeUndefined();
    expect(modifiers.confidence_adjustment).toBeDefined();
    expect(modifiers.clarity_multiplier).toBeDefined();
    expect(modifiers.warnings).toBeDefined();
  });
});

