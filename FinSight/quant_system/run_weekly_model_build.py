#!/usr/bin/env python3
"""
WEEKLY MODEL BUILD PIPELINE
===========================

This script runs HEAVY computations that should be cached weekly:
- Fit HMM regime models (market + per-asset)
- Train signal efficacy models (walk-forward)
- Run historical backtests
- Compute comparable setup statistics
- Run meta-backtesting for decision quality

Output: /artifacts/{models,efficacy,backtests}/

This is designed for GitHub Actions FREE tier - execution time doesn't matter.
"""

import json
import logging
import sys
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
import warnings
import traceback

warnings.filterwarnings('ignore')

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from quant_system.config import DATA_DIR, MODEL_OUTPUT_DIR
from quant_system.utils import load_price_history, load_market_benchmark

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('weekly_model_build')

# =============================================================================
# CONSTANTS
# =============================================================================

ARTIFACTS_DIR = PROJECT_ROOT / 'artifacts'
MODELS_DIR = ARTIFACTS_DIR / 'models'
EFFICACY_DIR = ARTIFACTS_DIR / 'efficacy'
BACKTESTS_DIR = ARTIFACTS_DIR / 'backtests'

# =============================================================================
# NO HARDCODED TICKER LISTS
# =============================================================================
# Universe is discovered from filesystem ONLY.
# NO TOP_50, NO TOP_100, NO fallback lists.
#

VERSION = 'v2.2-weekly-build'


def discover_universe_for_weekly(market: str) -> List[str]:
    """
    Discover ALL stocks from data directories for weekly model building.
    
    THIS IS THE ONLY UNIVERSE DISCOVERY METHOD.
    
    Rules:
    - Discovers from filesystem ONLY
    - NO hardcoded lists
    - FAILS if no stocks found
    """
    data_dir = PROJECT_ROOT / 'data' / market
    
    if not data_dir.exists():
        raise RuntimeError(f"Data directory does not exist: {data_dir}")
    
    tickers = []
    for d in data_dir.iterdir():
        if d.is_dir() and (d / 'history.parquet').exists():
            tickers.append(d.name)
    
    if len(tickers) == 0:
        raise RuntimeError(f"No valid stocks found for {market}")
    
    logger.info(f"[WEEKLY] Discovered {len(tickers)} stocks from filesystem for {market}")
    return sorted(tickers)


# =============================================================================
# WEEKLY MODEL BUILDER
# =============================================================================

class WeeklyModelBuilder:
    """
    Builds and caches heavy computation artifacts weekly.
    """
    
    def __init__(self):
        self.errors: Dict[str, str] = {}
        self.stats = {
            'models_built': 0,
            'efficacy_trained': 0,
            'backtests_run': 0,
            'errors': 0
        }
        
        # Ensure directories exist
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        EFFICACY_DIR.mkdir(parents=True, exist_ok=True)
        BACKTESTS_DIR.mkdir(parents=True, exist_ok=True)
    
    def build_market_regime_model(self, market: str) -> bool:
        """
        Build and cache market-level HMM regime model.
        """
        logger.info(f"Building market regime model for {market}...")
        
        try:
            from quant_system.layer2_regime_engine import RegimeEngine
            
            # Load market benchmark
            benchmark_prices = load_market_benchmark(market)
            if benchmark_prices is None or len(benchmark_prices) < 252:
                logger.warning(f"Insufficient benchmark data for {market}")
                return False
            
            # Fit HMM
            engine = RegimeEngine()
            engine.fit_market_regime(market)
            
            # Save model
            model_path = MODELS_DIR / f'{market}_market_regime.joblib'
            
            import joblib
            model_data = {
                'market_model': engine.market_model,
                'market_regime_mapping': engine.market_regime_mapping,
                'market_feature_means': engine.market_feature_means,
                'market_feature_stds': engine.market_feature_stds,
                'is_market_fitted': engine.is_market_fitted,
                'built_at': datetime.now().isoformat(),
                'version': VERSION
            }
            joblib.dump(model_data, model_path)
            
            logger.info(f"Saved market regime model to {model_path}")
            self.stats['models_built'] += 1
            return True
            
        except Exception as e:
            logger.error(f"Error building market regime for {market}: {e}")
            self.errors[f'market_{market}'] = str(e)
            self.stats['errors'] += 1
            return False
    
    def build_asset_regime_model(self, ticker: str, market: str) -> bool:
        """
        Build and cache asset-level HMM regime model.
        """
        try:
            from quant_system.layer2_regime_engine import RegimeEngine
            
            # Load price data
            prices = load_price_history(ticker, market)
            if prices is None or len(prices) < 252:
                logger.warning(f"Insufficient data for {ticker}")
                return False
            
            # Fit HMM
            engine = RegimeEngine()
            engine.fit(prices)
            
            # Save model
            model_dir = MODELS_DIR / market
            model_dir.mkdir(parents=True, exist_ok=True)
            model_path = model_dir / f'{ticker}_regime.joblib'
            
            import joblib
            model_data = {
                'model': engine.model,
                'regime_mapping': engine.regime_mapping,
                'feature_means': engine.feature_means,
                'feature_stds': engine.feature_stds,
                'is_fitted': engine.is_fitted,
                'built_at': datetime.now().isoformat(),
                'version': VERSION
            }
            joblib.dump(model_data, model_path)
            
            self.stats['models_built'] += 1
            return True
            
        except Exception as e:
            logger.error(f"Error building regime model for {ticker}: {e}")
            self.errors[f'regime_{ticker}'] = str(e)
            self.stats['errors'] += 1
            return False
    
    def train_signal_efficacy(self, ticker: str, market: str) -> bool:
        """
        Train signal efficacy model with walk-forward validation.
        """
        try:
            from quant_system.signal_efficacy_trainer import SignalEfficacyTrainer
            from quant_system.layer2_regime_engine import RegimeEngine
            from quant_system.signal_registry import get_signal_registry
            import pandas as pd
            import numpy as np
            
            # Load data
            prices_df = load_price_history(ticker, market)
            if prices_df is None or len(prices_df) < 504:  # 2 years minimum
                logger.warning(f"Insufficient data for efficacy training: {ticker}")
                return False
            
            prices = prices_df.set_index('date')['close']
            
            # Generate signals
            signals_df = self._generate_signals(prices_df)
            if signals_df.empty:
                return False
            
            # Get regimes
            engine = RegimeEngine()
            engine.fit(prices_df)
            regime_history = engine.get_regime_history(prices_df, market)
            
            if regime_history.empty:
                return False
            
            regimes = regime_history.set_index('date')['regime']
            
            # Train efficacy
            trainer = SignalEfficacyTrainer(horizons=[5, 10, 20, 60])
            trainer.train_all(signals_df, prices, regimes)
            
            # Save efficacy
            efficacy_dir = EFFICACY_DIR / market
            efficacy_dir.mkdir(parents=True, exist_ok=True)
            trainer.save(efficacy_dir / f'{ticker}_efficacy.parquet')
            
            self.stats['efficacy_trained'] += 1
            return True
            
        except Exception as e:
            logger.error(f"Error training efficacy for {ticker}: {e}")
            self.errors[f'efficacy_{ticker}'] = str(e)
            self.stats['errors'] += 1
            return False
    
    def run_historical_backtest(self, ticker: str, market: str) -> bool:
        """
        Run historical backtest for comparable setup analysis.
        """
        try:
            from quant_system.layer5_backtesting_engine import BacktestingEngine
            from quant_system.layer2_regime_engine import RegimeEngine
            import pandas as pd
            
            # Load data
            prices_df = load_price_history(ticker, market)
            if prices_df is None or len(prices_df) < 504:
                return False
            
            # Generate signals
            signals_df = self._generate_signals(prices_df)
            
            # Get regimes
            engine = RegimeEngine()
            regime_history = engine.get_regime_history(prices_df, market)
            
            if regime_history.empty:
                return False
            
            # Run backtest
            bt_engine = BacktestingEngine()
            results = bt_engine.run_signal_backtest(
                prices_df=prices_df,
                signals_df=signals_df,
                regime_history=regime_history
            )
            
            # Save results
            backtest_dir = BACKTESTS_DIR / market
            backtest_dir.mkdir(parents=True, exist_ok=True)
            
            if results:
                with open(backtest_dir / f'{ticker}_backtest.json', 'w') as f:
                    json.dump(results, f, indent=2, default=str)
                
                self.stats['backtests_run'] += 1
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error running backtest for {ticker}: {e}")
            self.errors[f'backtest_{ticker}'] = str(e)
            self.stats['errors'] += 1
            return False
    
    def _generate_signals(self, prices_df) -> 'pd.DataFrame':
        """Generate technical signals from price data."""
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
        signals['vol_ratio'] = signals['vol_20d'] / signals['vol_60d']
        signals['vol_contained'] = (signals['vol_20d'] < 0.25).astype(float)
        signals['vol_elevated'] = (signals['vol_20d'] > 0.35).astype(float)
        
        # Volume signals
        vol_sma = volume.rolling(20).mean()
        signals['volume_ratio'] = volume / vol_sma
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
        
        # Bollinger Bands
        bb_middle = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        signals['bb_upper'] = bb_middle + 2 * bb_std
        signals['bb_lower'] = bb_middle - 2 * bb_std
        signals['bb_position'] = (close - signals['bb_lower']) / (signals['bb_upper'] - signals['bb_lower'] + 1e-10)
        
        # Trend strength
        signals['trend_strength'] = (close / sma20 - 1) * 0.5 + (close / sma50 - 1) * 0.5
        
        return signals.dropna()
    
    def build_all(self, us_tickers: List[str] = None, in_tickers: List[str] = None):
        """
        Build all weekly artifacts.
        """
        # ALWAYS discover from filesystem - no hardcoded lists
        us_tickers = us_tickers or discover_universe_for_weekly('US')
        in_tickers = in_tickers or discover_universe_for_weekly('IN')
        
        start_time = datetime.now()
        
        logger.info("="*60)
        logger.info("WEEKLY MODEL BUILD STARTED")
        logger.info(f"US tickers: {len(us_tickers)}")
        logger.info(f"IN tickers: {len(in_tickers)}")
        logger.info("="*60)
        
        # Build market regime models
        logger.info("\n[PHASE 1] Building market regime models...")
        self.build_market_regime_model('US')
        self.build_market_regime_model('IN')
        
        # Build asset models for US
        logger.info("\n[PHASE 2] Building US asset models...")
        for i, ticker in enumerate(us_tickers):
            logger.info(f"  [{i+1}/{len(us_tickers)}] {ticker}")
            self.build_asset_regime_model(ticker, 'US')
            self.train_signal_efficacy(ticker, 'US')
            self.run_historical_backtest(ticker, 'US')
        
        # Build asset models for India
        logger.info("\n[PHASE 3] Building IN asset models...")
        for i, ticker in enumerate(in_tickers):
            logger.info(f"  [{i+1}/{len(in_tickers)}] {ticker}")
            self.build_asset_regime_model(ticker, 'IN')
            self.train_signal_efficacy(ticker, 'IN')
            self.run_historical_backtest(ticker, 'IN')
        
        # Save build manifest
        elapsed = (datetime.now() - start_time).total_seconds()
        manifest = {
            'version': VERSION,
            'built_at': datetime.now().isoformat(),
            'elapsed_seconds': elapsed,
            'stats': self.stats,
            'errors': self.errors,
            'us_tickers': us_tickers,
            'in_tickers': in_tickers
        }
        
        with open(ARTIFACTS_DIR / 'build_manifest.json', 'w') as f:
            json.dump(manifest, f, indent=2)
        
        logger.info("\n" + "="*60)
        logger.info("WEEKLY BUILD COMPLETE")
        logger.info(f"Models built: {self.stats['models_built']}")
        logger.info(f"Efficacy trained: {self.stats['efficacy_trained']}")
        logger.info(f"Backtests run: {self.stats['backtests_run']}")
        logger.info(f"Errors: {self.stats['errors']}")
        logger.info(f"Time: {elapsed:.1f}s")
        logger.info("="*60)
        
        return self.stats


def main():
    """Main entry point for weekly model build."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Weekly Model Build Pipeline')
    parser.add_argument('--us-only', action='store_true', help='Build US models only')
    parser.add_argument('--in-only', action='store_true', help='Build IN models only')
    parser.add_argument('--test', action='store_true', help='Test mode (2 stocks per market)')
    args = parser.parse_args()
    
    builder = WeeklyModelBuilder()
    
    # ALWAYS discover from filesystem - no hardcoded lists
    us_tickers = discover_universe_for_weekly('US')
    in_tickers = discover_universe_for_weekly('IN')
    
    if args.test:
        # For testing, limit to first 2 stocks
        us_tickers = us_tickers[:2]
        in_tickers = in_tickers[:2]
    
    if args.us_only:
        in_tickers = []
    elif args.in_only:
        us_tickers = []
    
    logger.info(f"[WEEKLY] Building models for {len(us_tickers)} US stocks and {len(in_tickers)} IN stocks")
    builder.build_all(us_tickers, in_tickers)


if __name__ == '__main__':
    main()

