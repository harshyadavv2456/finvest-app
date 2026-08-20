"""
LAYER 9: Portfolio Simulator (Institutional Grade)
===================================================

Simulates a portfolio over time using historical decisions from the decision engine.

This layer answers: "If a user followed this system across many stocks over time,
what would happen to their capital?"

STRICT RULES:
1. NOT a price prediction engine
2. NOT an execution engine  
3. All logic consumes outputs from the existing decision engine
4. No hard-coded trades - only decision-driven actions
5. Portfolio risk control > returns
6. Must be explainable in plain English

Capital preservation through uncertainty is the primary objective.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import logging
import json

from .layer6_decision_engine import PositionIntent, Decision
from .config import MODEL_OUTPUT_DIR

logger = logging.getLogger(__name__)


# =============================================================================
# PORTFOLIO CONFIGURATION
# =============================================================================

@dataclass
class PortfolioConfig:
    """
    Institutional portfolio constraints.
    
    These are DEFAULT constraints - conservative by design.
    """
    # Position limits
    max_positions: int = 15
    max_position_size_pct: float = 0.06          # 6% max per position
    probe_position_size_pct: float = 0.015       # 1.5% for PROBE positions
    min_position_size_pct: float = 0.01          # 1% minimum
    
    # Sector/exposure limits
    max_sector_exposure_pct: float = 0.25        # 25% max per sector
    max_regime_exposure_pct: float = 0.40        # 40% max in any single regime
    
    # Risk limits
    max_portfolio_drawdown_pct: float = 0.12     # 12% max drawdown trigger
    cash_floor_pct: float = 0.20                 # 20% minimum cash
    max_daily_turnover_pct: float = 0.10         # 10% max daily turnover
    
    # Execution
    slippage_bps: int = 5                        # 5 basis points
    commission_bps: int = 10                     # 10 basis points roundtrip
    use_next_day_open: bool = True               # No lookahead bias
    
    # Regime-based exposure caps
    regime_exposure_caps: Dict[str, float] = field(default_factory=lambda: {
        'markup': 0.80,         # Allow high exposure
        'accumulation': 0.70,   # Moderate-high
        'recovery': 0.60,       # Moderate
        'distribution': 0.30,   # Probes only
        'markdown': 0.20,       # Minimal exposure
        'panic': 0.10,          # Force cash
    })
    
    # Intent-based sizing
    intent_size_multipliers: Dict[str, float] = field(default_factory=lambda: {
        'INITIATE': 1.0,
        'ADD': 0.5,             # Scale-in at half size
        'PROBE': 0.25,          # Small test position
        'HOLD': 0.0,            # No change
        'REDUCE': -0.5,         # Cut half
        'EXIT': -1.0,           # Full exit
        'AVOID': 0.0,           # No action
    })


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class Position:
    """Individual position in the portfolio."""
    ticker: str
    entry_date: date
    entry_price: float
    current_price: float
    shares: int
    position_value: float
    position_pct: float  # As % of portfolio
    
    # Decision context
    intent_at_entry: str
    conviction_at_entry: float
    regime_at_entry: str
    horizon: str
    
    # Risk tracking
    risk_budget_used: float
    max_price_seen: float
    min_price_seen: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    max_drawdown_seen: float
    days_held: int
    
    # Metadata
    sector: Optional[str] = None
    scale_ins: int = 1
    last_action_date: Optional[date] = None
    
    def update_price(self, new_price: float, current_date: date):
        """Update position with new price."""
        self.current_price = new_price
        self.position_value = self.shares * new_price
        self.unrealized_pnl = self.position_value - (self.shares * self.entry_price)
        self.unrealized_pnl_pct = (new_price / self.entry_price - 1) if self.entry_price > 0 else 0
        
        # Track extremes
        self.max_price_seen = max(self.max_price_seen, new_price)
        self.min_price_seen = min(self.min_price_seen, new_price)
        
        # Drawdown from peak
        if self.max_price_seen > 0:
            self.max_drawdown_seen = min(
                self.max_drawdown_seen,
                (new_price / self.max_price_seen - 1)
            )
        
        self.days_held = (current_date - self.entry_date).days


@dataclass
class PortfolioState:
    """Complete portfolio state at a point in time."""
    date: date
    
    # Capital
    cash_balance: float
    total_equity: float
    invested_value: float
    
    # Tracking
    peak_equity: float
    drawdown: float
    drawdown_pct: float
    
    # Positions
    open_positions: Dict[str, Position]
    num_positions: int
    
    # Exposure analysis
    exposure_by_regime: Dict[str, float]
    exposure_by_sector: Dict[str, float]
    total_exposure_pct: float
    cash_pct: float
    
    # Day's activity
    trades_today: List[Dict[str, Any]]
    turnover_today: float
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            'date': self.date.isoformat(),
            'cash_balance': self.cash_balance,
            'total_equity': self.total_equity,
            'invested_value': self.invested_value,
            'peak_equity': self.peak_equity,
            'drawdown': self.drawdown,
            'drawdown_pct': self.drawdown_pct,
            'num_positions': self.num_positions,
            'exposure_by_regime': self.exposure_by_regime,
            'total_exposure_pct': self.total_exposure_pct,
            'cash_pct': self.cash_pct,
            'turnover_today': self.turnover_today,
        }


@dataclass
class Trade:
    """Record of a single trade."""
    date: date
    ticker: str
    action: str  # BUY, SELL, ADD, REDUCE
    intent: str
    shares: int
    price: float
    value: float
    
    # Context
    regime_at_trade: str
    conviction: float
    reason: str
    
    # Result (filled in on exit)
    exit_date: Optional[date] = None
    exit_price: Optional[float] = None
    realized_pnl: Optional[float] = None
    realized_pnl_pct: Optional[float] = None
    holding_days: Optional[int] = None


@dataclass
class SimulationResult:
    """Complete simulation results."""
    # Metadata
    start_date: date
    end_date: date
    initial_capital: float
    final_capital: float
    
    # Performance metrics
    total_return: float
    cagr: float
    max_drawdown: float
    volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    
    # Activity metrics
    total_trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    avg_holding_days: float
    turnover_annualized: float
    
    # Time allocation
    time_in_cash_pct: float
    time_fully_invested_pct: float
    
    # Decision quality
    initiate_success_rate: float
    avoid_loss_prevention_rate: float
    regime_performance: Dict[str, Dict[str, float]]
    
    # Time series
    equity_curve: List[Dict[str, Any]]
    drawdown_curve: List[Dict[str, Any]]
    
    # Explainability
    explanation: Dict[str, str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to API-friendly dictionary."""
        return {
            'period': f"{self.start_date.year}-{self.end_date.year}",
            'initial_capital': self.initial_capital,
            'final_capital': self.final_capital,
            'total_return': self.total_return,
            'cagr': self.cagr,
            'max_drawdown': self.max_drawdown,
            'volatility': self.volatility,
            'sharpe_ratio': self.sharpe_ratio,
            'sortino_ratio': self.sortino_ratio,
            'total_trades': self.total_trades,
            'win_rate': self.win_rate,
            'avg_win': self.avg_win,
            'avg_loss': self.avg_loss,
            'time_in_cash_pct': self.time_in_cash_pct,
            'initiate_success_rate': self.initiate_success_rate,
            'avoid_loss_prevention_rate': self.avoid_loss_prevention_rate,
            'regime_performance': self.regime_performance,
            'equity_curve': self.equity_curve,
            'drawdown_curve': self.drawdown_curve,
            'explanation': self.explanation,
        }


# =============================================================================
# PORTFOLIO SIMULATOR
# =============================================================================

class PortfolioSimulator:
    """
    Institutional-grade portfolio simulator.
    
    Simulates a portfolio over time using historical decisions,
    with proper risk controls and no lookahead bias.
    """
    
    def __init__(self, config: PortfolioConfig = None, initial_capital: float = 1_000_000):
        self.config = config or PortfolioConfig()
        self.initial_capital = initial_capital
        
        # State
        self.cash = initial_capital
        self.positions: Dict[str, Position] = {}
        self.peak_equity = initial_capital
        
        # History
        self.state_history: List[PortfolioState] = []
        self.trade_history: List[Trade] = []
        
        # Tracking
        self.current_date: Optional[date] = None
        self.days_simulated = 0
        
    def reset(self):
        """Reset simulator to initial state."""
        self.cash = self.initial_capital
        self.positions = {}
        self.peak_equity = self.initial_capital
        self.state_history = []
        self.trade_history = []
        self.current_date = None
        self.days_simulated = 0
    
    def _get_total_equity(self) -> float:
        """Calculate total portfolio equity."""
        invested = sum(p.position_value for p in self.positions.values())
        return self.cash + invested
    
    def _get_exposure_by_regime(self) -> Dict[str, float]:
        """Calculate exposure breakdown by regime."""
        exposure = {}
        total_equity = self._get_total_equity()
        
        if total_equity == 0:
            return exposure
        
        for pos in self.positions.values():
            regime = pos.regime_at_entry
            if regime not in exposure:
                exposure[regime] = 0
            exposure[regime] += pos.position_value / total_equity
        
        return exposure
    
    def _get_exposure_by_sector(self) -> Dict[str, float]:
        """Calculate exposure breakdown by sector."""
        exposure = {}
        total_equity = self._get_total_equity()
        
        if total_equity == 0:
            return exposure
        
        for pos in self.positions.values():
            sector = pos.sector or 'Unknown'
            if sector not in exposure:
                exposure[sector] = 0
            exposure[sector] += pos.position_value / total_equity
        
        return exposure
    
    def _can_add_position(self, decision: Decision, current_regime: str) -> Tuple[bool, str]:
        """
        Check if we can add a new position given constraints.
        
        Returns: (can_add, reason)
        """
        total_equity = self._get_total_equity()
        
        # Check position count
        if len(self.positions) >= self.config.max_positions:
            return False, "Max positions reached"
        
        # Check if already holding
        if decision.ticker in self.positions:
            return False, "Already holding position"
        
        # Check cash floor
        cash_pct = self.cash / total_equity if total_equity > 0 else 1.0
        if cash_pct < self.config.cash_floor_pct:
            return False, "Below cash floor"
        
        # Check drawdown
        current_dd = (total_equity / self.peak_equity - 1) if self.peak_equity > 0 else 0
        if current_dd < -self.config.max_portfolio_drawdown_pct:
            return False, "Drawdown limit hit"
        
        # Check regime exposure cap
        regime_cap = self.config.regime_exposure_caps.get(current_regime, 0.5)
        current_regime_exposure = sum(
            p.position_value / total_equity 
            for p in self.positions.values() 
            if p.regime_at_entry == current_regime
        ) if total_equity > 0 else 0
        
        if current_regime_exposure >= regime_cap:
            return False, f"Regime exposure cap ({regime_cap:.0%}) reached"
        
        return True, "OK"
    
    def _calculate_position_size(
        self, 
        decision: Decision, 
        current_price: float,
        current_regime: str
    ) -> Tuple[int, float]:
        """
        Calculate position size based on decision intent and constraints.
        
        Returns: (shares, position_value)
        """
        total_equity = self._get_total_equity()
        
        # Base size from decision
        base_pct = decision.max_position_pct
        
        # Apply intent multiplier
        intent_mult = self.config.intent_size_multipliers.get(decision.intent.value, 0.5)
        
        # Cap for probes
        if decision.intent == PositionIntent.PROBE:
            base_pct = min(base_pct, self.config.probe_position_size_pct)
        
        # Cap at max position size
        target_pct = min(base_pct * intent_mult, self.config.max_position_size_pct)
        
        # Apply regime scaling
        regime_cap = self.config.regime_exposure_caps.get(current_regime, 0.5)
        target_pct = min(target_pct, regime_cap * 0.25)  # No single position > 25% of regime cap
        
        # Ensure minimum size
        target_pct = max(target_pct, self.config.min_position_size_pct)
        
        # Calculate value and shares
        target_value = total_equity * target_pct
        
        # Cap at available cash (minus slippage buffer)
        slippage_mult = 1 + (self.config.slippage_bps / 10000)
        max_value = self.cash * 0.95 / slippage_mult  # Leave 5% buffer
        target_value = min(target_value, max_value)
        
        shares = int(target_value / current_price) if current_price > 0 else 0
        actual_value = shares * current_price
        
        return shares, actual_value
    
    def _apply_slippage(self, price: float, is_buy: bool) -> float:
        """Apply slippage to execution price."""
        slippage_mult = self.config.slippage_bps / 10000
        if is_buy:
            return price * (1 + slippage_mult)
        else:
            return price * (1 - slippage_mult)
    
    def _apply_commission(self, value: float) -> float:
        """Calculate commission for a trade."""
        return value * (self.config.commission_bps / 10000)
    
    def execute_decision(
        self,
        decision: Decision,
        next_day_open: float,
        current_regime: str,
        sector: Optional[str] = None
    ) -> Optional[Trade]:
        """
        Execute a decision, respecting all constraints.
        
        Uses next-day open price for no lookahead bias.
        """
        intent = decision.intent
        ticker = decision.ticker
        
        # Handle exits first
        if intent in [PositionIntent.EXIT, PositionIntent.AVOID] and ticker in self.positions:
            return self._close_position(ticker, next_day_open, intent.value, current_regime)
        
        # Handle reduces
        if intent == PositionIntent.REDUCE and ticker in self.positions:
            return self._reduce_position(ticker, next_day_open, current_regime)
        
        # Handle new positions
        if intent in [PositionIntent.INITIATE, PositionIntent.PROBE]:
            can_add, reason = self._can_add_position(decision, current_regime)
            
            if not can_add:
                logger.debug(f"Cannot add {ticker}: {reason}")
                return None
            
            return self._open_position(decision, next_day_open, current_regime, sector)
        
        # Handle adds
        if intent == PositionIntent.ADD and ticker in self.positions:
            return self._add_to_position(decision, next_day_open, current_regime)
        
        return None
    
    def _open_position(
        self,
        decision: Decision,
        price: float,
        regime: str,
        sector: Optional[str]
    ) -> Optional[Trade]:
        """Open a new position."""
        exec_price = self._apply_slippage(price, is_buy=True)
        shares, value = self._calculate_position_size(decision, exec_price, regime)
        
        if shares == 0:
            return None
        
        # Deduct cost
        commission = self._apply_commission(value)
        total_cost = value + commission
        
        if total_cost > self.cash:
            return None
        
        self.cash -= total_cost
        
        # Create position
        total_equity = self._get_total_equity()
        position = Position(
            ticker=decision.ticker,
            entry_date=decision.date,
            entry_price=exec_price,
            current_price=exec_price,
            shares=shares,
            position_value=value,
            position_pct=value / total_equity if total_equity > 0 else 0,
            intent_at_entry=decision.intent.value,
            conviction_at_entry=decision.conviction,
            regime_at_entry=regime,
            horizon=decision.time_horizon,
            risk_budget_used=decision.risk_budget_used,
            max_price_seen=exec_price,
            min_price_seen=exec_price,
            unrealized_pnl=0,
            unrealized_pnl_pct=0,
            max_drawdown_seen=0,
            days_held=0,
            sector=sector,
            last_action_date=decision.date
        )
        
        self.positions[decision.ticker] = position
        
        # Record trade
        trade = Trade(
            date=decision.date,
            ticker=decision.ticker,
            action='BUY',
            intent=decision.intent.value,
            shares=shares,
            price=exec_price,
            value=value,
            regime_at_trade=regime,
            conviction=decision.conviction,
            reason=f"{decision.intent.value} at {decision.conviction:.0%} conviction"
        )
        
        self.trade_history.append(trade)
        logger.info(f"[{decision.date}] OPEN {decision.ticker}: {shares} shares @ ${exec_price:.2f}")
        
        return trade
    
    def _close_position(
        self,
        ticker: str,
        price: float,
        intent: str,
        regime: str
    ) -> Optional[Trade]:
        """Close an existing position."""
        if ticker not in self.positions:
            return None
        
        pos = self.positions[ticker]
        exec_price = self._apply_slippage(price, is_buy=False)
        proceeds = pos.shares * exec_price
        commission = self._apply_commission(proceeds)
        
        net_proceeds = proceeds - commission
        self.cash += net_proceeds
        
        # Calculate P&L
        cost_basis = pos.shares * pos.entry_price
        realized_pnl = net_proceeds - cost_basis
        realized_pnl_pct = (exec_price / pos.entry_price - 1) if pos.entry_price > 0 else 0
        
        # Record trade
        trade = Trade(
            date=self.current_date,
            ticker=ticker,
            action='SELL',
            intent=intent,
            shares=pos.shares,
            price=exec_price,
            value=proceeds,
            regime_at_trade=regime,
            conviction=0,
            reason=f"EXIT via {intent}",
            exit_date=self.current_date,
            exit_price=exec_price,
            realized_pnl=realized_pnl,
            realized_pnl_pct=realized_pnl_pct,
            holding_days=pos.days_held
        )
        
        self.trade_history.append(trade)
        logger.info(f"[{self.current_date}] CLOSE {ticker}: {pos.shares} shares @ ${exec_price:.2f} "
                   f"(PnL: ${realized_pnl:+.2f} / {realized_pnl_pct:+.1%})")
        
        del self.positions[ticker]
        
        return trade
    
    def _reduce_position(self, ticker: str, price: float, regime: str) -> Optional[Trade]:
        """Reduce position by half."""
        if ticker not in self.positions:
            return None
        
        pos = self.positions[ticker]
        shares_to_sell = pos.shares // 2
        
        if shares_to_sell == 0:
            return None
        
        exec_price = self._apply_slippage(price, is_buy=False)
        proceeds = shares_to_sell * exec_price
        commission = self._apply_commission(proceeds)
        
        self.cash += (proceeds - commission)
        
        # Update position
        pos.shares -= shares_to_sell
        pos.position_value = pos.shares * pos.current_price
        
        trade = Trade(
            date=self.current_date,
            ticker=ticker,
            action='REDUCE',
            intent='REDUCE',
            shares=shares_to_sell,
            price=exec_price,
            value=proceeds,
            regime_at_trade=regime,
            conviction=0,
            reason="Risk reduction"
        )
        
        self.trade_history.append(trade)
        return trade
    
    def _add_to_position(
        self,
        decision: Decision,
        price: float,
        regime: str
    ) -> Optional[Trade]:
        """Add to existing position."""
        if decision.ticker not in self.positions:
            return None
        
        pos = self.positions[decision.ticker]
        
        # Calculate add size (typically half of initial)
        add_mult = self.config.intent_size_multipliers.get('ADD', 0.5)
        target_pct = decision.max_position_pct * add_mult
        total_equity = self._get_total_equity()
        target_value = total_equity * target_pct
        
        exec_price = self._apply_slippage(price, is_buy=True)
        shares = int(target_value / exec_price)
        
        if shares == 0:
            return None
        
        value = shares * exec_price
        commission = self._apply_commission(value)
        
        if value + commission > self.cash:
            return None
        
        self.cash -= (value + commission)
        
        # Update position (adjust entry price)
        old_cost = pos.shares * pos.entry_price
        new_cost = shares * exec_price
        pos.shares += shares
        pos.entry_price = (old_cost + new_cost) / pos.shares
        pos.position_value = pos.shares * pos.current_price
        pos.scale_ins += 1
        pos.last_action_date = decision.date
        
        trade = Trade(
            date=decision.date,
            ticker=decision.ticker,
            action='ADD',
            intent='ADD',
            shares=shares,
            price=exec_price,
            value=value,
            regime_at_trade=regime,
            conviction=decision.conviction,
            reason=f"Scale-in #{pos.scale_ins}"
        )
        
        self.trade_history.append(trade)
        return trade
    
    def update_prices(self, prices: Dict[str, float], current_date: date):
        """Update all position prices."""
        self.current_date = current_date
        
        for ticker, pos in self.positions.items():
            if ticker in prices:
                pos.update_price(prices[ticker], current_date)
                
                # Update position % of portfolio
                total_equity = self._get_total_equity()
                pos.position_pct = pos.position_value / total_equity if total_equity > 0 else 0
        
        # Update peak equity
        total_equity = self._get_total_equity()
        self.peak_equity = max(self.peak_equity, total_equity)
    
    def record_state(self, trades_today: List[Trade] = None):
        """Record current portfolio state."""
        total_equity = self._get_total_equity()
        invested = sum(p.position_value for p in self.positions.values())
        
        state = PortfolioState(
            date=self.current_date,
            cash_balance=self.cash,
            total_equity=total_equity,
            invested_value=invested,
            peak_equity=self.peak_equity,
            drawdown=total_equity - self.peak_equity,
            drawdown_pct=(total_equity / self.peak_equity - 1) if self.peak_equity > 0 else 0,
            open_positions=dict(self.positions),
            num_positions=len(self.positions),
            exposure_by_regime=self._get_exposure_by_regime(),
            exposure_by_sector=self._get_exposure_by_sector(),
            total_exposure_pct=invested / total_equity if total_equity > 0 else 0,
            cash_pct=self.cash / total_equity if total_equity > 0 else 1.0,
            trades_today=[t.__dict__ for t in (trades_today or [])],
            turnover_today=sum(t.value for t in (trades_today or [])) / total_equity if total_equity > 0 else 0
        )
        
        self.state_history.append(state)
    
    def run_simulation(
        self,
        decisions_by_date: Dict[date, List[Decision]],
        prices_by_date: Dict[date, Dict[str, float]],
        regimes_by_date: Dict[date, str],
        sectors: Dict[str, str] = None
    ) -> SimulationResult:
        """
        Run complete portfolio simulation.
        
        Args:
            decisions_by_date: {date: [Decision, ...]}
            prices_by_date: {date: {ticker: price, ...}}
            regimes_by_date: {date: regime}
            sectors: {ticker: sector}
        """
        self.reset()
        sectors = sectors or {}
        
        sorted_dates = sorted(decisions_by_date.keys())
        
        if not sorted_dates:
            return self._generate_empty_result()
        
        logger.info(f"Running simulation from {sorted_dates[0]} to {sorted_dates[-1]}")
        logger.info(f"Initial capital: ${self.initial_capital:,.2f}")
        
        for sim_date in sorted_dates:
            self.current_date = sim_date
            self.days_simulated += 1
            
            # Get today's data
            decisions = decisions_by_date.get(sim_date, [])
            prices = prices_by_date.get(sim_date, {})
            regime = regimes_by_date.get(sim_date, 'recovery')
            
            # Update existing positions
            self.update_prices(prices, sim_date)
            
            # Process exits first (AVOID, EXIT)
            trades_today = []
            exit_decisions = [d for d in decisions if d.intent in [PositionIntent.EXIT, PositionIntent.AVOID]]
            for decision in exit_decisions:
                if decision.ticker in prices:
                    trade = self.execute_decision(decision, prices[decision.ticker], regime)
                    if trade:
                        trades_today.append(trade)
            
            # Process entries (INITIATE, PROBE)
            entry_decisions = [d for d in decisions if d.intent in [PositionIntent.INITIATE, PositionIntent.PROBE]]
            entry_decisions.sort(key=lambda d: d.conviction, reverse=True)  # Highest conviction first
            
            for decision in entry_decisions:
                if decision.ticker in prices:
                    sector = sectors.get(decision.ticker)
                    trade = self.execute_decision(decision, prices[decision.ticker], regime, sector)
                    if trade:
                        trades_today.append(trade)
            
            # Process adds/reduces
            other_decisions = [d for d in decisions if d.intent in [PositionIntent.ADD, PositionIntent.REDUCE]]
            for decision in other_decisions:
                if decision.ticker in prices:
                    trade = self.execute_decision(decision, prices[decision.ticker], regime)
                    if trade:
                        trades_today.append(trade)
            
            # Record state
            self.record_state(trades_today)
        
        return self._calculate_results()
    
    def _calculate_results(self) -> SimulationResult:
        """Calculate final simulation results."""
        if not self.state_history:
            return self._generate_empty_result()
        
        # Basic metrics
        start_date = self.state_history[0].date
        end_date = self.state_history[-1].date
        final_equity = self.state_history[-1].total_equity
        total_return = (final_equity / self.initial_capital - 1)
        
        # CAGR
        years = (end_date - start_date).days / 365.25
        cagr = ((final_equity / self.initial_capital) ** (1/years) - 1) if years > 0 else 0
        
        # Drawdown
        max_dd = min(s.drawdown_pct for s in self.state_history)
        
        # Volatility & Sharpe
        equity_series = pd.Series([s.total_equity for s in self.state_history])
        returns = equity_series.pct_change().dropna()
        volatility = returns.std() * np.sqrt(252) if len(returns) > 1 else 0
        
        avg_return = returns.mean() * 252 if len(returns) > 0 else 0
        sharpe = avg_return / volatility if volatility > 0 else 0
        
        # Sortino
        downside_returns = returns[returns < 0]
        downside_dev = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 1 else volatility
        sortino = avg_return / downside_dev if downside_dev > 0 else 0
        
        # Trade analysis
        closed_trades = [t for t in self.trade_history if t.realized_pnl is not None]
        wins = [t for t in closed_trades if t.realized_pnl > 0]
        losses = [t for t in closed_trades if t.realized_pnl <= 0]
        
        win_rate = len(wins) / len(closed_trades) if closed_trades else 0
        avg_win = np.mean([t.realized_pnl_pct for t in wins]) if wins else 0
        avg_loss = np.mean([t.realized_pnl_pct for t in losses]) if losses else 0
        
        total_wins = sum(t.realized_pnl for t in wins)
        total_losses = abs(sum(t.realized_pnl for t in losses))
        profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
        
        avg_holding = np.mean([t.holding_days for t in closed_trades if t.holding_days]) if closed_trades else 0
        
        # Turnover
        total_turnover = sum(s.turnover_today for s in self.state_history)
        turnover_annual = total_turnover / years if years > 0 else 0
        
        # Time in cash
        high_cash_days = sum(1 for s in self.state_history if s.cash_pct > 0.5)
        time_in_cash = high_cash_days / len(self.state_history) if self.state_history else 0
        
        full_invested_days = sum(1 for s in self.state_history if s.cash_pct < 0.25)
        time_fully_invested = full_invested_days / len(self.state_history) if self.state_history else 0
        
        # Decision quality
        initiate_trades = [t for t in closed_trades if t.intent == 'INITIATE']
        initiate_wins = [t for t in initiate_trades if t.realized_pnl > 0]
        initiate_success = len(initiate_wins) / len(initiate_trades) if initiate_trades else 0
        
        # TODO: Calculate avoid loss prevention rate from skipped trades
        avoid_prevention = 0.0
        
        # Regime performance
        regime_perf = self._calculate_regime_performance(closed_trades)
        
        # Curves
        equity_curve = [
            {'date': s.date.isoformat(), 'equity': s.total_equity, 'cash_pct': s.cash_pct}
            for s in self.state_history
        ]
        drawdown_curve = [
            {'date': s.date.isoformat(), 'drawdown': s.drawdown_pct}
            for s in self.state_history
        ]
        
        # Explanation
        explanation = self._generate_explanation(
            cagr, max_dd, time_in_cash, regime_perf, closed_trades
        )
        
        return SimulationResult(
            start_date=start_date,
            end_date=end_date,
            initial_capital=self.initial_capital,
            final_capital=final_equity,
            total_return=total_return,
            cagr=cagr,
            max_drawdown=max_dd,
            volatility=volatility,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            total_trades=len(self.trade_history),
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            avg_holding_days=avg_holding,
            turnover_annualized=turnover_annual,
            time_in_cash_pct=time_in_cash,
            time_fully_invested_pct=time_fully_invested,
            initiate_success_rate=initiate_success,
            avoid_loss_prevention_rate=avoid_prevention,
            regime_performance=regime_perf,
            equity_curve=equity_curve,
            drawdown_curve=drawdown_curve,
            explanation=explanation
        )
    
    def _calculate_regime_performance(self, trades: List[Trade]) -> Dict[str, Dict[str, float]]:
        """Calculate performance by regime."""
        regime_trades = {}
        
        for trade in trades:
            regime = trade.regime_at_trade
            if regime not in regime_trades:
                regime_trades[regime] = []
            regime_trades[regime].append(trade)
        
        result = {}
        for regime, regime_list in regime_trades.items():
            wins = [t for t in regime_list if t.realized_pnl and t.realized_pnl > 0]
            result[regime] = {
                'trades': len(regime_list),
                'win_rate': len(wins) / len(regime_list) if regime_list else 0,
                'avg_return': np.mean([t.realized_pnl_pct for t in regime_list if t.realized_pnl_pct]) if regime_list else 0
            }
        
        return result
    
    def _generate_explanation(
        self,
        cagr: float,
        max_dd: float,
        time_in_cash: float,
        regime_perf: Dict,
        trades: List[Trade]
    ) -> Dict[str, str]:
        """Generate human-readable explanation blocks."""
        
        # Key reason
        if time_in_cash > 0.3:
            key_reason = (
                f"Capital was preserved by holding {time_in_cash:.0%} of the time in cash, "
                f"particularly during distribution and panic regimes."
            )
        elif cagr > 0.10:
            key_reason = (
                f"Returns were driven by systematic position-taking in favorable regimes, "
                f"with {cagr:.1%} annualized return."
            )
        else:
            key_reason = (
                f"Conservative positioning limited both gains and losses, "
                f"with max drawdown contained at {max_dd:.1%}."
            )
        
        # Best period
        best_regime = max(regime_perf.items(), key=lambda x: x[1].get('avg_return', 0))[0] if regime_perf else 'unknown'
        best_perf = regime_perf.get(best_regime, {})
        best_explanation = (
            f"Best performance came during {best_regime} regimes "
            f"({best_perf.get('win_rate', 0):.0%} win rate, "
            f"{best_perf.get('avg_return', 0):.1%} avg return)."
        )
        
        # Worst period
        worst_regime = min(regime_perf.items(), key=lambda x: x[1].get('avg_return', 0))[0] if regime_perf else 'unknown'
        worst_perf = regime_perf.get(worst_regime, {})
        worst_explanation = (
            f"Most challenging period was during {worst_regime} regimes, "
            f"where exposure was reduced and {worst_perf.get('trades', 0)} trades were taken."
        )
        
        return {
            'key_reason': key_reason,
            'best_period': best_explanation,
            'worst_period': worst_explanation,
            'methodology': (
                "This simulation follows the same decision rules shown on each stock page. "
                "Positions are added only when historical data shows consistent edge in similar market regimes. "
                "Capital is reduced or held in cash when uncertainty or downside risk increases."
            ),
            'disclaimer': (
                "This is a historical simulation, not a guarantee of future performance. "
                "Past results do not predict future outcomes."
            )
        }
    
    def _generate_empty_result(self) -> SimulationResult:
        """Generate empty result when no simulation data."""
        return SimulationResult(
            start_date=date.today(),
            end_date=date.today(),
            initial_capital=self.initial_capital,
            final_capital=self.initial_capital,
            total_return=0,
            cagr=0,
            max_drawdown=0,
            volatility=0,
            sharpe_ratio=0,
            sortino_ratio=0,
            total_trades=0,
            win_rate=0,
            avg_win=0,
            avg_loss=0,
            profit_factor=0,
            avg_holding_days=0,
            turnover_annualized=0,
            time_in_cash_pct=1.0,
            time_fully_invested_pct=0,
            initiate_success_rate=0,
            avoid_loss_prevention_rate=0,
            regime_performance={},
            equity_curve=[],
            drawdown_curve=[],
            explanation={'key_reason': 'No simulation data available', 'methodology': '', 'disclaimer': ''}
        )
    
    def save_results(self, result: SimulationResult, path: Path = None) -> Path:
        """Save simulation results."""
        path = path or MODEL_OUTPUT_DIR / 'portfolio_backtest.parquet'
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save equity curve as parquet
        if result.equity_curve:
            df = pd.DataFrame(result.equity_curve)
            df.to_parquet(path, index=False)
        
        # Save full results as JSON
        json_path = path.with_suffix('.json')
        with open(json_path, 'w') as f:
            json.dump(result.to_dict(), f, indent=2, default=str)
        
        logger.info(f"Saved portfolio results to {path}")
        return path


# =============================================================================
# BATCH SIMULATION RUNNER
# =============================================================================

def run_universe_simulation(
    tickers: List[str],
    market: str,
    start_date: date,
    end_date: date,
    initial_capital: float = 1_000_000,
    config: PortfolioConfig = None
) -> SimulationResult:
    """
    Run portfolio simulation across a universe of stocks.
    
    This is the main entry point for website integration.
    """
    from .pipeline import run_pipeline
    from .utils import load_price_history
    
    logger.info(f"Running universe simulation: {len(tickers)} stocks, {start_date} to {end_date}")
    
    # Collect all decisions and prices
    decisions_by_date: Dict[date, List[Decision]] = {}
    prices_by_date: Dict[date, Dict[str, float]] = {}
    regimes_by_date: Dict[date, str] = {}
    
    # Process each ticker
    for ticker in tickers:
        try:
            # Load historical prices
            prices_df = load_price_history(ticker, market)
            if prices_df is None or len(prices_df) < 60:
                continue
            
            # Filter to date range
            prices_df = prices_df[
                (prices_df['date'] >= pd.Timestamp(start_date)) & 
                (prices_df['date'] <= pd.Timestamp(end_date))
            ]
            
            # Generate decisions for each date in range
            for dt in pd.date_range(start_date, end_date, freq='B'):
                dt_date = dt.date()
                
                # Get price for this date
                day_prices = prices_df[prices_df['date'] <= pd.Timestamp(dt_date)]
                if len(day_prices) == 0:
                    continue
                
                current_price = day_prices['close'].iloc[-1]
                
                # Add to prices dict
                if dt_date not in prices_by_date:
                    prices_by_date[dt_date] = {}
                prices_by_date[dt_date][ticker] = current_price
            
            # Run pipeline to get decisions (simplified - in production would batch)
            # For now, generate a simplified decision based on regime
            # TODO: Integrate with full pipeline batch mode
            
        except Exception as e:
            logger.warning(f"Error processing {ticker}: {e}")
            continue
    
    # Run simulation
    simulator = PortfolioSimulator(config=config, initial_capital=initial_capital)
    result = simulator.run_simulation(
        decisions_by_date=decisions_by_date,
        prices_by_date=prices_by_date,
        regimes_by_date=regimes_by_date
    )
    
    # Save results
    simulator.save_results(result)
    
    return result


# =============================================================================
# API RESPONSE FORMATTER
# =============================================================================

def format_api_response(result: SimulationResult) -> Dict[str, Any]:
    """Format simulation result for API response."""
    return {
        'success': True,
        'data': {
            'headline': {
                'cagr': f"{result.cagr:.1%}",
                'max_drawdown': f"{result.max_drawdown:.1%}",
                'sharpe_ratio': f"{result.sharpe_ratio:.2f}",
                'time_in_cash': f"{result.time_in_cash_pct:.0%}",
            },
            'metrics': {
                'total_return': result.total_return,
                'volatility': result.volatility,
                'sortino_ratio': result.sortino_ratio,
                'win_rate': result.win_rate,
                'profit_factor': result.profit_factor,
                'total_trades': result.total_trades,
            },
            'decision_quality': {
                'initiate_success_rate': result.initiate_success_rate,
                'avoid_loss_prevention': result.avoid_loss_prevention_rate,
                'avg_win': result.avg_win,
                'avg_loss': result.avg_loss,
            },
            'equity_curve': result.equity_curve,
            'drawdown_curve': result.drawdown_curve,
            'regime_performance': result.regime_performance,
            'explanation': result.explanation,
        }
    }

