"""
LAYER 8: Meta-Backtesting (Decision Quality Audit)
==================================================

This layer answers the critical allocator question:
"Does the system protect capital better than doing nothing?"

Unlike traditional backtesting (tests trades), meta-backtesting tests DECISIONS:
- When system said AVOID, what happened next 20/60 days?
- How often did AVOID prevent drawdowns?
- When INITIATE failed, did failure attribution predict it?

This measures DECISION QUALITY, not signal quality.

Output: Decision Quality Report that feeds into LLM explanations.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from collections import defaultdict
from enum import Enum
import logging

from .layer6_decision_engine import PositionIntent, Decision

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class DecisionOutcome:
    """Outcome of a single decision after the fact."""
    ticker: str
    decision_date: date
    intent: PositionIntent
    conviction: float
    
    # Context at decision time
    asset_regime: str
    market_regime: str
    relative_strength: float
    volatility: float
    
    # Forward outcomes (what actually happened)
    forward_return_5d: float
    forward_return_20d: float
    forward_return_60d: float
    max_drawdown_20d: float
    max_drawdown_60d: float
    
    # Did the decision "work"?
    decision_correct_5d: bool
    decision_correct_20d: bool
    decision_correct_60d: bool
    
    # Specific metrics
    avoided_drawdown: Optional[float] = None  # For AVOID decisions
    captured_upside: Optional[float] = None   # For INITIATE decisions
    opportunity_cost: Optional[float] = None  # Missed returns


@dataclass
class IntentMetrics:
    """Aggregated metrics for a specific intent type."""
    intent: str
    n_decisions: int
    
    # Success rates
    success_rate_5d: float
    success_rate_20d: float
    success_rate_60d: float
    
    # Return statistics
    avg_forward_return_20d: float
    median_forward_return_20d: float
    std_forward_return_20d: float
    
    # Risk statistics
    avg_max_drawdown: float
    worst_case_return: float
    best_case_return: float
    
    # Intent-specific metrics
    avg_avoided_drawdown: Optional[float] = None  # AVOID
    avg_captured_upside: Optional[float] = None   # INITIATE
    avg_opportunity_cost: Optional[float] = None
    
    # Confidence breakdown
    success_when_high_conviction: float = 0.0
    success_when_low_conviction: float = 0.0


@dataclass
class RegimeDecisionMetrics:
    """Decision metrics segmented by regime."""
    regime: str
    n_decisions: int
    avg_success_rate: float
    avg_return: float
    
    # By intent within regime
    intent_breakdown: Dict[str, Dict[str, float]]


@dataclass
class DecisionQualityReport:
    """
    Complete Decision Quality Report.
    
    This is what the LLM cites when explaining system credibility.
    """
    # Metadata
    ticker: str
    evaluation_period_start: date
    evaluation_period_end: date
    n_total_decisions: int
    
    # Overall metrics
    overall_success_rate: float
    overall_avg_return: float
    overall_sharpe: float
    
    # By intent
    intent_metrics: Dict[str, IntentMetrics]
    
    # By regime
    regime_metrics: Dict[str, RegimeDecisionMetrics]
    
    # Key insights (for LLM)
    avoid_effectiveness: float  # % of AVOIDs that prevented losses
    initiate_edge: float        # Avg alpha from INITIATEs
    hold_vs_exit_accuracy: float  # When to stay vs leave
    
    # Failure analysis
    failure_by_regime: Dict[str, float]
    failure_by_volatility: Dict[str, float]
    
    # Comparable stats (for LLM citation)
    comparable_avoid_stats: Dict[str, Any]
    comparable_initiate_stats: Dict[str, Any]


# =============================================================================
# DECISION QUALITY METRICS
# =============================================================================

class DecisionQualityMetrics:
    """
    Defines what makes a decision "correct" for each intent type.
    """
    
    @staticmethod
    def is_avoid_correct(forward_return: float, max_drawdown: float) -> bool:
        """
        AVOID is correct if:
        - Forward return was negative, OR
        - Max drawdown exceeded -5% (avoided pain even if recovered)
        """
        return forward_return < 0 or max_drawdown < -0.05
    
    @staticmethod
    def is_initiate_correct(forward_return: float, conviction: float) -> bool:
        """
        INITIATE is correct if:
        - Forward return > 0 (basic profitability)
        - Scaled by conviction: higher conviction should have higher returns
        """
        if conviction > 0.7:
            return forward_return > 0.02  # High conviction needs better returns
        elif conviction > 0.5:
            return forward_return > 0
        else:
            return forward_return > -0.02  # Low conviction has more leeway
    
    @staticmethod
    def is_hold_correct(forward_return: float, current_pnl: float) -> bool:
        """
        HOLD is correct if:
        - Position continues in favorable direction
        """
        return forward_return >= -0.02  # Didn't get worse significantly
    
    @staticmethod
    def is_exit_correct(forward_return_after_exit: float) -> bool:
        """
        EXIT is correct if:
        - The asset declined after we exited
        """
        return forward_return_after_exit < 0
    
    @staticmethod
    def is_reduce_correct(forward_return: float, reduction_pct: float) -> bool:
        """
        REDUCE is correct if:
        - Asset declined proportional to reduction
        """
        return forward_return < 0


# =============================================================================
# META-BACKTESTING ENGINE
# =============================================================================

class MetaBacktestEngine:
    """
    Meta-backtesting engine for decision quality analysis.
    
    Unlike Layer 5 (trade backtest), this tests:
    - Decision accuracy by intent type
    - Regime-conditional decision quality
    - Avoided drawdowns from AVOID decisions
    - Captured alpha from INITIATE decisions
    """
    
    def __init__(self):
        self.decision_history: List[DecisionOutcome] = []
        self.metrics = DecisionQualityMetrics()
    
    def record_decision(
        self,
        decision: Decision,
        prices: pd.DataFrame,
        lookforward_days: int = 60
    ) -> Optional[DecisionOutcome]:
        """
        Record a decision and its subsequent outcome.
        
        prices: DataFrame with date, close columns
        """
        decision_date = decision.date
        
        # Find decision date in prices
        if 'date' in prices.columns:
            prices = prices.set_index('date')
        
        if decision_date not in prices.index:
            # Find nearest date
            dates = prices.index[prices.index <= pd.Timestamp(decision_date)]
            if len(dates) == 0:
                return None
            decision_date = dates[-1].date() if hasattr(dates[-1], 'date') else dates[-1]
        
        decision_idx = prices.index.get_loc(pd.Timestamp(decision_date))
        
        # Calculate forward returns
        def get_forward_return(days):
            if decision_idx + days < len(prices):
                future_price = prices['close'].iloc[decision_idx + days]
                current_price = prices['close'].iloc[decision_idx]
                return (future_price / current_price) - 1
            return np.nan
        
        def get_max_drawdown(days):
            if decision_idx + days < len(prices):
                future_prices = prices['close'].iloc[decision_idx:decision_idx + days + 1]
                running_max = future_prices.expanding().max()
                drawdown = (future_prices / running_max) - 1
                return drawdown.min()
            return np.nan
        
        forward_5d = get_forward_return(5)
        forward_20d = get_forward_return(20)
        forward_60d = get_forward_return(60)
        max_dd_20d = get_max_drawdown(20)
        max_dd_60d = get_max_drawdown(60)
        
        # Determine if decision was correct
        intent = decision.intent
        
        if intent == PositionIntent.AVOID:
            correct_5d = self.metrics.is_avoid_correct(forward_5d, max_dd_20d) if not np.isnan(forward_5d) else False
            correct_20d = self.metrics.is_avoid_correct(forward_20d, max_dd_20d) if not np.isnan(forward_20d) else False
            correct_60d = self.metrics.is_avoid_correct(forward_60d, max_dd_60d) if not np.isnan(forward_60d) else False
            avoided_dd = abs(max_dd_20d) if max_dd_20d < -0.02 else 0
            opportunity_cost = max(0, forward_20d) if not np.isnan(forward_20d) else 0
            captured_upside = None
            
        elif intent == PositionIntent.INITIATE:
            correct_5d = self.metrics.is_initiate_correct(forward_5d, decision.conviction) if not np.isnan(forward_5d) else False
            correct_20d = self.metrics.is_initiate_correct(forward_20d, decision.conviction) if not np.isnan(forward_20d) else False
            correct_60d = self.metrics.is_initiate_correct(forward_60d, decision.conviction) if not np.isnan(forward_60d) else False
            captured_upside = max(0, forward_20d) if not np.isnan(forward_20d) else 0
            avoided_dd = None
            opportunity_cost = None
            
        elif intent == PositionIntent.HOLD:
            correct_5d = self.metrics.is_hold_correct(forward_5d, 0) if not np.isnan(forward_5d) else False
            correct_20d = self.metrics.is_hold_correct(forward_20d, 0) if not np.isnan(forward_20d) else False
            correct_60d = self.metrics.is_hold_correct(forward_60d, 0) if not np.isnan(forward_60d) else False
            avoided_dd = None
            captured_upside = max(0, forward_20d) if not np.isnan(forward_20d) else 0
            opportunity_cost = None
            
        elif intent == PositionIntent.EXIT:
            correct_5d = self.metrics.is_exit_correct(forward_5d) if not np.isnan(forward_5d) else False
            correct_20d = self.metrics.is_exit_correct(forward_20d) if not np.isnan(forward_20d) else False
            correct_60d = self.metrics.is_exit_correct(forward_60d) if not np.isnan(forward_60d) else False
            avoided_dd = abs(min(0, forward_20d)) if not np.isnan(forward_20d) else 0
            captured_upside = None
            opportunity_cost = max(0, forward_20d) if not np.isnan(forward_20d) else 0
            
        else:  # REDUCE, ADD, HEDGE
            correct_5d = forward_5d > -0.02 if not np.isnan(forward_5d) else False
            correct_20d = forward_20d > -0.02 if not np.isnan(forward_20d) else False
            correct_60d = forward_60d > -0.02 if not np.isnan(forward_60d) else False
            avoided_dd = None
            captured_upside = None
            opportunity_cost = None
        
        outcome = DecisionOutcome(
            ticker=decision.ticker,
            decision_date=decision.date,
            intent=intent,
            conviction=decision.conviction,
            asset_regime=decision.asset_regime,
            market_regime=decision.market_regime,
            relative_strength=decision.relative_strength,
            volatility=decision.expected_risk,
            forward_return_5d=forward_5d,
            forward_return_20d=forward_20d,
            forward_return_60d=forward_60d,
            max_drawdown_20d=max_dd_20d,
            max_drawdown_60d=max_dd_60d,
            decision_correct_5d=correct_5d,
            decision_correct_20d=correct_20d,
            decision_correct_60d=correct_60d,
            avoided_drawdown=avoided_dd,
            captured_upside=captured_upside,
            opportunity_cost=opportunity_cost
        )
        
        self.decision_history.append(outcome)
        return outcome
    
    def compute_intent_metrics(self, intent: str) -> IntentMetrics:
        """Compute metrics for a specific intent type."""
        intent_outcomes = [
            o for o in self.decision_history 
            if o.intent.value == intent
        ]
        
        if not intent_outcomes:
            return IntentMetrics(
                intent=intent,
                n_decisions=0,
                success_rate_5d=0, success_rate_20d=0, success_rate_60d=0,
                avg_forward_return_20d=0, median_forward_return_20d=0,
                std_forward_return_20d=0, avg_max_drawdown=0,
                worst_case_return=0, best_case_return=0
            )
        
        n = len(intent_outcomes)
        
        # Success rates
        success_5d = sum(1 for o in intent_outcomes if o.decision_correct_5d) / n
        success_20d = sum(1 for o in intent_outcomes if o.decision_correct_20d) / n
        success_60d = sum(1 for o in intent_outcomes if o.decision_correct_60d) / n
        
        # Return stats
        returns_20d = [o.forward_return_20d for o in intent_outcomes if not np.isnan(o.forward_return_20d)]
        avg_return = np.mean(returns_20d) if returns_20d else 0
        median_return = np.median(returns_20d) if returns_20d else 0
        std_return = np.std(returns_20d) if returns_20d else 0
        
        # Drawdown stats
        drawdowns = [o.max_drawdown_20d for o in intent_outcomes if not np.isnan(o.max_drawdown_20d)]
        avg_dd = np.mean(drawdowns) if drawdowns else 0
        
        worst = min(returns_20d) if returns_20d else 0
        best = max(returns_20d) if returns_20d else 0
        
        # Intent-specific
        avoided_dds = [o.avoided_drawdown for o in intent_outcomes if o.avoided_drawdown is not None]
        captured_ups = [o.captured_upside for o in intent_outcomes if o.captured_upside is not None]
        opp_costs = [o.opportunity_cost for o in intent_outcomes if o.opportunity_cost is not None]
        
        # Conviction breakdown
        high_conv = [o for o in intent_outcomes if o.conviction > 0.6]
        low_conv = [o for o in intent_outcomes if o.conviction <= 0.6]
        
        success_high = sum(1 for o in high_conv if o.decision_correct_20d) / len(high_conv) if high_conv else 0
        success_low = sum(1 for o in low_conv if o.decision_correct_20d) / len(low_conv) if low_conv else 0
        
        return IntentMetrics(
            intent=intent,
            n_decisions=n,
            success_rate_5d=success_5d,
            success_rate_20d=success_20d,
            success_rate_60d=success_60d,
            avg_forward_return_20d=avg_return,
            median_forward_return_20d=median_return,
            std_forward_return_20d=std_return,
            avg_max_drawdown=avg_dd,
            worst_case_return=worst,
            best_case_return=best,
            avg_avoided_drawdown=np.mean(avoided_dds) if avoided_dds else None,
            avg_captured_upside=np.mean(captured_ups) if captured_ups else None,
            avg_opportunity_cost=np.mean(opp_costs) if opp_costs else None,
            success_when_high_conviction=success_high,
            success_when_low_conviction=success_low
        )
    
    def compute_regime_metrics(self, regime: str) -> RegimeDecisionMetrics:
        """Compute decision metrics for a specific regime."""
        regime_outcomes = [
            o for o in self.decision_history
            if o.asset_regime == regime
        ]
        
        if not regime_outcomes:
            return RegimeDecisionMetrics(
                regime=regime,
                n_decisions=0,
                avg_success_rate=0,
                avg_return=0,
                intent_breakdown={}
            )
        
        n = len(regime_outcomes)
        success_rate = sum(1 for o in regime_outcomes if o.decision_correct_20d) / n
        returns = [o.forward_return_20d for o in regime_outcomes if not np.isnan(o.forward_return_20d)]
        avg_return = np.mean(returns) if returns else 0
        
        # By intent within regime
        intent_breakdown = {}
        for intent in PositionIntent:
            intent_outcomes = [o for o in regime_outcomes if o.intent == intent]
            if intent_outcomes:
                intent_success = sum(1 for o in intent_outcomes if o.decision_correct_20d) / len(intent_outcomes)
                intent_returns = [o.forward_return_20d for o in intent_outcomes if not np.isnan(o.forward_return_20d)]
                intent_breakdown[intent.value] = {
                    'n': len(intent_outcomes),
                    'success_rate': intent_success,
                    'avg_return': np.mean(intent_returns) if intent_returns else 0
                }
        
        return RegimeDecisionMetrics(
            regime=regime,
            n_decisions=n,
            avg_success_rate=success_rate,
            avg_return=avg_return,
            intent_breakdown=intent_breakdown
        )
    
    def generate_quality_report(self, ticker: str = '') -> DecisionQualityReport:
        """Generate complete decision quality report."""
        if not self.decision_history:
            return self._empty_report(ticker)
        
        # Filter by ticker if specified
        outcomes = self.decision_history
        if ticker:
            outcomes = [o for o in outcomes if o.ticker == ticker]
        
        if not outcomes:
            return self._empty_report(ticker)
        
        # Date range
        dates = [o.decision_date for o in outcomes]
        start_date = min(dates)
        end_date = max(dates)
        
        # Overall metrics
        n = len(outcomes)
        overall_success = sum(1 for o in outcomes if o.decision_correct_20d) / n
        returns = [o.forward_return_20d for o in outcomes if not np.isnan(o.forward_return_20d)]
        overall_return = np.mean(returns) if returns else 0
        overall_sharpe = overall_return / (np.std(returns) + 1e-6) * np.sqrt(252/20) if returns else 0
        
        # By intent
        intent_metrics = {}
        for intent in PositionIntent:
            intent_metrics[intent.value] = self.compute_intent_metrics(intent.value)
        
        # By regime
        unique_regimes = list(set(o.asset_regime for o in outcomes))
        regime_metrics = {r: self.compute_regime_metrics(r) for r in unique_regimes}
        
        # Key insights
        avoid_outcomes = [o for o in outcomes if o.intent == PositionIntent.AVOID]
        avoid_effectiveness = (
            sum(1 for o in avoid_outcomes if o.avoided_drawdown and o.avoided_drawdown > 0.02) / len(avoid_outcomes)
            if avoid_outcomes else 0
        )
        
        initiate_outcomes = [o for o in outcomes if o.intent == PositionIntent.INITIATE]
        initiate_edge = (
            np.mean([o.forward_return_20d for o in initiate_outcomes if not np.isnan(o.forward_return_20d)])
            if initiate_outcomes else 0
        )
        
        hold_exit_outcomes = [o for o in outcomes if o.intent in [PositionIntent.HOLD, PositionIntent.EXIT]]
        hold_exit_accuracy = (
            sum(1 for o in hold_exit_outcomes if o.decision_correct_20d) / len(hold_exit_outcomes)
            if hold_exit_outcomes else 0
        )
        
        # Failure analysis
        failed = [o for o in outcomes if not o.decision_correct_20d]
        failure_by_regime = {}
        for regime in unique_regimes:
            regime_fails = [o for o in failed if o.asset_regime == regime]
            failure_by_regime[regime] = len(regime_fails) / len(failed) if failed else 0
        
        # Failure by volatility
        high_vol_fails = [o for o in failed if o.volatility > 0.25]
        low_vol_fails = [o for o in failed if o.volatility <= 0.25]
        failure_by_vol = {
            'high_volatility': len(high_vol_fails) / len(failed) if failed else 0,
            'low_volatility': len(low_vol_fails) / len(failed) if failed else 0
        }
        
        # Comparable stats for LLM
        avoid_stats = {
            'n_decisions': len(avoid_outcomes),
            'prevented_losses_pct': avoid_effectiveness,
            'avg_avoided_drawdown': intent_metrics['AVOID'].avg_avoided_drawdown,
            'opportunity_cost': intent_metrics['AVOID'].avg_opportunity_cost
        }
        
        initiate_stats = {
            'n_decisions': len(initiate_outcomes),
            'positive_expectancy_pct': intent_metrics['INITIATE'].success_rate_20d,
            'avg_return': initiate_edge,
            'avg_drawdown_when_wrong': intent_metrics['INITIATE'].avg_max_drawdown
        }
        
        return DecisionQualityReport(
            ticker=ticker or 'ALL',
            evaluation_period_start=start_date,
            evaluation_period_end=end_date,
            n_total_decisions=n,
            overall_success_rate=overall_success,
            overall_avg_return=overall_return,
            overall_sharpe=overall_sharpe,
            intent_metrics=intent_metrics,
            regime_metrics=regime_metrics,
            avoid_effectiveness=avoid_effectiveness,
            initiate_edge=initiate_edge,
            hold_vs_exit_accuracy=hold_exit_accuracy,
            failure_by_regime=failure_by_regime,
            failure_by_volatility=failure_by_vol,
            comparable_avoid_stats=avoid_stats,
            comparable_initiate_stats=initiate_stats
        )
    
    def _empty_report(self, ticker: str) -> DecisionQualityReport:
        """Return empty report."""
        return DecisionQualityReport(
            ticker=ticker or 'N/A',
            evaluation_period_start=date.today(),
            evaluation_period_end=date.today(),
            n_total_decisions=0,
            overall_success_rate=0,
            overall_avg_return=0,
            overall_sharpe=0,
            intent_metrics={},
            regime_metrics={},
            avoid_effectiveness=0,
            initiate_edge=0,
            hold_vs_exit_accuracy=0,
            failure_by_regime={},
            failure_by_volatility={},
            comparable_avoid_stats={},
            comparable_initiate_stats={}
        )


# =============================================================================
# OUTPUT FORMATTING
# =============================================================================

def format_quality_report_for_llm(report: DecisionQualityReport) -> str:
    """
    Format decision quality report for LLM citation.
    
    This is what the LLM cites to establish credibility:
    
    "Based on 247 historical decisions:
    - AVOID decisions prevented losses 68% of the time
    - INITIATE decisions had positive expectancy in 61% of cases"
    """
    lines = [
        f"Decision Quality Report ({report.evaluation_period_start} to {report.evaluation_period_end})",
        f"Total decisions analyzed: {report.n_total_decisions}",
        "",
        "=" * 60,
        "",
    ]
    
    # AVOID effectiveness
    avoid = report.comparable_avoid_stats
    if avoid.get('n_decisions', 0) > 0:
        lines.extend([
            "AVOID Decisions:",
            f"  - Prevented losses in {report.avoid_effectiveness:.0%} of cases",
            f"  - Average avoided drawdown: {avoid.get('avg_avoided_drawdown', 0):.1%}" if avoid.get('avg_avoided_drawdown') else "",
            f"  - Opportunity cost (missed upside): {avoid.get('opportunity_cost', 0):.1%}" if avoid.get('opportunity_cost') else "",
            ""
        ])
    
    # INITIATE performance
    initiate = report.comparable_initiate_stats
    if initiate.get('n_decisions', 0) > 0:
        lines.extend([
            "INITIATE Decisions:",
            f"  - Positive expectancy in {initiate.get('positive_expectancy_pct', 0):.0%} of cases",
            f"  - Average return: {initiate.get('avg_return', 0):.1%}",
            f"  - Avg drawdown when wrong: {initiate.get('avg_drawdown_when_wrong', 0):.1%}",
            ""
        ])
    
    # Overall
    lines.extend([
        "Overall Performance:",
        f"  - Success rate (20d): {report.overall_success_rate:.0%}",
        f"  - Average return: {report.overall_avg_return:.1%}",
        f"  - Sharpe ratio: {report.overall_sharpe:.2f}",
    ])
    
    return "\n".join(lines)


def get_decision_quality_citation(report: DecisionQualityReport) -> str:
    """
    Get concise citation for LLM explanations.
    
    Example output:
    "Based on 247 historical decisions, AVOID recommendations prevented 
    losses 68% of the time with 4.1% average avoided drawdown."
    """
    n = report.n_total_decisions
    
    if n == 0:
        return "Insufficient historical decision data for quality analysis."
    
    avoid_eff = report.avoid_effectiveness
    avoid_dd = report.comparable_avoid_stats.get('avg_avoided_drawdown', 0)
    initiate_edge = report.initiate_edge
    success = report.overall_success_rate
    
    citation = (
        f"Based on {n} historical decisions: "
        f"AVOID recommendations prevented losses {avoid_eff:.0%} of the time"
    )
    
    if avoid_dd and avoid_dd > 0:
        citation += f" (avg avoided drawdown: {avoid_dd:.1%})"
    
    citation += f". INITIATE decisions averaged {initiate_edge:+.1%} returns."
    citation += f" Overall decision accuracy: {success:.0%}."
    
    return citation

