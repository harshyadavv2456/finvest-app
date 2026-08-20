"""
LAYER 7: LLM Interpretation Layer (Institutional Grade)
======================================================

Translates structured system outputs into human-readable analysis.

CRITICAL CONSTRAINTS (NON-NEGOTIABLE):

LLM MUST NEVER:
  ✗ "Stock will go up"
  ✗ "Price target: $XXX"
  ✗ "Expected price"
  ✗ Any point predictions
  ✗ Certainty language ("will", "guaranteed")

LLM MUST ALWAYS:
  ✓ Reference regime
  ✓ Cite historical backtest stats
  ✓ Use probability language
  ✓ Include counterfactual ("if regime flips...")
  ✓ Show comparable setups
  
Format:
  "Comparable historical setups: 14
  Median outcome (20d): +2.1%
  Worst drawdown: −6.3%"
"""

import re
from typing import Dict, List, Optional, Any, Tuple, Union
from datetime import date
from dataclasses import dataclass
from enum import Enum
import logging

from .layer2_regime_engine import RegimeOutput
from .layer4_probability_engine import ProbabilisticOutcome, format_outcome_for_llm
from .layer5_backtesting_engine import BacktestSummary, get_comparable_setup_summary
from .layer6_decision_engine import Decision, format_decision_for_llm

logger = logging.getLogger(__name__)


# =============================================================================
# LANGUAGE CONSTRAINTS (NON-NEGOTIABLE)
# =============================================================================

class ForbiddenLanguage:
    """
    Language patterns that MUST NOT appear in LLM output.
    
    These violate institutional standards and create regulatory/trust issues.
    """
    
    FORBIDDEN_PATTERNS = [
        # Price predictions
        r'\bwill go (up|down)\b',
        r'\bprice target\b',
        r'\bexpected price\b',
        r'\bshould (reach|hit|touch)\s*\$?\d+',
        r'\bgoing to \$([\d,]+)',
        r'\btarget(ing)?\s*\$?\d+',
        
        # Certainty language
        r'\bwill definitely\b',
        r'\bguaranteed\b',
        r'\bcertain to\b',
        r'\bno doubt\b',
        r'\bwill certainly\b',
        r'\binevitably\b',
        r'\bwithout fail\b',
        
        # Promotional language
        r'\bmoon\b',
        r'\brocket\b',
        r'\b(10|100)x\b',
        r'\bget rich\b',
        r'\bmust buy\b',
        r'\bcan\'t lose\b',
        r'\brisk.free\b',
        
        # Retail indicator language
        r'\bgolden cross\b',
        r'\bdeath cross\b',
        r'\bcup and handle\b',
        r'\bhead and shoulders\b',
    ]
    
    REPLACEMENT_GUIDANCE = {
        'will go up': 'shows positive probability skew',
        'will go down': 'shows negative probability skew',
        'price target': 'p90 scenario outcome',
        'expected price': 'median expected return',
        'guaranteed': 'historically has shown',
        'will definitely': 'probability suggests',
        'certain': 'high confidence based on',
    }
    
    @classmethod
    def validate_text(cls, text: str) -> List[str]:
        """Check text for forbidden patterns. Returns list of violations."""
        violations = []
        text_lower = text.lower()
        
        for pattern in cls.FORBIDDEN_PATTERNS:
            if re.search(pattern, text_lower):
                violations.append(f"Forbidden pattern: {pattern}")
        
        return violations
    
    @classmethod
    def sanitize_text(cls, text: str) -> str:
        """Remove/replace forbidden patterns."""
        result = text
        
        for pattern, replacement in cls.REPLACEMENT_GUIDANCE.items():
            result = re.sub(
                rf'\b{pattern}\b',
                replacement,
                result,
                flags=re.IGNORECASE
            )
        
        return result


class RequiredElements:
    """
    Elements that MUST appear in LLM output.
    """
    
    REQUIRED = [
        'regime',           # Must reference current regime
        'probability',      # Must use probability language
        'historical',       # Must cite historical performance
        'comparable',       # Must show comparable setups
        'risk',            # Must mention risk factors
    ]
    
    COUNTERFACTUAL_PATTERNS = [
        r'\bif\s+(regime|market|volatility)\s+(shifts?|changes?|flips?)\b',
        r'\bshould\s+(regime|conditions?)\s+(change|shift)\b',
        r'\bin the event of\b',
        r'\bif\s+.*\bthen\b',
    ]
    
    @classmethod
    def check_completeness(cls, text: str) -> Dict[str, bool]:
        """Check that all required elements are present."""
        text_lower = text.lower()
        
        checks = {}
        
        # Check each required element
        checks['regime'] = 'regime' in text_lower
        checks['probability'] = any(w in text_lower for w in ['probability', 'probabilistic', 'likelihood', '%'])
        checks['historical'] = any(w in text_lower for w in ['historical', 'historically', 'backtest', 'past'])
        checks['comparable'] = any(w in text_lower for w in ['comparable', 'similar', 'setups'])
        checks['risk'] = any(w in text_lower for w in ['risk', 'cvar', 'drawdown', 'downside'])
        
        # Check for counterfactual
        checks['counterfactual'] = any(
            re.search(pattern, text_lower)
            for pattern in cls.COUNTERFACTUAL_PATTERNS
        )
        
        return checks


# =============================================================================
# INTERPRETATION TEMPLATES
# =============================================================================

@dataclass
class InterpretationSection:
    """A section of the interpretation."""
    title: str
    content: str
    citations: List[str]


class InterpretationTemplates:
    """
    Institutional-grade interpretation templates.
    
    All templates enforce:
    - Probability language
    - Regime context
    - Historical citations
    - Counterfactuals
    - Comparable setups
    """
    
    @staticmethod
    def opening_summary(
        ticker: str,
        decision: Decision,
        outcome: ProbabilisticOutcome
    ) -> str:
        """Generate opening summary with required elements."""
        return f"""
**{ticker} Analysis | {decision.date}**

Current assessment: **{decision.intent.value}** with {decision.conviction:.0%} conviction.

The asset is in a **{outcome.asset_regime}** regime (confidence: {outcome.regime_confidence:.0%}) 
while the broader market shows **{outcome.market_regime}** characteristics.
Relative strength vs market: {outcome.relative_strength:.2f}.
""".strip()
    
    @staticmethod
    def comparable_setups(
        n_comparable: int,
        median_return: float,
        worst_return: float,
        best_return: float,
        horizon: int
    ) -> str:
        """
        CRITICAL: Comparable setup section.
        
        This is the key upgrade for IC presentation.
        """
        return f"""
**Comparable Historical Setups: {n_comparable}**
Median outcome ({horizon}d): {median_return:+.1%}
Range: {worst_return:+.1%} to {best_return:+.1%}
""".strip()
    
    @staticmethod
    def probability_outlook(outcome: ProbabilisticOutcome) -> str:
        """Probability-only return outlook."""
        rd = outcome.return_distribution
        
        return f"""
**Probabilistic Outlook ({outcome.horizon}-day horizon)**

Return distribution:
  * 10th percentile: {rd.p10:.1%} (downside scenario)
  * 50th percentile: {rd.p50:.1%} (median expectation)
  * 90th percentile: {rd.p90:.1%} (upside scenario)

Distribution shape: {rd.distribution_type}
Skew: {rd.skew:.2f} ({'positive' if rd.skew > 0 else 'negative'} asymmetry)
""".strip()
    
    @staticmethod
    def risk_assessment(outcome: ProbabilisticOutcome) -> str:
        """Regime-conditioned risk assessment."""
        rm = outcome.risk_metrics
        vol = outcome.volatility
        
        return f"""
**Risk Assessment**

Current volatility: {vol.vol_current:.1%} ({vol.vol_regime} regime, {vol.vol_percentile:.0%} percentile)

Conditional Value at Risk (5%):
  * Normal regime: {rm.cvar_95_normal:.1%}
  * Stress regime: {rm.cvar_95_stress:.1%}
  * Panic regime: {rm.cvar_95_panic:.1%}
  * **Current ({outcome.asset_regime}): {rm.cvar_95:.1%}**

Expected max drawdown: {rm.max_drawdown_expected:.1%}
Sortino ratio: {rm.sortino_ratio:.2f}
""".strip()
    
    @staticmethod
    def regime_context(
        decision: Decision,
        regime_output: RegimeOutput = None
    ) -> str:
        """Regime context with transition probabilities."""
        context = f"""
**Regime Context**

Asset regime: **{decision.asset_regime}**
Market regime: **{decision.market_regime}**
Alignment: {decision.regime_alignment}

Relative strength: {decision.relative_strength:.2f}
"""
        
        if regime_output and regime_output.transition_probs:
            context += "\nTransition probabilities (next period):\n"
            for regime, prob in sorted(
                regime_output.transition_probs.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]:
                context += f"  * {regime}: {prob:.0%}\n"
        
        return context.strip()
    
    @staticmethod
    def counterfactual_guidance(decision: Decision) -> str:
        """
        CRITICAL: Counterfactual section.
        
        Required for institutional credibility.
        """
        upgrade = decision.upgrade_conditions[:3]
        downgrade = decision.downgrade_conditions[:3]
        
        text = """
**Conditional Guidance**

*If regime shifts or conditions change:*

"""
        
        if upgrade:
            text += "Upgrade conviction if:\n"
            for cond in upgrade:
                text += f"  [+] {cond}\n"
        
        if downgrade:
            text += "\nDowngrade conviction if:\n"
            for cond in downgrade:
                text += f"  [-] {cond}\n"
        
        return text.strip()
    
    @staticmethod
    def signal_citation(decision: Decision) -> str:
        """Citation of supporting/opposing signals."""
        text = f"""
**Signal Analysis**

Signal agreement: {decision.signal_agreement:.0%}
"""
        
        if decision.key_supporting_signals:
            text += f"\nSupporting signals:\n"
            for sig in decision.key_supporting_signals[:5]:
                text += f"  [+] {sig}\n"
        
        if decision.key_opposing_signals:
            text += f"\nOpposing signals (warrant caution):\n"
            for sig in decision.key_opposing_signals[:3]:
                text += f"  [-] {sig}\n"
        
        return text.strip()
    
    @staticmethod
    def position_guidance(decision: Decision) -> str:
        """Position sizing guidance."""
        ps = decision.position_sizing
        
        return f"""
**Position Guidance**

Intent: **{decision.intent.value}**
Recommended position: {ps.recommended_position_pct:.1%}
Maximum position: {ps.max_position_pct:.1%}
Risk budget consumed: {ps.risk_budget_used_pct:.1%}

Scale-in approach: {ps.scale_in_tranches} tranches of {ps.tranche_size_pct:.1%} each

Time horizon: {decision.time_horizon.value} (~{decision.expected_holding_days} days)
Risk/Reward: {decision.risk_reward_ratio:.2f}x
""".strip()
    
    @staticmethod
    def backtest_context(summary: BacktestSummary) -> str:
        """Historical backtest context."""
        return f"""
**Historical Strategy Performance**

Backtest period: {summary.start_date} to {summary.end_date}
Total return: {summary.total_return:.1%}
Sharpe ratio: {summary.sharpe_ratio:.2f}
Max drawdown: {summary.max_drawdown:.1%}
Win rate: {summary.win_rate:.0%}

*Note: Past performance is not indicative of future results. 
These statistics provide context, not guarantees.*
""".strip()
    
    @staticmethod
    def failure_context(summary: BacktestSummary) -> str:
        """Failure attribution context."""
        if not summary.failure_reason_distribution:
            return ""
        
        text = """
**Historical Failure Analysis**

When similar setups failed, primary reasons were:
"""
        
        for reason, pct in sorted(
            summary.failure_reason_distribution.items(),
            key=lambda x: x[1],
            reverse=True
        )[:4]:
            text += f"  * {reason}: {pct:.0%}\n"
        
        text += "\n*This attribution helps identify what to monitor.*"
        
        return text.strip()
    
    @staticmethod
    def decision_quality_context(quality_report: Any = None) -> str:
        """
        META-BACKTEST: Decision quality citation.
        
        This is what establishes system credibility with PMs.
        """
        if not quality_report:
            return ""
        
        # Handle dict or object
        if isinstance(quality_report, dict):
            n_decisions = quality_report.get('n_total_decisions', 0)
            avoid_eff = quality_report.get('avoid_effectiveness', 0)
            avoid_stats = quality_report.get('comparable_avoid_stats', {})
            initiate_stats = quality_report.get('comparable_initiate_stats', {})
            success_rate = quality_report.get('overall_success_rate', 0)
        else:
            n_decisions = quality_report.n_total_decisions
            avoid_eff = quality_report.avoid_effectiveness
            avoid_stats = quality_report.comparable_avoid_stats
            initiate_stats = quality_report.comparable_initiate_stats
            success_rate = quality_report.overall_success_rate
        
        if n_decisions < 10:
            return ""
        
        text = """
**Decision Quality (Meta-Backtest)**

Historical decision analysis:
"""
        
        # AVOID effectiveness
        if avoid_stats.get('n_decisions', 0) > 0:
            text += f"  * AVOID decisions prevented losses {avoid_eff:.0%} of the time\n"
            if avoid_stats.get('avg_avoided_drawdown'):
                text += f"  * Average avoided drawdown: {avoid_stats['avg_avoided_drawdown']:.1%}\n"
        
        # INITIATE performance
        if initiate_stats.get('n_decisions', 0) > 0:
            text += f"  * INITIATE decisions had {initiate_stats.get('positive_expectancy_pct', 0):.0%} positive expectancy\n"
            if initiate_stats.get('avg_return'):
                text += f"  * Average INITIATE return: {initiate_stats['avg_return']:.1%}\n"
        
        text += f"\nOverall decision accuracy: {success_rate:.0%}"
        text += "\n\n*Meta-backtest measures decision quality, not signal quality.*"
        
        return text.strip()


# =============================================================================
# LLM INTERPRETATION LAYER
# =============================================================================

@dataclass
class Interpretation:
    """Complete LLM interpretation."""
    ticker: str
    date: date
    
    # Sections
    summary: str
    comparable_setups: str
    probability_outlook: str
    risk_assessment: str
    regime_context: str
    counterfactual: str
    signal_citation: str
    position_guidance: str
    backtest_context: str
    failure_context: str
    decision_quality: str  # META-BACKTEST: Decision quality citation
    
    # Validation
    language_violations: List[str]
    completeness_checks: Dict[str, bool]
    is_valid: bool
    
    def to_full_report(self) -> str:
        """Generate full report."""
        sections = [
            self.summary,
            "",
            self.comparable_setups,
            "",
            self.probability_outlook,
            "",
            self.risk_assessment,
            "",
            self.regime_context,
            "",
            self.position_guidance,
            "",
            self.counterfactual,
            "",
            self.signal_citation,
            "",
            self.backtest_context,
            "",
            self.failure_context,
            "",
            self.decision_quality,  # META-BACKTEST
        ]
        
        return "\n".join(sections)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'ticker': self.ticker,
            'date': self.date.isoformat(),
            'summary': self.summary,
            'comparable_setups': self.comparable_setups,
            'probability_outlook': self.probability_outlook,
            'risk_assessment': self.risk_assessment,
            'regime_context': self.regime_context,
            'counterfactual': self.counterfactual,
            'is_valid': self.is_valid,
            'violations': self.language_violations,
            'completeness': self.completeness_checks
        }


class LanguageMode:
    """Language confidence modes for interpretation."""
    CONFIDENT = "confident"       # High conviction, clear signals
    BALANCED = "balanced"         # Moderate conviction
    CONSERVATIVE = "conservative" # Low conviction, high uncertainty
    CAUTIONARY = "cautionary"     # High risk, requires explicit warnings


class LLMInterpreter:
    """
    Institutional-grade LLM interpretation layer.
    
    ENFORCES:
    - No price predictions
    - Probability language only
    - Required citations
    - Counterfactual guidance
    - Comparable setup statistics
    
    HARDENED:
    - Graceful degradation on validation errors
    - Confidence throttle for language mode
    - Never crashes the pipeline
    """
    
    # Confidence thresholds for language mode
    CONFIDENCE_THRESHOLDS = {
        'confident': 0.7,
        'balanced': 0.5,
        'conservative': 0.3,
    }
    
    # Risk thresholds that force conservative language
    RISK_THRESHOLDS = {
        'vol_tail_warning': 0.40,      # If tail vol > 40%, force conservative
        'cvar_warning': -0.10,          # If CVaR < -10%, add warnings
        'signal_disagreement': 0.40,    # If signal agreement < 40%, conservative
    }
    
    def __init__(self, strict_mode: bool = True):
        self.strict_mode = strict_mode
        self.templates = InterpretationTemplates()
    
    def _determine_language_mode(
        self,
        decision: 'Decision',
        outcome: 'ProbabilisticOutcome'
    ) -> str:
        """
        CONFIDENCE THROTTLE: Determine appropriate language mode.
        
        Prevents overconfident narratives when:
        - Decision confidence is low
        - Volatility is extreme
        - Signal disagreement is high
        - Risk metrics are elevated
        
        This is a critical trust lever for institutional credibility.
        """
        # Start with confidence-based mode
        if decision.confidence >= self.CONFIDENCE_THRESHOLDS['confident']:
            mode = LanguageMode.CONFIDENT
        elif decision.confidence >= self.CONFIDENCE_THRESHOLDS['balanced']:
            mode = LanguageMode.BALANCED
        elif decision.confidence >= self.CONFIDENCE_THRESHOLDS['conservative']:
            mode = LanguageMode.CONSERVATIVE
        else:
            mode = LanguageMode.CAUTIONARY
        
        # FORCE DOWNGRADE based on risk factors
        
        # 1. Extreme tail volatility
        if outcome.volatility.vol_tail > self.RISK_THRESHOLDS['vol_tail_warning']:
            if mode in [LanguageMode.CONFIDENT, LanguageMode.BALANCED]:
                mode = LanguageMode.CONSERVATIVE
                logger.info(f"Language mode downgraded due to tail vol: {outcome.volatility.vol_tail:.1%}")
        
        # 2. High CVaR (significant downside)
        if outcome.risk_metrics.cvar_95 < self.RISK_THRESHOLDS['cvar_warning']:
            if mode == LanguageMode.CONFIDENT:
                mode = LanguageMode.BALANCED
                logger.info(f"Language mode downgraded due to CVaR: {outcome.risk_metrics.cvar_95:.1%}")
        
        # 3. Low signal agreement
        if decision.signal_agreement < self.RISK_THRESHOLDS['signal_disagreement']:
            if mode in [LanguageMode.CONFIDENT, LanguageMode.BALANCED]:
                mode = LanguageMode.CONSERVATIVE
                logger.info(f"Language mode downgraded due to signal disagreement: {decision.signal_agreement:.0%}")
        
        # 4. Panic regime always gets cautionary language
        if outcome.asset_regime == 'panic' or outcome.market_regime == 'panic':
            mode = LanguageMode.CAUTIONARY
            logger.info("Language mode set to CAUTIONARY due to panic regime")
        
        return mode
    
    def _apply_language_mode_to_summary(
        self,
        summary: str,
        mode: str,
        decision: 'Decision'
    ) -> str:
        """Apply language mode modifications to summary."""
        if mode == LanguageMode.CAUTIONARY:
            warning = (
                "\n\n[WARNING] **ELEVATED UNCERTAINTY**: Current conditions show high volatility "
                "and/or low signal agreement. Position sizing should be conservative. "
                "This assessment carries higher-than-normal uncertainty."
            )
            summary += warning
        elif mode == LanguageMode.CONSERVATIVE:
            note = (
                "\n\n*Note: Signal agreement is below threshold. "
                "Conviction levels should be interpreted conservatively.*"
            )
            summary += note
        
        return summary
    
    def generate_interpretation(
        self,
        ticker: str,
        current_date: date,
        decision: Decision,
        outcome: ProbabilisticOutcome,
        backtest_summary: BacktestSummary = None,
        regime_output: RegimeOutput = None
    ) -> Interpretation:
        """
        Generate complete interpretation with validation.
        
        HARDENED with:
        - Confidence throttle (language mode)
        - Graceful degradation
        - Automatic warnings for high-risk scenarios
        """
        # UPGRADE: Determine language mode based on confidence/risk
        language_mode = self._determine_language_mode(decision, outcome)
        
        # Generate sections
        summary = self.templates.opening_summary(ticker, decision, outcome)
        
        # Apply language mode modifications
        summary = self._apply_language_mode_to_summary(summary, language_mode, decision)
        
        # UPGRADE: Comparable setups section
        if backtest_summary and backtest_summary.comparable_setup_stats:
            stats = backtest_summary.comparable_setup_stats
            comparable = self.templates.comparable_setups(
                n_comparable=stats.get('n_comparable', 0),
                median_return=stats.get('median_return', 0),
                worst_return=stats.get('worst_return', 0),
                best_return=stats.get('best_return', 0),
                horizon=outcome.horizon
            )
        else:
            comparable = f"Comparable historical setups: {outcome.n_comparable_setups}\n(Limited data for detailed statistics)"
        
        prob_outlook = self.templates.probability_outlook(outcome)
        risk_assess = self.templates.risk_assessment(outcome)
        regime_ctx = self.templates.regime_context(decision, regime_output)
        counterfactual = self.templates.counterfactual_guidance(decision)
        signals = self.templates.signal_citation(decision)
        position = self.templates.position_guidance(decision)
        
        backtest_ctx = ""
        failure_ctx = ""
        if backtest_summary:
            backtest_ctx = self.templates.backtest_context(backtest_summary)
            failure_ctx = self.templates.failure_context(backtest_summary)
        
        # Combine full text for validation
        full_text = "\n".join([
            summary, comparable, prob_outlook, risk_assess,
            regime_ctx, counterfactual, signals, position,
            backtest_ctx, failure_ctx
        ])
        
        # VALIDATE: Check for forbidden language
        violations = ForbiddenLanguage.validate_text(full_text)
        
        # VALIDATE: Check for required elements
        completeness = RequiredElements.check_completeness(full_text)
        
        # Determine validity
        is_valid = len(violations) == 0 and all(completeness.values())
        
        if not is_valid and self.strict_mode:
            logger.warning(
                f"Interpretation validation failed:\n"
                f"Violations: {violations}\n"
                f"Missing elements: {[k for k, v in completeness.items() if not v]}"
            )
        
        # META-BACKTEST: Decision quality context (empty for now, populated by pipeline)
        decision_quality = ""
        
        return Interpretation(
            ticker=ticker,
            date=current_date,
            summary=summary,
            comparable_setups=comparable,
            probability_outlook=prob_outlook,
            risk_assessment=risk_assess,
            regime_context=regime_ctx,
            counterfactual=counterfactual,
            signal_citation=signals,
            position_guidance=position,
            backtest_context=backtest_ctx,
            failure_context=failure_ctx,
            decision_quality=decision_quality,
            language_violations=violations,
            completeness_checks=completeness,
            is_valid=is_valid
        )
    
    def generate_ic_memo(
        self,
        interpretation: Interpretation,
        decision: Decision
    ) -> str:
        """
        Generate IC (Investment Committee) style memo.
        
        This is what goes in front of the PM.
        """
        separator = "=" * 78
        thin_sep = "-" * 78
        
        memo = f"""
{separator}
                         INVESTMENT COMMITTEE MEMO                              
{separator}
  Ticker: {interpretation.ticker:<15}                    Date: {interpretation.date}      
{separator}

{thin_sep}

RECOMMENDATION: {decision.intent.value} | Conviction: {decision.conviction:.0%}

{thin_sep}

{interpretation.comparable_setups}

{thin_sep}

{interpretation.summary}

{thin_sep}

{interpretation.probability_outlook}

{thin_sep}

{interpretation.risk_assessment}

{thin_sep}

{interpretation.regime_context}

{thin_sep}

{interpretation.position_guidance}

{thin_sep}

{interpretation.counterfactual}

{thin_sep}

{interpretation.signal_citation}

{thin_sep}

{interpretation.failure_context}

{thin_sep}

{interpretation.decision_quality if interpretation.decision_quality else ""}

{thin_sep if interpretation.decision_quality else ""}

RISK FACTORS:
"""
        
        for risk in decision.risk_factors[:5]:
            memo += f"  * {risk}\n"
        
        memo += f"""
{thin_sep}

DISCLAIMER: This analysis represents probabilistic assessments based on 
historical patterns and current market conditions. It does not constitute 
investment advice and should not be interpreted as predictions of future 
performance. Past performance is not indicative of future results.

*Decision quality metrics based on meta-backtesting of historical decisions.*

{separator}
"""
        
        return memo
    
    def validate_external_text(self, text: str) -> Tuple[bool, List[str], Dict[str, bool]]:
        """
        Validate externally generated text (e.g., from actual LLM API).
        
        Use this when integrating with OpenAI/Anthropic APIs.
        
        HARDENED: Graceful degradation - never breaks pipeline.
        """
        try:
            violations = ForbiddenLanguage.validate_text(text)
            completeness = RequiredElements.check_completeness(text)
            
            is_valid = len(violations) == 0 and all(completeness.values())
            
            return is_valid, violations, completeness
        except Exception as e:
            # GRACEFUL DEGRADATION: Never let validation crash the pipeline
            logger.error(f"LLM validation error (graceful degradation): {e}")
            return False, [f"LLM_VALIDATION_ERROR: {str(e)}"], {}
    
    def sanitize_external_text(self, text: str) -> str:
        """
        Sanitize externally generated text by removing forbidden patterns.
        
        HARDENED: Returns original text on failure instead of crashing.
        """
        try:
            return ForbiddenLanguage.sanitize_text(text)
        except Exception as e:
            logger.error(f"LLM sanitization error (returning original): {e}")
            return text


# =============================================================================
# UTILITIES
# =============================================================================

def generate_quick_summary(
    ticker: str,
    decision: Decision,
    outcome: ProbabilisticOutcome,
    n_comparable: int = 0
) -> str:
    """
    Generate a quick one-paragraph summary.
    
    Useful for alerts/notifications.
    """
    rd = outcome.return_distribution
    
    summary = (
        f"{ticker}: {decision.intent.value} with {decision.conviction:.0%} conviction. "
        f"Asset in {outcome.asset_regime} regime vs market {outcome.market_regime}. "
        f"Median expected return: {rd.p50:.1%} (range {rd.p10:.1%} to {rd.p90:.1%}). "
        f"CVaR: {outcome.risk_metrics.cvar_95:.1%}. "
    )
    
    if n_comparable > 0:
        summary += f"Based on {n_comparable} comparable historical setups. "
    
    summary += f"If regime shifts to {'markdown' if outcome.asset_regime in ['markup', 'accumulation'] else 'markup'}, reassess position."
    
    return summary


def get_interpretation_for_api(
    interpretation: Interpretation
) -> Dict[str, Any]:
    """
    Format interpretation for API response.
    """
    return {
        'ticker': interpretation.ticker,
        'date': interpretation.date.isoformat(),
        'sections': {
            'summary': interpretation.summary,
            'comparable_setups': interpretation.comparable_setups,
            'probability': interpretation.probability_outlook,
            'risk': interpretation.risk_assessment,
            'regime': interpretation.regime_context,
            'guidance': interpretation.position_guidance,
            'counterfactual': interpretation.counterfactual,
            'signals': interpretation.signal_citation
        },
        'validation': {
            'is_valid': interpretation.is_valid,
            'violations': interpretation.language_violations,
            'completeness': interpretation.completeness_checks
        }
    }
