"""Utility functions for resolving data paths.

R2 fallback (added as part of the git-storage migration, REPO_AUDIT_REPORT.md
§6/§7): FinSight/data/ is no longer committed to git. Locally during
development it may still be populated on disk (untouched, works exactly as
before). In production, it starts empty, and this module transparently
pulls each ticker's files from Cloudflare R2 into DATA_DIR on first request,
caching them locally so every subsequent request for that ticker is a plain
local read again — same behavior as before, just self-healing instead of
requiring a full local dataset up front.

If R2 env vars aren't set (e.g. local dev without a .env), this falls back
silently to the original local-only behavior — nothing breaks for anyone
not using R2.
"""
import logging
import os
from pathlib import Path
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

# Matches the markets the daily pipeline actually populates (see
# REPO_AUDIT_REPORT.md §1 — IN, US, UK, HK, CN, JP, AU, SG).
KNOWN_MARKETS = ["US", "IN", "UK", "HK", "CN", "JP", "AU", "SG"]

_R2_FILES = ["history.parquet", "minute_1m.parquet", "tech_indicators.parquet",
             "financials_full.json", "news.parquet", "news.json", "metadata.json"]


def _r2_enabled() -> bool:
    return bool(os.environ.get("R2_ACCESS_KEY_ID"))


# Ticker-suffix -> market map, used to order the R2 fallback walk so the
# right market is tried first instead of blindly sweeping all 8 in a fixed
# order (each miss is a real, if now-parallelized, network round-trip).
_SUFFIX_MARKET = {
    ".NS": "IN", ".BO": "IN", ".L": "UK", ".HK": "HK", ".T": "JP",
    ".AX": "AU", ".SI": "SG", ".SS": "CN", ".SZ": "CN",
}


def _guess_market(ticker: str) -> Optional[str]:
    for suffix, market in _SUFFIX_MARKET.items():
        if ticker.endswith(suffix):
            return market
    return "US" if "." not in ticker else None


def _try_populate_from_r2(ticker: str, market: str) -> Optional[Path]:
    """Download every known file for `ticker` from R2 into the local cache
    dir, if any exist there. Returns the local ticker dir if at least one
    file was found and cached, else None. Never raises — a miss here just
    means "not found," same as a local miss.

    Root-caused live (2026-08-22) as the reason the whole backend was going
    fully unresponsive (Render showing "live" while /api/health itself timed
    out) every few minutes after a restart: this ran from inside `async def`
    route handlers with no thread offloading, on a single uvicorn worker, so
    every blocking network call here stalled the ONE event loop thread for
    the entire process — nothing else, including the health check, could be
    served meanwhile. It fetched up to 7 files *sequentially*
    (connect_timeout=5s + read_timeout=10s + 2 retries each, per r2_client.py
    = ~30s worst case per file), and the caller can try this across up to 8
    markets sequentially too — worst case minutes of total-server freeze for
    a single not-yet-cached ticker. Render's free-tier local disk is wiped on
    every restart, so this hit constantly right after a restart, which then
    failed the health check, which triggered another restart, which wiped
    the cache again — a self-sustaining crash loop. Fetching the files in
    parallel bounds one market's worst case to ~one round-trip (~30s)
    instead of the sum of all of them (~210s).
    """
    if not _r2_enabled():
        return None
    try:
        from app.storage.r2_client import get_r2_client, ticker_data_key
    except Exception as e:  # noqa: BLE001 - boto3 not installed, etc.
        logger.debug("R2 client unavailable, skipping fallback: %s", e)
        return None

    client = get_r2_client()
    local_dir = settings.DATA_DIR / market / ticker
    fetched_any = False
    to_fetch = []
    for filename in _R2_FILES:
        local_path = local_dir / filename
        if local_path.exists():
            fetched_any = True
        else:
            to_fetch.append(filename)

    if to_fetch:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _fetch_one(filename: str):
            key = ticker_data_key(market, ticker, filename)
            local_path = local_dir / filename
            return filename, key, client.download_to_file(key, local_path)

        with ThreadPoolExecutor(max_workers=len(to_fetch)) as pool:
            futures = [pool.submit(_fetch_one, f) for f in to_fetch]
            for fut in as_completed(futures):
                try:
                    filename, key, ok = fut.result()
                except Exception as e:  # noqa: BLE001 - one bad file shouldn't sink the rest
                    logger.debug("R2 fetch failed for %s: %s", ticker, e)
                    continue
                if ok:
                    fetched_any = True
                    logger.info("R2 cache miss handled: %s -> %s", key, local_dir / filename)

    return local_dir if fetched_any else None


def get_ticker_dir(ticker: str, market: Optional[str] = None) -> Optional[Path]:
    """
    Resolve the directory for a ticker. Checks local disk first (unchanged
    behavior); falls back to R2 only if nothing is found locally.

    Args:
        ticker: Ticker symbol (e.g., 'AAPL', 'TCS.NS')
        market: Optional market hint (US, IN, HK, etc.)

    Returns:
        Path to ticker directory or None if not found
    """
    data_dir = settings.DATA_DIR

    # If market is provided, check that first
    if market:
        ticker_dir = data_dir / market / ticker
        if ticker_dir.exists():
            return ticker_dir

    # Otherwise, search all markets on local disk
    if data_dir.exists():
        for market_dir in data_dir.iterdir():
            if not market_dir.is_dir():
                continue
            ticker_dir = market_dir / ticker
            if ticker_dir.exists():
                return ticker_dir

    # Nothing local — try R2 (only does anything if R2 env vars are set).
    # Try the ticker-suffix-inferred market first (the common case, one
    # round-trip) instead of blindly sweeping all 8 markets in a fixed order.
    if market:
        markets_to_try = [market]
    else:
        guessed = _guess_market(ticker)
        markets_to_try = [guessed] + [m for m in KNOWN_MARKETS if m != guessed] if guessed else KNOWN_MARKETS
    for m in markets_to_try:
        result = _try_populate_from_r2(ticker, m)
        if result:
            return result

    return None


def get_paths_for_ticker(ticker: str, market: Optional[str] = None) -> dict:
    """
    Get all file paths for a ticker.
    
    Returns:
        dict with keys: history, minute, tech_indicators, financials, news, metadata
    """
    ticker_dir = get_ticker_dir(ticker, market)
    
    if not ticker_dir:
        return {
            "history": None,
            "minute": None,
            "tech_indicators": None,
            "financials": None,
            "news": None,
            "metadata": None,
        }
    
    return {
        "history": ticker_dir / "history.parquet",
        "minute": ticker_dir / "minute_1m.parquet",
        "tech_indicators": ticker_dir / "tech_indicators.parquet",
        "financials": ticker_dir / "financials_full.json",
        "news": ticker_dir / "news.parquet",  # Try parquet first
        "news_json": ticker_dir / "news.json",  # Fallback to JSON
        "metadata": ticker_dir / "metadata.json",
    }

