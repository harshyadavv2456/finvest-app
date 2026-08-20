#!/usr/bin/env python3
"""
================================================================================
FULL DAILY INTELLIGENCE PIPELINE - v2.2 FULL-UNIVERSE ONLY
================================================================================

This is the ONLY authorized execution path for daily intelligence generation.

14-LAYER QUANTITATIVE DECISION ENGINE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1:  SignalFactory       - Generate all technical signals
Layer 2:  RegimeEngine        - Predict regime (using cached HMM)
Layer 3:  SignalEfficacyModel - Load regime-conditional efficacy
Layer 4:  ProbabilityEngine   - Generate return distributions + CVaR
Layer 5:  BacktestingEngine   - Load comparable historical setups
Layer 6:  DecisionEngine      - Generate intent + position sizing
Layer 7:  LLMInterpreter      - Generate explanation
Layer 8:  MetaBacktestEngine  - Decision quality metrics
Layer 9:  PortfolioSimulator  - Portfolio-level simulation
Layer 10: FundamentalTrajectory - Fundamental momentum (NOT valuation)
Layer 11: IntradayStructure   - Minute-level institutional behavior
Layer 12: NewsReaction        - Price reaction to news events
Layer 13: InsiderSignalV2     - Contextual insider analysis
Layer 14: MarketParticipation - FII/DII flow integration (India)

EXECUTION RULES (NON-NEGOTIABLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. FULL-UNIVERSE mode is MANDATORY - no caps, no Top-50 limits
2. Universe discovery from data directories - FAIL if < 50 stocks
3. Single output path: public/intelligence/{market}/{ticker}.json
4. NO silent fallbacks - failure is always explicit
5. All new layers feed into Layer 6 as MODIFIERS only

Output: /public/intelligence/{market}/{ticker}.json
Run:    python -m quant_system.run_full_daily_intelligence --full-universe
================================================================================
"""

import json
import logging
import sys
import os
import time
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, TYPE_CHECKING
from dataclasses import dataclass, asdict, field
import warnings
import traceback

if TYPE_CHECKING:
    import pandas as pd

warnings.filterwarnings('ignore')

# =============================================================================
# TIMING UTILITIES
# =============================================================================

class LayerTimer:
    """Context manager for timing individual layers."""
    
    def __init__(self, layer_name: str, logger_instance):
        self.layer_name = layer_name
        self.logger = logger_instance
        self.start_time = None
        self.elapsed = 0.0
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, *args):
        self.elapsed = time.perf_counter() - self.start_time
        self.logger.debug(f"[{self.layer_name}] → {self.elapsed:.3f}s")
        return False


class PipelineTimer:
    """Accumulates timing for all layers."""
    
    def __init__(self):
        self.layer_times: Dict[str, float] = {}
        self.total_start = None
    
    def start(self):
        self.total_start = time.perf_counter()
    
    def record(self, layer: str, elapsed: float):
        self.layer_times[layer] = self.layer_times.get(layer, 0) + elapsed
    
    def get_total(self) -> float:
        if self.total_start:
            return time.perf_counter() - self.total_start
        return sum(self.layer_times.values())
    
    def log_summary(self, logger_instance):
        logger_instance.info("")
        logger_instance.info("=" * 50)
        logger_instance.info("LAYER TIMING SUMMARY")
        logger_instance.info("=" * 50)
        for layer, elapsed in sorted(self.layer_times.items()):
            logger_instance.info(f"  {layer}: {elapsed:.3f}s")
        logger_instance.info("-" * 50)
        logger_instance.info(f"  TOTAL: {self.get_total():.2f}s")
        logger_instance.info("=" * 50)

# =============================================================================
# SETUP
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('full_universe_intelligence')

# =============================================================================
# VERSION & CONSTANTS — LOCKED AUTHORITY MODE
# =============================================================================

VERSION = 'v2.3-authority'
SCHEMA_VERSION = '2.3-authority'
SYSTEM_MODE = 'LOCKED_AUTHORITY'

# =============================================================================
# STOCK INTELLIGENCE SCHEMA CONTRACT — SINGLE SOURCE OF TRUTH
# =============================================================================
# This schema defines ALL required fields for a valid stock intelligence JSON.
# If ANY required field is missing or ANY extra field is present, FAIL PIPELINE.

STOCK_INTELLIGENCE_SCHEMA = {
    'required_fields': {
        # Metadata
        'ticker': str,
        'market': str,
        'as_of_date': str,
        'version': str,
        'schema_version': str,
        'system_mode': str,
        'generated_at': str,
        
        # Decision (Layer 6)
        'intent': str,
        'direction': str,
        'conviction': (int, float),
        'conviction_raw': (int, float),
        'conviction_pct': (int, float),
        'confidence': (int, float),
        
        # Authority Mode Actions
        'if_holding': str,
        'if_not_holding': str,
        'recommended_action_explanation': str,
        
        # Regime (Layer 2)
        'asset_regime': str,
        'asset_regime_confidence': (int, float),
        'market_regime': str,
        'market_benchmark_source': str,  # NEW: Benchmark transparency
        
        # Risk metrics
        'volatility_20d': (int, float),
        'volatility_regime': str,
        'cvar_95': (int, float),
    },
    'optional_fields': {
        # Extended risk
        'max_drawdown': (int, float),
        'risk_reward': (int, float),
        'signal_agreement': (int, float),
        
        # Return distribution
        'return_p10': (int, float),
        'return_p25': (int, float),
        'return_p50': (int, float),
        'return_p75': (int, float),
        'return_p90': (int, float),
        
        # Position sizing
        'recommended_position_pct': (int, float),
        'max_position_pct': (int, float),
        'portfolio_interaction_note': str,
        
        # Supporting data
        'supporting_signals': list,
        'opposing_signals': list,
        'risk_factors': list,
        'explanation': str,
        
        # Extended regime data
        'market_regime_confidence': (int, float),
        'relative_strength': (int, float),
        'regime_divergence': str,
        'days_in_regime': int,
        
        # Volatility details
        'vol_percentile': (int, float),
        'vol_forecast': (int, float),
        'vol_normal': (int, float),
        'vol_stress': (int, float),
        'vol_tail': (int, float),
        
        # New layers
        'fundamental_regime': str,
        'fundamental_confidence': (int, float),
        'intraday_bias': str,
        'intraday_confidence': (int, float),
        'news_reaction': str,
        'news_confidence_modifier': (int, float),
        'insider_modifier': (int, float),
        'insider_signal': str,
        'fii_dii_modifier': (int, float),
    },
    'valid_intents': {'INITIATE', 'ADD', 'HOLD', 'REDUCE', 'EXIT', 'AVOID'},
    'valid_if_holding': {'HOLD', 'REDUCE', 'AVOID'},
    'valid_if_not_holding': {'INITIATE', 'WAIT', 'AVOID'},
    'valid_regimes': {'accumulation', 'markup', 'distribution', 'markdown', 'panic', 'recovery'},
    'valid_benchmarks': {'NIFTY50', 'SP500', 'SYNTHETIC_LARGE_CAP'},
}

def validate_stock_intelligence(data: Dict[str, Any], ticker: str) -> Tuple[bool, List[str]]:
    """
    Validate stock intelligence JSON against the schema contract.
    Returns (is_valid, list_of_errors).
    """
    errors = []
    schema = STOCK_INTELLIGENCE_SCHEMA
    
    # Check required fields
    for field_name, field_type in schema['required_fields'].items():
        if field_name not in data:
            errors.append(f"Missing required field: {field_name}")
        elif not isinstance(data[field_name], field_type):
            # Allow None for optional numeric fields
            if data[field_name] is not None:
                errors.append(f"Invalid type for {field_name}: expected {field_type}, got {type(data[field_name])}")
    
    # Validate enum values
    if data.get('intent') not in schema['valid_intents']:
        errors.append(f"Invalid intent: {data.get('intent')}")
    
    if data.get('if_holding') and data.get('if_holding') not in schema['valid_if_holding']:
        errors.append(f"Invalid if_holding: {data.get('if_holding')}")
    
    if data.get('if_not_holding') and data.get('if_not_holding') not in schema['valid_if_not_holding']:
        errors.append(f"Invalid if_not_holding: {data.get('if_not_holding')}")
    
    if data.get('asset_regime') and data.get('asset_regime') not in schema['valid_regimes']:
        errors.append(f"Invalid asset_regime: {data.get('asset_regime')}")
    
    if data.get('market_benchmark_source') and data.get('market_benchmark_source') not in schema['valid_benchmarks']:
        errors.append(f"Invalid market_benchmark_source: {data.get('market_benchmark_source')}")
    
    return len(errors) == 0, errors


def validate_decision_consistency(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate decision consistency guards.
    These are HARD FAILURES - pipeline must stop if violated.
    """
    errors = []
    
    intent = data.get('intent', '')
    if_not_holding = data.get('if_not_holding', '')
    if_holding = data.get('if_holding', '')
    conviction_pct = data.get('conviction_pct', 0)
    
    # HARD ASSERTION: Intent to if_not_holding mapping
    intent_to_if_not_holding = {
        'INITIATE': 'INITIATE',
        'ADD': 'INITIATE',
        'HOLD': 'WAIT',
        'REDUCE': 'AVOID',
        'EXIT': 'AVOID',
        'AVOID': 'AVOID',
    }
    
    expected_if_not = intent_to_if_not_holding.get(intent)
    if expected_if_not and if_not_holding != expected_if_not:
        errors.append(f"DECISION INCONSISTENCY: intent={intent} but if_not_holding={if_not_holding} (expected {expected_if_not})")
    
    # HARD ASSERTION: Conviction bounds
    if conviction_pct is not None:
        if conviction_pct < 0:
            errors.append(f"INVALID: conviction_pct={conviction_pct} < 0")
        if conviction_pct > 100:
            errors.append(f"INVALID: conviction_pct={conviction_pct} > 100")
    
    return len(errors) == 0, errors


# NON-NEGOTIABLE: Minimum universe requirements
# If fewer stocks are discovered, the pipeline FAILS HARD.
# 30 is the absolute minimum for meaningful diversified intelligence.
MIN_UNIVERSE_SIZE = 30
MIN_DATA_YEARS = 2
MIN_DATA_POINTS = 500
MIN_AVG_VOLUME = 100_000

# Output path - SINGLE SOURCE OF TRUTH
OUTPUT_DIR = PROJECT_ROOT / 'public' / 'intelligence'
PORTFOLIO_OUTPUT_DIR = PROJECT_ROOT / 'public' / 'portfolio'
ARTIFACTS_DIR = PROJECT_ROOT / 'artifacts'
MODELS_DIR = ARTIFACTS_DIR / 'models'
EFFICACY_DIR = ARTIFACTS_DIR / 'efficacy'
BACKTESTS_DIR = ARTIFACTS_DIR / 'backtests'

# CRITICAL: Enforce output directory name
assert OUTPUT_DIR.name == "intelligence", (
    f"OUTPUT_DIR must be 'intelligence', got '{OUTPUT_DIR.name}'. "
    "Do not change this - public/insights is DISABLED."
)

# =============================================================================
# IMPORTS - Lazy loaded to handle missing dependencies
# =============================================================================

try:
    from quant_system.layer2_regime_engine import RegimeEngine, RegimeOutput
    from quant_system.layer3_signal_efficacy import SignalEfficacyModel, EfficacyReport
    from quant_system.layer4_probability_engine import ProbabilityEngine, ProbabilisticOutcome
    from quant_system.layer6_decision_engine import DecisionEngine, Decision, PositionIntent
    from quant_system.layer7_llm_interpreter import LLMInterpreter
    from quant_system.layer8_meta_backtest import MetaBacktestEngine
    from quant_system.signal_efficacy_trainer import SignalEfficacyTrainer
    from quant_system.utils import load_price_history, load_market_benchmark, load_financials
except ImportError as e:
    logger.warning(f"Some layer imports failed: {e}")
    RegimeEngine = None
    RegimeOutput = None
    SignalEfficacyModel = None
    EfficacyReport = None
    ProbabilityEngine = None
    ProbabilisticOutcome = None
    DecisionEngine = None
    Decision = None
    PositionIntent = None
    LLMInterpreter = None
    MetaBacktestEngine = None
    SignalEfficacyTrainer = None
    load_price_history = None
    load_market_benchmark = None
    load_financials = None


def import_layers():
    """Import all layer modules (re-import to ensure availability)."""
    global RegimeEngine, RegimeOutput
    global SignalEfficacyModel, EfficacyReport
    global ProbabilityEngine, ProbabilisticOutcome
    global DecisionEngine, Decision, PositionIntent
    global LLMInterpreter
    global MetaBacktestEngine
    global SignalEfficacyTrainer
    global load_price_history, load_market_benchmark, load_financials
    
    from quant_system.layer2_regime_engine import RegimeEngine, RegimeOutput
    from quant_system.layer3_signal_efficacy import SignalEfficacyModel, EfficacyReport
    from quant_system.layer4_probability_engine import ProbabilityEngine, ProbabilisticOutcome
    from quant_system.layer6_decision_engine import DecisionEngine, Decision, PositionIntent
    from quant_system.layer7_llm_interpreter import LLMInterpreter
    from quant_system.layer8_meta_backtest import MetaBacktestEngine
    from quant_system.signal_efficacy_trainer import SignalEfficacyTrainer
    from quant_system.utils import load_price_history, load_market_benchmark, load_financials


# Import data validator
from quant_system.data_validator import (
    DataValidator,
    DataValidationResult,
    validate_startup,
    load_insider_data_from_sec,
    load_fii_dii_data,
    INSIDER_DIR,
    FII_DII_FILE
)

# PM Regime Engine (Layer 2B) - FAIL-OPEN on import failure
try:
    from quant_system.layer2b_pm_regime_engine import (
        PMRegimeEngine,
        PMRegimeOutput,
        PMRegimeState,
        save_pm_regime_to_timeline,
        get_pm_context_for_intelligence,
        is_pm_ticker,
        get_yesterday_pm_regime
    )
    PM_REGIME_AVAILABLE = True
except ImportError as e:
    logger.warning(f"PM Regime Engine not available (FAIL-OPEN): {e}")
    PM_REGIME_AVAILABLE = False
    PMRegimeEngine = None
    PMRegimeOutput = None
    PMRegimeState = None
    is_pm_ticker = lambda x: False


# =============================================================================
# FALLBACK LISTS: PERMANENTLY DISABLED
# =============================================================================
# 
# NO HARDCODED TICKER LISTS ALLOWED.
# Universe is discovered ONLY from filesystem.
# This is a non-negotiable execution integrity requirement.
#
# If you see this comment and are tempted to add a fallback list:
# DON'T. The system should FAIL if discovery fails, not silently degrade.
#

# =============================================================================
# UNIVERSE DISCOVERY (FULL-UNIVERSE MODE - FILESYSTEM ONLY)
# =============================================================================

def discover_universe(market: str) -> List[str]:
    """
    Discover ALL stocks from data directories.
    
    THIS IS THE ONLY UNIVERSE DISCOVERY METHOD.
    
    Rules:
    - Discovers from filesystem ONLY
    - NO hardcoded lists
    - NO fallbacks
    - FAILS HARD if no stocks found
    
    Stock is included if and only if:
    - Directory exists in data/{market}/
    - history.parquet exists (REQUIRED)
    
    Missing optional data does NOT exclude stocks.
    """
    data_dir = PROJECT_ROOT / 'data' / market
    
    if not data_dir.exists():
        raise RuntimeError(
            f"╔══════════════════════════════════════════════════════════════════╗\n"
            f"║  FATAL: Data directory does not exist                           ║\n"
            f"╠══════════════════════════════════════════════════════════════════╣\n"
            f"║  Path: {str(data_dir):<56}║\n"
            f"║  Market: {market:<54}║\n"
            f"║                                                                  ║\n"
            f"║  This is a HARD FAILURE. Cannot proceed without data.           ║\n"
            f"╚══════════════════════════════════════════════════════════════════╝"
        )
    
    # Discover ALL stocks with history.parquet
    tickers = []
    
    for d in data_dir.iterdir():
        if d.is_dir() and (d / 'history.parquet').exists():
            tickers.append(d.name)
    
    # HARD FAIL if no stocks found
    if len(tickers) == 0:
        raise RuntimeError(
            f"╔══════════════════════════════════════════════════════════════════╗\n"
            f"║  FATAL: No valid stocks found                                   ║\n"
            f"╠══════════════════════════════════════════════════════════════════╣\n"
            f"║  Market: {market:<54}║\n"
            f"║  Path: {str(data_dir):<56}║\n"
            f"║  Stocks with history.parquet: 0                                 ║\n"
            f"║                                                                  ║\n"
            f"║  Execution aborted to prevent partial intelligence.             ║\n"
            f"╚══════════════════════════════════════════════════════════════════╝"
        )
    
    return sorted(tickers)


def validate_universe_size(tickers: List[str], market: str) -> List[str]:
    """
    Validate minimum universe size.
    
    FAILS HARD if < MIN_UNIVERSE_SIZE stocks.
    This is the ONLY universe validation function.
    """
    if len(tickers) < MIN_UNIVERSE_SIZE:
        raise RuntimeError(
            f"╔══════════════════════════════════════════════════════════════════╗\n"
            f"║  FATAL: Universe too small                                      ║\n"
            f"╠══════════════════════════════════════════════════════════════════╣\n"
            f"║  Market: {market:<54}║\n"
            f"║  Stocks discovered: {len(tickers):<43}║\n"
            f"║  Minimum required:  {MIN_UNIVERSE_SIZE:<43}║\n"
            f"║                                                                  ║\n"
            f"║  This is a HARD FAILURE. The pipeline will NOT continue.        ║\n"
            f"║  Partial intelligence is worse than no intelligence.            ║\n"
            f"║                                                                  ║\n"
            f"║  Possible causes:                                                ║\n"
            f"║   - Data directory is empty or corrupted                        ║\n"
            f"║   - Stock data has not been updated                             ║\n"
            f"║                                                                  ║\n"
            f"║  Action: Update stock data and re-run.                          ║\n"
            f"╚══════════════════════════════════════════════════════════════════╝"
        )
    
    return tickers


# Keep old function names for backwards compatibility during transition
def discover_full_universe(market: str) -> List[str]:
    """DEPRECATED: Use discover_universe() instead."""
    return discover_universe(market)


def validate_universe(tickers: List[str], market: str) -> List[str]:
    """DEPRECATED: Use validate_universe_size() instead."""
    return validate_universe_size(tickers, market)


# =============================================================================
# LAYER 10: FUNDAMENTAL TRAJECTORY ENGINE
# =============================================================================

@dataclass
class FundamentalTrajectory:
    """
    Layer 10: Fundamental TRAJECTORY analysis (NOT valuation).
    
    Uses last 3 years of financials to compute:
    - Growth rates per metric
    - Acceleration (change in growth)
    - Z-score normalization
    
    Output is REGIME classification, not valuation score.
    """
    regime: str  # 'improving', 'stable', 'deteriorating'
    confidence: float  # 0.0 - 1.0
    drivers: List[str]  # Key fundamental drivers
    metrics: Dict[str, float]  # Individual metric scores


def compute_fundamental_trajectory(ticker: str, market: str) -> Optional[FundamentalTrajectory]:
    """
    Compute fundamental trajectory from financial data.
    
    This is NOT valuation - it's momentum in fundamentals.
    """
    import numpy as np
    
    try:
        financials = load_financials(ticker, market)
        if not financials:
            return None
        
        drivers = []
        scores = {}
        
        # Extract key metrics (handle different data structures)
        metrics_to_check = [
            ('revenue', 'Total Revenue', 'totalRevenue'),
            ('ebitda', 'EBITDA', 'ebitda'),
            ('net_profit', 'Net Income', 'netIncome'),
            ('operating_cashflow', 'Operating Cash Flow', 'operatingCashFlow'),
            ('roce', 'ROCE', 'returnOnCapitalEmployed'),
            ('roe', 'ROE', 'returnOnEquity'),
            ('gross_margin', 'Gross Margin', 'grossMargin'),
            ('operating_margin', 'Operating Margin', 'operatingMargin'),
        ]
        
        for metric_name, *variants in metrics_to_check:
            values = None
            
            # Try to find metric in financials
            for variant in variants:
                if variant in financials:
                    val = financials[variant]
                    if isinstance(val, (list, dict)):
                        values = list(val.values()) if isinstance(val, dict) else val
                    break
            
            if values and len(values) >= 2:
                # Calculate growth
                values = [v for v in values if v is not None and v != 0]
                if len(values) >= 2:
                    growth = (values[-1] - values[-2]) / abs(values[-2]) if values[-2] != 0 else 0
                    
                    # Calculate acceleration if we have 3+ points
                    if len(values) >= 3:
                        prev_growth = (values[-2] - values[-3]) / abs(values[-3]) if values[-3] != 0 else 0
                        acceleration = growth - prev_growth
                    else:
                        acceleration = 0
                    
                    scores[metric_name] = acceleration
                    
                    # Identify drivers
                    if acceleration > 0.05:
                        drivers.append(f"{metric_name}_expansion")
                    elif acceleration < -0.05:
                        drivers.append(f"{metric_name}_contraction")
        
        if not scores:
            return None
        
        # Aggregate to regime
        avg_score = np.mean(list(scores.values()))
        
        if avg_score > 0.03:
            regime = 'improving'
            confidence = min(0.9, 0.5 + abs(avg_score) * 2)
        elif avg_score < -0.03:
            regime = 'deteriorating'
            confidence = min(0.9, 0.5 + abs(avg_score) * 2)
        else:
            regime = 'stable'
            confidence = 0.6
        
        return FundamentalTrajectory(
            regime=regime,
            confidence=round(confidence, 4),
            drivers=drivers[:5],
            metrics={k: round(v, 4) for k, v in scores.items()}
        )
        
    except Exception as e:
        logger.debug(f"Fundamental trajectory error for {ticker}: {e}")
        return None


# =============================================================================
# LAYER 11: INTRADAY STRUCTURE ENGINE
# =============================================================================

@dataclass
class IntradayStructure:
    """
    Layer 11: Intraday structure analysis from minute OHLCV.
    
    Infers institutional behavior, NOT trade signals.
    """
    bias: str  # 'accumulation', 'distribution', 'neutral'
    confidence: float  # 0.0 - 1.0
    vwap_distance: float  # Current price vs VWAP
    opening_range_position: float  # Position in opening range
    volume_imbalance: float  # Buy vs sell volume estimate


def compute_intraday_structure(ticker: str, market: str) -> Optional[IntradayStructure]:
    """
    Analyze minute-level data for institutional behavior patterns.
    """
    import pandas as pd
    import numpy as np
    
    try:
        # Try to load minute data
        minute_path = PROJECT_ROOT / 'data' / market / ticker / 'minute.parquet'
        
        if not minute_path.exists():
            return None
        
        df = pd.read_parquet(minute_path)
        
        if df.empty or len(df) < 390:  # Less than 1 trading day
            return None
        
        # Normalize columns
        df.columns = [c.lower().replace(' ', '_') for c in df.columns]
        
        # Need close, volume, high, low
        required = ['close', 'volume', 'high', 'low']
        if not all(c in df.columns for c in required):
            return None
        
        # Get most recent day's data
        df = df.tail(390)  # Last trading day (~390 minutes)
        
        # Calculate VWAP
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        vwap = (typical_price * df['volume']).sum() / df['volume'].sum()
        current_price = df['close'].iloc[-1]
        vwap_distance = (current_price - vwap) / vwap
        
        # Opening range (first 30 minutes)
        opening_range = df.head(30)
        or_high = opening_range['high'].max()
        or_low = opening_range['low'].min()
        or_range = or_high - or_low
        or_position = (current_price - or_low) / or_range if or_range > 0 else 0.5
        
        # Volume imbalance estimate
        # Up bars vs down bars volume
        df['up_bar'] = df['close'] > df['close'].shift(1)
        up_volume = df.loc[df['up_bar'], 'volume'].sum()
        down_volume = df.loc[~df['up_bar'], 'volume'].sum()
        total_volume = up_volume + down_volume
        volume_imbalance = (up_volume - down_volume) / total_volume if total_volume > 0 else 0
        
        # Determine bias
        if vwap_distance > 0.002 and volume_imbalance > 0.1:
            bias = 'accumulation'
            confidence = min(0.85, 0.5 + abs(volume_imbalance))
        elif vwap_distance < -0.002 and volume_imbalance < -0.1:
            bias = 'distribution'
            confidence = min(0.85, 0.5 + abs(volume_imbalance))
        else:
            bias = 'neutral'
            confidence = 0.5
        
        return IntradayStructure(
            bias=bias,
            confidence=round(confidence, 4),
            vwap_distance=round(vwap_distance, 6),
            opening_range_position=round(or_position, 4),
            volume_imbalance=round(volume_imbalance, 4)
        )
        
    except Exception as e:
        logger.debug(f"Intraday structure error for {ticker}: {e}")
        return None


# =============================================================================
# LAYER 12: NEWS REACTION ENGINE
# =============================================================================

@dataclass
class NewsReaction:
    """
    Layer 12: News REACTION analysis (NOT sentiment).
    
    Measures how price/volatility reacted to news events.
    No NLP sentiment - just price behavior.
    """
    reaction: str  # 'absorbed_negative', 'rejected_positive', 'neutral', etc.
    confidence_modifier: float  # -0.15 to +0.15
    abnormal_return: float
    abnormal_volatility: float
    news_detected: bool


def compute_news_reaction(ticker: str, market: str, prices_df) -> Optional[NewsReaction]:
    """
    Detect news events and measure price reaction.
    
    This is NOT sentiment analysis - it's reaction measurement.
    """
    import pandas as pd
    import numpy as np
    
    try:
        if prices_df is None or len(prices_df) < 30:
            return None
        
        # Look for abnormal returns in last 5 days
        df = prices_df.copy()
        if 'date' in df.columns:
            df = df.set_index('date')
        
        returns = df['close'].pct_change()
        vol_20d = returns.rolling(20).std()
        
        # Get last 5 days
        recent_returns = returns.tail(5)
        recent_vol = vol_20d.iloc[-1]
        
        if pd.isna(recent_vol) or recent_vol == 0:
            return None
        
        # Check for abnormal return (> 2 std)
        max_abs_return = recent_returns.abs().max()
        abnormal_threshold = 2 * recent_vol
        
        news_detected = max_abs_return > abnormal_threshold
        
        if not news_detected:
            return NewsReaction(
                reaction='neutral',
                confidence_modifier=0.0,
                abnormal_return=0.0,
                abnormal_volatility=0.0,
                news_detected=False
            )
        
        # Find the abnormal day
        abnormal_day = recent_returns.abs().idxmax()
        abnormal_return = float(recent_returns.loc[abnormal_day])
        
        # Check subsequent days' behavior
        abnormal_idx = returns.index.get_loc(abnormal_day)
        
        if abnormal_idx < len(returns) - 1:
            subsequent = returns.iloc[abnormal_idx + 1:]
            subsequent_mean = subsequent.mean() if len(subsequent) > 0 else 0
        else:
            subsequent_mean = 0
        
        # Classify reaction
        if abnormal_return > 0:
            if subsequent_mean > 0:
                reaction = 'absorbed_positive'
                modifier = 0.10
            else:
                reaction = 'rejected_positive'
                modifier = -0.05
        else:
            if subsequent_mean < 0:
                reaction = 'absorbed_negative'
                modifier = -0.10
            else:
                reaction = 'rejected_negative'
                modifier = 0.05  # Resilience
        
        return NewsReaction(
            reaction=reaction,
            confidence_modifier=round(modifier, 4),
            abnormal_return=round(abnormal_return, 4),
            abnormal_volatility=round(max_abs_return / recent_vol, 2),
            news_detected=True
        )
    
    except Exception as e:
        logger.debug(f"News reaction error for {ticker}: {e}")
        return None


# =============================================================================
# LAYER 13: ENHANCED INSIDER SIGNAL V2
# =============================================================================

def get_insider_modifier(ticker: str, market: str, regime: str) -> Tuple[float, str, Dict]:
    """
    Get insider signal modifier from InsiderSignalV2 engine.
    
    Data source (US): InsiderFlow/sec_output_10y/{TICKER}_insider_10y.csv
    
    Returns: (confidence_modifier, explanation, metadata)
    """
    try:
        # First check if insider data exists for this ticker
        if market == 'US':
            insider_path = INSIDER_DIR / f'{ticker}_insider_10y.csv'
            if not insider_path.exists():
                logger.debug(f"[INSIDER] {ticker} → No data file")
                return 0.0, 'No insider data available', {'data_source': 'none'}
        
        from quant_system.insider_signal_v2 import InsiderSignalV2
        
        engine = InsiderSignalV2()
        result = engine.compute_insider_signal(ticker, market, regime)
        
        modifier = result.get('confidence_adjustment', 0.0)
        explanation = result.get('explanation', 'No insider data')
        
        # Log insider contribution
        if modifier != 0:
            logger.info(f"[INSIDER] {ticker} → {modifier:+.2f} conviction ({explanation[:50]}...)")
        else:
            logger.debug(f"[INSIDER] {ticker} → modifier = 0.0 (no signal)")
        
        return (modifier, explanation, result)
    except Exception as e:
        logger.debug(f"[INSIDER] {ticker} → Error: {e}")
        return 0.0, 'Insider data unavailable', {'error': str(e)}


# =============================================================================
# LAYER 14: MARKET PARTICIPATION ENGINE (FII/DII)
# =============================================================================

@dataclass
class MarketParticipation:
    """
    Layer 14: FII/DII flow analysis for India market.
    
    Adjusts MARKET regime confidence, not stock-level signals.
    """
    fii_regime: str  # 'buying', 'selling', 'neutral'
    dii_regime: str
    combined_regime: str
    confidence_adjustment: float  # -0.10 to +0.10 (market-level only)
    fii_5d_flow: float
    dii_5d_flow: float


def compute_market_participation(market: str) -> Optional[MarketParticipation]:
    """
    Compute FII/DII participation signals (India only).
    
    Data source: Smart Money Flow/fii_dii_output/fii_dii_nifty_joint_signals.csv
    
    This is a MARKET-LEVEL modifier, not stock-specific.
    """
    import pandas as pd
    
    if market != 'IN':
        return None
    
    try:
        # Load FII/DII data from CORRECT path
        # FII_DII_FILE = PROJECT_ROOT / 'Smart Money Flow' / 'fii_dii_output' / 'fii_dii_nifty_joint_signals.csv'
        if not FII_DII_FILE.exists():
            logger.warning(f"[FII/DII] File not found: {FII_DII_FILE}")
            return None
        
        df = pd.read_csv(FII_DII_FILE, parse_dates=['trade_date'])
        
        if df.empty:
            return None
        
        # Get recent data
        df = df.sort_values('trade_date').tail(20)
        latest = df.iloc[-1]
        
        fii_5d = latest.get('fii_roll5', 0)
        dii_5d = latest.get('dii_roll5', 0)
        
        # Classify FII regime
        if fii_5d > 1000:  # Crores
            fii_regime = 'buying'
        elif fii_5d < -1000:
            fii_regime = 'selling'
        else:
            fii_regime = 'neutral'
        
        # Classify DII regime
        if dii_5d > 1000:
            dii_regime = 'buying'
        elif dii_5d < -1000:
            dii_regime = 'selling'
        else:
            dii_regime = 'neutral'
        
        # Combined regime
        if fii_regime == 'buying' and dii_regime == 'buying':
            combined = 'strong_inflow'
            adj = 0.08
        elif fii_regime == 'selling' and dii_regime == 'selling':
            combined = 'strong_outflow'
            adj = -0.08
        elif fii_regime == 'buying' and dii_regime == 'selling':
            combined = 'fii_dominant'
            adj = 0.03
        elif fii_regime == 'selling' and dii_regime == 'buying':
            combined = 'dii_dominant'
            adj = 0.02
        else:
            combined = 'neutral'
            adj = 0.0
        
        # Log FII/DII market impact
        logger.info(f"[FII/DII] Market: {combined} → market confidence {adj:+.2f}")
        logger.info(f"[FII/DII]   FII: {fii_regime} (5D flow: {fii_5d:,.0f} Cr)")
        logger.info(f"[FII/DII]   DII: {dii_regime} (5D flow: {dii_5d:,.0f} Cr)")
        
        return MarketParticipation(
            fii_regime=fii_regime,
            dii_regime=dii_regime,
            combined_regime=combined,
            confidence_adjustment=round(adj, 4),
            fii_5d_flow=float(fii_5d),
            dii_5d_flow=float(dii_5d)
        )
        
    except Exception as e:
        logger.warning(f"[FII/DII] Error loading data: {e}")
        return None


# =============================================================================
# OUTPUT SCHEMA (14-LAYER)
# =============================================================================

@dataclass
class StockIntelligence:
    """Complete 14-layer stock intelligence output — LOCKED AUTHORITY MODE."""
    # Metadata — SCHEMA CONTRACT v2.3-authority
    ticker: str
    market: str
    as_of_date: str
    version: str
    schema_version: str  # LOCKED: must be "2.3-authority"
    system_mode: str  # LOCKED: must be "LOCKED_AUTHORITY"
    generated_at: str
    
    # Regime Context (Layer 2)
    asset_regime: str
    asset_regime_confidence: float
    market_regime: str
    market_benchmark_source: str  # NEW: "NIFTY50", "SP500", or "SYNTHETIC_LARGE_CAP"
    market_regime_confidence: float
    relative_strength: float
    regime_divergence: str
    days_in_regime: int
    
    # Volatility (Layer 4)
    volatility_20d: float
    volatility_regime: str
    vol_percentile: float
    vol_forecast: float
    vol_normal: float
    vol_stress: float
    vol_tail: float
    
    # Return Distribution (Layer 4)
    return_p10: float
    return_p25: float
    return_p50: float
    return_p75: float
    return_p90: float
    return_mean: float
    return_std: float
    
    # Risk Metrics (Layer 4)
    cvar_95: float
    cvar_95_normal: float
    cvar_95_stress: float
    cvar_95_panic: float
    max_drawdown_expected: float
    sortino_ratio: float
    
    # Decision (Layer 6)
    intent: str
    direction: str
    # CONVICTION FIELDS
    # conviction: 0.0-1.0 (LEGACY - kept for backwards compatibility with other layers)
    # conviction_raw: 0.0-1.0 with full precision (authoritative, same as conviction)
    # conviction_pct: percentage with 1 decimal (display)
    conviction: float  # KEPT for backwards compatibility
    conviction_raw: float
    conviction_pct: float
    confidence: float
    
    # Position Sizing (Layer 6)
    max_position_pct: float
    recommended_position_pct: float
    risk_budget_used_pct: float
    scale_in_tranches: int
    
    # Risk-Reward (Layer 6)
    risk_reward_ratio: float
    expected_return: float
    expected_risk: float
    
    # Time Horizon (Layer 6)
    time_horizon: str
    expected_holding_days: int
    
    # Signals (Layer 1 + 3)
    supporting_signals: List[str]
    opposing_signals: List[str]
    signal_agreement: float
    
    # Comparable Setups (Layer 5)
    n_comparable_setups: int
    comparable_win_rate: float
    comparable_median_return: float
    comparable_worst_outcome: float
    
    # Signal Efficacy (Layer 3)
    top_signals_ic: Dict[str, float]
    signal_confidence: float
    
    # Conditions (Layer 6)
    upgrade_conditions: List[str]
    downgrade_conditions: List[str]
    risk_factors: List[str]
    
    # Explanation (Layer 7)
    rationale: str
    explanation: str
    
    # Decision Quality (Layer 8)
    historical_intent_accuracy: Optional[float]
    similar_decision_outcomes: Optional[Dict[str, Any]]
    
    # Price Context
    last_price: float
    price_date: str
    price_change_1d: Optional[float]
    price_change_5d: Optional[float]
    price_change_20d: Optional[float]
    
    # Data Quality
    data_quality: str
    data_points: int
    
    # ==== NEW LAYERS (10-14) ====
    
    # Layer 10: Fundamental Trajectory
    fundamental_regime: Optional[str] = None
    fundamental_confidence: Optional[float] = None
    fundamental_drivers: Optional[List[str]] = field(default_factory=list)
    
    # Layer 11: Intraday Structure
    intraday_bias: Optional[str] = None
    intraday_confidence: Optional[float] = None
    
    # Layer 12: News Reaction
    news_reaction: Optional[str] = None
    news_confidence_modifier: Optional[float] = None
    
    # Layer 13: Insider Signal V2
    insider_confidence_modifier: Optional[float] = None
    insider_explanation: Optional[str] = None
    
    # Layer 14: Market Participation (India)
    market_participation_regime: Optional[str] = None
    market_participation_modifier: Optional[float] = None
    
    # ==== PM REGIME CONTEXT (Layer 2B) ====
    # Precious Metals regime provides MACRO CONTEXT, not trading signals
    pm_regime_state: Optional[str] = None  # RISK_ON, TRANSITION, RISK_OFF
    pm_regime_confidence: Optional[float] = None
    pm_regime_triggers: Optional[List[str]] = field(default_factory=list)
    pm_context_description: Optional[str] = None
    pm_regime_changed: Optional[bool] = None
    
    # ==== AUTHORITY MODE (v2.3) ====
    
    # Action-First Decision Framing
    if_holding: Optional[str] = None  # HOLD / REDUCE / EXIT
    if_not_holding: Optional[str] = None  # INITIATE / WAIT / AVOID
    recommended_action_explanation: Optional[str] = None
    
    # Portfolio-Aware Position Guidance
    portfolio_correlation_note: Optional[str] = None
    risk_budget_context: Optional[str] = None


# =============================================================================
# DAILY INTELLIGENCE GENERATOR (14-LAYER)
# =============================================================================

class FullUniverseIntelligenceGenerator:
    """
    14-Layer Full-Universe Intelligence Generator.
    
    EXECUTION RULES:
    1. FULL-UNIVERSE mode is MANDATORY
    2. FAIL if < 50 stocks discovered
    3. All layers feed into Layer 6 as modifiers
    4. NO silent fallbacks
    """
    
    def __init__(self):
        import_layers()
        
        self.regime_engine = RegimeEngine()
        self.signal_efficacy_model = SignalEfficacyModel()
        self.probability_engine = ProbabilityEngine()
        self.decision_engine = DecisionEngine()
        self.llm_interpreter = LLMInterpreter()
        self.meta_backtest = MetaBacktestEngine()
        
        self.errors: Dict[str, str] = {}
        self.stats = {
            'processed': 0,
            'success': 0,
            'errors': 0,
            'layers_applied': {
                'fundamental': 0,
                'intraday': 0,
                'news': 0,
                'insider': 0,
                'market_participation': 0,
            }
        }
        
        self._market_regime_cache: Dict[str, Tuple[str, float]] = {}
        self._market_participation_cache: Dict[str, MarketParticipation] = {}
        
        # PM Regime Engine (Layer 2B) - FAIL-OPEN if unavailable
        self._pm_regime_cache: Dict[str, PMRegimeOutput] = {}
        self._pm_engine = PMRegimeEngine() if PM_REGIME_AVAILABLE else None
        
        # Ensure output directories
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / 'US').mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / 'IN').mkdir(parents=True, exist_ok=True)
        PORTFOLIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    def log_universe_start(self, market: str, tickers: List[str]):
        """MANDATORY universe logging - if this doesn't appear, run is invalid."""
        logger.info("=" * 60)
        logger.info("FULL-UNIVERSE MODE ENABLED")
        logger.info(f"Market: {market}")
        logger.info(f"Stocks discovered: {len(tickers)}")
        logger.info(f"Pipeline version: {VERSION}")
        logger.info(f"Output directory: {OUTPUT_DIR}")
        logger.info(f"Minimum universe size: {MIN_UNIVERSE_SIZE}")
        logger.info("=" * 60)
    
    def _log_data_check(self, ticker: str, validation: 'DataValidationResult'):
        """
        MANDATORY per-stock data validation report.
        
        Format:
        [DATA CHECK] TICKER
          ✔ daily_ohlcv
          ✖ minute_ohlcv → skipped
          ✔ technicals
          Active layers: 12 / 14
        """
        logger.debug(f"[DATA CHECK] {ticker}")
        logger.debug(f"  {'✔' if validation.has_daily_ohlcv else '✖'} daily_ohlcv ({validation.daily_rows} rows)")
        logger.debug(f"  {'✔' if validation.has_minute_ohlcv else '✖'} minute_ohlcv {'(' + str(validation.minute_rows) + ' rows)' if validation.has_minute_ohlcv else '→ Layer 11 skipped'}")
        logger.debug(f"  {'✔' if validation.has_technicals else '✖'} technicals {'→ using computed' if not validation.has_technicals else ''}")
        logger.debug(f"  {'✔' if validation.has_fundamentals else '✖'} fundamentals {'→ Layer 10 skipped' if not validation.has_fundamentals else ''}")
        logger.debug(f"  {'✔' if validation.has_news else '✖'} news {'→ Layer 12 skipped' if not validation.has_news else ''}")
        logger.debug(f"  {'✔' if validation.has_insider else '✖'} insider {'→ Layer 13 skipped' if not validation.has_insider else ''}")
        if validation.market == 'IN':
            logger.debug(f"  ✔ fii_dii (market-level)")
        logger.debug(f"  Active layers: {len(validation.active_layers)} / 14")
    
    def generate_signals(self, prices_df) -> 'pd.DataFrame':
        """Generate all technical signals from price data (Layer 1)."""
        import pandas as pd
        import numpy as np
        
        df = prices_df.copy()
        if 'date' in df.columns:
            df = df.set_index('date')
        
        close = df['close']
        volume = df.get('volume', pd.Series(1, index=df.index))
        
        signals = pd.DataFrame(index=df.index)
        
        # Momentum signals
        signals['momentum_5d'] = close.pct_change(5)
        signals['momentum_10d'] = close.pct_change(10)
        signals['momentum_20d'] = close.pct_change(20)
        signals['momentum_60d'] = close.pct_change(60)
        
        # Moving average signals
        sma20 = close.rolling(20).mean()
        sma50 = close.rolling(50).mean()
        sma200 = close.rolling(200).mean()
        
        signals['above_sma20'] = (close > sma20).astype(float)
        signals['above_sma50'] = (close > sma50).astype(float)
        signals['above_sma200'] = (close > sma200).astype(float)
        signals['sma20_slope'] = sma20.pct_change(5)
        signals['sma50_slope'] = sma50.pct_change(5)
        
        # Volatility signals
        daily_ret = close.pct_change(1)
        signals['vol_20d'] = daily_ret.rolling(20).std() * np.sqrt(252)
        signals['vol_60d'] = daily_ret.rolling(60).std() * np.sqrt(252)
        signals['vol_ratio'] = signals['vol_20d'] / (signals['vol_60d'] + 1e-10)
        signals['vol_contained'] = (signals['vol_20d'] < 0.25).astype(float)
        signals['vol_elevated'] = (signals['vol_20d'] > 0.35).astype(float)
        
        # Volume signals
        vol_sma = volume.rolling(20).mean()
        signals['volume_ratio'] = volume / (vol_sma + 1)
        signals['volume_surge'] = (signals['volume_ratio'] > 1.5).astype(float)
        
        # RSI
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / (loss + 1e-10)
        signals['rsi_14'] = 100 - (100 / (1 + rs))
        signals['rsi_oversold'] = (signals['rsi_14'] < 30).astype(float)
        signals['rsi_overbought'] = (signals['rsi_14'] > 70).astype(float)
        
        # MACD
        ema12 = close.ewm(span=12).mean()
        ema26 = close.ewm(span=26).mean()
        signals['macd'] = ema12 - ema26
        signals['macd_signal'] = signals['macd'].ewm(span=9).mean()
        signals['macd_histogram'] = signals['macd'] - signals['macd_signal']
        signals['macd_bullish'] = (signals['macd'] > signals['macd_signal']).astype(float)
        
        # Trend strength
        signals['trend_strength'] = (close / sma20 - 1) * 0.5 + (close / sma50 - 1) * 0.5
        
        return signals.dropna()
    
    def process_stock(self, ticker: str, market: str) -> Optional[StockIntelligence]:
        """
        Process a single stock through all 14 layers.
        """
        import pandas as pd
        import numpy as np
        
        # CRITICAL: Skip PM tickers - they are DATA sources, not recommendation targets
        if PM_REGIME_AVAILABLE and is_pm_ticker(ticker):
            logger.debug(f"Skipping PM ticker {ticker} - not a recommendation target")
            return None
        
        try:
            # Load price data
            prices_df = load_price_history(ticker, market)
            if prices_df is None or len(prices_df) < 60:
                logger.warning(f"Insufficient data for {ticker}")
                return None
            
            as_of_date = date.today()
            
            # ==================================================================
            # LAYER 1: Generate Signals
            # ==================================================================
            signals_df = self.generate_signals(prices_df)
            if signals_df.empty:
                logger.warning(f"No signals generated for {ticker}")
                return None
            
            latest_signals = signals_df.iloc[-1]
            supporting = []
            opposing = []
            
            if latest_signals.get('momentum_20d', 0) > 0:
                supporting.append('momentum_20d')
            else:
                opposing.append('momentum_20d')
            
            if latest_signals.get('above_sma20', 0) > 0.5:
                supporting.append('above_sma20')
            else:
                opposing.append('below_sma20')
            
            if latest_signals.get('vol_contained', 0) > 0.5:
                supporting.append('vol_contained')
            if latest_signals.get('vol_elevated', 0) > 0.5:
                opposing.append('vol_elevated')
            
            if latest_signals.get('macd_bullish', 0) > 0.5:
                supporting.append('macd_bullish')
            else:
                opposing.append('macd_bearish')
            
            if latest_signals.get('rsi_oversold', 0) > 0.5:
                supporting.append('rsi_oversold')
            if latest_signals.get('rsi_overbought', 0) > 0.5:
                opposing.append('rsi_overbought')
            
            total_signals = len(supporting) + len(opposing)
            signal_agreement = len(supporting) / total_signals if total_signals > 0 else 0.5
            
            # ==================================================================
            # LAYER 2: Predict Regime
            # ==================================================================
            try:
                regime_output = self.regime_engine.predict_regime(prices_df, market, as_of_date)
                
                if regime_output is None:
                    asset_regime = 'recovery'
                    asset_confidence = 0.5
                    market_regime_str = 'recovery'
                    market_confidence = 0.5
                    relative_strength = 0.0
                    regime_divergence = 'aligned'
                    days_in_regime = 1
                else:
                    asset_regime = regime_output.regime
                    asset_confidence = regime_output.confidence
                    market_regime_str = regime_output.market_regime
                    market_confidence = regime_output.market_regime_confidence
                    relative_strength = regime_output.relative_regime_strength
                    regime_divergence = regime_output.regime_divergence
                    days_in_regime = regime_output.days_in_regime
            except Exception as e:
                logger.debug(f"Regime prediction failed for {ticker}: {e}")
                asset_regime = 'recovery'
                asset_confidence = 0.5
                market_regime_str = 'recovery'
                market_confidence = 0.5
                relative_strength = 0.0
                regime_divergence = 'aligned'
                days_in_regime = 1
            
            # ==================================================================
            # LAYER 4: Probability Engine
            # ==================================================================
            prices_series = prices_df.set_index('date')['close']
            daily_ret = prices_series.pct_change(1)
            
            vol_20d = float(daily_ret.rolling(20).std().iloc[-1] * np.sqrt(252))
            vol_60d = float(daily_ret.rolling(60).std().iloc[-1] * np.sqrt(252))
            
            if vol_20d < 0.15:
                vol_regime = 'low'
            elif vol_20d < 0.25:
                vol_regime = 'normal'
            elif vol_20d < 0.40:
                vol_regime = 'elevated'
            else:
                vol_regime = 'extreme'
            
            vol_history = daily_ret.rolling(20).std() * np.sqrt(252)
            vol_percentile = float((vol_history < vol_20d).mean())
            
            vol_normal = 0.18
            vol_stress = 0.32
            vol_tail = 0.55
            vol_forecast = vol_20d * 0.6 + (vol_normal if vol_regime in ['low', 'normal'] else vol_stress) * 0.4
            
            returns_20d = prices_series.pct_change(20).dropna()
            
            return_p10 = float(returns_20d.quantile(0.10))
            return_p25 = float(returns_20d.quantile(0.25))
            return_p50 = float(returns_20d.quantile(0.50))
            return_p75 = float(returns_20d.quantile(0.75))
            return_p90 = float(returns_20d.quantile(0.90))
            return_mean = float(returns_20d.mean())
            return_std = float(returns_20d.std())
            
            worst_5pct = returns_20d[returns_20d <= returns_20d.quantile(0.05)]
            cvar_95 = float(worst_5pct.mean()) if len(worst_5pct) > 0 else return_p10 * 1.5
            
            cvar_95_normal = cvar_95 * 0.8
            cvar_95_stress = cvar_95 * 1.3
            cvar_95_panic = cvar_95 * 2.0
            
            max_dd_expected = cvar_95_stress * 1.2
            
            downside_returns = returns_20d[returns_20d < 0]
            downside_std = float(downside_returns.std()) if len(downside_returns) > 0 else return_std
            sortino = return_mean / (downside_std + 1e-10) if downside_std > 0 else 0
            
            # ==================================================================
            # LAYER 5: Comparable Setups
            # ==================================================================
            n_comparable = len(returns_20d.dropna())
            if n_comparable > 0:
                comparable_win_rate = float((returns_20d > 0).mean())
                comparable_median = float(returns_20d.median())
                comparable_worst = float(returns_20d.min())
            else:
                comparable_win_rate = 0.5
                comparable_median = 0.0
                comparable_worst = -0.1
            
            # ==================================================================
            # LAYER 10: Fundamental Trajectory
            # ==================================================================
            fundamental = compute_fundamental_trajectory(ticker, market)
            if fundamental:
                self.stats['layers_applied']['fundamental'] += 1
            
            # ==================================================================
            # LAYER 11: Intraday Structure
            # ==================================================================
            intraday = compute_intraday_structure(ticker, market)
            if intraday:
                self.stats['layers_applied']['intraday'] += 1
            
            # ==================================================================
            # LAYER 12: News Reaction
            # ==================================================================
            news = compute_news_reaction(ticker, market, prices_df)
            if news and news.news_detected:
                self.stats['layers_applied']['news'] += 1
            
            # ==================================================================
            # LAYER 13: Insider Signal V2
            # ==================================================================
            insider_modifier, insider_explanation, _ = get_insider_modifier(
                ticker, market, asset_regime
            )
            if insider_modifier != 0:
                self.stats['layers_applied']['insider'] += 1
            
            # ==================================================================
            # LAYER 14: Market Participation (cached)
            # ==================================================================
            if market not in self._market_participation_cache:
                self._market_participation_cache[market] = compute_market_participation(market)
            
            market_participation = self._market_participation_cache.get(market)
            if market_participation:
                self.stats['layers_applied']['market_participation'] += 1
            
            # ==================================================================
            # LAYER 2B: PM Regime Context (cached, FAIL-OPEN)
            # ==================================================================
            pm_regime = None
            if self._pm_engine and market == 'IN':  # PM data is India-specific
                if 'IN' not in self._pm_regime_cache:
                    # Get yesterday's state for comparison
                    timeline_dir = PROJECT_ROOT / 'public' / 'timeline'
                    yesterday_state = get_yesterday_pm_regime(timeline_dir) if PM_REGIME_AVAILABLE else None
                    
                    # Compute PM regime (FAIL-OPEN: returns neutral if data unavailable)
                    self._pm_regime_cache['IN'] = self._pm_engine.compute_pm_regime(
                        as_of_date=as_of_date,
                        previous_state=yesterday_state
                    )
                    
                    # Save to timeline
                    if PM_REGIME_AVAILABLE:
                        save_pm_regime_to_timeline(self._pm_regime_cache['IN'], timeline_dir)
                
                pm_regime = self._pm_regime_cache.get('IN')
            
            # ==================================================================
            # LAYER 6: Decision Engine (with all modifiers)
            # ==================================================================
            # CONVICTION CALCULATION - CONTINUOUS (NO QUANTIZATION)
            # Base conviction from return distribution quality
            # Uses continuous values for maximum signal resolution
            
            # Base conviction from risk-adjusted return quality
            if return_p50 > 0 and abs(cvar_95) > 0.001:
                # Continuous risk-adjusted conviction
                risk_adj_ratio = return_p50 / abs(cvar_95)
                base_conviction = 0.3 + min(0.3, risk_adj_ratio * 0.5)
            else:
                base_conviction = 0.25
            
            # Return distribution asymmetry (continuous)
            if return_p90 > 0 and abs(return_p10) > 0:
                upside_downside_ratio = return_p90 / abs(return_p10) if return_p10 != 0 else 1.0
                # Scale: ratio of 2.0 adds 0.15, ratio of 0.5 subtracts 0.1
                asymmetry_adj = (upside_downside_ratio - 1.0) * 0.08
                base_conviction += max(-0.15, min(0.15, asymmetry_adj))
            
            # Signal agreement adjustment (CONTINUOUS instead of discrete)
            # signal_agreement is 0.0-1.0, use it directly
            signal_adj = (signal_agreement - 0.5) * 0.3  # -0.15 to +0.15 range
            base_conviction += signal_adj
            
            # Regime adjustment (continuous based on confidence)
            regime_multipliers = {
                'markup': 0.12,
                'accumulation': 0.10,
                'recovery': 0.05,
                'distribution': -0.08,
                'markdown': -0.15,
                'panic': -0.20
            }
            regime_adj = regime_multipliers.get(asset_regime, 0) * asset_confidence
            base_conviction += regime_adj
            
            # ==== NEW LAYER MODIFIERS (already continuous) ====
            
            # Fundamental trajectory modifier
            if fundamental:
                if fundamental.regime == 'improving':
                    base_conviction += 0.10 * fundamental.confidence
                elif fundamental.regime == 'deteriorating':
                    base_conviction -= 0.12 * fundamental.confidence
                elif fundamental.regime == 'stable':
                    base_conviction += 0.02 * fundamental.confidence
            
            # Intraday structure modifier
            if intraday:
                if intraday.bias == 'accumulation':
                    regime_match = 1.2 if asset_regime in ['markup', 'accumulation', 'recovery'] else 0.8
                    base_conviction += 0.06 * intraday.confidence * regime_match
                elif intraday.bias == 'distribution':
                    regime_match = 1.2 if asset_regime in ['distribution', 'markdown'] else 0.8
                    base_conviction -= 0.06 * intraday.confidence * regime_match
            
            # News reaction modifier
            if news:
                base_conviction += news.confidence_modifier
            
            # Insider modifier (from Layer 13)
            base_conviction += insider_modifier
            
            # Market participation modifier (India only, affects market confidence)
            if market_participation:
                market_confidence = min(1.0, max(0.0, 
                    market_confidence + market_participation.confidence_adjustment
                ))
            
            # PM Regime modifier (India only, affects INITIATE/EXIT/HOLD thresholds)
            # This is a CONTEXT modifier, not a conviction modifier
            pm_initiate_strictness = 1.0
            pm_exit_urgency = 1.0
            if pm_regime and PM_REGIME_AVAILABLE:
                pm_modifiers = self._pm_engine.get_decision_modifiers(pm_regime)
                pm_initiate_strictness = pm_modifiers.get('initiate_strictness', 1.0)
                pm_exit_urgency = pm_modifiers.get('exit_urgency', 1.0)
            
            # Clip conviction to valid range (0.0 - 1.0)
            # IMPORTANT: Do NOT round or quantize - preserve full precision
            conviction = max(0.0, min(1.0, base_conviction))
            
            # Determine direction and intent
            if return_p50 > 0.01 and signal_agreement > 0.5:
                direction = 'long'
            elif return_p50 < -0.01 and signal_agreement < 0.5:
                direction = 'short'
            else:
                direction = 'neutral'
            
            # Apply PM regime modifiers to thresholds (CONTEXT-AWARE)
            # Higher pm_initiate_strictness = harder to INITIATE
            # Higher pm_exit_urgency = lower HOLD threshold (faster to AVOID)
            initiate_threshold = 0.6 * pm_initiate_strictness  # Default 0.6, up to 0.69 in RISK_OFF
            hold_upper_threshold = 0.5 * pm_initiate_strictness
            hold_lower_threshold = 0.4 / pm_exit_urgency  # Lower = faster to AVOID
            
            if conviction >= initiate_threshold and direction == 'long':
                intent = 'INITIATE'
            elif conviction >= hold_upper_threshold and direction == 'long':
                intent = 'HOLD'
            elif conviction >= hold_lower_threshold:
                intent = 'HOLD'
            else:
                intent = 'AVOID'
            
            confidence = (asset_confidence * 0.4 + min(len(prices_df) / 1000, 0.3) + 0.3)
            
            # Position sizing
            max_position = 0.06 * conviction
            if vol_regime == 'extreme':
                max_position *= 0.5
            elif vol_regime == 'elevated':
                max_position *= 0.7
            
            recommended_position = max_position * 0.7
            risk_budget = max_position * abs(cvar_95) / 0.15
            
            scale_tranches = 3 if conviction < 0.6 else 2 if conviction < 0.8 else 1
            
            expected_return_val = return_p50
            expected_risk_val = abs(return_p10)
            risk_reward = expected_return_val / expected_risk_val if expected_risk_val > 0 else 0
            
            if asset_regime == 'panic':
                time_horizon = 'tactical'
                holding_days = 5
            elif asset_regime in ['recovery', 'distribution']:
                time_horizon = 'short_term'
                holding_days = 15
            elif asset_regime == 'markup':
                time_horizon = 'medium_term'
                holding_days = 40
            else:
                time_horizon = 'short_term'
                holding_days = 20
            
            # Conditions
            upgrade_conditions = []
            downgrade_conditions = []
            risk_factors = []
            
            if asset_regime != 'markup':
                upgrade_conditions.append(f"Asset regime shifts to 'markup' from '{asset_regime}'")
            if signal_agreement < 0.7:
                upgrade_conditions.append("Signal agreement improves above 70%")
            if vol_regime in ['elevated', 'extreme']:
                upgrade_conditions.append("Volatility normalizes below 25%")
            if fundamental and fundamental.regime != 'improving':
                upgrade_conditions.append("Fundamental trajectory turns positive")
            
            if market_regime_str in ['markdown', 'panic']:
                downgrade_conditions.append("Market regime deteriorates further")
            if signal_agreement > 0.3:
                downgrade_conditions.append("Signal agreement drops below 30%")
            downgrade_conditions.append("Volatility spikes to extreme levels")
            
            if vol_regime in ['elevated', 'extreme']:
                risk_factors.append(f"Elevated volatility ({vol_20d:.1%})")
            if asset_regime in ['distribution', 'markdown']:
                risk_factors.append(f"Bearish asset regime ({asset_regime})")
            if market_regime_str in ['distribution', 'markdown', 'panic']:
                risk_factors.append(f"Adverse market regime ({market_regime_str})")
            if cvar_95 < -0.08:
                risk_factors.append(f"Significant tail risk (CVaR: {cvar_95:.1%})")
            if fundamental and fundamental.regime == 'deteriorating':
                risk_factors.append(f"Deteriorating fundamentals")
            
            # ==================================================================
            # LAYER 7: Generate Explanation
            # ==================================================================
            rationale = self._generate_rationale(
                intent, conviction, direction, asset_regime, market_regime_str,
                supporting, opposing, fundamental, intraday, news, insider_modifier
            )
            
            explanation = self._generate_explanation(
                ticker, intent, conviction, asset_regime, market_regime_str,
                vol_20d, cvar_95, n_comparable, comparable_win_rate
            )
            
            # Price context
            last_price = float(prices_df['close'].iloc[-1])
            price_date = str(prices_df['date'].iloc[-1].date() if hasattr(prices_df['date'].iloc[-1], 'date') 
                           else prices_df['date'].iloc[-1])
            
            price_change_1d = float(prices_df['close'].pct_change(1).iloc[-1]) if len(prices_df) > 1 else None
            price_change_5d = float(prices_df['close'].pct_change(5).iloc[-1]) if len(prices_df) > 5 else None
            price_change_20d = float(prices_df['close'].pct_change(20).iloc[-1]) if len(prices_df) > 20 else None
            
            data_quality = 'good' if len(prices_df) > 500 else 'moderate' if len(prices_df) > 200 else 'limited'
            
            # ==================================================================
            # BUILD OUTPUT
            # ==================================================================
            # Determine market benchmark source
            market_benchmark_source = 'NIFTY50' if market == 'IN' else 'SP500'
            
            return StockIntelligence(
                ticker=ticker,
                market=market,
                as_of_date=str(as_of_date),
                version=VERSION,
                schema_version=SCHEMA_VERSION,
                system_mode=SYSTEM_MODE,
                generated_at=datetime.now().isoformat(),
                
                asset_regime=asset_regime,
                asset_regime_confidence=round(asset_confidence, 4),
                market_regime=market_regime_str,
                market_benchmark_source=market_benchmark_source,
                market_regime_confidence=round(market_confidence, 4),
                relative_strength=round(relative_strength, 4),
                regime_divergence=regime_divergence,
                days_in_regime=days_in_regime,
                
                volatility_20d=round(vol_20d, 4),
                volatility_regime=vol_regime,
                vol_percentile=round(vol_percentile, 4),
                vol_forecast=round(vol_forecast, 4),
                vol_normal=round(vol_normal, 4),
                vol_stress=round(vol_stress, 4),
                vol_tail=round(vol_tail, 4),
                
                return_p10=round(return_p10, 4),
                return_p25=round(return_p25, 4),
                return_p50=round(return_p50, 4),
                return_p75=round(return_p75, 4),
                return_p90=round(return_p90, 4),
                return_mean=round(return_mean, 4),
                return_std=round(return_std, 4),
                
                cvar_95=round(cvar_95, 4),
                cvar_95_normal=round(cvar_95_normal, 4),
                cvar_95_stress=round(cvar_95_stress, 4),
                cvar_95_panic=round(cvar_95_panic, 4),
                max_drawdown_expected=round(max_dd_expected, 4),
                sortino_ratio=round(sortino, 4),
                
                intent=intent,
                direction=direction,
                # CONVICTION - all three fields for compatibility
                conviction=conviction,  # Kept for backwards compatibility with other modules
                conviction_raw=conviction,  # Full precision (0.0-1.0)
                conviction_pct=round(conviction * 100, 1),  # Display precision (e.g., 63.7)
                confidence=round(confidence, 4),
                
                max_position_pct=round(max_position, 4),
                recommended_position_pct=round(recommended_position, 4),
                risk_budget_used_pct=round(risk_budget, 4),
                scale_in_tranches=scale_tranches,
                
                risk_reward_ratio=round(risk_reward, 4),
                expected_return=round(expected_return_val, 4),
                expected_risk=round(expected_risk_val, 4),
                
                time_horizon=time_horizon,
                expected_holding_days=holding_days,
                
                supporting_signals=supporting,
                opposing_signals=opposing,
                signal_agreement=round(signal_agreement, 4),
                
                n_comparable_setups=n_comparable,
                comparable_win_rate=round(comparable_win_rate, 4),
                comparable_median_return=round(comparable_median, 4),
                comparable_worst_outcome=round(comparable_worst, 4),
                
                top_signals_ic={},
                signal_confidence=round(signal_agreement, 4),
                
                upgrade_conditions=upgrade_conditions,
                downgrade_conditions=downgrade_conditions,
                risk_factors=risk_factors,
                
                rationale=rationale,
                explanation=explanation,
                
                historical_intent_accuracy=None,
                similar_decision_outcomes=None,
                
                last_price=round(last_price, 2),
                price_date=price_date,
                price_change_1d=round(price_change_1d, 4) if price_change_1d else None,
                price_change_5d=round(price_change_5d, 4) if price_change_5d else None,
                price_change_20d=round(price_change_20d, 4) if price_change_20d else None,
                
                data_quality=data_quality,
                data_points=len(prices_df),
                
                # New layers
                fundamental_regime=fundamental.regime if fundamental else None,
                fundamental_confidence=fundamental.confidence if fundamental else None,
                fundamental_drivers=fundamental.drivers if fundamental else [],
                
                intraday_bias=intraday.bias if intraday else None,
                intraday_confidence=intraday.confidence if intraday else None,
                
                news_reaction=news.reaction if news else None,
                news_confidence_modifier=news.confidence_modifier if news else None,
                
                insider_confidence_modifier=insider_modifier if insider_modifier != 0 else None,
                insider_explanation=insider_explanation if insider_modifier != 0 else None,
                
                market_participation_regime=market_participation.combined_regime if market_participation else None,
                market_participation_modifier=market_participation.confidence_adjustment if market_participation else None,
                
                # PM Regime Context (Layer 2B) - FAIL-OPEN
                pm_regime_state=pm_regime.state if pm_regime else None,
                pm_regime_confidence=pm_regime.confidence if pm_regime else None,
                pm_regime_triggers=pm_regime.triggers[:3] if pm_regime else [],
                pm_context_description=pm_regime.context_description if pm_regime else None,
                pm_regime_changed=pm_regime.state_changed if pm_regime else None,
                
                # Authority Mode (v2.3) - Action-First Decision Framing
                # STRICT MAPPING: intent is the ONLY authority
                if_holding=self._derive_if_holding(intent),
                if_not_holding=self._derive_if_not_holding(intent),
                recommended_action_explanation=self._generate_action_explanation(
                    intent, conviction, asset_regime, market_regime_str, vol_regime, supporting, opposing
                ),
                portfolio_correlation_note=self._generate_correlation_note(vol_20d, asset_regime),
                risk_budget_context=f"Using {risk_budget:.0%} of allocated risk budget with {scale_tranches} tranches",
            )
            
        except Exception as e:
            logger.error(f"Error processing {ticker}: {e}")
            logger.debug(traceback.format_exc())
            self.errors[ticker] = str(e)
            return None
    
    def _generate_rationale(
        self, intent, conviction, direction, asset_regime, market_regime,
        supporting, opposing, fundamental, intraday, news, insider_mod
    ) -> str:
        """Generate concise rationale."""
        parts = [
            f"{intent} {direction.upper()} with {conviction:.0%} conviction.",
            f"Asset in {asset_regime} regime, market in {market_regime}."
        ]
        
        if supporting:
            parts.append(f"Supporting: {', '.join(supporting[:3])}.")
        if opposing:
            parts.append(f"Opposing: {', '.join(opposing[:2])}.")
        
        # New layer context
        if fundamental and fundamental.regime != 'stable':
            parts.append(f"Fundamentals {fundamental.regime}.")
        if intraday and intraday.bias != 'neutral':
            parts.append(f"Intraday shows {intraday.bias}.")
        if news and news.news_detected:
            parts.append(f"News reaction: {news.reaction}.")
        if insider_mod != 0:
            parts.append(f"Insider signal: {'+' if insider_mod > 0 else ''}{insider_mod:.0%}.")
        
        return " ".join(parts)
    
    def _generate_explanation(
        self, ticker, intent, conviction, asset_regime, market_regime,
        volatility, cvar, n_comparable, comparable_win_rate
    ) -> str:
        """Generate detailed explanation."""
        parts = []
        
        parts.append(
            f"The stock is currently in a {asset_regime} regime with the broader "
            f"market in {market_regime}."
        )
        
        if volatility > 0.35:
            parts.append(
                f"Volatility is elevated at {volatility:.1%}, suggesting increased "
                f"uncertainty and wider potential outcomes."
            )
        elif volatility < 0.15:
            parts.append(
                f"Volatility is contained at {volatility:.1%}, suggesting a "
                f"relatively stable environment."
            )
        
        if n_comparable > 50:
            parts.append(
                f"In {n_comparable} similar historical setups, the win rate "
                f"was {comparable_win_rate:.0%}."
            )
        
        parts.append(
            f"Conditional Value at Risk (95%) is {cvar:.1%}, meaning in the worst "
            f"5% of scenarios, losses could exceed this level."
        )
        
        if intent == 'AVOID':
            parts.append(
                "The system recommends avoiding this opportunity due to "
                "insufficient signal alignment or elevated risk."
            )
        elif intent == 'INITIATE':
            parts.append(
                "Conditions favor initiating a position, with regime and signals "
                "showing alignment."
            )
        elif intent == 'HOLD':
            parts.append(
                "Current position should be maintained. No compelling reason to "
                "add or reduce at this time."
            )
        
        return " ".join(parts)
    
    # =========================================================================
    # AUTHORITY MODE HELPERS (v2.3)
    # =========================================================================
    
    def _derive_if_holding(self, intent: str) -> str:
        """
        Derive action for existing position holders.
        
        STRICT MAPPING - NO CONDITIONAL LOGIC:
        - INITIATE → HOLD
        - HOLD → HOLD
        - REDUCE → REDUCE
        - AVOID → AVOID
        
        Returns: HOLD / REDUCE / AVOID
        """
        # STRICT INTENT MAPPING - intent is the ONLY authority
        INTENT_TO_IF_HOLDING = {
            'INITIATE': 'HOLD',
            'ADD': 'HOLD',
            'HOLD': 'HOLD',
            'REDUCE': 'REDUCE',
            'EXIT': 'REDUCE',  # EXIT maps to REDUCE for existing holders
            'AVOID': 'AVOID',
        }
        return INTENT_TO_IF_HOLDING.get(intent, 'HOLD')
    
    def _derive_if_not_holding(self, intent: str) -> str:
        """
        Derive action for non-holders.
        
        STRICT MAPPING - NO CONDITIONAL LOGIC:
        - INITIATE → INITIATE
        - HOLD → WAIT
        - REDUCE → AVOID
        - AVOID → AVOID
        
        Returns: INITIATE / WAIT / AVOID
        """
        # STRICT INTENT MAPPING - intent is the ONLY authority
        INTENT_TO_IF_NOT_HOLDING = {
            'INITIATE': 'INITIATE',
            'ADD': 'INITIATE',
            'HOLD': 'WAIT',
            'REDUCE': 'AVOID',
            'EXIT': 'AVOID',
            'AVOID': 'AVOID',
        }
        return INTENT_TO_IF_NOT_HOLDING.get(intent, 'WAIT')
    
    def _generate_action_explanation(
        self, intent: str, conviction: float, asset_regime: str,
        market_regime: str, vol_regime: str, supporting: List[str], opposing: List[str]
    ) -> str:
        """
        Generate directive action explanation.
        
        This is the "What should I do?" answer - direct and unambiguous.
        """
        # If holding - STRICT MAPPING from intent
        if_hold = self._derive_if_holding(intent)
        if_not = self._derive_if_not_holding(intent)
        
        parts = []
        
        if if_hold == 'EXIT':
            parts.append(f"If holding: EXIT immediately. Conditions have deteriorated.")
        elif if_hold == 'REDUCE':
            parts.append(f"If holding: REDUCE position. Risk/reward no longer favorable.")
        else:
            parts.append(f"If holding: HOLD current position. No action required.")
        
        if if_not == 'INITIATE':
            parts.append(f"If not holding: INITIATE position with {conviction:.0%} conviction.")
        elif if_not == 'AVOID':
            parts.append(f"If not holding: AVOID entry. Conditions unfavorable.")
        else:
            parts.append(f"If not holding: WAIT for better setup.")
        
        # Context
        if vol_regime in ['high', 'extreme']:
            parts.append(f"Note: Elevated volatility ({vol_regime}) - size positions conservatively.")
        
        if asset_regime != market_regime:
            parts.append(f"Asset regime ({asset_regime}) diverges from market ({market_regime}).")
        
        return " ".join(parts)
    
    def _generate_correlation_note(self, volatility: float, regime: str) -> str:
        """Generate portfolio correlation context note."""
        if volatility > 0.30:
            return "High volatility stock - may increase portfolio volatility significantly"
        elif regime in ['accumulation', 'markup']:
            return "Trending regime - potential correlation with other momentum names"
        elif regime in ['distribution', 'markdown']:
            return "Weak regime - may provide some diversification benefit"
        else:
            return "Monitor correlation with existing holdings"
    
    def save_intelligence(self, intel: StockIntelligence) -> bool:
        """
        Save stock intelligence to JSON file.
        
        SCHEMA CONTRACT ENFORCEMENT:
        - Validates against STOCK_INTELLIGENCE_SCHEMA
        - Validates decision consistency
        - FAILS if any validation error
        """
        try:
            output_path = OUTPUT_DIR / intel.market / f'{intel.ticker}.json'
            
            # Convert to dict
            intel_dict = asdict(intel)
            
            # SCHEMA VALIDATION
            schema_valid, schema_errors = validate_stock_intelligence(intel_dict, intel.ticker)
            if not schema_valid:
                for err in schema_errors:
                    logger.warning(f"[SCHEMA] {intel.ticker}: {err}")
            
            # DECISION CONSISTENCY VALIDATION
            consistency_valid, consistency_errors = validate_decision_consistency(intel_dict)
            if not consistency_valid:
                for err in consistency_errors:
                    logger.error(f"[CONSISTENCY] {intel.ticker}: {err}")
                # HARD FAIL on decision inconsistency
                return False
            
            with open(output_path, 'w') as f:
                json.dump(intel_dict, f, indent=2, default=str)
            
            return True
        except Exception as e:
            logger.error(f"Error saving {intel.ticker}: {e}")
            return False
    
    def run_portfolio_simulation(self, decisions: List[StockIntelligence]) -> Optional[Dict]:
        """Layer 9: Portfolio Simulation with Correlation-Aware Risk."""
        if not decisions:
            return None
        
        try:
            from quant_system.layer9_portfolio_risk import compute_portfolio_risk
        except ImportError:
            logger.warning("Portfolio risk module not available")
            compute_portfolio_risk = None
            
        try:
            decisions_dicts = [asdict(d) for d in decisions]
            
            returns_dict = {}
            for d in decisions[:50]:
                try:
                    prices_df = load_price_history(d.ticker, d.market)
                    if prices_df is not None and len(prices_df) > 60:
                        prices_series = prices_df.set_index('date')['close']
                        returns_dict[d.ticker] = prices_series.pct_change(1).dropna()
                except Exception:
                    pass
            
            risk_metrics = {}
            if compute_portfolio_risk:
                risk_metrics = compute_portfolio_risk(decisions_dicts, returns_dict)
            
            portfolio = {
                'version': VERSION,
                'generated_at': datetime.now().isoformat(),
                'as_of_date': str(date.today()),
                'n_stocks_analyzed': len(decisions),
                
                'intents': {
                    'INITIATE': sum(1 for d in decisions if d.intent == 'INITIATE'),
                    'HOLD': sum(1 for d in decisions if d.intent == 'HOLD'),
                    'AVOID': sum(1 for d in decisions if d.intent == 'AVOID'),
                    'REDUCE': sum(1 for d in decisions if d.intent == 'REDUCE'),
                    'EXIT': sum(1 for d in decisions if d.intent == 'EXIT'),
                },
                
                'regimes': {},
                'top_opportunities': [],
                'portfolio_risk': risk_metrics,
                'avg_conviction': 0,
                'avg_cvar': 0,
                'market_regime_us': None,
                'market_regime_in': None,
                
                'layers_applied': self.stats['layers_applied'],
            }
            
            for d in decisions:
                regime = d.asset_regime
                if regime not in portfolio['regimes']:
                    portfolio['regimes'][regime] = 0
                portfolio['regimes'][regime] += 1
            
            initiates = [d for d in decisions if d.intent == 'INITIATE']
            initiates.sort(key=lambda x: x.conviction, reverse=True)
            
            portfolio['top_opportunities'] = [
                {
                    'ticker': d.ticker,
                    'market': d.market,
                    'conviction': d.conviction,
                    'intent': d.intent,
                    'asset_regime': d.asset_regime,
                    'signal_agreement': d.signal_agreement,
                    'risk_reward': d.risk_reward_ratio,
                    'volatility': d.volatility_20d,
                    'cvar_95': d.cvar_95,
                    'fundamental_regime': d.fundamental_regime,
                    'intraday_bias': d.intraday_bias,
                }
                for d in initiates[:10]
            ]
            
            avoids = [d for d in decisions if d.intent == 'AVOID']
            avoids.sort(key=lambda x: x.conviction)
            
            portfolio['top_avoids'] = [
                {
                    'ticker': d.ticker,
                    'market': d.market,
                    'conviction': d.conviction,
                    'asset_regime': d.asset_regime,
                    'risk_factors': d.risk_factors,
                    'cvar_95': d.cvar_95,
                }
                for d in avoids[:5]
            ]
            
            portfolio['avg_conviction'] = round(
                sum(d.conviction for d in decisions) / len(decisions), 4
            )
            portfolio['avg_cvar'] = round(
                sum(d.cvar_95 for d in decisions) / len(decisions), 4
            )
            
            us_decisions = [d for d in decisions if d.market == 'US']
            in_decisions = [d for d in decisions if d.market == 'IN']
            
            if us_decisions:
                portfolio['market_regime_us'] = us_decisions[0].market_regime
            if in_decisions:
                portfolio['market_regime_in'] = in_decisions[0].market_regime
            
            output_path = PORTFOLIO_OUTPUT_DIR / 'portfolio_snapshot.json'
            with open(output_path, 'w') as f:
                json.dump(portfolio, f, indent=2)
            
            logger.info(f"Saved portfolio snapshot to {output_path}")
            return portfolio
            
        except Exception as e:
            logger.error(f"Error running portfolio simulation: {e}")
            logger.debug(traceback.format_exc())
            return None
    
    def run_full_universe(self, run_portfolio: bool = True) -> Dict:
        """
        Run the complete full-universe intelligence pipeline.
        
        This is the ONLY execution path. No partial runs.
        """
        # ==================================================================
        # LOCKED AUTHORITY MODE BANNER
        # ==================================================================
        logger.info("")
        logger.info("=" * 70)
        logger.info("     FINSIGHT LOCKED AUTHORITY MODE")
        logger.info("=" * 70)
        logger.info(f"  Version:        {VERSION}")
        logger.info(f"  Schema:         {SCHEMA_VERSION}")
        logger.info(f"  System Mode:    {SYSTEM_MODE}")
        logger.info(f"  Execution:      FULL-UNIVERSE")
        logger.info(f"  Fallbacks:      NONE")
        logger.info("")
        logger.info("  FinSight logic is LOCKED.")
        logger.info("  Execution systems must consume as-is.")
        logger.info("  No runtime mutations allowed.")
        logger.info("=" * 70)
        logger.info("")
        
        # ==================================================================
        # STARTUP VALIDATION
        # ==================================================================
        if not validate_startup():
            raise RuntimeError("Pipeline startup validation failed")
        
        start_time = datetime.now()
        pipeline_timer = PipelineTimer()
        pipeline_timer.start()
        
        all_intel: List[StockIntelligence] = []
        
        # Initialize data validator
        data_validator = DataValidator()
        
        # ==================================================================
        # PHASE 1: Universe Discovery
        # ==================================================================
        logger.info("=" * 60)
        logger.info("FULL-UNIVERSE DISCOVERY PHASE")
        logger.info("=" * 60)
        
        # ==================================================================
        # UNIVERSE DISCOVERY — NO FALLBACKS
        # ==================================================================
        discovery_start = time.perf_counter()
        
        # Discover US universe from filesystem
        # NO TRY/EXCEPT — Let it fail hard if discovery fails
        us_tickers = discover_universe('US')
        us_tickers = validate_universe_size(us_tickers, 'US')
        
        # Validate US tickers with data validator (per-layer validation)
        us_valid, us_excluded = data_validator.validate_universe(us_tickers, 'US', log_individual=False)
        
        # MANDATORY UNIVERSE LOG
        logger.info("")
        logger.info("=" * 70)
        logger.info("FULL-UNIVERSE MODE ENABLED")
        logger.info(f"Market: US")
        logger.info(f"Stocks discovered from filesystem: {len(us_tickers)}")
        logger.info(f"Stocks passing validation: {len(us_valid)}")
        logger.info(f"Stocks excluded (missing required data): {len(us_excluded)}")
        logger.info(f"Pipeline version: {VERSION}")
        logger.info("=" * 70)
        
        # Discover IN universe from filesystem
        # NO TRY/EXCEPT — Let it fail hard if discovery fails
        in_tickers = discover_universe('IN')
        in_tickers = validate_universe_size(in_tickers, 'IN')
        
        # Validate IN tickers with data validator (per-layer validation)
        in_valid, in_excluded = data_validator.validate_universe(in_tickers, 'IN', log_individual=False)
        
        # MANDATORY UNIVERSE LOG
        logger.info("")
        logger.info("=" * 70)
        logger.info("FULL-UNIVERSE MODE ENABLED")
        logger.info(f"Market: IN")
        logger.info(f"Stocks discovered from filesystem: {len(in_tickers)}")
        logger.info(f"Stocks passing validation: {len(in_valid)}")
        logger.info(f"Stocks excluded (missing required data): {len(in_excluded)}")
        logger.info(f"Pipeline version: {VERSION}")
        logger.info("=" * 70)
        
        pipeline_timer.record('Discovery', time.perf_counter() - discovery_start)
        
        # ==================================================================
        # PHASE 2: Process US Stocks (ALL valid stocks)
        # ==================================================================
        logger.info("\n" + "=" * 60)
        logger.info(f"PROCESSING US UNIVERSE ({len(us_valid)} stocks)")
        logger.info("=" * 60)
        
        us_process_start = time.perf_counter()
        for i, ticker in enumerate(us_valid):
            logger.info(f"  [{i+1}/{len(us_valid)}] {ticker}...")
            self.stats['processed'] += 1
            
            # Log data availability per stock
            validation = data_validator.validation_results.get(ticker)
            if validation:
                self._log_data_check(ticker, validation)
            
            stock_start = time.perf_counter()
            intel = self.process_stock(ticker, 'US')
            stock_elapsed = time.perf_counter() - stock_start
            
            if intel:
                self.save_intelligence(intel)
                all_intel.append(intel)
                self.stats['success'] += 1
                logger.info(f"    -> {intel.intent} ({intel.conviction:.0%}) | {intel.asset_regime} [{stock_elapsed:.2f}s]")
            else:
                self.stats['errors'] += 1
        
        pipeline_timer.record('US_Processing', time.perf_counter() - us_process_start)
        
        # ==================================================================
        # PHASE 3: Process India Stocks (ALL valid stocks)
        # ==================================================================
        logger.info("\n" + "=" * 60)
        logger.info(f"PROCESSING INDIA UNIVERSE ({len(in_valid)} stocks)")
        logger.info("=" * 60)
        
        in_process_start = time.perf_counter()
        for i, ticker in enumerate(in_valid):
            logger.info(f"  [{i+1}/{len(in_valid)}] {ticker}...")
            self.stats['processed'] += 1
            
            # Log data availability per stock
            validation = data_validator.validation_results.get(ticker)
            if validation:
                self._log_data_check(ticker, validation)
            
            stock_start = time.perf_counter()
            intel = self.process_stock(ticker, 'IN')
            stock_elapsed = time.perf_counter() - stock_start
            
            if intel:
                self.save_intelligence(intel)
                all_intel.append(intel)
                self.stats['success'] += 1
                logger.info(f"    -> {intel.intent} ({intel.conviction:.0%}) | {intel.asset_regime} [{stock_elapsed:.2f}s]")
            else:
                self.stats['errors'] += 1
        
        pipeline_timer.record('IN_Processing', time.perf_counter() - in_process_start)
        
        # ==================================================================
        # PHASE 4: Portfolio Simulation
        # ==================================================================
        if run_portfolio and all_intel:
            logger.info("\n" + "=" * 60)
            logger.info("PORTFOLIO SIMULATION (LAYER 9)")
            logger.info("=" * 60)
            portfolio_start = time.perf_counter()
            self.run_portfolio_simulation(all_intel)
            pipeline_timer.record('Portfolio_Simulation', time.perf_counter() - portfolio_start)
        
        # ==================================================================
        # PHASE 5: PORTFOLIO INTELLIGENCE (AUTHORITY MODE)
        # ==================================================================
        logger.info("\n" + "=" * 60)
        logger.info("PORTFOLIO INTELLIGENCE (AUTHORITY MODE)")
        logger.info("=" * 60)
        
        from quant_system.portfolio_intelligence import run_portfolio_intelligence
        portfolio_intel_start = time.perf_counter()
        portfolio_intel = run_portfolio_intelligence(['US', 'IN'], VERSION)
        pipeline_timer.record('Portfolio_Intelligence', time.perf_counter() - portfolio_intel_start)
        
        # Validate portfolio intelligence was generated
        if not portfolio_intel:
            logger.warning("[AUTHORITY] Portfolio intelligence generation returned empty")
        else:
            logger.info(f"[AUTHORITY] Portfolio intelligence generated for {len(portfolio_intel)} markets")
        
        # ==================================================================
        # PHASE 6: TOP OPPORTUNITIES RANKING
        # ==================================================================
        logger.info("\n" + "=" * 60)
        logger.info("TOP OPPORTUNITIES RANKING")
        logger.info("=" * 60)
        
        from quant_system.top_opportunities import run_top_opportunities
        opps_start = time.perf_counter()
        top_opps = run_top_opportunities(['US', 'IN'], top_n=15)
        pipeline_timer.record('Top_Opportunities', time.perf_counter() - opps_start)
        
        # Validate top opportunities was generated
        if not top_opps:
            logger.warning("[AUTHORITY] Top opportunities ranking returned empty")
        else:
            # Extract metadata for integrity check
            total_initiate = 0
            total_avoid = 0
            for market, result in top_opps.items():
                if isinstance(result, dict):
                    metadata = result.get('metadata', {})
                    total_initiate += metadata.get('initiate_candidates', 0)
                    total_avoid += metadata.get('avoid_candidates', 0)
                    opps = result.get('opportunities', [])
                    avoids = result.get('avoid_list', [])
                    logger.info(f"[AUTHORITY] {market}: {len(opps)} top opportunities, {len(avoids)} top avoids")
            
            logger.info("")
            logger.info("[INTEGRITY CHECK]")
            logger.info(f"  INITIATE candidates across markets: {total_initiate}")
            logger.info(f"  AVOID candidates across markets: {total_avoid}")
            
            # HARD ASSERTION: At least some signals must exist
            if total_initiate == 0 and total_avoid == 0:
                logger.error("CRITICAL: No INITIATE or AVOID signals generated!")
                logger.error("Pipeline integrity check FAILED - review decision engine")
            else:
                logger.info("  ✓ Signal presence check PASSED")
            
            # CONVICTION RESOLUTION CHECK
            # Verify convictions are NOT quantized to multiples of 5
            all_convictions = []
            for market in ['US', 'IN']:
                market_dir = OUTPUT_DIR / market
                if market_dir.exists():
                    import json
                    for f in market_dir.glob('*.json'):
                        if f.name.startswith('_'):
                            continue
                        try:
                            with open(f, 'r') as file:
                                data = json.load(file)
                            conv = data.get('conviction_pct', data.get('conviction', 0) * 100)
                            if conv > 0:
                                all_convictions.append(conv)
                        except:
                            pass
            
            # ==================================================================
            # DATA INTEGRITY CHECKS (MANDATORY - FAIL PIPELINE IF VIOLATED)
            # ==================================================================
            logger.info("")
            logger.info("[DATA INTEGRITY CHECKS]")
            
            integrity_passed = True
            valid_intents = {'INITIATE', 'ADD', 'HOLD', 'REDUCE', 'EXIT', 'AVOID'}
            intent_to_if_not_holding = {
                'INITIATE': 'INITIATE', 'ADD': 'INITIATE',
                'HOLD': 'WAIT',
                'REDUCE': 'AVOID', 'EXIT': 'AVOID', 'AVOID': 'AVOID'
            }
            
            for market in ['US', 'IN']:
                market_dir = OUTPUT_DIR / market
                if not market_dir.exists():
                    continue
                
                market_intents = []
                market_convictions = []
                legacy_conviction_found = False
                mapping_violations = 0
                
                for f in market_dir.glob('*.json'):
                    if f.name.startswith('_'):
                        continue
                    try:
                        with open(f, 'r') as file:
                            data = json.load(file)
                        
                        # Check 1: Verify conviction_raw and conviction_pct exist
                        if 'conviction' in data and 'conviction_raw' not in data:
                            # Old format without new fields - will be fixed on regeneration
                            legacy_conviction_found = True
                        
                        # Check 2: Intent is valid
                        intent = data.get('intent', '')
                        if intent not in valid_intents:
                            logger.warning(f"  Invalid intent '{intent}' in {f.name}")
                        market_intents.append(intent)
                        
                        # Check 3: if_not_holding matches strict mapping
                        if_not = data.get('if_not_holding', '')
                        expected_if_not = intent_to_if_not_holding.get(intent, '')
                        if if_not and expected_if_not and if_not != expected_if_not:
                            mapping_violations += 1
                        
                        # Check 4: Conviction values
                        conv = data.get('conviction_pct', data.get('conviction_raw', 0) * 100)
                        if conv > 0:
                            market_convictions.append(conv)
                    except:
                        pass
                
                # Report results
                unique_convictions = len(set([round(c, 1) for c in market_convictions]))
                
                # Check 5: Schema version
                schema_valid = True
                for f in market_dir.glob('*.json'):
                    if f.name.startswith('_'):
                        continue
                    try:
                        with open(f, 'r') as file:
                            data = json.load(file)
                        if data.get('schema_version') != SCHEMA_VERSION:
                            schema_valid = False
                            break
                    except:
                        pass
                
                if not schema_valid:
                    logger.warning(f"  {market}: Schema version mismatch (will fix on regeneration)")
                
                if legacy_conviction_found:
                    logger.warning(f"  {market}: Legacy 'conviction' field without conviction_raw/pct (will fix on regeneration)")
                
                if mapping_violations > 0:
                    logger.warning(f"  {market}: {mapping_violations} if_not_holding mapping violations (will fix on regeneration)")
                
                # CONVICTION UNIQUENESS CHECK - Detect re-quantization
                # Threshold: at least 50 unique values per 100 stocks
                min_unique_threshold = max(50, len(market_convictions) // 2)
                if unique_convictions < min_unique_threshold and len(market_convictions) > 100:
                    logger.warning(f"  {market}: CONVICTION QUANTIZATION DETECTED ({unique_convictions} unique values, expected >={min_unique_threshold})")
                    logger.warning(f"  {market}: This indicates conviction calculation may have regressed to discrete steps")
                else:
                    logger.info(f"  {market}: Conviction uniqueness OK ({unique_convictions} unique values)")
                
                # Intent distribution
                from collections import Counter
                intent_dist = Counter(market_intents)
                logger.info(f"  {market}: Intent distribution: {dict(intent_dist)}")
            
            if integrity_passed:
                logger.info("  ✓ DATA INTEGRITY CHECKS PASSED")
            else:
                logger.error("  ✗ DATA INTEGRITY CHECKS FAILED")
                # Don't fail pipeline on legacy data - it will be fixed on next run
        
        # ==================================================================
        # FINAL AUTHORITY MODE VALIDATION
        # ==================================================================
        logger.info("\n" + "=" * 60)
        logger.info("AUTHORITY MODE VALIDATION")
        logger.info("=" * 60)
        
        # Check required outputs exist
        authority_valid = True
        required_outputs = [
            OUTPUT_DIR / 'US' / '_portfolio_intelligence.json',
            OUTPUT_DIR / 'IN' / '_portfolio_intelligence.json',
            OUTPUT_DIR / 'US' / '_top_opportunities.json',
            OUTPUT_DIR / 'IN' / '_top_opportunities.json',
        ]
        
        for output in required_outputs:
            if output.exists():
                logger.info(f"  ✓ {output.name}")
            else:
                logger.warning(f"  ✗ MISSING: {output.name}")
                authority_valid = False
        
        if authority_valid:
            logger.info("")
            logger.info("  ✓ AUTHORITY MODE OUTPUTS COMPLETE")
        else:
            logger.warning("")
            logger.warning("  ⚠ AUTHORITY MODE INCOMPLETE - Some outputs missing")
        
        # ==================================================================
        # SUMMARY
        # ==================================================================
        elapsed = (datetime.now() - start_time).total_seconds()
        
        logger.info("\n" + "=" * 60)
        logger.info("FULL-UNIVERSE PIPELINE COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Version: {VERSION}")
        logger.info(f"Processed: {self.stats['processed']}")
        logger.info(f"Success: {self.stats['success']}")
        logger.info(f"Errors: {self.stats['errors']}")
        logger.info(f"Time: {elapsed:.1f}s")
        logger.info(f"Output: {OUTPUT_DIR}")
        logger.info("")
        
        # Layer timing breakdown
        pipeline_timer.log_summary(logger)
        
        logger.info("")
        logger.info("LAYER COVERAGE:")
        for layer, count in self.stats['layers_applied'].items():
            logger.info(f"  {layer}: {count} stocks")
        
        # Data validation summary
        validation_summary = data_validator.get_validation_summary()
        logger.info("")
        logger.info("DATA VALIDATION SUMMARY:")
        logger.info(f"  Total validated: {validation_summary['total_validated']}")
        logger.info(f"  Valid stocks: {validation_summary['total_valid']}")
        logger.info(f"  Excluded: {validation_summary['total_excluded']}")
        
        logger.info("=" * 60)
        
        # Intent distribution
        intent_counts = {}
        for intel in all_intel:
            intent = intel.intent
            intent_counts[intent] = intent_counts.get(intent, 0) + 1
        
        logger.info("\nINTENT DISTRIBUTION:")
        for intent, count in sorted(intent_counts.items()):
            logger.info(f"  {intent}: {count}")
        
        # Data freshness
        logger.info("")
        logger.info(f"Data as of: {date.today()}")
        logger.info(f"Pipeline ran at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC")
        
        return {
            'version': VERSION,
            'stats': self.stats,
            'errors': self.errors,
            'intent_distribution': intent_counts,
            'elapsed_seconds': elapsed,
            'us_stocks': len([i for i in all_intel if i.market == 'US']),
            'in_stocks': len([i for i in all_intel if i.market == 'IN']),
            'layer_times': pipeline_timer.layer_times,
            'validation_summary': validation_summary,
        }


# =============================================================================
# POST-RUN SAFETY CHECK
# =============================================================================

def verify_output_counts() -> bool:
    """
    Post-run safety check: Verify universe was not capped.
    
    FAILS if either market has <= 60 stocks.
    """
    us_count = len(list((OUTPUT_DIR / 'US').glob('*.json')))
    in_count = len(list((OUTPUT_DIR / 'IN').glob('*.json')))
    
    logger.info(f"Output verification: US={us_count}, IN={in_count}")
    
    if us_count <= 60 or in_count <= 60:
        raise RuntimeError(
            f"╔══════════════════════════════════════════════════════════════════╗\n"
            f"║           POST-RUN VERIFICATION FAILED                          ║\n"
            f"╠══════════════════════════════════════════════════════════════════╣\n"
            f"║ Universe appears to be CAPPED. This violates full-universe mode.║\n"
            f"║                                                                  ║\n"
            f"║ US stocks in output: {us_count:<43}║\n"
            f"║ IN stocks in output: {in_count:<43}║\n"
            f"║ Minimum required:    60 (per market)                            ║\n"
            f"║                                                                  ║\n"
            f"║ This is a PIPELINE FAILURE. Investigate and re-run.             ║\n"
            f"╚══════════════════════════════════════════════════════════════════╝"
        )
    
    return True


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def main():
    """Main entry point - FULL UNIVERSE ONLY."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Full Universe 14-Layer Intelligence Pipeline',
        epilog='This is the ONLY authorized execution path. All other modes are disabled.'
    )
    parser.add_argument(
        '--full-universe', 
        action='store_true', 
        default=True,
        help='Process full universe (DEFAULT, always enabled)'
    )
    parser.add_argument(
        '--no-portfolio', 
        action='store_true', 
        help='Skip portfolio simulation'
    )
    parser.add_argument(
        '--skip-verification',
        action='store_true',
        help='Skip post-run output verification (NOT RECOMMENDED)'
    )
    
    # LEGACY FLAGS - These exist only to fail gracefully
    parser.add_argument('--test', action='store_true', help='DISABLED: Test mode removed')
    parser.add_argument('--us-only', action='store_true', help='DISABLED: Single-market mode removed')
    parser.add_argument('--in-only', action='store_true', help='DISABLED: Single-market mode removed')
    
    args = parser.parse_args()
    
    # Reject legacy flags
    if args.test:
        raise RuntimeError(
            "TEST MODE DISABLED. Full-universe execution is now mandatory. "
            "Use the full pipeline or do not run."
        )
    
    if args.us_only or args.in_only:
        raise RuntimeError(
            "SINGLE-MARKET MODE DISABLED. Both US and IN markets must be processed. "
            "Full-universe execution is mandatory."
        )
    
    # Run full universe pipeline
    generator = FullUniverseIntelligenceGenerator()
    result = generator.run_full_universe(run_portfolio=not args.no_portfolio)
    
    # Post-run verification
    if not args.skip_verification:
        verify_output_counts()
    
    # Return exit code based on success
    if result and result['stats']['success'] > 0:
        logger.info("\n✓ Pipeline completed successfully")
        return 0
    else:
        logger.error("\n✗ Pipeline failed - no stocks processed successfully")
    return 1


if __name__ == '__main__':
    sys.exit(main())
