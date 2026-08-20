"""
NSE Option Chain Client
Library-style client for fetching and normalizing NSE option chain data.

Based on the canonical bulk_option_chain_fetch.py script.
"""

import json
import logging
from typing import Dict, List, Literal
import requests

logger = logging.getLogger(__name__)

BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept": "application/json,text/html,application/xhtml+xml,"
              "application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Connection": "keep-alive",
}

INDEX_ENDPOINT = "https://www.nseindia.com/api/option-chain-indices"
EQUITY_ENDPOINT = "https://www.nseindia.com/api/option-chain-equities"

# Symbols we will treat as indices; everything else is treated as equity.
INDEX_SYMBOLS = {
    "NIFTY",
    "BANKNIFTY",
    "FINNIFTY",
    "MIDCPNIFTY",
    "NIFTYIT",
    "NIFTYFINSERVICE",
    "NIFTYMIDSELECT",
    "NIFTYNEXT50",
    "NIFTYAUTO",
    "NIFTYBANK",
    "NIFTYFMCG",
    "NIFTYMETAL",
    "NIFTYPHARMA",
    "NIFTYPSUBANK",
    "NIFTYREALTY",
}


def create_session() -> requests.Session:
    """Create a requests session with browser-like headers and primed cookies."""
    s = requests.Session()
    s.headers.update(BASE_HEADERS)
    try:
        # Warm up cookies
        resp = s.get("https://www.nseindia.com/option-chain", timeout=10)
        resp.raise_for_status()
    except Exception as e:
        logger.warning(f"Failed to warm up NSE session: {e}")
    return s


def detect_kind(symbol: str) -> Literal["index", "equity"]:
    """Return 'index' if symbol is in INDEX_SYMBOLS, else 'equity'."""
    return "index" if symbol.upper() in INDEX_SYMBOLS else "equity"


def fetch_raw_option_chain(
    session: requests.Session, symbol: str, kind: Literal["index", "equity"]
) -> Dict:
    """Fetch raw JSON option chain from NSE for given symbol."""
    if kind not in ("index", "equity"):
        raise ValueError(f"Invalid kind for {symbol}: {kind}")

    endpoint = INDEX_ENDPOINT if kind == "index" else EQUITY_ENDPOINT
    params = {"symbol": symbol.upper()}

    logger.debug(f"Fetching {kind} option chain for {symbol}...")
    r = session.get(endpoint, params=params, timeout=20)
    r.raise_for_status()

    try:
        data = r.json()
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for {symbol}")
        raise e

    return data


def normalize_option_chain(raw: Dict, symbol: str, kind: Literal["index", "equity"]) -> List[Dict]:
    """
    Convert NSE raw JSON into a flat list of rows:
    one row per (strike, expiry, optionType).
    
    Returns list of dicts matching the CSV schema:
    symbol, kind, underlying, underlyingValue, timestamp,
    expiryDate, strikePrice, optionType,
    lastPrice, change, pChange,
    openInterest, changeInOI, totalTradedVolume, impliedVolatility,
    bidQty, bidPrice, askPrice, askQty, identifier
    """
    records = raw.get("records", {})
    data = records.get("data", [])
    underlying_value = records.get("underlyingValue")
    timestamp = records.get("timestamp")

    rows: List[Dict] = []

    for item in data:
        strike = item.get("strikePrice")
        expiry = item.get("expiryDate")

        for opt_type in ("CE", "PE"):
            leg = item.get(opt_type)
            if not leg:
                continue

            row = {
                "symbol": symbol.upper(),
                "kind": kind,
                "underlying": leg.get("underlying"),
                "underlyingValue": underlying_value,
                "timestamp": timestamp,
                "expiryDate": expiry,
                "strikePrice": strike,
                "optionType": opt_type,

                "lastPrice": leg.get("lastPrice"),
                "change": leg.get("change"),
                "pChange": leg.get("pChange"),

                "openInterest": leg.get("openInterest"),
                "changeInOI": leg.get("changeinOpenInterest"),
                "totalTradedVolume": leg.get("totalTradedVolume"),
                "impliedVolatility": leg.get("impliedVolatility"),

                "bidQty": leg.get("bidQty"),
                "bidPrice": leg.get("bidprice"),
                "askPrice": leg.get("askPrice"),
                "askQty": leg.get("askQty"),

                "identifier": leg.get("identifier"),
            }
            rows.append(row)

    return rows


def get_option_chain(symbol: str, kind: Literal["index", "equity"] = None) -> List[Dict]:
    """
    Main entry point: Fetch and normalize option chain for a symbol.
    
    Args:
        symbol: Symbol name (e.g., "NIFTY", "RELIANCE")
        kind: Optional, will be auto-detected if not provided
    
    Returns:
        List of normalized option row dicts matching CSV schema
    
    Raises:
        requests.exceptions.RequestException: If NSE request fails
        ValueError: If data parsing fails
    """
    if kind is None:
        kind = detect_kind(symbol)
    
    try:
        session = create_session()
        raw = fetch_raw_option_chain(session, symbol, kind)
        rows = normalize_option_chain(raw, symbol, kind)
        
        if not rows:
            logger.warning(f"No option rows found for {symbol} ({kind})")
            return []
        
        logger.info(f"Fetched {len(rows)} option rows for {symbol} ({kind})")
        return rows
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error fetching {symbol}: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error fetching {symbol}: {e}", exc_info=True)
        raise ValueError(f"Failed to fetch option chain for {symbol}: {str(e)}")

