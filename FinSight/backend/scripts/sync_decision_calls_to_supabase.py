#!/usr/bin/env python3
"""
Sync decision_logger.py's local JSONL call log into Supabase.

Same pattern as sync_news_intelligence.py / sync_intelligence_to_supabase.py
in this repo: local write for resilience (the decision engine never
depends on network availability to make a call), separate sync step.

Usage:
    python sync_decision_calls_to_supabase.py
"""
import json
import logging
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("sync_decision_calls_to_supabase")

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "state" / "decision_calls"
STATE_FILE = Path(__file__).resolve().parent.parent.parent / "state" / "decision_calls_sync_state.json"
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


def _sanitize(obj):
    """Same NaN-guard as sync_intelligence_to_supabase.py - the signal
    state embeds ProbabilisticOutcome/EfficacyReport fields, which can
    legitimately contain NaN from insufficient-data cases."""
    if isinstance(obj, float) and (obj != obj or obj in (float("inf"), float("-inf"))):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def get_supabase():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def main():
    _load_env_file()

    if not LOG_DIR.exists():
        log.info("No decision_calls log dir yet - nothing to sync")
        return 0

    state = load_state()
    synced_call_ids = set(state.get("synced_call_ids", []))

    supabase = get_supabase()
    batch = []
    total_new = 0

    for log_file in sorted(LOG_DIR.glob("*.jsonl")):
        for line in log_file.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                log.warning("Skipping malformed line in %s", log_file)
                continue

            call_id = record.get("call_id")
            if not call_id or call_id in synced_call_ids:
                continue

            row = {
                "call_id": call_id,
                "ticker": record["ticker"],
                "market": record["market"],
                "called_at_utc": record["called_at_utc"],
                "review_after_utc": record["review_after_utc"],
                "model_version": record["model_version"],
                "decision": _sanitize(record["decision"]),
                "signal_state": _sanitize(record["signal_state"]),
                "status": record.get("status", "open"),
            }
            batch.append(row)
            synced_call_ids.add(call_id)
            total_new += 1

            if len(batch) >= BATCH_SIZE:
                supabase.table("decision_calls").upsert(batch, on_conflict="call_id").execute()
                log.info("Synced batch of %d calls", len(batch))
                batch = []
                save_state({"synced_call_ids": list(synced_call_ids)})  # checkpoint mid-run too

    if batch:
        supabase.table("decision_calls").upsert(batch, on_conflict="call_id").execute()
        log.info("Synced final batch of %d calls", len(batch))

    save_state({"synced_call_ids": list(synced_call_ids)})
    log.info("Done. %d new calls synced (%d total tracked).", total_new, len(synced_call_ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
