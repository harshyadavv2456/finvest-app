"""Screener metrics computation engine."""
import logging
from typing import Optional, Dict, Any
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


def safe_get(d: dict, *keys, default=None):
    """Safely get nested dict values."""
    for key in keys:
        if isinstance(d, dict):
            d = d.get(key)
        else:
            return default
        if d is None:
            return default
    return d


def compute_screener_row(
    ticker: str,
    daily_df: pd.DataFrame,
    tech_df: Optional[pd.DataFrame],
    fundamentals: dict,
    metadata: dict,
) -> dict:
    """
    Compute a flat dict of metrics for the screener table.
    
    Args:
        ticker: Ticker symbol
        daily_df: Daily OHLCV DataFrame
        tech_df: Technical indicators DataFrame
        fundamentals: Fundamentals dict from financials_full.json
        metadata: Metadata dict
    
    Returns:
        Dict with all screener metrics
    """
    # Get company name
    company_name = (
        safe_get(fundamentals, "info", "longName") or
        safe_get(fundamentals, "info", "shortName") or
        safe_get(fundamentals, "info", "name") or
        ticker
    )
    
    # Get currency based on market
    currency_map = {
        "IN": "INR",
        "US": "USD",
        "UK": "GBP",
        "JP": "JPY",
        "CN": "CNY",
        "SG": "SGD",
        "HK": "HKD",
    }
    default_currency = currency_map.get(metadata.get("market", ""), "USD")
    currency = safe_get(fundamentals, "info", "currency", default=default_currency)
    
    # Get industry and sector from fundamentals - try multiple sources with logging
    info = fundamentals.get("info", {}) if fundamentals else {}
    industry = None
    sector = None
    
    # Try all possible sources for sector (try sector first as it's more general)
    sector_candidates = [
        info.get("sector"),
        info.get("Sector"),
        info.get("sectorDisp"),
        info.get("sectorKey"),
        info.get("sectorClassification"),
        info.get("sectorInfo"),
        info.get("industryCategory"),  # some data sources misuse this
        safe_get(metadata, "sector"),
    ]
    
    for candidate in sector_candidates:
        if candidate and str(candidate).strip().lower() not in ["none", "null", "nan", "n/a", ""]:
            sector = str(candidate).strip()
            break
    
    # Try all possible sources for industry
    industry_candidates = [
        info.get("industry"),
        info.get("Industry"),
        info.get("industryDisp"),
        info.get("industryKey"),
        info.get("industryClassification"),
        info.get("industryInfo"),
        info.get("industryName"),
        safe_get(metadata, "industry"),
    ]
    
    for candidate in industry_candidates:
        if candidate and str(candidate).strip().lower() not in ["none", "null", "nan", "n/a", ""]:
            industry = str(candidate).strip()
            break
    
    # Final normalization
    if industry:
        industry = str(industry).strip()
        if industry == "" or industry.lower() in ["none", "null", "nan", "n/a", ""]:
            industry = None
    
    if sector:
        sector = str(sector).strip()
        if sector == "" or sector.lower() in ["none", "null", "nan", "n/a", ""]:
            sector = None
    
    # Log if still missing (for debugging) - but only once per ticker to avoid spam
    if not industry and not sector and ticker:
        available_keys = list(info.keys())[:20] if info else []
        logger.warning(f"No industry/sector found for {ticker}. Available info keys: {available_keys}")
        # Try to log a sample of what we're looking at
        if info:
            logger.warning(f"Sample info values: sector={info.get('sector')}, industry={info.get('industry')}, sectorDisp={info.get('sectorDisp')}, industryDisp={info.get('industryDisp')}")
    
    result = {
        "ticker": ticker,
        "market": metadata.get("market", "UNKNOWN"),
        "exchange_tz": metadata.get("exchange_tz", "UTC"),
        "currency": currency,
        "company_name": company_name,
        "industry": industry,
        "sector": sector,
    }
    
    # Price & Size
    if not daily_df.empty:
        # Use Adj Close for price calculations. Drop trailing NaN rows before
        # reading "current" - a freshly-fetched daily file can have its most
        # recent row incomplete (still-in-progress market session, or a
        # pipeline write that landed mid-update). `.tail(N).mean()`/`.max()`
        # elsewhere silently skip NaNs and look fine; `.iloc[-1]` on the raw
        # series does not - confirmed live (RELIANCE.NS showed sma20/50/200
        # and 52w high/low as real numbers but current_price/ret_1d as null,
        # right after a fresh market-data pipeline run). Real, systemic bug -
        # every return window and 52w-high/low-vs-current calc below shared
        # the same raw series, so this one `.dropna()` fixes all of them.
        price_col = "Adj Close" if "Adj Close" in daily_df.columns else "Close"
        clean_prices = daily_df[price_col].dropna()
        current_price = float(clean_prices.iloc[-1]) if len(clean_prices) > 0 else None
        result["current_price"] = current_price
        
        # Volume metrics
        if "Volume" in daily_df.columns:
            volume_latest = float(daily_df["Volume"].iloc[-1]) if len(daily_df) > 0 else None
            result["volume_latest"] = volume_latest
            
            # Average volumes
            if len(daily_df) >= 20:
                result["avg_volume_20d"] = float(daily_df["Volume"].tail(20).mean())
            else:
                result["avg_volume_20d"] = None
            
            if len(daily_df) >= 60:
                result["avg_volume_60d"] = float(daily_df["Volume"].tail(60).mean())
            else:
                result["avg_volume_60d"] = None
            
            # Volume spike
            if result.get("avg_volume_20d") and result.get("avg_volume_20d") > 0:
                result["volume_spike_20d"] = volume_latest / result["avg_volume_20d"] if volume_latest else None
            else:
                result["volume_spike_20d"] = None
        else:
            result["volume_latest"] = None
            result["avg_volume_20d"] = None
            result["avg_volume_60d"] = None
            result["volume_spike_20d"] = None
        
        # Returns (using Adj Close, NaN-tail-safe series from above)
        if len(clean_prices) >= 2:
            prices = clean_prices

            # 1 day return
            if len(prices) >= 2:
                result["ret_1d"] = float((prices.iloc[-1] / prices.iloc[-2] - 1) * 100)
            else:
                result["ret_1d"] = None
            
            # 1 week (~5 trading days)
            if len(prices) >= 6:
                result["ret_1w"] = float((prices.iloc[-1] / prices.iloc[-6] - 1) * 100)
            else:
                result["ret_1w"] = None
            
            # 1 month (~21 trading days)
            if len(prices) >= 22:
                result["ret_1m"] = float((prices.iloc[-1] / prices.iloc[-22] - 1) * 100)
            else:
                result["ret_1m"] = None
            
            # 3 months (~63 trading days)
            if len(prices) >= 64:
                result["ret_3m"] = float((prices.iloc[-1] / prices.iloc[-64] - 1) * 100)
            else:
                result["ret_3m"] = None
            
            # 6 months (~126 trading days)
            if len(prices) >= 127:
                result["ret_6m"] = float((prices.iloc[-1] / prices.iloc[-127] - 1) * 100)
            else:
                result["ret_6m"] = None
            
            # 1 year (~252 trading days)
            if len(prices) >= 253:
                result["ret_1y"] = float((prices.iloc[-1] / prices.iloc[-253] - 1) * 100)
            else:
                result["ret_1y"] = None
            
            # 52-week high/low
            if len(prices) >= 253:
                high_52w = float(prices.tail(253).max())
                low_52w = float(prices.tail(253).min())
                result["high_52w"] = high_52w
                result["low_52w"] = low_52w
                
                if current_price:
                    result["pct_from_52w_high"] = float((current_price / high_52w - 1) * 100)
                    result["pct_from_52w_low"] = float((current_price / low_52w - 1) * 100)
                else:
                    result["pct_from_52w_high"] = None
                    result["pct_from_52w_low"] = None
            else:
                result["high_52w"] = None
                result["low_52w"] = None
                result["pct_from_52w_high"] = None
                result["pct_from_52w_low"] = None
            
            # Volatility (annualized)
            returns = prices.pct_change().dropna()
            if len(returns) >= 20:
                result["vol_20d"] = float(returns.tail(20).std() * np.sqrt(252) * 100)
            else:
                result["vol_20d"] = None
            
            if len(returns) >= 60:
                result["vol_60d"] = float(returns.tail(60).std() * np.sqrt(252) * 100)
            else:
                result["vol_60d"] = None
        else:
            result["ret_1d"] = None
            result["ret_1w"] = None
            result["ret_1m"] = None
            result["ret_3m"] = None
            result["ret_6m"] = None
            result["ret_1y"] = None
            result["high_52w"] = None
            result["low_52w"] = None
            result["pct_from_52w_high"] = None
            result["pct_from_52w_low"] = None
            result["vol_20d"] = None
            result["vol_60d"] = None
    else:
        result["current_price"] = None
        result["volume_latest"] = None
        result["avg_volume_20d"] = None
        result["avg_volume_60d"] = None
        result["volume_spike_20d"] = None
        result["ret_1d"] = None
        result["ret_1w"] = None
        result["ret_1m"] = None
        result["ret_3m"] = None
        result["ret_6m"] = None
        result["ret_1y"] = None
        result["high_52w"] = None
        result["low_52w"] = None
        result["pct_from_52w_high"] = None
        result["pct_from_52w_low"] = None
        result["vol_20d"] = None
        result["vol_60d"] = None
    
    # Fundamentals - Market Cap & Shares
    info = fundamentals.get("info", {})
    fast_info = fundamentals.get("fast_info", {})
    derived = fundamentals.get("derived", {})
    
    result["market_cap"] = safe_get(fundamentals, "derived", "market_cap") or safe_get(info, "marketCap") or safe_get(fast_info, "marketCap")
    result["shares_outstanding_est"] = safe_get(fundamentals, "derived", "shares_outstanding_est") or safe_get(info, "sharesOutstanding")
    
    # Valuation
    result["pe_trailing"] = safe_get(fundamentals, "derived", "trailing_pe") or safe_get(info, "trailingPE")
    result["pe_forward"] = safe_get(fundamentals, "derived", "forward_pe") or safe_get(info, "forwardPE")
    result["pb_ratio"] = safe_get(fundamentals, "derived", "price_to_book") or safe_get(info, "priceToBook")
    result["price_to_sales"] = safe_get(info, "priceToSalesTrailing12Months")
    
    if result["pe_trailing"] and result["pe_trailing"] > 0:
        result["earnings_yield"] = 1.0 / result["pe_trailing"] * 100
    else:
        result["earnings_yield"] = None
    
    div_rate = safe_get(info, "dividendRate")
    price_for_dy = safe_get(info, "currentPrice") or safe_get(info, "regularMarketPrice") or safe_get(info, "previousClose")
    if div_rate and price_for_dy and float(price_for_dy) > 0:
        result["dividend_yield"] = (float(div_rate) / float(price_for_dy)) * 100
    else:
        raw_dy = safe_get(info, "dividendYield") or safe_get(fast_info, "dividendYield")
        if raw_dy is not None:
            raw_dy = float(raw_dy)
            trailing_dy = safe_get(info, "trailingAnnualDividendYield")
            if trailing_dy and float(trailing_dy) > 0:
                result["dividend_yield"] = float(trailing_dy) * 100
            elif raw_dy > 1.0:
                result["dividend_yield"] = raw_dy
            else:
                result["dividend_yield"] = raw_dy * 100
        else:
            result["dividend_yield"] = None
    
    if result["dividend_yield"] is not None:
        if result["dividend_yield"] < 0 or result["dividend_yield"] > 50:
            result["dividend_yield"] = None
    
    if result["pe_trailing"] is not None:
        if result["pe_trailing"] < 0 or result["pe_trailing"] > 500:
            # PE > 500 is extremely rare and likely a data error
            result["pe_trailing"] = None
    
    if result["pe_forward"] is not None:
        if result["pe_forward"] < 0 or result["pe_forward"] > 500:
            result["pe_forward"] = None
    
    # Quality metrics - set first, then do sanity checks
    result["roe"] = safe_get(fundamentals, "derived", "return_on_equity") or safe_get(info, "returnOnEquity")
    if result["roe"]:
        result["roe"] = float(result["roe"]) * 100
    
    result["roa"] = safe_get(fundamentals, "derived", "return_on_assets") or safe_get(info, "returnOnAssets")
    if result["roa"]:
        result["roa"] = float(result["roa"]) * 100
    
    result["profit_margin"] = safe_get(fundamentals, "derived", "profit_margins") or safe_get(info, "profitMargins")
    if result["profit_margin"]:
        result["profit_margin"] = float(result["profit_margin"]) * 100
    
    de_derived = safe_get(fundamentals, "derived", "debt_to_equity_est")
    de_yfinance = safe_get(info, "debtToEquity")
    if de_yfinance is not None:
        de_yfinance = float(de_yfinance) / 100.0  # yfinance returns percentage, convert to ratio
    result["debt_to_equity"] = de_derived or de_yfinance
    
    if result.get("roe") is not None:
        if abs(result["roe"]) > 200:
            result["roe"] = None
    
    if result.get("roa") is not None:
        if abs(result["roa"]) > 200:
            result["roa"] = None
    
    if result.get("debt_to_equity") is not None:
        if result["debt_to_equity"] < 0 or result["debt_to_equity"] > 50:
            result["debt_to_equity"] = None
    
    # Calculate ROCE (Return on Capital Employed)
    # ROCE = EBIT / (Total Assets - Current Liabilities)
    ebit = safe_get(info, "ebit") or safe_get(info, "operatingIncome")
    total_assets = safe_get(info, "totalAssets")
    current_liabilities = safe_get(info, "totalCurrentLiabilities")
    if ebit and total_assets and current_liabilities:
        capital_employed = total_assets - current_liabilities
        if capital_employed > 0:
            result["roce"] = (ebit / capital_employed) * 100
        else:
            result["roce"] = None
    else:
        result["roce"] = None
    
    # Calculate EPS Growth YOY from financials_full.json income statement
    result["eps_growth_yoy"] = None
    try:
        income_stmt = fundamentals.get("income_statement") or fundamentals.get("incomeStatement") or {}
        if isinstance(income_stmt, dict):
            # yfinance stores as dict of {date_str: {metric: value}}
            periods = sorted(income_stmt.keys(), reverse=True)
            if len(periods) >= 2:
                eps_recent = safe_get(income_stmt, periods[0], "Basic EPS") or safe_get(income_stmt, periods[0], "Diluted EPS")
                eps_prior = safe_get(income_stmt, periods[1], "Basic EPS") or safe_get(income_stmt, periods[1], "Diluted EPS")
                if eps_recent is not None and eps_prior is not None and eps_prior != 0:
                    result["eps_growth_yoy"] = round(((float(eps_recent) - float(eps_prior)) / abs(float(eps_prior))) * 100, 2)
        elif isinstance(income_stmt, list) and len(income_stmt) >= 2:
            eps_recent = income_stmt[0].get("basicEPS") or income_stmt[0].get("dilutedEPS")
            eps_prior = income_stmt[1].get("basicEPS") or income_stmt[1].get("dilutedEPS")
            if eps_recent is not None and eps_prior is not None and eps_prior != 0:
                result["eps_growth_yoy"] = round(((float(eps_recent) - float(eps_prior)) / abs(float(eps_prior))) * 100, 2)
    except Exception:
        pass
    
    # ── Enterprise Value & EV Ratios ──
    result["enterprise_value"] = safe_get(info, "enterpriseValue")
    result["ev_to_ebitda"] = safe_get(info, "enterpriseToEbitda")
    result["ev_to_revenue"] = safe_get(info, "enterpriseToRevenue")
    if result.get("ev_to_ebitda") is not None:
        if result["ev_to_ebitda"] < 0 or result["ev_to_ebitda"] > 200:
            result["ev_to_ebitda"] = None
    if result.get("ev_to_revenue") is not None:
        if result["ev_to_revenue"] < 0 or result["ev_to_revenue"] > 200:
            result["ev_to_revenue"] = None

    # ── PEG Ratio ──
    peg = safe_get(info, "trailingPegRatio") or safe_get(info, "pegRatio")
    if peg is not None:
        peg = float(peg)
        result["peg_ratio"] = peg if 0 < peg < 20 else None
    else:
        if result.get("pe_trailing") and result.get("eps_growth_yoy") and result["eps_growth_yoy"] > 5:
            computed_peg = round(result["pe_trailing"] / result["eps_growth_yoy"], 2)
            result["peg_ratio"] = computed_peg if 0 < computed_peg < 20 else None
        else:
            result["peg_ratio"] = None

    # ── Margins (yfinance returns decimal, convert to %) ──
    raw_gm = safe_get(info, "grossMargins")
    result["gross_margin"] = round(float(raw_gm) * 100, 2) if raw_gm is not None else None
    raw_om = safe_get(info, "operatingMargins")
    result["operating_margin"] = round(float(raw_om) * 100, 2) if raw_om is not None else None
    raw_em = safe_get(info, "ebitdaMargins")
    result["ebitda_margin"] = round(float(raw_em) * 100, 2) if raw_em is not None else None

    # ── Liquidity ──
    result["current_ratio"] = safe_get(info, "currentRatio")
    result["quick_ratio"] = safe_get(info, "quickRatio")

    # ── Cash Flow ──
    result["free_cash_flow"] = safe_get(info, "freeCashflow")
    result["operating_cash_flow"] = safe_get(info, "operatingCashflow")
    if result.get("free_cash_flow") and result.get("market_cap") and result["market_cap"] > 0:
        result["fcf_yield"] = round((result["free_cash_flow"] / result["market_cap"]) * 100, 2)
    else:
        result["fcf_yield"] = None

    # ── Growth (yfinance returns decimal, convert to %) ──
    raw_rg = safe_get(info, "revenueGrowth")
    result["revenue_growth"] = round(float(raw_rg) * 100, 2) if raw_rg is not None else None
    raw_eg = safe_get(info, "earningsGrowth")
    result["earnings_growth"] = round(float(raw_eg) * 100, 2) if raw_eg is not None else None
    raw_eqg = safe_get(info, "earningsQuarterlyGrowth")
    result["earnings_quarterly_growth"] = round(float(raw_eqg) * 100, 2) if raw_eqg is not None else None

    # ── Dividend extras ──
    raw_pr = safe_get(info, "payoutRatio")
    result["payout_ratio"] = round(float(raw_pr) * 100, 2) if raw_pr is not None else None

    # ── Risk & Ownership ──
    result["beta"] = safe_get(info, "beta")
    raw_ins = safe_get(info, "heldPercentInsiders")
    result["insider_holding"] = round(float(raw_ins) * 100, 2) if raw_ins is not None else None
    raw_inst = safe_get(info, "heldPercentInstitutions")
    result["institutional_holding"] = round(float(raw_inst) * 100, 2) if raw_inst is not None else None
    result["short_ratio"] = safe_get(info, "shortRatio")
    raw_spf = safe_get(info, "shortPercentOfFloat")
    result["short_pct_float"] = round(float(raw_spf) * 100, 2) if raw_spf is not None else None

    # ── Analyst ──
    result["analyst_target_mean"] = safe_get(info, "targetMeanPrice")
    result["analyst_rating"] = safe_get(info, "recommendationMean")
    result["num_analysts"] = safe_get(info, "numberOfAnalystOpinions")
    if result.get("analyst_target_mean") and result.get("current_price") and result["current_price"] > 0:
        result["analyst_upside"] = round(
            ((result["analyst_target_mean"] / result["current_price"]) - 1) * 100, 2
        )
        # Sanity bound, same philosophy as the PE/dividend-yield guards
        # above - found live: some GBp (LSE pence) tickers have a currency-
        # unit mismatch between current_price and analyst_target_mean
        # upstream (yfinance quirk, not something this function can
        # correct), producing nonsense like +11825% "upside" (CRH.L).
        # Reject rather than display an obviously-wrong number.
        if abs(result["analyst_upside"]) > 500:
            result["analyst_upside"] = None
    else:
        result["analyst_upside"] = None

    # ── Industry PE (placeholder, computed post-hoc in screener_snapshot) ──
    raw_ipe = safe_get(info, "industryPE") or safe_get(info, "sectorPE")
    result["industry_pe"] = float(raw_ipe) if raw_ipe is not None else None

    # Technical indicators
    if tech_df is not None and not tech_df.empty:
        # Get latest values
        latest_tech = tech_df.iloc[-1]
        
        result["sma20"] = float(latest_tech.get("SMA20")) if "SMA20" in latest_tech and pd.notna(latest_tech.get("SMA20")) else None
        result["sma50"] = float(latest_tech.get("SMA50")) if "SMA50" in latest_tech and pd.notna(latest_tech.get("SMA50")) else None
        result["sma200"] = float(latest_tech.get("SMA200")) if "SMA200" in latest_tech and pd.notna(latest_tech.get("SMA200")) else None
        
        # Try multiple possible RSI column names
        rsi_value = None
        for rsi_col in ["RSI14", "rsi14", "rsi_14", "RSI", "rsi"]:
            if rsi_col in latest_tech and pd.notna(latest_tech.get(rsi_col)):
                try:
                    rsi_value = float(latest_tech.get(rsi_col))
                    # Sanity check: RSI should be between 0 and 100
                    if 0 <= rsi_value <= 100:
                        break
                    else:
                        rsi_value = None
                except (ValueError, TypeError):
                    continue
        
        result["rsi14"] = rsi_value
        
        # If RSI is still None, try to compute it from daily data
        if result["rsi14"] is None and daily_df is not None and not daily_df.empty:
            try:
                # Use Adj Close or Close for RSI calculation
                price_col = "Adj Close" if "Adj Close" in daily_df.columns else "Close"
                if price_col in daily_df.columns and len(daily_df) >= 20:
                    prices = daily_df[price_col].values
                    # Compute RSI14 using Wilder's smoothing method
                    deltas = np.diff(prices)
                    gains = np.where(deltas > 0, deltas, 0)
                    losses = np.where(deltas < 0, -deltas, 0)
                    
                    # Initial average gain/loss (simple average of first 14 periods)
                    if len(gains) >= 14:
                        avg_gain = np.mean(gains[:14])
                        avg_loss = np.mean(losses[:14])
                        
                        # Wilder's smoothing for remaining periods
                        for i in range(14, len(gains)):
                            avg_gain = (avg_gain * 13 + gains[i]) / 14
                            avg_loss = (avg_loss * 13 + losses[i]) / 14
                        
                        # Calculate RSI
                        if avg_loss != 0:
                            rs = avg_gain / avg_loss
                            rsi = 100 - (100 / (1 + rs))
                            # Sanity check
                            if 0 <= rsi <= 100:
                                result["rsi14"] = float(rsi)
            except Exception as e:
                logger.debug(f"Could not compute RSI for {ticker}: {e}")
                pass
        
        # Price vs SMA relationships
        if result["current_price"] and result["sma50"]:
            result["price_above_sma50"] = result["current_price"] > result["sma50"]
        else:
            result["price_above_sma50"] = None
        
        if result["current_price"] and result["sma200"]:
            result["price_above_sma200"] = result["current_price"] > result["sma200"]
        else:
            result["price_above_sma200"] = None
        
        # Golden cross (SMA50 crossed above SMA200 in last 20 days)
        if "SMA50" in tech_df.columns and "SMA200" in tech_df.columns and len(tech_df) >= 20:
            recent_tech = tech_df.tail(20)
            sma50_vals = recent_tech["SMA50"].values
            sma200_vals = recent_tech["SMA200"].values
            
            # Check if SMA50 > SMA200 now and was <= before
            if len(sma50_vals) >= 2 and len(sma200_vals) >= 2:
                current_above = sma50_vals[-1] > sma200_vals[-1]
                prev_below = sma50_vals[-2] <= sma200_vals[-2]
                result["golden_cross_50_200"] = current_above and prev_below
            else:
                result["golden_cross_50_200"] = False
        else:
            result["golden_cross_50_200"] = False
    else:
        result["sma20"] = None
        result["sma50"] = None
        result["sma200"] = None
        result["rsi14"] = None
        result["price_above_sma50"] = None
        result["price_above_sma200"] = None
        result["golden_cross_50_200"] = False
    
    return result

