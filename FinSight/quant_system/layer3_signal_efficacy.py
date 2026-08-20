"""
LAYER 3: Signal Efficacy Models (Institutional Grade)
=====================================================

Walk-forward validation of signal performance conditional on regimes.

CRITICAL UPGRADE: Signal Independence Enforcement
- Pairwise signal correlation tracking
- Mutual information computation
- Correlation-penalized contribution weights
- Effective weight = raw_weight × (1 − correlation_penalty)

Without this, conviction scores will be inflated by correlated signals.

This layer answers: "Given the current regime, how has each signal 
historically predicted forward returns?"
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
import logging
import warnings
from collections import defaultdict

warnings.filterwarnings('ignore')

from .config import (
    DEFAULT_EFFICACY_CONFIG, MODEL_OUTPUT_DIR,
    FORWARD_RETURN_HORIZONS
)
from .schemas import SignalEfficacyReport, RegimeState
from .signal_registry import get_signal_registry, SignalRegistry

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class SignalCorrelation:
    """Signal correlation analysis - UPGRADE."""
    signal1: str
    signal2: str
    correlation: float
    mutual_information: float
    redundancy_score: float  # How much signal2 adds given signal1
    correlation_stable: bool  # Is correlation stable across regimes


@dataclass 
class SignalContribution:
    """Signal contribution with correlation penalty - UPGRADE."""
    signal_name: str
    raw_contribution: float
    correlation_penalty: float
    effective_contribution: float
    primary_regime: str
    consistency_score: float  # How consistent is contribution across time


@dataclass
class SignalEfficacy:
    """Efficacy metrics for a signal conditional on regime."""
    signal_name: str
    regime: str
    horizon: int
    n_observations: int
    
    # Predictive performance
    hit_rate: float
    information_coefficient: float
    mean_return_when_positive: float
    mean_return_when_negative: float
    
    # Return distribution
    forward_return_p10: float
    forward_return_p25: float
    forward_return_p50: float
    forward_return_p75: float
    forward_return_p90: float
    forward_return_mean: float
    forward_return_std: float
    
    # Risk-adjusted
    sharpe_by_quintile: List[float]
    max_drawdown: float
    
    # UPGRADE: Correlation-adjusted metrics
    correlation_with_other_signals: Dict[str, float]
    correlation_penalty: float
    effective_ic: float  # IC adjusted for correlation


@dataclass
class EfficacyReport:
    """Complete efficacy report for all signals."""
    ticker: str
    market: str
    evaluation_date: date
    train_start: date
    train_end: date
    
    # Signal efficacies by regime
    efficacies: Dict[str, Dict[str, SignalEfficacy]]
    
    # UPGRADE: Signal independence analysis
    signal_correlations: List[SignalCorrelation]
    signal_contributions: List[SignalContribution]
    correlation_matrix: pd.DataFrame
    redundant_signal_groups: List[List[str]]
    
    # Meta
    n_walk_forward_folds: int
    total_train_days: int


# =============================================================================
# SIGNAL CORRELATION ANALYZER (UPGRADE)
# =============================================================================

class SignalCorrelationAnalyzer:
    """
    CRITICAL UPGRADE: Analyze signal independence.
    
    Institutions penalize correlated signals to avoid:
    1. Double-counting the same effect
    2. Inflated conviction from redundant signals
    3. False diversification of alpha sources
    """
    
    def __init__(self, min_correlation_threshold: float = 0.7):
        self.min_correlation_threshold = min_correlation_threshold
        self.correlation_matrix: Optional[pd.DataFrame] = None
        self.mutual_info_matrix: Optional[pd.DataFrame] = None
        
    def compute_correlations(
        self,
        signals_df: pd.DataFrame,
        signal_columns: List[str]
    ) -> pd.DataFrame:
        """Compute pairwise signal correlations."""
        available = [c for c in signal_columns if c in signals_df.columns]
        if len(available) < 2:
            return pd.DataFrame()
        
        signal_data = signals_df[available].dropna(axis=1, how='all')
        self.correlation_matrix = signal_data.corr(method='spearman')
        
        return self.correlation_matrix
    
    def compute_mutual_information(
        self,
        signals_df: pd.DataFrame,
        signal_columns: List[str]
    ) -> pd.DataFrame:
        """Compute mutual information between signals (nonlinear dependence)."""
        from sklearn.feature_selection import mutual_info_regression
        
        available = [c for c in signal_columns if c in signals_df.columns]
        if len(available) < 2:
            return pd.DataFrame()
        
        signal_data = signals_df[available].dropna()
        if len(signal_data) < 100:
            return pd.DataFrame()
        
        mi_matrix = pd.DataFrame(
            index=available,
            columns=available,
            dtype=float
        )
        
        for col1 in available:
            for col2 in available:
                if col1 == col2:
                    mi_matrix.loc[col1, col2] = 1.0
                elif pd.notna(mi_matrix.loc[col2, col1]):
                    mi_matrix.loc[col1, col2] = mi_matrix.loc[col2, col1]
                else:
                    try:
                        X = signal_data[[col1]].values
                        y = signal_data[col2].values
                        mi = mutual_info_regression(X, y, n_neighbors=5, random_state=42)[0]
                        # Normalize by max entropy
                        mi_normalized = min(mi / np.log(len(signal_data)), 1.0)
                        mi_matrix.loc[col1, col2] = mi_normalized
                    except:
                        mi_matrix.loc[col1, col2] = 0.0
        
        self.mutual_info_matrix = mi_matrix.astype(float)
        return self.mutual_info_matrix
    
    def identify_redundant_groups(
        self,
        threshold: float = 0.7
    ) -> List[List[str]]:
        """Identify groups of highly correlated (redundant) signals."""
        if self.correlation_matrix is None:
            return []
        
        from scipy.cluster.hierarchy import linkage, fcluster
        from scipy.spatial.distance import squareform
        
        try:
            # Convert correlation to distance
            distance_matrix = 1 - np.abs(self.correlation_matrix.values)
            np.fill_diagonal(distance_matrix, 0)
            
            # Hierarchical clustering
            condensed = squareform(distance_matrix)
            Z = linkage(condensed, method='average')
            
            # Cut tree at threshold
            clusters = fcluster(Z, t=1-threshold, criterion='distance')
            
            # Group signals by cluster
            groups = defaultdict(list)
            for signal, cluster in zip(self.correlation_matrix.columns, clusters):
                groups[cluster].append(signal)
            
            # Only return groups with >1 member (actual redundancy)
            redundant_groups = [sigs for sigs in groups.values() if len(sigs) > 1]
            
            return redundant_groups
        except Exception as e:
            logger.warning(f"Error identifying redundant groups: {e}")
            return []
    
    def compute_correlation_penalty(
        self,
        signal_name: str,
        signal_correlations: Dict[str, float]
    ) -> float:
        """
        CRITICAL: Compute penalty for correlated signals.
        
        effective_weight = raw_weight × (1 − correlation_penalty)
        """
        if not signal_correlations:
            return 0.0
        
        # Maximum correlation with other signals
        max_corr = max([abs(c) for c in signal_correlations.values()] + [0])
        
        # Penalty increases with correlation
        if max_corr > 0.8:
            penalty = 0.5  # Heavy penalty for near-duplicate signals
        elif max_corr > 0.6:
            penalty = 0.3
        elif max_corr > 0.4:
            penalty = 0.15
        else:
            penalty = 0.0
        
        return penalty
    
    def get_signal_correlations_detailed(self) -> List[SignalCorrelation]:
        """Get detailed correlation analysis for each signal pair."""
        if self.correlation_matrix is None:
            return []
        
        results = []
        signals = self.correlation_matrix.columns.tolist()
        
        for i, sig1 in enumerate(signals):
            for sig2 in signals[i+1:]:
                corr = self.correlation_matrix.loc[sig1, sig2]
                
                mi = 0.0
                if self.mutual_info_matrix is not None:
                    mi = self.mutual_info_matrix.loc[sig1, sig2]
                
                results.append(SignalCorrelation(
                    signal1=sig1,
                    signal2=sig2,
                    correlation=float(corr),
                    mutual_information=float(mi),
                    redundancy_score=float(abs(corr) * 0.6 + mi * 0.4),
                    correlation_stable=True  # Would need regime-split analysis
                ))
        
        return results


# =============================================================================
# SIGNAL EFFICACY MODEL
# =============================================================================

class SignalEfficacyModel:
    """
    Walk-forward validation of signal efficacy conditional on regimes.
    
    UPGRADED with:
    - Signal correlation penalty
    - Effective IC (correlation-adjusted)
    - Redundancy detection
    - SIGNAL FLOOR: Never drops to zero signals
    - SIGNAL REGISTRY: Dynamic signal discovery
    """
    
    # Signal floor: always keep at least this many signals
    MIN_SIGNALS_FLOOR = 5
    LOW_CONFIDENCE_IC_THRESHOLD = 0.03
    
    def __init__(self, config=None):
        self.config = config or DEFAULT_EFFICACY_CONFIG
        self.correlation_analyzer = SignalCorrelationAnalyzer()
        self.efficacy_cache: Dict[str, SignalEfficacy] = {}
        
        # Get signal registry
        self.signal_registry = get_signal_registry()
        
        # Override floor from config if available
        if hasattr(self.config, 'min_signals_floor'):
            self.MIN_SIGNALS_FLOOR = self.config.min_signals_floor
        if hasattr(self.config, 'low_confidence_ic_threshold'):
            self.LOW_CONFIDENCE_IC_THRESHOLD = self.config.low_confidence_ic_threshold
        
    def compute_forward_returns(
        self,
        prices: pd.Series,
        horizons: List[int] = None
    ) -> pd.DataFrame:
        """Compute forward returns for multiple horizons."""
        horizons = horizons or FORWARD_RETURN_HORIZONS
        
        returns_df = pd.DataFrame(index=prices.index)
        for h in horizons:
            returns_df[f'fwd_ret_{h}d'] = prices.shift(-h) / prices - 1
        
        return returns_df
    
    def compute_information_coefficient(
        self,
        signal: pd.Series,
        forward_returns: pd.Series
    ) -> float:
        """Compute Information Coefficient (rank correlation)."""
        valid_mask = ~(signal.isna() | forward_returns.isna())
        if valid_mask.sum() < 30:
            return np.nan
        
        ic = signal[valid_mask].corr(forward_returns[valid_mask], method='spearman')
        return float(ic)
    
    def evaluate_signal_regime(
        self,
        signals_df: pd.DataFrame,
        forward_returns_df: pd.DataFrame,
        signal_name: str,
        regime: str,
        regime_mask: pd.Series,
        horizon: int,
        signal_correlations: Dict[str, float] = None
    ) -> Optional[SignalEfficacy]:
        """
        Evaluate signal efficacy for a specific regime.
        
        UPGRADED: Includes correlation-adjusted metrics.
        """
        mask = regime_mask & ~signals_df[signal_name].isna()
        fwd_col = f'fwd_ret_{horizon}d'
        
        if fwd_col not in forward_returns_df.columns:
            return None
        
        mask = mask & ~forward_returns_df[fwd_col].isna()
        n_obs = mask.sum()
        
        if n_obs < self.config.min_observations:
            return None
        
        signal = signals_df.loc[mask, signal_name]
        fwd_ret = forward_returns_df.loc[mask, fwd_col]
        
        # Raw IC
        ic = self.compute_information_coefficient(signal, fwd_ret)
        
        # UPGRADE: Correlation penalty
        signal_correlations = signal_correlations or {}
        correlation_penalty = self.correlation_analyzer.compute_correlation_penalty(
            signal_name, signal_correlations
        )
        effective_ic = ic * (1 - correlation_penalty) if not np.isnan(ic) else np.nan
        
        # Hit rate (directional accuracy)
        signal_positive = signal > signal.median()
        return_positive = fwd_ret > 0
        hit_rate = (signal_positive == return_positive).mean()
        
        # Return distribution
        percentiles = [10, 25, 50, 75, 90]
        pcts = np.percentile(fwd_ret, percentiles)
        
        # Returns by signal quintile
        signal_quintiles = pd.qcut(signal, 5, labels=False, duplicates='drop')
        quintile_sharpes = []
        
        for q in range(5):
            q_mask = signal_quintiles == q
            if q_mask.sum() > 10:
                q_returns = fwd_ret[q_mask]
                q_sharpe = q_returns.mean() / (q_returns.std() + 1e-6) * np.sqrt(252/horizon)
                quintile_sharpes.append(float(q_sharpe))
            else:
                quintile_sharpes.append(np.nan)
        
        # Returns when signal is high/low
        high_signal = signal > signal.quantile(0.7)
        low_signal = signal < signal.quantile(0.3)
        
        mean_ret_high = fwd_ret[high_signal].mean() if high_signal.sum() > 10 else np.nan
        mean_ret_low = fwd_ret[low_signal].mean() if low_signal.sum() > 10 else np.nan
        
        # Max drawdown during high signal periods
        if high_signal.sum() > 10:
            high_cumret = (1 + fwd_ret[high_signal]).cumprod()
            peak = high_cumret.expanding().max()
            drawdown = (high_cumret / peak - 1).min()
        else:
            drawdown = np.nan
        
        return SignalEfficacy(
            signal_name=signal_name,
            regime=regime,
            horizon=horizon,
            n_observations=int(n_obs),
            hit_rate=float(hit_rate),
            information_coefficient=float(ic) if not np.isnan(ic) else 0.0,
            mean_return_when_positive=float(mean_ret_high) if not np.isnan(mean_ret_high) else 0.0,
            mean_return_when_negative=float(mean_ret_low) if not np.isnan(mean_ret_low) else 0.0,
            forward_return_p10=float(pcts[0]),
            forward_return_p25=float(pcts[1]),
            forward_return_p50=float(pcts[2]),
            forward_return_p75=float(pcts[3]),
            forward_return_p90=float(pcts[4]),
            forward_return_mean=float(fwd_ret.mean()),
            forward_return_std=float(fwd_ret.std()),
            sharpe_by_quintile=quintile_sharpes,
            max_drawdown=float(drawdown) if not np.isnan(drawdown) else 0.0,
            correlation_with_other_signals=signal_correlations,
            correlation_penalty=correlation_penalty,
            effective_ic=float(effective_ic) if not np.isnan(effective_ic) else 0.0
        )
    
    def walk_forward_evaluate(
        self,
        signals_df: pd.DataFrame,
        prices: pd.Series,
        regimes: pd.Series,
        signal_columns: List[str] = None,
        horizons: List[int] = None
    ) -> EfficacyReport:
        """
        Walk-forward validation of signal efficacy.
        
        UPGRADED: 
        - Includes correlation analysis across signals
        - Dynamic signal discovery via registry
        - Regime-weighted signal admission
        """
        horizons = horizons or FORWARD_RETURN_HORIZONS
        
        # SIGNAL REGISTRY: Discover signals dynamically from data
        if signal_columns is None:
            discovered_signals = self.signal_registry.discover_signals_from_dataframe(signals_df)
            signal_columns = discovered_signals
            logger.info(f"Discovered {len(signal_columns)} signals via registry")
        
        # Filter to only columns that exist
        signal_columns = [c for c in signal_columns if c in signals_df.columns]
        
        if not signal_columns:
            logger.warning("No signal columns found in data")
            signal_columns = []
        
        # Compute forward returns
        forward_returns_df = self.compute_forward_returns(prices, horizons)
        
        # Align everything
        common_idx = signals_df.index.intersection(forward_returns_df.index).intersection(regimes.index)
        signals_df = signals_df.loc[common_idx]
        forward_returns_df = forward_returns_df.loc[common_idx]
        regimes = regimes.loc[common_idx]
        
        # UPGRADE: Signal correlation analysis
        self.correlation_analyzer.compute_correlations(signals_df, signal_columns)
        self.correlation_analyzer.compute_mutual_information(signals_df, signal_columns)
        redundant_groups = self.correlation_analyzer.identify_redundant_groups()
        signal_correlations_detailed = self.correlation_analyzer.get_signal_correlations_detailed()
        
        # Get signal correlations for penalty calculation
        signal_corr_lookup = {}
        if self.correlation_analyzer.correlation_matrix is not None:
            for sig in signal_columns:
                if sig in self.correlation_analyzer.correlation_matrix.columns:
                    signal_corr_lookup[sig] = {
                        other: float(self.correlation_analyzer.correlation_matrix.loc[sig, other])
                        for other in self.correlation_analyzer.correlation_matrix.columns
                        if other != sig
                    }
        
        # Walk-forward evaluation
        unique_regimes = regimes.dropna().unique()
        
        # Minimum 1 year training, 3 month test
        train_window = self.config.train_window_days
        test_window = self.config.test_window_days
        
        efficacies: Dict[str, Dict[str, SignalEfficacy]] = defaultdict(dict)
        n_folds = 0
        
        # Sliding window
        total_days = len(common_idx)
        start_idx = 0
        
        while start_idx + train_window + test_window <= total_days:
            train_end_idx = start_idx + train_window
            test_end_idx = train_end_idx + test_window
            
            train_mask = pd.Series(False, index=common_idx)
            train_mask.iloc[start_idx:train_end_idx] = True
            
            for regime in unique_regimes:
                regime_mask = (regimes == regime) & train_mask
                
                for signal in signal_columns:
                    if signal not in signals_df.columns:
                        continue
                    
                    for horizon in horizons:
                        efficacy = self.evaluate_signal_regime(
                            signals_df, forward_returns_df,
                            signal, regime, regime_mask, horizon,
                            signal_corr_lookup.get(signal, {})
                        )
                        
                        if efficacy:
                            key = f"{signal}_{horizon}d"
                            if key not in efficacies[regime]:
                                efficacies[regime][key] = efficacy
                            else:
                                # Average with existing
                                existing = efficacies[regime][key]
                                efficacies[regime][key] = self._average_efficacies(existing, efficacy)
            
            n_folds += 1
            start_idx += test_window
        
        # Compute signal contributions
        signal_contributions = self._compute_signal_contributions(
            efficacies, signal_corr_lookup, regimes.value_counts().to_dict()
        )
        
        # Get most recent regime for floor signal selection
        current_regime = regimes.iloc[-1] if len(regimes) > 0 else 'recovery'
        
        # SIGNAL FLOOR: Ensure we never drop below minimum signals
        signal_contributions = self._ensure_signal_floor(
            signal_contributions, signals_df, signal_columns, current_regime
        )
        
        dates = signals_df.index
        
        return EfficacyReport(
            ticker='',  # Set by caller
            market='',
            evaluation_date=date.today(),
            train_start=dates.min().date() if len(dates) > 0 else date.today(),
            train_end=dates.max().date() if len(dates) > 0 else date.today(),
            efficacies=dict(efficacies),
            signal_correlations=signal_correlations_detailed,
            signal_contributions=signal_contributions,
            correlation_matrix=self.correlation_analyzer.correlation_matrix if self.correlation_analyzer.correlation_matrix is not None else pd.DataFrame(),
            redundant_signal_groups=redundant_groups,
            n_walk_forward_folds=n_folds,
            total_train_days=int(total_days)
        )
    
    def _average_efficacies(
        self,
        e1: SignalEfficacy,
        e2: SignalEfficacy
    ) -> SignalEfficacy:
        """Average two efficacy measurements."""
        n1, n2 = e1.n_observations, e2.n_observations
        w1, w2 = n1 / (n1 + n2), n2 / (n1 + n2)
        
        return SignalEfficacy(
            signal_name=e1.signal_name,
            regime=e1.regime,
            horizon=e1.horizon,
            n_observations=n1 + n2,
            hit_rate=w1 * e1.hit_rate + w2 * e2.hit_rate,
            information_coefficient=w1 * e1.information_coefficient + w2 * e2.information_coefficient,
            mean_return_when_positive=w1 * e1.mean_return_when_positive + w2 * e2.mean_return_when_positive,
            mean_return_when_negative=w1 * e1.mean_return_when_negative + w2 * e2.mean_return_when_negative,
            forward_return_p10=w1 * e1.forward_return_p10 + w2 * e2.forward_return_p10,
            forward_return_p25=w1 * e1.forward_return_p25 + w2 * e2.forward_return_p25,
            forward_return_p50=w1 * e1.forward_return_p50 + w2 * e2.forward_return_p50,
            forward_return_p75=w1 * e1.forward_return_p75 + w2 * e2.forward_return_p75,
            forward_return_p90=w1 * e1.forward_return_p90 + w2 * e2.forward_return_p90,
            forward_return_mean=w1 * e1.forward_return_mean + w2 * e2.forward_return_mean,
            forward_return_std=np.sqrt(w1 * e1.forward_return_std**2 + w2 * e2.forward_return_std**2),
            sharpe_by_quintile=[
                w1 * s1 + w2 * s2 if not (np.isnan(s1) or np.isnan(s2)) else np.nan
                for s1, s2 in zip(e1.sharpe_by_quintile, e2.sharpe_by_quintile)
            ],
            max_drawdown=min(e1.max_drawdown, e2.max_drawdown),
            correlation_with_other_signals=e1.correlation_with_other_signals,
            correlation_penalty=e1.correlation_penalty,
            effective_ic=w1 * e1.effective_ic + w2 * e2.effective_ic
        )
    
    def _compute_signal_contributions(
        self,
        efficacies: Dict[str, Dict[str, SignalEfficacy]],
        signal_correlations: Dict[str, Dict[str, float]],
        regime_counts: Dict[str, int]
    ) -> List[SignalContribution]:
        """
        UPGRADE: Compute correlation-penalized signal contributions.
        
        This prevents double-counting of correlated signals.
        """
        contributions = []
        signal_ic_by_regime = defaultdict(dict)
        
        # Collect ICs
        for regime, signals_dict in efficacies.items():
            for key, efficacy in signals_dict.items():
                signal = efficacy.signal_name
                signal_ic_by_regime[signal][regime] = efficacy.information_coefficient
        
        total_regime_weight = sum(regime_counts.values())
        
        for signal, regime_ics in signal_ic_by_regime.items():
            # Weighted average IC across regimes
            raw_contribution = sum(
                ic * regime_counts.get(regime, 0) / total_regime_weight
                for regime, ic in regime_ics.items()
            )
            
            # Correlation penalty
            corr_penalty = 0.0
            if signal in signal_correlations:
                max_corr = max([abs(c) for c in signal_correlations[signal].values()] + [0])
                if max_corr > 0.7:
                    corr_penalty = 0.4
                elif max_corr > 0.5:
                    corr_penalty = 0.2
                elif max_corr > 0.3:
                    corr_penalty = 0.1
            
            effective_contribution = raw_contribution * (1 - corr_penalty)
            
            # Best regime for this signal
            best_regime = max(regime_ics, key=regime_ics.get) if regime_ics else 'unknown'
            
            # Consistency: std of IC across regimes
            if len(regime_ics) > 1:
                consistency = 1 - np.std(list(regime_ics.values()))
            else:
                consistency = 0.5
            
            contributions.append(SignalContribution(
                signal_name=signal,
                raw_contribution=float(raw_contribution),
                correlation_penalty=float(corr_penalty),
                effective_contribution=float(effective_contribution),
                primary_regime=best_regime,
                consistency_score=float(consistency)
            ))
        
        # Sort by effective contribution
        contributions.sort(key=lambda x: x.effective_contribution, reverse=True)
        
        return contributions
    
    def _ensure_signal_floor(
        self,
        contributions: List[SignalContribution],
        signals_df: pd.DataFrame,
        signal_columns: List[str],
        current_regime: str = 'recovery'
    ) -> List[SignalContribution]:
        """
        SIGNAL FLOOR: Ensure we never drop below minimum signals.
        
        UPGRADED with regime-weighted signal admission:
        - Uses signal registry to get floor signals
        - Weights signals by regime appropriateness
        - Marks floor-admitted signals as low-confidence
        
        Institutional logic: "Having no view is worse than having 
        a low-confidence view that we can monitor."
        """
        if len(contributions) >= self.MIN_SIGNALS_FLOOR:
            return contributions
        
        # Create fallback contributions for missing signals
        existing_signals = {c.signal_name for c in contributions}
        
        # Get all signals actually in the dataframe
        available_signals = [c for c in signal_columns if c in signals_df.columns]
        
        logger.debug(f"Floor check: {len(contributions)} existing, {len(available_signals)} available")
        
        # Try registry-based floor signals first
        floor_signals = self.signal_registry.get_floor_signals(
            regime=current_regime,
            available_signals=available_signals,
            min_total=self.MIN_SIGNALS_FLOOR
        )
        
        # If registry returns nothing, use all available signals
        if not floor_signals:
            logger.debug(f"Registry returned no floor signals, using all available")
            floor_signals = available_signals
        
        # Get regime weights for contribution scoring
        regime_weights = self.signal_registry.get_signal_weights_for_regime(
            current_regime, available_signals
        )
        
        floor_added = 0
        for signal in floor_signals:
            if signal in existing_signals:
                continue
            
            # Check signal exists in dataframe
            if signal not in signals_df.columns:
                continue
            
            # Relaxed data requirement for floor signals
            signal_data = signals_df[signal].dropna()
            if len(signal_data) < 10:  # Reduced from 20 for floor
                logger.debug(f"Signal {signal} has only {len(signal_data)} data points")
                continue
            
            # Get regime weight for this signal
            regime_weight = regime_weights.get(signal, 0.5)
            
            # Low-confidence contribution scaled by regime appropriateness
            # Floor signals get lower base contribution
            base_contribution = 0.005  # Lower than normal
            effective = base_contribution * regime_weight
            
            contributions.append(SignalContribution(
                signal_name=signal,
                raw_contribution=base_contribution,
                correlation_penalty=0.0,
                effective_contribution=effective,
                primary_regime=current_regime,
                consistency_score=0.25 * regime_weight  # Marked as floor-admitted
            ))
            floor_added += 1
            
            if len(contributions) >= self.MIN_SIGNALS_FLOOR:
                break
        
        # GUARANTEE: If still under floor, add ANY available signals
        if len(contributions) < self.MIN_SIGNALS_FLOOR:
            for signal in available_signals:
                if signal in {c.signal_name for c in contributions}:
                    continue
                if signal not in signals_df.columns:
                    continue
                
                contributions.append(SignalContribution(
                    signal_name=signal,
                    raw_contribution=0.001,  # Minimal
                    correlation_penalty=0.0,
                    effective_contribution=0.001,
                    primary_regime='floor_fallback',
                    consistency_score=0.1  # Very low confidence
                ))
                floor_added += 1
                
                if len(contributions) >= self.MIN_SIGNALS_FLOOR:
                    break
        
        # Log results
        if len(contributions) < self.MIN_SIGNALS_FLOOR:
            logger.warning(
                f"Signal floor not met: only {len(contributions)} signals "
                f"(minimum: {self.MIN_SIGNALS_FLOOR}) for regime '{current_regime}'. "
                f"Available signals: {available_signals}"
            )
        else:
            logger.info(
                f"Signal floor applied: {len(contributions)} signals "
                f"({floor_added} floor-admitted for regime '{current_regime}')"
            )
        
        return contributions
    
    def get_effective_signal_weights(
        self,
        contributions: List[SignalContribution]
    ) -> Dict[str, float]:
        """
        Get final signal weights after correlation penalty.
        
        Sum to 1.0, used for combining signals in probability engine.
        """
        total = sum(max(0, c.effective_contribution) for c in contributions)
        
        if total == 0:
            # Equal weight fallback
            return {c.signal_name: 1/len(contributions) for c in contributions}
        
        return {
            c.signal_name: max(0, c.effective_contribution) / total
            for c in contributions
        }
    
    def get_best_signals_per_regime(
        self,
        efficacies: Dict[str, Dict[str, SignalEfficacy]],
        top_n: int = 5
    ) -> Dict[str, List[Tuple[str, float]]]:
        """Get top signals for each regime by effective IC."""
        best = {}
        
        for regime, signals_dict in efficacies.items():
            # Sort by effective IC
            sorted_signals = sorted(
                [(e.signal_name, e.effective_ic) for e in signals_dict.values()],
                key=lambda x: abs(x[1]),
                reverse=True
            )
            best[regime] = sorted_signals[:top_n]
        
        return best


# =============================================================================
# UTILITIES
# =============================================================================

def run_efficacy_analysis(
    ticker: str,
    market: str,
    signals_df: pd.DataFrame,
    prices: pd.Series,
    regimes: pd.Series
) -> EfficacyReport:
    """Run complete efficacy analysis for a ticker."""
    model = SignalEfficacyModel()
    
    report = model.walk_forward_evaluate(signals_df, prices, regimes)
    report.ticker = ticker
    report.market = market
    
    return report


def summarize_signal_independence(report: EfficacyReport) -> Dict[str, Any]:
    """Summarize signal independence analysis."""
    return {
        'total_signals': len(report.signal_contributions),
        'redundant_groups': len(report.redundant_signal_groups),
        'highly_correlated_pairs': sum(
            1 for c in report.signal_correlations if abs(c.correlation) > 0.7
        ),
        'top_independent_signals': [
            c.signal_name for c in report.signal_contributions[:5]
        ],
        'average_correlation_penalty': np.mean([
            c.correlation_penalty for c in report.signal_contributions
        ]),
        'effective_vs_raw_ratio': (
            sum(c.effective_contribution for c in report.signal_contributions) /
            sum(c.raw_contribution for c in report.signal_contributions)
            if sum(c.raw_contribution for c in report.signal_contributions) > 0 else 1.0
        )
    }


def get_signal_recommendation(
    contributions: List[SignalContribution],
    regime: str
) -> Dict[str, Any]:
    """Get signal usage recommendations for a regime."""
    # Filter to signals that work well in this regime
    regime_signals = [c for c in contributions if c.primary_regime == regime]
    
    # Recommend avoiding highly penalized signals
    penalized = [c for c in contributions if c.correlation_penalty > 0.3]
    
    return {
        'recommended_signals': [c.signal_name for c in regime_signals[:5]],
        'signals_to_downweight': [c.signal_name for c in penalized],
        'signal_weights': {
            c.signal_name: c.effective_contribution / sum(
                x.effective_contribution for x in regime_signals
            ) if sum(x.effective_contribution for x in regime_signals) > 0 else 0
            for c in regime_signals[:5]
        }
    }
