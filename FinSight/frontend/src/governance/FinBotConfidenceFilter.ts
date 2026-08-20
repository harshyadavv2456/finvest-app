/**
 * FinBotConfidenceFilter - Confidence Speech Filter for FinBot
 * 
 * PHASE 28: Confidence Governance
 * 
 * PURPOSE:
 * Filter all FinBot responses through confidence governance.
 * 
 * RULES:
 * - If MUTED: Explicitly say "My confidence is restricted due to past overconfidence."
 * - If RESTRAINED: Soften confidence language, no strong imperatives
 * - NO hidden downgrades
 * - All adjustments visible to user
 */

import { getConfidenceGovernor, GovernedConfidence, GovernorState } from './ConfidenceGovernor';
import { DisciplineState, DISCIPLINE_STATE_DESCRIPTIONS } from './ConfidenceDisciplinePolicy';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';
import { getQuestionFirstGovernor, QuestionGate, GateContext } from '../silence/QuestionFirstGovernor';

// =============================================================================
// TYPES
// =============================================================================

/**
 * FilteredResponse - FinBot response after confidence filtering
 */
export interface FilteredResponse {
  readonly original_response: string;
  readonly filtered_response: string;
  readonly was_modified: boolean;
  readonly modification_reason?: string;
  readonly governed_confidence: GovernedConfidence;
  readonly confidence_disclosure: string;
  readonly language_softened: boolean;
  readonly imperatives_removed: boolean;
  readonly _frozen: true;
}

/**
 * ConfidenceLanguage - Mapping of confidence levels to language
 */
export interface ConfidenceLanguage {
  quantifier: string;           // "I am X% confident"
  certainty_phrase: string;     // "likely", "possibly", etc.
  action_phrase: string;        // "should", "might consider", etc.
  qualifier: string;            // Additional softening if needed
}

// =============================================================================
// LANGUAGE MAPPINGS
// =============================================================================

/**
 * Normal state language (confidence as stated)
 */
const NORMAL_LANGUAGE: Record<string, ConfidenceLanguage> = {
  high: {      // 75-85
    quantifier: 'high',
    certainty_phrase: 'likely',
    action_phrase: 'should consider',
    qualifier: ''
  },
  medium: {    // 50-74
    quantifier: 'moderate',
    certainty_phrase: 'appears to',
    action_phrase: 'may want to',
    qualifier: ''
  },
  low: {       // <50
    quantifier: 'low',
    certainty_phrase: 'might',
    action_phrase: 'could explore',
    qualifier: 'but with caution'
  }
};

/**
 * Restrained state language (softened)
 */
const RESTRAINED_LANGUAGE: Record<string, ConfidenceLanguage> = {
  high: {
    quantifier: 'moderate',     // Downgraded from high
    certainty_phrase: 'appears to',
    action_phrase: 'may want to consider',
    qualifier: 'though I recommend additional review'
  },
  medium: {
    quantifier: 'modest',
    certainty_phrase: 'possibly',
    action_phrase: 'might consider',
    qualifier: 'with careful evaluation'
  },
  low: {
    quantifier: 'limited',
    certainty_phrase: 'could',
    action_phrase: 'might explore',
    qualifier: 'with significant caution'
  }
};

/**
 * Muted state language (maximally softened)
 */
const MUTED_LANGUAGE: Record<string, ConfidenceLanguage> = {
  high: {
    quantifier: 'limited',      // Severely downgraded
    certainty_phrase: 'may',
    action_phrase: 'could consider',
    qualifier: '(note: my confidence is restricted)'
  },
  medium: {
    quantifier: 'uncertain',
    certainty_phrase: 'might',
    action_phrase: 'could explore',
    qualifier: '(note: my confidence is restricted)'
  },
  low: {
    quantifier: 'very limited',
    certainty_phrase: 'possibly',
    action_phrase: 'might want to research',
    qualifier: '(note: my confidence is restricted)'
  }
};

/**
 * Strong imperatives to remove/soften
 */
const STRONG_IMPERATIVES = [
  'you must',
  'you should definitely',
  'you need to',
  'definitely',
  'certainly',
  'absolutely',
  'without doubt',
  'I am certain',
  'I am sure',
  'strongly recommend',
  'strongly suggest',
  'highly confident',
  'very confident'
];

/**
 * Imperative replacements
 */
const IMPERATIVE_REPLACEMENTS: Record<string, string> = {
  'you must': 'you may want to',
  'you should definitely': 'you might consider',
  'you need to': 'it may be worth',
  'definitely': 'possibly',
  'certainly': 'potentially',
  'absolutely': 'likely',
  'without doubt': 'with some confidence',
  'I am certain': 'I believe',
  'I am sure': 'I think',
  'strongly recommend': 'suggest considering',
  'strongly suggest': 'might consider',
  'highly confident': 'moderately confident',
  'very confident': 'reasonably confident'
};

// =============================================================================
// FINBOT CONFIDENCE FILTER
// =============================================================================

export class FinBotConfidenceFilter {
  private static instance: FinBotConfidenceFilter;
  private governor = getConfidenceGovernor();
  private auditLog = DecisionAuditLog.getInstance();
  
  private constructor() {}
  
  public static getInstance(): FinBotConfidenceFilter {
    if (!FinBotConfidenceFilter.instance) {
      FinBotConfidenceFilter.instance = new FinBotConfidenceFilter();
    }
    return FinBotConfidenceFilter.instance;
  }
  
  // ===========================================================================
  // MAIN FILTER API
  // ===========================================================================
  
  /**
   * Filter a FinBot response through confidence governance
   * NO hidden downgrades - all modifications visible
   * 
   * SECURITY: This method now integrates with QuestionFirstGovernor
   * to prevent advice leakage. If gate ≠ ADVICE_ALLOWED, advice is BLOCKED.
   */
  public filterResponse(
    originalResponse: string,
    originalConfidence: number,
    snapshotId?: string
  ): FilteredResponse {
    // SECURITY FIX: Check QuestionFirstGovernor FIRST
    // If gate is not ADVICE_ALLOWED, we MUST block advice
    const governed = this.governor.governConfidence(originalConfidence, snapshotId);
    
    const gateContext: GateContext = {
      governed_confidence: governed
    };
    
    const questionGovernor = getQuestionFirstGovernor();
    const gate = questionGovernor.evaluateGate(gateContext, snapshotId);
    
    // FAIL-CLOSED: If gate is not ADVICE_ALLOWED, block advice
    if (gate.mode !== 'ADVICE_ALLOWED') {
      const blockedMessage = gate.mode === 'SILENCE_REQUIRED'
        ? "I don't have enough clarity to advise right now."
        : "Before I can provide advice, I need to understand your context better.";
      
      this.auditLog.log({
        event_type: 'POLICY_UPDATE',
        severity: 'WARNING',
        summary: `FinBot advice BLOCKED by QuestionFirstGovernor: ${gate.mode}`,
        details: {
          gate_mode: gate.mode,
          blocking_factors: gate.blocking_factors,
          original_response_length: originalResponse.length,
          snapshot_id: snapshotId
        },
        actor: 'FINBOT'
      });
      
      return Object.freeze({
        original_response: originalResponse,
        filtered_response: blockedMessage,
        was_modified: true,
        modification_reason: `Advice blocked: ${gate.reason}`,
        governed_confidence: governed,
        confidence_disclosure: `State: ${governed.discipline_state} | Confidence: ${governed.applied_confidence}% | ADVICE BLOCKED`,
        language_softened: false,
        imperatives_removed: false,
        _frozen: true
      });
    }
    
    // Gate is ADVICE_ALLOWED - proceed with filtering
    // Determine if modification needed
    const needsModification = governed.applied_confidence < governed.original_confidence ||
                              governed.discipline_state !== 'NORMAL';
    
    // Build filtered response
    let filteredResponse = originalResponse;
    let languageSoftened = false;
    let imperativesRemoved = false;
    
    if (needsModification) {
      // Soften language if restrained or muted
      if (governed.discipline_state === 'RESTRAINED' || governed.discipline_state === 'MUTED') {
        filteredResponse = this.softenLanguage(filteredResponse, governed.discipline_state);
        languageSoftened = true;
      }
      
      // Remove strong imperatives if restrained or muted
      if (governed.discipline_state === 'RESTRAINED' || governed.discipline_state === 'MUTED') {
        const { text, removed } = this.removeImperatives(filteredResponse);
        filteredResponse = text;
        imperativesRemoved = removed;
      }
    }
    
    // Build confidence disclosure (always visible)
    const disclosure = this.buildConfidenceDisclosure(governed);
    
    // If muted, prepend explicit message
    if (governed.discipline_state === 'MUTED' && governed.mute_explicit_message) {
      filteredResponse = `${governed.mute_explicit_message}\n\n${filteredResponse}`;
    }
    
    const result: FilteredResponse = Object.freeze({
      original_response: originalResponse,
      filtered_response: filteredResponse,
      was_modified: needsModification,
      modification_reason: needsModification 
        ? governed.adjustment_reason 
        : undefined,
      governed_confidence: governed,
      confidence_disclosure: disclosure,
      language_softened: languageSoftened,
      imperatives_removed: imperativesRemoved,
      _frozen: true
    });
    
    // Audit log
    this.auditLog.log({
      event_type: needsModification ? 'POLICY_UPDATE' : 'CONTEXT_CREATED',
      severity: needsModification ? 'INFO' : 'DEBUG',
      summary: `FinBot response filtered: ${governed.discipline_state}`,
      details: {
        state: governed.discipline_state,
        original_confidence: governed.original_confidence,
        applied_confidence: governed.applied_confidence,
        was_modified: needsModification,
        language_softened: languageSoftened,
        imperatives_removed: imperativesRemoved,
        snapshot_id: snapshotId,
        gate_mode: gate.mode
      },
      actor: 'FINBOT'
    });
    
    return result;
  }
  
  // ===========================================================================
  // LANGUAGE MODIFICATION
  // ===========================================================================
  
  /**
   * Soften language based on discipline state
   */
  private softenLanguage(text: string, state: DisciplineState): string {
    // Get appropriate language mapping
    const languageMap = state === 'MUTED' ? MUTED_LANGUAGE : RESTRAINED_LANGUAGE;
    
    // Replace confidence indicators
    let result = text;
    
    // Replace "high confidence" phrases
    result = result.replace(
      /high(ly)? confident/gi,
      languageMap.high.quantifier + ' confident'
    );
    
    // Replace "certain" phrases
    result = result.replace(
      /\bcertain\b/gi,
      languageMap.high.certainty_phrase
    );
    
    return result;
  }
  
  /**
   * Remove or soften strong imperatives
   */
  private removeImperatives(text: string): { text: string; removed: boolean } {
    let result = text;
    let removed = false;
    
    for (const imperative of STRONG_IMPERATIVES) {
      const regex = new RegExp(imperative, 'gi');
      if (regex.test(result)) {
        const replacement = IMPERATIVE_REPLACEMENTS[imperative.toLowerCase()] || '';
        result = result.replace(regex, replacement);
        removed = true;
      }
    }
    
    return { text: result, removed };
  }
  
  // ===========================================================================
  // DISCLOSURE
  // ===========================================================================
  
  /**
   * Build confidence disclosure statement
   * This is ALWAYS visible - no hidden downgrades
   */
  private buildConfidenceDisclosure(governed: GovernedConfidence): string {
    const parts: string[] = [];
    
    // State description
    parts.push(`State: ${governed.discipline_state}`);
    
    // Confidence values
    if (governed.adjustment_amount > 0) {
      parts.push(
        `Confidence: ${governed.applied_confidence}% ` +
        `(original: ${governed.original_confidence}%, adjusted by -${governed.adjustment_amount})`
      );
    } else {
      parts.push(`Confidence: ${governed.applied_confidence}%`);
    }
    
    // Reason if adjusted
    if (governed.adjustment_amount > 0) {
      parts.push(`Reason: ${governed.adjustment_reason}`);
    }
    
    // Recovery info if not normal
    if (governed.discipline_state !== 'NORMAL' && governed.recovery_eligible_at) {
      const recoveryDate = new Date(governed.recovery_eligible_at);
      parts.push(`Recovery eligible: ${recoveryDate.toLocaleDateString()}`);
    }
    
    return parts.join(' | ');
  }
  
  // ===========================================================================
  // QUERIES
  // ===========================================================================
  
  /**
   * Get language for current confidence level
   */
  public getConfidenceLanguage(confidence: number): ConfidenceLanguage {
    const state = this.governor.getCurrentState().current_state;
    const languageMap = state === 'MUTED' 
      ? MUTED_LANGUAGE 
      : state === 'RESTRAINED' 
        ? RESTRAINED_LANGUAGE 
        : NORMAL_LANGUAGE;
    
    if (confidence >= 75) return languageMap.high;
    if (confidence >= 50) return languageMap.medium;
    return languageMap.low;
  }
  
  /**
   * Check if mute message is required
   */
  public requiresMuteMessage(): boolean {
    return this.governor.getCurrentState().current_state === 'MUTED';
  }
  
  /**
   * Get current state description
   */
  public getStateDescription(): string {
    return this.governor.getStateDescription();
  }
  
  /**
   * Get the explicit mute message (if applicable)
   */
  public getMuteMessage(): string | null {
    if (this.requiresMuteMessage()) {
      return 'My confidence is restricted due to past overconfidence.';
    }
    return null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const getFinBotConfidenceFilter = () => FinBotConfidenceFilter.getInstance();
export default FinBotConfidenceFilter;

