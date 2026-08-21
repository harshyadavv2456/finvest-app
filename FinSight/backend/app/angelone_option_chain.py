"""
StrataX option-chain reconstruction from AngelOne - Workstream D4.

AngelOne's API has no single option-chain endpoint (confirmed on their
own developer forum) - reconstructed here from the instrument master
(NIFTY/BANKNIFTY option tokens for the nearest expiry) plus batched
getMarketData quote pulls and one optionGreek call for IV/Greeks per
expiry. Output matches the exact row shape
stratax/csv_data_provider.py already produces (verified against that
file directly) so StrataXOptionChain.tsx and everything downstream of
it needs zero changes - this is a drop-in replacement data source, not
a new feature the frontend has to learn.

Read-only, same as the rest of angelone_provider.py. Falls back to the
existing CSV provider (stale NSE snapshot) if AngelOne isn't
configured or any step here fails - never a hard error, matching D3's
fallback discipline. The CSV path stays in place as that fallback (not
deleted per D5 yet) until this is confirmed working end-to-end across
a real trading session.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.angelone_provider import _session, get_last_source_used, _record_source, _safe_error

logger = logging.getLogger(__name__)

MAX_TOKENS_PER_QUOTE_REQUEST = 50  # AngelOne's documented batch limit for getMarketData

# Well-known, stable NSE index tokens (not equities, so not in the
# equities-filtered instrument master) - publicly documented constants,
# used only to fetch the underlying spot price for ATM highlighting.
INDEX_TOKENS = {"NIFTY": "99926000", "BANKNIFTY": "99926009"}


def _parse_strike(raw: str) -> float:
    # Instrument master stores strikes *100 (e.g. "3000000.000000" -> 30000.00)
    return float(raw) / 100


def _parse_expiry_to_iso(expiry: str) -> str:
    # "29DEC2026" -> "2026-12-29"
    try:
        return datetime.strptime(expiry, "%d%b%Y").strftime("%Y-%m-%d")
    except ValueError:
        return expiry


def get_available_symbols() -> List[str]:
    """Underlyings this reconstruction supports - derived live from
    whatever NFO option instruments are actually present in the cached
    instrument master, rather than a hardcoded list that could drift
    from refresh_angelone_instruments.py's own RELEVANT_FNO_UNDERLYINGS."""
    from app.angelone_provider import _load_instrument_master
    instruments = _load_instrument_master()
    if not instruments:
        return []
    return sorted({
        inst["name"] for inst in instruments
        if inst.get("exch_seg") == "NFO" and inst.get("instrumenttype") in ("OPTIDX", "OPTSTK") and inst.get("name")
    })


def get_available_expiries(symbol: str) -> List[str]:
    from app.angelone_provider import _load_instrument_master
    instruments = _load_instrument_master()
    if not instruments:
        return []
    expiries = sorted(
        {inst["expiry"] for inst in instruments if inst.get("exch_seg") == "NFO" and inst.get("name") == symbol},
        key=lambda e: datetime.strptime(e, "%d%b%Y") if e else datetime.max,
    )
    return expiries


def _batched(items: List, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def get_option_chain(symbol: str, expiry: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns rows in the exact shape stratax/csv_data_provider.py's
    _load_csv_rows() produces. Empty list (not an exception) on any
    failure - callers already treat an empty chain the same way an
    empty/missing CSV is treated today."""
    client = _session.ensure()
    if client is None:
        logger.info("AngelOne not available for option chain reconstruction - caller should fall back to CSV")
        return []

    from app.angelone_provider import _load_instrument_master
    instruments = _load_instrument_master()
    if not instruments:
        return []

    symbol_options = [
        inst for inst in instruments
        if inst.get("exch_seg") == "NFO" and inst.get("name") == symbol
        and inst.get("instrumenttype") in ("OPTIDX", "OPTSTK")  # index options and stock options both
    ]
    if not symbol_options:
        logger.warning("No NFO option instruments found for %s in the cached instrument master", symbol)
        return []

    if not expiry:
        expiries = sorted(
            {i["expiry"] for i in symbol_options},
            key=lambda e: datetime.strptime(e, "%d%b%Y"),
        )
        expiry = expiries[0] if expiries else None
    if not expiry:
        return []

    chain_instruments = [i for i in symbol_options if i["expiry"] == expiry]
    if not chain_instruments:
        return []

    # Underlying spot price, for the frontend's ATM highlighting. Indices
    # use the well-known static tokens (not in the equities-filtered
    # instrument master, since they're not equities); stocks resolve via
    # the normal equity instrument lookup (already in the same master).
    underlying_ltp = None
    index_token = INDEX_TOKENS.get(symbol)
    try:
        if index_token:
            resp = client.ltpData("NSE", symbol, index_token)
        else:
            from app.angelone_provider import get_instrument_token
            eq_token = get_instrument_token(f"{symbol}-EQ", "NSE")
            resp = client.ltpData("NSE", f"{symbol}-EQ", eq_token) if eq_token else None
        if resp and resp.get("status"):
            underlying_ltp = resp.get("data", {}).get("ltp")
    except Exception as e:  # noqa: BLE001
        logger.info("Underlying LTP fetch failed for %s (chain still works, just no ATM anchor): %s", symbol, _safe_error(e))

    # Batch quote pulls - getMarketData takes {exchange: [tokens]}, capped
    # at MAX_TOKENS_PER_QUOTE_REQUEST per AngelOne's documented limit.
    quotes_by_token: Dict[str, Dict] = {}
    tokens = [i["token"] for i in chain_instruments]
    try:
        for batch in _batched(tokens, MAX_TOKENS_PER_QUOTE_REQUEST):
            resp = client.getMarketData("FULL", {"NFO": batch})
            if resp and resp.get("status"):
                for q in resp.get("data", {}).get("fetched", []):
                    quotes_by_token[str(q.get("symbolToken"))] = q
    except Exception as e:  # noqa: BLE001
        logger.warning("getMarketData batch failed for %s %s: %s", symbol, expiry, _safe_error(e))
        _record_source("none", "get_option_chain")
        return []

    # One optionGreek call for the whole expiry - gets IV/Greeks for every
    # strike in one request rather than per-instrument. The response has
    # no trading-symbol field to join on (checked live) - it identifies
    # each row by (strikePrice, optionType) instead.
    greeks_by_strike_type: Dict[tuple, Dict] = {}
    try:
        resp = client.optionGreek({"name": symbol, "expirydate": expiry})
        if resp and resp.get("status"):
            for g in resp.get("data", []) or []:
                try:
                    key = (round(float(g.get("strikePrice", 0)), 2), g.get("optionType", ""))
                    greeks_by_strike_type[key] = g
                except (TypeError, ValueError):
                    continue
    except Exception as e:  # noqa: BLE001
        logger.info("optionGreek failed for %s %s (chain will still return without IV): %s", symbol, expiry, _safe_error(e))

    expiry_iso = _parse_expiry_to_iso(expiry)
    now_iso = datetime.utcnow().isoformat()
    rows: List[Dict[str, Any]] = []

    for inst in chain_instruments:
        token = inst["token"]
        quote = quotes_by_token.get(token, {})
        opt_type = "CE" if inst["symbol"].endswith("CE") else "PE"
        strike_val = _parse_strike(inst["strike"])
        greek = greeks_by_strike_type.get((round(strike_val, 2), opt_type), {})

        depth = quote.get("depth", {})
        best_bid = (depth.get("buy") or [{}])[0] if isinstance(depth.get("buy"), list) else {}
        best_ask = (depth.get("sell") or [{}])[0] if isinstance(depth.get("sell"), list) else {}

        rows.append({
            "symbol": inst["symbol"],
            "kind": "index",
            "underlying": symbol,
            "underlyingValue": underlying_ltp,
            "timestamp": now_iso,
            "expiryDate": expiry_iso,
            "strikePrice": strike_val,
            "optionType": opt_type,
            "lastPrice": quote.get("ltp"),
            "change": quote.get("netChange"),
            "pChange": quote.get("percentChange"),
            "openInterest": quote.get("opnInterest"),
            "changeInOI": None,  # not directly in getMarketData's FULL response - left None rather than guessed
            "totalTradedVolume": quote.get("tradeVolume"),
            "impliedVolatility": greek.get("impliedVolatility"),
            "bidQty": best_bid.get("quantity"),
            "bidPrice": best_bid.get("price"),
            "askPrice": best_ask.get("price"),
            "askQty": best_ask.get("quantity"),
            "identifier": token,
        })

    _record_source("angelone", "get_option_chain")
    logger.info("Reconstructed %d-row option chain for %s %s from AngelOne", len(rows), symbol, expiry)
    return rows
