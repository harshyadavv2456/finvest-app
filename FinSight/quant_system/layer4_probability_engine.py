"""
LAYER 4: Probability Engine (Institutional Grade)
=================================================

Generates probabilistic outcomes: return distributions, volatility forecasts,
and downside risk metrics.

CRITICAL UPGRADE: Conditional Volatility Modeling
- vol_normal: Base volatility in normal conditions
- vol_stress: Elevated volatility during regime stress
- vol_tail: Extreme volatility in panic regimes
- CVaR is REGIME-CONDITIONED (critical for risk trust)

This dramatically improves risk trust in PM conversations.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date
from dataclasses import dataclass, field
import logging
from scipy import stats
from collections import defaultdict

from .config import (
    DEFAULT_PROBABILITY_CONFIG, MODEL_OUTPUT_DIR,
    CVAR_CONFIDENCE_LEVELS
)
from .layer2_regime_engine import RegimeOutput
from .layer3_signal_efficacy import EfficacyReport, SignalEfficacy

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ConditionalVolatility:
    """
    UPGRADE: Regime-conditional volatility structure.
    
    Institutions don't use a single volatility number.
    They model volatility conditional on market state.
    """
    vol_normal: float       # Base case volatility
    vol_stress: float       # Elevated (distribution/markdown regimes)
    vol_tail: float         # Extreme (panic regime)
    vol_current: float      # Current realized volatility
    vol_forecast: float     # Forward volatility estimate
    vol_term_structure: Dict[int, float]  # Volatility by horizon
    vol_regime: str         # Current volatility regime
    vol_percentile: float   # Where current vol sits historically


@dataclass
class ReturnDistribution:
    """Forward return distribution estimates."""
    horizon: int
    n_observations: int
    
    # Percentiles
    p5: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float
    
    # Moments
    mean: float
    std: float
    skew: float
    kurtosis: float
    
    # UPGRADE: Regime-conditional percentiles
    p10_stress: float  # p10 in stress regimes
    p10_tail: float    # p10 in tail (panic) regimes
    
    # Distribution shape
    distribution_type: str  # 'normal', 'fat_tailed', 'skewed'


@dataclass
class RiskMetrics:
    """
    UPGRADE: Comprehensive regime-conditioned risk metrics.
    """
    # Standard CVaR
    cvar_95: float      # 5% tail loss
    cvar_99: float      # 1% tail loss
    
    # REGIME-CONDITIONED CVaR (critical upgrade)
    cvar_95_normal: float     # CVaR in normal regimes
    cvar_95_stress: float     # CVaR in stress regimes
    cvar_95_panic: float      # CVaR in panic regimes
    
    # VaR
    var_95: float
    var_99: float
    
    # Other risk metrics
    max_drawdown_expected: float
    downside_deviation: float
    sortino_ratio: float
    calmar_ratio: float
    
    # Tail risk
    tail_ratio: float          # p90 / abs(p10)
    gain_to_pain_ratio: float


@dataclass
class ProbabilisticOutcome:
    """Complete probabilistic outcome for decision making."""
    ticker: str
    date: date
    horizon: int
    
    # Regime context
    asset_regime: str
    market_regime: str
    relative_strength: float
    
    # Return distribution
    return_distribution: ReturnDistribution
    
    # UPGRADE: Conditional volatility
    volatility: ConditionalVolatility
    
    # UPGRADE: Regime-conditioned risk
    risk_metrics: RiskMetrics
    
    # Confidence & quality
    data_quality_score: float  # How much data backs this estimate
    regime_confidence: float
    
    # Meta
    n_comparable_setups: int   # How many similar situations in history
    
    def expected_return(self) -> float:
        """Central tendency of return distribution."""
        return self.return_distribution.p50
    
    def risk_adjusted_return(self) -> float:
        """Sharpe-like ratio using regime-appropriate volatility."""
        vol = self.volatility.vol_forecast
        if vol == 0:
            return 0
        return self.return_distribution.mean / vol


# =============================================================================
# VOLATILITY MODELER (UPGRADE)
# =============================================================================

class ConditionalVolatilityModeler:
    """
    CRITICAL UPGRADE: Model volatility conditional on regime.
    
    Institutions maintain separate volatility estimates for:
    1. Normal conditions
    2. Stress conditions  
    3. Tail/panic conditions
    """
    
    def __init__(self):
        self.vol_history: Dict[str, List[float]] = defaultdict(list)
        self.regime_vol_stats: Dict[str, Dict[str, float]] = {}
    
    def fit(
        self,
        returns: pd.Series,
        regimes: pd.Series,
        volatility: pd.Series
    ) -> 'ConditionalVolatilityModeler':
        """Fit volatility model on historical data by regime."""
        # Categorize regimes into normal/stress/tail
        regime_category = {
            'accumulation': 'normal',
            'markup': 'normal',
            'recovery': 'normal',
            'distribution': 'stress',
            'markdown': 'stress',
            'panic': 'tail'
        }
        
        for regime, vol in zip(regimes, volatility):
            if pd.isna(regime) or pd.isna(vol):
                continue
            category = regime_category.get(regime, 'normal')
            self.vol_history[category].append(vol)
        
        # Compute stats per category
        for category, vols in self.vol_history.items():
            if len(vols) > 10:
                self.regime_vol_stats[category] = {
                    'mean': np.mean(vols),
                    'median': np.median(vols),
                    'p75': np.percentile(vols, 75),
                    'p90': np.percentile(vols, 90),
                    'std': np.std(vols)
                }
        
        return self
    
    def estimate_conditional_volatility(
        self,
        current_vol: float,
        current_regime: str,
        vol_history: pd.Series = None
    ) -> ConditionalVolatility:
        """
        Estimate volatility conditional on current state.
        
        Returns separate vol estimates for normal/stress/tail scenarios.
        """
        # Regime category
        regime_category = {
            'accumulation': 'normal',
            'markup': 'normal', 
            'recovery': 'normal',
            'distribution': 'stress',
            'markdown': 'stress',
            'panic': 'tail'
        }
        current_category = regime_category.get(current_regime, 'normal')
        
        # Get historical stats
        normal_stats = self.regime_vol_stats.get('normal', {'mean': 0.20, 'p90': 0.30})
        stress_stats = self.regime_vol_stats.get('stress', {'mean': 0.30, 'p90': 0.45})
        tail_stats = self.regime_vol_stats.get('tail', {'mean': 0.50, 'p90': 0.80})
        
        vol_normal = normal_stats.get('mean', 0.20)
        vol_stress = stress_stats.get('mean', 0.30)
        vol_tail = tail_stats.get('mean', 0.50)
        
        # Forecast volatility: blend current vol with regime-appropriate expectation
        if current_category == 'normal':
            vol_forecast = 0.6 * current_vol + 0.4 * vol_normal
        elif current_category == 'stress':
            vol_forecast = 0.5 * current_vol + 0.5 * vol_stress
        else:  # tail
            vol_forecast = 0.4 * current_vol + 0.6 * vol_tail
        
        # Volatility term structure (vol tends to mean-revert)
        vol_term_structure = {
            5: vol_forecast,
            20: vol_forecast * 0.95,  # Slight mean reversion
            60: vol_forecast * 0.90,
            120: vol_forecast * 0.85
        }
        
        # Volatility regime
        if current_vol < normal_stats.get('mean', 0.20):
            vol_regime = 'low'
        elif current_vol < stress_stats.get('mean', 0.30):
            vol_regime = 'normal'
        elif current_vol < tail_stats.get('mean', 0.50):
            vol_regime = 'elevated'
        else:
            vol_regime = 'extreme'
        
        # Percentile
        if vol_history is not None and len(vol_history) > 50:
            vol_percentile = (vol_history < current_vol).mean()
        else:
            vol_percentile = 0.5
        
        return ConditionalVolatility(
            vol_normal=vol_normal,
            vol_stress=vol_stress,
            vol_tail=vol_tail,
            vol_current=current_vol,
            vol_forecast=vol_forecast,
            vol_term_structure=vol_term_structure,
            vol_regime=vol_regime,
            vol_percentile=float(vol_percentile)
        )


# =============================================================================
# CVaR MODELER (UPGRADE)
# =============================================================================

class RegimeConditionedCVaR:
    """
    CRITICAL UPGRADE: CVaR conditional on regime.
    
    Standard CVaR ignores regime context.
    Regime-conditioned CVaR answers: "What's my tail risk given WHERE we are?"
    """
    
    def __init__(self):
        self.regime_return_stats: Dict[str, Dict[str, float]] = {}
    
    def fit(
        self,
        returns: pd.Series,
        regimes: pd.Series
    ) -> 'RegimeConditionedCVaR':
        """Fit return distributions by regime."""
        regime_category = {
            'accumulation': 'normal',
            'markup': 'normal',
            'recovery': 'normal', 
            'distribution': 'stress',
            'markdown': 'stress',
            'panic': 'tail'
        }
        
        returns_by_category = defaultdict(list)
        
        for ret, regime in zip(returns, regimes):
            if pd.isna(ret) or pd.isna(regime):
                continue
            category = regime_category.get(regime, 'normal')
            returns_by_category[category].append(ret)
        
        for category, rets in returns_by_category.items():
            if len(rets) > 30:
                rets = np.array(rets)
                self.regime_return_stats[category] = {
                    'mean': np.mean(rets),
                    'std': np.std(rets),
                    'var_95': np.percentile(rets, 5),
                    'var_99': np.percentile(rets, 1),
                    'cvar_95': rets[rets <= np.percentile(rets, 5)].mean(),
                    'cvar_99': rets[rets <= np.percentile(rets, 1)].mean(),
                    'skew': stats.skew(rets),
                    'kurtosis': stats.kurtosis(rets)
                }
        
        return self
    
    def estimate_cvar(
        self,
        current_regime: str,
        horizon: int = 20,
        confidence_levels: List[float] = None
    ) -> Dict[str, float]:
        """
        Estimate CVaR conditional on current regime.
        
        Returns CVaR for normal, stress, and tail scenarios.
        """
        confidence_levels = confidence_levels or [0.95, 0.99]
        
        regime_category = {
            'accumulation': 'normal',
            'markup': 'normal',
            'recovery': 'normal',
            'distribution': 'stress', 
            'markdown': 'stress',
            'panic': 'tail'
        }
        current_category = regime_category.get(current_regime, 'normal')
        
        result = {}
        
        # Get stats for each regime category
        for category in ['normal', 'stress', 'tail']:
            stats_dict = self.regime_return_stats.get(category, {})
            
            # Default values if no data
            if not stats_dict:
                if category == 'normal':
                    cvar_95, cvar_99 = -0.03, -0.05
                elif category == 'stress':
                    cvar_95, cvar_99 = -0.06, -0.10
                else:  # tail
                    cvar_95, cvar_99 = -0.12, -0.20
            else:
                cvar_95 = stats_dict.get('cvar_95', -0.05)
                cvar_99 = stats_dict.get('cvar_99', -0.10)
            
            # Scale by horizon (sqrt-time for vol, linear for drift)
            horizon_factor = np.sqrt(horizon / 20)
            
            result[f'cvar_95_{category}'] = cvar_95 * horizon_factor
            result[f'cvar_99_{category}'] = cvar_99 * horizon_factor
        
        # Current regime CVaR (what to use for decisions)
        result['cvar_95'] = result.get(f'cvar_95_{current_category}', -0.05)
        result['cvar_99'] = result.get(f'cvar_99_{current_category}', -0.10)
        
        return result


# =============================================================================
# PROBABILITY ENGINE
# =============================================================================

class ProbabilityEngine:
    """
    Generates probabilistic outcomes for decision-making.
    
    UPGRADED with:
    - Conditional volatility modeling
    - Regime-conditioned CVaR
    - Comparable setup counting
    """
    
    def __init__(self, config=None):
        self.config = config or DEFAULT_PROBABILITY_CONFIG
        self.vol_modeler = ConditionalVolatilityModeler()
        self.cvar_modeler = RegimeConditionedCVaR()
        self.is_fitted = False
    
    def fit(
        self,
        prices: pd.Series,
        regimes: pd.Series
    ) -> 'ProbabilityEngine':
        """Fit probability engine on historical data."""
        returns = prices.pct_change(20)  # 20-day returns
        daily_returns = prices.pct_change(1)
        volatility = daily_returns.rolling(20).std() * np.sqrt(252)
        
        self.vol_modeler.fit(returns, regimes, volatility)
        self.cvar_modeler.fit(returns, regimes)
        
        self.is_fitted = True
        return self
    
    def estimate_return_distribution(
        self,
        efficacy_report: EfficacyReport,
        regime: str,
        horizon: int = 20
    ) -> ReturnDistribution:
        """Estimate forward return distribution from efficacy data."""
        # Get efficacy for this regime
        regime_efficacies = efficacy_report.efficacies.get(regime, {})
        
        # Aggregate across signals
        all_p10 = []
        all_p25 = []
        all_p50 = []
        all_p75 = []
        all_p90 = []
        all_means = []
        all_stds = []
        total_obs = 0
        
        for key, eff in regime_efficacies.items():
            if f'{horizon}d' in key:
                all_p10.append(eff.forward_return_p10)
                all_p25.append(eff.forward_return_p25)
                all_p50.append(eff.forward_return_p50)
                all_p75.append(eff.forward_return_p75)
                all_p90.append(eff.forward_return_p90)
                all_means.append(eff.forward_return_mean)
                all_stds.append(eff.forward_return_std)
                total_obs += eff.n_observations
        
        if not all_p50:
            # Fallback defaults
            return ReturnDistribution(
                horizon=horizon,
                n_observations=0,
                p5=-0.08, p10=-0.05, p25=-0.02, p50=0.01, 
                p75=0.04, p90=0.07, p95=0.10,
                mean=0.01, std=0.05, skew=0, kurtosis=3,
                p10_stress=-0.08, p10_tail=-0.15,
                distribution_type='normal'
            )
        
        # Weighted average (by observation count implicitly)
        p10 = np.mean(all_p10)
        p25 = np.mean(all_p25)
        p50 = np.mean(all_p50)
        p75 = np.mean(all_p75)
        p90 = np.mean(all_p90)
        mean = np.mean(all_means)
        std = np.mean(all_stds)
        
        # Estimate p5 and p95 from distribution shape
        p5 = p10 - (p10 - p25) * 0.8
        p95 = p90 + (p75 - p90) * 0.8
        
        # UPGRADE: Stress/tail percentiles
        # Scale p10 by typical stress/tail volatility increase
        p10_stress = p10 * 1.5
        p10_tail = p10 * 2.5
        
        # Infer distribution shape
        skew = (mean - p50) / (std + 1e-6) * 3
        if abs(skew) > 1:
            dist_type = 'skewed'
        elif (p90 - p50) / (p50 - p10 + 1e-6) > 1.5:
            dist_type = 'fat_tailed'
        else:
            dist_type = 'normal'
        
        return ReturnDistribution(
            horizon=horizon,
            n_observations=total_obs,
            p5=p5, p10=p10, p25=p25, p50=p50,
            p75=p75, p90=p90, p95=p95,
            mean=mean, std=std, skew=skew, kurtosis=3.0,
            p10_stress=p10_stress, p10_tail=p10_tail,
            distribution_type=dist_type
        )
    
    def estimate_risk_metrics(
        self,
        return_dist: ReturnDistribution,
        volatility: ConditionalVolatility,
        regime: str
    ) -> RiskMetrics:
        """
        UPGRADED: Estimate regime-conditioned risk metrics.
        """
        # Get CVaR estimates
        cvar_estimates = self.cvar_modeler.estimate_cvar(regime, return_dist.horizon)
        
        # Standard VaR/CVaR from distribution
        var_95 = return_dist.p5
        var_99 = return_dist.p5 - (return_dist.p10 - return_dist.p5) * 1.5
        
        # REGIME-CONDITIONED CVaR
        cvar_95_normal = cvar_estimates.get('cvar_95_normal', return_dist.p10)
        cvar_95_stress = cvar_estimates.get('cvar_95_stress', return_dist.p10 * 1.5)
        cvar_95_panic = cvar_estimates.get('cvar_95_panic', return_dist.p10 * 2.5)
        
        # Use regime-appropriate CVaR as primary
        cvar_95 = cvar_estimates.get('cvar_95', return_dist.p10)
        cvar_99 = cvar_estimates.get('cvar_99', return_dist.p5)
        
        # Max drawdown expected (heuristic)
        max_dd_expected = cvar_95_stress * 1.2
        
        # Downside deviation (only negative returns)
        downside_dev = volatility.vol_stress * 0.7  # Approximation
        
        # Sortino ratio (using downside deviation)
        sortino = return_dist.mean / (downside_dev + 1e-6) if downside_dev > 0 else 0
        
        # Calmar ratio (return / max drawdown)
        calmar = return_dist.mean / abs(max_dd_expected + 1e-6) if max_dd_expected != 0 else 0
        
        # Tail ratio
        tail_ratio = return_dist.p90 / abs(return_dist.p10 + 1e-6) if return_dist.p10 != 0 else 1
        
        # Gain to pain
        gain = max(0, return_dist.mean)
        pain = abs(min(0, return_dist.p10))
        gain_to_pain = gain / (pain + 1e-6)
        
        return RiskMetrics(
            cvar_95=cvar_95,
            cvar_99=cvar_99,
            cvar_95_normal=cvar_95_normal,
            cvar_95_stress=cvar_95_stress,
            cvar_95_panic=cvar_95_panic,
            var_95=var_95,
            var_99=var_99,
            max_drawdown_expected=max_dd_expected,
            downside_deviation=downside_dev,
            sortino_ratio=sortino,
            calmar_ratio=calmar,
            tail_ratio=tail_ratio,
            gain_to_pain_ratio=gain_to_pain
        )
    
    def count_comparable_setups(
        self,
        regime_history: pd.DataFrame,
        current_regime: str,
        market_regime: str,
        relative_strength: float
    ) -> int:
        """
        UPGRADE: Count historically comparable setups.
        
        This feeds directly into LLM interpretation:
        "Comparable historical setups: 14"
        """
        if regime_history.empty:
            return 0
        
        # Filter for similar regimes
        regime_match = regime_history['regime'] == current_regime
        
        # Match market regime if available
        if 'market_regime' in regime_history.columns:
            market_match = regime_history['market_regime'] == market_regime
            regime_match = regime_match & market_match
        
        # Match relative strength band
        if 'relative_strength' in regime_history.columns:
            strength_lower = relative_strength - 0.2
            strength_upper = relative_strength + 0.2
            strength_match = (
                (regime_history['relative_strength'] >= strength_lower) &
                (regime_history['relative_strength'] <= strength_upper)
            )
            regime_match = regime_match & strength_match
        
        return int(regime_match.sum())
    
    def generate_outcome(
        self,
        ticker: str,
        current_date: date,
        regime_output: RegimeOutput,
        efficacy_report: EfficacyReport,
        prices: pd.Series,
        regime_history: pd.DataFrame = None,
        horizon: int = 20
    ) -> ProbabilisticOutcome:
        """
        Generate complete probabilistic outcome.
        
        UPGRADED with:
        - Conditional volatility
        - Regime-conditioned CVaR
        - Comparable setup count
        """
        # Current volatility
        daily_ret = prices.pct_change(1)
        current_vol = daily_ret.rolling(20).std().iloc[-1] * np.sqrt(252)
        vol_history = daily_ret.rolling(20).std() * np.sqrt(252)
        
        # UPGRADE: Conditional volatility
        volatility = self.vol_modeler.estimate_conditional_volatility(
            current_vol=current_vol,
            current_regime=regime_output.regime,
            vol_history=vol_history
        )
        
        # Return distribution from efficacy
        return_dist = self.estimate_return_distribution(
            efficacy_report, regime_output.regime, horizon
        )
        
        # UPGRADE: Regime-conditioned risk metrics
        risk_metrics = self.estimate_risk_metrics(
            return_dist, volatility, regime_output.regime
        )
        
        # Data quality score
        data_quality = min(1.0, return_dist.n_observations / 500)
        
        # UPGRADE: Comparable setups
        n_comparable = 0
        if regime_history is not None:
            n_comparable = self.count_comparable_setups(
                regime_history,
                regime_output.regime,
                regime_output.market_regime,
                regime_output.relative_regime_strength
            )
        
        return ProbabilisticOutcome(
            ticker=ticker,
            date=current_date,
            horizon=horizon,
            asset_regime=regime_output.regime,
            market_regime=regime_output.market_regime,
            relative_strength=regime_output.relative_regime_strength,
            return_distribution=return_dist,
            volatility=volatility,
            risk_metrics=risk_metrics,
            data_quality_score=data_quality,
            regime_confidence=regime_output.confidence,
            n_comparable_setups=n_comparable
        )
    
    def generate_multi_horizon_outcomes(
        self,
        ticker: str,
        current_date: date,
        regime_output: RegimeOutput,
        efficacy_report: EfficacyReport,
        prices: pd.Series,
        regime_history: pd.DataFrame = None,
        horizons: List[int] = None
    ) -> Dict[int, ProbabilisticOutcome]:
        """Generate outcomes for multiple horizons."""
        horizons = horizons or [5, 20, 60]
        
        return {
            h: self.generate_outcome(
                ticker, current_date, regime_output,
                efficacy_report, prices, regime_history, h
            )
            for h in horizons
        }


# =============================================================================
# UTILITIES
# =============================================================================

def format_outcome_for_llm(outcome: ProbabilisticOutcome) -> Dict[str, Any]:
    """Format outcome for LLM interpretation layer."""
    return {
        'ticker': outcome.ticker,
        'date': outcome.date.isoformat(),
        'horizon': outcome.horizon,
        
        # Regime context
        'asset_regime': outcome.asset_regime,
        'market_regime': outcome.market_regime,
        'relative_strength': round(outcome.relative_strength, 2),
        'regime_confidence': round(outcome.regime_confidence, 2),
        
        # Return expectations
        'expected_return_p10': f"{outcome.return_distribution.p10:.1%}",
        'expected_return_p50': f"{outcome.return_distribution.p50:.1%}",
        'expected_return_p90': f"{outcome.return_distribution.p90:.1%}",
        'return_skew': round(outcome.return_distribution.skew, 2),
        
        # UPGRADE: Conditional volatility
        'volatility': {
            'current': f"{outcome.volatility.vol_current:.1%}",
            'forecast': f"{outcome.volatility.vol_forecast:.1%}",
            'normal_expectation': f"{outcome.volatility.vol_normal:.1%}",
            'stress_expectation': f"{outcome.volatility.vol_stress:.1%}",
            'regime': outcome.volatility.vol_regime,
            'percentile': f"{outcome.volatility.vol_percentile:.0%}"
        },
        
        # UPGRADE: Regime-conditioned risk
        'risk': {
            'cvar_95': f"{outcome.risk_metrics.cvar_95:.1%}",
            'cvar_95_normal': f"{outcome.risk_metrics.cvar_95_normal:.1%}",
            'cvar_95_stress': f"{outcome.risk_metrics.cvar_95_stress:.1%}",
            'cvar_95_panic': f"{outcome.risk_metrics.cvar_95_panic:.1%}",
            'max_drawdown_expected': f"{outcome.risk_metrics.max_drawdown_expected:.1%}",
            'sortino_ratio': round(outcome.risk_metrics.sortino_ratio, 2),
            'tail_ratio': round(outcome.risk_metrics.tail_ratio, 2)
        },
        
        # Quality
        'data_quality': round(outcome.data_quality_score, 2),
        'n_comparable_setups': outcome.n_comparable_setups
    }


def summarize_risk_for_pm(outcome: ProbabilisticOutcome) -> str:
    """Generate PM-ready risk summary."""
    rm = outcome.risk_metrics
    vol = outcome.volatility
    
    lines = [
        f"Risk Assessment ({outcome.horizon}d horizon):",
        f"",
        f"Current volatility: {vol.vol_current:.1%} ({vol.vol_regime})",
        f"Forecast volatility: {vol.vol_forecast:.1%}",
        f"",
        f"CONDITIONAL CVaR (5%):",
        f"  Normal regimes: {rm.cvar_95_normal:.1%}",
        f"  Stress regimes: {rm.cvar_95_stress:.1%}",
        f"  Panic regimes:  {rm.cvar_95_panic:.1%}",
        f"  Current regime: {rm.cvar_95:.1%}",
        f"",
        f"Expected max drawdown: {rm.max_drawdown_expected:.1%}",
        f"Sortino ratio: {rm.sortino_ratio:.2f}",
        f"Tail ratio (upside/downside): {rm.tail_ratio:.2f}"
    ]
    
    return "\n".join(lines)
