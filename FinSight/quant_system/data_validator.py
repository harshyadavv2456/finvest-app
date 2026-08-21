#!/usr/bin/env python3
"""
================================================================================
DATA VALIDATOR MODULE - v2.2
================================================================================

Validates presence and integrity of data files for each stock.

REQUIRED FILES (daily_ohlcv is MANDATORY):
- history.parquet           # Daily OHLCV (REQUIRED - stock excluded if missing)
- minute_1m.parquet         # Intraday 1-minute OHLCV (optional)
- tech_indicators.parquet   # Precomputed technical indicators (optional)
- financials_full.json      # 3-year fundamentals (optional)
- news.parquet              # Stock-specific news (optional)
- metadata.json             # Stock metadata (optional)

MARKET-LEVEL DATA:
- InsiderFlow/sec_output_10y/{TICKER}_insider_10y.csv  # US insider data
- Smart Money Flow/fii_dii_output/fii_dii_nifty_joint_signals.csv  # India FII/DII

================================================================================
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
import pandas as pd

logger = logging.getLogger('data_validator')

# =============================================================================
# PATHS
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
INSIDER_DIR = PROJECT_ROOT / 'InsiderFlow' / 'sec_output_10y'
FII_DII_FILE = PROJECT_ROOT / 'Smart Money Flow' / 'fii_dii_output' / 'fii_dii_nifty_joint_signals.csv'

# =============================================================================
# DATA FILES SPEC
# =============================================================================

REQUIRED_FILES = ['history.parquet']

OPTIONAL_FILES = [
    'minute_1m.parquet',
    'tech_indicators.parquet',
    'financials_full.json',
    'news.parquet',
    'metadata.json',
]


@dataclass
class DataValidationResult:
    """Result of validating a single stock's data."""
    ticker: str
    market: str
    is_valid: bool
    
    # File presence
    has_daily_ohlcv: bool = False
    has_minute_ohlcv: bool = False
    has_technicals: bool = False
    has_fundamentals: bool = False
    has_news: bool = False
    has_metadata: bool = False
    has_insider: bool = False
    
    # Data quality
    daily_rows: int = 0
    minute_rows: int = 0
    
    # Active layers
    active_layers: List[str] = field(default_factory=list)
    
    # Exclusion reason (if not valid)
    exclusion_reason: Optional[str] = None
    
    def log_summary(self):
        """Log the validation summary."""
        status = "✔" if self.is_valid else "✗"
        logger.info(f"[DATA CHECK] {self.ticker}")
        logger.info(f"  {status} daily_ohlcv ({self.daily_rows} rows)")
        logger.info(f"  {'✔' if self.has_minute_ohlcv else '○'} minute_ohlcv ({self.minute_rows} rows)")
        logger.info(f"  {'✔' if self.has_technicals else '○'} technicals")
        logger.info(f"  {'✔' if self.has_fundamentals else '○'} fundamentals")
        logger.info(f"  {'✔' if self.has_news else '○'} news")
        logger.info(f"  {'✔' if self.has_insider else '○'} insider")
        if self.market == 'IN':
            logger.info(f"  {'✔' if FII_DII_FILE.exists() else '○'} fii_dii (market-level)")
        
        if self.exclusion_reason:
            logger.warning(f"  EXCLUDED: {self.exclusion_reason}")
        else:
            logger.info(f"  Active layers: {', '.join(self.active_layers)}")


@dataclass
class MarketDataValidation:
    """Validation results for market-level data."""
    market: str
    has_fii_dii: bool = False
    fii_dii_rows: int = 0
    latest_fii_dii_date: Optional[str] = None
    fii_regime: Optional[str] = None
    dii_regime: Optional[str] = None
    flow_signal: Optional[str] = None


class DataValidator:
    """
    Validates data availability for the full-universe pipeline.
    
    Ensures:
    - Each stock has required files
    - Logs which layers are active per stock
    - Returns exclusion list with reasons
    """
    
    def __init__(self):
        self.validation_results: Dict[str, DataValidationResult] = {}
        self.market_data: Dict[str, MarketDataValidation] = {}
        self.excluded_stocks: Dict[str, str] = {}  # ticker -> reason
    
    def validate_stock(self, ticker: str, market: str) -> DataValidationResult:
        """
        Validate data availability for a single stock.
        
        Returns DataValidationResult with:
        - is_valid: True if required files exist
        - active_layers: List of available data layers
        - exclusion_reason: Why stock was excluded (if not valid)
        """
        ticker_dir = DATA_DIR / market / ticker
        
        result = DataValidationResult(
            ticker=ticker,
            market=market,
            is_valid=False,
            active_layers=[]
        )
        
        # Check if directory exists
        if not ticker_dir.exists():
            result.exclusion_reason = f"Data directory not found: {ticker_dir}"
            self.excluded_stocks[ticker] = result.exclusion_reason
            return result
        
        # Check required files
        daily_path = ticker_dir / 'history.parquet'
        if not daily_path.exists():
            result.exclusion_reason = "Missing required file: history.parquet"
            self.excluded_stocks[ticker] = result.exclusion_reason
            return result
        
        # Validate daily OHLCV
        try:
            daily_df = pd.read_parquet(daily_path)
            if len(daily_df) < 60:  # Minimum 60 days
                result.exclusion_reason = f"Insufficient daily data: {len(daily_df)} rows (min 60)"
                self.excluded_stocks[ticker] = result.exclusion_reason
                return result
            
            result.has_daily_ohlcv = True
            result.daily_rows = len(daily_df)
            result.active_layers.append('Layer1_SignalFactory')
            result.active_layers.append('Layer2_RegimeEngine')
            result.active_layers.append('Layer4_ProbabilityEngine')
        except Exception as e:
            result.exclusion_reason = f"Error reading daily data: {e}"
            self.excluded_stocks[ticker] = result.exclusion_reason
            return result
        
        # Check optional files
        
        # Minute OHLCV (Layer 11: Intraday Structure)
        minute_path = ticker_dir / 'minute_1m.parquet'
        if minute_path.exists():
            try:
                minute_df = pd.read_parquet(minute_path)
                if len(minute_df) >= 390:  # At least 1 trading day
                    result.has_minute_ohlcv = True
                    result.minute_rows = len(minute_df)
                    result.active_layers.append('Layer11_IntradayStructure')
            except Exception:
                pass
        
        # Technical indicators
        tech_path = ticker_dir / 'tech_indicators.parquet'
        if tech_path.exists():
            result.has_technicals = True
            result.active_layers.append('Layer3_SignalEfficacy')
        
        # Fundamentals (Layer 10: Fundamental Trajectory)
        fundamentals_path = ticker_dir / 'financials_full.json'
        if fundamentals_path.exists():
            result.has_fundamentals = True
            result.active_layers.append('Layer10_FundamentalTrajectory')
        
        # News (Layer 12: News Reaction)
        news_path = ticker_dir / 'news.parquet'
        if news_path.exists():
            result.has_news = True
            result.active_layers.append('Layer12_NewsReaction')
        
        # Metadata
        metadata_path = ticker_dir / 'metadata.json'
        if metadata_path.exists():
            result.has_metadata = True
        
        # Insider data (Layer 13 - US only from InsiderFlow)
        if market == 'US':
            insider_path = INSIDER_DIR / f'{ticker}_insider_10y.csv'
            if insider_path.exists():
                result.has_insider = True
                result.active_layers.append('Layer13_InsiderSignalV2')
        
        # Core layers always active if daily data exists
        result.active_layers.extend([
            'Layer5_BacktestEngine',
            'Layer6_DecisionEngine',
            'Layer7_LLMInterpreter',
            'Layer8_MetaBacktest',
            'Layer9_PortfolioSim',
        ])
        
        # Market participation (Layer 14 - India only)
        if market == 'IN' and FII_DII_FILE.exists():
            result.active_layers.append('Layer14_MarketParticipation')
        
        result.is_valid = True
        self.validation_results[ticker] = result
        
        return result
    
    def validate_market_data(self, market: str) -> MarketDataValidation:
        """Validate market-level data (FII/DII for India)."""
        result = MarketDataValidation(market=market)
        
        if market == 'IN' and FII_DII_FILE.exists():
            try:
                df = pd.read_csv(FII_DII_FILE, parse_dates=['trade_date'])
                if not df.empty:
                    result.has_fii_dii = True
                    result.fii_dii_rows = len(df)
                    latest = df.iloc[-1]
                    result.latest_fii_dii_date = str(latest['trade_date'].date())
                    result.flow_signal = latest.get('flow_signal', 'unknown')
                    
                    # Determine regimes
                    fii_net = latest.get('fii_roll5', 0)
                    dii_net = latest.get('dii_roll5', 0)
                    
                    result.fii_regime = 'buying' if fii_net > 1000 else ('selling' if fii_net < -1000 else 'neutral')
                    result.dii_regime = 'buying' if dii_net > 1000 else ('selling' if dii_net < -1000 else 'neutral')
                    
                    logger.info(f"[FII/DII] Market: {result.flow_signal} → "
                              f"FII {result.fii_regime}, DII {result.dii_regime}")
            except Exception as e:
                logger.warning(f"[FII/DII] Error loading data: {e}")
        
        self.market_data[market] = result
        return result
    
    def validate_universe(
        self,
        tickers: List[str],
        market: str,
        log_individual: bool = False
    ) -> Tuple[List[str], List[str]]:
        """
        Validate all tickers in a universe.
        
        Returns:
            (valid_tickers, excluded_tickers)
        """
        valid = []
        excluded = []
        
        logger.info(f"[VALIDATION] Starting validation for {len(tickers)} tickers in {market}")
        
        # Validate market-level data first
        self.validate_market_data(market)
        
        for ticker in tickers:
            result = self.validate_stock(ticker, market)
            
            if log_individual:
                result.log_summary()
            
            if result.is_valid:
                valid.append(ticker)
            else:
                excluded.append(ticker)
        
        logger.info(f"[VALIDATION] {market}: {len(valid)} valid, {len(excluded)} excluded")
        
        if excluded:
            logger.info(f"[VALIDATION] Sample exclusions: {excluded[:5]}")
        
        return valid, excluded
    
    def get_stock_layers(self, ticker: str) -> List[str]:
        """Get active layers for a stock."""
        result = self.validation_results.get(ticker)
        return result.active_layers if result else []
    
    def get_validation_summary(self) -> Dict[str, Any]:
        """Get summary of all validations."""
        total_valid = sum(1 for r in self.validation_results.values() if r.is_valid)
        total_excluded = len(self.excluded_stocks)
        
        layer_counts = {}
        for result in self.validation_results.values():
            for layer in result.active_layers:
                layer_counts[layer] = layer_counts.get(layer, 0) + 1
        
        return {
            'total_validated': len(self.validation_results) + total_excluded,
            'total_valid': total_valid,
            'total_excluded': total_excluded,
            'exclusion_reasons': dict(list(self.excluded_stocks.items())[:10]),
            'layer_coverage': layer_counts,
            'market_data': {
                market: {
                    'has_fii_dii': data.has_fii_dii,
                    'fii_dii_date': data.latest_fii_dii_date,
                    'flow_signal': data.flow_signal,
                }
                for market, data in self.market_data.items()
            }
        }


def load_insider_data_from_sec(ticker: str) -> Optional[pd.DataFrame]:
    """
    Load insider data from InsiderFlow/sec_output_10y/{TICKER}_insider_10y.csv
    
    This is the CORRECT path for SEC Form 4 data.
    """
    insider_path = INSIDER_DIR / f'{ticker}_insider_10y.csv'
    
    if not insider_path.exists():
        logger.debug(f"[INSIDER] No data for {ticker}")
        return None
    
    try:
        df = pd.read_csv(insider_path)
        logger.debug(f"[INSIDER] Loaded {len(df)} transactions for {ticker}")
        return df
    except Exception as e:
        logger.warning(f"[INSIDER] Error loading {ticker}: {e}")
        return None


def parse_mixed_date(date_str):
    """Parse dates with multiple formats for FII/DII data."""
    if pd.isna(date_str):
        return pd.NaT
    
    date_str = str(date_str).strip()
    formats = [
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
        "%d-%b-%Y",
    ]
    
    for fmt in formats:
        try:
            return pd.to_datetime(date_str, format=fmt)
        except:
            continue
    
    try:
        return pd.to_datetime(date_str, dayfirst=True)
    except:
        return pd.NaT


def load_fii_dii_data() -> Optional[pd.DataFrame]:
    """
    Load FII/DII data from Smart Money Flow/fii_dii_output/fii_dii_nifty_joint_signals.csv
    
    This is the CORRECT path for India market participation data.
    Handles mixed date formats in the data.
    """
    if not FII_DII_FILE.exists():
        logger.warning(f"[FII/DII] File not found: {FII_DII_FILE}")
        return None
    
    try:
        df = pd.read_csv(FII_DII_FILE)
        
        # Parse dates with mixed formats
        if 'trade_date' in df.columns:
            df['trade_date'] = df['trade_date'].apply(parse_mixed_date)
        
        logger.info(f"[FII/DII] Loaded {len(df)} days of flow data")
        return df
    except Exception as e:
        logger.warning(f"[FII/DII] Error loading data: {e}")
        return None


def validate_startup() -> bool:
    """
    Startup validation - run before pipeline.
    
    Checks:
    - Data directories exist
    - At least some stocks have data
    - Market-level data is accessible
    """
    logger.info("=" * 60)
    logger.info("PIPELINE STARTUP VALIDATION")
    logger.info("=" * 60)
    
    errors = []
    r2_configured = bool(os.environ.get("R2_ACCESS_KEY_ID"))

    # Check data directories. On a fresh CI checkout with R2 configured,
    # FinSight/data/{market}/ genuinely doesn't exist yet - it's
    # gitignored and self-heals per-ticker on first access (see
    # utils/paths.py), the same architecture every other endpoint in
    # this app already relies on. This check predates that migration
    # and was still treating a missing directory as a hard failure,
    # which made the intelligence job fail its startup gate on every
    # single CI run - it never had a local checkout with pre-existing
    # data to begin with. Only enforce this strictly when R2 isn't
    # configured (i.e. genuinely local dev with no self-heal available).
    for market in ['US', 'IN']:
        market_dir = DATA_DIR / market
        if not market_dir.exists():
            if r2_configured:
                logger.info(f"[STARTUP] {market} data directory not present locally yet - R2 configured, will self-heal per-ticker on demand")
                market_dir.mkdir(parents=True, exist_ok=True)
            else:
                errors.append(f"Data directory missing: {market_dir}")
        else:
            stock_count = len([d for d in market_dir.iterdir() if d.is_dir()])
            logger.info(f"[STARTUP] {market} data directory: {stock_count} stocks")
    
    # Check InsiderFlow
    if INSIDER_DIR.exists():
        insider_count = len(list(INSIDER_DIR.glob('*_insider_10y.csv')))
        logger.info(f"[STARTUP] InsiderFlow: {insider_count} tickers with insider data")
    else:
        logger.warning(f"[STARTUP] InsiderFlow directory not found")
    
    # Check FII/DII
    if FII_DII_FILE.exists():
        logger.info(f"[STARTUP] FII/DII data: Available")
    else:
        logger.warning(f"[STARTUP] FII/DII data: Not found")
    
    if errors:
        for error in errors:
            logger.error(f"[STARTUP ERROR] {error}")
        return False
    
    logger.info("=" * 60)
    logger.info("PIPELINE VALIDATED")
    logger.info("Mode: FULL-UNIVERSE")
    logger.info("Runtime target: < 60s")
    logger.info("=" * 60)
    
    return True

