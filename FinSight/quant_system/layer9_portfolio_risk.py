#!/usr/bin/env python3
"""
LAYER 9: CORRELATION-AWARE PORTFOLIO RISK
==========================================

Institutional-grade portfolio risk calculations:
1. Rolling correlation matrix
2. Marginal Risk Contribution (MRC)
3. Correlation-adjusted position caps
4. Effective positions / Diversification metrics

NO price predictions. Risk > return. All math explainable.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from datetime import date, datetime
import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class PortfolioRiskMetrics:
    """Complete portfolio risk output."""
    # Basic counts
    n_positions: int
    n_active_initiates: int
    n_holds: int
    n_avoids: int
    
    # Correlation metrics
    avg_pairwise_correlation: float
    max_correlation: float
    effective_positions: float
    diversification_ratio: float
    correlation_drag: float
    
    # Risk contribution
    total_portfolio_vol: float
    largest_risk_contributor: str
    largest_risk_pct: float
    concentration_score: float  # HHI-style
    
    # Position adjustments
    positions_capped_by_correlation: int
    avg_position_reduction: float
    
    # Regime exposure
    regime_concentration: Dict[str, float]
    dominant_regime: str
    regime_diversification: float


class PortfolioRiskEngine:
    """
    Correlation-aware portfolio risk calculations.
    
    Key formulas:
    - Marginal Risk Contribution: MRC_i = w_i * sum_j(w_j * σ_i * σ_j * ρ_ij)
    - Effective Positions: 1 / sum(w_i^2)
    - Diversification Ratio: (sum(w_i * σ_i)) / σ_portfolio
    """
    
    def __init__(
        self,
        correlation_lookback: int = 60,
        max_correlation_threshold: float = 0.65,
        min_effective_position_ratio: float = 0.6,
        max_single_regime_exposure: float = 0.50,
    ):
        self.correlation_lookback = correlation_lookback
        self.max_correlation_threshold = max_correlation_threshold
        self.min_effective_position_ratio = min_effective_position_ratio
        self.max_single_regime_exposure = max_single_regime_exposure
    
    def compute_rolling_correlation(
        self,
        returns_dict: Dict[str, pd.Series],
        lookback: int = None
    ) -> pd.DataFrame:
        """
        Compute rolling correlation matrix from return series.
        
        Args:
            returns_dict: {ticker: returns_series}
            lookback: Number of periods (default: self.correlation_lookback)
        
        Returns:
            Correlation matrix DataFrame
        """
        lookback = lookback or self.correlation_lookback
        
        if len(returns_dict) < 2:
            return pd.DataFrame()
        
        # Align all return series
        returns_df = pd.DataFrame(returns_dict)
        returns_df = returns_df.dropna(how='all')
        
        # Take last N days
        if len(returns_df) > lookback:
            returns_df = returns_df.tail(lookback)
        
        # Compute correlation matrix
        corr_matrix = returns_df.corr()
        
        return corr_matrix
    
    def compute_marginal_risk_contribution(
        self,
        weights: Dict[str, float],
        volatilities: Dict[str, float],
        correlation_matrix: pd.DataFrame
    ) -> Dict[str, float]:
        """
        Compute Marginal Risk Contribution for each position.
        
        MRC_i = w_i * Σ_j (w_j * σ_i * σ_j * ρ_ij)
        
        Args:
            weights: {ticker: weight}
            volatilities: {ticker: annualized_volatility}
            correlation_matrix: Correlation matrix DataFrame
        
        Returns:
            {ticker: marginal_risk_contribution}
        """
        mrc = {}
        tickers = list(weights.keys())
        
        if correlation_matrix.empty:
            # No correlation data - use individual risk
            for ticker in tickers:
                w_i = weights.get(ticker, 0)
                sigma_i = volatilities.get(ticker, 0.20)
                mrc[ticker] = w_i * sigma_i
            return mrc
        
        for ticker_i in tickers:
            w_i = weights.get(ticker_i, 0)
            sigma_i = volatilities.get(ticker_i, 0.20)
            
            mrc_i = 0.0
            for ticker_j in tickers:
                w_j = weights.get(ticker_j, 0)
                sigma_j = volatilities.get(ticker_j, 0.20)
                
                # Get correlation (default to 0 if not in matrix)
                if ticker_i in correlation_matrix.index and ticker_j in correlation_matrix.columns:
                    rho_ij = correlation_matrix.loc[ticker_i, ticker_j]
                    if pd.isna(rho_ij):
                        rho_ij = 0.0
                else:
                    rho_ij = 1.0 if ticker_i == ticker_j else 0.0
                
                mrc_i += w_j * sigma_i * sigma_j * rho_ij
            
            mrc[ticker_i] = w_i * mrc_i
        
        return mrc
    
    def compute_effective_positions(self, weights: Dict[str, float]) -> float:
        """
        Compute effective number of positions (inverse HHI).
        
        Effective Positions = 1 / Σ(w_i²)
        
        If 10 stocks have equal weights (10% each), effective = 10.
        If 1 stock has 50% and rest split, effective < 10.
        """
        if not weights:
            return 0.0
        
        weights_arr = np.array(list(weights.values()))
        weights_arr = weights_arr[weights_arr > 0]  # Only positive weights
        
        if len(weights_arr) == 0:
            return 0.0
        
        # Normalize to sum to 1
        weights_arr = weights_arr / weights_arr.sum()
        
        # HHI = sum of squared weights
        hhi = np.sum(weights_arr ** 2)
        
        # Effective positions = 1/HHI
        return 1.0 / hhi if hhi > 0 else 0.0
    
    def compute_diversification_ratio(
        self,
        weights: Dict[str, float],
        volatilities: Dict[str, float],
        portfolio_vol: float
    ) -> float:
        """
        Compute Diversification Ratio.
        
        DR = Σ(w_i * σ_i) / σ_portfolio
        
        DR > 1 means diversification is reducing risk.
        DR = 1 means no diversification benefit.
        """
        if portfolio_vol <= 0:
            return 1.0
        
        weighted_vol_sum = sum(
            weights.get(t, 0) * volatilities.get(t, 0.20)
            for t in weights.keys()
        )
        
        return weighted_vol_sum / portfolio_vol
    
    def compute_portfolio_volatility(
        self,
        weights: Dict[str, float],
        volatilities: Dict[str, float],
        correlation_matrix: pd.DataFrame
    ) -> float:
        """
        Compute portfolio volatility.
        
        σ_p² = Σ_i Σ_j (w_i * w_j * σ_i * σ_j * ρ_ij)
        """
        tickers = list(weights.keys())
        
        variance = 0.0
        for ticker_i in tickers:
            w_i = weights.get(ticker_i, 0)
            sigma_i = volatilities.get(ticker_i, 0.20)
            
            for ticker_j in tickers:
                w_j = weights.get(ticker_j, 0)
                sigma_j = volatilities.get(ticker_j, 0.20)
                
                # Get correlation
                if not correlation_matrix.empty and \
                   ticker_i in correlation_matrix.index and \
                   ticker_j in correlation_matrix.columns:
                    rho_ij = correlation_matrix.loc[ticker_i, ticker_j]
                    if pd.isna(rho_ij):
                        rho_ij = 1.0 if ticker_i == ticker_j else 0.0
                else:
                    rho_ij = 1.0 if ticker_i == ticker_j else 0.0
                
                variance += w_i * w_j * sigma_i * sigma_j * rho_ij
        
        return np.sqrt(max(0, variance))
    
    def adjust_positions_for_correlation(
        self,
        positions: Dict[str, float],
        avg_correlation: float,
        effective_positions: float,
        actual_positions: int
    ) -> Tuple[Dict[str, float], int, float]:
        """
        Reduce position sizes if correlation is too high.
        
        Rules:
        1. If avg_correlation > 0.65 → reduce all positions by 20%
        2. If effective_positions < 0.6 * actual_positions → scale down
        
        Returns:
            (adjusted_positions, n_positions_capped, avg_reduction)
        """
        adjusted = positions.copy()
        n_capped = 0
        total_reduction = 0.0
        
        # Rule 1: High average correlation
        if avg_correlation > self.max_correlation_threshold:
            scale = 1.0 - (avg_correlation - self.max_correlation_threshold)
            scale = max(0.5, scale)  # Don't reduce below 50%
            
            for ticker in adjusted:
                original = adjusted[ticker]
                adjusted[ticker] = original * scale
                if adjusted[ticker] < original:
                    n_capped += 1
                    total_reduction += (original - adjusted[ticker]) / original
        
        # Rule 2: Low effective position ratio
        if actual_positions > 0:
            effective_ratio = effective_positions / actual_positions
            
            if effective_ratio < self.min_effective_position_ratio:
                # Scale down concentrated positions
                scale = effective_ratio / self.min_effective_position_ratio
                scale = max(0.5, scale)
                
                for ticker in adjusted:
                    original = adjusted[ticker]
                    adjusted[ticker] = original * scale
                    if adjusted[ticker] < original and ticker not in positions:
                        n_capped += 1
                        total_reduction += (original - adjusted[ticker]) / original
        
        avg_reduction = total_reduction / max(1, n_capped) if n_capped > 0 else 0.0
        
        return adjusted, n_capped, avg_reduction
    
    def compute_regime_exposure(
        self,
        decisions: List[Dict[str, Any]],
        weights: Dict[str, float] = None
    ) -> Tuple[Dict[str, float], float]:
        """
        Compute regime exposure distribution.
        
        Returns:
            (regime_weights, regime_hhi)
        """
        if not decisions:
            return {}, 0.0
        
        regime_counts = {}
        total_weight = 0.0
        
        for d in decisions:
            ticker = d.get('ticker', '')
            regime = d.get('asset_regime', 'unknown')
            weight = weights.get(ticker, 1.0 / len(decisions)) if weights else 1.0 / len(decisions)
            
            if regime not in regime_counts:
                regime_counts[regime] = 0.0
            regime_counts[regime] += weight
            total_weight += weight
        
        # Normalize
        regime_exposure = {
            regime: count / total_weight if total_weight > 0 else 0
            for regime, count in regime_counts.items()
        }
        
        # Regime HHI (concentration)
        regime_hhi = sum(v ** 2 for v in regime_exposure.values())
        
        return regime_exposure, regime_hhi
    
    def analyze_portfolio(
        self,
        decisions: List[Dict[str, Any]],
        returns_dict: Dict[str, pd.Series] = None,
    ) -> PortfolioRiskMetrics:
        """
        Complete portfolio risk analysis.
        
        Args:
            decisions: List of decision dicts from intelligence pipeline
            returns_dict: {ticker: daily_returns_series} for correlation
        
        Returns:
            PortfolioRiskMetrics
        """
        if not decisions:
            return self._empty_metrics()
        
        # Filter to active positions (INITIATE or HOLD with conviction > 0.4)
        active_decisions = [
            d for d in decisions
            if d.get('intent') in ['INITIATE', 'HOLD'] and d.get('conviction', 0) > 0.4
        ]
        
        # Extract tickers and weights
        tickers = [d.get('ticker') for d in active_decisions]
        
        # Use recommended position sizes as weights
        raw_weights = {
            d.get('ticker'): d.get('recommended_position_pct', 0.02)
            for d in active_decisions
        }
        
        # Normalize weights
        total_weight = sum(raw_weights.values())
        if total_weight > 0:
            weights = {t: w / total_weight for t, w in raw_weights.items()}
        else:
            weights = {}
        
        # Get volatilities
        volatilities = {
            d.get('ticker'): d.get('volatility_20d', 0.20)
            for d in active_decisions
        }
        
        # Compute correlation matrix if returns provided
        if returns_dict:
            corr_matrix = self.compute_rolling_correlation(
                {t: returns_dict.get(t) for t in tickers if t in returns_dict}
            )
        else:
            corr_matrix = pd.DataFrame()
        
        # Correlation metrics
        if not corr_matrix.empty:
            # Get upper triangle (excluding diagonal)
            mask = np.triu(np.ones(corr_matrix.shape), k=1).astype(bool)
            upper_corrs = corr_matrix.values[mask]
            upper_corrs = upper_corrs[~np.isnan(upper_corrs)]
            
            avg_corr = float(np.mean(upper_corrs)) if len(upper_corrs) > 0 else 0.0
            max_corr = float(np.max(upper_corrs)) if len(upper_corrs) > 0 else 0.0
        else:
            avg_corr = 0.0
            max_corr = 0.0
        
        # Effective positions
        effective_pos = self.compute_effective_positions(weights)
        
        # Portfolio volatility
        portfolio_vol = self.compute_portfolio_volatility(weights, volatilities, corr_matrix)
        
        # Diversification ratio
        div_ratio = self.compute_diversification_ratio(weights, volatilities, portfolio_vol)
        
        # Correlation drag (how much correlation hurts diversification)
        # = 1 - (actual diversification benefit / theoretical max)
        corr_drag = max(0, 1.0 - (1.0 / div_ratio)) if div_ratio > 0 else 0.0
        
        # Marginal risk contribution
        mrc = self.compute_marginal_risk_contribution(weights, volatilities, corr_matrix)
        
        # Find largest contributor
        if mrc:
            largest_ticker = max(mrc, key=mrc.get)
            largest_pct = mrc[largest_ticker] / sum(mrc.values()) if sum(mrc.values()) > 0 else 0
        else:
            largest_ticker = ""
            largest_pct = 0.0
        
        # Concentration score (normalized HHI)
        if weights:
            weights_arr = np.array(list(weights.values()))
            hhi = np.sum(weights_arr ** 2)
            n = len(weights)
            # Normalized: 0 = perfectly diversified, 1 = concentrated
            concentration = (hhi - 1/n) / (1 - 1/n) if n > 1 else 1.0
        else:
            concentration = 0.0
        
        # Adjust positions for correlation
        adjusted_weights, n_capped, avg_reduction = self.adjust_positions_for_correlation(
            weights, avg_corr, effective_pos, len(weights)
        )
        
        # Regime exposure
        regime_exposure, regime_hhi = self.compute_regime_exposure(decisions, weights)
        
        dominant_regime = max(regime_exposure, key=regime_exposure.get) if regime_exposure else 'unknown'
        regime_div = 1.0 / regime_hhi if regime_hhi > 0 else 1.0
        
        # Count by intent
        n_initiates = sum(1 for d in decisions if d.get('intent') == 'INITIATE')
        n_holds = sum(1 for d in decisions if d.get('intent') == 'HOLD')
        n_avoids = sum(1 for d in decisions if d.get('intent') == 'AVOID')
        
        return PortfolioRiskMetrics(
            n_positions=len(active_decisions),
            n_active_initiates=n_initiates,
            n_holds=n_holds,
            n_avoids=n_avoids,
            
            avg_pairwise_correlation=round(avg_corr, 4),
            max_correlation=round(max_corr, 4),
            effective_positions=round(effective_pos, 2),
            diversification_ratio=round(div_ratio, 4),
            correlation_drag=round(corr_drag, 4),
            
            total_portfolio_vol=round(portfolio_vol, 4),
            largest_risk_contributor=largest_ticker,
            largest_risk_pct=round(largest_pct, 4),
            concentration_score=round(concentration, 4),
            
            positions_capped_by_correlation=n_capped,
            avg_position_reduction=round(avg_reduction, 4),
            
            regime_concentration=regime_exposure,
            dominant_regime=dominant_regime,
            regime_diversification=round(regime_div, 2),
        )
    
    def _empty_metrics(self) -> PortfolioRiskMetrics:
        """Return empty metrics."""
        return PortfolioRiskMetrics(
            n_positions=0,
            n_active_initiates=0,
            n_holds=0,
            n_avoids=0,
            avg_pairwise_correlation=0.0,
            max_correlation=0.0,
            effective_positions=0.0,
            diversification_ratio=1.0,
            correlation_drag=0.0,
            total_portfolio_vol=0.0,
            largest_risk_contributor="",
            largest_risk_pct=0.0,
            concentration_score=0.0,
            positions_capped_by_correlation=0,
            avg_position_reduction=0.0,
            regime_concentration={},
            dominant_regime="unknown",
            regime_diversification=1.0,
        )
    
    def generate_risk_narrative(self, metrics: PortfolioRiskMetrics) -> str:
        """Generate human-readable risk narrative."""
        parts = []
        
        # Effective positions
        if metrics.n_positions > 0:
            eff_ratio = metrics.effective_positions / metrics.n_positions
            if eff_ratio < 0.7:
                parts.append(
                    f"Although {metrics.n_positions} stocks are held, high correlation "
                    f"means risk behaves like {metrics.effective_positions:.1f} positions."
                )
            else:
                parts.append(
                    f"Portfolio holds {metrics.n_positions} positions with good diversification "
                    f"(effective positions: {metrics.effective_positions:.1f})."
                )
        
        # Correlation
        if metrics.avg_pairwise_correlation > 0.5:
            parts.append(
                f"Average correlation ({metrics.avg_pairwise_correlation:.1%}) is elevated, "
                f"reducing diversification benefits."
            )
        elif metrics.avg_pairwise_correlation > 0:
            parts.append(
                f"Correlation is moderate ({metrics.avg_pairwise_correlation:.1%}), "
                f"providing reasonable diversification."
            )
        
        # Concentration
        if metrics.concentration_score > 0.3:
            parts.append(
                f"Position concentration is high. {metrics.largest_risk_contributor} "
                f"contributes {metrics.largest_risk_pct:.1%} of total risk."
            )
        
        # Regime
        if metrics.dominant_regime and metrics.regime_concentration:
            dom_pct = metrics.regime_concentration.get(metrics.dominant_regime, 0)
            if dom_pct > 0.5:
                parts.append(
                    f"Regime exposure is concentrated: {dom_pct:.0%} in {metrics.dominant_regime}."
                )
        
        return " ".join(parts) if parts else "Portfolio risk metrics within normal parameters."


def compute_portfolio_risk(
    decisions: List[Dict[str, Any]],
    returns_dict: Dict[str, pd.Series] = None,
) -> Dict[str, Any]:
    """
    Convenience function for portfolio risk calculation.
    
    Args:
        decisions: List of decision dicts
        returns_dict: Optional {ticker: returns_series}
    
    Returns:
        Dict with all risk metrics
    """
    engine = PortfolioRiskEngine()
    metrics = engine.analyze_portfolio(decisions, returns_dict)
    narrative = engine.generate_risk_narrative(metrics)
    
    result = asdict(metrics)
    result['risk_narrative'] = narrative
    
    return result

