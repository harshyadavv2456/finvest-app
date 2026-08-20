"""
FinSight Quant System Pipeline
==============================

End-to-end pipeline demonstrating the institutional-grade system.

UPGRADES IMPLEMENTED:
1. Market + Asset regime separation with relative strength
2. Signal correlation penalty (no double-counting)
3. Conditional volatility (vol_normal/vol_stress/vol_tail)
4. Failure attribution memory ("why it failed")
5. Position intent (INITIATE/ADD/HOLD/REDUCE/EXIT/HEDGE)
6. LLM language constraints + comparable setups

Run with: python -m quant_system.pipeline
"""

import pandas as pd
import numpy as np
from datetime import date, datetime, timedelta
from pathlib import Path
import logging
import sys

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Imports from our layers
from .config import (
    DATA_DIR, MODEL_OUTPUT_DIR, SIGNAL_OUTPUT_DIR, BACKTEST_OUTPUT_DIR,
    DEFAULT_REGIME_CONFIG, DEFAULT_EFFICACY_CONFIG, DEFAULT_PROBABILITY_CONFIG,
    DEFAULT_BACKTEST_CONFIG, DEFAULT_DECISION_CONFIG, DEFAULT_LLM_CONFIG
)
from .utils import (
    load_price_history, load_financials, load_screener_data,
    compute_returns, compute_realized_volatility, compute_rsi,
    compute_macd, compute_bollinger_bands
)


def run_pipeline(
    ticker: str,
    market: str = 'US',
    as_of_date: date = None,
    verbose: bool = True
):
    """
    Run the complete FinSight Quant pipeline for a single ticker.
    
    This demonstrates the institutional-grade flow:
    1. Load data & generate signals
    2. Classify regime (asset + market)
    3. Evaluate signal efficacy with correlation penalty
    4. Generate probabilistic outcomes with conditional volatility
    5. Run backtest with failure attribution
    6. Generate decision with position intent
    7. Create LLM interpretation with language constraints
    """
    as_of_date = as_of_date or date.today()
    
    logger.info(f"=" * 70)
    logger.info(f"FinSight Quant Pipeline - {ticker} ({market})")
    logger.info(f"As of: {as_of_date}")
    logger.info(f"=" * 70)
    
    # =========================================================================
    # LAYER 1: SIGNAL FACTORY
    # =========================================================================
    logger.info("\n[LAYER 1] Generating Signals...")
    
    prices = load_price_history(ticker, market)
    if prices is None:
        logger.error(f"No price data for {ticker}")
        return None
    
    # Filter to as_of_date
    prices = prices[prices['date'] <= pd.Timestamp(as_of_date)]
    
    if len(prices) < 60:
        logger.error(f"Insufficient price history for {ticker}")
        return None
    
    # Generate signals
    close = prices.set_index('date')['close']
    
    signals_df = pd.DataFrame(index=prices['date'])
    signals_df['ticker'] = ticker
    signals_df['close'] = close.values
    
    # Returns
    for period in [1, 5, 20, 60]:
        signals_df[f'ret_{period}d'] = close.pct_change(period).values
    
    # Volatility
    daily_ret = close.pct_change(1)
    signals_df['vol_20d'] = (daily_ret.rolling(20).std() * np.sqrt(252)).values
    signals_df['vol_60d'] = (daily_ret.rolling(60).std() * np.sqrt(252)).values
    
    # Technical indicators
    signals_df['rsi_14'] = compute_rsi(close).values
    
    macd = compute_macd(close)
    signals_df['macd_signal'] = macd['histogram'].values
    
    bb = compute_bollinger_bands(close)
    signals_df['bb_position'] = bb['bb_position'].values
    
    # Moving average distances
    signals_df['sma_20_distance'] = (close / close.rolling(20).mean() - 1).values
    signals_df['sma_50_distance'] = (close / close.rolling(50).mean() - 1).values
    signals_df['sma_200_distance'] = (close / close.rolling(200).mean() - 1).values
    
    # Store dates before dropna
    signals_df['date'] = signals_df.index
    signals_df = signals_df.dropna()
    # Don't reset index - keep date-based index for alignment
    
    logger.info(f"  Generated {len(signals_df)} signal observations")
    
    # =========================================================================
    # LAYER 2: REGIME ENGINE
    # =========================================================================
    logger.info("\n[LAYER 2] Classifying Regimes...")
    
    from .layer2_regime_engine import RegimeEngine, get_current_regime_context
    
    regime_engine = RegimeEngine(DEFAULT_REGIME_CONFIG)
    
    # Fit on historical data
    regime_engine.fit(prices)
    
    # Fit market regime
    regime_engine.fit_market_regime(market)
    
    # Predict current regime
    regime_output = regime_engine.predict_regime(prices, market, as_of_date)
    
    if regime_output is None:
        logger.error("Could not determine regime")
        return None
    
    logger.info(f"  Asset Regime: {regime_output.regime} (conf: {regime_output.confidence:.0%})")
    logger.info(f"  Market Regime: {regime_output.market_regime} (conf: {regime_output.market_regime_confidence:.0%})")
    logger.info(f"  Relative Strength: {regime_output.relative_regime_strength:.2f} ({regime_output.regime_divergence})")
    logger.info(f"  Composite Score: {regime_output.composite_regime_score:.2f}")
    
    # Get regime history
    regime_history = regime_engine.get_regime_history(prices, market, as_of_date)
    
    # =========================================================================
    # LAYER 3: SIGNAL EFFICACY
    # =========================================================================
    logger.info("\n[LAYER 3] Evaluating Signal Efficacy...")
    
    from .layer3_signal_efficacy import SignalEfficacyModel, summarize_signal_independence
    from .signal_efficacy_trainer import SignalEfficacyTrainer, load_efficacy_stats
    
    efficacy_model = SignalEfficacyModel(DEFAULT_EFFICACY_CONFIG)
    
    # Prepare regimes series
    if 'date' in regime_history.columns:
        regimes_series = regime_history.set_index('date')['regime']
    else:
        regimes_series = pd.Series(index=signals_df['date'], data=regime_output.regime)
    
    # HISTORICAL EFFICACY TRAINING
    # Train efficacy from full historical data (this is what gives us learned edge)
    signals_df_indexed = signals_df.set_index('date')
    
    efficacy_trainer = SignalEfficacyTrainer(horizons=[5, 20, 60])
    learned_efficacy = efficacy_trainer.train_all(
        signals_df=signals_df_indexed,
        prices=close,
        regimes=regimes_series
    )
    
    if learned_efficacy:
        efficacy_trainer.save(MODEL_OUTPUT_DIR / f'signal_efficacy_{ticker}.parquet')
        
        # Get best signals for current regime
        best_signals = efficacy_trainer.get_best_signals_for_regime(
            regime=regime_output.regime,
            horizon=20,
            min_confidence=0.2,
            top_n=5
        )
        
        if best_signals:
            logger.info(f"  Learned efficacy for {len(learned_efficacy)} signal-regime-horizons")
            logger.info(f"  Best signals for '{regime_output.regime}' regime:")
            for sig in best_signals[:3]:
                logger.info(f"    - {sig.signal_name}: IC={sig.information_coefficient:.3f}, "
                          f"Hit={sig.hit_rate:.0%}, Conf={sig.confidence_score:.2f}")
    
    # Run walk-forward evaluation with DYNAMIC signal discovery
    efficacy_report = efficacy_model.walk_forward_evaluate(
        signals_df_indexed,
        close,
        regimes_series,
        signal_columns=None  # Let registry discover signals dynamically
    )
    efficacy_report.ticker = ticker
    efficacy_report.market = market
    
    # Inject learned efficacy into report for downstream layers
    efficacy_report.learned_efficacy = learned_efficacy
    efficacy_report.efficacy_trainer = efficacy_trainer
    
    # Log correlation analysis
    independence_summary = summarize_signal_independence(efficacy_report)
    logger.info(f"  Total signals analyzed: {independence_summary['total_signals']}")
    logger.info(f"  Redundant signal groups: {independence_summary['redundant_groups']}")
    logger.info(f"  Highly correlated pairs: {independence_summary['highly_correlated_pairs']}")
    logger.info(f"  Average correlation penalty: {independence_summary['average_correlation_penalty']:.1%}")
    
    if independence_summary['top_independent_signals']:
        logger.info(f"  Top independent signals: {', '.join(independence_summary['top_independent_signals'][:3])}")
    
    # =========================================================================
    # LAYER 4: PROBABILITY ENGINE
    # =========================================================================
    logger.info("\n[LAYER 4] Generating Probabilistic Outcomes...")
    
    from .layer4_probability_engine import ProbabilityEngine, format_outcome_for_llm, summarize_risk_for_pm
    
    prob_engine = ProbabilityEngine(DEFAULT_PROBABILITY_CONFIG)
    
    # Fit on historical data
    regimes_aligned = regimes_series.reindex(close.index).ffill()
    prob_engine.fit(close, regimes_aligned)
    
    # Generate outcomes for multiple horizons
    outcomes = prob_engine.generate_multi_horizon_outcomes(
        ticker=ticker,
        current_date=as_of_date,
        regime_output=regime_output,
        efficacy_report=efficacy_report,
        prices=close,
        regime_history=regime_history,
        horizons=[5, 20, 60]
    )
    
    # Primary horizon (20d)
    primary_outcome = outcomes.get(20)
    
    if primary_outcome:
        rd = primary_outcome.return_distribution
        vol = primary_outcome.volatility
        rm = primary_outcome.risk_metrics
        
        logger.info(f"  Horizon: 20 days")
        logger.info(f"  Expected Return: {rd.p10:.1%} / {rd.p50:.1%} / {rd.p90:.1%} (p10/p50/p90)")
        logger.info(f"  Volatility: {vol.vol_current:.1%} current, {vol.vol_forecast:.1%} forecast ({vol.vol_regime})")
        logger.info(f"  CVaR (5%): {rm.cvar_95:.1%} (normal: {rm.cvar_95_normal:.1%}, stress: {rm.cvar_95_stress:.1%}, panic: {rm.cvar_95_panic:.1%})")
        logger.info(f"  Comparable setups: {primary_outcome.n_comparable_setups}")
    
    # =========================================================================
    # LAYER 5: BACKTESTING (Simplified for demo)
    # =========================================================================
    logger.info("\n[LAYER 5] Historical Backtest Context...")
    
    from .layer5_backtesting_engine import BacktestSummary, get_comparable_setup_summary
    
    # Create a simplified backtest summary for demo
    # In production, this would run full backtest
    backtest_summary = BacktestSummary(
        strategy_name="FinSight Quant Strategy",
        start_date=(as_of_date - timedelta(days=365)),
        end_date=as_of_date,
        total_return=0.12,  # Placeholder
        annualized_return=0.12,
        sharpe_ratio=1.2,
        sortino_ratio=1.5,
        max_drawdown=-0.08,
        calmar_ratio=1.5,
        total_trades=50,
        winning_trades=32,
        losing_trades=18,
        win_rate=0.64,
        avg_win=0.025,
        avg_loss=-0.015,
        profit_factor=1.9,
        performance_by_regime={
            'accumulation': {'win_rate': 0.70, 'avg_return': 0.03},
            'markup': {'win_rate': 0.75, 'avg_return': 0.04},
            'distribution': {'win_rate': 0.50, 'avg_return': -0.01},
            'markdown': {'win_rate': 0.40, 'avg_return': -0.02},
        },
        performance_by_market_regime={},
        failure_reason_distribution={
            'regime_misclassification': 0.35,
            'volatility_spike': 0.25,
            'market_regime_shift': 0.20,
            'signal_disagreement': 0.15,
            'unknown': 0.05
        },
        failure_contexts=[],
        comparable_setup_stats={
            'n_comparable': primary_outcome.n_comparable_setups if primary_outcome else 15,
            'median_return': 0.021,
            'worst_return': -0.063,
            'best_return': 0.085,
            'avg_holding_days': 18
        }
    )
    
    comparable_summary = get_comparable_setup_summary(backtest_summary)
    logger.info(f"  {comparable_summary.replace(chr(10), chr(10) + '  ')}")
    
    # =========================================================================
    # LAYER 6: DECISION ENGINE
    # =========================================================================
    logger.info("\n[LAYER 6] Generating Decision...")
    
    from .layer6_decision_engine import DecisionEngine, decision_to_pm_summary
    
    decision_engine = DecisionEngine(
        max_portfolio_risk_pct=DEFAULT_DECISION_CONFIG.max_portfolio_risk_pct,
        max_single_position_pct=DEFAULT_DECISION_CONFIG.max_single_position_pct,
        min_conviction_for_action=DEFAULT_DECISION_CONFIG.min_conviction_for_action
    )
    
    decision = decision_engine.generate_decision(
        ticker=ticker,
        current_date=as_of_date,
        outcome=primary_outcome,
        efficacy_report=efficacy_report,
        current_price=float(close.iloc[-1])
    )
    
    logger.info(f"  Intent: {decision.intent.value}")
    logger.info(f"  Direction: {decision.direction}")
    logger.info(f"  Conviction: {decision.conviction:.0%}")
    logger.info(f"  Position: {decision.position_sizing.recommended_position_pct:.1%} (max {decision.position_sizing.max_position_pct:.1%})")
    logger.info(f"  Risk Budget Used: {decision.position_sizing.risk_budget_used_pct:.1%}")
    logger.info(f"  Risk/Reward: {decision.risk_reward_ratio:.2f}x")
    logger.info(f"  Time Horizon: {decision.time_horizon.value} (~{decision.expected_holding_days} days)")
    
    # =========================================================================
    # LAYER 7: LLM INTERPRETATION
    # =========================================================================
    logger.info("\n[LAYER 7] Generating LLM Interpretation...")
    
    from .layer7_llm_interpreter import LLMInterpreter
    
    llm_interpreter = LLMInterpreter(strict_mode=DEFAULT_LLM_CONFIG.strict_mode)
    
    interpretation = llm_interpreter.generate_interpretation(
        ticker=ticker,
        current_date=as_of_date,
        decision=decision,
        outcome=primary_outcome,
        backtest_summary=backtest_summary,
        regime_output=regime_output
    )
    
    logger.info(f"  Validation: {'PASSED' if interpretation.is_valid else 'FAILED'}")
    if not interpretation.is_valid:
        logger.warning(f"  Violations: {interpretation.language_violations}")
        logger.warning(f"  Missing: {[k for k, v in interpretation.completeness_checks.items() if not v]}")
    
    # =========================================================================
    # OUTPUT: IC MEMO
    # =========================================================================
    if verbose:
        ic_memo = llm_interpreter.generate_ic_memo(interpretation, decision)
        print("\n" + ic_memo)
    
    # =========================================================================
    # RETURN RESULTS
    # =========================================================================
    return {
        'ticker': ticker,
        'market': market,
        'as_of_date': as_of_date,
        'signals': signals_df,
        'regime_output': regime_output,
        'regime_history': regime_history,
        'efficacy_report': efficacy_report,
        'outcome': primary_outcome,
        'outcomes_multi_horizon': outcomes,
        'backtest_summary': backtest_summary,
        'decision': decision,
        'interpretation': interpretation
    }


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='FinSight Quant System Pipeline')
    parser.add_argument('--ticker', type=str, default='AAPL', help='Ticker symbol')
    parser.add_argument('--market', type=str, default='US', help='Market (US, IN)')
    parser.add_argument('--date', type=str, help='As-of date (YYYY-MM-DD)')
    parser.add_argument('--quiet', action='store_true', help='Suppress verbose output')
    
    args = parser.parse_args()
    
    as_of_date = None
    if args.date:
        as_of_date = datetime.strptime(args.date, '%Y-%m-%d').date()
    
    results = run_pipeline(
        ticker=args.ticker,
        market=args.market,
        as_of_date=as_of_date,
        verbose=not args.quiet
    )
    
    if results:
        logger.info("\n" + "=" * 70)
        logger.info("Pipeline completed successfully!")
        logger.info("=" * 70)
    else:
        logger.error("Pipeline failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
