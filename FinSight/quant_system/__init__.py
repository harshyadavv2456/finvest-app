"""
FinSight Quant System - v2.3-authority
======================================

14-Layer Institutional-Grade Decision Authority System.

AUTHORITY MODE: FinSight is the final word on capital allocation decisions.

EXECUTION MODE: FULL-UNIVERSE ONLY
- No Top-50 caps
- Minimum 30 stocks per market
- Single output path: public/intelligence/

Architecture:
━━━━━━━━━━━━━
Layer 1:  Signal Factory         - Raw data to normalized signals
Layer 2:  Regime Engine          - HMM-based regime classification
Layer 3:  Signal Efficacy        - Walk-forward signal evaluation
Layer 4:  Probability Engine     - Return distributions + CVaR
Layer 5:  Backtesting Engine     - Realistic backtests + attribution
Layer 6:  Decision Engine        - Intent mapping (INITIATE/HOLD/AVOID)
Layer 7:  LLM Interpreter        - Language-constrained interpretations
Layer 8:  Meta-Backtest          - Decision quality metrics
Layer 9:  Portfolio Simulator    - Correlation-aware risk
Layer 10: Fundamental Trajectory - Financial momentum (NOT valuation)
Layer 11: Intraday Structure     - Minute-level institutional behavior
Layer 12: News Reaction          - Price response to events (NOT sentiment)
Layer 13: Insider Signal V2      - Clustered, regime-conditional insider
Layer 14: Market Participation   - FII/DII flow analysis (India)

AUTHORITY MODE OUTPUTS (v2.3):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Portfolio Intelligence: Top-down capital allocation control
- Top Opportunities: Edge-based opportunity ranking
- Action-First Framing: if_holding / if_not_holding decisions
- Position Guidance: Portfolio-aware sizing

All new layers feed into Layer 6 as MODIFIERS, not independent signals.

Usage:
    # Run the FULL UNIVERSE pipeline (the ONLY supported mode)
    python -m quant_system.run_full_daily_intelligence --full-universe
    
    # Legacy modes are DISABLED:
    # python -m quant_system.run_daily_intelligence  ← RAISES RuntimeError
"""

__version__ = "2.3.0"
__author__ = "FinSight Quant Team"

# Core pipeline
from .pipeline import run_pipeline

# Layer exports
from .layer2_regime_engine import RegimeEngine, RegimeOutput
from .layer3_signal_efficacy import SignalEfficacyModel, SignalCorrelationAnalyzer
from .layer4_probability_engine import ProbabilityEngine, ProbabilisticOutcome
from .layer5_backtesting_engine import BacktestingEngine, BacktestSummary
from .layer6_decision_engine import DecisionEngine, Decision, PositionIntent
from .layer7_llm_interpreter import LLMInterpreter, Interpretation
from .layer8_meta_backtest import MetaBacktestEngine, DecisionQualityReport

# Signal registry
from .signal_registry import SignalRegistry, get_signal_registry, SignalType

# Signal efficacy trainer
from .signal_efficacy_trainer import SignalEfficacyTrainer, SignalEfficacyStats

# Portfolio simulator
from .layer9_portfolio_simulator import (
    PortfolioSimulator,
    PortfolioConfig,
    PortfolioState,
    Position,
    SimulationResult,
    format_api_response
)

# NEW: Layer 13 - Insider Signal V2
from .insider_signal_v2 import InsiderSignalV2, get_insider_confidence_modifier

# Configuration
from .config import (
    DEFAULT_REGIME_CONFIG,
    DEFAULT_EFFICACY_CONFIG,
    DEFAULT_PROBABILITY_CONFIG,
    DEFAULT_BACKTEST_CONFIG,
    DEFAULT_DECISION_CONFIG,
    DEFAULT_LLM_CONFIG
)

# Utilities
from .utils import (
    load_price_history,
    load_financials,
    compute_returns,
    compute_realized_volatility
)

__all__ = [
    # Pipeline
    'run_pipeline',
    
    # Layer 2
    'RegimeEngine',
    'RegimeOutput',
    
    # Layer 3
    'SignalEfficacyModel',
    'SignalCorrelationAnalyzer',
    
    # Layer 4
    'ProbabilityEngine',
    'ProbabilisticOutcome',
    
    # Layer 5
    'BacktestingEngine',
    'BacktestSummary',
    
    # Layer 6
    'DecisionEngine',
    'Decision',
    'PositionIntent',
    
    # Layer 7
    'LLMInterpreter',
    'Interpretation',
    
    # Layer 8 (Meta-Backtest)
    'MetaBacktestEngine',
    'DecisionQualityReport',
    
    # Layer 9 (Portfolio)
    'PortfolioSimulator',
    'PortfolioConfig',
    'PortfolioState',
    'Position',
    'SimulationResult',
    'format_api_response',
    
    # Layer 13 (Insider Signal V2)
    'InsiderSignalV2',
    'get_insider_confidence_modifier',
    
    # Config
    'DEFAULT_REGIME_CONFIG',
    'DEFAULT_EFFICACY_CONFIG',
    'DEFAULT_PROBABILITY_CONFIG',
    'DEFAULT_BACKTEST_CONFIG',
    'DEFAULT_DECISION_CONFIG',
    'DEFAULT_LLM_CONFIG',
    
    # Utils
    'load_price_history',
    'load_financials',
    'compute_returns',
    'compute_realized_volatility',
]

# =============================================================================
# VERSION INFO
# =============================================================================

VERSION_INFO = {
    'version': __version__,
    'codename': 'authority',
    'layers': 14,
    'execution_mode': 'FULL_UNIVERSE_AUTHORITY',
    'min_universe_size': 30,
    'output_path': 'public/intelligence/',
    'disabled_paths': ['public/insights/'],
    'disabled_modes': ['test', 'us-only', 'in-only', 'top-50'],
    'authority_outputs': [
        '_portfolio_intelligence.json',
        '_top_opportunities.json',
    ],
}

def get_version_info():
    """Return version information for the quant system."""
    return VERSION_INFO
