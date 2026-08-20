#!/usr/bin/env python3
"""
Weekly free-tier usage guard.

Extends the one-time safety check built into upload_data_to_r2.py into
an ongoing habit (per REPO_AUDIT_REPORT.md §9.1 recommendation) - checks
actual R2 bucket size and Supabase DB size against their free-tier caps,
and alerts via the existing notifications pipeline if either is
approaching the limit. The whole point of this migration was to never
get surprised by a bill or a hard stop again - this is what keeps that
true permanently, not just during the initial migration.

Thresholds: warns at 80% of the free tier, not at 100% - gives time to
act before anything actually breaks or (for R2 specifically) starts
charging the card on file.

Usage:
    python check_free_tier_usage.py
Schedule this weekly (Task Scheduler, or a GitHub Actions cron once the
repo is public and this can run there instead).
"""
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("check_free_tier_usage")

R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024   # 10GB
SUPABASE_FREE_TIER_BYTES = 500 * 1024 * 1024   # 500MB
WARN_THRESHOLD = 0.80


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


def check_r2_usage() -> dict:
    from app.storage.r2_client import get_r2_client
    client = get_r2_client()
    size_bytes = client.approx_bucket_size_bytes()
    pct = size_bytes / R2_FREE_TIER_BYTES
    return {"service": "Cloudflare R2", "bytes": size_bytes, "cap_bytes": R2_FREE_TIER_BYTES, "pct": pct}


def check_supabase_usage() -> dict:
    """Supabase's REST API doesn't expose DB size directly (same reason
    it doesn't expose raw SQL execution - see the schema-apply story
    earlier this session). Uses pg_database_size via a direct Postgres
    connection instead, same as the schema-apply step did."""
    import psycopg2

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        log.warning("SUPABASE_DB_URL not set - skipping Supabase size check")
        return {"service": "Supabase", "bytes": None, "cap_bytes": SUPABASE_FREE_TIER_BYTES, "pct": None}

    conn = psycopg2.connect(db_url, connect_timeout=15)
    cur = conn.cursor()
    cur.execute("SELECT pg_database_size(current_database())")
    size_bytes = cur.fetchone()[0]
    cur.close()
    conn.close()

    pct = size_bytes / SUPABASE_FREE_TIER_BYTES
    return {"service": "Supabase Postgres", "bytes": size_bytes, "cap_bytes": SUPABASE_FREE_TIER_BYTES, "pct": pct}


def _alert(message: str):
    """Reuse the existing notification pipeline rather than building a
    new one - same principle as everywhere else this session: connect
    to what already exists instead of duplicating it."""
    try:
        from app.notifications_api import _send_email, _send_telegram
        _send_email("FinVest: free-tier usage warning", message)
        _send_telegram(f"⚠️ FinVest free-tier warning:\n{message}")
    except Exception as e:
        log.warning("Could not send alert via existing notification channels: %s", e)
    log.warning("ALERT: %s", message)


def main():
    _load_env_file()
    results = []

    try:
        results.append(check_r2_usage())
    except Exception as e:
        log.error("R2 usage check failed: %s", e)

    try:
        results.append(check_supabase_usage())
    except Exception as e:
        log.error("Supabase usage check failed: %s", e)

    for r in results:
        if r["bytes"] is None:
            continue
        gb = r["bytes"] / 1e9
        cap_gb = r["cap_bytes"] / 1e9
        log.info("%s: %.3f GB / %.1f GB (%.1f%%)", r["service"], gb, cap_gb, r["pct"] * 100)

        if r["pct"] >= WARN_THRESHOLD:
            _alert(
                f"{r['service']} is at {r['pct']*100:.1f}% of its free tier "
                f"({gb:.2f}GB / {cap_gb:.1f}GB). Worth checking before it "
                f"hits the cap - {'this one auto-charges past the limit' if 'R2' in r['service'] else 'this one goes read-only past the limit'}."
            )

    log.info("Usage check complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
