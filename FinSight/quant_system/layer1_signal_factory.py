"""
LAYER 1: Signal Factory
========================

Converts raw market data into normalized, timestamped signals.

Signal Categories:
- Price & Volatility State
- Smart Money Intent (Insiders, Institutions, Flows)
- Derivatives Expectations (IV, OI)
- Valuation Gravity (DCF-implied)

Output: signals.parquet with all signals for each stock-day
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, List, Tuple
from datetime import datetime, date
import logging

from .utils import (
    load_price_history, load_fundamentals, load_technical_indicators,
    load_insider_signals, load_13f_signals, load_fii_dii_signals,
    load_options_data, load_screener_data,
    compute_zscore, compute_percentile_rank, compute_realized_volatility,
    compute_returns, classify_volatility_regime, classify_trend_regime
)
from .config import (
    DEFAULT_SIGNAL_CONFIG, MARKET_CONFIG, 
    SIGNALS_OUTPUT_DIR
)
from .schemas import (
    PriceSignal, SmartMoneySignal, DerivativesSignal, 
    ValuationSignal, CompositeSignal
)

logger = logging.getLogger(__name__)


class SignalFactory:
    """
    Factory class for generating normalized signals from raw data.
    
    This is the foundational layer that transforms raw market data
    into standardized, regime-aware signals suitable for downstream analysis.
    """
    
    def __init__(self, config=None):
        self.config = config or DEFAULT_SIGNAL_CONFIG
        self._screener_cache = None
        self._insider_cache = None
        self._fii_dii_cache = None
    
    # =========================================================================
    # PRICE & VOLATILITY SIGNALS
    # =========================================================================
    
    def generate_price_signals(
        self, 
        ticker: str, 
        market: str,
        as_of_date: Optional[date] = None
    ) -> Optional[pd.DataFrame]:
        """
        Generate price and volatility state signals.
        
        Signals generated:
        - Momentum (multi-horizon returns, z-scored)
        - Volatility state (realized vol, percentile, regime)
        - Trend (price vs SMAs, alignment score)
        - Mean reversion (RSI, Bollinger position)
        
        Args:
            ticker: Stock ticker
            market: Market code (US, IN, etc.)
            as_of_date: Generate signals up to this date (for backtesting)
        
        Returns:
            DataFrame with price signals indexed by date
        """
        # Load price history
        df = load_price_history(ticker, market)
        if df is None or len(df) < self.config.zscore_min_periods:
            logger.warning(f"Insufficient data for {ticker}")
            return None
        
        # Filter to as_of_date if specified
        if as_of_date:
            df = df[df['date'] <= pd.Timestamp(as_of_date)]
        
        signals = pd.DataFrame(index=df['date'])
        signals['ticker'] = ticker
        signals['market'] = market
        
        # Get close prices
        close = df.set_index('date')['close']
        
        # ---------------------------------------------------------------------
        # MOMENTUM SIGNALS
        # ---------------------------------------------------------------------
        
        # Multi-horizon returns
        for period in self.config.momentum_windows:
            ret = compute_returns(close, periods=period)
            signals[f'ret_{period}d'] = ret
            signals[f'ret_{period}d_z'] = compute_zscore(
                ret, 
                lookback=self.config.zscore_lookback,
                min_periods=self.config.zscore_min_periods
            )
        
        # ---------------------------------------------------------------------
        # VOLATILITY SIGNALS
        # ---------------------------------------------------------------------
        
        # Daily returns for volatility calculation
        daily_ret = compute_returns(close, periods=1)
        
        # Realized volatility (annualized)
        trading_days = MARKET_CONFIG.get(market, {}).get('trading_days_per_year', 252)
        signals['realized_vol_20d'] = compute_realized_volatility(
            daily_ret, window=20, annualization=trading_days
        )
        signals['realized_vol_60d'] = compute_realized_volatility(
            daily_ret, window=60, annualization=trading_days
        )
        
        # Volatility z-score and percentile
        signals['vol_z'] = compute_zscore(
            signals['realized_vol_20d'],
            lookback=self.config.zscore_lookback,
            min_periods=self.config.zscore_min_periods
        )
        signals['vol_percentile'] = compute_percentile_rank(
            signals['realized_vol_20d'],
            lookback=self.config.zscore_lookback
        )
        
        # Volatility regime
        signals['vol_regime'] = signals['vol_percentile'].apply(classify_volatility_regime)
        
        # Volatility change (expansion/contraction)
        signals['vol_change_5d'] = signals['realized_vol_20d'].pct_change(5)
        signals['vol_change_20d'] = signals['realized_vol_20d'].pct_change(20)
        
        # ---------------------------------------------------------------------
        # TREND SIGNALS
        # ---------------------------------------------------------------------
        
        # Price vs SMAs
        for window in self.config.trend_windows:
            sma = close.rolling(window=window).mean()
            signals[f'price_vs_sma{window}'] = (close / sma) - 1
        
        # SMA alignment (trend strength)
        # Positive when SMAs are properly ordered (20 > 50 > 200 for uptrend)
        sma20 = close.rolling(20).mean()
        sma50 = close.rolling(50).mean()
        sma200 = close.rolling(200).mean()
        
        # Compute trend alignment score (-1 to 1)
        signals['trend_alignment'] = (
            (sma20 > sma50).astype(float) * 0.4 +
            (sma50 > sma200).astype(float) * 0.4 +
            ((close > sma20).astype(float) - 0.5) * 0.4
        )
        
        # Trend regime classification
        signals['trend_regime'] = signals.apply(
            lambda row: classify_trend_regime(
                row.get('price_vs_sma20', 0),
                row.get('price_vs_sma50', 0),
                row.get('price_vs_sma200', 0)
            ),
            axis=1
        )
        
        # ---------------------------------------------------------------------
        # MEAN REVERSION SIGNALS
        # ---------------------------------------------------------------------
        
        # RSI-14
        delta = close.diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        
        avg_gain = gain.rolling(window=14).mean()
        avg_loss = loss.rolling(window=14).mean()
        
        rs = avg_gain / avg_loss.replace(0, np.nan)
        signals['rsi_14'] = 100 - (100 / (1 + rs))
        
        # RSI z-score
        signals['rsi_z'] = compute_zscore(signals['rsi_14'], lookback=252)
        
        # Bollinger Band position (-1 to 1)
        bb_middle = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        bb_upper = bb_middle + 2 * bb_std
        bb_lower = bb_middle - 2 * bb_std
        
        signals['bb_position'] = (close - bb_middle) / (bb_std * 2)
        signals['bb_position'] = signals['bb_position'].clip(-1, 1)
        
        # Distance from 52-week extremes
        high_52w = close.rolling(252).max()
        low_52w = close.rolling(252).min()
        
        signals['distance_from_52w_high'] = (close / high_52w) - 1
        signals['distance_from_52w_low'] = (close / low_52w) - 1
        
        # ---------------------------------------------------------------------
        # VOLUME SIGNALS
        # ---------------------------------------------------------------------
        
        if 'volume' in df.columns:
            volume = df.set_index('date')['volume']
            
            # Volume ratio (vs 20-day average)
            signals['volume_ratio'] = volume / volume.rolling(20).mean()
            
            # Volume z-score
            signals['volume_z'] = compute_zscore(volume, lookback=252)
            
            # Volume trend
            signals['volume_trend'] = volume.rolling(5).mean() / volume.rolling(20).mean()
        
        return signals.reset_index()
    
    # =========================================================================
    # SMART MONEY SIGNALS
    # =========================================================================
    
    def generate_smart_money_signals(
        self,
        ticker: str,
        market: str,
        price_dates: pd.DatetimeIndex,
        as_of_date: Optional[date] = None
    ) -> pd.DataFrame:
        """
        Generate smart money intent signals.
        
        Signals generated:
        - Insider trading activity and conviction
        - Institutional holdings changes (13F)
        - FII/DII flows (India only)
        
        Args:
            ticker: Stock ticker
            market: Market code
            price_dates: DatetimeIndex to align signals to
            as_of_date: Generate signals up to this date
        
        Returns:
            DataFrame with smart money signals indexed by date
        """
        signals = pd.DataFrame(index=price_dates)
        signals['ticker'] = ticker
        
        # Initialize all signals to neutral
        signals['insider_net_signal_30d'] = 0.0
        signals['insider_cluster_buy'] = False
        signals['insider_cluster_sell'] = False
        signals['insider_signal_z'] = 0.0
        signals['inst_position_change'] = 0.0
        signals['inst_num_increasing'] = 0
        signals['inst_num_decreasing'] = 0
        signals['inst_conviction'] = 0.0
        signals['fii_net_5d'] = np.nan
        signals['dii_net_5d'] = np.nan
        signals['flow_regime'] = 'neutral'
        
        market_config = MARKET_CONFIG.get(market, {})
        
        # ---------------------------------------------------------------------
        # INSIDER SIGNALS (US only)
        # ---------------------------------------------------------------------
        
        if market_config.get('has_insider_data', False):
            insider_df = load_insider_signals(ticker)
            
            if insider_df is not None and len(insider_df) > 0:
                # Filter to as_of_date
                if as_of_date:
                    insider_df = insider_df[insider_df['eventDate'] <= pd.Timestamp(as_of_date)]
                
                # Create daily insider metrics
                for idx_date in price_dates:
                    # Look back 30 days
                    lookback_start = idx_date - pd.Timedelta(days=30)
                    mask = (insider_df['eventDate'] >= lookback_start) & (insider_df['eventDate'] <= idx_date)
                    period_data = insider_df[mask]
                    
                    if len(period_data) > 0:
                        # Net signal strength
                        signals.loc[idx_date, 'insider_net_signal_30d'] = period_data['net_signal_strength'].sum()
                        
                        # Cluster signals
                        signals.loc[idx_date, 'insider_cluster_buy'] = period_data['has_cluster_buy'].any()
                        signals.loc[idx_date, 'insider_cluster_sell'] = period_data['has_cluster_sell'].any()
                        
                        # Signal z-score (average of daily z-scores)
                        if 'signal_z' in period_data.columns:
                            signals.loc[idx_date, 'insider_signal_z'] = period_data['signal_z'].mean()
        
        # ---------------------------------------------------------------------
        # INSTITUTIONAL SIGNALS (13F, US only)
        # ---------------------------------------------------------------------
        
        if market_config.get('has_13f_data', False):
            # Load 13F data (aggregated by asset)
            # Note: 13F data is quarterly and lagged, so we forward-fill
            inst_df = load_13f_signals()
            
            if inst_df is not None:
                # This would need CUSIP mapping - simplified version
                # In production, would map ticker to CUSIP
                pass
        
        # ---------------------------------------------------------------------
        # FII/DII FLOW SIGNALS (India only)
        # ---------------------------------------------------------------------
        
        if market_config.get('has_fii_dii', False):
            fii_dii_df = load_fii_dii_signals()
            
            if fii_dii_df is not None:
                # Filter to as_of_date
                if as_of_date:
                    fii_dii_df = fii_dii_df[fii_dii_df['trade_date'] <= pd.Timestamp(as_of_date)]
                
                # Reindex to price dates
                fii_dii_df = fii_dii_df.set_index('trade_date')
                
                for col in ['fii_roll5', 'dii_roll5', 'flow_signal']:
                    if col in fii_dii_df.columns:
                        if col == 'fii_roll5':
                            signals['fii_net_5d'] = fii_dii_df['fii_roll5'].reindex(price_dates, method='ffill')
                        elif col == 'dii_roll5':
                            signals['dii_net_5d'] = fii_dii_df['dii_roll5'].reindex(price_dates, method='ffill')
                        elif col == 'flow_signal':
                            signals['flow_regime'] = fii_dii_df['flow_signal'].reindex(price_dates, method='ffill')
        
        return signals.reset_index().rename(columns={'index': 'date'})
    
    # =========================================================================
    # DERIVATIVES SIGNALS
    # =========================================================================
    
    def generate_derivatives_signals(
        self,
        ticker: str,
        market: str,
        price_dates: pd.DatetimeIndex,
        current_price: float,
        as_of_date: Optional[date] = None
    ) -> pd.DataFrame:
        """
        Generate derivatives-based expectation signals.
        
        Signals generated:
        - Implied volatility state (level, percentile, vs RV)
        - Put/Call ratios (OI and volume)
        - Max pain and distance
        - OI buildup patterns
        
        Args:
            ticker: Stock ticker
            market: Market code
            price_dates: DatetimeIndex to align signals to
            current_price: Current stock price
            as_of_date: Generate signals up to this date
        
        Returns:
            DataFrame with derivatives signals
        """
        signals = pd.DataFrame(index=price_dates)
        signals['ticker'] = ticker
        
        # Initialize to NaN (not all stocks have options)
        signals['iv_current'] = np.nan
        signals['iv_percentile'] = np.nan
        signals['iv_vs_rv'] = np.nan
        signals['pcr_oi'] = np.nan
        signals['pcr_volume'] = np.nan
        signals['max_pain'] = np.nan
        signals['max_pain_distance'] = np.nan
        signals['oi_buildup_signal'] = 'neutral'
        
        market_config = MARKET_CONFIG.get(market, {})
        
        if not market_config.get('has_options', False):
            return signals.reset_index().rename(columns={'index': 'date'})
        
        # Load options data
        options_df = load_options_data(ticker)
        
        if options_df is None or len(options_df) == 0:
            return signals.reset_index().rename(columns={'index': 'date'})
        
        # For simplicity, we'll compute signals for the latest available data
        # In production, this would be time-series based
        
        # Implied Volatility (ATM)
        atm_options = options_df[
            abs(options_df['strikePrice'] - current_price) / current_price < 0.05
        ]
        
        if len(atm_options) > 0 and 'impliedVolatility' in atm_options.columns:
            avg_iv = atm_options['impliedVolatility'].mean()
            signals.iloc[-1, signals.columns.get_loc('iv_current')] = avg_iv
        
        # Put/Call Ratio by OI
        if 'openInterest' in options_df.columns:
            call_oi = options_df[options_df['optionType'] == 'CE']['openInterest'].sum()
            put_oi = options_df[options_df['optionType'] == 'PE']['openInterest'].sum()
            
            if call_oi > 0:
                signals.iloc[-1, signals.columns.get_loc('pcr_oi')] = put_oi / call_oi
        
        # Put/Call Ratio by Volume
        if 'totalTradedVolume' in options_df.columns:
            call_vol = options_df[options_df['optionType'] == 'CE']['totalTradedVolume'].sum()
            put_vol = options_df[options_df['optionType'] == 'PE']['totalTradedVolume'].sum()
            
            if call_vol > 0:
                signals.iloc[-1, signals.columns.get_loc('pcr_volume')] = put_vol / call_vol
        
        # Max Pain calculation
        if 'openInterest' in options_df.columns:
            max_pain = self._calculate_max_pain(options_df, current_price)
            if max_pain is not None:
                signals.iloc[-1, signals.columns.get_loc('max_pain')] = max_pain
                signals.iloc[-1, signals.columns.get_loc('max_pain_distance')] = (current_price - max_pain) / max_pain
        
        return signals.reset_index().rename(columns={'index': 'date'})
    
    def _calculate_max_pain(self, options_df: pd.DataFrame, current_price: float) -> Optional[float]:
        """Calculate max pain strike price."""
        strikes = options_df['strikePrice'].unique()
        
        if len(strikes) == 0:
            return None
        
        min_pain = float('inf')
        max_pain_strike = None
        
        for strike in strikes:
            # Calculate pain at this strike
            pain = 0
            
            # Call pain (calls ITM below strike)
            calls = options_df[(options_df['optionType'] == 'CE') & (options_df['strikePrice'] < strike)]
            for _, call in calls.iterrows():
                if 'openInterest' in call and not pd.isna(call['openInterest']):
                    pain += call['openInterest'] * (strike - call['strikePrice'])
            
            # Put pain (puts ITM above strike)
            puts = options_df[(options_df['optionType'] == 'PE') & (options_df['strikePrice'] > strike)]
            for _, put in puts.iterrows():
                if 'openInterest' in put and not pd.isna(put['openInterest']):
                    pain += put['openInterest'] * (put['strikePrice'] - strike)
            
            if pain < min_pain:
                min_pain = pain
                max_pain_strike = strike
        
        return max_pain_strike
    
    # =========================================================================
    # VALUATION SIGNALS
    # =========================================================================
    
    def generate_valuation_signals(
        self,
        ticker: str,
        market: str,
        price_dates: pd.DatetimeIndex,
        as_of_date: Optional[date] = None
    ) -> pd.DataFrame:
        """
        Generate fundamental valuation signals.
        
        Signals generated:
        - Relative valuation (PE, PB, PS percentiles)
        - Quality-adjusted yields (earnings yield, FCF yield)
        - Implied growth/margin from reverse DCF
        - Composite valuation gap score
        
        Args:
            ticker: Stock ticker
            market: Market code
            price_dates: DatetimeIndex to align signals to
            as_of_date: Generate signals up to this date
        
        Returns:
            DataFrame with valuation signals
        """
        signals = pd.DataFrame(index=price_dates)
        signals['ticker'] = ticker
        
        # Initialize to NaN
        signals['pe_percentile'] = np.nan
        signals['pb_percentile'] = np.nan
        signals['ps_percentile'] = np.nan
        signals['pe_vs_sector'] = np.nan
        signals['pb_vs_sector'] = np.nan
        signals['earnings_yield'] = np.nan
        signals['fcf_yield'] = np.nan
        signals['implied_growth_rate'] = np.nan
        signals['valuation_gap_z'] = np.nan
        
        # Load fundamentals
        fundamentals = load_fundamentals(ticker, market)
        
        if fundamentals is None:
            return signals.reset_index().rename(columns={'index': 'date'})
        
        info = fundamentals.get('info', {})
        derived = fundamentals.get('derived', {})
        
        # Get current metrics (these are point-in-time, not time series)
        # In production, you'd have historical fundamentals data
        
        pe = info.get('trailingPE') or derived.get('trailing_pe')
        pb = info.get('priceToBook') or derived.get('price_to_book')
        ps = info.get('priceToSalesTrailing12Months')
        
        earnings_yield = info.get('earningsYield') or (1/pe if pe and pe > 0 else None)
        
        # FCF yield
        fcf = info.get('freeCashflow')
        market_cap = info.get('marketCap')
        fcf_yield = (fcf / market_cap) if (fcf and market_cap and market_cap > 0) else None
        
        # Forward PE for implied growth
        forward_pe = info.get('forwardPE')
        
        # Set latest values (simplified - in production would be time series)
        if pe is not None:
            signals.iloc[-1, signals.columns.get_loc('earnings_yield')] = earnings_yield
        
        if fcf_yield is not None:
            signals.iloc[-1, signals.columns.get_loc('fcf_yield')] = fcf_yield
        
        # Compute implied growth rate from forward/trailing PE
        if pe and forward_pe and forward_pe < pe:
            implied_growth = (pe / forward_pe) - 1
            signals.iloc[-1, signals.columns.get_loc('implied_growth_rate')] = implied_growth
        
        # Load screener for sector comparison
        screener = self._get_screener_data()
        
        if screener is not None and ticker in screener['ticker'].values:
            ticker_data = screener[screener['ticker'] == ticker].iloc[0]
            sector = ticker_data.get('sector')
            
            if sector:
                sector_data = screener[screener['sector'] == sector]
                
                # PE vs sector median
                sector_pe_median = sector_data['pe_trailing'].median()
                if pe and sector_pe_median and sector_pe_median > 0:
                    signals.iloc[-1, signals.columns.get_loc('pe_vs_sector')] = (pe / sector_pe_median) - 1
                
                # PB vs sector median
                sector_pb_median = sector_data['pb_ratio'].median()
                if pb and sector_pb_median and sector_pb_median > 0:
                    signals.iloc[-1, signals.columns.get_loc('pb_vs_sector')] = (pb / sector_pb_median) - 1
        
        # Composite valuation gap (simplified)
        # Positive = undervalued, Negative = overvalued
        valuation_scores = []
        
        if not pd.isna(signals.iloc[-1]['pe_vs_sector']):
            valuation_scores.append(-signals.iloc[-1]['pe_vs_sector'])  # Lower PE = better
        
        if not pd.isna(signals.iloc[-1]['pb_vs_sector']):
            valuation_scores.append(-signals.iloc[-1]['pb_vs_sector'])  # Lower PB = better
        
        if fcf_yield:
            # FCF yield > 5% is attractive
            valuation_scores.append(fcf_yield - 0.05)
        
        if len(valuation_scores) > 0:
            signals.iloc[-1, signals.columns.get_loc('valuation_gap_z')] = np.mean(valuation_scores) * 2
        
        return signals.reset_index().rename(columns={'index': 'date'})
    
    def _get_screener_data(self) -> Optional[pd.DataFrame]:
        """Get cached screener data."""
        if self._screener_cache is None:
            self._screener_cache = load_screener_data()
        return self._screener_cache
    
    # =========================================================================
    # COMPOSITE SIGNAL GENERATION
    # =========================================================================
    
    def generate_all_signals(
        self,
        ticker: str,
        market: str,
        as_of_date: Optional[date] = None
    ) -> Optional[pd.DataFrame]:
        """
        Generate all signals for a ticker.
        
        Combines:
        - Price & volatility signals
        - Smart money signals
        - Derivatives signals
        - Valuation signals
        
        Args:
            ticker: Stock ticker
            market: Market code
            as_of_date: Generate signals up to this date
        
        Returns:
            DataFrame with all signals merged by date
        """
        logger.info(f"Generating signals for {ticker} ({market})")
        
        # Generate price signals first (primary time series)
        price_signals = self.generate_price_signals(ticker, market, as_of_date)
        
        if price_signals is None or len(price_signals) == 0:
            logger.warning(f"No price signals generated for {ticker}")
            return None
        
        price_dates = pd.DatetimeIndex(price_signals['date'])
        current_price = price_signals['close'].iloc[-1] if 'close' in price_signals.columns else None
        
        # If no close price, try to get from price signal columns
        if current_price is None:
            price_df = load_price_history(ticker, market)
            if price_df is not None:
                current_price = price_df['close'].iloc[-1]
        
        # Generate other signals
        smart_money_signals = self.generate_smart_money_signals(
            ticker, market, price_dates, as_of_date
        )
        
        derivatives_signals = self.generate_derivatives_signals(
            ticker, market, price_dates, current_price or 100, as_of_date
        )
        
        valuation_signals = self.generate_valuation_signals(
            ticker, market, price_dates, as_of_date
        )
        
        # Merge all signals
        all_signals = price_signals.copy()
        
        # Merge smart money signals
        if smart_money_signals is not None:
            merge_cols = [c for c in smart_money_signals.columns if c not in ['date', 'ticker', 'market']]
            all_signals = all_signals.merge(
                smart_money_signals[['date'] + merge_cols],
                on='date',
                how='left'
            )
        
        # Merge derivatives signals
        if derivatives_signals is not None:
            merge_cols = [c for c in derivatives_signals.columns if c not in ['date', 'ticker', 'market']]
            all_signals = all_signals.merge(
                derivatives_signals[['date'] + merge_cols],
                on='date',
                how='left'
            )
        
        # Merge valuation signals
        if valuation_signals is not None:
            merge_cols = [c for c in valuation_signals.columns if c not in ['date', 'ticker', 'market']]
            all_signals = all_signals.merge(
                valuation_signals[['date'] + merge_cols],
                on='date',
                how='left'
            )
        
        # Calculate data quality score
        all_signals['data_quality_score'] = self._calculate_data_quality(all_signals)
        
        logger.info(f"Generated {len(all_signals)} signal rows for {ticker}")
        
        return all_signals
    
    def _calculate_data_quality(self, signals: pd.DataFrame) -> pd.Series:
        """Calculate data quality score for each row."""
        # Count non-null signal columns
        signal_cols = [c for c in signals.columns if c not in ['date', 'ticker', 'market']]
        non_null_counts = signals[signal_cols].notna().sum(axis=1)
        quality = non_null_counts / len(signal_cols)
        return quality
    
    def save_signals(
        self,
        signals: pd.DataFrame,
        ticker: str,
        market: str
    ) -> str:
        """Save signals to parquet file."""
        output_dir = SIGNALS_OUTPUT_DIR / market
        output_dir.mkdir(parents=True, exist_ok=True)
        
        output_file = output_dir / f"{ticker}_signals.parquet"
        signals.to_parquet(output_file, index=False)
        
        logger.info(f"Saved signals to {output_file}")
        return str(output_file)


# =============================================================================
# BATCH SIGNAL GENERATION
# =============================================================================

def generate_signals_batch(
    tickers: List[str],
    market: str,
    as_of_date: Optional[date] = None,
    save: bool = True
) -> Dict[str, pd.DataFrame]:
    """
    Generate signals for multiple tickers.
    
    Args:
        tickers: List of ticker symbols
        market: Market code
        as_of_date: Generate signals up to this date
        save: Whether to save signals to disk
    
    Returns:
        Dict mapping ticker to signals DataFrame
    """
    factory = SignalFactory()
    results = {}
    
    for ticker in tickers:
        try:
            signals = factory.generate_all_signals(ticker, market, as_of_date)
            
            if signals is not None:
                results[ticker] = signals
                
                if save:
                    factory.save_signals(signals, ticker, market)
        
        except Exception as e:
            logger.error(f"Error generating signals for {ticker}: {e}")
    
    logger.info(f"Generated signals for {len(results)}/{len(tickers)} tickers")
    return results


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate market signals")
    parser.add_argument("--ticker", type=str, help="Single ticker to process")
    parser.add_argument("--market", type=str, default="US", help="Market code")
    parser.add_argument("--as-of", type=str, help="As-of date (YYYY-MM-DD)")
    
    args = parser.parse_args()
    
    as_of_date = datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else None
    
    factory = SignalFactory()
    
    if args.ticker:
        signals = factory.generate_all_signals(args.ticker, args.market, as_of_date)
        
        if signals is not None:
            print(f"\nGenerated {len(signals)} signal rows")
            print(f"\nColumns: {list(signals.columns)}")
            print(f"\nLatest signals:")
            print(signals.tail(1).T)
            
            factory.save_signals(signals, args.ticker, args.market)
    else:
        print("Please specify --ticker")

