#!/usr/bin/env python3
"""
Downloads Angel One's instrument master (~37MB, ~115k instruments across
every exchange/segment they support) and caches a filtered, much smaller
subset to R2: NSE/BSE equities (needed for LTP/quote/candle lookups) plus
NFO options for NIFTY and BANKNIFTY (needed for StrataX's option-chain
reconstruction, Workstream D4).

Why this is a separate scheduled script instead of a live in-request
download (which is what angelone_provider.py originally tried): the full
file's download is genuinely unreliable - confirmed via repeated
IncompleteRead failures on two different networks (a dev machine and
Render itself), not a code bug. A live API request can't reasonably wait
out that flakiness. Running this on a schedule (like upload_data_to_r2.py
et al.) with a generous retry budget, then having the provider module
just read the small pre-filtered R2 object, is the same "hydrate once,
serve fast" pattern already used for the tickers manifest and the static
intelligence bundle.

Usage:
    python refresh_angelone_instruments.py
"""
import json
import logging
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("refresh_angelone_instruments")

INSTRUMENT_MASTER_URL = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"
R2_KEY = "angelone/instrument_master_filtered.json"
MAX_ATTEMPTS = 6
RELEVANT_FNO_UNDERLYINGS = {"NIFTY", "BANKNIFTY"}


def _load_env_file():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _download_with_retries() -> list:
    last_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            log.info("Download attempt %d/%d...", attempt, MAX_ATTEMPTS)
            resp = requests.get(INSTRUMENT_MASTER_URL, timeout=180, stream=True)
            resp.raise_for_status()
            chunks = []
            for chunk in resp.iter_content(chunk_size=256 * 1024):
                if chunk:
                    chunks.append(chunk)
            raw = b"".join(chunks)
            data = json.loads(raw)
            log.info("Downloaded %d instruments successfully on attempt %d", len(data), attempt)
            return data
        except Exception as e:  # noqa: BLE001
            last_error = e
            log.warning("Attempt %d failed: %s", attempt, e)
            time.sleep(min(5 * attempt, 30))
    raise RuntimeError(f"Failed to download instrument master after {MAX_ATTEMPTS} attempts: {last_error}")


def _filter(instruments: list) -> list:
    filtered = []
    for inst in instruments:
        exch = inst.get("exch_seg", "")
        itype = inst.get("instrumenttype", "")
        name = inst.get("name", "")

        if exch in ("NSE", "BSE") and itype in ("", "EQ"):
            filtered.append(inst)
        elif exch == "NFO" and name in RELEVANT_FNO_UNDERLYINGS:
            filtered.append(inst)

    return filtered


def main():
    _load_env_file()
    from app.storage.r2_client import get_r2_client

    instruments = _download_with_retries()
    filtered = _filter(instruments)
    log.info("Filtered %d -> %d instruments (NSE/BSE equities + NIFTY/BANKNIFTY F&O)", len(instruments), len(filtered))

    if len(filtered) < 1000:
        log.error("Filtered result looks too small (%d) - refusing to publish a possibly-broken filter", len(filtered))
        return 1

    from datetime import datetime, timezone
    client = get_r2_client()
    client.put_json(R2_KEY, {
        "_cached_at": datetime.now(timezone.utc).isoformat(),
        "count": len(filtered),
        "instruments": filtered,
    })
    log.info("Uploaded filtered instrument master to R2 key '%s'", R2_KEY)
    return 0


if __name__ == "__main__":
    sys.exit(main())
