"""
FinSight Quant System Utilities
===============================

Data loading and common utility functions.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import date, datetime
import json
import logging

from .config import DATA_DIR, US_DATA_DIR, IN_DATA_DIR, MARKET_BENCHMARKS

logger = logging.getLogger(__name__)


# =============================================================================
# DATA LOADING
# =============================================================================

def load_price_history(ticker: str, market: str = 'US') -> Optional[pd.DataFrame]:
    """
    Load daily price history for a ticker.
    
    Returns DataFrame with columns: date, open, high, low, close, volume
    Normalizes column names to lowercase.
    """
    if market == 'US':
        data_dir = US_DATA_DIR
    elif market == 'IN':
        data_dir = IN_DATA_DIR
    else:
        data_dir = DATA_DIR / market
    
    # Try parquet first
    parquet_path = data_dir / ticker / "history.parquet"
    if parquet_path.exists():
        try:
            df = pd.read_parquet(parquet_path)
            
            # Handle date in index (common yfinance format)
            if 'date' not in df.columns and df.index.name in ['Date', 'date', None]:
                df = df.reset_index()
                # Rename index column to 'date' if needed
                if 'Date' in df.columns:
                    df = df.rename(columns={'Date': 'date'})
                elif df.columns[0] not in ['date', 'Date']:
                    df = df.rename(columns={df.columns[0]: 'date'})
            
            # Normalize column names to lowercase
            df.columns = [c.lower().replace(' ', '_') for c in df.columns]
            
            # Ensure 'close' exists (might be 'adj_close' or 'adj close')
            if 'close' not in df.columns and 'adj_close' in df.columns:
                df['close'] = df['adj_close']
            
            # Ensure date is datetime
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date']).dt.tz_localize(None)
            
            df = df.sort_values('date').reset_index(drop=True)
            return df
        except Exception as e:
            logger.error(f"Error loading parquet for {ticker}: {e}")
    
    # Fallback to CSV
    csv_path = data_dir / ticker / "history.csv"
    if csv_path.exists():
        try:
            df = pd.read_csv(csv_path)
            
            # Handle date column variations
            date_cols = [c for c in df.columns if c.lower() in ['date', 'timestamp', 'time']]
            if date_cols:
                df = df.rename(columns={date_cols[0]: 'date'})
                df['date'] = pd.to_datetime(df['date'])
            
            # Normalize column names
            df.columns = [c.lower().replace(' ', '_') for c in df.columns]
            
            df = df.sort_values('date').reset_index(drop=True)
            return df
        except Exception as e:
            logger.error(f"Error loading CSV for {ticker}: {e}")
    
    logger.warning(f"No price history found for {ticker} ({market})")
    return None


def load_market_benchmark(market: str = 'US') -> Optional[pd.DataFrame]:
    """
    Load market benchmark data with robust fallback mechanism.
    
    Priority:
    1. Primary benchmark (SPY for US)
    2. Fallback benchmarks (QQQ, IVV, etc.)
    3. Synthetic from large-cap basket
    
    This MUST return data - market regime depends on it.
    """
    benchmark_config = MARKET_BENCHMARKS.get(market)
    
    if not benchmark_config:
        logger.warning(f"No benchmark config for market {market}")
        return None
    
    # Try primary benchmark
    primary = benchmark_config['primary']
    df = load_price_history(primary, market)
    if df is not None and len(df) > 60:
        logger.info(f"Loaded primary market benchmark: {primary}")
        return df
    
    # Try fallbacks
    for fallback in benchmark_config.get('fallbacks', []):
        df = load_price_history(fallback, market)
        if df is not None and len(df) > 60:
            logger.info(f"Loaded fallback market benchmark: {fallback}")
            return df
    
    # Synthesize from large-cap basket
    proxy_tickers = benchmark_config.get('proxy_tickers', [])
    if proxy_tickers:
        synthetic = _synthesize_market_proxy(proxy_tickers, market)
        if synthetic is not None:
            logger.info(f"Using synthetic market benchmark from {len(proxy_tickers)} large caps")
            return synthetic
    
    logger.error(f"Could not load any market benchmark for {market}")
    return None


def _synthesize_market_proxy(tickers: List[str], market: str) -> Optional[pd.DataFrame]:
    """
    Synthesize market proxy from basket of large-cap stocks.
    
    Uses equal-weighted average of returns.
    """
    all_prices = []
    
    for ticker in tickers:
        df = load_price_history(ticker, market)
        if df is not None and 'close' in df.columns and 'date' in df.columns:
            prices = df[['date', 'close']].copy()
            prices = prices.rename(columns={'close': f'close_{ticker}'})
            all_prices.append(prices)
    
    if len(all_prices) < 2:
        return None
    
    # Merge all price series
    merged = all_prices[0]
    for prices in all_prices[1:]:
        merged = merged.merge(prices, on='date', how='inner')
    
    if len(merged) < 60:
        return None
    
    # Calculate equal-weighted average
    close_cols = [c for c in merged.columns if c.startswith('close_')]
    merged['close'] = merged[close_cols].mean(axis=1)
    
    # Reconstruct OHLCV (approximations)
    merged['open'] = merged['close'].shift(1)
    merged['high'] = merged['close'] * 1.005  # Approximation
    merged['low'] = merged['close'] * 0.995   # Approximation
    merged['volume'] = 1000000  # Placeholder
    
    result = merged[['date', 'open', 'high', 'low', 'close', 'volume']].copy()
    result = result.dropna().reset_index(drop=True)
    
    return result


def load_financials(ticker: str, market: str = 'US') -> Optional[Dict[str, Any]]:
    """Load financial data for a ticker."""
    if market == 'US':
        data_dir = US_DATA_DIR
    elif market == 'IN':
        data_dir = IN_DATA_DIR
    else:
        data_dir = DATA_DIR / market
    
    json_path = data_dir / ticker / "financials_full.json"
    if json_path.exists():
        try:
            with open(json_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading financials for {ticker}: {e}")
    
    return None


def load_screener_data(market: str = 'US') -> Optional[pd.DataFrame]:
    """Load screener data for a market."""
    if market == 'US':
        screener_path = US_DATA_DIR / "screener.parquet"
    elif market == 'IN':
        screener_path = IN_DATA_DIR / "screener.parquet"
    else:
        screener_path = DATA_DIR / market / "screener.parquet"
    
    if screener_path.exists():
        try:
            return pd.read_parquet(screener_path)
        except Exception as e:
            logger.error(f"Error loading screener data: {e}")
    
    return None


def load_insider_trades(ticker: str = None) -> Optional[pd.DataFrame]:
    """Load insider trades data."""
    insider_path = DATA_DIR.parent / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv"
    
    if insider_path.exists():
        try:
            df = pd.read_csv(insider_path, parse_dates=['filingDate', 'transactionDate'])
            if ticker:
                df = df[df['issuerTradingSymbol'] == ticker]
            return df
        except Exception as e:
            logger.error(f"Error loading insider trades: {e}")
    
    return None


def load_13f_holdings(ticker: str = None) -> Optional[pd.DataFrame]:
    """Load 13F institutional holdings data."""
    holdings_path = DATA_DIR.parent / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv"
    
    if holdings_path.exists():
        try:
            df = pd.read_csv(holdings_path, parse_dates=['filingDate'])
            if ticker:
                df = df[df['nameOfIssuer'].str.contains(ticker, case=False, na=False)]
            return df
        except Exception as e:
            logger.error(f"Error loading 13F holdings: {e}")
    
    return None


# =============================================================================
# COMPUTATION UTILITIES
# =============================================================================

def compute_returns(prices: pd.Series, periods: List[int] = None) -> pd.DataFrame:
    """Compute returns for multiple periods."""
    periods = periods or [1, 5, 20, 60]
    
    returns = pd.DataFrame(index=prices.index)
    for p in periods:
        returns[f'ret_{p}d'] = prices.pct_change(p)
    
    return returns


def compute_realized_volatility(
    prices: pd.Series,
    windows: List[int] = None,
    annualize: bool = True
) -> pd.DataFrame:
    """Compute realized volatility for multiple windows."""
    windows = windows or [20, 60]
    
    daily_ret = prices.pct_change(1)
    
    vol = pd.DataFrame(index=prices.index)
    for w in windows:
        vol[f'vol_{w}d'] = daily_ret.rolling(w).std()
        if annualize:
            vol[f'vol_{w}d'] *= np.sqrt(252)
    
    return vol


def classify_volatility_regime(volatility: float) -> str:
    """Classify volatility into regime."""
    if volatility < 0.15:
        return 'low'
    elif volatility < 0.25:
        return 'normal'
    elif volatility < 0.40:
        return 'elevated'
    else:
        return 'extreme'


def classify_trend_regime(prices: pd.Series, lookback: int = 20) -> str:
    """Classify trend regime based on price action."""
    if len(prices) < lookback:
        return 'sideways'
    
    sma = prices.rolling(lookback).mean()
    current_price = prices.iloc[-1]
    current_sma = sma.iloc[-1]
    
    if pd.isna(current_sma):
        return 'sideways'
    
    distance = (current_price / current_sma - 1)
    momentum = prices.pct_change(lookback).iloc[-1]
    
    if distance > 0.05 and momentum > 0.05:
        return 'strong_up'
    elif distance > 0 and momentum > 0:
        return 'weak_up'
    elif distance < -0.05 and momentum < -0.05:
        return 'strong_down'
    elif distance < 0 and momentum < 0:
        return 'weak_down'
    else:
        return 'sideways'


def compute_information_coefficient(
    signal: pd.Series,
    forward_returns: pd.Series
) -> float:
    """Compute Information Coefficient (Spearman rank correlation)."""
    valid_mask = ~(signal.isna() | forward_returns.isna())
    
    if valid_mask.sum() < 30:
        return np.nan
    
    return signal[valid_mask].corr(forward_returns[valid_mask], method='spearman')


def compute_hit_rate(
    signal: pd.Series,
    forward_returns: pd.Series,
    threshold: float = 0
) -> float:
    """Compute directional hit rate."""
    valid_mask = ~(signal.isna() | forward_returns.isna())
    
    if valid_mask.sum() < 30:
        return np.nan
    
    signal_positive = signal[valid_mask] > threshold
    return_positive = forward_returns[valid_mask] > 0
    
    return (signal_positive == return_positive).mean()


# =============================================================================
# TECHNICAL INDICATORS
# =============================================================================

def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Compute RSI indicator."""
    delta = prices.diff()
    
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)
    
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    return rsi


def compute_macd(
    prices: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> pd.DataFrame:
    """Compute MACD indicator."""
    exp_fast = prices.ewm(span=fast, adjust=False).mean()
    exp_slow = prices.ewm(span=slow, adjust=False).mean()
    
    macd_line = exp_fast - exp_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    
    return pd.DataFrame({
        'macd': macd_line,
        'signal': signal_line,
        'histogram': histogram
    })


def compute_bollinger_bands(
    prices: pd.Series,
    period: int = 20,
    std_dev: float = 2.0
) -> pd.DataFrame:
    """Compute Bollinger Bands."""
    sma = prices.rolling(period).mean()
    std = prices.rolling(period).std()
    
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    
    # Position within bands (0 = lower, 1 = upper)
    position = (prices - lower) / (upper - lower)
    
    return pd.DataFrame({
        'bb_upper': upper,
        'bb_middle': sma,
        'bb_lower': lower,
        'bb_position': position
    })


# =============================================================================
# DATE UTILITIES
# =============================================================================

def get_trading_days(
    start_date: date,
    end_date: date,
    market: str = 'US'
) -> List[date]:
    """Get list of trading days between dates."""
    # Simple implementation - excludes weekends
    # For production, use proper holiday calendar
    dates = pd.date_range(start_date, end_date, freq='B')
    return [d.date() for d in dates]


def align_dates(*dataframes: pd.DataFrame, date_col: str = 'date') -> List[pd.DataFrame]:
    """Align multiple DataFrames to common dates."""
    if not dataframes:
        return []
    
    common_dates = set(dataframes[0][date_col])
    for df in dataframes[1:]:
        common_dates &= set(df[date_col])
    
    common_dates = sorted(common_dates)
    
    return [
        df[df[date_col].isin(common_dates)].copy()
        for df in dataframes
    ]


# =============================================================================
# FORMATTING UTILITIES
# =============================================================================

def format_pct(value: float, decimals: int = 1) -> str:
    """Format value as percentage."""
    if pd.isna(value):
        return "N/A"
    return f"{value * 100:.{decimals}f}%"


def format_currency(value: float, decimals: int = 2) -> str:
    """Format value as currency."""
    if pd.isna(value):
        return "N/A"
    return f"${value:,.{decimals}f}"


def format_number(value: float, decimals: int = 2) -> str:
    """Format number with commas."""
    if pd.isna(value):
        return "N/A"
    return f"{value:,.{decimals}f}"
