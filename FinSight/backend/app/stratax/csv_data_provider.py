"""
CSV Data Provider for StrataX
Reads option chain data from CSV file or JSON cache from NSE fetcher.
Automatically finds the LATEST data file in the StrataX directories.
"""

import csv
import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Multiple directories to search for StrataX data
_BACKEND_ROOT = Path(__file__).parent.parent.parent
STRATAX_CSV_DIR = Path(__file__).parent.parent.parent.parent / "StrataX"
STRATAX_JSON_DIR = _BACKEND_ROOT / "data" / "stratax_cache"
STRATAX_DIR = STRATAX_CSV_DIR if STRATAX_CSV_DIR.exists() else STRATAX_JSON_DIR

# In-memory cache for CSV data
_csv_data_cache: Optional[List[Dict]] = None
_csv_file_loaded: Optional[str] = None
_csv_file_mtime: Optional[float] = None  # Track modification time for auto-refresh


def find_latest_csv_file() -> Optional[Path]:
    """Find the most recent option chain data file (CSV or JSON)."""
    # Try CSV first from StrataX directory
    if STRATAX_CSV_DIR.exists():
        csv_files = list(STRATAX_CSV_DIR.glob("option_chain_all_*.csv"))
        if csv_files:
            csv_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            logger.info(f"Found {len(csv_files)} CSV files, using latest: {csv_files[0].name}")
            return csv_files[0]

    # Try JSON files from NSE fetcher cache
    if STRATAX_JSON_DIR.exists():
        json_files = list(STRATAX_JSON_DIR.glob("*_latest.json"))
        if json_files:
            json_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            logger.info(f"Found {len(json_files)} JSON cache files, using latest: {json_files[0].name}")
            return json_files[0]

    logger.warning(f"No StrataX data files found in {STRATAX_CSV_DIR} or {STRATAX_JSON_DIR}")
    return None


def load_csv_data() -> List[Dict]:
    """Load option chain data from the LATEST CSV file."""
    global _csv_data_cache, _csv_file_loaded, _csv_file_mtime
    
    # Find the latest CSV file
    csv_file = find_latest_csv_file()
    
    if csv_file is None:
        return []
    
    # Get current file modification time
    current_mtime = csv_file.stat().st_mtime
    
    # Check if we already loaded this file AND it hasn't been modified
    if (_csv_data_cache is not None and 
        _csv_file_loaded == str(csv_file) and 
        _csv_file_mtime == current_mtime):
        return _csv_data_cache
    
    # Clear cache if loading a different file or file was modified
    if _csv_file_loaded != str(csv_file) or _csv_file_mtime != current_mtime:
        _csv_data_cache = None
        if _csv_file_mtime != current_mtime and _csv_file_loaded == str(csv_file):
            logger.info(f"CSV file modified, reloading: {csv_file.name}")
        else:
            logger.info(f"Loading new CSV file: {csv_file.name}")
    
    if not csv_file.exists():
        logger.error(f"Data file not found: {csv_file}")
        return []

    rows = []
    try:
        if csv_file.suffix == '.json':
            rows = _load_json_data(csv_file)
        else:
            rows = _load_csv_rows(csv_file)

        _csv_data_cache = rows
        _csv_file_loaded = str(csv_file)
        _csv_file_mtime = csv_file.stat().st_mtime
        logger.info(f"Loaded {len(rows)} option rows from {csv_file.name}")
        return rows
    except Exception as e:
        logger.error(f"Error loading data file {csv_file}: {e}", exc_info=True)
        return []


def _load_csv_rows(csv_file: Path) -> List[Dict]:
    """Load option chain rows from a CSV file."""
    rows = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            processed_row = {
                'symbol': row.get('symbol', '').strip(),
                'kind': row.get('kind', '').strip(),
                'underlying': row.get('underlying', '').strip() or None,
                'underlyingValue': _parse_float(row.get('underlyingValue')),
                'timestamp': row.get('timestamp', '').strip() or None,
                'expiryDate': row.get('expiryDate', '').strip(),
                'strikePrice': _parse_float(row.get('strikePrice')),
                'optionType': row.get('optionType', '').strip(),
                'lastPrice': _parse_float(row.get('lastPrice')),
                'change': _parse_float(row.get('change')),
                'pChange': _parse_float(row.get('pChange')),
                'openInterest': _parse_int(row.get('openInterest')),
                'changeInOI': _parse_int(row.get('changeInOI')),
                'totalTradedVolume': _parse_int(row.get('totalTradedVolume')),
                'impliedVolatility': _parse_float(row.get('impliedVolatility')),
                'bidQty': _parse_int(row.get('bidQty')),
                'bidPrice': _parse_float(row.get('bidPrice')),
                'askPrice': _parse_float(row.get('askPrice')),
                'askQty': _parse_int(row.get('askQty')),
                'identifier': row.get('identifier', '').strip() or None,
            }
            rows.append(processed_row)
    return rows


def _load_json_data(json_file: Path) -> List[Dict]:
    """Load option chain rows from a JSON file (NSE fetcher output)."""
    data = json.loads(json_file.read_text(encoding='utf-8'))
    underlying = data.get('underlying', '')
    spot = data.get('spot_price', 0)
    expiry = data.get('expiry', '')
    timestamp = data.get('timestamp', '')
    raw_rows = data.get('rows', [])

    rows = []
    for r in raw_rows:
        for opt_type in ['CE', 'PE']:
            opt = r.get(opt_type, {}) or r.get(opt_type.lower(), {})
            if not opt:
                if opt_type == 'CE':
                    opt = {k: r.get(f'call_{k}', r.get(k)) for k in ['lastPrice', 'openInterest', 'change', 'pChange', 'impliedVolatility', 'bidPrice', 'askPrice', 'bidQty', 'askQty', 'totalTradedVolume', 'changeinOpenInterest']}
                else:
                    opt = {k: r.get(f'put_{k}', r.get(k)) for k in ['lastPrice', 'openInterest', 'change', 'pChange', 'impliedVolatility', 'bidPrice', 'askPrice', 'bidQty', 'askQty', 'totalTradedVolume', 'changeinOpenInterest']}

            strike = r.get('strikePrice', r.get('strike', 0))
            lp = opt.get('lastPrice') or r.get(f'{"call" if opt_type == "CE" else "put"}_ltp')
            oi = opt.get('openInterest') or r.get(f'{"call" if opt_type == "CE" else "put"}_oi')
            chg_oi = opt.get('changeinOpenInterest') or opt.get('changeInOI')
            iv = opt.get('impliedVolatility') or r.get(f'{"call" if opt_type == "CE" else "put"}_iv')
            vol = opt.get('totalTradedVolume') or r.get(f'{"call" if opt_type == "CE" else "put"}_volume')

            if lp is None and oi is None:
                continue

            rows.append({
                'symbol': underlying,
                'kind': 'index',
                'underlying': underlying,
                'underlyingValue': spot,
                'timestamp': timestamp,
                'expiryDate': expiry,
                'strikePrice': strike,
                'optionType': opt_type,
                'lastPrice': lp,
                'change': opt.get('change'),
                'pChange': opt.get('pChange'),
                'openInterest': int(oi) if oi else None,
                'changeInOI': int(chg_oi) if chg_oi else None,
                'totalTradedVolume': int(vol) if vol else None,
                'impliedVolatility': iv,
                'bidQty': opt.get('bidQty'),
                'bidPrice': opt.get('bidPrice'),
                'askPrice': opt.get('askPrice'),
                'askQty': opt.get('askQty'),
                'identifier': None,
            })
    return rows


def _parse_float(value: Optional[str]) -> Optional[float]:
    """Parse float value from CSV string."""
    if not value or value.strip() == '':
        return None
    try:
        return float(value.strip())
    except (ValueError, TypeError):
        return None


def _parse_int(value: Optional[str]) -> Optional[int]:
    """Parse int value from CSV string."""
    if not value or value.strip() == '':
        return None
    try:
        # Handle float strings like "4.333333333333333" by converting to int
        float_val = float(value.strip())
        return int(float_val)
    except (ValueError, TypeError):
        return None


def get_option_chain_from_csv(symbol: str) -> List[Dict]:
    """
    Get option chain data for a symbol from CSV.
    
    Args:
        symbol: Symbol name (e.g., "NIFTY", "BANKNIFTY")
    
    Returns:
        List of option row dicts matching StrataXOptionRow schema
    """
    all_rows = load_csv_data()
    symbol_upper = symbol.upper()
    
    # Filter by symbol (case-insensitive)
    filtered = [
        row for row in all_rows 
        if row.get('symbol', '').strip().upper() == symbol_upper
    ]
    
    if not filtered:
        logger.warning(f"No data found for symbol {symbol_upper} in CSV")
        # Log available symbols for debugging
        available = get_available_symbols_from_csv()
        logger.info(f"Available symbols in CSV: {available[:10]}...")  # Show first 10
    
    logger.info(f"Found {len(filtered)} option rows for {symbol_upper} in CSV")
    return filtered


def get_available_symbols_from_csv() -> List[str]:
    """Get list of available symbols from CSV."""
    all_rows = load_csv_data()
    symbols = set()
    for row in all_rows:
        symbol = row.get('symbol', '').strip()
        if symbol:
            symbols.add(symbol.upper())
    return sorted(list(symbols))


def get_available_expiries_from_csv(symbol: str) -> List[str]:
    """Get available expiry dates for a symbol from CSV."""
    rows = get_option_chain_from_csv(symbol)
    expiries = set()
    for row in rows:
        expiry = row.get('expiryDate', '').strip()
        if expiry:
            expiries.add(expiry)
    return sorted(list(expiries))


def clear_csv_cache():
    """Clear the CSV cache to force reload from latest file."""
    global _csv_data_cache, _csv_file_loaded, _csv_file_mtime
    _csv_data_cache = None
    _csv_file_loaded = None
    _csv_file_mtime = None
    logger.info("CSV cache cleared - will reload from latest file on next request")


def get_current_csv_file_info() -> Dict:
    """Get info about the currently loaded CSV file."""
    csv_file = find_latest_csv_file()
    return {
        "file": csv_file.name if csv_file else None,
        "path": str(csv_file) if csv_file else None,
        "loaded_file": _csv_file_loaded,
        "cache_size": len(_csv_data_cache) if _csv_data_cache else 0,
        "last_modified": datetime.fromtimestamp(csv_file.stat().st_mtime).isoformat() if csv_file else None,
    }

