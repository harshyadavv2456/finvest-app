"""
Signal Efficacy Trainer
=======================

This module learns historical signal performance by regime and horizon.

For each signal × regime × horizon, we compute:
- IC (Information Coefficient): Rank correlation between signal and forward return
- Hit Rate: % of times signal direction matched return direction
- Avg Return When Correct: Mean return when signal predicted correctly
- Avg Loss When Wrong: Mean return when signal predicted incorrectly
- Sharpe by Quintile: Returns stratified by signal quintile
- Decay Speed: How quickly signal edge deteriorates over time

This is NOT prediction. This is statistical characterization of historical relationships.

Output: signal_efficacy.parquet
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from pathlib import Path
import logging
from scipy.stats import spearmanr, pearsonr
import warnings

warnings.filterwarnings('ignore')

from .config import MODEL_OUTPUT_DIR, FORWARD_RETURN_HORIZONS
from .signal_registry import get_signal_registry, SignalType

logger = logging.getLogger(__name__)


# =============================================================================
# EFFICACY DATA STRUCTURES
# =============================================================================

@dataclass
class SignalEfficacyStats:
    """Learned efficacy statistics for a signal-regime-horizon combination."""
    signal_name: str
    regime: str
    horizon_days: int
    
    # Core metrics
    n_observations: int
    information_coefficient: float  # Spearman rank corr
    pearson_ic: float               # Linear correlation
    hit_rate: float                 # % correct direction
    
    # Return characteristics
    avg_return_correct: float       # Mean return when signal was right
    avg_return_wrong: float         # Mean return when signal was wrong
    edge_ratio: float               # avg_correct / abs(avg_wrong)
    
    # Distribution metrics
    return_mean: float
    return_std: float
    return_p10: float
    return_p25: float
    return_p50: float
    return_p75: float
    return_p90: float
    return_skew: float
    
    # Quintile analysis
    quintile_returns: List[float]   # [Q1, Q2, Q3, Q4, Q5] avg returns
    quintile_sharpe: List[float]    # Sharpe ratio by quintile
    
    # Decay analysis
    decay_5d: float                 # IC at 5 days
    decay_10d: float                # IC at 10 days
    decay_20d: float                # IC at 20 days
    half_life_days: Optional[int]   # Days until IC drops to 50%
    
    # Confidence
    statistical_significance: float  # p-value of IC
    confidence_score: float          # Composite confidence (0-1)
    
    # Training metadata
    train_start: date
    train_end: date
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'signal_name': self.signal_name,
            'regime': self.regime,
            'horizon_days': self.horizon_days,
            'n_observations': self.n_observations,
            'information_coefficient': self.information_coefficient,
            'pearson_ic': self.pearson_ic,
            'hit_rate': self.hit_rate,
            'avg_return_correct': self.avg_return_correct,
            'avg_return_wrong': self.avg_return_wrong,
            'edge_ratio': self.edge_ratio,
            'return_mean': self.return_mean,
            'return_std': self.return_std,
            'return_p10': self.return_p10,
            'return_p25': self.return_p25,
            'return_p50': self.return_p50,
            'return_p75': self.return_p75,
            'return_p90': self.return_p90,
            'return_skew': self.return_skew,
            'quintile_returns': self.quintile_returns,
            'quintile_sharpe': self.quintile_sharpe,
            'decay_5d': self.decay_5d,
            'decay_10d': self.decay_10d,
            'decay_20d': self.decay_20d,
            'half_life_days': self.half_life_days,
            'statistical_significance': self.statistical_significance,
            'confidence_score': self.confidence_score,
            'train_start': self.train_start,
            'train_end': self.train_end,
        }


# =============================================================================
# EFFICACY TRAINER
# =============================================================================

class SignalEfficacyTrainer:
    """
    Trains signal efficacy models from historical data.
    
    For each signal, learns:
    - How predictive is it in each regime?
    - Over what horizons?
    - What's the decay curve?
    - What's the confidence level?
    """
    
    DEFAULT_HORIZONS = [5, 10, 20, 60]
    MIN_OBSERVATIONS = 30  # Minimum samples for valid statistics
    
    def __init__(self, horizons: List[int] = None):
        self.horizons = horizons or self.DEFAULT_HORIZONS
        self.registry = get_signal_registry()
        self.efficacy_stats: List[SignalEfficacyStats] = []
        
    def compute_forward_returns(
        self,
        prices: pd.Series,
        horizons: List[int] = None
    ) -> pd.DataFrame:
        """Compute forward returns for multiple horizons."""
        horizons = horizons or self.horizons
        
        returns_df = pd.DataFrame(index=prices.index)
        for h in horizons:
            # Forward return = (price at t+h / price at t) - 1
            returns_df[f'fwd_ret_{h}d'] = prices.shift(-h) / prices - 1
        
        return returns_df
    
    def compute_signal_ic(
        self,
        signal_values: pd.Series,
        forward_returns: pd.Series
    ) -> Tuple[float, float]:
        """
        Compute Information Coefficient (Spearman rank correlation).
        
        Returns: (ic, p_value)
        """
        # Align and drop NaN
        combined = pd.concat([signal_values, forward_returns], axis=1).dropna()
        
        if len(combined) < self.MIN_OBSERVATIONS:
            return 0.0, 1.0
        
        try:
            ic, p_value = spearmanr(combined.iloc[:, 0], combined.iloc[:, 1])
            return float(ic) if not np.isnan(ic) else 0.0, float(p_value)
        except Exception:
            return 0.0, 1.0
    
    def compute_hit_rate(
        self,
        signal_values: pd.Series,
        forward_returns: pd.Series,
        signal_direction: str = 'positive'
    ) -> float:
        """
        Compute hit rate: % of times signal direction matched return direction.
        
        signal_direction: 'positive' means higher signal = higher return expected
        """
        combined = pd.concat([signal_values, forward_returns], axis=1).dropna()
        
        if len(combined) < self.MIN_OBSERVATIONS:
            return 0.5
        
        signal_col = combined.iloc[:, 0]
        return_col = combined.iloc[:, 1]
        
        # Compute median to determine "high" vs "low" signal
        signal_median = signal_col.median()
        
        if signal_direction == 'positive':
            # High signal should predict positive return
            correct = ((signal_col > signal_median) & (return_col > 0)) | \
                     ((signal_col <= signal_median) & (return_col <= 0))
        else:
            # High signal should predict negative return
            correct = ((signal_col > signal_median) & (return_col < 0)) | \
                     ((signal_col <= signal_median) & (return_col >= 0))
        
        return float(correct.mean())
    
    def compute_quintile_returns(
        self,
        signal_values: pd.Series,
        forward_returns: pd.Series
    ) -> Tuple[List[float], List[float]]:
        """
        Compute average returns and Sharpe by signal quintile.
        
        Returns: (quintile_returns, quintile_sharpes)
        """
        combined = pd.concat([signal_values, forward_returns], axis=1).dropna()
        
        if len(combined) < 50:  # Need decent sample for quintiles
            return [0.0] * 5, [0.0] * 5
        
        combined.columns = ['signal', 'return']
        
        # Assign quintiles
        try:
            combined['quintile'] = pd.qcut(
                combined['signal'], 
                q=5, 
                labels=['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
                duplicates='drop'
            )
        except ValueError:
            # Not enough unique values for quintiles
            return [0.0] * 5, [0.0] * 5
        
        # Compute stats by quintile
        quintile_stats = combined.groupby('quintile')['return'].agg(['mean', 'std', 'count'])
        
        quintile_returns = []
        quintile_sharpes = []
        
        for q in ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']:
            if q in quintile_stats.index:
                avg_ret = quintile_stats.loc[q, 'mean']
                std_ret = quintile_stats.loc[q, 'std']
                quintile_returns.append(float(avg_ret) if not np.isnan(avg_ret) else 0.0)
                
                # Annualized Sharpe (assuming 20-day returns)
                if std_ret > 0:
                    sharpe = (avg_ret / std_ret) * np.sqrt(252 / 20)
                else:
                    sharpe = 0.0
                quintile_sharpes.append(float(sharpe) if not np.isnan(sharpe) else 0.0)
            else:
                quintile_returns.append(0.0)
                quintile_sharpes.append(0.0)
        
        return quintile_returns, quintile_sharpes
    
    def compute_decay_curve(
        self,
        signal_values: pd.Series,
        prices: pd.Series,
        max_horizon: int = 60
    ) -> Dict[int, float]:
        """
        Compute IC decay over multiple horizons.
        
        Returns: {horizon_days: ic}
        """
        decay = {}
        
        for h in [5, 10, 20, 40, 60]:
            if h > max_horizon:
                break
            
            fwd_ret = prices.shift(-h) / prices - 1
            ic, _ = self.compute_signal_ic(signal_values, fwd_ret)
            decay[h] = ic
        
        return decay
    
    def estimate_half_life(self, decay_curve: Dict[int, float]) -> Optional[int]:
        """
        Estimate half-life of IC decay.
        
        Returns number of days until IC drops to 50% of initial.
        """
        if not decay_curve:
            return None
        
        sorted_horizons = sorted(decay_curve.keys())
        if len(sorted_horizons) < 2:
            return None
        
        initial_ic = abs(decay_curve[sorted_horizons[0]])
        if initial_ic < 0.01:
            return None
        
        target_ic = initial_ic * 0.5
        
        for h in sorted_horizons:
            if abs(decay_curve[h]) <= target_ic:
                return h
        
        return None
    
    def compute_edge_metrics(
        self,
        signal_values: pd.Series,
        forward_returns: pd.Series,
        signal_direction: str = 'positive'
    ) -> Tuple[float, float, float]:
        """
        Compute edge metrics: avg return when correct, wrong, and ratio.
        
        Returns: (avg_correct, avg_wrong, edge_ratio)
        """
        combined = pd.concat([signal_values, forward_returns], axis=1).dropna()
        
        if len(combined) < self.MIN_OBSERVATIONS:
            return 0.0, 0.0, 1.0
        
        signal_col = combined.iloc[:, 0]
        return_col = combined.iloc[:, 1]
        signal_median = signal_col.median()
        
        if signal_direction == 'positive':
            high_signal = signal_col > signal_median
        else:
            high_signal = signal_col <= signal_median
        
        # Returns when signal was "high" (expecting positive)
        returns_high = return_col[high_signal]
        returns_low = return_col[~high_signal]
        
        # Correct = high signal and positive return, OR low signal and negative return
        avg_correct = returns_high[returns_high > 0].mean() if len(returns_high[returns_high > 0]) > 0 else 0.0
        avg_wrong = returns_high[returns_high <= 0].mean() if len(returns_high[returns_high <= 0]) > 0 else 0.0
        
        if np.isnan(avg_correct):
            avg_correct = 0.0
        if np.isnan(avg_wrong):
            avg_wrong = 0.0
        
        # Edge ratio: how much better is correct vs wrong
        if abs(avg_wrong) > 0.0001:
            edge_ratio = avg_correct / abs(avg_wrong)
        else:
            edge_ratio = 1.0
        
        return float(avg_correct), float(avg_wrong), float(edge_ratio)
    
    def compute_confidence_score(
        self,
        ic: float,
        p_value: float,
        n_obs: int,
        hit_rate: float,
        edge_ratio: float
    ) -> float:
        """
        Compute composite confidence score (0-1).
        
        Factors:
        - Statistical significance (p-value)
        - Sample size
        - IC magnitude
        - Hit rate above 50%
        - Edge ratio > 1
        """
        score = 0.0
        
        # IC magnitude (up to 0.25 points)
        score += min(abs(ic) * 2.5, 0.25)
        
        # Statistical significance (up to 0.25 points)
        if p_value < 0.01:
            score += 0.25
        elif p_value < 0.05:
            score += 0.15
        elif p_value < 0.10:
            score += 0.05
        
        # Sample size (up to 0.20 points)
        if n_obs >= 500:
            score += 0.20
        elif n_obs >= 200:
            score += 0.15
        elif n_obs >= 100:
            score += 0.10
        elif n_obs >= 50:
            score += 0.05
        
        # Hit rate above 50% (up to 0.15 points)
        hit_edge = max(0, hit_rate - 0.5)
        score += min(hit_edge * 1.5, 0.15)
        
        # Edge ratio > 1 (up to 0.15 points)
        if edge_ratio > 1.5:
            score += 0.15
        elif edge_ratio > 1.2:
            score += 0.10
        elif edge_ratio > 1.0:
            score += 0.05
        
        return min(score, 1.0)
    
    def train_signal_regime(
        self,
        signal_name: str,
        signal_values: pd.Series,
        prices: pd.Series,
        regimes: pd.Series,
        regime: str,
        horizon: int
    ) -> Optional[SignalEfficacyStats]:
        """
        Train efficacy statistics for a single signal-regime-horizon combination.
        """
        # Align indices first
        common_idx = signal_values.index.intersection(regimes.index).intersection(prices.index)
        
        if len(common_idx) < self.MIN_OBSERVATIONS:
            return None
        
        signal_aligned = signal_values.loc[common_idx]
        regimes_aligned = regimes.loc[common_idx]
        prices_aligned = prices.loc[common_idx]
        
        # Filter to regime
        regime_mask = regimes_aligned == regime
        signal_regime = signal_aligned[regime_mask]
        prices_regime = prices_aligned[regime_mask]
        
        if len(signal_regime) < self.MIN_OBSERVATIONS:
            return None
        
        # Compute forward returns
        fwd_ret = prices_regime.shift(-horizon) / prices_regime - 1
        
        # Drop NaN for aligned analysis
        valid_mask = ~(signal_regime.isna() | fwd_ret.isna())
        signal_valid = signal_regime[valid_mask]
        fwd_valid = fwd_ret[valid_mask]
        
        if len(signal_valid) < self.MIN_OBSERVATIONS:
            return None
        
        # Get signal direction from registry
        signal_info = self.registry.get_signal_info(signal_name)
        signal_direction = 'positive'
        if signal_info and signal_info.direction.value == 'negative':
            signal_direction = 'negative'
        
        # Compute all metrics
        ic, p_value = self.compute_signal_ic(signal_valid, fwd_valid)
        pearson_ic, _ = self.compute_signal_ic(signal_valid, fwd_valid)  # Use same for now
        
        try:
            pearson_ic, _ = pearsonr(signal_valid, fwd_valid)
        except Exception:
            pearson_ic = 0.0
        
        hit_rate = self.compute_hit_rate(signal_valid, fwd_valid, signal_direction)
        quintile_returns, quintile_sharpes = self.compute_quintile_returns(signal_valid, fwd_valid)
        avg_correct, avg_wrong, edge_ratio = self.compute_edge_metrics(signal_valid, fwd_valid, signal_direction)
        
        # Decay curve
        decay = self.compute_decay_curve(signal_regime, prices_regime)
        half_life = self.estimate_half_life(decay)
        
        # Distribution metrics
        return_mean = float(fwd_valid.mean())
        return_std = float(fwd_valid.std())
        
        try:
            from scipy.stats import skew
            return_skew = float(skew(fwd_valid.dropna()))
        except Exception:
            return_skew = 0.0
        
        percentiles = fwd_valid.quantile([0.10, 0.25, 0.50, 0.75, 0.90]).values
        
        # Confidence score
        confidence = self.compute_confidence_score(ic, p_value, len(signal_valid), hit_rate, edge_ratio)
        
        # Get dates
        dates = signal_valid.index
        train_start = dates.min().date() if hasattr(dates.min(), 'date') else dates.min()
        train_end = dates.max().date() if hasattr(dates.max(), 'date') else dates.max()
        
        return SignalEfficacyStats(
            signal_name=signal_name,
            regime=regime,
            horizon_days=horizon,
            n_observations=len(signal_valid),
            information_coefficient=ic,
            pearson_ic=float(pearson_ic) if not np.isnan(pearson_ic) else 0.0,
            hit_rate=hit_rate,
            avg_return_correct=avg_correct,
            avg_return_wrong=avg_wrong,
            edge_ratio=edge_ratio,
            return_mean=return_mean,
            return_std=return_std,
            return_p10=float(percentiles[0]),
            return_p25=float(percentiles[1]),
            return_p50=float(percentiles[2]),
            return_p75=float(percentiles[3]),
            return_p90=float(percentiles[4]),
            return_skew=return_skew,
            quintile_returns=quintile_returns,
            quintile_sharpe=quintile_sharpes,
            decay_5d=decay.get(5, 0.0),
            decay_10d=decay.get(10, 0.0),
            decay_20d=decay.get(20, 0.0),
            half_life_days=half_life,
            statistical_significance=p_value,
            confidence_score=confidence,
            train_start=train_start,
            train_end=train_end
        )
    
    def train_all(
        self,
        signals_df: pd.DataFrame,
        prices: pd.Series,
        regimes: pd.Series,
        signal_columns: List[str] = None,
        horizons: List[int] = None,
        regimes_to_train: List[str] = None
    ) -> List[SignalEfficacyStats]:
        """
        Train efficacy for all signals × regimes × horizons.
        
        This is the main training loop.
        """
        horizons = horizons or self.horizons
        regimes_to_train = regimes_to_train or regimes.dropna().unique().tolist()
        
        # Discover signals from data
        if signal_columns is None:
            signal_columns = self.registry.discover_signals_from_dataframe(signals_df)
        
        logger.info(f"Training efficacy for {len(signal_columns)} signals × "
                   f"{len(regimes_to_train)} regimes × {len(horizons)} horizons")
        
        self.efficacy_stats = []
        total_combos = len(signal_columns) * len(regimes_to_train) * len(horizons)
        trained = 0
        
        for signal_name in signal_columns:
            if signal_name not in signals_df.columns:
                continue
            
            signal_values = signals_df[signal_name]
            
            for regime in regimes_to_train:
                for horizon in horizons:
                    stats = self.train_signal_regime(
                        signal_name=signal_name,
                        signal_values=signal_values,
                        prices=prices,
                        regimes=regimes,
                        regime=regime,
                        horizon=horizon
                    )
                    
                    if stats is not None:
                        self.efficacy_stats.append(stats)
                        trained += 1
        
        logger.info(f"Trained {trained}/{total_combos} signal-regime-horizon combinations")
        
        return self.efficacy_stats
    
    def to_dataframe(self) -> pd.DataFrame:
        """Convert efficacy stats to DataFrame."""
        if not self.efficacy_stats:
            return pd.DataFrame()
        
        records = [s.to_dict() for s in self.efficacy_stats]
        df = pd.DataFrame(records)
        
        # Convert list columns to string for parquet compatibility
        df['quintile_returns'] = df['quintile_returns'].apply(str)
        df['quintile_sharpe'] = df['quintile_sharpe'].apply(str)
        
        return df
    
    def save(self, path: Path = None) -> Path:
        """Save efficacy stats to parquet."""
        path = path or MODEL_OUTPUT_DIR / 'signal_efficacy.parquet'
        path.parent.mkdir(parents=True, exist_ok=True)
        
        df = self.to_dataframe()
        df.to_parquet(path, index=False)
        
        logger.info(f"Saved signal efficacy to {path}")
        return path
    
    def load(self, path: Path = None) -> pd.DataFrame:
        """Load efficacy stats from parquet."""
        path = path or MODEL_OUTPUT_DIR / 'signal_efficacy.parquet'
        
        if not path.exists():
            logger.warning(f"Efficacy file not found: {path}")
            return pd.DataFrame()
        
        return pd.read_parquet(path)
    
    def get_efficacy(
        self,
        signal_name: str,
        regime: str,
        horizon: int = 20
    ) -> Optional[SignalEfficacyStats]:
        """Get efficacy stats for a specific signal-regime-horizon."""
        for stats in self.efficacy_stats:
            if (stats.signal_name == signal_name and 
                stats.regime == regime and 
                stats.horizon_days == horizon):
                return stats
        return None
    
    def get_best_signals_for_regime(
        self,
        regime: str,
        horizon: int = 20,
        min_confidence: float = 0.3,
        top_n: int = 5
    ) -> List[SignalEfficacyStats]:
        """Get top signals for a specific regime by confidence."""
        regime_stats = [
            s for s in self.efficacy_stats
            if s.regime == regime and 
               s.horizon_days == horizon and
               s.confidence_score >= min_confidence
        ]
        
        # Sort by confidence
        regime_stats.sort(key=lambda x: x.confidence_score, reverse=True)
        
        return regime_stats[:top_n]


# =============================================================================
# TRAINING UTILITY
# =============================================================================

def train_efficacy_from_pipeline(
    ticker: str,
    signals_df: pd.DataFrame,
    prices: pd.Series,
    regimes: pd.Series,
    save: bool = True
) -> SignalEfficacyTrainer:
    """
    Convenience function to train efficacy from pipeline data.
    """
    trainer = SignalEfficacyTrainer()
    trainer.train_all(signals_df, prices, regimes)
    
    if save:
        # Save ticker-specific efficacy
        path = MODEL_OUTPUT_DIR / f'signal_efficacy_{ticker}.parquet'
        trainer.save(path)
    
    return trainer


def load_efficacy_stats(ticker: str = None) -> pd.DataFrame:
    """Load efficacy stats, optionally for a specific ticker."""
    if ticker:
        path = MODEL_OUTPUT_DIR / f'signal_efficacy_{ticker}.parquet'
    else:
        path = MODEL_OUTPUT_DIR / 'signal_efficacy.parquet'
    
    if not path.exists():
        return pd.DataFrame()
    
    return pd.read_parquet(path)

