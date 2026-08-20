"""Data access layer for reading local parquet and JSON files."""
import json
import logging
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
import pandas as pd
from app.config import settings
from app.utils.paths import get_paths_for_ticker, get_ticker_dir
from app.utils.time_utils import ensure_utc_index

logger = logging.getLogger(__name__)

# In-process cache for the R2 manifest fallback (see _list_tickers_from_r2) -
# it's one file but no need to re-fetch it on every request.
_R2_MANIFEST_CACHE: Optional[List[Dict[str, Any]]] = None


def _list_tickers_from_r2() -> List[Dict[str, Any]]:
    """Fallback for when FinSight/data/ isn't on local disk at all (e.g.
    Render, where the repo no longer ships data/ - see REPO_AUDIT_REPORT.md
    §6/§7). Reads the single manifest object uploaded by
    scripts/upload_tickers_manifest.py instead of walking a local dir that
    doesn't exist. Cached per-process; never raises - a miss here just
    means an empty ticker list, same as the old local-only behavior."""
    global _R2_MANIFEST_CACHE
    if _R2_MANIFEST_CACHE is not None:
        return _R2_MANIFEST_CACHE
    if not os.environ.get("R2_ACCESS_KEY_ID"):
        return []
    try:
        from app.storage.r2_client import get_r2_client
        manifest = get_r2_client().get_json("meta/tickers_manifest.json")
        tickers = (manifest or {}).get("tickers", [])
        if tickers:
            logger.info(f"Loaded {len(tickers)} tickers from R2 manifest (local data/ not found)")
            _R2_MANIFEST_CACHE = tickers
        return tickers
    except Exception as e:
        logger.warning(f"R2 tickers manifest fallback failed: {e}")
        return []


def list_tickers() -> List[Dict[str, Any]]:
    """
    Walk data/*/*/metadata.json and return list of tickers with metadata.
    Falls back to the R2 manifest (_list_tickers_from_r2) if the local
    data directory is missing or empty, e.g. in production where
    FinSight/data/ is no longer part of the git repo.

    Returns:
        List of dicts with keys: ticker, market, exchange_tz, updated_utc, daily_rows, minute_rows
    """
    tickers = []
    data_dir = settings.DATA_DIR

    if not data_dir.exists():
        logger.warning(f"Data directory not found: {data_dir}")
        return _list_tickers_from_r2()

    logger.info(f"Scanning data directory: {data_dir}")
    market_count = 0
    ticker_count = 0
    skipped_count = 0
    
    for market_dir in data_dir.iterdir():
        if not market_dir.is_dir():
            continue
        
        market = market_dir.name
        market_count += 1
        market_ticker_count = 0
        
        for ticker_dir in market_dir.iterdir():
            if not ticker_dir.is_dir():
                continue
            
            metadata_path = ticker_dir / "metadata.json"
            if not metadata_path.exists():
                skipped_count += 1
                logger.debug(f"Skipping {ticker_dir.name} (no metadata.json)")
                continue
            
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                
                # Ensure market is set
                metadata["market"] = market
                tickers.append(metadata)
                market_ticker_count += 1
                ticker_count += 1
            except Exception as e:
                logger.warning(f"Failed to read metadata for {ticker_dir}: {e}")
                skipped_count += 1
                continue
        
        if market_ticker_count > 0:
            logger.info(f"Found {market_ticker_count} tickers in market {market}")
    
    logger.info(f"Total: {market_count} markets, {ticker_count} tickers found, {skipped_count} skipped")
    if ticker_count == 0:
        return _list_tickers_from_r2()
    return tickers


def load_daily(ticker: str, market: Optional[str] = None) -> pd.DataFrame:
    """
    Load daily OHLCV data from history.parquet.
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        DataFrame with UTC timezone-aware index
    """
    paths = get_paths_for_ticker(ticker, market)
    history_path = paths["history"]
    
    if not history_path or not history_path.exists():
        logger.warning(f"History file not found for {ticker}")
        return pd.DataFrame()
    
    try:
        df = pd.read_parquet(history_path, engine="pyarrow")
        df = ensure_utc_index(df)
        return df
    except Exception as e:
        logger.error(f"Failed to load daily data for {ticker}: {e}")
        return pd.DataFrame()


def load_minute(ticker: str, market: Optional[str] = None) -> pd.DataFrame:
    """
    Load 1-minute intraday data from minute_1m.parquet.
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        DataFrame with UTC timezone-aware index
    """
    paths = get_paths_for_ticker(ticker, market)
    minute_path = paths["minute"]
    
    if not minute_path or not minute_path.exists():
        logger.warning(f"Minute file not found for {ticker}")
        return pd.DataFrame()
    
    try:
        df = pd.read_parquet(minute_path, engine="pyarrow")
        df = ensure_utc_index(df)
        return df
    except Exception as e:
        logger.error(f"Failed to load minute data for {ticker}: {e}")
        return pd.DataFrame()


def load_technicals(ticker: str, market: Optional[str] = None) -> pd.DataFrame:
    """
    Load technical indicators from tech_indicators.parquet.
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        DataFrame with technical indicators
    """
    paths = get_paths_for_ticker(ticker, market)
    tech_path = paths["tech_indicators"]
    
    if not tech_path or not tech_path.exists():
        logger.warning(f"Technical indicators file not found for {ticker}")
        return pd.DataFrame()
    
    try:
        df = pd.read_parquet(tech_path, engine="pyarrow")
        df = ensure_utc_index(df)
        return df
    except Exception as e:
        logger.error(f"Failed to load technicals for {ticker}: {e}")
        return pd.DataFrame()


def load_fundamentals(ticker: str, market: Optional[str] = None) -> Dict[str, Any]:
    """
    Load fundamentals from financials_full.json.
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        Dict with financial data or empty dict if not found
    """
    paths = get_paths_for_ticker(ticker, market)
    financials_path = paths["financials"]
    
    if not financials_path or not financials_path.exists():
        logger.warning(f"Financials file not found for {ticker}")
        return {}
    
    try:
        with open(financials_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load fundamentals for {ticker}: {e}")
        return {}


def load_news(ticker: str, market: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Load news from news.json (canonical) or news.parquet (fallback).
    
    News format (canonical in news.json):
    - List of dicts, each with: ticker, title, publisher, link, type, provider_time_utc, summary (optional)
    - provider_time_utc: ISO8601 string in UTC
    - All fields except title are optional
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        List of normalized news dicts from last 3 years, empty list if no news found
    """
    from datetime import datetime, timedelta
    
    paths = get_paths_for_ticker(ticker, market)
    
    # Filter: Only show news from last 3 years
    cutoff_date = datetime.now() - timedelta(days=3 * 365)
    
    # Canonical: news.json
    news_json_path = paths["news_json"]
    if news_json_path and news_json_path.exists():
        try:
            with open(news_json_path, "r", encoding="utf-8") as f:
                news_list = json.load(f)
                # Validate and normalize
                if isinstance(news_list, list):
                    normalized = []
                    for item in news_list:
                        if isinstance(item, dict):
                            # Parse timestamp to filter old news
                            timestamp_str = item.get("provider_time_utc") or item.get("timestamp")
                            if timestamp_str:
                                try:
                                    # Try parsing ISO format
                                    if isinstance(timestamp_str, str):
                                        # Handle various formats
                                        if 'T' in timestamp_str:
                                            news_date = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                        else:
                                            news_date = datetime.strptime(timestamp_str[:10], "%Y-%m-%d")
                                        
                                        # Convert to UTC if timezone-aware, otherwise assume UTC
                                        if news_date.tzinfo is None:
                                            news_date = news_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
                                        
                                        # Filter out old news (before cutoff)
                                        if news_date < cutoff_date.replace(tzinfo=news_date.tzinfo):
                                            continue
                                except (ValueError, AttributeError):
                                    # If parsing fails, include it (better to show than hide)
                                    pass
                            
                            # Ensure required fields exist
                            normalized_item = {
                                "ticker": item.get("ticker", ticker),
                                "title": item.get("title", ""),
                                "publisher": item.get("publisher"),
                                "link": item.get("link"),
                                "type": item.get("type"),
                                "provider_time_utc": item.get("provider_time_utc"),
                                "timestamp": item.get("timestamp") or item.get("provider_time_utc"),
                                "summary": item.get("summary"),
                                "source": item.get("source"),
                            }
                            # Only include items with at least a title
                            if normalized_item["title"]:
                                normalized.append(normalized_item)
                    
                    # Sort by timestamp (newest first)
                    normalized.sort(
                        key=lambda x: x.get("provider_time_utc") or x.get("timestamp") or "",
                        reverse=True
                    )
                    return normalized
                return []
        except Exception as e:
            logger.warning(f"Failed to load news.json for {ticker}: {e}")
    
    # Fallback: news.parquet (optional, for backward compatibility)
    news_path = paths["news"]
    if news_path and news_path.exists():
        try:
            df = pd.read_parquet(news_path, engine="pyarrow")
            if not df.empty:
                news_list = []
                for _, row in df.iterrows():
                    news_item = row.to_dict()
                    
                    # Filter by date
                    timestamp_str = news_item.get("provider_time_utc") or news_item.get("timestamp")
                    if timestamp_str:
                        try:
                            if isinstance(timestamp_str, pd.Timestamp):
                                news_date = timestamp_str.to_pydatetime()
                            elif isinstance(timestamp_str, str):
                                if 'T' in timestamp_str:
                                    news_date = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                else:
                                    news_date = datetime.strptime(timestamp_str[:10], "%Y-%m-%d")
                            else:
                                news_date = None
                            
                            if news_date:
                                if news_date.tzinfo is None:
                                    news_date = news_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
                                if news_date < cutoff_date.replace(tzinfo=news_date.tzinfo):
                                    continue
                        except (ValueError, AttributeError):
                            pass
                    
                    # Convert timestamp objects to ISO strings
                    for key, value in news_item.items():
                        if pd.isna(value):
                            news_item[key] = None
                        elif isinstance(value, pd.Timestamp):
                            news_item[key] = value.isoformat()
                    # Normalize to match JSON format
                    normalized_item = {
                        "ticker": news_item.get("ticker", ticker),
                        "title": news_item.get("title", ""),
                        "publisher": news_item.get("publisher"),
                        "link": news_item.get("link"),
                        "type": news_item.get("type"),
                        "provider_time_utc": news_item.get("provider_time_utc") or news_item.get("timestamp"),
                        "timestamp": news_item.get("timestamp") or news_item.get("provider_time_utc"),
                        "summary": news_item.get("summary"),
                        "source": news_item.get("source"),
                    }
                    if normalized_item["title"]:
                        news_list.append(normalized_item)
                
                # Sort by timestamp (newest first)
                news_list.sort(
                    key=lambda x: x.get("provider_time_utc") or x.get("timestamp") or "",
                    reverse=True
                )
                return news_list
        except Exception as e:
            logger.warning(f"Failed to load news.parquet for {ticker}: {e}")
    
    return []


def load_metadata(ticker: str, market: Optional[str] = None) -> Dict[str, Any]:
    """
    Load metadata from metadata.json.
    
    Args:
        ticker: Ticker symbol
        market: Optional market hint
    
    Returns:
        Dict with metadata or empty dict if not found
    """
    paths = get_paths_for_ticker(ticker, market)
    metadata_path = paths["metadata"]
    
    if not metadata_path or not metadata_path.exists():
        logger.warning(f"Metadata file not found for {ticker}")
        return {}
    
    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
            # Ensure market is set
            if "market" not in metadata:
                ticker_dir = get_ticker_dir(ticker, market)
                if ticker_dir:
                    metadata["market"] = ticker_dir.parent.name
            return metadata
    except Exception as e:
        logger.error(f"Failed to load metadata for {ticker}: {e}")
        return {}

