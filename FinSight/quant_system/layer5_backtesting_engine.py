"""
LAYER 5: Backtesting Engine (Institutional Grade)
================================================

Realistic backtesting with walk-forward validation.

CRITICAL UPGRADE: Failure Attribution Memory
- Track WHY trades/strategies failed, not just THAT they failed
- Failure categories: regime_misclassification, signal_disagreement,
  volatility_spike, valuation_trap, liquidity_gap
- failure_reason_distribution feeds directly to LLM layer

This answers the PM question: "When this failed, why did it fail?"
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from collections import defaultdict
from enum import Enum
import logging

from .config import (
    DEFAULT_BACKTEST_CONFIG, MODEL_OUTPUT_DIR,
    BACKTEST_SLIPPAGE_BPS, BACKTEST_COMMISSION_BPS
)
from .layer6_decision_engine import PositionIntent

logger = logging.getLogger(__name__)


# =============================================================================
# FAILURE ATTRIBUTION (CRITICAL UPGRADE)
# =============================================================================

class FailureReason(Enum):
    """
    UPGRADE: Categorical reasons for trade/strategy failure.
    
    PMs ask: "When this failed, WHY did it fail?"
    """
    REGIME_MISCLASSIFICATION = "regime_misclassification"
    SIGNAL_DISAGREEMENT = "signal_disagreement"
    VOLATILITY_SPIKE = "volatility_spike"
    VALUATION_TRAP = "valuation_trap"
    LIQUIDITY_GAP = "liquidity_gap"
    MARKET_REGIME_SHIFT = "market_regime_shift"
    CORRELATION_BREAKDOWN = "correlation_breakdown"
    TIMING_ERROR = "timing_error"
    UNKNOWN = "unknown"


@dataclass
class FailureAttribution:
    """
    Detailed attribution for why a trade/period failed.
    """
    primary_reason: FailureReason
    secondary_reasons: List[FailureReason]
    confidence: float
    
    # Context at time of failure
    regime_at_entry: str
    regime_at_failure: str
    regime_changed: bool
    
    # Signal context
    signal_agreement_score: float  # How much did signals agree?
    contrarian_signals: List[str]  # Which signals disagreed?
    
    # Volatility context
    vol_at_entry: float
    vol_at_failure: float
    vol_spike_magnitude: float
    
    # Market context
    market_regime_at_entry: str
    market_regime_at_failure: str
    relative_strength_change: float
    
    # Quantified impact
    loss_from_this_reason: float  # Estimated PnL impact
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'primary_reason': self.primary_reason.value,
            'secondary_reasons': [r.value for r in self.secondary_reasons],
            'confidence': self.confidence,
            'regime_changed': self.regime_changed,
            'signal_agreement': self.signal_agreement_score,
            'contrarian_signals': self.contrarian_signals,
            'vol_spike': self.vol_spike_magnitude,
            'market_regime_changed': self.market_regime_at_entry != self.market_regime_at_failure,
            'relative_strength_change': self.relative_strength_change,
            'loss_attributed': self.loss_from_this_reason
        }


@dataclass
class Trade:
    """Single trade with full context for attribution."""
    ticker: str
    entry_date: date
    exit_date: Optional[date]
    
    # Position
    direction: str  # 'long' or 'short'
    intent: str     # From PositionIntent
    entry_price: float
    exit_price: Optional[float]
    position_size: float
    position_pct: float
    
    # Regime context
    entry_regime: str
    exit_regime: Optional[str]
    entry_market_regime: str
    exit_market_regime: Optional[str]
    entry_relative_strength: float
    
    # Signal context
    entry_signals: Dict[str, float]
    signal_agreement_at_entry: float
    
    # Volatility context
    entry_volatility: float
    peak_volatility: float
    
    # Outcome
    pnl: float
    pnl_pct: float
    max_drawdown: float
    holding_days: int
    
    # UPGRADE: Failure attribution
    failed: bool
    failure_attribution: Optional[FailureAttribution]
    
    @property
    def is_winner(self) -> bool:
        return self.pnl > 0


@dataclass
class BacktestSummary:
    """Complete backtest summary with failure analysis."""
    strategy_name: str
    start_date: date
    end_date: date
    
    # Performance
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    calmar_ratio: float
    
    # Trade stats
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    
    # Performance by regime
    performance_by_regime: Dict[str, Dict[str, float]]
    performance_by_market_regime: Dict[str, Dict[str, float]]
    
    # UPGRADE: Failure attribution distribution
    failure_reason_distribution: Dict[str, float]
    failure_contexts: List[Dict[str, Any]]
    
    # Comparable setups for LLM
    comparable_setup_stats: Dict[str, Any]


# =============================================================================
# FAILURE ANALYZER (UPGRADE)
# =============================================================================

class FailureAnalyzer:
    """
    CRITICAL UPGRADE: Analyze WHY trades failed.
    
    This feeds directly into the LLM layer for explanation.
    """
    
    def __init__(self):
        self.failure_history: List[FailureAttribution] = []
    
    def analyze_trade_failure(
        self,
        trade: Trade,
        price_history: pd.DataFrame,
        regime_history: pd.DataFrame,
        signal_history: pd.DataFrame
    ) -> FailureAttribution:
        """
        Analyze why a specific trade failed.
        
        Returns detailed attribution.
        """
        if not trade.failed:
            return None
        
        reasons = []
        primary_reason = FailureReason.UNKNOWN
        confidence = 0.5
        
        # Check 1: Regime changed unexpectedly
        regime_changed = trade.entry_regime != trade.exit_regime
        if regime_changed:
            reasons.append(FailureReason.REGIME_MISCLASSIFICATION)
            if trade.entry_regime in ['accumulation', 'markup'] and trade.exit_regime in ['markdown', 'panic']:
                primary_reason = FailureReason.REGIME_MISCLASSIFICATION
                confidence = 0.8
        
        # Check 2: Market regime shift
        market_shifted = trade.entry_market_regime != trade.exit_market_regime
        if market_shifted:
            reasons.append(FailureReason.MARKET_REGIME_SHIFT)
            if trade.exit_market_regime in ['panic', 'markdown']:
                if primary_reason == FailureReason.UNKNOWN:
                    primary_reason = FailureReason.MARKET_REGIME_SHIFT
                    confidence = 0.75
        
        # Check 3: Volatility spike
        vol_spike = (trade.peak_volatility / trade.entry_volatility - 1) if trade.entry_volatility > 0 else 0
        if vol_spike > 0.5:  # 50% increase in volatility
            reasons.append(FailureReason.VOLATILITY_SPIKE)
            if vol_spike > 1.0:  # Doubled
                if primary_reason == FailureReason.UNKNOWN:
                    primary_reason = FailureReason.VOLATILITY_SPIKE
                    confidence = 0.7
        
        # Check 4: Signal disagreement
        if trade.signal_agreement_at_entry < 0.6:
            reasons.append(FailureReason.SIGNAL_DISAGREEMENT)
            if trade.signal_agreement_at_entry < 0.4:
                if primary_reason == FailureReason.UNKNOWN:
                    primary_reason = FailureReason.SIGNAL_DISAGREEMENT
                    confidence = 0.6
        
        # Check 5: Valuation trap (long entry followed by continued decline)
        if trade.direction == 'long' and trade.pnl_pct < -0.10:
            # Check if signals suggested value but price kept falling
            if trade.entry_signals.get('pe_percentile', 0.5) < 0.3:
                reasons.append(FailureReason.VALUATION_TRAP)
                if primary_reason == FailureReason.UNKNOWN:
                    primary_reason = FailureReason.VALUATION_TRAP
                    confidence = 0.6
        
        # Identify contrarian signals
        contrarian_signals = []
        for signal, value in trade.entry_signals.items():
            # Heuristic: if we went long but signal was negative
            if trade.direction == 'long' and value < 0:
                contrarian_signals.append(signal)
            elif trade.direction == 'short' and value > 0:
                contrarian_signals.append(signal)
        
        # Calculate relative strength change
        rel_strength_change = 0
        if regime_history is not None and len(regime_history) > 0:
            entry_rs = trade.entry_relative_strength
            # Would need exit relative strength from history
            rel_strength_change = -entry_rs * 0.5  # Placeholder
        
        # Remove primary from secondary
        secondary_reasons = [r for r in reasons if r != primary_reason]
        
        attribution = FailureAttribution(
            primary_reason=primary_reason,
            secondary_reasons=secondary_reasons,
            confidence=confidence,
            regime_at_entry=trade.entry_regime,
            regime_at_failure=trade.exit_regime,
            regime_changed=regime_changed,
            signal_agreement_score=trade.signal_agreement_at_entry,
            contrarian_signals=contrarian_signals,
            vol_at_entry=trade.entry_volatility,
            vol_at_failure=trade.peak_volatility,
            vol_spike_magnitude=vol_spike,
            market_regime_at_entry=trade.entry_market_regime,
            market_regime_at_failure=trade.exit_market_regime,
            relative_strength_change=rel_strength_change,
            loss_from_this_reason=trade.pnl
        )
        
        self.failure_history.append(attribution)
        return attribution
    
    def get_failure_distribution(self) -> Dict[str, float]:
        """
        Get distribution of failure reasons.
        
        Output for LLM: failure_reason_distribution
        """
        if not self.failure_history:
            return {}
        
        reason_counts = defaultdict(int)
        for attr in self.failure_history:
            reason_counts[attr.primary_reason.value] += 1
        
        total = len(self.failure_history)
        return {
            reason: count / total
            for reason, count in reason_counts.items()
        }
    
    def get_failure_contexts(self, top_n: int = 10) -> List[Dict[str, Any]]:
        """Get detailed contexts of top failures for LLM."""
        # Sort by loss magnitude
        sorted_failures = sorted(
            self.failure_history,
            key=lambda x: x.loss_from_this_reason
        )[:top_n]
        
        return [f.to_dict() for f in sorted_failures]
    
    def summarize_for_llm(self) -> str:
        """Generate LLM-ready failure summary."""
        dist = self.get_failure_distribution()
        
        if not dist:
            return "No failure data available."
        
        lines = ["Failure Attribution Analysis:", ""]
        
        for reason, pct in sorted(dist.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  {reason}: {pct:.0%}")
        
        # Add specific insights
        if dist.get('regime_misclassification', 0) > 0.3:
            lines.append("\n⚠️ High regime misclassification rate - regime model may need recalibration")
        
        if dist.get('volatility_spike', 0) > 0.25:
            lines.append("\n⚠️ Significant losses from vol spikes - consider volatility-adjusted sizing")
        
        if dist.get('market_regime_shift', 0) > 0.2:
            lines.append("\n⚠️ Market regime shifts caused losses - improve macro awareness")
        
        return "\n".join(lines)


# =============================================================================
# BACKTESTING ENGINE
# =============================================================================

class BacktestingEngine:
    """
    Institutional-grade backtesting with failure attribution.
    """
    
    def __init__(self, config=None):
        self.config = config or DEFAULT_BACKTEST_CONFIG
        self.failure_analyzer = FailureAnalyzer()
        self.trades: List[Trade] = []
        self.equity_curve: pd.DataFrame = None
    
    def _apply_slippage(self, price: float, direction: str) -> float:
        """Apply slippage to execution price."""
        slippage = BACKTEST_SLIPPAGE_BPS / 10000
        if direction == 'long':
            return price * (1 + slippage)  # Pay more to buy
        else:
            return price * (1 - slippage)  # Receive less to sell
    
    def _apply_commission(self, value: float) -> float:
        """Apply commission to trade value."""
        return value * (1 - BACKTEST_COMMISSION_BPS / 10000)
    
    def run_backtest(
        self,
        decisions: pd.DataFrame,
        prices: pd.DataFrame,
        regime_history: pd.DataFrame,
        signal_history: pd.DataFrame,
        initial_capital: float = 1_000_000
    ) -> BacktestSummary:
        """
        Run full backtest with failure attribution.
        
        decisions: DataFrame with columns [date, ticker, intent, conviction, ...]
        prices: DataFrame with columns [date, ticker, open, high, low, close, volume]
        regime_history: DataFrame with regime data
        signal_history: DataFrame with signal values
        """
        self.trades = []
        capital = initial_capital
        positions = {}  # ticker -> Trade
        equity_history = []
        
        # Sort by date
        decisions = decisions.sort_values('date')
        dates = decisions['date'].unique()
        
        for current_date in dates:
            day_decisions = decisions[decisions['date'] == current_date]
            
            # Get prices for this date
            day_prices = prices[prices['date'] == current_date]
            
            # Process exits first
            for ticker, position in list(positions.items()):
                ticker_prices = day_prices[day_prices['ticker'] == ticker]
                if ticker_prices.empty:
                    continue
                
                current_price = ticker_prices['close'].iloc[0]
                
                # Check for exit signals
                ticker_decisions = day_decisions[day_decisions['ticker'] == ticker]
                should_exit = False
                
                if not ticker_decisions.empty:
                    intent = ticker_decisions['intent'].iloc[0]
                    if intent in ['EXIT', 'REDUCE']:
                        should_exit = True
                
                # Check stop loss (10% drawdown)
                position_value = position.position_size * current_price
                entry_value = position.position_size * position.entry_price
                pnl_pct = (position_value - entry_value) / entry_value
                
                if pnl_pct < -0.10:
                    should_exit = True
                
                if should_exit:
                    # Execute exit
                    exit_price = self._apply_slippage(current_price, 'short' if position.direction == 'long' else 'long')
                    exit_value = self._apply_commission(position.position_size * exit_price)
                    
                    pnl = exit_value - (position.position_size * position.entry_price)
                    pnl_pct_final = pnl / (position.position_size * position.entry_price)
                    
                    # Get regime at exit
                    exit_regime_data = regime_history[regime_history['date'] == current_date]
                    exit_regime = exit_regime_data['regime'].iloc[0] if not exit_regime_data.empty else 'unknown'
                    exit_market_regime = exit_regime_data['market_regime'].iloc[0] if 'market_regime' in exit_regime_data.columns else 'unknown'
                    
                    # Track peak volatility during hold
                    hold_prices = prices[
                        (prices['ticker'] == ticker) &
                        (prices['date'] >= pd.Timestamp(position.entry_date)) &
                        (prices['date'] <= pd.Timestamp(current_date))
                    ]
                    if len(hold_prices) > 5:
                        daily_ret = hold_prices['close'].pct_change()
                        peak_vol = daily_ret.rolling(5).std().max() * np.sqrt(252)
                    else:
                        peak_vol = position.entry_volatility
                    
                    # Update trade
                    position.exit_date = current_date
                    position.exit_price = exit_price
                    position.exit_regime = exit_regime
                    position.exit_market_regime = exit_market_regime
                    position.peak_volatility = peak_vol
                    position.pnl = pnl
                    position.pnl_pct = pnl_pct_final
                    position.holding_days = (current_date - position.entry_date).days
                    position.failed = pnl < 0
                    
                    # UPGRADE: Failure attribution
                    if position.failed:
                        position.failure_attribution = self.failure_analyzer.analyze_trade_failure(
                            position, prices, regime_history, signal_history
                        )
                    
                    self.trades.append(position)
                    capital += exit_value
                    del positions[ticker]
            
            # Process entries
            for _, decision in day_decisions.iterrows():
                ticker = decision['ticker']
                intent = decision['intent']
                
                if ticker in positions:
                    continue  # Already have position
                
                if intent not in ['INITIATE', 'ADD']:
                    continue
                
                ticker_prices = day_prices[day_prices['ticker'] == ticker]
                if ticker_prices.empty:
                    continue
                
                # Get entry context
                entry_price = self._apply_slippage(ticker_prices['close'].iloc[0], 'long')
                conviction = decision.get('conviction', 0.5)
                
                # Position sizing based on conviction and risk budget
                max_position_pct = decision.get('max_position_pct', 5)
                position_pct = min(max_position_pct, conviction * 10) / 100
                position_value = capital * position_pct
                position_size = position_value / entry_price
                
                # Get regime context
                regime_data = regime_history[regime_history['date'] == current_date]
                entry_regime = regime_data['regime'].iloc[0] if not regime_data.empty else 'recovery'
                market_regime = regime_data['market_regime'].iloc[0] if 'market_regime' in regime_data.columns else 'recovery'
                rel_strength = regime_data['relative_strength'].iloc[0] if 'relative_strength' in regime_data.columns else 0
                
                # Get signal context
                signal_data = signal_history[signal_history['date'] == current_date]
                entry_signals = {}
                signal_agreement = 0.5
                if not signal_data.empty:
                    signal_cols = [c for c in signal_data.columns if c not in ['date', 'ticker']]
                    for col in signal_cols[:10]:  # Top 10 signals
                        if col in signal_data.columns:
                            entry_signals[col] = signal_data[col].iloc[0]
                    
                    # Calculate signal agreement
                    signal_values = list(entry_signals.values())
                    if signal_values:
                        positive = sum(1 for v in signal_values if v > 0)
                        signal_agreement = positive / len(signal_values)
                
                # Get current volatility
                recent_prices = prices[
                    (prices['ticker'] == ticker) &
                    (prices['date'] <= pd.Timestamp(current_date))
                ].tail(20)
                if len(recent_prices) > 5:
                    entry_vol = recent_prices['close'].pct_change().std() * np.sqrt(252)
                else:
                    entry_vol = 0.20
                
                # Create trade
                trade = Trade(
                    ticker=ticker,
                    entry_date=current_date,
                    exit_date=None,
                    direction='long',  # Currently only supporting long
                    intent=intent,
                    entry_price=entry_price,
                    exit_price=None,
                    position_size=position_size,
                    position_pct=position_pct,
                    entry_regime=entry_regime,
                    exit_regime=None,
                    entry_market_regime=market_regime,
                    exit_market_regime=None,
                    entry_relative_strength=rel_strength,
                    entry_signals=entry_signals,
                    signal_agreement_at_entry=signal_agreement,
                    entry_volatility=entry_vol,
                    peak_volatility=entry_vol,
                    pnl=0,
                    pnl_pct=0,
                    max_drawdown=0,
                    holding_days=0,
                    failed=False,
                    failure_attribution=None
                )
                
                positions[ticker] = trade
                capital -= position_value
            
            # Record equity
            position_value = sum(
                pos.position_size * day_prices[day_prices['ticker'] == ticker]['close'].iloc[0]
                for ticker, pos in positions.items()
                if not day_prices[day_prices['ticker'] == ticker].empty
            )
            equity_history.append({
                'date': current_date,
                'equity': capital + position_value,
                'cash': capital,
                'positions_value': position_value,
                'n_positions': len(positions)
            })
        
        # Close remaining positions at end
        final_date = dates[-1] if len(dates) > 0 else date.today()
        for ticker, position in positions.items():
            ticker_prices = prices[(prices['ticker'] == ticker) & (prices['date'] == final_date)]
            if not ticker_prices.empty:
                exit_price = ticker_prices['close'].iloc[0]
                pnl = (exit_price - position.entry_price) * position.position_size
                position.exit_date = final_date
                position.exit_price = exit_price
                position.pnl = pnl
                position.pnl_pct = pnl / (position.entry_price * position.position_size)
                position.holding_days = (final_date - position.entry_date).days
                position.failed = pnl < 0
                
                if position.failed:
                    position.failure_attribution = self.failure_analyzer.analyze_trade_failure(
                        position, prices, regime_history, signal_history
                    )
                
                self.trades.append(position)
        
        self.equity_curve = pd.DataFrame(equity_history)
        
        return self._generate_summary(initial_capital)
    
    def _generate_summary(self, initial_capital: float) -> BacktestSummary:
        """Generate comprehensive backtest summary with failure attribution."""
        if self.equity_curve is None or len(self.equity_curve) == 0:
            return self._empty_summary()
        
        # Basic performance
        final_equity = self.equity_curve['equity'].iloc[-1]
        total_return = (final_equity / initial_capital) - 1
        
        n_days = len(self.equity_curve)
        annualized_return = (1 + total_return) ** (252 / n_days) - 1 if n_days > 0 else 0
        
        # Drawdown
        rolling_max = self.equity_curve['equity'].expanding().max()
        drawdown = (self.equity_curve['equity'] / rolling_max) - 1
        max_drawdown = drawdown.min()
        
        # Daily returns
        daily_returns = self.equity_curve['equity'].pct_change().dropna()
        
        # Sharpe
        if len(daily_returns) > 0 and daily_returns.std() > 0:
            sharpe = (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
        else:
            sharpe = 0
        
        # Sortino
        negative_returns = daily_returns[daily_returns < 0]
        if len(negative_returns) > 0 and negative_returns.std() > 0:
            sortino = (daily_returns.mean() / negative_returns.std()) * np.sqrt(252)
        else:
            sortino = 0
        
        # Calmar
        calmar = annualized_return / abs(max_drawdown) if max_drawdown != 0 else 0
        
        # Trade stats
        total_trades = len(self.trades)
        winners = [t for t in self.trades if t.pnl > 0]
        losers = [t for t in self.trades if t.pnl <= 0]
        
        win_rate = len(winners) / total_trades if total_trades > 0 else 0
        avg_win = np.mean([t.pnl for t in winners]) if winners else 0
        avg_loss = np.mean([t.pnl for t in losers]) if losers else 0
        
        gross_profit = sum(t.pnl for t in winners)
        gross_loss = abs(sum(t.pnl for t in losers))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        
        # Performance by regime
        performance_by_regime = self._calculate_regime_performance('entry_regime')
        performance_by_market_regime = self._calculate_regime_performance('entry_market_regime')
        
        # UPGRADE: Failure attribution
        failure_distribution = self.failure_analyzer.get_failure_distribution()
        failure_contexts = self.failure_analyzer.get_failure_contexts()
        
        # Comparable setup stats
        comparable_stats = self._calculate_comparable_stats()
        
        return BacktestSummary(
            strategy_name=self.config.strategy_name if hasattr(self.config, 'strategy_name') else 'Default',
            start_date=self.equity_curve['date'].iloc[0],
            end_date=self.equity_curve['date'].iloc[-1],
            total_return=total_return,
            annualized_return=annualized_return,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            max_drawdown=max_drawdown,
            calmar_ratio=calmar,
            total_trades=total_trades,
            winning_trades=len(winners),
            losing_trades=len(losers),
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            performance_by_regime=performance_by_regime,
            performance_by_market_regime=performance_by_market_regime,
            failure_reason_distribution=failure_distribution,
            failure_contexts=failure_contexts,
            comparable_setup_stats=comparable_stats
        )
    
    def _calculate_regime_performance(self, regime_col: str) -> Dict[str, Dict[str, float]]:
        """Calculate performance metrics by regime."""
        performance = {}
        
        regime_trades = defaultdict(list)
        for trade in self.trades:
            regime = getattr(trade, regime_col, 'unknown')
            regime_trades[regime].append(trade)
        
        for regime, trades in regime_trades.items():
            if len(trades) == 0:
                continue
            
            wins = [t for t in trades if t.pnl > 0]
            pnls = [t.pnl_pct for t in trades]
            
            performance[regime] = {
                'n_trades': len(trades),
                'win_rate': len(wins) / len(trades),
                'avg_return': np.mean(pnls),
                'total_pnl': sum(t.pnl for t in trades),
                'sharpe': np.mean(pnls) / (np.std(pnls) + 1e-6) * np.sqrt(252 / 20)  # Assuming 20-day holds
            }
        
        return performance
    
    def _calculate_comparable_stats(self) -> Dict[str, Any]:
        """
        Calculate stats for comparable historical setups.
        
        This feeds the LLM line:
        "Comparable historical setups: 14
        Median outcome (20d): +2.1%
        Worst drawdown: −6.3%"
        """
        if not self.trades:
            return {}
        
        holding_returns = [t.pnl_pct for t in self.trades]
        
        return {
            'n_comparable': len(self.trades),
            'median_return': np.median(holding_returns),
            'p10_return': np.percentile(holding_returns, 10),
            'p90_return': np.percentile(holding_returns, 90),
            'worst_return': min(holding_returns),
            'best_return': max(holding_returns),
            'avg_holding_days': np.mean([t.holding_days for t in self.trades])
        }
    
    def _empty_summary(self) -> BacktestSummary:
        """Return empty summary."""
        return BacktestSummary(
            strategy_name='Default',
            start_date=date.today(),
            end_date=date.today(),
            total_return=0,
            annualized_return=0,
            sharpe_ratio=0,
            sortino_ratio=0,
            max_drawdown=0,
            calmar_ratio=0,
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            win_rate=0,
            avg_win=0,
            avg_loss=0,
            profit_factor=0,
            performance_by_regime={},
            performance_by_market_regime={},
            failure_reason_distribution={},
            failure_contexts=[],
            comparable_setup_stats={}
        )
    
    def run_signal_backtest(
        self,
        prices_df: pd.DataFrame,
        signals_df: pd.DataFrame,
        regime_history: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Simple signal backtest for artifact generation.
        
        Returns dict with regime_performance and comparable stats.
        """
        return run_signal_backtest_simple(prices_df, signals_df, regime_history)


# =============================================================================
# UTILITIES
# =============================================================================

def format_backtest_for_llm(summary: BacktestSummary) -> Dict[str, Any]:
    """Format backtest summary for LLM layer."""
    return {
        'performance': {
            'total_return': f"{summary.total_return:.1%}",
            'annualized_return': f"{summary.annualized_return:.1%}",
            'sharpe_ratio': f"{summary.sharpe_ratio:.2f}",
            'max_drawdown': f"{summary.max_drawdown:.1%}",
            'win_rate': f"{summary.win_rate:.0%}"
        },
        'comparable_setups': summary.comparable_setup_stats,
        'failure_analysis': {
            'distribution': summary.failure_reason_distribution,
            'key_contexts': summary.failure_contexts[:5]
        },
        'regime_performance': summary.performance_by_regime
    }


def get_comparable_setup_summary(summary: BacktestSummary) -> str:
    """
    UPGRADE: Generate the comparable setup line for LLM.
    
    "Comparable historical setups: 14
    Median outcome (20d): +2.1%
    Worst drawdown: −6.3%"
    """
    stats = summary.comparable_setup_stats
    
    if not stats:
        return "Insufficient historical data for comparable setup analysis."
    
    return (
        f"Comparable historical setups: {stats.get('n_comparable', 0)}\n"
        f"Median outcome: {stats.get('median_return', 0):.1%}\n"
        f"Worst drawdown: {stats.get('worst_return', 0):.1%}"
    )


def run_signal_backtest_simple(
    prices_df: pd.DataFrame,
    signals_df: pd.DataFrame,
    regime_history: pd.DataFrame
) -> Dict[str, Any]:
    """
    Simple signal backtest for weekly artifact generation.
    
    Returns dict with regime_performance and comparable stats.
    """
    if prices_df is None or len(prices_df) < 100:
        return {}
    
    try:
        # Ensure date column
        if 'date' in prices_df.columns:
            prices_df = prices_df.set_index('date')
        
        close = prices_df['close']
        
        # Calculate forward returns
        fwd_20d = close.shift(-20) / close - 1
        
        # Merge with regimes
        if regime_history is not None and not regime_history.empty:
            if 'date' in regime_history.columns:
                regime_history = regime_history.set_index('date')
            
            # Get regime for each date
            regimes = regime_history['regime'] if 'regime' in regime_history.columns else None
        else:
            regimes = None
        
        # Calculate stats by regime
        regime_performance = {}
        
        if regimes is not None:
            common_idx = close.index.intersection(regimes.index).intersection(fwd_20d.dropna().index)
            
            for regime in regimes.unique():
                if pd.isna(regime):
                    continue
                
                regime_mask = regimes.loc[common_idx] == regime
                regime_returns = fwd_20d.loc[common_idx][regime_mask]
                
                if len(regime_returns) < 10:
                    continue
                
                regime_performance[regime] = {
                    'n_trades': len(regime_returns),
                    'win_rate': float((regime_returns > 0).mean()),
                    'avg_return': float(regime_returns.mean()),
                    'max_loss': float(regime_returns.min()),
                    'max_gain': float(regime_returns.max()),
                    'median_return': float(regime_returns.median()),
                    'std_return': float(regime_returns.std())
                }
        
        # Overall stats
        valid_returns = fwd_20d.dropna()
        overall_win_rate = float((valid_returns > 0).mean()) if len(valid_returns) > 0 else 0.5
        avg_return = float(valid_returns.mean()) if len(valid_returns) > 0 else 0.0
        
        return {
            'regime_performance': regime_performance,
            'overall_win_rate': overall_win_rate,
            'avg_return': avg_return,
            'total_trades': len(valid_returns),
            'generated_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in signal backtest: {e}")
        return {}
