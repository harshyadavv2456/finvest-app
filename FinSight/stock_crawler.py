#!/usr/bin/env python3
"""
stock_crawler.py  (FinSight v2, robust + RSS news)

- Incremental daily & 1-minute data (yfinance)
- Correct timezone handling per exchange
- Technical indicators
- Fundamentals snapshot (info/fast_info + basic ratios)
- News via RSS feeds (Yahoo Finance + generic feeds) -> news.parquet
- Robust parquet handling (detect & fix corrupt files)
- Simple retry logic around yfinance calls

Usage:
    python stock_crawler.py
    python stock_crawler.py --tick AAPL
    python stock_crawler.py --tickers tickers.txt

Directory layout (relative to this script):
    data/<MARKET>/<TICKER>/
        history.parquet          # daily (index UTC, local_timestamp = exchange tz)
        minute_1m.parquet        # last ~7 days 1m (same convention)
        tech_indicators.parquet  # technicals from daily
        financials_full.json     # fundamentals + derived ratios
        news.parquet             # RSS-based news
        metadata.json            # ticker / tz / updated
"""

import argparse
import json
import logging
import random
import time
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
import yfinance as yf
import feedparser  # <-- RSS for news

# ----------------- CONFIG -----------------

BASE_DIR = Path(".")
DATA_DIR = BASE_DIR / "data"
TZ_CACHE_FILE = BASE_DIR / "tz_cache.json"

PARQUET_ENGINE = "pyarrow"
PARQUET_COMPRESSION = "snappy"

# yfinance / request retry
MAX_RETRIES = 3
RETRY_SLEEP_BASE = 2.0  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger("FinSightCrawler")

# ------- Ticker suffix → timezone / market hints -------

SUFFIX_TZ_MAP = {
    ".NS": "Asia/Kolkata",
    ".BOM": "Asia/Kolkata",
    ".BO": "Asia/Kolkata",
    ".L": "Europe/London",
    ".TO": "America/Toronto",
    ".AX": "Australia/Sydney",
    ".HK": "Asia/Hong_Kong",
    ".SS": "Asia/Shanghai",
    ".SZ": "Asia/Shanghai",
    ".T": "Asia/Tokyo",           # Japan (Tokyo Stock Exchange)
    ".SI": "Asia/Singapore",      # Singapore (SGX)
}

SUFFIX_MARKET_MAP = {
    ".NS": "IN",
    ".BOM": "IN",
    ".BO": "IN",
    ".L": "UK",
    ".TO": "CA",
    ".AX": "AU",
    ".HK": "HK",
    ".SS": "CN",
    ".SZ": "CN",
    ".T": "JP",                   # Japan
    ".SI": "SG",                  # Singapore
}

# RSS feeds for news (stock-specific only)
RSS_FEEDS = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US",
]

# ----------------- TZ CACHE -----------------


def _load_tz_cache() -> Dict[str, str]:
    if TZ_CACHE_FILE.exists():
        try:
            return json.loads(TZ_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_tz_cache(cache: Dict[str, str]) -> None:
    TZ_CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


_TZ_CACHE = _load_tz_cache()


def determine_exchange_tz(ticker: str) -> str:
    """
    Decide the exchange timezone for a ticker.
    Priority:
      1) cache
      2) suffix map
      3) yfinance metadata (exchangeTimezoneName / timezone / timeZone)
      4) fallback US for plain tickers, UTC otherwise
    """
    key = ticker.upper()
    if key in _TZ_CACHE:
        return _TZ_CACHE[key]

    # explicit suffix
    for suf, tz in SUFFIX_TZ_MAP.items():
        if key.endswith(suf):
            _TZ_CACHE[key] = tz
            _save_tz_cache(_TZ_CACHE)
            return tz

    # yfinance metadata
    try:
        t = yf.Ticker(ticker)
        info = getattr(t, "info", {}) or {}
        tzname = (
            info.get("exchangeTimezoneName")
            or info.get("timezone")
            or info.get("timeZone")
        )
        if tzname:
            try:
                ZoneInfo(tzname)
                _TZ_CACHE[key] = tzname
                _save_tz_cache(_TZ_CACHE)
                return tzname
            except Exception:
                # basic mapping of abbreviations if any
                abbr_map = {
                    "EST": "America/New_York",
                    "EDT": "America/New_York",
                }
                ab = tzname.upper()
                if ab in abbr_map:
                    _TZ_CACHE[key] = abbr_map[ab]
                    _save_tz_cache(_TZ_CACHE)
                    return abbr_map[ab]
    except Exception:
        pass

    # fallback
    if "." not in key:
        tz = "America/New_York"
    else:
        tz = "UTC"
    _TZ_CACHE[key] = tz
    _save_tz_cache(_TZ_CACHE)
    return tz


def infer_market_bucket(ticker: str, tz: str) -> str:
    t = ticker.upper()
    for suf, m in SUFFIX_MARKET_MAP.items():
        if t.endswith(suf):
            return m
    # fallback from tz
    if tz.startswith("Asia/Kolkata"):
        return "IN"
    if tz.startswith("America/New_York"):
        return "US"
    if tz.startswith("Europe/London"):
        return "UK"
    if tz.startswith("Asia/Tokyo"):
        return "JP"
    if tz.startswith("Asia/Singapore"):
        return "SG"
    if tz.startswith("Asia/Hong_Kong"):
        return "HK"
    if tz.startswith("Asia/Shanghai"):
        return "CN"
    return "OTHER"


# ----------------- RATE LIMITER -----------------


class RateLimiter:
    def __init__(self, base_delay: float = 0.8, jitter: float = 0.3):
        self.base_delay = base_delay
        self.jitter = jitter
        self._last = 0.0

    def wait(self) -> None:
        delay = self.base_delay * random.uniform(1 - self.jitter, 1 + self.jitter)
        now = time.time()
        elapsed = now - self._last
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self._last = time.time()


# ----------------- PARQUET HELPERS -----------------


def write_parquet_atomic(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.parquet")
    df.to_parquet(
        tmp,
        engine=PARQUET_ENGINE,
        compression=PARQUET_COMPRESSION,
    )
    tmp.replace(path)


def is_parquet_corrupt(path: Path) -> bool:
    try:
        if not path.exists():
            return False
        if path.stat().st_size < 8:  # less than magic/footer size
            return True
        # quick sanity read
        _ = pd.read_parquet(path)
        return False
    except Exception:
        return True


def safe_read_parquet(path: Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    if is_parquet_corrupt(path):
        backup = path.with_suffix(
            path.suffix + ".CORRUPTED_" + datetime.utcnow().strftime("%Y%m%d%H%M%S")
        )
        try:
            path.replace(backup)
            logger.warning("Quarantined corrupt parquet to %s", backup)
        except Exception:
            logger.warning("Failed to move corrupt parquet %s", path)
        return None
    try:
        return pd.read_parquet(path)
    except Exception as e:
        logger.error("read_parquet failed for %s: %s", path, e)
        return None


def merge_parquet(path: Path, new_df: pd.DataFrame) -> None:
    """
    Merge new_df into path; index is assumed tz-aware UTC (we enforce below).
    """
    if new_df is None or new_df.empty:
        return

    # enforce index tz-aware UTC for new_df
    idx = pd.to_datetime(new_df.index)
    if getattr(idx, "tz", None) is None:
        idx = idx.tz_localize("UTC")
    else:
        idx = idx.tz_convert("UTC")
    new_df = new_df.copy()
    new_df.index = idx

    old = safe_read_parquet(path)
    if old is None or old.empty:
        write_parquet_atomic(new_df, path)
        return

    old_idx = pd.to_datetime(old.index)
    if getattr(old_idx, "tz", None) is None:
        old_idx = old_idx.tz_localize("UTC")
    else:
        old_idx = old_idx.tz_convert("UTC")
    old.index = old_idx

    combined = pd.concat([old, new_df])
    combined = combined[~combined.index.duplicated(keep="last")]
    combined = combined.sort_index()
    write_parquet_atomic(combined, path)


# ----------------- TZ NORMALISATION -----------------


def normalize_ohlc_df(df: pd.DataFrame, tz_str: str) -> pd.DataFrame:
    """
    Generic normalizer for daily and 1m:
      - local_timestamp: exchange-local tz-aware
      - index: UTC tz-aware
    """
    if df is None or df.empty:
        return df

    try:
        exch_tz = ZoneInfo(tz_str)
    except Exception:
        exch_tz = ZoneInfo("UTC")

    idx = pd.to_datetime(df.index, errors="coerce")

    # naive => assume local exchange time
    if getattr(idx, "tz", None) is None:
        local_idx = idx.tz_localize(exch_tz)
    else:
        local_idx = idx.tz_convert(exch_tz)

    utc_index = local_idx.tz_convert("UTC")

    out = df.copy()
    # local_timestamp col (exchange tz)
    if "local_timestamp" in out.columns:
        out = out.drop(columns=["local_timestamp"])
    out.insert(0, "local_timestamp", pd.Series(local_idx, index=out.index))

    out.index = utc_index
    return out


# ----------------- YFINANCE WRAPPER -----------------


class StockFetcher:
    def __init__(self, rl: RateLimiter):
        self.rl = rl

    def _retry_call(self, func, *args, **kwargs):
        last_err = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                self.rl.wait()
                return func(*args, **kwargs)
            except Exception as e:
                last_err = e
                logger.warning(
                    "Retry %d/%d for %s failed: %s",
                    attempt,
                    MAX_RETRIES,
                    func.__name__,
                    e,
                )
                time.sleep(RETRY_SLEEP_BASE * attempt)
        raise last_err  # type: ignore[misc]

    def fetch_history(
        self,
        ticker: str,
        start: Optional[datetime],
        end: datetime,
        interval: str,
    ) -> Optional[pd.DataFrame]:
        """
        Wrapper around yfinance.Ticker.history with retries.
        """

        def _call():
            t = yf.Ticker(ticker)
            return t.history(
                start=start,
                end=end,
                interval=interval,
                auto_adjust=False,
                actions=(interval == "1d"),
            )

        try:
            df = self._retry_call(_call)
        except Exception as e:
            logger.error("history(%s, %s) failed: %s", ticker, interval, e)
            return None

        if df is None or df.empty:
            return None

        if "Adj Close" not in df.columns and "Close" in df.columns:
            df["Adj Close"] = df["Close"]
        return df

    def fetch_fundamentals(self, ticker: str) -> Dict[str, Any]:
        """
        Pull whatever cheap data we can from yahoo:
          - info, fast_info, balance_sheet, financials, cashflow
          - derive a few ratios from LTM if possible
        """
        out: Dict[str, Any] = {"ticker": ticker, "source": "yfinance"}
        t = yf.Ticker(ticker)

        # info / fast_info
        try:
            info = t.info or {}
        except Exception as e:
            logger.warning("[%s] info failed: %s", ticker, e)
            info = {}
        try:
            fast = t.fast_info or {}
        except Exception as e:
            logger.warning("[%s] fast_info failed: %s", ticker, e)
            fast = {}

        out["info"] = info
        out["fast_info"] = dict(fast)

        # statements
        def _df_to_dict(df: Optional[pd.DataFrame]) -> Dict[str, Dict[str, float]]:
            if df is None or df.empty:
                return {}
            dd: Dict[str, Dict[str, float]] = {}
            for col in df.columns:
                series = df[col]
                dd[str(col)] = {
                    str(idx): float(val)
                    for idx, val in series.items()
                    if pd.notna(val)
                }
            return dd

        try:
            bs = t.balance_sheet
        except Exception as e:
            logger.warning("[%s] balance_sheet failed: %s", ticker, e)
            bs = None
        try:
            inc = t.financials
        except Exception as e:
            logger.warning("[%s] financials failed: %s", ticker, e)
            inc = None
        try:
            cf = t.cashflow
        except Exception as e:
            logger.warning("[%s] cashflow failed: %s", ticker, e)
            cf = None

        out["balance_sheet"] = _df_to_dict(bs)
        out["income_statement"] = _df_to_dict(inc)
        out["cashflow_statement"] = _df_to_dict(cf)

        # derived ratios (best-effort)
        try:
            price = (
                fast.get("last_price")
                or info.get("currentPrice")
                or info.get("regularMarketPrice")
            )
            market_cap = fast.get("market_cap") or info.get("marketCap")
            shares_out = info.get("sharesOutstanding") or (
                market_cap / price if market_cap and price else None
            )
            total_debt = info.get("totalDebt")
            total_assets = info.get("totalAssets")
            total_equity = None
            if isinstance(bs, pd.DataFrame) and not bs.empty:
                # equity ~ total assets - total liabilities
                try:
                    total_liab = bs.loc["Total Liab"].iloc[0]
                    total_assets_bs = bs.loc["Total Assets"].iloc[0]
                    total_equity = float(total_assets_bs - total_liab)
                except Exception:
                    pass

            # simplest EPS from trailing PE: EPS = price / PE
            pe = info.get("trailingPE") or info.get("forwardPE")
            eps = None
            if price and pe:
                try:
                    eps = float(price) / float(pe)
                except Exception:
                    pass

            debt_to_equity = (
                float(total_debt) / float(total_equity)
                if total_debt and total_equity and total_equity != 0
                else None
            )

            out["derived"] = {
                "price": price,
                "market_cap": market_cap,
                "shares_outstanding_est": shares_out,
                "eps_est": eps,
                "debt_to_equity_est": debt_to_equity,
                "trailing_pe": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "price_to_book": info.get("priceToBook"),
                "return_on_equity": info.get("returnOnEquity"),
                "return_on_assets": info.get("returnOnAssets"),
                "profit_margins": info.get("profitMargins"),
            }
        except Exception as e:
            logger.warning("[%s] derived ratio calc failed: %s", ticker, e)

        return out

    def fetch_news_yfinance(self, ticker: str) -> pd.DataFrame:
        """
        Fetch stock-specific news from yfinance.
        Returns DataFrame with same structure as RSS news.
        """
        try:
            t = yf.Ticker(ticker)
            news_list = t.news or []
            
            if not news_list:
                return pd.DataFrame()
            
            out = []
            for item in news_list:
                try:
                    # Handle nested content structure (new yfinance format)
                    content = item.get("content", {})
                    if not content:
                        content = item  # fallback to flat structure
                    
                    # Parse timestamp
                    ts = None
                    if "providerPublishTime" in item:
                        ts = pd.to_datetime(item["providerPublishTime"], unit="s", utc=True)
                    elif "pubDate" in content:
                        ts = pd.to_datetime(content["pubDate"], utc=True)
                    elif "displayTime" in content:
                        ts = pd.to_datetime(content["displayTime"], utc=True)
                    elif "pubDate" in item:
                        ts = pd.to_datetime(item["pubDate"], utc=True)
                    else:
                        ts = pd.Timestamp.utcnow()
                    
                    # Ensure timezone-aware
                    if getattr(ts, "tz", None) is None:
                        ts = ts.tz_localize("UTC")
                    else:
                        ts = ts.tz_convert("UTC")
                    
                    # Extract title, summary, link
                    title = content.get("title", "") or item.get("title", "") or ""
                    summary = content.get("summary", "") or content.get("description", "") or item.get("summary", "") or ""
                    
                    # Build link - yfinance news items typically have id that can be used
                    link = content.get("link", "") or item.get("link", "") or ""
                    if not link and content.get("id"):
                        # Construct Yahoo Finance news URL if possible
                        link = f"https://finance.yahoo.com/news/{content.get('id', '')}"
                    
                    out.append({
                        "timestamp": ts,
                        "title": title,
                        "summary": summary,
                        "link": link,
                        "source": "yfinance",
                    })
                except Exception as e:
                    logger.warning("[%s] Error parsing yfinance news item: %s", ticker, e)
                    continue
            
            if not out:
                return pd.DataFrame()
            
            df = pd.DataFrame(out)
            if "timestamp" in df.columns:
                df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
            return df
            
        except Exception as e:
            logger.warning("[%s] yfinance news fetch failed: %s", ticker, e)
            return pd.DataFrame()


# ----------------- RSS NEWS FETCHER (old logic) -----------------


class NewsFetcher:
    def __init__(self, rl: RateLimiter):
        self.rl = rl

    def fetch_rss(self, url: str) -> pd.DataFrame:
        try:
            feed = feedparser.parse(url)
            out = []
            for e in feed.entries:
                ts = None
                if hasattr(e, "published") and e.published:
                    try:
                        ts = pd.to_datetime(e.published, utc=True)
                    except Exception:
                        try:
                            ts = pd.to_datetime(e.published, errors="coerce")
                            if getattr(ts, "tz", None) is None:
                                ts = ts.tz_localize("UTC")
                            else:
                                ts = ts.tz_convert("UTC")
                        except Exception:
                            ts = pd.Timestamp.utcnow().tz_localize("UTC")
                else:
                    ts = pd.Timestamp.utcnow().tz_localize("UTC")

                out.append(
                    {
                        "timestamp": ts,
                        "title": getattr(e, "title", "") or "",
                        "summary": getattr(e, "summary", "") or "",
                        "link": getattr(e, "link", "") or "",
                        "source": url,
                    }
                )
            if not out:
                return pd.DataFrame()
            df = pd.DataFrame(out)
            if "timestamp" in df.columns:
                try:
                    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
                except Exception:
                    df["timestamp"] = (
                        pd.to_datetime(df["timestamp"], errors="coerce")
                        .fillna(pd.Timestamp.utcnow())
                        .tz_localize("UTC")
                    )
            return df
        except Exception as e:
            logger.warning("RSS error %s: %s", url, e)
            return pd.DataFrame()

    def fetch_news(self, ticker: str, market_tz: str, fetcher: StockFetcher) -> pd.DataFrame:
        """
        Fetch stock-specific news from multiple sources:
        1. yfinance (primary, stock-specific)
        2. Yahoo Finance RSS (stock-specific)
        """
        dfs: List[pd.DataFrame] = []
        
        # 1. Fetch from yfinance (stock-specific)
        self.rl.wait()
        try:
            yf_news = fetcher.fetch_news_yfinance(ticker)
            if yf_news is not None and not yf_news.empty:
                dfs.append(yf_news)
                logger.info("[%s] Fetched %d articles from yfinance", ticker, len(yf_news))
        except Exception as e:
            logger.warning("[%s] yfinance news fetch error: %s", ticker, e)
        
        # 2. Fetch from Yahoo Finance RSS (stock-specific)
        self.rl.wait()
        for tmpl in RSS_FEEDS:
            try:
                url = tmpl.format(ticker=ticker)
                df = self.fetch_rss(url)
                if df is not None and not df.empty:
                    dfs.append(df)
                    logger.info("[%s] Fetched %d articles from RSS: %s", ticker, len(df), url)
            except Exception as e:
                logger.warning("[%s] RSS fetch error for %s: %s", ticker, url, e)

        if not dfs:
            return pd.DataFrame()

        new_df = pd.concat(dfs, ignore_index=True)

        if new_df.empty:
            return new_df

        # local_timestamp
        if "timestamp" in new_df.columns:
            try:
                new_df["timestamp"] = pd.to_datetime(new_df["timestamp"], utc=True)
            except Exception:
                new_df["timestamp"] = (
                    pd.to_datetime(new_df["timestamp"], errors="coerce")
                    .fillna(pd.Timestamp.utcnow())
                    .tz_localize("UTC")
                )

            try:
                tz = ZoneInfo(market_tz)
            except Exception:
                tz = ZoneInfo("UTC")

            new_df["local_timestamp"] = new_df["timestamp"].dt.tz_convert(tz)

        # tag ticker explicitly
        new_df["ticker"] = ticker
        return new_df


# ----------------- TECHNICALS -----------------


def compute_technicals(daily_df: Optional[pd.DataFrame]) -> pd.DataFrame:
    if daily_df is None or daily_df.empty:
        return pd.DataFrame()

    df = daily_df.copy()
    if "Adj Close" not in df.columns and "Close" in df.columns:
        df["Adj Close"] = df["Close"]

    p = df["Adj Close"].astype(float)

    out = pd.DataFrame(index=df.index)
    out["sma20"] = p.rolling(20).mean()
    out["sma50"] = p.rolling(50).mean()
    out["sma200"] = p.rolling(200).mean()

    out["ema20"] = p.ewm(span=20, adjust=False).mean()
    out["ema50"] = p.ewm(span=50, adjust=False).mean()

    # RSI 14
    delta = p.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(span=14, adjust=False).mean()
    roll_down = down.ewm(span=14, adjust=False).mean()
    rs = roll_up / roll_down.replace(0, np.nan)
    out["rsi14"] = 100 - (100 / (1 + rs))

    # simple returns
    out["ret_1d"] = p.pct_change(1)
    out["ret_5d"] = p.pct_change(5)
    out["ret_20d"] = p.pct_change(20)
    out["ret_60d"] = p.pct_change(60)
    out["ret_252d"] = p.pct_change(252)

    for c in out.columns:
        if pd.api.types.is_float_dtype(out[c]):
            out[c] = out[c].astype("float32")

    return out


# ----------------- PER-TICKER PIPELINE -----------------


def process_ticker(ticker: str, fetcher: StockFetcher) -> None:
    t_upper = ticker.upper()
    exch_tz_str = determine_exchange_tz(ticker)
    try:
        exch_tz = ZoneInfo(exch_tz_str)
    except Exception:
        exch_tz = ZoneInfo("UTC")
    market = infer_market_bucket(t_upper, exch_tz_str)

    safe_name = t_upper.replace("/", "_").replace("^", "_")
    base = DATA_DIR / market / safe_name
    base.mkdir(parents=True, exist_ok=True)

    logger.info("[%s] Timezone: %s", ticker, exch_tz_str)

    now_utc = datetime.now(ZoneInfo("UTC"))

    # ---------- DAILY ----------
    daily_path = base / "history.parquet"

    # determine start date from existing file if valid
    start: Optional[datetime] = None
    old_daily = safe_read_parquet(daily_path)
    if old_daily is not None and not old_daily.empty:
        try:
            last_idx = pd.to_datetime(old_daily.index.max())
            if getattr(last_idx, "tz", None) is None:
                last_idx = last_idx.tz_localize("UTC")
            last_local = last_idx.tz_convert(exch_tz)
            # start = next local day at midnight
            next_local = last_local + timedelta(days=1)
            next_local = next_local.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            start = next_local.tz_convert("UTC").replace(tzinfo=None)
        except Exception:
            start = (now_utc - timedelta(days=3650)).replace(tzinfo=None)
    else:
        # 10 years back
        start = (now_utc - timedelta(days=3650)).replace(tzinfo=None)

    daily_raw = fetcher.fetch_history(
        ticker=ticker,
        start=start,
        end=now_utc.replace(tzinfo=None),
        interval="1d",
    )
    if daily_raw is not None and not daily_raw.empty:
        daily_norm = normalize_ohlc_df(daily_raw, exch_tz_str)
        merge_parquet(daily_path, daily_norm)
        logger.info("  ✓ Daily data updated")
    else:
        logger.info("  • No new daily data")

    # robust load daily after update
    daily_df = safe_read_parquet(daily_path)
    if daily_df is None or daily_df.empty:
        # last resort: full refetch
        logger.warning(
            "  ! Daily parquet invalid/missing for %s. Rebuilding from scratch.",
            ticker,
        )
        full_raw = fetcher.fetch_history(
            ticker=ticker,
            start=(now_utc - timedelta(days=3650)).replace(tzinfo=None),
            end=now_utc.replace(tzinfo=None),
            interval="1d",
        )
        if full_raw is None or full_raw.empty:
            logger.error(
                "  ✗ Could not rebuild daily data for %s, skipping further steps.",
                ticker,
            )
            return
        full_norm = normalize_ohlc_df(full_raw, exch_tz_str)
        write_parquet_atomic(full_norm, daily_path)
        daily_df = full_norm
        logger.info("  ✓ Daily data rebuilt from scratch")

    # ---------- MINUTE ----------
    minute_path = base / "minute_1m.parquet"
    minute_raw = fetcher.fetch_history(
        ticker=ticker,
        start=(now_utc - timedelta(days=7)).replace(tzinfo=None),
        end=now_utc.replace(tzinfo=None),
        interval="1m",
    )
    if minute_raw is not None and not minute_raw.empty:
        minute_norm = normalize_ohlc_df(minute_raw, exch_tz_str)
        merge_parquet(minute_path, minute_norm)
        logger.info("  ✓ Minute data updated with correct timezone")
    else:
        logger.info("  • No minute data (yfinance limit / illiquid)")

    # ---------- TECHNICALS ----------
    try:
        tech = compute_technicals(daily_df)
        if tech is not None and not tech.empty:
            tech_path = base / "tech_indicators.parquet"
            write_parquet_atomic(tech, tech_path)
            logger.info("  ✓ Technical indicators updated")
        else:
            logger.info("  • Technical indicators empty (insufficient history)")
    except Exception as e:
        logger.warning("  ✗ Technicals failed for %s: %s", ticker, e)

    # ---------- FUNDAMENTALS ----------
    try:
        fundamentals = fetcher.fetch_fundamentals(ticker)
        fin_path = base / "financials_full.json"
        fin_path.write_text(json.dumps(fundamentals, indent=2), encoding="utf-8")
        logger.info("  ✓ Financials updated")
    except Exception as e:
        logger.warning("  ✗ Financials failed for %s: %s", ticker, e)

    # ---------- NEWS (YFINANCE + STOCK-SPECIFIC RSS) ----------
    news_path = base / "news.parquet"
    news_fetcher = NewsFetcher(RateLimiter())

    try:
        news_new = news_fetcher.fetch_news(ticker, exch_tz_str, fetcher)
        if news_new is not None and not news_new.empty:
            old_news = pd.DataFrame()
            if news_path.exists():
                try:
                    old_news = pd.read_parquet(news_path)
                except Exception:
                    old_news = pd.DataFrame()

            combined_news = pd.concat([old_news, news_new], ignore_index=True)

            # dedupe by link if present, else by (title, timestamp)
            if "link" in combined_news.columns:
                combined_news = combined_news.drop_duplicates(subset=["link"])
            else:
                combined_news = combined_news.drop_duplicates(
                    subset=["title", "timestamp"]
                )

            if "timestamp" in combined_news.columns:
                combined_news = combined_news.sort_values("timestamp")

            combined_news.to_parquet(
                news_path, index=False, engine=PARQUET_ENGINE, compression=PARQUET_COMPRESSION
            )
            logger.info("  ✓ News updated (%d articles)", len(combined_news))
        else:
            logger.info("  • No news fetched")
    except Exception as e:
        logger.warning("  ✗ News failed for %s: %s", ticker, e)

    # ---------- METADATA & SUMMARY ----------
    try:
        hrows = len(daily_df) if daily_df is not None else 0
        m_df = safe_read_parquet(minute_path)
        mrows = len(m_df) if m_df is not None else 0
    except Exception:
        hrows = mrows = 0

    nrows = 0
    try:
        if news_path.exists():
            n_df = pd.read_parquet(news_path)
            nrows = len(n_df)
    except Exception:
        nrows = 0

    meta = {
        "ticker": t_upper,
        "market": market,
        "exchange_tz": exch_tz_str,
        "updated_utc": now_utc.isoformat(),
        "daily_rows": hrows,
        "minute_rows": mrows,
        "news_rows": nrows,
    }
    (base / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    logger.info(
        "[%s] Complete — Daily: %s, Minute: %s, News: %s",
        ticker,
        hrows,
        mrows,
        nrows,
    )


# ----------------- CLI -----------------


def load_tickers(tickers_arg: Optional[str], tick_arg: Optional[str]) -> List[str]:
    if tick_arg:
        return [tick_arg.strip()]
    path = Path(tickers_arg or "tickers.txt")
    if not path.exists():
        logger.error("Tickers file not found: %s", path)
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    out: List[str] = []
    for l in lines:
        s = l.strip()
        if not s or s.startswith("#"):
            continue
        out.append(s)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tick", type=str, default=None, help="Single ticker to crawl")
    parser.add_argument(
        "--tickers", type=str, default="tickers.txt", help="Path to tickers file"
    )
    parser.add_argument(
        "--no-screener", action="store_true", help="Skip auto-rebuild of screener snapshot"
    )
    args = parser.parse_args()

    tickers = load_tickers(args.tickers, args.tick)
    if not tickers:
        logger.error("No tickers to process.")
        return

    logger.info("Processing %d ticker(s)...", len(tickers))

    rl = RateLimiter()
    fetcher = StockFetcher(rl)

    for t in tickers:
        try:
            process_ticker(t, fetcher)
        except Exception as e:
            logger.error("UNHANDLED error for %s: %s", t, e)

    # Auto-rebuild screener snapshot after all tickers are updated
    if not args.no_screener:
        logger.info("=" * 60)
        logger.info("All tickers processed. Rebuilding screener snapshot...")
        logger.info("=" * 60)
        try:
            import sys
            from pathlib import Path
            # Add backend to path
            repo_root = Path(__file__).parent.resolve()
            backend_path = repo_root / "backend"
            if backend_path.exists():
                sys.path.insert(0, str(backend_path))
            
            # Force reload config to ensure correct data directory
            if 'app.config' in sys.modules:
                del sys.modules['app.config']
            if 'backend.app.config' in sys.modules:
                del sys.modules['backend.app.config']
            
            from app.screener_snapshot import build_screener_snapshot
            from app.config import settings
            
            logger.info(f"Building screener snapshot...")
            logger.info(f"Data directory: {settings.DATA_DIR} (exists: {settings.DATA_DIR.exists()})")
            
            df = build_screener_snapshot()
            logger.info("=" * 60)
            logger.info(f"SUCCESS: Screener snapshot rebuilt with {len(df)} tickers")
            logger.info(f"Saved to: {settings.SCREENER_SNAPSHOT_PATH}")
            logger.info("=" * 60)
        except Exception as e:
            logger.error(f"Failed to rebuild screener snapshot: {e}", exc_info=True)
            import traceback
            logger.error(traceback.format_exc())
            logger.warning("You can manually rebuild by running: cd backend && python -m app.screener_snapshot")

    logger.info("All done!")


if __name__ == "__main__":
    main()
