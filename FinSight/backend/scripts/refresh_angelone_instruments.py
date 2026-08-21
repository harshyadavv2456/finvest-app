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
    """Confirmed live (2026-08-21): plain restart-from-scratch retries
    fail reliably - the connection drops mid-stream on essentially every
    attempt, on three different networks (a dev machine, Render, and
    GitHub Actions' own runners), always at a different random byte
    offset. Not a client-network problem; Angel One's file server (an
    AWS ELB) seems to cut long-lived streaming responses for this
    specific large file.

    Fix: the server supports HTTP Range requests (confirmed: a
    `curl -r 0-1023` returns 206 Partial Content), so resume from the
    last successfully-received byte instead of restarting from zero on
    every retry. Each individual attempt only needs to make forward
    progress, not complete the whole file in one unbroken connection."""
    buf = bytearray()
    consecutive_no_progress = 0

    for attempt in range(1, MAX_ATTEMPTS * 3 + 1):  # more attempts since each one may only add a small amount
        headers = {"Range": f"bytes={len(buf)}-"} if buf else {}
        try:
            resp = requests.get(INSTRUMENT_MASTER_URL, headers=headers, timeout=90, stream=True)
            if resp.status_code not in (200, 206):
                resp.raise_for_status()

            before = len(buf)
            for chunk in resp.iter_content(chunk_size=256 * 1024):
                if chunk:
                    buf.extend(chunk)
            gained = len(buf) - before
            log.info("Attempt %d: +%d bytes (total %d)", attempt, gained, len(buf))
            consecutive_no_progress = 0 if gained > 0 else consecutive_no_progress + 1

            try:
                data = json.loads(bytes(buf))
                log.info("Download complete and valid JSON: %d instruments (%d bytes, %d attempts)", len(data), len(buf), attempt)
                return data
            except json.JSONDecodeError:
                pass  # not done yet, more bytes needed - loop and resume

        except Exception as e:  # noqa: BLE001
            log.warning("Attempt %d failed at %d bytes: %s", attempt, len(buf), e)
            consecutive_no_progress += 1

        if consecutive_no_progress >= 5:
            raise RuntimeError(f"No progress in 5 consecutive attempts, stuck at {len(buf)} bytes")
        time.sleep(3)

    raise RuntimeError(f"Failed to complete instrument master download after {MAX_ATTEMPTS * 3} attempts, stuck at {len(buf)} bytes")


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
