"""
FinSight Quant System Data Schemas
==================================

Pydantic models and dataclasses for type safety and validation.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import date, datetime
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class RegimeState(str, Enum):
    """Market regime states."""
    ACCUMULATION = "accumulation"
    MARKUP = "markup"
    DISTRIBUTION = "distribution"
    MARKDOWN = "markdown"
    PANIC = "panic"
    RECOVERY = "recovery"


class VolatilityRegime(str, Enum):
    """Volatility regime states."""
    LOW = "low"
    NORMAL = "normal"
    ELEVATED = "elevated"
    EXTREME = "extreme"


class TrendRegime(str, Enum):
    """Trend regime states."""
    STRONG_UP = "strong_up"
    WEAK_UP = "weak_up"
    SIDEWAYS = "sideways"
    WEAK_DOWN = "weak_down"
    STRONG_DOWN = "strong_down"


class PositionIntentEnum(str, Enum):
    """Position intent actions."""
    INITIATE = "INITIATE"
    ADD = "ADD"
    HOLD = "HOLD"
    REDUCE = "REDUCE"
    EXIT = "EXIT"
    HEDGE = "HEDGE"
    AVOID = "AVOID"


class TimeHorizonEnum(str, Enum):
    """Trading time horizons."""
    TACTICAL = "tactical"
    SHORT_TERM = "short_term"
    MEDIUM_TERM = "medium_term"
    LONG_TERM = "long_term"


class FailureReasonEnum(str, Enum):
    """Trade failure reasons."""
    REGIME_MISCLASSIFICATION = "regime_misclassification"
    SIGNAL_DISAGREEMENT = "signal_disagreement"
    VOLATILITY_SPIKE = "volatility_spike"
    VALUATION_TRAP = "valuation_trap"
    LIQUIDITY_GAP = "liquidity_gap"
    MARKET_REGIME_SHIFT = "market_regime_shift"
    CORRELATION_BREAKDOWN = "correlation_breakdown"
    TIMING_ERROR = "timing_error"
    UNKNOWN = "unknown"


# =============================================================================
# LAYER 1: SIGNAL FACTORY SCHEMAS
# =============================================================================

class SignalOutput(BaseModel):
    """Single signal data point."""
    ticker: str
    date: date
    
    # Price momentum
    ret_1d: Optional[float] = None
    ret_5d: Optional[float] = None
    ret_20d: Optional[float] = None
    ret_60d: Optional[float] = None
    
    # Volatility
    vol_20d: Optional[float] = None
    vol_60d: Optional[float] = None
    vol_ratio: Optional[float] = None
    
    # Technical
    rsi_14: Optional[float] = None
    macd_signal: Optional[float] = None
    bb_position: Optional[float] = None
    sma_20_distance: Optional[float] = None
    sma_50_distance: Optional[float] = None
    sma_200_distance: Optional[float] = None
    
    # Valuation
    pe_percentile: Optional[float] = None
    pb_percentile: Optional[float] = None
    ps_percentile: Optional[float] = None
    
    # Quality
    roe: Optional[float] = None
    roa: Optional[float] = None
    debt_to_equity: Optional[float] = None
    
    # Smart money
    insider_net_buy: Optional[float] = None
    institutional_change: Optional[float] = None
    
    # Options
    iv_percentile: Optional[float] = None
    put_call_ratio: Optional[float] = None


# =============================================================================
# LAYER 2: REGIME ENGINE SCHEMAS
# =============================================================================

class RegimeOutput(BaseModel):
    """Regime classification output."""
    ticker: str
    date: date
    
    # Asset regime
    regime: RegimeState
    confidence: float = Field(ge=0, le=1)
    days_in_regime: int
    expected_persistence: int
    
    # Volatility & trend
    vol_regime: VolatilityRegime
    trend_regime: TrendRegime
    
    # Market regime (UPGRADE)
    market_regime: RegimeState
    market_regime_confidence: float = Field(ge=0, le=1)
    
    # Relative strength (UPGRADE)
    relative_regime_strength: float = Field(ge=-1, le=1)
    regime_divergence: Literal["aligned", "outperforming", "underperforming", "divergent"]
    
    # Composite
    composite_regime_score: float


# =============================================================================
# LAYER 3: SIGNAL EFFICACY SCHEMAS
# =============================================================================

class SignalCorrelationOutput(BaseModel):
    """Signal correlation analysis."""
    signal1: str
    signal2: str
    correlation: float
    mutual_information: float
    redundancy_score: float


class SignalContributionOutput(BaseModel):
    """Signal contribution with penalty."""
    signal_name: str
    raw_contribution: float
    correlation_penalty: float = Field(ge=0, le=1)
    effective_contribution: float
    primary_regime: str
    consistency_score: float = Field(ge=0, le=1)


class SignalEfficacyReport(BaseModel):
    """Signal efficacy for a specific regime/horizon."""
    signal_name: str
    regime: str
    horizon: int
    n_observations: int
    
    # Performance
    hit_rate: float
    information_coefficient: float
    
    # Return distribution
    forward_return_p10: float
    forward_return_p50: float
    forward_return_p90: float
    forward_return_mean: float
    forward_return_std: float
    
    # UPGRADE: Correlation-adjusted
    correlation_penalty: float
    effective_ic: float


# =============================================================================
# LAYER 4: PROBABILITY ENGINE SCHEMAS
# =============================================================================

class ConditionalVolatilityOutput(BaseModel):
    """Conditional volatility output."""
    vol_normal: float
    vol_stress: float
    vol_tail: float
    vol_current: float
    vol_forecast: float
    vol_regime: VolatilityRegime
    vol_percentile: float = Field(ge=0, le=1)


class ReturnDistributionOutput(BaseModel):
    """Return distribution output."""
    horizon: int
    n_observations: int
    
    p5: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float
    
    mean: float
    std: float
    skew: float
    
    # UPGRADE: Stress scenarios
    p10_stress: float
    p10_tail: float
    
    distribution_type: Literal["normal", "fat_tailed", "skewed"]


class RiskMetricsOutput(BaseModel):
    """Risk metrics output."""
    cvar_95: float
    cvar_99: float
    
    # UPGRADE: Regime-conditioned CVaR
    cvar_95_normal: float
    cvar_95_stress: float
    cvar_95_panic: float
    
    var_95: float
    var_99: float
    max_drawdown_expected: float
    sortino_ratio: float
    tail_ratio: float


class ProbabilisticOutcomeOutput(BaseModel):
    """Complete probabilistic outcome."""
    ticker: str
    date: date
    horizon: int
    
    # Regime context
    asset_regime: str
    market_regime: str
    relative_strength: float
    
    # Return distribution
    return_distribution: ReturnDistributionOutput
    
    # UPGRADE: Conditional volatility
    volatility: ConditionalVolatilityOutput
    
    # UPGRADE: Regime-conditioned risk
    risk_metrics: RiskMetricsOutput
    
    # Quality
    data_quality_score: float = Field(ge=0, le=1)
    regime_confidence: float = Field(ge=0, le=1)
    n_comparable_setups: int


# =============================================================================
# LAYER 5: BACKTESTING SCHEMAS
# =============================================================================

class FailureAttributionOutput(BaseModel):
    """Failure attribution for a trade."""
    primary_reason: FailureReasonEnum
    secondary_reasons: List[FailureReasonEnum]
    confidence: float
    
    regime_at_entry: str
    regime_at_failure: str
    regime_changed: bool
    
    signal_agreement_score: float
    contrarian_signals: List[str]
    
    vol_at_entry: float
    vol_at_failure: float
    vol_spike_magnitude: float
    
    market_regime_at_entry: str
    market_regime_at_failure: str
    
    loss_from_this_reason: float


class TradeOutput(BaseModel):
    """Trade record with full context."""
    ticker: str
    entry_date: date
    exit_date: Optional[date]
    
    direction: Literal["long", "short"]
    intent: PositionIntentEnum
    entry_price: float
    exit_price: Optional[float]
    position_size: float
    position_pct: float
    
    entry_regime: str
    exit_regime: Optional[str]
    entry_market_regime: str
    
    pnl: float
    pnl_pct: float
    holding_days: int
    
    failed: bool
    failure_attribution: Optional[FailureAttributionOutput]


class BacktestSummaryOutput(BaseModel):
    """Backtest summary with failure analysis."""
    strategy_name: str
    start_date: date
    end_date: date
    
    # Performance
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    
    # Trade stats
    total_trades: int
    win_rate: float
    profit_factor: float
    
    # UPGRADE: Failure attribution
    failure_reason_distribution: Dict[str, float]
    
    # Comparable setup stats
    comparable_setup_stats: Dict[str, Any]


# =============================================================================
# LAYER 6: DECISION ENGINE SCHEMAS
# =============================================================================

class PositionSizingOutput(BaseModel):
    """Position sizing guidance."""
    max_position_pct: float
    recommended_position_pct: float
    min_position_pct: float
    risk_budget_used_pct: float
    var_contribution: float
    scale_in_tranches: int
    tranche_size_pct: float


class DecisionOutput(BaseModel):
    """Complete decision output."""
    ticker: str
    date: date
    
    # UPGRADE: Position intent
    intent: PositionIntentEnum
    direction: Literal["long", "short", "neutral"]
    
    conviction: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    
    # UPGRADE: Position sizing
    position_sizing: PositionSizingOutput
    
    # Risk-reward
    risk_reward_ratio: float
    expected_return: float
    expected_risk: float
    
    # Time horizon
    time_horizon: TimeHorizonEnum
    expected_holding_days: int
    
    # Regime context
    asset_regime: str
    market_regime: str
    relative_strength: float
    regime_alignment: str
    
    # Signals
    key_supporting_signals: List[str]
    key_opposing_signals: List[str]
    signal_agreement: float
    
    # Guidance
    rationale: str
    risk_factors: List[str]
    upgrade_conditions: List[str]
    downgrade_conditions: List[str]


# =============================================================================
# LAYER 7: LLM INTERPRETER SCHEMAS
# =============================================================================

class InterpretationValidation(BaseModel):
    """Interpretation validation results."""
    is_valid: bool
    language_violations: List[str]
    completeness_checks: Dict[str, bool]


class InterpretationOutput(BaseModel):
    """Complete LLM interpretation."""
    ticker: str
    date: date
    
    # Sections
    summary: str
    comparable_setups: str
    probability_outlook: str
    risk_assessment: str
    regime_context: str
    counterfactual: str
    signal_citation: str
    position_guidance: str
    
    # Validation
    validation: InterpretationValidation


# =============================================================================
# API RESPONSE SCHEMAS
# =============================================================================

class AnalysisResponse(BaseModel):
    """Complete analysis response for API."""
    ticker: str
    market: str
    analysis_date: date
    
    # Regime
    regime: RegimeOutput
    
    # Probability
    outcome: ProbabilisticOutcomeOutput
    
    # Decision
    decision: DecisionOutput
    
    # Interpretation
    interpretation: InterpretationOutput
    
    # Backtest context
    backtest_summary: Optional[BacktestSummaryOutput]
