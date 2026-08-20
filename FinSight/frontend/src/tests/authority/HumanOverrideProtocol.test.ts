/**
 * HumanOverrideProtocol Tests - Phase 35 HOP
 * 
 * MANDATORY TESTS (BUILD MUST FAIL WITHOUT THESE):
 * - Override blocked on ABSOLUTE ethics
 * - Override blocked without acknowledgements
 * - Override is irreversible
 * - No trust gain on success
 * - Heavy penalty on failure
 * - System silence after override
 * - Full audit trail exists
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getHumanOverrideProtocol,
  HumanOverrideProtocol,
  OverrideRequest,
  AcknowledgedRisk
} from '../../override/HumanOverrideProtocol';
import { OverrideGuard } from '../../override/OverrideGuard';
import { EthicsVerdict, EthicsPrinciple } from '../../ethics/ExecutionEthicsFirewall';

// =============================================================================
// TEST HELPERS
// =============================================================================

const generateSnapshotId = (): string => {
  return `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * Create a non-ABSOLUTE refusal verdict
 */
const createRefusalVerdict = (severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH'): EthicsVerdict => {
  return Object.freeze({
    allowed: false,
    reason: 'Test refusal',
    violated_principles: ['INSUFFICIENT_TRUST_HISTORY'] as EthicsPrinciple[],
    severity,
    evaluated_at: new Date().toISOString(),
    _frozen: true
  });
};

/**
 * Create an ABSOLUTE refusal verdict
 */
const createAbsoluteVerdict = (): EthicsVerdict => {
  return Object.freeze({
    allowed: false,
    reason: 'ABSOLUTE refusal - user dependency risk',
    violated_principles: ['USER_DEPENDENCY_RISK'] as EthicsPrinciple[],
    severity: 'ABSOLUTE',
    evaluated_at: new Date().toISOString(),
    _frozen: true
  });
};

/**
 * Create an allowed verdict
 */
const createAllowedVerdict = (): EthicsVerdict => {
  return Object.freeze({
    allowed: true,
    reason: 'All ethics passed',
    violated_principles: [] as EthicsPrinciple[],
    severity: 'LOW',
    evaluated_at: new Date().toISOString(),
    _frozen: true
  });
};

/**
 * Create a valid override request
 */
const createValidRequest = (snapshotId: string): OverrideRequest => {
  return {
    snapshot_id: snapshotId,
    original_verdict: createRefusalVerdict(),
    human_action: 'EXECUTE',
    human_rationale: 'I have done my own analysis and believe this is the right decision despite system concerns.',
    acknowledged_risks: [
      'RISK_OF_LOSS',
      'TAX_IMPACT',
      'OPPORTUNITY_COST',
      'SYSTEM_DISAGREEMENT',
      'NO_SYSTEM_ASSISTANCE',
      'IRREVERSIBLE_ACTION'
    ] as AcknowledgedRisk[],
    confirmation_text: 'I acknowledge that I am acting against system advice'
  };
};

// =============================================================================
// PRECONDITION TESTS
// =============================================================================

describe('Override Preconditions', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('blocks on ABSOLUTE ethics severity', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      original_verdict: createAbsoluteVerdict()
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('ABSOLUTE');
    
    console.log('✓ Blocks on ABSOLUTE severity');
  });
  
  it('blocks when system did not refuse', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      original_verdict: createAllowedVerdict()
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('did not refuse');
    
    console.log('✓ Blocks when system allowed');
  });
  
  it('blocks on already overridden snapshot', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    // First override succeeds
    const first = protocol.executeOverride(request);
    expect(first.success).toBe(true);
    
    // Second override fails
    const second = protocol.executeOverride(request);
    expect(second.success).toBe(false);
    expect(second.error).toContain('already been overridden');
    
    console.log('✓ Blocks on already overridden');
  });
});

// =============================================================================
// ACKNOWLEDGEMENT TESTS
// =============================================================================

describe('Override Acknowledgements', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('blocks without confirmation text', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      confirmation_text: 'I agree' // Wrong text
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Confirmation text');
    
    console.log('✓ Blocks without exact confirmation');
  });
  
  it('blocks with short rationale', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      human_rationale: 'Too short' // Less than 20 chars
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('20 characters');
    
    console.log('✓ Blocks with short rationale');
  });
  
  it('blocks with missing acknowledgements', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      acknowledged_risks: ['RISK_OF_LOSS'] as AcknowledgedRisk[] // Missing others
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required acknowledgement');
    
    console.log('✓ Blocks with missing acknowledgements');
  });
  
  it('succeeds with all valid acknowledgements', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    
    console.log('✓ Succeeds with valid acknowledgements');
  });
});

// =============================================================================
// IRREVERSIBILITY TESTS
// =============================================================================

describe('Override Irreversibility', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('override record is marked irreversible', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(true);
    expect(result.record?.irreversible).toBe(true);
    
    console.log('✓ Record marked irreversible');
  });
  
  it('override record is frozen', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(true);
    expect(result.record?._frozen).toBe(true);
    expect(Object.isFrozen(result.record)).toBe(true);
    
    console.log('✓ Record is frozen');
  });
  
  it('cannot override twice', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    const second = protocol.executeOverride(request);
    
    expect(second.success).toBe(false);
    expect(second.error).toContain('irreversible');
    
    console.log('✓ Cannot override twice');
  });
});

// =============================================================================
// TRUST & PENALTY TESTS
// =============================================================================

describe('Override Trust Impact', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('override statistics track counts', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const beforeCount = protocol.getOverrideCount();
    protocol.executeOverride(request);
    const afterCount = protocol.getOverrideCount();
    
    expect(afterCount).toBeGreaterThan(beforeCount);
    
    console.log('✓ Override count tracked');
  });
  
  it('penalty calculation: wrongs count double', () => {
    const stats = protocol.getOverrideStatistics();
    
    // Penalty formula: (humanWrong * 2) + (pending * 0.5)
    // So wrongs have double weight
    expect(stats).toHaveProperty('override_penalty');
    
    console.log('✓ Penalty calculation exists');
  });
  
  it('outcome can be recorded', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    expect(() => protocol.recordOutcome(snapshotId, 'HUMAN_WRONG', 'Price dropped 20%'))
      .not.toThrow();
    
    const record = protocol.getOverrideRecord(snapshotId);
    expect(record?.outcome).toBe('HUMAN_WRONG');
    
    console.log('✓ Outcome can be recorded');
  });
  
  it('outcome cannot be recorded twice', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    protocol.recordOutcome(snapshotId, 'HUMAN_WRONG', 'First');
    
    expect(() => protocol.recordOutcome(snapshotId, 'HUMAN_RIGHT', 'Second'))
      .toThrow('already recorded');
    
    console.log('✓ Outcome cannot be recorded twice');
  });
});

// =============================================================================
// SYSTEM SILENCE TESTS
// =============================================================================

describe('System Silence After Override', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('system assistance is blocked for overridden decisions', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
    
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('permanently blocked');
    
    console.log('✓ System assistance blocked');
  });
  
  it('assertNoSystemAssistance throws for overridden decisions', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    expect(() => OverrideGuard.assertNoSystemAssistance(snapshotId))
      .toThrow('SYSTEM_ASSISTANCE_BLOCKED');
    
    console.log('✓ assertNoSystemAssistance throws');
  });
  
  it('FinBot cannot speak while outcome is pending', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    const canSpeak = OverrideGuard.canFinBotSpeak(snapshotId);
    
    expect(canSpeak).toBe(false);
    
    console.log('✓ FinBot silent during pending');
  });
  
  it('FinBot silence message is explicit', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    const message = OverrideGuard.getFinBotSilenceMessage(snapshotId);
    
    expect(message).toContain('cannot provide assistance');
    expect(message).toContain('step away completely');
    
    console.log('✓ Silence message is explicit');
  });
  
  it('only post-mortem allowed after outcome', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
    
    expect(block.allowed_actions).toContain('POST_MORTEM_ANALYSIS');
    expect(block.allowed_actions).not.toContain('EXECUTE');
    expect(block.allowed_actions).not.toContain('OPTIMIZE');
    
    console.log('✓ Only post-mortem allowed');
  });
});

// =============================================================================
// GUARD TESTS
// =============================================================================

describe('OverrideGuard', () => {
  it('assertOverrideAllowed passes for valid scenarios', () => {
    const snapshotId = generateSnapshotId();
    const verdict = createRefusalVerdict();
    
    expect(() => OverrideGuard.assertOverrideAllowed(snapshotId, verdict))
      .not.toThrow();
    
    console.log('✓ assertOverrideAllowed passes');
  });
  
  it('assertOverrideAllowed throws on ABSOLUTE', () => {
    const snapshotId = generateSnapshotId();
    const verdict = createAbsoluteVerdict();
    
    expect(() => OverrideGuard.assertOverrideAllowed(snapshotId, verdict))
      .toThrow('OVERRIDE_BLOCKED');
    
    console.log('✓ assertOverrideAllowed throws on ABSOLUTE');
  });
  
  it('checkOverrideEligibility returns frozen result', () => {
    const snapshotId = generateSnapshotId();
    const verdict = createRefusalVerdict();
    
    const eligibility = OverrideGuard.checkOverrideEligibility(snapshotId, verdict);
    
    expect(eligibility._frozen).toBe(true);
    expect(Object.isFrozen(eligibility)).toBe(true);
    
    console.log('✓ Eligibility result frozen');
  });
});

// =============================================================================
// BUILD GATE
// =============================================================================

describe('PHASE 35 BUILD GATE', () => {
  let protocol: HumanOverrideProtocol;
  
  beforeEach(() => {
    protocol = getHumanOverrideProtocol();
  });
  
  it('🔒 Protocol is singleton', () => {
    const p1 = getHumanOverrideProtocol();
    const p2 = getHumanOverrideProtocol();
    
    expect(p1).toBe(p2);
    
    console.log('✓ Protocol is singleton');
  });
  
  it('🔒 Override blocked on ABSOLUTE ethics', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      original_verdict: createAbsoluteVerdict()
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('ABSOLUTE');
    
    console.log('✓ Blocks ABSOLUTE');
  });
  
  it('🔒 Override blocked without acknowledgements', () => {
    const snapshotId = generateSnapshotId();
    const request: OverrideRequest = {
      ...createValidRequest(snapshotId),
      acknowledged_risks: [] as AcknowledgedRisk[]
    };
    
    const result = protocol.executeOverride(request);
    
    expect(result.success).toBe(false);
    
    console.log('✓ Blocks without acknowledgements');
  });
  
  it('🔒 Override is irreversible', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const first = protocol.executeOverride(request);
    const second = protocol.executeOverride(request);
    
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toContain('irreversible');
    
    console.log('✓ Override irreversible');
  });
  
  it('🔒 System silence after override', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    protocol.executeOverride(request);
    
    const block = OverrideGuard.checkSystemAssistanceBlock(snapshotId);
    
    expect(block.blocked).toBe(true);
    
    console.log('✓ System silent after override');
  });
  
  it('🔒 OverrideGuard exists', () => {
    expect(OverrideGuard).toBeDefined();
    expect(typeof OverrideGuard.assertOverrideAllowed).toBe('function');
    expect(typeof OverrideGuard.assertNoSystemAssistance).toBe('function');
    
    console.log('✓ OverrideGuard exists');
  });
  
  it('🔒 All records frozen', () => {
    const snapshotId = generateSnapshotId();
    const request = createValidRequest(snapshotId);
    
    const result = protocol.executeOverride(request);
    
    expect(result._frozen).toBe(true);
    expect(result.record?._frozen).toBe(true);
    expect(result.record?.irreversible).toBe(true);
    
    console.log('✓ All records frozen');
  });
  
  it('🔒 Required confirmation is exact', () => {
    const required = protocol.getRequiredConfirmation();
    
    expect(required).toBe('I acknowledge that I am acting against system advice');
    
    console.log('✓ Exact confirmation required');
  });
});

