"""
LAYER 2: Regime Engine (Institutional Grade)
=============================================

Hidden Markov Model (HMM) based market regime classification.

CRITICAL UPGRADE: Market + Asset Regime Separation
- Market regime (SPX/NIFTY/macro proxy)
- Asset-specific regime (idiosyncratic)
- Relative regime strength (gold signal)

Regimes Identified:
- Accumulation: Low volatility, sideways, smart money buying
- Markup: Rising prices, expanding breadth, momentum
- Distribution: High prices, increased volatility, smart money selling
- Markdown: Declining prices, rising fear
- Panic: Extreme volatility, capitulation
- Recovery: Bottoming process, early reversal signs

Output: Market regime, asset regime, relative strength, confidence, persistence
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, List, Tuple
from datetime import datetime, date
import logging
import warnings
from dataclasses import dataclass

warnings.filterwarnings('ignore')

from .config import DEFAULT_REGIME_CONFIG, MODEL_OUTPUT_DIR, DATA_DIR, MARKET_BENCHMARKS
from .schemas import RegimeState
from .utils import (
    load_price_history, load_market_benchmark, compute_returns, 
    compute_realized_volatility, classify_volatility_regime, classify_trend_regime
)

logger = logging.getLogger(__name__)


@dataclass
class RegimeOutput:
    """Output from regime detection - UPGRADED with market/asset split."""
    # Asset-specific regime
    regime: str
    confidence: float
    days_in_regime: int
    expected_persistence: int
    transition_probs: Dict[str, float]
    vol_regime: str
    trend_regime: str
    
    # UPGRADE: Market regime context
    market_regime: str
    market_regime_confidence: float
    
    # UPGRADE: Relative strength analysis
    relative_regime_strength: float  # -1 to 1: asset strength vs market
    regime_divergence: str  # 'aligned', 'outperforming', 'underperforming', 'divergent'
    
    # Composite assessment
    composite_regime_score: float  # Weighted combination


class RegimeEngine:
    """
    HMM-based regime detection engine - INSTITUTIONAL GRADE.
    
    KEY UPGRADE: Two-layer regime detection:
    1. Market regime (systemic risk/opportunity)
    2. Asset regime (idiosyncratic)
    3. Relative strength (alpha signal)
    
    This separation is critical because:
    - Asset in accumulation + Market in distribution = HIGH ALPHA opportunity
    - Asset in markup + Market in panic = HIGH RISK despite asset trend
    """
    
    REGIME_CHARACTERISTICS = {
        'accumulation': {
            'volatility': 'low', 'trend': 'sideways', 'volume': 'declining',
            'description': 'Smart money building positions, low volatility consolidation',
            'typical_duration': 30, 'bullish_bias': 0.6
        },
        'markup': {
            'volatility': 'normal', 'trend': 'strong_up', 'volume': 'rising',
            'description': 'Bull phase, rising prices with expanding breadth',
            'typical_duration': 60, 'bullish_bias': 0.85
        },
        'distribution': {
            'volatility': 'elevated', 'trend': 'weak_up', 'volume': 'high',
            'description': 'Smart money selling to retail, topping process',
            'typical_duration': 25, 'bullish_bias': 0.3
        },
        'markdown': {
            'volatility': 'elevated', 'trend': 'strong_down', 'volume': 'rising',
            'description': 'Bear phase, declining prices with fear',
            'typical_duration': 40, 'bullish_bias': 0.15
        },
        'panic': {
            'volatility': 'extreme', 'trend': 'strong_down', 'volume': 'extreme',
            'description': 'Capitulation, extreme fear, potential bottom',
            'typical_duration': 10, 'bullish_bias': 0.4  # Contrarian opportunity
        },
        'recovery': {
            'volatility': 'elevated', 'trend': 'weak_up', 'volume': 'declining',
            'description': 'Early reversal, bottoming process, value buying',
            'typical_duration': 20, 'bullish_bias': 0.65
        }
    }
    
    # Relative strength regime interpretations
    RELATIVE_STRENGTH_INTERPRETATION = {
        ('accumulation', 'distribution'): ('outperforming', 0.8, 'Asset building while market topping - HIGH ALPHA'),
        ('markup', 'markup'): ('aligned', 0.5, 'Both rising - beta exposure'),
        ('markup', 'markdown'): ('outperforming', 0.9, 'Asset trending up against falling market - STRONG ALPHA'),
        ('distribution', 'markup'): ('underperforming', -0.6, 'Asset topping while market rising - CAUTION'),
        ('markdown', 'markdown'): ('aligned', -0.3, 'Both falling - high beta risk'),
        ('panic', 'markdown'): ('underperforming', -0.8, 'Asset panicking worse than market - HIGH RISK'),
        ('recovery', 'panic'): ('outperforming', 0.7, 'Asset recovering while market capitulating - OPPORTUNITY'),
    }
    
    def __init__(self, config=None):
        self.config = config or DEFAULT_REGIME_CONFIG
        self.model = None
        self.market_model = None
        self.is_fitted = False
        self.is_market_fitted = False
        self.regime_mapping = {}
        self.market_regime_mapping = {}
        self.feature_means = None
        self.feature_stds = None
        self.market_feature_means = None
        self.market_feature_stds = None
        
        # Cache for market regime
        self._market_regime_cache = {}
    
    def _prepare_features(self, prices: pd.DataFrame, min_history: int = 60) -> Optional[pd.DataFrame]:
        """Prepare features for HMM regime detection."""
        if len(prices) < min_history:
            return None
        
        df = prices.copy()
        
        # Ensure we have date as index for proper alignment
        if 'date' in df.columns and not isinstance(df.index, pd.DatetimeIndex):
            df = df.set_index('date')
        
        close = df['close']
        
        features = pd.DataFrame(index=df.index)
        
        # Returns
        features['ret_5d'] = close.pct_change(5)
        features['ret_20d'] = close.pct_change(20)
        
        # Volatility
        daily_ret = close.pct_change(1)
        features['vol_20d'] = daily_ret.rolling(20).std() * np.sqrt(252)
        features['vol_change'] = features['vol_20d'].pct_change(10)
        
        # Trend strength
        sma20 = close.rolling(20).mean()
        sma50 = close.rolling(50).mean()
        features['trend_strength'] = (close / sma20 - 1) * 0.5 + (close / sma50 - 1) * 0.5
        
        # Volume ratio
        if 'volume' in df.columns:
            features['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
        else:
            features['volume_ratio'] = 1.0
        
        features = features.dropna()
        return features
    
    def _normalize_features(self, features: pd.DataFrame, fit: bool = False, is_market: bool = False) -> np.ndarray:
        """Normalize features to zero mean and unit variance."""
        if fit:
            if is_market:
                self.market_feature_means = features.mean()
                self.market_feature_stds = features.std()
            else:
                self.feature_means = features.mean()
                self.feature_stds = features.std()
        
        means = self.market_feature_means if is_market else self.feature_means
        stds = self.market_feature_stds if is_market else self.feature_stds
        
        normalized = (features - means) / stds
        normalized = normalized.replace([np.inf, -np.inf], 0).fillna(0)
        return normalized.values
    
    def fit(self, prices: pd.DataFrame, n_regimes: int = None) -> 'RegimeEngine':
        """Fit the HMM model on historical price data."""
        try:
            from hmmlearn.hmm import GaussianHMM
        except ImportError:
            logger.warning("hmmlearn not installed. Using rule-based regime detection.")
            self.is_fitted = False
            return self
        
        n_regimes = n_regimes or self.config.n_regimes
        
        features = self._prepare_features(prices)
        if features is None or len(features) < 100:
            logger.warning("Insufficient data for HMM fitting")
            self.is_fitted = False
            return self
        
        X = self._normalize_features(features, fit=True)
        
        self.model = GaussianHMM(
            n_components=n_regimes,
            covariance_type=self.config.hmm_covariance_type,
            n_iter=self.config.hmm_n_iter,
            random_state=42
        )
        
        try:
            self.model.fit(X)
            self.is_fitted = True
            self._map_states_to_regimes(features, X)
            logger.info(f"HMM fitted with {n_regimes} regimes")
        except Exception as e:
            logger.error(f"Error fitting HMM: {e}")
            self.is_fitted = False
        
        return self
    
    def fit_market_regime(self, market: str = 'US') -> 'RegimeEngine':
        """
        UPGRADE: Fit market-level regime model.
        
        Uses robust market benchmark loading with fallbacks.
        """
        try:
            from hmmlearn.hmm import GaussianHMM
        except ImportError:
            self.is_market_fitted = False
            return self
        
        # Use robust market benchmark loader
        market_prices = load_market_benchmark(market)
        
        if market_prices is None:
            logger.warning(f"No benchmark data for {market}, using rule-based market regime")
            self.is_market_fitted = False
            return self
        
        features = self._prepare_features(market_prices)
        if features is None or len(features) < 100:
            self.is_market_fitted = False
            return self
        
        X = self._normalize_features(features, fit=True, is_market=True)
        
        self.market_model = GaussianHMM(
            n_components=6,
            covariance_type='full',
            n_iter=100,
            random_state=42
        )
        
        try:
            self.market_model.fit(X)
            self.is_market_fitted = True
            self._map_market_states_to_regimes(features, X)
            logger.info(f"Market HMM fitted for {market}")
        except Exception as e:
            logger.error(f"Error fitting market HMM: {e}")
            self.is_market_fitted = False
        
        return self
    
    def _map_states_to_regimes(self, features: pd.DataFrame, X: np.ndarray):
        """Map HMM hidden states to semantic regime labels."""
        states = self.model.predict(X)
        
        state_characteristics = {}
        for state in range(self.model.n_components):
            state_mask = states == state
            if state_mask.sum() == 0:
                continue
            
            state_features = features[state_mask]
            state_characteristics[state] = {
                'mean_ret_5d': state_features['ret_5d'].mean(),
                'mean_ret_20d': state_features['ret_20d'].mean(),
                'mean_vol': state_features['vol_20d'].mean(),
                'mean_vol_change': state_features['vol_change'].mean(),
                'mean_trend': state_features['trend_strength'].mean(),
                'n_days': state_mask.sum()
            }
        
        # Assign regime labels based on characteristics
        for state, chars in state_characteristics.items():
            if chars['mean_vol'] > 0.3 and chars['mean_ret_20d'] < -0.05:
                label = 'panic'
            elif chars['mean_ret_20d'] > 0.05 and chars['mean_vol'] < 0.2:
                label = 'markup'
            elif chars['mean_ret_20d'] < -0.02 and chars['mean_vol'] > 0.2:
                label = 'markdown'
            elif chars['mean_vol'] < 0.15 and abs(chars['mean_ret_20d']) < 0.02:
                label = 'accumulation'
            elif chars['mean_ret_20d'] > 0 and chars['mean_vol'] > 0.2:
                label = 'distribution'
            else:
                label = 'recovery'
            
            self.regime_mapping[state] = label
        
        logger.info(f"Regime mapping: {self.regime_mapping}")
    
    def _map_market_states_to_regimes(self, features: pd.DataFrame, X: np.ndarray):
        """Map market HMM states to regime labels."""
        states = self.market_model.predict(X)
        
        for state in range(self.market_model.n_components):
            state_mask = states == state
            if state_mask.sum() == 0:
                continue
            
            state_features = features[state_mask]
            chars = {
                'mean_ret_20d': state_features['ret_20d'].mean(),
                'mean_vol': state_features['vol_20d'].mean()
            }
            
            if chars['mean_vol'] > 0.25 and chars['mean_ret_20d'] < -0.05:
                label = 'panic'
            elif chars['mean_ret_20d'] > 0.04 and chars['mean_vol'] < 0.2:
                label = 'markup'
            elif chars['mean_ret_20d'] < -0.02:
                label = 'markdown'
            elif chars['mean_vol'] < 0.15:
                label = 'accumulation'
            elif chars['mean_ret_20d'] > 0 and chars['mean_vol'] > 0.18:
                label = 'distribution'
            else:
                label = 'recovery'
            
            self.market_regime_mapping[state] = label
    
    def predict_market_regime(
        self,
        market: str = 'US',
        as_of_date: Optional[date] = None
    ) -> Tuple[str, float]:
        """
        UPGRADE: Predict current market regime.
        
        Uses robust benchmark loading with fallbacks.
        
        Returns:
            Tuple of (market_regime, confidence)
        """
        # Check cache
        cache_key = f"{market}_{as_of_date}"
        if cache_key in self._market_regime_cache:
            return self._market_regime_cache[cache_key]
        
        # Use robust market benchmark loader
        market_prices = load_market_benchmark(market)
        if market_prices is None:
            logger.warning(f"No market benchmark available for {market}, using default regime")
            return 'recovery', 0.5
        
        if as_of_date:
            market_prices = market_prices[market_prices['date'] <= pd.Timestamp(as_of_date)]
        
        # Use rule-based if HMM not fitted
        if not self.is_market_fitted:
            result = self._rule_based_regime(market_prices)
            return result.regime, result.confidence
        
        features = self._prepare_features(market_prices)
        if features is None:
            return 'recovery', 0.5
        
        X = self._normalize_features(features, fit=False, is_market=True)
        
        try:
            states = self.market_model.predict(X)
            state_probs = self.market_model.predict_proba(X)
            
            current_state = states[-1]
            market_regime = self.market_regime_mapping.get(current_state, 'recovery')
            confidence = float(state_probs[-1, current_state])
            
            self._market_regime_cache[cache_key] = (market_regime, confidence)
            return market_regime, confidence
            
        except Exception as e:
            logger.error(f"Error predicting market regime: {e}")
            return 'recovery', 0.5
    
    def compute_relative_regime_strength(
        self,
        asset_regime: str,
        market_regime: str
    ) -> Tuple[float, str, str]:
        """
        UPGRADE: Compute relative regime strength.
        
        This is the GOLD SIGNAL: asset strength vs market.
        
        Returns:
            Tuple of (strength_score, divergence_type, interpretation)
        """
        key = (asset_regime, market_regime)
        
        # Check explicit mapping
        if key in self.RELATIVE_STRENGTH_INTERPRETATION:
            divergence, score, interpretation = self.RELATIVE_STRENGTH_INTERPRETATION[key]
            return score, divergence, interpretation
        
        # Compute dynamically
        asset_bullish = self.REGIME_CHARACTERISTICS.get(asset_regime, {}).get('bullish_bias', 0.5)
        market_bullish = self.REGIME_CHARACTERISTICS.get(market_regime, {}).get('bullish_bias', 0.5)
        
        strength = asset_bullish - market_bullish
        
        if strength > 0.3:
            divergence = 'outperforming'
            interpretation = f"Asset ({asset_regime}) stronger than market ({market_regime})"
        elif strength < -0.3:
            divergence = 'underperforming'
            interpretation = f"Asset ({asset_regime}) weaker than market ({market_regime})"
        elif abs(strength) < 0.1:
            divergence = 'aligned'
            interpretation = f"Asset aligned with market"
        else:
            divergence = 'divergent'
            interpretation = f"Mixed signals between asset and market"
        
        return float(strength), divergence, interpretation
    
    def predict_regime(
        self,
        prices: pd.DataFrame,
        market: str = 'US',
        as_of_date: Optional[date] = None
    ) -> Optional[RegimeOutput]:
        """
        UPGRADED: Predict current regime with market context.
        
        Returns complete regime output including:
        - Asset regime
        - Market regime
        - Relative strength
        """
        if as_of_date:
            prices = prices[prices['date'] <= pd.Timestamp(as_of_date)]
        
        features = self._prepare_features(prices)
        if features is None or len(features) == 0:
            return self._rule_based_regime_full(prices, market)
        
        # Asset regime
        if not self.is_fitted:
            asset_output = self._rule_based_regime(prices)
            asset_regime = asset_output.regime
            asset_confidence = asset_output.confidence
            days_in_regime = asset_output.days_in_regime
            expected_persistence = asset_output.expected_persistence
            transition_probs = asset_output.transition_probs
        else:
            X = self._normalize_features(features, fit=False)
            try:
                states = self.model.predict(X)
                state_probs = self.model.predict_proba(X)
                
                current_state = states[-1]
                asset_regime = self.regime_mapping.get(current_state, 'recovery')
                asset_confidence = float(state_probs[-1, current_state])
                
                # Days in regime
                days_in_regime = 1
                for i in range(len(states) - 2, -1, -1):
                    if states[i] == current_state:
                        days_in_regime += 1
                    else:
                        break
                
                # Transition probabilities
                trans_probs = self.model.transmat_[current_state]
                expected_persistence = int(1 / (1 - trans_probs[current_state] + 1e-6))
                
                transition_probs = {}
                for state, label in self.regime_mapping.items():
                    transition_probs[label] = float(trans_probs[state])
                
            except Exception as e:
                logger.error(f"Error predicting asset regime: {e}")
                asset_output = self._rule_based_regime(prices)
                asset_regime = asset_output.regime
                asset_confidence = asset_output.confidence
                days_in_regime = 1
                expected_persistence = 15
                transition_probs = {r: 1/6 for r in self.config.regime_labels}
        
        # UPGRADE: Market regime
        market_regime, market_confidence = self.predict_market_regime(market, as_of_date)
        
        # UPGRADE: Relative strength
        rel_strength, divergence, interpretation = self.compute_relative_regime_strength(
            asset_regime, market_regime
        )
        
        # Composite score
        asset_bullish = self.REGIME_CHARACTERISTICS.get(asset_regime, {}).get('bullish_bias', 0.5)
        market_bullish = self.REGIME_CHARACTERISTICS.get(market_regime, {}).get('bullish_bias', 0.5)
        composite = (asset_bullish * 0.6 + market_bullish * 0.3 + (rel_strength + 1) / 2 * 0.1)
        
        # Vol and trend regimes
        vol_regime = self._get_vol_regime(features)
        trend_regime = self._get_trend_regime(features)
        
        return RegimeOutput(
            regime=asset_regime,
            confidence=asset_confidence,
            days_in_regime=days_in_regime,
            expected_persistence=expected_persistence,
            transition_probs=transition_probs,
            vol_regime=vol_regime,
            trend_regime=trend_regime,
            market_regime=market_regime,
            market_regime_confidence=market_confidence,
            relative_regime_strength=rel_strength,
            regime_divergence=divergence,
            composite_regime_score=float(composite)
        )
    
    def _rule_based_regime(self, prices: pd.DataFrame) -> RegimeOutput:
        """Rule-based regime detection fallback."""
        if len(prices) < 60:
            return RegimeOutput(
                regime='recovery', confidence=0.5, days_in_regime=1,
                expected_persistence=10, transition_probs={r: 1/6 for r in self.config.regime_labels},
                vol_regime='normal', trend_regime='sideways',
                market_regime='recovery', market_regime_confidence=0.5,
                relative_regime_strength=0, regime_divergence='aligned',
                composite_regime_score=0.5
            )
        
        close = prices['close']
        ret_20d = close.pct_change(20).iloc[-1]
        daily_ret = close.pct_change(1)
        vol_20d = daily_ret.rolling(20).std().iloc[-1] * np.sqrt(252)
        
        sma20 = close.rolling(20).mean().iloc[-1]
        sma50 = close.rolling(50).mean().iloc[-1]
        price = close.iloc[-1]
        trend = (price / sma20 - 1, price / sma50 - 1)
        
        # Classification
        if vol_20d > 0.40 and ret_20d < -0.10:
            regime, confidence = 'panic', 0.8
        elif ret_20d > 0.08 and vol_20d < 0.25 and trend[0] > 0.02:
            regime, confidence = 'markup', 0.7
        elif ret_20d < -0.05 and vol_20d > 0.25:
            regime, confidence = 'markdown', 0.7
        elif vol_20d < 0.15 and abs(ret_20d) < 0.03:
            regime, confidence = 'accumulation', 0.6
        elif ret_20d > 0 and vol_20d > 0.25:
            regime, confidence = 'distribution', 0.6
        else:
            regime, confidence = 'recovery', 0.5
        
        # Vol regime
        if vol_20d < 0.15: vol_regime = 'low'
        elif vol_20d < 0.25: vol_regime = 'normal'
        elif vol_20d < 0.40: vol_regime = 'elevated'
        else: vol_regime = 'extreme'
        
        # Trend regime
        if trend[0] > 0.02 and trend[1] > 0.02: trend_regime = 'strong_up'
        elif trend[0] > 0: trend_regime = 'weak_up'
        elif trend[0] < -0.02 and trend[1] < -0.02: trend_regime = 'strong_down'
        elif trend[0] < 0: trend_regime = 'weak_down'
        else: trend_regime = 'sideways'
        
        return RegimeOutput(
            regime=regime, confidence=confidence, days_in_regime=1,
            expected_persistence=15, transition_probs={r: 1/6 for r in self.config.regime_labels},
            vol_regime=vol_regime, trend_regime=trend_regime,
            market_regime='recovery', market_regime_confidence=0.5,
            relative_regime_strength=0, regime_divergence='aligned',
            composite_regime_score=0.5
        )
    
    def _rule_based_regime_full(self, prices: pd.DataFrame, market: str) -> RegimeOutput:
        """Full rule-based regime with market context."""
        asset_output = self._rule_based_regime(prices)
        market_regime, market_conf = self.predict_market_regime(market)
        
        rel_strength, divergence, _ = self.compute_relative_regime_strength(
            asset_output.regime, market_regime
        )
        
        return RegimeOutput(
            regime=asset_output.regime,
            confidence=asset_output.confidence,
            days_in_regime=asset_output.days_in_regime,
            expected_persistence=asset_output.expected_persistence,
            transition_probs=asset_output.transition_probs,
            vol_regime=asset_output.vol_regime,
            trend_regime=asset_output.trend_regime,
            market_regime=market_regime,
            market_regime_confidence=market_conf,
            relative_regime_strength=rel_strength,
            regime_divergence=divergence,
            composite_regime_score=0.5
        )
    
    def _get_vol_regime(self, features: pd.DataFrame) -> str:
        """Get current volatility regime."""
        vol = features['vol_20d'].iloc[-1]
        if vol < 0.15: return 'low'
        elif vol < 0.25: return 'normal'
        elif vol < 0.40: return 'elevated'
        else: return 'extreme'
    
    def _get_trend_regime(self, features: pd.DataFrame) -> str:
        """Get current trend regime."""
        trend = features['trend_strength'].iloc[-1]
        if trend > 0.04: return 'strong_up'
        elif trend > 0.01: return 'weak_up'
        elif trend < -0.04: return 'strong_down'
        elif trend < -0.01: return 'weak_down'
        else: return 'sideways'
    
    def get_regime_history(
        self,
        prices: pd.DataFrame,
        market: str = 'US',
        as_of_date: Optional[date] = None
    ) -> pd.DataFrame:
        """Get complete regime history including market regime."""
        if as_of_date:
            prices = prices[prices['date'] <= pd.Timestamp(as_of_date)]
        
        features = self._prepare_features(prices)
        if features is None:
            return pd.DataFrame()
        
        if self.is_fitted:
            X = self._normalize_features(features, fit=False)
            states = self.model.predict(X)
            state_probs = self.model.predict_proba(X)
            
            regimes = [self.regime_mapping.get(s, 'recovery') for s in states]
            confidences = [state_probs[i, states[i]] for i in range(len(states))]
        else:
            regimes = []
            confidences = []
            for i in range(len(features)):
                output = self._rule_based_regime(prices.iloc[:len(prices) - len(features) + i + 1])
                regimes.append(output.regime)
                confidences.append(output.confidence)
        
        # Get market regime for each date
        market_regime, market_conf = self.predict_market_regime(market, as_of_date)
        
        # Get actual dates - try features index, then prices['date'], then fallback
        if hasattr(features.index, 'to_pydatetime') or isinstance(features.index[0], (pd.Timestamp, date)):
            dates = features.index
        elif 'date' in prices.columns:
            # Align dates with features
            dates = prices.loc[features.index, 'date'].values if features.index.isin(prices.index).all() else prices['date'].iloc[-len(features):].values
        else:
            dates = features.index
        
        result = pd.DataFrame({
            'date': dates,
            'regime': regimes,
            'confidence': confidences,
            'market_regime': market_regime,  # Simplified: same for recent history
            'vol_20d': features['vol_20d'].values,
            'ret_20d': features['ret_20d'].values,
            'trend_strength': features['trend_strength'].values
        })
        
        # Add relative strength
        result['relative_strength'] = result['regime'].apply(
            lambda r: self.compute_relative_regime_strength(r, market_regime)[0]
        )
        
        return result
    
    def save_model(self, ticker: str, market: str):
        """Save fitted model to disk."""
        if not self.is_fitted:
            return
        
        import joblib
        
        output_dir = MODEL_OUTPUT_DIR / market
        output_dir.mkdir(parents=True, exist_ok=True)
        
        model_data = {
            'model': self.model,
            'market_model': self.market_model,
            'regime_mapping': self.regime_mapping,
            'market_regime_mapping': self.market_regime_mapping,
            'feature_means': self.feature_means,
            'feature_stds': self.feature_stds,
            'market_feature_means': self.market_feature_means,
            'market_feature_stds': self.market_feature_stds,
            'config': self.config,
            'is_market_fitted': self.is_market_fitted
        }
        
        model_file = output_dir / f"{ticker}_regime_model.joblib"
        joblib.dump(model_data, model_file)
        logger.info(f"Saved regime model to {model_file}")
    
    def load_model(self, ticker: str, market: str) -> bool:
        """Load fitted model from disk."""
        import joblib
        
        model_file = MODEL_OUTPUT_DIR / market / f"{ticker}_regime_model.joblib"
        
        if not model_file.exists():
            return False
        
        try:
            model_data = joblib.load(model_file)
            
            self.model = model_data['model']
            self.market_model = model_data.get('market_model')
            self.regime_mapping = model_data['regime_mapping']
            self.market_regime_mapping = model_data.get('market_regime_mapping', {})
            self.feature_means = model_data['feature_means']
            self.feature_stds = model_data['feature_stds']
            self.market_feature_means = model_data.get('market_feature_means')
            self.market_feature_stds = model_data.get('market_feature_stds')
            self.config = model_data['config']
            self.is_fitted = True
            self.is_market_fitted = model_data.get('is_market_fitted', False)
            
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False


# =============================================================================
# UTILITIES
# =============================================================================

def analyze_regime_performance(prices: pd.DataFrame, regime_history: pd.DataFrame) -> Dict[str, Dict]:
    """Analyze performance by regime."""
    prices_copy = prices.copy()
    prices_copy['date'] = pd.to_datetime(prices_copy['date'])
    regime_history['date'] = pd.to_datetime(regime_history['date'])
    
    merged = prices_copy.merge(regime_history[['date', 'regime', 'market_regime', 'relative_strength']], 
                               on='date', how='inner')
    
    if len(merged) == 0:
        return {}
    
    merged['ret_1d'] = merged['close'].pct_change(1)
    merged['ret_5d_fwd'] = merged['close'].shift(-5) / merged['close'] - 1
    
    results = {}
    for regime in merged['regime'].unique():
        if pd.isna(regime):
            continue
        
        regime_data = merged[merged['regime'] == regime]
        if len(regime_data) < 10:
            continue
        
        results[regime] = {
            'n_days': len(regime_data),
            'pct_of_total': len(regime_data) / len(merged),
            'mean_daily_return': regime_data['ret_1d'].mean(),
            'volatility': regime_data['ret_1d'].std() * np.sqrt(252),
            'mean_5d_forward_return': regime_data['ret_5d_fwd'].mean(),
            'hit_rate_5d': (regime_data['ret_5d_fwd'] > 0).mean(),
            'avg_relative_strength': regime_data['relative_strength'].mean()
        }
    
    return results


def get_current_regime_context(ticker: str, market: str, engine: RegimeEngine = None) -> Dict:
    """Get current regime context for a ticker."""
    prices = load_price_history(ticker, market)
    if prices is None:
        return {'error': 'No price data available'}
    
    if engine is None:
        engine = RegimeEngine()
        engine.fit(prices)
        engine.fit_market_regime(market)
    
    regime_output = engine.predict_regime(prices, market)
    
    if regime_output is None:
        return {'error': 'Could not determine regime'}
    
    chars = RegimeEngine.REGIME_CHARACTERISTICS.get(regime_output.regime, {})
    
    return {
        'ticker': ticker,
        'market': market,
        'asset_regime': regime_output.regime,
        'asset_confidence': regime_output.confidence,
        'days_in_regime': regime_output.days_in_regime,
        'market_regime': regime_output.market_regime,
        'market_confidence': regime_output.market_regime_confidence,
        'relative_strength': regime_output.relative_regime_strength,
        'regime_divergence': regime_output.regime_divergence,
        'composite_score': regime_output.composite_regime_score,
        'vol_regime': regime_output.vol_regime,
        'trend_regime': regime_output.trend_regime,
        'regime_description': chars.get('description', ''),
        'transition_probabilities': regime_output.transition_probs
    }
