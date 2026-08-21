"""
AngelOne SmartAPI provider - Workstream D.
===========================================

READ-ONLY market data only. This module deliberately never calls any
order-placement-capable SmartConnect method - placeOrder,
placeOrderFullResponse, modifyOrder, cancelOrder, convertPosition,
gttCreateRule, gttModifyRule, gttCancelRule. That's enforced by
omission: none of those method names appear anywhere below, and no
other module should import SmartConnect directly - always go through
this provider so that boundary can't be bypassed accidentally.

Primary source for Indian (NSE/BSE) equity/index/option data - real-
time (not yFinance's 15-20min-delayed IN quotes), free on Angel One's
tier for all reads. yFinance stays the source for every other market
(US/UK/JP/CN/HK/AU/SG) - this module only ever touches the IN data
path, and even there, every call has an explicit yFinance fallback via
with_angelone_fallback() below: auth failure, a specific call erroring,
or a rate limit never breaks the caller, it just falls through.

Credentials (ANGELONE_API_KEY, ANGELONE_CLIENT_CODE, ANGELONE_MPIN,
ANGELONE_TOTP_SECRET) are read from environment only - never logged,
never written to any output file, never included in an exception
message passed upward (see _safe_error below).
"""
import functools
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

INSTRUMENT_MASTER_URL = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"
INSTRUMENT_CACHE_TTL_HOURS = 20  # refresh roughly daily - instrument list changes rarely intraday

# Tracks which source actually served the last successful IN-market pull,
# for /api/stratax/data-status and an equivalent broader visibility endpoint
# (Workstream D5) - so an all-fallback state doesn't go unnoticed the way
# intelligence/history/ silently growing did.
_last_source_used: Dict[str, Any] = {"source": None, "at": None, "detail": None}
_source_lock = threading.Lock()


def _record_source(source: str, detail: str = "") -> None:
    with _source_lock:
        _last_source_used["source"] = source
        _last_source_used["at"] = datetime.utcnow().isoformat()
        _last_source_used["detail"] = detail


def get_last_source_used() -> Dict[str, Any]:
    with _source_lock:
        return dict(_last_source_used)


def _safe_error(e: Exception) -> str:
    """Stringify an exception without ever letting a credential leak
    through - AngelOne's SDK sometimes echoes request params in error
    text. Strip anything that looks like our own secret values."""
    text = str(e)
    for env_var in ("ANGELONE_API_KEY", "ANGELONE_CLIENT_CODE", "ANGELONE_MPIN", "ANGELONE_TOTP_SECRET"):
        val = os.environ.get(env_var)
        if val and val in text:
            text = text.replace(val, f"[REDACTED_{env_var}]")
    return text


# ------------------------------------------------------------------ session

class _AngelOneSession:
    """Owns the SmartConnect client and its session tokens. Re-auths once
    per process day (tokens are short-lived) or immediately after any
    call that looks like an auth failure. Never raises out of
    ensure() - returns None on failure, callers must treat that as
    "fall back to yFinance", never as an error to surface upward."""

    def __init__(self):
        self._client = None
        self._authed_at: Optional[datetime] = None
        self._lock = threading.Lock()

    def _configured(self) -> bool:
        return bool(
            os.environ.get("ANGELONE_API_KEY")
            and os.environ.get("ANGELONE_CLIENT_CODE")
            and os.environ.get("ANGELONE_MPIN")
            and os.environ.get("ANGELONE_TOTP_SECRET")
        )

    def _login(self):
        import pyotp
        from SmartApi import SmartConnect

        api_key = os.environ["ANGELONE_API_KEY"]
        client_code = os.environ["ANGELONE_CLIENT_CODE"]
        mpin = os.environ["ANGELONE_MPIN"]
        totp_secret = os.environ["ANGELONE_TOTP_SECRET"]

        totp = pyotp.TOTP(totp_secret).now()
        client = SmartConnect(api_key=api_key)
        session = client.generateSession(client_code, mpin, totp)
        if not session or not session.get("status"):
            raise RuntimeError(f"AngelOne login rejected: {session.get('message') if session else 'no response'}")
        return client

    def ensure(self):
        """Returns an authenticated SmartConnect client, or None if
        AngelOne isn't configured or auth fails - never raises."""
        if not self._configured():
            return None

        with self._lock:
            stale = (
                self._client is None
                or self._authed_at is None
                or (datetime.utcnow() - self._authed_at) > timedelta(hours=20)
            )
            if stale:
                try:
                    self._client = self._login()
                    self._authed_at = datetime.utcnow()
                    logger.info("AngelOne session established")
                except Exception as e:  # noqa: BLE001
                    logger.warning("AngelOne auth failed, falling back to yFinance for IN data: %s", _safe_error(e))
                    self._client = None
                    self._authed_at = None
            return self._client

    def invalidate(self):
        """Force re-auth on next call - used when a call fails in a way
        that suggests the token expired mid-session."""
        with self._lock:
            self._client = None
            self._authed_at = None


_session = _AngelOneSession()


# -------------------------------------------------------------- fallback wrapper

def with_angelone_fallback(fallback_fn: Callable):
    """Decorator for every AngelOne read call in this module. Wraps the
    call so that AngelOne not being configured, auth failing, a rate
    limit, or any other error all funnel into the same outcome: log it,
    record which source actually served the request, call fallback_fn
    with the same args instead. This is the single shared pattern
    Workstream D's ground rules call for, rather than scattered
    try/except blocks."""

    def decorator(angelone_fn: Callable):
        @functools.wraps(angelone_fn)
        def wrapper(*args, **kwargs):
            client = _session.ensure()
            if client is not None:
                try:
                    result = angelone_fn(client, *args, **kwargs)
                    if result is not None:
                        _record_source("angelone", angelone_fn.__name__)
                        return result
                except Exception as e:  # noqa: BLE001
                    msg = _safe_error(e)
                    if "AG8001" in msg or "Invalid Token" in msg or "session" in msg.lower():
                        _session.invalidate()
                    logger.warning("AngelOne call %s failed, falling back to yFinance: %s", angelone_fn.__name__, msg)

            try:
                result = fallback_fn(*args, **kwargs)
                _record_source("yfinance", angelone_fn.__name__)
                return result
            except Exception as e:  # noqa: BLE001
                logger.error("Both AngelOne and yFinance fallback failed for %s: %s", angelone_fn.__name__, e)
                _record_source("none", angelone_fn.__name__)
                return None

        return wrapper
    return decorator


# ---------------------------------------------------------- instrument master

_instrument_cache: Dict[str, Any] = {"data": None, "at": None, "by_symbol": {}}
_instrument_lock = threading.Lock()


def _load_instrument_master() -> Optional[List[Dict]]:
    """Reads the pre-filtered instrument master from R2
    (angelone/instrument_master_filtered.json - NSE/BSE equities +
    NIFTY/BANKNIFTY F&O, see refresh_angelone_instruments.py).

    Deliberately NOT a live download of Angel One's full ~37MB file
    here: that download is genuinely unreliable (confirmed via repeated
    IncompleteRead failures on two different networks, including
    Render's own), and a live API request can't reasonably wait out
    that flakiness. refresh_angelone_instruments.py handles the real
    download on a schedule with a generous retry budget; this just
    reads the small, already-filtered result."""
    with _instrument_lock:
        if _instrument_cache["data"] is not None and _instrument_cache["at"]:
            age_hours = (datetime.utcnow() - _instrument_cache["at"]).total_seconds() / 3600
            if age_hours < INSTRUMENT_CACHE_TTL_HOURS:
                return _instrument_cache["data"]

        data = None
        try:
            from app.storage.r2_client import get_r2_client
            cached = get_r2_client().get_json("angelone/instrument_master_filtered.json")
            if cached:
                data = cached.get("instruments")
        except Exception as e:  # noqa: BLE001
            logger.warning("Instrument master R2 read failed: %s", e)

        if data is None:
            logger.warning(
                "No instrument master available in R2 yet - run "
                "scripts/refresh_angelone_instruments.py at least once. "
                "AngelOne LTP/candle/depth lookups will fall back to yFinance until then."
            )
            return _instrument_cache["data"]  # stale data beats none, if we have any

        _instrument_cache["data"] = data
        _instrument_cache["at"] = datetime.utcnow()
        _instrument_cache["by_symbol"] = {}
        return data


def get_instrument_token(tradingsymbol: str, exchange: str = "NSE") -> Optional[str]:
    """e.g. get_instrument_token('RELIANCE-EQ', 'NSE') -> the numeric
    symboltoken Angel One's API requires for ltpData/getCandleData/etc.
    Equity symbols use the '-EQ' suffix in the instrument master."""
    key = (tradingsymbol.upper(), exchange.upper())
    with _instrument_lock:
        if key in _instrument_cache["by_symbol"]:
            return _instrument_cache["by_symbol"][key]

    instruments = _load_instrument_master()
    if not instruments:
        return None

    with _instrument_lock:
        for inst in instruments:
            k = (str(inst.get("symbol", "")).upper(), str(inst.get("exch_seg", "")).upper())
            if k not in _instrument_cache["by_symbol"]:
                _instrument_cache["by_symbol"][k] = inst.get("token")
        return _instrument_cache["by_symbol"].get(key)


# ------------------------------------------------------------------- reads

def _angelone_ltp(client, tradingsymbol: str, exchange: str = "NSE") -> Optional[Dict]:
    token = get_instrument_token(tradingsymbol, exchange)
    if not token:
        return None
    resp = client.ltpData(exchange, tradingsymbol, token)
    if not resp or not resp.get("status"):
        return None
    d = resp.get("data", {})
    return {"symbol": tradingsymbol, "exchange": exchange, "ltp": d.get("ltp"), "source": "angelone"}


def get_ltp(tradingsymbol: str, exchange: str = "NSE", yfinance_fallback: Optional[Callable] = None) -> Optional[Dict]:
    """Real-time LTP for an NSE/BSE symbol. `yfinance_fallback`, if
    given, must accept the same (tradingsymbol, exchange) args and
    return the same shape - callers own their own fallback function so
    this module never has to know yfinance's ticker-suffix conventions."""
    fallback = yfinance_fallback or (lambda *a, **k: None)
    return with_angelone_fallback(fallback)(_angelone_ltp)(tradingsymbol, exchange)


_INDEX_TOKENS = {"NIFTY": "99926000", "BANKNIFTY": "99926009"}  # same static tokens angelone_option_chain.py uses


def _angelone_index_quote(client, index: str) -> Optional[Dict]:
    token = _INDEX_TOKENS.get(index)
    if not token:
        return None
    resp = client.ltpData("NSE", index, token)
    if not resp or not resp.get("status"):
        return None
    d = resp.get("data", {})
    return {"symbol": index, "ltp": d.get("ltp"), "open": d.get("open"), "close": d.get("close"), "source": "angelone"}


def get_index_quote(index: str, yfinance_fallback: Optional[Callable] = None) -> Optional[Dict]:
    """NIFTY/BANKNIFTY live quote - indices use the well-known static
    tokens (see angelone_option_chain.py's INDEX_TOKENS), not the
    normal equity instrument-master lookup get_ltp() uses."""
    fallback = yfinance_fallback or (lambda *a, **k: None)
    return with_angelone_fallback(fallback)(_angelone_index_quote)(index)


def _angelone_candles(client, tradingsymbol: str, exchange: str, interval: str, from_date: str, to_date: str) -> Optional[List]:
    token = get_instrument_token(tradingsymbol, exchange)
    if not token:
        return None
    params = {
        "exchange": exchange,
        "symboltoken": token,
        "interval": interval,  # ONE_MINUTE, FIVE_MINUTE, ..., ONE_DAY
        "fromdate": from_date,  # "YYYY-MM-DD HH:MM"
        "todate": to_date,
    }
    resp = client.getCandleData(params)
    if not resp or not resp.get("status"):
        return None
    return resp.get("data")  # list of [timestamp, open, high, low, close, volume]


def get_historical_candles(
    tradingsymbol: str, exchange: str, interval: str, from_date: str, to_date: str,
    yfinance_fallback: Optional[Callable] = None,
) -> Optional[List]:
    fallback = yfinance_fallback or (lambda *a, **k: None)
    return with_angelone_fallback(fallback)(_angelone_candles)(tradingsymbol, exchange, interval, from_date, to_date)


def _angelone_market_depth(client, tradingsymbol: str, exchange: str = "NSE") -> Optional[Dict]:
    token = get_instrument_token(tradingsymbol, exchange)
    if not token:
        return None
    resp = client.getMarketData("FULL", {exchange: [token]})
    if not resp or not resp.get("status"):
        return None
    fetched = resp.get("data", {}).get("fetched", [])
    return fetched[0] if fetched else None


def get_market_depth(tradingsymbol: str, exchange: str = "NSE") -> Optional[Dict]:
    """Full quote incl. bid/ask depth - new capability yFinance never
    had. No yFinance fallback (yFinance has no equivalent), so this one
    just returns None if AngelOne isn't available rather than falling
    through to nothing."""
    return with_angelone_fallback(lambda *a, **k: None)(_angelone_market_depth)(tradingsymbol, exchange)


def _angelone_option_greeks(client, name: str, expirydate: str) -> Optional[List[Dict]]:
    resp = client.optionGreek({"name": name, "expirydate": expirydate})
    if not resp or not resp.get("status"):
        return None
    return resp.get("data")


def get_option_greeks(name: str, expirydate: str) -> Optional[List[Dict]]:
    """e.g. get_option_greeks('NIFTY', '28AUG2026'). Cross-check/replace
    for the in-house blackScholes.ts computation - StrataX should log
    any discrepancy between the two rather than silently picking one
    (see IMPLEMENTATION_NOTES.md)."""
    return with_angelone_fallback(lambda *a, **k: None)(_angelone_option_greeks)(name, expirydate)


def _angelone_gainers_losers(client, datatype: str = "PercPriceGainers", expirytype: str = "NEAR") -> Optional[List[Dict]]:
    resp = client.gainersLosers({"datatype": datatype, "expirytype": expirytype})
    if not resp or not resp.get("status"):
        return None
    return resp.get("data")


def get_gainers_losers(datatype: str = "PercPriceGainers") -> Optional[List[Dict]]:
    return with_angelone_fallback(lambda *a, **k: None)(_angelone_gainers_losers)(datatype)


def _angelone_oi_buildup(client, datatype: str = "Long Built Up", expirytype: str = "NEAR") -> Optional[List[Dict]]:
    resp = client.oIBuildup({"datatype": datatype, "expirytype": expirytype})
    if not resp or not resp.get("status"):
        return None
    return resp.get("data")


def get_oi_buildup(datatype: str = "Long Built Up") -> Optional[List[Dict]]:
    return with_angelone_fallback(lambda *a, **k: None)(_angelone_oi_buildup)(datatype)


def health_status() -> Dict[str, Any]:
    """For /api/stratax/data-status and a broader IN-market data-source
    visibility endpoint (Workstream D5) - which source actually served
    the last request, so an all-fallback state is visible, not silent."""
    configured = _session._configured()
    return {
        "angelone_configured": configured,
        "session_active": _session._client is not None,
        "last_source_used": get_last_source_used(),
    }


def verify_live(tradingsymbol: str = "RELIANCE-EQ", exchange: str = "NSE") -> Dict[str, Any]:
    """Exercises the full path (auth -> instrument lookup -> a real
    read) in one call - used by the /api/angelone/health diagnostic
    endpoint to confirm auth and connectivity actually work from
    wherever this is running (a dev machine's flaky network is not the
    same thing as Render's), without needing a separate manual script."""
    client = _session.ensure()
    if client is None:
        return {"ok": False, "step": "auth", "detail": "AngelOne not configured or auth failed - see server logs"}

    token = get_instrument_token(tradingsymbol, exchange)
    if not token:
        return {"ok": False, "step": "instrument_lookup", "detail": f"No token found for {tradingsymbol}/{exchange} - instrument master fetch likely failed"}

    try:
        resp = client.ltpData(exchange, tradingsymbol, token)
        if resp and resp.get("status"):
            return {"ok": True, "step": "ltp", "symbol": tradingsymbol, "ltp": resp.get("data", {}).get("ltp")}
        return {"ok": False, "step": "ltp", "detail": _safe_error(Exception(str(resp)))}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "step": "ltp", "detail": _safe_error(e)}
