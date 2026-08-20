"""
================================================================================
NSE OPTION CHAIN DATA FETCHER - HARDENED VERSION
================================================================================

Fetches real-time option chain data from NSE website.

EXECUTION RULES (NON-NEGOTIABLE):
- Cookie-aware, session-based requests
- Structured retry logic with exponential backoff
- Explicit state classification (HEALTHY / BLOCKED / FORMAT_CHANGED / PERMANENT)
- NO silent failures - every failure is logged and classified
- Health reports written for pipeline validation

================================================================================
"""

import requests
import json
import time
import logging
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# =============================================================================
# CUSTOM EXCEPTIONS
# =============================================================================

class NSEDataError(Exception):
    """Base exception for NSE data errors."""
    pass


class NSETemporaryError(NSEDataError):
    """Temporary error - NSE is blocking or rate-limiting. Retry later."""
    pass


class NSEBlockedError(NSEDataError):
    """NSE is blocking the request (403, non-JSON response, etc.)."""
    pass


class NSEFormatError(NSEDataError):
    """NSE response format has changed - code update needed."""
    pass


class NSEPermanentError(NSEDataError):
    """Permanent error - NSE endpoint is broken or unavailable."""
    pass


# =============================================================================
# CONFIGURATION
# =============================================================================

NSE_BASE_URL = "https://www.nseindia.com"
NSE_OPTION_CHAIN_URL = "https://www.nseindia.com/api/option-chain-indices"

# Retry configuration
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # Exponential backoff: 2, 4, 8 seconds
REQUEST_TIMEOUT = 15

# Headers to mimic browser request
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://www.nseindia.com/option-chain",
    "Origin": "https://www.nseindia.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

# Cache configuration (short TTL for rate-limiting protection)
CACHE_DURATION_SECONDS = 8
_cache: Dict[str, tuple] = {}

# Session singleton
_session: Optional[requests.Session] = None
_session_initialized_at: Optional[float] = None
SESSION_MAX_AGE = 300  # Refresh session every 5 minutes


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

def get_nse_session(force_new: bool = False) -> requests.Session:
    """
    Get NSE session with cookies.
    
    The session is reused for efficiency but refreshed periodically.
    """
    global _session, _session_initialized_at
    
    # Check if we need a new session
    need_new = (
        force_new or
        _session is None or
        _session_initialized_at is None or
        (time.time() - _session_initialized_at) > SESSION_MAX_AGE
    )
    
    if need_new:
        logger.debug("[NSE] Creating new session with cookies...")
        _session = requests.Session()
        _session.headers.update(HEADERS)
        
        # CRITICAL: First hit homepage to establish cookies
        try:
            home_response = _session.get(NSE_BASE_URL, timeout=10)
            if home_response.status_code != 200:
                logger.warning(f"[NSE] Homepage returned {home_response.status_code}")
            else:
                logger.debug(f"[NSE] Session cookies established: {len(_session.cookies)} cookies")
        except Exception as e:
            logger.warning(f"[NSE] Failed to initialize session cookies: {e}")
        
        _session_initialized_at = time.time()
    
    return _session


def reset_session():
    """Force reset the session (useful after errors)."""
    global _session, _session_initialized_at
    _session = None
    _session_initialized_at = None
    logger.debug("[NSE] Session reset")


# =============================================================================
# CACHE MANAGEMENT
# =============================================================================

def _get_cache_key(underlying: str, expiry: Optional[str] = None) -> str:
    """Generate cache key."""
    return f"{underlying}:{expiry or 'current'}"


def _is_cache_valid(cache_entry: tuple) -> bool:
    """Check if cache entry is still valid."""
    if not cache_entry:
        return False
    _, timestamp = cache_entry
    age = time.time() - timestamp
    return age < CACHE_DURATION_SECONDS


# =============================================================================
# RESPONSE VALIDATION (STRICT)
# =============================================================================

def validate_nse_response(response: requests.Response, symbol: str) -> Dict:
    """
    Validate NSE response STRICTLY.
    
    Raises specific exceptions based on failure type:
    - NSEBlockedError: Non-200 status or non-JSON response
    - NSEFormatError: Missing expected keys in response
    - NSETemporaryError: Rate limiting or temporary issues
    
    Returns parsed JSON if valid.
    """
    # Check HTTP status code
    if response.status_code == 403:
        raise NSEBlockedError(f"NSE blocked request (403 Forbidden) for {symbol}")
    
    if response.status_code == 429:
        raise NSETemporaryError(f"NSE rate limiting (429) for {symbol}")
    
    if response.status_code == 404:
        raise NSEPermanentError(f"NSE endpoint not found (404) for {symbol}")
    
    if response.status_code >= 500:
        raise NSETemporaryError(f"NSE server error ({response.status_code}) for {symbol}")
    
    if response.status_code != 200:
        raise NSEBlockedError(f"NSE returned non-200 status ({response.status_code}) for {symbol}")
    
    # Check content type (NSE sometimes returns HTML when blocking)
    content_type = response.headers.get("Content-Type", "")
    if not content_type.startswith("application/json"):
        # Check if it's HTML (blocking response)
        if "text/html" in content_type or response.text.strip().startswith("<!"):
            raise NSEBlockedError(f"NSE returned HTML instead of JSON for {symbol} (likely blocked)")
        raise NSEFormatError(f"NSE returned unexpected content type: {content_type}")
    
    # Parse JSON
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        raise NSEFormatError(f"NSE returned invalid JSON for {symbol}: {e}")
    
    # Validate response structure
    if not isinstance(data, dict):
        raise NSEFormatError(f"NSE response is not a dict for {symbol}")
    
    if 'records' not in data:
        raise NSEFormatError(f"NSE response missing 'records' key for {symbol}")
    
    records = data.get('records', {})
    if 'data' not in records and 'filtered' not in records:
        raise NSEFormatError(f"NSE response missing 'data' or 'filtered' in records for {symbol}")
    
    return data


# =============================================================================
# MAIN FETCH FUNCTION WITH RETRY
# =============================================================================

def fetch_nse_option_chain(underlying: str, expiry: Optional[str] = None) -> Dict:
    """
    Fetch option chain from NSE with retry logic.
    
    Args:
        underlying: Symbol like 'NIFTY', 'BANKNIFTY', etc.
        expiry: Expiry date in format 'YYYY-MM-DD' or None for current expiry
    
    Returns:
        Option chain data dict
        
    Raises:
        NSEBlockedError: NSE is blocking requests
        NSEFormatError: Response format changed (code update needed)
        NSEPermanentError: Endpoint broken
        NSETemporaryError: Temporary failure after all retries
    """
    # Check cache first
    cache_key = _get_cache_key(underlying, expiry)
    if cache_key in _cache:
        if _is_cache_valid(_cache[cache_key]):
            logger.debug(f"[NSE] Returning cached data for {underlying}")
            cached_data, _ = _cache[cache_key]
            return cached_data
    
    # Map underlying to NSE symbol
    symbol_map = {
        'NIFTY': 'NIFTY',
        'BANKNIFTY': 'BANKNIFTY',
        'FINNIFTY': 'FINNIFTY',
        'MIDCPNIFTY': 'MIDCPNIFTY',
    }
    
    nse_symbol = symbol_map.get(underlying.upper())
    if not nse_symbol:
        raise NSEPermanentError(f"Unsupported underlying: {underlying}. Supported: {list(symbol_map.keys())}")
    
    last_error = None
    
    for attempt in range(1, MAX_RETRIES + 1):
        logger.info(f"[NSE] Attempt {attempt}/{MAX_RETRIES} for {nse_symbol}...")
        
        try:
            # Get session (force new after first failure)
            session = get_nse_session(force_new=(attempt > 1))
            
            # Make request
            params = {'symbol': nse_symbol}
            response = session.get(
                NSE_OPTION_CHAIN_URL,
                params=params,
                timeout=REQUEST_TIMEOUT
            )
            
            # Validate response (raises specific exceptions)
            data = validate_nse_response(response, nse_symbol)
            
            # Success! Cache and return
            _cache[cache_key] = (data, time.time())
            logger.info(f"[NSE] Successfully fetched {nse_symbol} on attempt {attempt}")
            return data
            
        except NSEBlockedError as e:
            # Blocked - retry with fresh session
            logger.warning(f"[NSE] Blocked on attempt {attempt}: {e}")
            last_error = e
            reset_session()
            
        except NSEFormatError as e:
            # Format changed - don't retry, raise immediately
            logger.error(f"[NSE] FORMAT CHANGED: {e}")
            raise
            
        except NSEPermanentError as e:
            # Permanent error - don't retry, raise immediately
            logger.error(f"[NSE] PERMANENT ERROR: {e}")
            raise
            
        except NSETemporaryError as e:
            # Temporary - retry
            logger.warning(f"[NSE] Temporary error on attempt {attempt}: {e}")
            last_error = e
            
        except requests.exceptions.Timeout:
            logger.warning(f"[NSE] Timeout on attempt {attempt}")
            last_error = NSETemporaryError(f"Timeout connecting to NSE for {nse_symbol}")
            
        except requests.exceptions.ConnectionError as e:
            logger.warning(f"[NSE] Connection error on attempt {attempt}: {e}")
            last_error = NSETemporaryError(f"Connection error to NSE: {e}")
            
        except Exception as e:
            logger.warning(f"[NSE] Unexpected error on attempt {attempt}: {e}")
            last_error = NSETemporaryError(f"Unexpected error: {e}")
        
        # Exponential backoff before retry
        if attempt < MAX_RETRIES:
            backoff = RETRY_BACKOFF_BASE ** attempt
            logger.info(f"[NSE] Waiting {backoff}s before retry...")
            time.sleep(backoff)
    
    # All retries exhausted
    logger.error(f"[NSE] All {MAX_RETRIES} attempts failed for {nse_symbol}")
    
    # Classify the final error
    if isinstance(last_error, NSEBlockedError):
        raise NSEBlockedError(f"NSE blocked after {MAX_RETRIES} attempts: {last_error}")
    elif isinstance(last_error, NSETemporaryError):
        raise last_error
    else:
        raise NSETemporaryError(f"Failed after {MAX_RETRIES} attempts: {last_error}")


# =============================================================================
# PARSE FUNCTION
# =============================================================================

def parse_nse_option_chain(nse_data: Dict, underlying: str, expiry: Optional[str] = None) -> Dict:
    """
    Parse NSE option chain response into our normalized format.
    
    Args:
        nse_data: Raw NSE API response
        underlying: Underlying symbol
        expiry: Expiry date in YYYY-MM-DD format or None
    
    Returns:
        Normalized option chain dict matching StrataXOptionChain format
    """
    if not nse_data or 'records' not in nse_data:
        raise NSEFormatError("Invalid NSE data format: missing 'records'")
    
    records = nse_data['records']
    spot_price = records.get('underlyingValue', 0)
    
    if spot_price == 0:
        raise NSEFormatError("NSE data missing spot price")
    
    # Get expiry dates (format: "DD-MMM-YYYY")
    expiry_dates = records.get('expiryDates', [])
    if not expiry_dates:
        raise NSEFormatError("No expiry dates found in NSE response")
    
    # Select expiry
    if expiry:
        try:
            expiry_date = datetime.strptime(expiry, '%Y-%m-%d')
            expiry_str = expiry_date.strftime('%d-%b-%Y').upper()
            if expiry_str not in expiry_dates:
                logger.warning(f"[NSE] Requested expiry {expiry_str} not found, using first: {expiry_dates[0]}")
                expiry_str = expiry_dates[0]
        except ValueError:
            logger.warning(f"[NSE] Invalid expiry format {expiry}, using first: {expiry_dates[0]}")
            expiry_str = expiry_dates[0]
    else:
        expiry_str = expiry_dates[0]
    
    # Get filtered data for selected expiry
    filtered_data = records.get('filtered', {}).get('data', [])
    
    # Filter by expiry
    expiry_data = [item for item in filtered_data if item.get('expiryDate') == expiry_str]
    
    if not expiry_data:
        all_data = records.get('data', [])
        expiry_data = [item for item in all_data if item.get('expiryDate') == expiry_str]
    
    if not expiry_data:
        raise NSEFormatError(f"No option chain data found for expiry {expiry_str}")
    
    # Build strike map
    strike_map: Dict[float, Dict[str, Dict]] = {}
    
    for item in expiry_data:
        strike = item.get('strikePrice')
        
        if strike is None:
            continue
        
        strike_float = float(strike)
        if strike_float not in strike_map:
            strike_map[strike_float] = {'CE': None, 'PE': None}
        
        # Extract CE data
        if 'CE' in item:
            ce = item['CE']
            strike_map[strike_float]['CE'] = {
                'ltp': ce.get('lastPrice'),
                'change': ce.get('change'),
                'volume': ce.get('totalTradedVolume'),
                'oi': ce.get('openInterest'),
                'oiChange': ce.get('changeinOpenInterest'),
                'iv': (ce.get('impliedVolatility') / 100) if ce.get('impliedVolatility') else None,
            }
        
        # Extract PE data
        if 'PE' in item:
            pe = item['PE']
            strike_map[strike_float]['PE'] = {
                'ltp': pe.get('lastPrice'),
                'change': pe.get('change'),
                'volume': pe.get('totalTradedVolume'),
                'oi': pe.get('openInterest'),
                'oiChange': pe.get('changeinOpenInterest'),
                'iv': (pe.get('impliedVolatility') / 100) if pe.get('impliedVolatility') else None,
            }
    
    # Convert to rows
    strikes = sorted(strike_map.keys())
    rows = []
    
    for strike in strikes:
        ce_data = strike_map[strike].get('CE') or {}
        pe_data = strike_map[strike].get('PE') or {}
        
        rows.append({
            'strike': strike,
            'call': {
                'ltp': ce_data.get('ltp'),
                'change': ce_data.get('change'),
                'volume': ce_data.get('volume'),
                'oi': ce_data.get('oi'),
                'oiChange': ce_data.get('oiChange'),
                'iv': ce_data.get('iv'),
            },
            'put': {
                'ltp': pe_data.get('ltp'),
                'change': pe_data.get('change'),
                'volume': pe_data.get('volume'),
                'oi': pe_data.get('oi'),
                'oiChange': pe_data.get('oiChange'),
                'iv': pe_data.get('iv'),
            },
        })
    
    # Convert expiry back to ISO format
    try:
        expiry_date_obj = datetime.strptime(expiry_str, '%d-%b-%Y')
        expiry_iso = expiry_date_obj.strftime('%Y-%m-%d')
    except:
        expiry_iso = expiry_str
    
    return {
        'underlying': underlying,
        'expiry': expiry_iso,
        'spot_price': float(spot_price),
        'rows': rows,
        'timestamp': datetime.now().isoformat(),
    }


def get_nse_expiries(underlying: str) -> List[str]:
    """
    Get available expiry dates from NSE for an underlying.
    
    Returns:
        List of expiry dates in YYYY-MM-DD format
    """
    try:
        nse_data = fetch_nse_option_chain(underlying)
        if 'records' not in nse_data:
            return []
        
        expiry_dates = nse_data['records'].get('expiryDates', [])
        if not expiry_dates:
            return []
        
        converted = []
        for exp in expiry_dates:
            try:
                dt = datetime.strptime(exp, '%d-%b-%Y')
                converted.append(dt.strftime('%Y-%m-%d'))
            except:
                pass
        
        return converted
    except NSEDataError as e:
        logger.error(f"[NSE] Failed to get expiries: {e}")
        return []
