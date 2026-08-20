"""
LAYER 6: Decision Engine (Institutional Grade)
==============================================

Combines probability, valuation gap, smart money alignment, and risk
to output actionable decisions.

CRITICAL UPGRADE: Position Intent, Not Just Bias
- Institutions don't think "bullish/bearish"
- They think: INITIATE, ADD, HOLD, REDUCE, EXIT, HEDGE

Output includes:
- intent: Position action (not just bias)
- max_position_pct: Position limit
- risk_budget_used: How much of risk budget this consumes
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date
from dataclasses import dataclass, field
from enum import Enum
import logging

from .layer2_regime_engine import RegimeOutput
from .layer3_signal_efficacy import EfficacyReport, SignalContribution
from .layer4_probability_engine import ProbabilisticOutcome, ConditionalVolatility, RiskMetrics

logger = logging.getLogger(__name__)


# =============================================================================
# POSITION INTENT (CRITICAL UPGRADE)
# =============================================================================

class PositionIntent(Enum):
    """
    UPGRADE: Position intent replaces simple bias.
    
    Institutions think in terms of position management:
    - INITIATE: Open new position
    - ADD: Increase existing position
    - HOLD: Maintain current position
    - REDUCE: Decrease position size
    - EXIT: Close entire position
    - HEDGE: Add hedge to existing position
    """
    INITIATE = "INITIATE"
    ADD = "ADD"
    HOLD = "HOLD"
    REDUCE = "REDUCE"
    EXIT = "EXIT"
    HEDGE = "HEDGE"
    AVOID = "AVOID"  # Don't touch this


class TimeHorizon(Enum):
    """Trading time horizon."""
    TACTICAL = "tactical"      # 1-5 days
    SHORT_TERM = "short_term"  # 1-4 weeks
    MEDIUM_TERM = "medium_term"  # 1-3 months
    LONG_TERM = "long_term"    # 3-12 months


@dataclass
class PositionSizing:
    """
    UPGRADE: Detailed position sizing guidance.
    """
    max_position_pct: float       # Maximum position as % of portfolio
    recommended_position_pct: float  # Suggested position size
    min_position_pct: float       # Minimum meaningful position
    risk_budget_used_pct: float   # How much of risk budget this uses
    var_contribution: float       # Expected VaR contribution
    
    # Scaling guidance
    scale_in_tranches: int        # Number of tranches to scale in
    tranche_size_pct: float       # Size per tranche
    
    def __str__(self) -> str:
        return (
            f"Position: {self.recommended_position_pct:.1%} "
            f"(max {self.max_position_pct:.1%}), "
            f"Risk budget: {self.risk_budget_used_pct:.1%}"
        )


@dataclass
class Decision:
    """
    UPGRADED: Complete decision output with position intent.
    """
    ticker: str
    date: date
    
    # UPGRADE: Position intent (not just bias)
    intent: PositionIntent
    direction: str  # 'long', 'short', 'neutral'
    
    # Conviction & confidence
    conviction: float  # 0-1, how strongly to act
    confidence: float  # 0-1, how sure we are of the analysis
    
    # UPGRADE: Position sizing
    position_sizing: PositionSizing
    
    # Risk-reward
    risk_reward_ratio: float
    expected_return: float
    expected_risk: float
    
    # Time horizon
    time_horizon: TimeHorizon
    expected_holding_days: int
    
    # Regime context
    asset_regime: str
    market_regime: str
    relative_strength: float
    regime_alignment: str  # 'aligned', 'divergent', 'contrarian'
    
    # Signal summary
    key_supporting_signals: List[str]
    key_opposing_signals: List[str]
    signal_agreement: float
    
    # Rationale (for LLM)
    rationale: str
    risk_factors: List[str]
    catalysts: List[str]
    
    # Conditional guidance
    upgrade_conditions: List[str]   # What would increase conviction
    downgrade_conditions: List[str] # What would decrease conviction
    stop_loss_level: Optional[float]
    take_profit_level: Optional[float]

    # Phase 1 hardening (FinSight/IMPLEMENTATION_NOTES.md): unique ID +
    # model version, so this specific call can be revisited later and
    # scored against what actually happened. Must come after every
    # non-default field above per dataclass ordering rules.
    call_id: str = field(default_factory=lambda: "")
    model_version: str = field(default="")

    def to_dict(self) -> Dict[str, Any]:
        return {
            'call_id': self.call_id,
            'model_version': self.model_version,
            'ticker': self.ticker,
            'date': self.date.isoformat(),
            'intent': self.intent.value,
            'direction': self.direction,
            'conviction': self.conviction,
            'confidence': self.confidence,
            'max_position_pct': self.position_sizing.max_position_pct,
            'risk_budget_used': self.position_sizing.risk_budget_used_pct,
            'risk_reward': self.risk_reward_ratio,
            'time_horizon': self.time_horizon.value,
            'asset_regime': self.asset_regime,
            'market_regime': self.market_regime,
            'relative_strength': self.relative_strength,
            'signal_agreement': self.signal_agreement,
            'rationale': self.rationale
        }


# =============================================================================
# DECISION ENGINE
# =============================================================================

class DecisionEngine:
    """
    UPGRADED: Decision engine with position intent mapping.
    
    Key improvements:
    1. Intent-based outputs (INITIATE/ADD/HOLD/REDUCE/EXIT/HEDGE)
    2. Position sizing with risk budget
    3. Regime-aware conviction adjustment
    4. Conditional guidance
    """
    
    # Intent decision thresholds
    INTENT_THRESHOLDS = {
        'strong_long': 0.7,   # INITIATE or ADD
        'moderate_long': 0.5, # HOLD if have, INITIATE small if don't
        'neutral': 0.4,       # HOLD if have, AVOID if don't
        'moderate_short': 0.3,# REDUCE if long, small SHORT if allowed
        'strong_short': 0.2   # EXIT longs, INITIATE shorts
    }
    
    # Regime-based conviction adjustments
    REGIME_CONVICTION_ADJUSTMENT = {
        # (asset_regime, market_regime) -> conviction_multiplier
        ('markup', 'markup'): 1.0,      # Aligned bull
        ('markup', 'distribution'): 1.2, # Relative strength
        ('markup', 'markdown'): 1.3,     # Strong outperformance
        ('accumulation', 'markdown'): 1.1, # Early strength
        ('distribution', 'markup'): 0.7,  # Underperforming
        ('markdown', 'markdown'): 0.6,    # Aligned bear
        ('panic', 'panic'): 0.5,          # Maximum fear
        ('recovery', 'panic'): 1.1,       # Early recovery
    }
    
    def __init__(
        self,
        max_portfolio_risk_pct: float = 0.15,
        max_single_position_pct: float = 0.10,
        min_conviction_for_action: float = 0.3
    ):
        self.max_portfolio_risk_pct = max_portfolio_risk_pct
        self.max_single_position_pct = max_single_position_pct
        self.min_conviction_for_action = min_conviction_for_action
        self.current_positions: Dict[str, float] = {}  # ticker -> position_pct
        self.current_risk_used: float = 0.0
    
    def _calculate_base_conviction(
        self,
        outcome: ProbabilisticOutcome,
        efficacy: EfficacyReport
    ) -> Tuple[float, str]:
        """
        Calculate base conviction from probabilistic outcome.
        
        Returns (conviction, direction)
        """
        rd = outcome.return_distribution
        
        # Expected return vs risk
        expected_ret = rd.p50
        downside_risk = abs(rd.p10)
        upside = rd.p90
        
        # Risk-adjusted score
        if downside_risk > 0:
            risk_adj_return = expected_ret / downside_risk
        else:
            risk_adj_return = expected_ret * 10
        
        # Direction
        if expected_ret > 0.01 and upside > abs(rd.p10):
            direction = 'long'
            base_conviction = min(1.0, 0.3 + risk_adj_return * 0.3)
        elif expected_ret < -0.01 and abs(rd.p10) > upside:
            direction = 'short'
            base_conviction = min(1.0, 0.3 + abs(risk_adj_return) * 0.3)
        else:
            direction = 'neutral'
            base_conviction = 0.3
        
        # Adjust for data quality
        base_conviction *= outcome.data_quality_score
        
        return base_conviction, direction
    
    def _adjust_conviction_for_learned_efficacy(
        self,
        conviction: float,
        direction: str,
        efficacy_report: Any,
        regime: str
    ) -> float:
        """
        CRITICAL: Adjust conviction based on LEARNED signal efficacy.
        
        This is what turns 0% conviction into real conviction:
        - If signals have proven IC > 0.05 in this regime, boost conviction
        - If signals have hit_rate > 55%, boost conviction
        - If signals have good edge_ratio, boost conviction
        
        Without this, system stays at floor conviction.
        """
        if not hasattr(efficacy_report, 'efficacy_trainer') or efficacy_report.efficacy_trainer is None:
            return conviction
        
        trainer = efficacy_report.efficacy_trainer
        
        # Get best signals for current regime
        best_signals = trainer.get_best_signals_for_regime(
            regime=regime,
            horizon=20,
            min_confidence=0.2,
            top_n=5
        )
        
        if not best_signals:
            return conviction
        
        # Calculate efficacy boost
        total_confidence = sum(s.confidence_score for s in best_signals)
        avg_confidence = total_confidence / len(best_signals) if best_signals else 0
        
        # Average IC
        avg_ic = sum(abs(s.information_coefficient) for s in best_signals) / len(best_signals)
        
        # Average hit rate
        avg_hit_rate = sum(s.hit_rate for s in best_signals) / len(best_signals)
        
        # Calculate boost
        # IC boost: +0.2 per 0.1 IC
        ic_boost = min(avg_ic * 2, 0.3)
        
        # Hit rate boost: +0.15 if hit rate > 55%
        hit_boost = 0.15 if avg_hit_rate > 0.55 else (0.05 if avg_hit_rate > 0.52 else 0)
        
        # Confidence boost: +0.2 * avg_confidence
        conf_boost = avg_confidence * 0.2
        
        # Total boost
        total_boost = ic_boost + hit_boost + conf_boost
        
        # Apply boost (multiplicative)
        boosted_conviction = conviction + total_boost
        
        # Clip to [0, 1]
        boosted_conviction = max(0, min(1.0, boosted_conviction))
        
        return boosted_conviction
    
    def _adjust_conviction_for_regime(
        self,
        conviction: float,
        direction: str,
        outcome: ProbabilisticOutcome
    ) -> float:
        """Adjust conviction based on regime alignment."""
        key = (outcome.asset_regime, outcome.market_regime)
        multiplier = self.REGIME_CONVICTION_ADJUSTMENT.get(key, 1.0)
        
        # If short in panic, increase conviction
        if direction == 'short' and outcome.asset_regime in ['panic', 'markdown']:
            multiplier *= 1.1
        
        # If long against market trend, reduce conviction
        if direction == 'long' and outcome.market_regime in ['markdown', 'panic']:
            if outcome.relative_strength < 0.3:
                multiplier *= 0.7
        
        return min(1.0, conviction * multiplier)
    
    def _adjust_conviction_for_signals(
        self,
        conviction: float,
        signal_contributions: List[SignalContribution]
    ) -> Tuple[float, float, List[str], List[str]]:
        """
        Adjust conviction based on signal agreement.
        
        Returns (adjusted_conviction, agreement_score, supporting, opposing)
        """
        if not signal_contributions:
            return conviction, 0.5, [], []
        
        positive = [s for s in signal_contributions if s.effective_contribution > 0]
        negative = [s for s in signal_contributions if s.effective_contribution <= 0]
        
        total_positive = sum(s.effective_contribution for s in positive)
        total_negative = abs(sum(s.effective_contribution for s in negative))
        total = total_positive + total_negative
        
        if total == 0:
            agreement = 0.5
        else:
            agreement = total_positive / total
        
        # Agreement boosts or reduces conviction
        if agreement > 0.7:
            conviction *= 1.15
        elif agreement < 0.4:
            conviction *= 0.75
        
        supporting = [s.signal_name for s in positive[:5]]
        opposing = [s.signal_name for s in negative[:3]]
        
        return min(1.0, conviction), agreement, supporting, opposing
    
    def _determine_intent(
        self,
        conviction: float,
        direction: str,
        has_position: bool,
        current_position_pct: float
    ) -> PositionIntent:
        """
        UPGRADE: Map conviction + direction to position intent.
        """
        if direction == 'neutral':
            if has_position:
                if conviction < 0.3:
                    return PositionIntent.REDUCE
                return PositionIntent.HOLD
            return PositionIntent.AVOID
        
        if direction == 'long':
            if conviction >= self.INTENT_THRESHOLDS['strong_long']:
                if has_position:
                    if current_position_pct < self.max_single_position_pct * 0.7:
                        return PositionIntent.ADD
                    return PositionIntent.HOLD
                return PositionIntent.INITIATE
            
            elif conviction >= self.INTENT_THRESHOLDS['moderate_long']:
                if has_position:
                    return PositionIntent.HOLD
                return PositionIntent.INITIATE  # Small position
            
            elif conviction >= self.INTENT_THRESHOLDS['neutral']:
                if has_position:
                    return PositionIntent.HOLD
                return PositionIntent.AVOID
            
            else:  # Low conviction long
                if has_position:
                    return PositionIntent.REDUCE
                return PositionIntent.AVOID
        
        else:  # Short direction
            if conviction >= self.INTENT_THRESHOLDS['strong_long']:  # Strong short conviction
                if has_position and current_position_pct > 0:  # Has long
                    return PositionIntent.EXIT
                return PositionIntent.INITIATE  # Short
            
            elif conviction >= self.INTENT_THRESHOLDS['moderate_long']:
                if has_position and current_position_pct > 0:
                    return PositionIntent.REDUCE
                return PositionIntent.AVOID
            
            else:
                if has_position:
                    return PositionIntent.HOLD
                return PositionIntent.AVOID
    
    def _calculate_position_sizing(
        self,
        conviction: float,
        direction: str,
        outcome: ProbabilisticOutcome,
        intent: PositionIntent
    ) -> PositionSizing:
        """
        UPGRADE: Calculate position sizing with risk budget.
        """
        # Base position from conviction
        if intent in [PositionIntent.AVOID, PositionIntent.EXIT]:
            return PositionSizing(
                max_position_pct=0,
                recommended_position_pct=0,
                min_position_pct=0,
                risk_budget_used_pct=0,
                var_contribution=0,
                scale_in_tranches=0,
                tranche_size_pct=0
            )
        
        # Maximum position based on conviction
        max_pos = self.max_single_position_pct * conviction
        
        # Adjust for volatility regime
        vol = outcome.volatility
        if vol.vol_regime == 'extreme':
            max_pos *= 0.5
        elif vol.vol_regime == 'elevated':
            max_pos *= 0.7
        elif vol.vol_regime == 'low':
            max_pos *= 1.2
        
        # Risk budget calculation
        risk_metrics = outcome.risk_metrics
        var_contribution = max_pos * abs(risk_metrics.var_95)
        risk_budget_used = var_contribution / self.max_portfolio_risk_pct
        
        # If using too much risk budget, scale down
        if risk_budget_used > 0.3:  # No single position should use >30% of risk budget
            scale_factor = 0.3 / risk_budget_used
            max_pos *= scale_factor
            risk_budget_used = 0.3
        
        # Recommended position (more conservative than max)
        recommended = max_pos * 0.7
        
        # Minimum meaningful position
        min_pos = 0.01  # 1%
        
        # Tranches
        if intent == PositionIntent.INITIATE:
            tranches = 3 if conviction < 0.6 else 2
        elif intent == PositionIntent.ADD:
            tranches = 2
        else:
            tranches = 1
        
        return PositionSizing(
            max_position_pct=max_pos,
            recommended_position_pct=recommended,
            min_position_pct=min_pos,
            risk_budget_used_pct=risk_budget_used,
            var_contribution=var_contribution,
            scale_in_tranches=tranches,
            tranche_size_pct=recommended / tranches if tranches > 0 else 0
        )
    
    def _determine_time_horizon(
        self,
        outcome: ProbabilisticOutcome,
        intent: PositionIntent
    ) -> Tuple[TimeHorizon, int]:
        """Determine appropriate time horizon."""
        # Base on regime persistence
        regime_persistence = {
            'panic': 10,
            'recovery': 20,
            'accumulation': 40,
            'markup': 60,
            'distribution': 25,
            'markdown': 35
        }
        
        base_days = regime_persistence.get(outcome.asset_regime, 30)
        
        # Adjust for volatility
        if outcome.volatility.vol_regime == 'extreme':
            base_days = int(base_days * 0.5)
        elif outcome.volatility.vol_regime == 'low':
            base_days = int(base_days * 1.3)
        
        # Map to horizon
        if base_days <= 5:
            horizon = TimeHorizon.TACTICAL
        elif base_days <= 20:
            horizon = TimeHorizon.SHORT_TERM
        elif base_days <= 60:
            horizon = TimeHorizon.MEDIUM_TERM
        else:
            horizon = TimeHorizon.LONG_TERM
        
        return horizon, base_days
    
    def _calculate_levels(
        self,
        outcome: ProbabilisticOutcome,
        direction: str,
        entry_price: float = None
    ) -> Tuple[Optional[float], Optional[float]]:
        """Calculate stop loss and take profit levels."""
        if entry_price is None:
            return None, None
        
        rd = outcome.return_distribution
        
        if direction == 'long':
            # Stop at p10 level
            stop_loss = entry_price * (1 + rd.p10)
            # Take profit at p75
            take_profit = entry_price * (1 + rd.p75)
        else:
            stop_loss = entry_price * (1 - rd.p10)
            take_profit = entry_price * (1 - rd.p75)
        
        return stop_loss, take_profit
    
    def _generate_rationale(
        self,
        intent: PositionIntent,
        direction: str,
        conviction: float,
        outcome: ProbabilisticOutcome,
        supporting_signals: List[str],
        opposing_signals: List[str]
    ) -> str:
        """Generate decision rationale for LLM."""
        parts = []
        
        # Intent explanation
        intent_explanations = {
            PositionIntent.INITIATE: f"INITIATE {direction.upper()} position",
            PositionIntent.ADD: f"ADD to existing {direction.upper()} position",
            PositionIntent.HOLD: "HOLD current position",
            PositionIntent.REDUCE: "REDUCE position size",
            PositionIntent.EXIT: "EXIT position",
            PositionIntent.HEDGE: "HEDGE existing position",
            PositionIntent.AVOID: "AVOID this opportunity"
        }
        parts.append(intent_explanations.get(intent, str(intent)))
        
        # Conviction
        conv_level = "high" if conviction > 0.7 else "moderate" if conviction > 0.5 else "low"
        parts.append(f"with {conv_level} conviction ({conviction:.0%})")
        
        # Regime context
        parts.append(f"Asset regime: {outcome.asset_regime}, Market regime: {outcome.market_regime}")
        
        if outcome.relative_strength > 0.3:
            parts.append("Asset showing relative strength vs market")
        elif outcome.relative_strength < -0.3:
            parts.append("Asset showing relative weakness vs market")
        
        # Return expectations
        rd = outcome.return_distribution
        parts.append(
            f"Expected return range: {rd.p10:.1%} to {rd.p90:.1%} "
            f"(median {rd.p50:.1%})"
        )
        
        # Risk context
        rm = outcome.risk_metrics
        parts.append(f"CVaR (5%): {rm.cvar_95:.1%}")
        
        # Signals
        if supporting_signals:
            parts.append(f"Supporting signals: {', '.join(supporting_signals[:3])}")
        if opposing_signals:
            parts.append(f"Opposing signals: {', '.join(opposing_signals[:2])}")
        
        return ". ".join(parts)
    
    def _generate_conditions(
        self,
        outcome: ProbabilisticOutcome,
        direction: str
    ) -> Tuple[List[str], List[str]]:
        """Generate upgrade/downgrade conditions."""
        upgrade = []
        downgrade = []
        
        # Regime-based
        if direction == 'long':
            upgrade.append(f"Asset regime shifts to 'markup' from current '{outcome.asset_regime}'")
            upgrade.append("Relative strength improves above 0.5")
            downgrade.append("Market regime shifts to 'panic' or 'markdown'")
            downgrade.append("Volatility spikes to 'extreme' regime")
        else:
            upgrade.append("Asset regime confirms 'distribution' or 'markdown'")
            downgrade.append("Asset shows relative strength vs market")
            downgrade.append("Market regime shifts to 'markup'")
        
        # Volatility-based
        vol = outcome.volatility
        if vol.vol_regime == 'low':
            upgrade.append("Volatility remains contained")
            downgrade.append("Volatility expansion above stress levels")
        
        return upgrade, downgrade
    
    def _identify_risk_factors(
        self,
        outcome: ProbabilisticOutcome
    ) -> List[str]:
        """Identify key risk factors."""
        risks = []
        
        # Volatility risk
        vol = outcome.volatility
        if vol.vol_regime in ['elevated', 'extreme']:
            risks.append(f"Elevated volatility ({vol.vol_current:.1%} current)")
        
        # Regime risk
        if outcome.asset_regime in ['distribution', 'markdown']:
            risks.append(f"Bearish asset regime ({outcome.asset_regime})")
        
        if outcome.market_regime in ['distribution', 'markdown', 'panic']:
            risks.append(f"Adverse market regime ({outcome.market_regime})")
        
        # Tail risk
        rm = outcome.risk_metrics
        if rm.cvar_95 < -0.08:
            risks.append(f"Significant tail risk (CVaR: {rm.cvar_95:.1%})")
        
        # Data quality
        if outcome.data_quality_score < 0.5:
            risks.append("Limited historical data for this setup")
        
        return risks
    
    def generate_decision(
        self,
        ticker: str,
        current_date: date,
        outcome: ProbabilisticOutcome,
        efficacy_report: EfficacyReport,
        current_price: float = None
    ) -> Decision:
        """
        Generate complete decision with position intent.
        """
        # Current position
        has_position = ticker in self.current_positions
        current_position_pct = self.current_positions.get(ticker, 0)
        
        # Base conviction
        conviction, direction = self._calculate_base_conviction(outcome, efficacy_report)
        
        # CRITICAL: Learned efficacy adjustment (this is where edge comes from)
        conviction = self._adjust_conviction_for_learned_efficacy(
            conviction, direction, efficacy_report, outcome.asset_regime
        )
        
        # Regime adjustment
        conviction = self._adjust_conviction_for_regime(conviction, direction, outcome)
        
        # Signal adjustment
        conviction, signal_agreement, supporting, opposing = self._adjust_conviction_for_signals(
            conviction, efficacy_report.signal_contributions
        )
        
        # UPGRADE: Determine intent
        intent = self._determine_intent(
            conviction, direction, has_position, current_position_pct
        )
        
        # UPGRADE: Position sizing
        position_sizing = self._calculate_position_sizing(
            conviction, direction, outcome, intent
        )
        
        # Time horizon
        time_horizon, holding_days = self._determine_time_horizon(outcome, intent)
        
        # Risk-reward
        rd = outcome.return_distribution
        expected_return = rd.p50
        expected_risk = abs(rd.p10)
        risk_reward = expected_return / expected_risk if expected_risk > 0 else 0
        
        # Levels
        stop_loss, take_profit = self._calculate_levels(outcome, direction, current_price)
        
        # Regime alignment
        if outcome.relative_strength > 0.3:
            regime_alignment = 'outperforming'
        elif outcome.relative_strength < -0.3:
            regime_alignment = 'underperforming'
        else:
            regime_alignment = 'aligned'
        
        # Rationale
        rationale = self._generate_rationale(
            intent, direction, conviction, outcome, supporting, opposing
        )
        
        # Conditions
        upgrade_conditions, downgrade_conditions = self._generate_conditions(outcome, direction)
        
        # Risk factors
        risk_factors = self._identify_risk_factors(outcome)
        
        # Catalysts (simplified - would come from news/events in full system)
        catalysts = [f"Regime shift to {outcome.asset_regime} suggests directional bias"]
        
        decision = Decision(
            ticker=ticker,
            date=current_date,
            intent=intent,
            direction=direction,
            conviction=conviction,
            confidence=outcome.regime_confidence * outcome.data_quality_score,
            position_sizing=position_sizing,
            risk_reward_ratio=risk_reward,
            expected_return=expected_return,
            expected_risk=expected_risk,
            time_horizon=time_horizon,
            expected_holding_days=holding_days,
            asset_regime=outcome.asset_regime,
            market_regime=outcome.market_regime,
            relative_strength=outcome.relative_strength,
            regime_alignment=regime_alignment,
            key_supporting_signals=supporting,
            key_opposing_signals=opposing,
            signal_agreement=signal_agreement,
            rationale=rationale,
            risk_factors=risk_factors,
            catalysts=catalysts,
            upgrade_conditions=upgrade_conditions,
            downgrade_conditions=downgrade_conditions,
            stop_loss_level=stop_loss,
            take_profit_level=take_profit
        )

        # Phase 1 hardening: log this call with a unique ID + the exact
        # signal state that produced it, before returning. See
        # FinSight/quant_system/decision_logger.py and
        # FinSight/IMPLEMENTATION_NOTES.md.
        from .decision_logger import log_decision_call, _model_version
        decision.model_version = _model_version()
        decision.call_id = log_decision_call(
            ticker=ticker,
            market=getattr(self, "market", None),
            decision=decision,
            outcome=outcome,
            efficacy_report=efficacy_report,
        )
        return decision
    
    def update_position(self, ticker: str, position_pct: float):
        """Update tracked position."""
        if position_pct == 0:
            self.current_positions.pop(ticker, None)
        else:
            self.current_positions[ticker] = position_pct


# =============================================================================
# UTILITIES
# =============================================================================

def format_decision_for_llm(decision: Decision) -> Dict[str, Any]:
    """Format decision for LLM interpretation layer."""
    return {
        'ticker': decision.ticker,
        'date': decision.date.isoformat(),
        
        # UPGRADE: Intent-based output
        'action': {
            'intent': decision.intent.value,
            'direction': decision.direction,
            'conviction': f"{decision.conviction:.0%}",
            'confidence': f"{decision.confidence:.0%}"
        },
        
        # UPGRADE: Position sizing
        'position': {
            'max_position_pct': f"{decision.position_sizing.max_position_pct:.1%}",
            'recommended_pct': f"{decision.position_sizing.recommended_position_pct:.1%}",
            'risk_budget_used': f"{decision.position_sizing.risk_budget_used_pct:.1%}",
            'scale_in_tranches': decision.position_sizing.scale_in_tranches
        },
        
        # Risk-reward
        'risk_reward': {
            'ratio': f"{decision.risk_reward_ratio:.2f}",
            'expected_return': f"{decision.expected_return:.1%}",
            'expected_risk': f"{decision.expected_risk:.1%}"
        },
        
        # Horizon
        'horizon': {
            'timeframe': decision.time_horizon.value,
            'expected_days': decision.expected_holding_days
        },
        
        # Regime context
        'regime': {
            'asset': decision.asset_regime,
            'market': decision.market_regime,
            'relative_strength': f"{decision.relative_strength:.2f}",
            'alignment': decision.regime_alignment
        },
        
        # Signals
        'signals': {
            'agreement': f"{decision.signal_agreement:.0%}",
            'supporting': decision.key_supporting_signals,
            'opposing': decision.key_opposing_signals
        },
        
        # Guidance
        'rationale': decision.rationale,
        'risk_factors': decision.risk_factors,
        'upgrade_conditions': decision.upgrade_conditions,
        'downgrade_conditions': decision.downgrade_conditions
    }


def decision_to_pm_summary(decision: Decision) -> str:
    """
    Generate PM-ready decision summary.
    
    This is what appears in the IC deck.
    """
    lines = [
        f"═══════════════════════════════════════════════════════════════",
        f"DECISION: {decision.ticker} | {decision.date}",
        f"═══════════════════════════════════════════════════════════════",
        f"",
        f"INTENT: {decision.intent.value} {decision.direction.upper()}",
        f"",
        f"Position Guidance:",
        f"  Recommended: {decision.position_sizing.recommended_position_pct:.1%}",
        f"  Maximum: {decision.position_sizing.max_position_pct:.1%}",
        f"  Risk Budget Used: {decision.position_sizing.risk_budget_used_pct:.1%}",
        f"  Scale-in: {decision.position_sizing.scale_in_tranches} tranches",
        f"",
        f"Conviction: {decision.conviction:.0%} | Confidence: {decision.confidence:.0%}",
        f"",
        f"Risk/Reward:",
        f"  Ratio: {decision.risk_reward_ratio:.2f}x",
        f"  Expected Return: {decision.expected_return:.1%}",
        f"  Expected Risk: {decision.expected_risk:.1%}",
        f"",
        f"Regime Context:",
        f"  Asset: {decision.asset_regime}",
        f"  Market: {decision.market_regime}",
        f"  Relative Strength: {decision.relative_strength:.2f} ({decision.regime_alignment})",
        f"",
        f"Time Horizon: {decision.time_horizon.value} (~{decision.expected_holding_days} days)",
        f"",
        f"Signal Agreement: {decision.signal_agreement:.0%}",
        f"  Supporting: {', '.join(decision.key_supporting_signals[:3]) or 'None'}",
        f"  Opposing: {', '.join(decision.key_opposing_signals[:2]) or 'None'}",
        f"",
        f"─────────────────────────────────────────────────────────────────",
        f"RATIONALE:",
        f"{decision.rationale}",
        f"",
        f"RISK FACTORS:",
    ]
    
    for risk in decision.risk_factors:
        lines.append(f"  • {risk}")
    
    lines.extend([
        f"",
        f"UPGRADE CONDITIONS:",
    ])
    for cond in decision.upgrade_conditions[:3]:
        lines.append(f"  ↑ {cond}")
    
    lines.extend([
        f"",
        f"DOWNGRADE CONDITIONS:",
    ])
    for cond in decision.downgrade_conditions[:3]:
        lines.append(f"  ↓ {cond}")
    
    lines.append(f"═══════════════════════════════════════════════════════════════")
    
    return "\n".join(lines)
