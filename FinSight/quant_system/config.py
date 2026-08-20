"""
FinSight Quant System Configuration
===================================

Institutional-grade configuration for the 14-layer quantitative system.

Version: v2.2-full-universe-14layer

EXECUTION RULES:
- FULL-UNIVERSE mode is MANDATORY
- Output path: public/intelligence/ only (public/insights DISABLED)
- Minimum 50 stocks per market required
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict
import os


# =============================================================================
# PATHS
# =============================================================================

# Base directory (FinSight root)
BASE_DIR = Path(__file__).parent.parent

# Data directories
DATA_DIR = BASE_DIR / "data"
US_DATA_DIR = DATA_DIR / "US"
IN_DATA_DIR = DATA_DIR / "IN"

# Model output directory
MODEL_OUTPUT_DIR = BASE_DIR / "quant_system" / "models"
MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Signal output directory
SIGNAL_OUTPUT_DIR = BASE_DIR / "quant_system" / "signals"
SIGNAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Backtest output directory
BACKTEST_OUTPUT_DIR = BASE_DIR / "quant_system" / "backtests"
BACKTEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# =============================================================================
# SIGNAL COLUMNS
# =============================================================================

SIGNAL_COLUMNS = [
    # Price momentum
    'ret_1d', 'ret_5d', 'ret_20d', 'ret_60d',
    'momentum_1m', 'momentum_3m', 'momentum_6m',
    
    # Volatility
    'vol_20d', 'vol_60d', 'vol_ratio',
    
    # Technical
    'rsi_14', 'macd_signal', 'bb_position',
    'sma_20_distance', 'sma_50_distance', 'sma_200_distance',
    
    # Valuation
    'pe_percentile', 'pb_percentile', 'ps_percentile',
    'ev_ebitda_percentile',
    
    # Quality
    'roe', 'roa', 'roic',
    'debt_to_equity', 'current_ratio',
    
    # Smart money
    'insider_net_buy', 'institutional_change',
    
    # Options derived
    'iv_percentile', 'put_call_ratio', 'oi_change'
]


# =============================================================================
# FORWARD RETURN HORIZONS
# =============================================================================

FORWARD_RETURN_HORIZONS = [1, 5, 20, 60]  # 1D, 1W, 1M, 3M


# =============================================================================
# CVAR CONFIDENCE LEVELS
# =============================================================================

CVAR_CONFIDENCE_LEVELS = [0.95, 0.99]


# =============================================================================
# BACKTEST PARAMETERS
# =============================================================================

BACKTEST_SLIPPAGE_BPS = 10  # 10 basis points
BACKTEST_COMMISSION_BPS = 5  # 5 basis points per trade


# =============================================================================
# MARKET BENCHMARKS (with fallbacks)
# =============================================================================

MARKET_BENCHMARKS = {
    'US': {
        'primary': 'SPY',
        'fallbacks': ['^GSPC', 'QQQ', 'IVV', 'VOO'],  # In order of preference
        'proxy_tickers': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],  # Large caps for synthetic
    },
    'IN': {
        'primary': 'NIFTY50',
        'fallbacks': ['NIFTYBEES.NS', '^NSEI'],
        'proxy_tickers': ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'],
    },
}


# =============================================================================
# LAYER CONFIGURATIONS
# =============================================================================

@dataclass
class RegimeConfig:
    """Configuration for Layer 2: Regime Engine"""
    n_regimes: int = 6
    regime_labels: List[str] = field(default_factory=lambda: [
        'accumulation', 'markup', 'distribution', 'markdown', 'panic', 'recovery'
    ])
    hmm_covariance_type: str = 'full'
    hmm_n_iter: int = 100
    min_observations: int = 60
    
    # Market benchmarks by region
    market_benchmarks: Dict[str, str] = field(default_factory=lambda: {
        'US': 'SPY',
        'IN': 'NIFTY50',
    })


@dataclass
class EfficacyConfig:
    """Configuration for Layer 3: Signal Efficacy"""
    train_window_days: int = 252  # 1 year
    test_window_days: int = 63    # 1 quarter
    min_observations: int = 30
    correlation_penalty_threshold: float = 0.7
    
    # SIGNAL FLOOR: Never drop below this many signals
    # Even if efficacy is low, keep top N for decision context
    min_signals_floor: int = 5
    
    # Mark low-confidence signals
    low_confidence_ic_threshold: float = 0.03  # IC below this = low confidence


@dataclass
class ProbabilityConfig:
    """Configuration for Layer 4: Probability Engine"""
    horizons: List[int] = field(default_factory=lambda: [5, 20, 60])
    cvar_levels: List[float] = field(default_factory=lambda: [0.95, 0.99])
    min_comparable_setups: int = 10


@dataclass
class BacktestConfig:
    """Configuration for Layer 5: Backtesting Engine"""
    initial_capital: float = 1_000_000
    slippage_bps: int = 10
    commission_bps: int = 5
    max_position_pct: float = 0.10
    strategy_name: str = "FinSight Quant Strategy"


@dataclass
class DecisionConfig:
    """Configuration for Layer 6: Decision Engine"""
    max_portfolio_risk_pct: float = 0.15
    max_single_position_pct: float = 0.10
    min_conviction_for_action: float = 0.30
    
    # Intent thresholds
    strong_conviction_threshold: float = 0.70
    moderate_conviction_threshold: float = 0.50


@dataclass
class LLMConfig:
    """Configuration for Layer 7: LLM Interpreter"""
    strict_mode: bool = True
    require_counterfactual: bool = True
    require_comparable_setups: bool = True
    
    # Forbidden language patterns to check
    check_price_predictions: bool = True
    check_certainty_language: bool = True


# =============================================================================
# DEFAULT CONFIGURATIONS
# =============================================================================

DEFAULT_REGIME_CONFIG = RegimeConfig()
DEFAULT_EFFICACY_CONFIG = EfficacyConfig()
DEFAULT_PROBABILITY_CONFIG = ProbabilityConfig()
DEFAULT_BACKTEST_CONFIG = BacktestConfig()
DEFAULT_DECISION_CONFIG = DecisionConfig()
DEFAULT_LLM_CONFIG = LLMConfig()


# =============================================================================
# ENVIRONMENT VARIABLES
# =============================================================================

def get_env_config():
    """Load configuration from environment variables."""
    return {
        'debug': os.getenv('FINSIGHT_DEBUG', 'false').lower() == 'true',
        'log_level': os.getenv('FINSIGHT_LOG_LEVEL', 'INFO'),
        'data_dir': os.getenv('FINSIGHT_DATA_DIR', str(DATA_DIR)),
    }
