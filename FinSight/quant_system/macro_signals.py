"""
Macro / geopolitical risk overlay - Workstream A + F.
======================================================

New capability, independently implemented against free public APIs
(FRED, Finnhub, NASA FIRMS, USGS, data.gov.in). Not a port of any
third-party project's code - World Monitor (referenced in
REPO_AUDIT_REPORT.md §9.2 as the architectural inspiration for this
overlay) is AGPL-3.0 and none of its source was copied; only the
general "cache hot external pulls instead of archiving every one"
discipline was reused, which isn't copyrightable.

Sources, each independently optional (missing key / failed call / bad
response -> that source reports unavailable, nothing else breaks):
  - FRED (FRED_API_KEY): US yield curve (2Y/10Y), Fed funds rate, CPI,
    unemployment - the "macro/rates layer" gap flagged in prior audits.
  - Finnhub (FINNHUB_API_KEY): price-data cross-check/backstop.
  - NASA FIRMS (FIRMS_MAP_KEY): active-fire count as a physical-
    disruption proxy for commodity/energy-relevant regions.
  - USGS (no key): significant-earthquake feed, same role.
  - data.gov.in (DATA_GOV_IN_API_KEY): India retail inflation (CPI-C).
    Only this one dataset has a confirmed resource ID as of this
    session - WPI/IIP/GST/forex reserves/crude output/PLFS unemployment/
    fiscal deficit/GDP growth all need their resource IDs looked up on
    data.gov.in's catalog search (the site 403s on scripted access, so
    this has to be a quick manual lookup) and added to
    DATA_GOV_IN_RESOURCES below - each is a one-line addition once found.
  - Mnemos 1.0's daily analysis (apps/Mnemos/output/analysis_*.json):
    already-generated geopolitical/macro narrative - reused here rather
    than duplicated, since Mnemos already does this qualitative read.
  - RBI DBIE: NOT implemented in this pass. Confirmed no public API
    exists (browse/export portal only, per the session's own ground
    rules) - would need a scheduled download-and-parse job against
    their CSV/Excel exports, a meaningfully bigger effort than any
    other source here. Left as an explicit gap, not a silent skip -
    see IMPLEMENTATION_NOTES.md.

Everything here is read-only aggregation feeding into a `macro_context`
block. It does not create trading signals and does not touch the
decision engine directly - see layer2b_pm_regime_engine.py's own
docstring for why that separation matters (context modifier, not a
signal source). Wiring macro_context into the regime engine as an
actual strictness modifier (matching PM regime's role) is a follow-up,
not done in this file.
"""
import csv
import io
import json
import logging
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# app.storage.r2_client lives under FinSight/backend/ - not on sys.path by
# default when this module is invoked from quant_system/ (e.g. via
# run_full_daily_intelligence.py, which only puts its own script dir on
# sys.path). Same pattern used by FinSight/backend/scripts/*.py reaching
# into app.* from a sibling directory.
_backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

logger = logging.getLogger(__name__)

CACHE_KEY = "macro/context.json"
CACHE_TTL_HOURS = 6  # macro data doesn't move intraday; avoid hammering free-tier rate limits

FRED_SERIES = {
    "yield_10y": "DGS10",
    "yield_2y": "DGS2",
    "fed_funds_rate": "FEDFUNDS",
    "cpi_index": "CPIAUCSL",
    "unemployment_rate": "UNRATE",
}

# resource_id confirmed live against api.data.gov.in during this session (2026-08-21).
# Add more entries here as their resource IDs are found - same call pattern for all of them.
DATA_GOV_IN_RESOURCES = {
    "retail_inflation_cpi": "9d67b242-0243-4298-adf9-7617dbeba7ab",
    # Found via api.data.gov.in/lists (the undocumented catalog-search
    # endpoint the site's own scripted-access block doesn't cover - see
    # the addypy/datagovindia project for how it's used) and confirmed
    # live with real records during this session (2026-08-21).
    "wpi": "239ac3d0-f08d-40d0-b03c-9b7a426a62d5",              # Wholesale Price Index (Base Year 2011-12), till last month
    "crude_oil_production": "7932c3ed-c88d-4e0c-bc39-17e3e3170483",  # Monthly Indigenous Crude Oil Production
    # "iip": None,               # searched - only stale/unrelated OGD resources found, not a live series
    # "gst_collection": None,    # searched - only one-off Rajya Sabha historical tables, no continuously-updated series
    # "forex_reserves": None,    # searched - not published as an OGD resource; RBI's weekly bulletin has no API (see fetch_rbi_dbie)
    # "unemployment_plfs": None, # searched - PLFS tables on OGD are stale (2004-05 to 2011-12 vintage), not current
    # "fiscal_deficit": None,    # searched - only one-off historical Rajya Sabha tables, no continuously-updated series
    # "gdp_growth": None,        # searched - not published as an OGD resource; MOSPI releases as PDF/PIB, not API
}

_MNEMOS_OUTPUT = Path(__file__).resolve().parent.parent.parent / "apps" / "Mnemos" / "output"


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------- FRED (US)

def _fetch_fred_series(series_id: str, api_key: str) -> Optional[float]:
    try:
        resp = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 1,
            },
            timeout=15,
        )
        resp.raise_for_status()
        obs = resp.json().get("observations", [])
        if not obs:
            return None
        value = obs[0].get("value")
        if value in (None, ".", ""):
            return None
        return float(value)
    except Exception as e:  # noqa: BLE001
        logger.warning("FRED fetch failed for series %s: %s", series_id, e)
        return None


def fetch_us_macro() -> Dict[str, Any]:
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        return {"available": False, "reason": "FRED_API_KEY not set"}

    yield_10y = _fetch_fred_series(FRED_SERIES["yield_10y"], api_key)
    yield_2y = _fetch_fred_series(FRED_SERIES["yield_2y"], api_key)
    fed_funds = _fetch_fred_series(FRED_SERIES["fed_funds_rate"], api_key)
    cpi_index = _fetch_fred_series(FRED_SERIES["cpi_index"], api_key)
    unemployment = _fetch_fred_series(FRED_SERIES["unemployment_rate"], api_key)

    yield_curve_spread = (
        round(yield_10y - yield_2y, 3) if yield_10y is not None and yield_2y is not None else None
    )
    got_anything = any(v is not None for v in (yield_10y, yield_2y, fed_funds, cpi_index, unemployment))

    return {
        "available": got_anything,
        "source": "FRED",
        "yield_10y_pct": yield_10y,
        "yield_2y_pct": yield_2y,
        "yield_curve_2y10y_spread_pct": yield_curve_spread,
        "yield_curve_inverted": (yield_curve_spread < 0) if yield_curve_spread is not None else None,
        "fed_funds_rate_pct": fed_funds,
        "cpi_index": cpi_index,
        "unemployment_rate_pct": unemployment,
    }


# --------------------------------------------------------- Finnhub backstop

def fetch_finnhub_quote(symbol: str) -> Optional[Dict[str, Any]]:
    """Cross-check/backstop quote, not a replacement for the main data
    pipeline. Returns None on any failure - callers should already have
    their own primary source and only reach for this opportunistically."""
    api_key = os.environ.get("FINNHUB_API_KEY")
    if not api_key:
        return None
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": symbol, "token": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data or data.get("c") in (None, 0):
            return None
        return {"symbol": symbol, "current": data.get("c"), "prev_close": data.get("pc"), "source": "Finnhub"}
    except Exception as e:  # noqa: BLE001
        logger.debug("Finnhub backstop quote failed for %s: %s", symbol, e)
        return None


# ------------------------------------------------- physical disruption proxies

def fetch_firms_activity() -> Dict[str, Any]:
    """NASA FIRMS active-fire count, last 24h, world-wide - a coarse
    physical-disruption proxy for commodity/energy-relevant regions.
    Works at a reduced rate with no key; FIRMS_MAP_KEY raises the limit."""
    map_key = os.environ.get("FIRMS_MAP_KEY")
    if not map_key:
        return {"available": False, "reason": "FIRMS_MAP_KEY not set"}
    try:
        resp = requests.get(
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/VIIRS_SNPP_NRT/world/1",
            timeout=20,
        )
        resp.raise_for_status()
        lines = [l for l in resp.text.splitlines() if l.strip()]
        # First line is a CSV header; every subsequent line is one detection.
        fire_count = max(len(lines) - 1, 0)
        return {"available": True, "source": "NASA FIRMS", "active_fire_detections_24h": fire_count}
    except Exception as e:  # noqa: BLE001
        logger.warning("FIRMS fetch failed: %s", e)
        return {"available": False, "reason": str(e)}


def fetch_firms_points(max_points: int = 800) -> Dict[str, Any]:
    """Individual fire-detection points for map display - fetch_firms_activity()
    above only ever kept the count, discarding lat/lon. The raw world feed
    is 70k+ rows/day (too many to render), so this keeps only 'nominal'/
    'high' confidence detections, ranks by FRP (fire radiative power - the
    actual intensity signal, not just detection count) and caps at
    max_points. Separate from fetch_firms_activity's own cache - this is
    for the map page, refreshed on its own shorter cadence."""
    map_key = os.environ.get("FIRMS_MAP_KEY")
    if not map_key:
        return {"available": False, "reason": "FIRMS_MAP_KEY not set", "points": []}
    try:
        resp = requests.get(
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/VIIRS_SNPP_NRT/world/1",
            timeout=20,
        )
        resp.raise_for_status()
        reader = csv.DictReader(io.StringIO(resp.text))
        points = []
        for row in reader:
            if row.get("confidence") not in ("n", "h"):
                continue
            try:
                points.append({
                    "lat": float(row["latitude"]),
                    "lon": float(row["longitude"]),
                    "frp": float(row.get("frp") or 0),
                    "confidence": row.get("confidence"),
                })
            except (ValueError, KeyError):
                continue
        points.sort(key=lambda p: p["frp"], reverse=True)
        return {
            "available": True,
            "source": "NASA FIRMS",
            "total_detections_24h": len(points),
            "points": points[:max_points],
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("FIRMS points fetch failed: %s", e)
        return {"available": False, "reason": str(e), "points": []}


def fetch_usgs_earthquake_points() -> Dict[str, Any]:
    """Individual earthquake points (M2.5+, last 7 days - the 'all' feed
    at that magnitude, wider coverage than the significant-only summary
    fetch_usgs_earthquakes() uses) for map display."""
    try:
        resp = requests.get(
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson",
            timeout=15,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        points = []
        for f in features:
            coords = f.get("geometry", {}).get("coordinates")
            props = f.get("properties", {})
            if not coords or len(coords) < 2:
                continue
            points.append({
                "lat": coords[1],
                "lon": coords[0],
                "mag": props.get("mag"),
                "place": props.get("place"),
                "time": props.get("time"),
            })
        return {"available": True, "source": "USGS", "points": points}
    except Exception as e:  # noqa: BLE001
        logger.warning("USGS points fetch failed: %s", e)
        return {"available": False, "reason": str(e), "points": []}


def fetch_usgs_earthquakes() -> Dict[str, Any]:
    """USGS significant-earthquake feed, last 7 days. No key required."""
    try:
        resp = requests.get(
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
            timeout=15,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        magnitudes = [f["properties"]["mag"] for f in features if f.get("properties", {}).get("mag") is not None]
        return {
            "available": True,
            "source": "USGS",
            "significant_earthquakes_7d": len(features),
            "max_magnitude_7d": max(magnitudes) if magnitudes else None,
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("USGS fetch failed: %s", e)
        return {"available": False, "reason": str(e)}


# --------------------------------------------------------------- India (data.gov.in)

def _fetch_data_gov_in_resource(resource_id: str, api_key: str, limit: int = 5) -> Optional[List[Dict]]:
    # IMPORTANT: uses urllib, not requests, deliberately. Verified during
    # this session (2026-08-21) that `requests.get()` against
    # api.data.gov.in times out ~100% of the time (tested 3x back-to-back,
    # 10-15s timeout every time) while urllib.request.urlopen() against
    # the exact same URL succeeds in <1s every time. Root cause not fully
    # isolated (likely a urllib3/requests HTTP negotiation quirk this
    # particular server trips on) - but the fix is proven, not guessed:
    # every previous "data.gov.in is just slow" log line this session was
    # actually this bug, not real API latency.
    for attempt, timeout in enumerate((10, 20)):
        try:
            url = (
                f"https://api.data.gov.in/resource/{resource_id}"
                f"?api-key={api_key}&format=json&limit={limit}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = json.loads(r.read().decode("utf-8"))
            return body.get("records", [])
        except Exception as e:  # noqa: BLE001
            if attempt == 1:
                logger.warning("data.gov.in fetch failed for resource %s after retry: %s", resource_id, e)
                return None
            logger.debug("data.gov.in fetch attempt %d failed for resource %s, retrying: %s", attempt, resource_id, e)


def fetch_india_macro() -> Dict[str, Any]:
    api_key = os.environ.get("DATA_GOV_IN_API_KEY")
    if not api_key:
        return {"available": False, "reason": "DATA_GOV_IN_API_KEY not set"}

    result: Dict[str, Any] = {"available": False, "source": "data.gov.in", "datasets": {}}
    for name, resource_id in DATA_GOV_IN_RESOURCES.items():
        if not resource_id:
            continue
        records = _fetch_data_gov_in_resource(resource_id, api_key)
        if records:
            result["datasets"][name] = records
            result["available"] = True

    result["missing_datasets"] = [
        name for name, rid in DATA_GOV_IN_RESOURCES.items() if not rid
    ] + [
        name for name in ("iip", "gst_collection", "forex_reserves",
                           "unemployment_plfs", "fiscal_deficit", "gdp_growth")
        if name not in DATA_GOV_IN_RESOURCES
    ]
    return result


def fetch_rbi_dbie() -> Dict[str, Any]:
    """Not implemented - see module docstring. RBI DBIE has no public
    API; this would need a scheduled download-and-parse job against
    their CSV/Excel export endpoints, tracked as a follow-up rather than
    silently skipped."""
    return {"available": False, "reason": "RBI DBIE has no public API - export-scrape not yet built (see IMPLEMENTATION_NOTES.md)"}


# ------------------------------------------------------------- Mnemos narrative

def fetch_mnemos_geopolitical_narrative() -> Dict[str, Any]:
    """Reuses Mnemos 1.0's already-generated qualitative macro/geopolitical
    read instead of duplicating that analysis. Most recent analysis_*.json
    only, not a lookback window - same freshness caveat as the rest of
    Mnemos's output (see mnemos_api.py)."""
    try:
        if not _MNEMOS_OUTPUT.exists():
            return {"available": False, "reason": "Mnemos output directory not found"}
        analysis_files = sorted(_MNEMOS_OUTPUT.glob("analysis_*.json"), reverse=True)
        if not analysis_files:
            return {"available": False, "reason": "No Mnemos analysis files found"}
        data = json.loads(analysis_files[0].read_text(encoding="utf-8"))
        return {
            "available": True,
            "source": "Mnemos 1.0",
            "date": data.get("date"),
            "global_macro_geopolitics": data.get("global_macro_geopolitics"),
            "india_markets_policy": data.get("india_markets_policy"),
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("Mnemos narrative fetch failed: %s", e)
        return {"available": False, "reason": str(e)}


# --------------------------------------------------------------------- synth

def _synthesize_summary(us: Dict, india: Dict, physical: Dict) -> str:
    """Plain-language 1-2 sentence synthesis, reporting only what the
    signals actually say - same non-inventing-numbers discipline Layer 7's
    LLM interpreter already follows. No LLM call here; this is a
    template over real values, not a generated narrative."""
    parts = []
    if us.get("available") and us.get("yield_curve_2y10y_spread_pct") is not None:
        spread = us["yield_curve_2y10y_spread_pct"]
        if us.get("yield_curve_inverted"):
            parts.append(f"US yield curve inverted ({spread:+.2f}pp, 2Y/10Y) - a historically reliable recession signal.")
        else:
            parts.append(f"US yield curve normal ({spread:+.2f}pp, 2Y/10Y).")
    if physical.get("available") is not False:
        fires = physical.get("firms", {}).get("active_fire_detections_24h")
        quakes = physical.get("usgs", {}).get("significant_earthquakes_7d")
        if fires is not None or quakes is not None:
            bits = []
            if fires is not None:
                bits.append(f"{fires:,} active fire detections (24h)")
            if quakes is not None:
                bits.append(f"{quakes} significant earthquakes (7d)")
            if bits:
                parts.append("Physical disruption proxies: " + ", ".join(bits) + ".")
    if not parts:
        return "Macro context unavailable - no data sources configured or reachable."
    return " ".join(parts)


MAP_CACHE_KEY = "macro/map_points.json"
MAP_CACHE_TTL_HOURS = 1  # points refresh more often than the 6h macro summary - they're the actual "live map" feature


def compute_map_context(force_refresh: bool = False) -> Dict[str, Any]:
    """FIRMS fire points + USGS earthquake points for the Macro Intel map
    page. Separate cache from compute_macro_context - shorter TTL since
    a map that never visibly updates isn't much of a live map, and
    keeping it independent means a slow point-fetch never adds latency
    to the (already 5-source) main macro context call."""
    _load_env_file()

    if not force_refresh:
        try:
            from app.storage.r2_client import get_r2_client
            cached = get_r2_client().get_json(MAP_CACHE_KEY)
            if cached and cached.get("as_of"):
                age_hours = (
                    datetime.now(timezone.utc) - datetime.fromisoformat(cached["as_of"])
                ).total_seconds() / 3600
                if age_hours < MAP_CACHE_TTL_HOURS:
                    cached["from_cache"] = True
                    return cached
        except Exception as e:  # noqa: BLE001
            logger.debug("Map context cache read failed (will recompute): %s", e)

    firms = fetch_firms_points()
    usgs = fetch_usgs_earthquake_points()

    context = {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "from_cache": False,
        "firms": firms,
        "usgs": usgs,
    }

    try:
        from app.storage.r2_client import get_r2_client
        get_r2_client().put_json(MAP_CACHE_KEY, context)
    except Exception as e:  # noqa: BLE001
        logger.debug("Map context cache write failed (non-fatal): %s", e)

    return context


def compute_macro_context(force_refresh: bool = False) -> Dict[str, Any]:
    """Main entry point. Checks the R2 cache first (CACHE_TTL_HOURS);
    only calls out to every source when the cache is missing/stale or
    force_refresh is set. Never raises - a total failure here still
    returns a well-formed dict with available=False fields, matching
    the fail-open discipline layer2b_pm_regime_engine.py already uses."""
    _load_env_file()

    if not force_refresh:
        try:
            from app.storage.r2_client import get_r2_client
            cached = get_r2_client().get_json(CACHE_KEY)
            if cached and cached.get("as_of"):
                age_hours = (
                    datetime.now(timezone.utc) - datetime.fromisoformat(cached["as_of"])
                ).total_seconds() / 3600
                if age_hours < CACHE_TTL_HOURS:
                    cached["from_cache"] = True
                    return cached
        except Exception as e:  # noqa: BLE001
            logger.debug("Macro context cache read failed (will recompute): %s", e)

    us = fetch_us_macro()
    india = fetch_india_macro()
    rbi = fetch_rbi_dbie()
    firms = fetch_firms_activity()
    usgs = fetch_usgs_earthquakes()
    mnemos = fetch_mnemos_geopolitical_narrative()

    physical = {
        "available": firms.get("available") or usgs.get("available"),
        "firms": firms,
        "usgs": usgs,
    }

    context = {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "from_cache": False,
        "us": us,
        "india": {**india, "rbi_dbie": rbi},
        "physical_disruption": physical,
        "geopolitical_narrative": mnemos,
        "summary": _synthesize_summary(us, india, physical),
    }

    try:
        from app.storage.r2_client import get_r2_client
        get_r2_client().put_json(CACHE_KEY, context)
    except Exception as e:  # noqa: BLE001
        logger.debug("Macro context cache write failed (non-fatal): %s", e)

    return context


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(compute_macro_context(force_refresh=True), indent=2, default=str))
