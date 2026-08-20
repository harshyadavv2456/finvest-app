"""
Signal Registry - Single Source of Truth
=========================================

This is the formal signal taxonomy that connects:
- Layer 1 (Signal Factory) → registers signals
- Layer 3 (Efficacy) → consumes dynamically
- Layer 6 (Decision) → weights by regime

Key principles:
1. No hard-coded column lists scattered across layers
2. Regime-aware signal admission (not all signals valid in all regimes)
3. Dynamic discovery from actual data

Signal Types:
- momentum: Price-based directional signals
- volatility: Risk/uncertainty signals
- valuation: Fundamental value signals
- smart_money: Insider/institutional signals
- technical: TA-derived signals
- cross_asset: Relative performance signals
- derivatives: Options-derived signals
"""

from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, field
from enum import Enum
import pandas as pd
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# SIGNAL TYPES
# =============================================================================

class SignalType(Enum):
    """Categories of signals."""
    MOMENTUM = "momentum"
    VOLATILITY = "volatility"
    VALUATION = "valuation"
    SMART_MONEY = "smart_money"
    TECHNICAL = "technical"
    CROSS_ASSET = "cross_asset"
    DERIVATIVES = "derivatives"
    QUALITY = "quality"


class SignalDirection(Enum):
    """Expected direction of signal."""
    POSITIVE = "positive"   # Higher = bullish
    NEGATIVE = "negative"   # Higher = bearish
    NEUTRAL = "neutral"     # No directional bias


# =============================================================================
# REGIME-SIGNAL ADMISSION RULES
# =============================================================================

# Which signal types are ALLOWED in each regime
# This prevents signal collapse by only considering relevant signals
REGIME_SIGNAL_ADMISSION = {
    'accumulation': {
        SignalType.SMART_MONEY: 1.0,      # Primary signal
        SignalType.VALUATION: 0.8,         # Value matters here
        SignalType.VOLATILITY: 0.6,        # Low vol expected
        SignalType.TECHNICAL: 0.4,         # Less relevant
        SignalType.MOMENTUM: 0.3,          # Momentum often flat
        SignalType.CROSS_ASSET: 0.5,
        SignalType.DERIVATIVES: 0.5,
        SignalType.QUALITY: 0.7,
    },
    'markup': {
        SignalType.MOMENTUM: 1.0,          # Primary signal
        SignalType.TECHNICAL: 0.9,         # Trend confirmation
        SignalType.VOLATILITY: 0.5,        # Monitor expansion
        SignalType.CROSS_ASSET: 0.7,       # Relative strength
        SignalType.SMART_MONEY: 0.4,       # Less predictive here
        SignalType.VALUATION: 0.3,         # Often "expensive"
        SignalType.DERIVATIVES: 0.6,
        SignalType.QUALITY: 0.5,
    },
    'distribution': {
        SignalType.SMART_MONEY: 1.0,       # Watching for exits
        SignalType.VOLATILITY: 0.9,        # Rising vol
        SignalType.DERIVATIVES: 0.8,       # Put activity
        SignalType.MOMENTUM: 0.4,          # Often misleading
        SignalType.TECHNICAL: 0.5,
        SignalType.VALUATION: 0.6,         # Getting stretched
        SignalType.CROSS_ASSET: 0.7,
        SignalType.QUALITY: 0.6,
    },
    'markdown': {
        SignalType.VOLATILITY: 1.0,        # Primary risk signal
        SignalType.VALUATION: 0.9,         # Looking for value
        SignalType.SMART_MONEY: 0.7,       # Watching for buying
        SignalType.DERIVATIVES: 0.8,       # Fear metrics
        SignalType.MOMENTUM: 0.5,          # Can indicate oversold
        SignalType.TECHNICAL: 0.4,
        SignalType.CROSS_ASSET: 0.6,
        SignalType.QUALITY: 0.8,           # Flight to quality
    },
    'panic': {
        SignalType.VOLATILITY: 1.0,        # Extreme readings
        SignalType.DERIVATIVES: 1.0,       # Fear/greed
        SignalType.VALUATION: 0.8,         # Contrarian value
        SignalType.SMART_MONEY: 0.7,       # Capitulation signals
        SignalType.MOMENTUM: 0.3,          # Often whipsaws
        SignalType.TECHNICAL: 0.2,         # Breaks down
        SignalType.CROSS_ASSET: 0.5,
        SignalType.QUALITY: 0.9,
    },
    'recovery': {
        SignalType.MOMENTUM: 0.8,          # Early trend
        SignalType.SMART_MONEY: 0.9,       # Leading indicator
        SignalType.VOLATILITY: 0.7,        # Vol compression
        SignalType.VALUATION: 0.7,         # Still reasonable
        SignalType.TECHNICAL: 0.6,
        SignalType.DERIVATIVES: 0.6,
        SignalType.CROSS_ASSET: 0.7,
        SignalType.QUALITY: 0.6,
    },
}


# =============================================================================
# SIGNAL DEFINITION
# =============================================================================

@dataclass
class SignalDefinition:
    """Definition of a single signal."""
    name: str
    signal_type: SignalType
    direction: SignalDirection
    horizon: Optional[int] = None  # Days, if applicable
    description: str = ""
    
    # Metadata
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    requires_normalization: bool = True
    
    def get_regime_weight(self, regime: str) -> float:
        """Get this signal's weight for a given regime."""
        regime_weights = REGIME_SIGNAL_ADMISSION.get(regime, {})
        return regime_weights.get(self.signal_type, 0.5)


# =============================================================================
# SIGNAL REGISTRY
# =============================================================================

class SignalRegistry:
    """
    Single source of truth for all signals.
    
    Responsibilities:
    1. Define known signals with metadata
    2. Discover signals from actual data
    3. Filter signals by regime admission
    4. Provide regime-weighted signal lists
    """
    
    # Known signal patterns and their types
    # This maps column name patterns to signal definitions
    KNOWN_SIGNALS: Dict[str, SignalDefinition] = {
        # Momentum signals (returns)
        'ret_1d': SignalDefinition('ret_1d', SignalType.MOMENTUM, SignalDirection.POSITIVE, horizon=1, description='1-day return'),
        'ret_5d': SignalDefinition('ret_5d', SignalType.MOMENTUM, SignalDirection.POSITIVE, horizon=5, description='5-day return'),
        'ret_20d': SignalDefinition('ret_20d', SignalType.MOMENTUM, SignalDirection.POSITIVE, horizon=20, description='20-day return'),
        'ret_60d': SignalDefinition('ret_60d', SignalType.MOMENTUM, SignalDirection.POSITIVE, horizon=60, description='60-day return'),
        
        # Volatility signals
        'vol_20d': SignalDefinition('vol_20d', SignalType.VOLATILITY, SignalDirection.NEGATIVE, horizon=20, description='20-day realized volatility'),
        'vol_60d': SignalDefinition('vol_60d', SignalType.VOLATILITY, SignalDirection.NEGATIVE, horizon=60, description='60-day realized volatility'),
        
        # Technical signals
        'rsi_14': SignalDefinition('rsi_14', SignalType.TECHNICAL, SignalDirection.NEUTRAL, description='14-day RSI'),
        'macd_signal': SignalDefinition('macd_signal', SignalType.TECHNICAL, SignalDirection.POSITIVE, description='MACD histogram'),
        'bb_position': SignalDefinition('bb_position', SignalType.TECHNICAL, SignalDirection.NEUTRAL, description='Position in Bollinger Bands'),
        'sma_20_distance': SignalDefinition('sma_20_distance', SignalType.TECHNICAL, SignalDirection.POSITIVE, description='Distance from 20-day SMA'),
        'sma_50_distance': SignalDefinition('sma_50_distance', SignalType.TECHNICAL, SignalDirection.POSITIVE, description='Distance from 50-day SMA'),
        'sma_200_distance': SignalDefinition('sma_200_distance', SignalType.TECHNICAL, SignalDirection.POSITIVE, description='Distance from 200-day SMA'),
        
        # Valuation signals
        'pe_percentile': SignalDefinition('pe_percentile', SignalType.VALUATION, SignalDirection.NEGATIVE, description='PE ratio percentile'),
        'pb_percentile': SignalDefinition('pb_percentile', SignalType.VALUATION, SignalDirection.NEGATIVE, description='PB ratio percentile'),
        'ps_percentile': SignalDefinition('ps_percentile', SignalType.VALUATION, SignalDirection.NEGATIVE, description='PS ratio percentile'),
        
        # Quality signals
        'roe': SignalDefinition('roe', SignalType.QUALITY, SignalDirection.POSITIVE, description='Return on Equity'),
        'roa': SignalDefinition('roa', SignalType.QUALITY, SignalDirection.POSITIVE, description='Return on Assets'),
        'debt_to_equity': SignalDefinition('debt_to_equity', SignalType.QUALITY, SignalDirection.NEGATIVE, description='Debt to Equity ratio'),
        
        # Smart money signals
        'insider_net_buy': SignalDefinition('insider_net_buy', SignalType.SMART_MONEY, SignalDirection.POSITIVE, description='Net insider buying'),
        'institutional_change': SignalDefinition('institutional_change', SignalType.SMART_MONEY, SignalDirection.POSITIVE, description='Institutional ownership change'),
        
        # Derivatives signals
        'iv_percentile': SignalDefinition('iv_percentile', SignalType.DERIVATIVES, SignalDirection.NEGATIVE, description='Implied volatility percentile'),
        'put_call_ratio': SignalDefinition('put_call_ratio', SignalType.DERIVATIVES, SignalDirection.NEGATIVE, description='Put/Call ratio'),
    }
    
    # Minimum signals to maintain per type in floor scenario
    MIN_SIGNALS_PER_TYPE = {
        SignalType.MOMENTUM: 2,
        SignalType.VOLATILITY: 1,
        SignalType.TECHNICAL: 1,
    }
    
    def __init__(self):
        self.registered_signals: Dict[str, SignalDefinition] = {}
        self.discovered_signals: Set[str] = set()
    
    def register_signal(self, definition: SignalDefinition):
        """Register a new signal definition."""
        self.registered_signals[definition.name] = definition
        logger.debug(f"Registered signal: {definition.name} ({definition.signal_type.value})")
    
    def discover_signals_from_dataframe(self, df: pd.DataFrame) -> List[str]:
        """
        Discover which signals actually exist in the data.
        
        This is the key to dynamic signal handling.
        """
        discovered = []
        
        for col in df.columns:
            # Skip non-signal columns
            if col in ['date', 'ticker', 'close', 'open', 'high', 'low', 'volume']:
                continue
            
            # Check if it's a known signal
            if col in self.KNOWN_SIGNALS:
                definition = self.KNOWN_SIGNALS[col]
                self.registered_signals[col] = definition
                discovered.append(col)
            else:
                # Try to infer signal type from name
                inferred_def = self._infer_signal_definition(col)
                if inferred_def:
                    self.registered_signals[col] = inferred_def
                    discovered.append(col)
        
        self.discovered_signals = set(discovered)
        logger.info(f"Discovered {len(discovered)} signals in data: {discovered[:10]}...")
        
        return discovered
    
    def _infer_signal_definition(self, col_name: str) -> Optional[SignalDefinition]:
        """Infer signal type from column name pattern."""
        name_lower = col_name.lower()
        
        # Momentum patterns
        if name_lower.startswith('ret_') or 'return' in name_lower or 'momentum' in name_lower:
            horizon = self._extract_horizon(name_lower)
            return SignalDefinition(col_name, SignalType.MOMENTUM, SignalDirection.POSITIVE, horizon=horizon)
        
        # Volatility patterns
        if 'vol' in name_lower or 'volatility' in name_lower:
            horizon = self._extract_horizon(name_lower)
            return SignalDefinition(col_name, SignalType.VOLATILITY, SignalDirection.NEGATIVE, horizon=horizon)
        
        # Technical patterns
        if any(x in name_lower for x in ['rsi', 'macd', 'sma', 'ema', 'bb', 'bollinger']):
            return SignalDefinition(col_name, SignalType.TECHNICAL, SignalDirection.NEUTRAL)
        
        # Valuation patterns
        if any(x in name_lower for x in ['pe', 'pb', 'ps', 'valuation', 'ev_']):
            return SignalDefinition(col_name, SignalType.VALUATION, SignalDirection.NEGATIVE)
        
        # Quality patterns
        if any(x in name_lower for x in ['roe', 'roa', 'roic', 'margin', 'debt']):
            return SignalDefinition(col_name, SignalType.QUALITY, SignalDirection.POSITIVE)
        
        # Smart money patterns
        if any(x in name_lower for x in ['insider', 'institutional', '13f']):
            return SignalDefinition(col_name, SignalType.SMART_MONEY, SignalDirection.POSITIVE)
        
        # Derivatives patterns
        if any(x in name_lower for x in ['iv', 'option', 'put_call', 'oi']):
            return SignalDefinition(col_name, SignalType.DERIVATIVES, SignalDirection.NEUTRAL)
        
        # Unknown - still register as neutral
        logger.debug(f"Unknown signal pattern: {col_name}, registering as TECHNICAL")
        return SignalDefinition(col_name, SignalType.TECHNICAL, SignalDirection.NEUTRAL)
    
    def _extract_horizon(self, name: str) -> Optional[int]:
        """Extract horizon from signal name."""
        import re
        match = re.search(r'(\d+)d', name)
        if match:
            return int(match.group(1))
        return None
    
    def get_regime_admitted_signals(
        self,
        regime: str,
        available_signals: List[str],
        min_weight: float = 0.3
    ) -> List[str]:
        """
        Get signals that are admitted for a specific regime.
        
        Returns signals with regime weight >= min_weight.
        """
        admitted = []
        
        for signal_name in available_signals:
            if signal_name not in self.registered_signals:
                continue
            
            definition = self.registered_signals[signal_name]
            weight = definition.get_regime_weight(regime)
            
            if weight >= min_weight:
                admitted.append(signal_name)
        
        return admitted
    
    def get_signal_weights_for_regime(
        self,
        regime: str,
        available_signals: List[str]
    ) -> Dict[str, float]:
        """Get weight for each signal in a specific regime."""
        weights = {}
        
        for signal_name in available_signals:
            if signal_name not in self.registered_signals:
                weights[signal_name] = 0.5  # Default
                continue
            
            definition = self.registered_signals[signal_name]
            weights[signal_name] = definition.get_regime_weight(regime)
        
        return weights
    
    def get_floor_signals(
        self,
        regime: str,
        available_signals: List[str],
        min_total: int = 5
    ) -> List[str]:
        """
        Get minimum floor signals for a regime.
        
        Ensures we never have zero signals by:
        1. Taking highest-weighted signals for the regime
        2. Ensuring minimum representation per type
        """
        # Score each signal
        scored = []
        for signal_name in available_signals:
            if signal_name not in self.registered_signals:
                continue
            
            definition = self.registered_signals[signal_name]
            weight = definition.get_regime_weight(regime)
            scored.append((signal_name, weight, definition.signal_type))
        
        # Sort by weight descending
        scored.sort(key=lambda x: x[1], reverse=True)
        
        # Select top signals
        selected = []
        type_counts = {t: 0 for t in SignalType}
        
        # First pass: take highest weighted
        for name, weight, sig_type in scored:
            if len(selected) >= min_total:
                break
            selected.append(name)
            type_counts[sig_type] += 1
        
        # Second pass: ensure minimum per type
        for name, weight, sig_type in scored:
            if name in selected:
                continue
            
            min_required = self.MIN_SIGNALS_PER_TYPE.get(sig_type, 0)
            if type_counts[sig_type] < min_required:
                selected.append(name)
                type_counts[sig_type] += 1
        
        return selected
    
    def get_signal_info(self, signal_name: str) -> Optional[SignalDefinition]:
        """Get information about a specific signal."""
        return self.registered_signals.get(signal_name)
    
    def get_signals_by_type(self, signal_type: SignalType) -> List[str]:
        """Get all signals of a specific type."""
        return [
            name for name, defn in self.registered_signals.items()
            if defn.signal_type == signal_type
        ]
    
    def summarize(self) -> Dict[str, Any]:
        """Get summary of registered signals."""
        by_type = {}
        for name, defn in self.registered_signals.items():
            type_name = defn.signal_type.value
            if type_name not in by_type:
                by_type[type_name] = []
            by_type[type_name].append(name)
        
        return {
            'total_registered': len(self.registered_signals),
            'total_discovered': len(self.discovered_signals),
            'by_type': by_type
        }


# =============================================================================
# GLOBAL REGISTRY INSTANCE
# =============================================================================

# Singleton for easy access across layers
_global_registry: Optional[SignalRegistry] = None


def get_signal_registry() -> SignalRegistry:
    """Get the global signal registry instance."""
    global _global_registry
    if _global_registry is None:
        _global_registry = SignalRegistry()
    return _global_registry


def reset_signal_registry():
    """Reset the global registry (for testing)."""
    global _global_registry
    _global_registry = None

