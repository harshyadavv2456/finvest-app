#!/usr/bin/env python3
"""
Sync the quant engine's per-ticker intelligence JSON into Supabase's
intelligence_snapshots table.

This is the piece that actually connects the two independent signal
sources (quant + news) - insights_api.py's cross-signal comparison reads
from intelligence_snapshots, and until this script runs, that table is
empty even though the news side (sync_news_intelligence.py) is populated.

Reads from FinSight/public/intelligence/{market}/{ticker}.json (the
existing output of quant_system/run_full_daily_intelligence.py) and
upserts into Supabase. Additive/idempotent - upserts on (market, ticker),
overwriting the previous snapshot the same way the local JSON files
already do (see r2_client.py's overwrite-in-place design note - same
principle applies here: one current row per ticker, not one row per day
forever).

Also appends a row to intelligence_history (bounded, 90-day retention via
prune_old_intelligence_history() in supabase_schema.sql) so the historical
trend that public/intelligence/history/ used to provide - before it was
deleted for being unbounded and abandoned - exists again, correctly
bounded this time.

Usage:
    python sync_intelligence_to_supabase.py
"""
import json
import logging
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("sync_intelligence_to_supabase")

INTEL_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "intelligence"
MARKETS = ["US", "IN"]  # intelligence-enabled markets, per main.py's own docstring
BATCH_SIZE = 200


def _load_env_file():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def get_supabase():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _sanitize_json(obj):
    """Recursively replace NaN/Infinity floats with None. Python's json
    module happily serializes float('nan') as the bareword `NaN`, which
    is not valid JSON per spec - Postgres's JSON parser (correctly)
    rejects it. The quant pipeline's numeric output can produce NaN from
    e.g. a ratio computed over insufficient data, so this has to be
    handled here rather than assumed away."""
    if isinstance(obj, float):
        if obj != obj or obj in (float("inf"), float("-inf")):  # obj != obj is the NaN check
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_json(v) for v in obj]
    return obj


def main():
    _load_env_file()

    if not INTEL_DIR.exists():
        log.error("Intelligence dir not found: %s", INTEL_DIR)
        return 1

    supabase = get_supabase()
    today = date.today().isoformat()

    snapshot_rows = []
    history_rows = []

    for market in MARKETS:
        market_dir = INTEL_DIR / market
        if not market_dir.exists():
            log.warning("No intelligence dir for market %s, skipping", market)
            continue

        count = 0
        for f in market_dir.glob("*.json"):
            ticker = f.stem
            try:
                payload = json.loads(f.read_text(encoding="utf-8"))
                payload = _sanitize_json(payload)
            except Exception as e:
                log.warning("Failed to parse %s: %s", f, e)
                continue

            as_of = payload.get("as_of_date", today)
            snapshot_rows.append({
                "market": market, "ticker": ticker, "as_of_date": as_of, "payload": payload,
            })
            history_rows.append({
                "market": market, "ticker": ticker, "as_of_date": as_of, "payload": payload,
            })
            count += 1

        log.info("Market %s: %d tickers found", market, count)

    if not snapshot_rows:
        log.warning("Nothing to sync - is the intelligence pipeline populated locally?")
        return 0

    for i in range(0, len(snapshot_rows), BATCH_SIZE):
        batch = snapshot_rows[i : i + BATCH_SIZE]
        supabase.table("intelligence_snapshots").upsert(batch, on_conflict="market,ticker").execute()
        log.info("Synced live snapshot batch: %d rows (%d-%d)", len(batch), i, i + len(batch))

    for i in range(0, len(history_rows), BATCH_SIZE):
        batch = history_rows[i : i + BATCH_SIZE]
        supabase.table("intelligence_history").upsert(batch, on_conflict="market,ticker,as_of_date").execute()
        log.info("Synced history batch: %d rows (%d-%d)", len(batch), i, i + len(batch))

    # Keep intelligence_history bounded - this is the step that makes the
    # historical archive safe, unlike the unbounded one that got deleted.
    try:
        supabase.rpc("prune_old_intelligence_history").execute()
        log.info("Pruned old intelligence_history rows (90-day retention)")
    except Exception as e:
        log.warning("Prune call failed (non-fatal, will retry next run): %s", e)

    log.info("Done. %d tickers synced to intelligence_snapshots + intelligence_history.", len(snapshot_rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
