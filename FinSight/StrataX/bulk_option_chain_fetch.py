import csv
import datetime as dt
import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import requests


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
        print(f"[WARN] Failed to warm up NSE session: {e}", file=sys.stderr)
    return s


def read_symbols_from_file(path: str) -> List[str]:
    """Read symbols from a text file, ignoring blank lines and comments (#...)."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Symbol file not found: {path}")

    symbols: List[str] = []
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            symbols.append(line.upper())
    return symbols


def detect_kind(symbol: str) -> str:
    """Return 'index' if symbol is in INDEX_SYMBOLS, else 'equity'."""
    return "index" if symbol.upper() in INDEX_SYMBOLS else "equity"


def fetch_raw_option_chain(
    session: requests.Session, symbol: str, kind: str
) -> Dict:
    """Fetch raw JSON option chain from NSE for given symbol."""
    if kind not in ("index", "equity"):
        raise ValueError(f"Invalid kind for {symbol}: {kind}")

    endpoint = INDEX_ENDPOINT if kind == "index" else EQUITY_ENDPOINT
    params = {"symbol": symbol.upper()}

    print(f"[INFO] Fetching {kind} option chain for {symbol}...")
    r = session.get(endpoint, params=params, timeout=20)
    r.raise_for_status()

    try:
        data = r.json()
    except json.JSONDecodeError as e:
        print(f"[ERROR] Failed to decode JSON for {symbol}", file=sys.stderr)
        raise e

    return data


def normalize_option_chain(raw: Dict, symbol: str, kind: str) -> List[Dict]:
    """
    Convert NSE raw JSON into a flat list of rows:
    one row per (strike, expiry, optionType).
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


def save_all_to_csv(rows: List[Dict], filename: str) -> None:
    """Save all rows to a single CSV file."""
    if not rows:
        raise ValueError("No rows to save")

    fieldnames = [
        "symbol",
        "kind",
        "underlying",
        "underlyingValue",
        "timestamp",
        "expiryDate",
        "strikePrice",
        "optionType",
        "lastPrice",
        "change",
        "pChange",
        "openInterest",
        "changeInOI",
        "totalTradedVolume",
        "impliedVolatility",
        "bidQty",
        "bidPrice",
        "askPrice",
        "askQty",
        "identifier",
    ]

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    symbol_file = "fno_symbols.txt"
    try:
        symbols = read_symbols_from_file(symbol_file)
    except Exception as e:
        print(f"[FATAL] Could not read symbols: {e}", file=sys.stderr)
        sys.exit(1)

    if not symbols:
        print("[FATAL] No symbols found in file.")
        sys.exit(1)

    print(f"[INFO] Loaded {len(symbols)} symbols from {symbol_file}")

    session = create_session()
    all_rows: List[Dict] = []

    for i, symbol in enumerate(symbols, start=1):
        kind = detect_kind(symbol)

        try:
            raw = fetch_raw_option_chain(session, symbol, kind)
            rows = normalize_option_chain(raw, symbol, kind)
            print(f"[INFO] {symbol}: {len(rows)} option rows parsed.")
            all_rows.extend(rows)
        except Exception as e:
            print(f"[ERROR] Skipping {symbol} due to error: {e}", file=sys.stderr)

        # Be kind to NSE – avoid hammering the server
        time.sleep(1.0)

    if not all_rows:
        print("[WARN] No data downloaded for any symbol.")
        sys.exit(1)

    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = f"option_chain_all_{timestamp}.csv"

    try:
        save_all_to_csv(all_rows, out_file)
        print(f"[OK] Saved {len(all_rows)} rows to {out_file}")
    except Exception as e:
        print(f"[FATAL] Failed to save CSV: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
