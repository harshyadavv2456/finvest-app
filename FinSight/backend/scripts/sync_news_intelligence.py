#!/usr/bin/env python3
"""
Sync FinVest News's local SQLite DB into Supabase.

This is intentionally a SEPARATE script from finvest_news_intelligence_v2.py,
which is not touched by this project and keeps running exactly as it always
has, locally, 24/7. This script only reads from the .db file it produces.

Why this has to run LOCALLY (Task Scheduler), not on GitHub Actions:
    finvest_news_intelligence.db lives at E:\\FinVest News\\ on this machine
    only. GitHub-hosted runners have no access to it. Everything else in the
    pipeline (market data, quant intelligence) can run on GitHub Actions
    because it pulls from public APIs — this step can't, because its only
    data source is a local file. See REPO_AUDIT_REPORT.md §3A.5/§7 Phase 1B.

How it stays cheap and safe to run unattended:
    - Watermarked: only rows newer than the last successful sync are read
      and pushed, via `synced_at` state kept in a small local JSON file
      (state/news_sync_state.json) — not by trusting Supabase round-trips
      for "what's new," which would be slower and more fragile.
    - Upserts on a unique key (article_hash / digest_date), so a re-run
      after a partial failure never creates duplicates.
    - No secrets from finvest_news_intelligence_v2.py are read or touched —
      this script only opens the .db file, nothing else in that folder.

Usage:
    python sync_news_intelligence.py                  # one-shot sync
    python sync_news_intelligence.py --loop --every 900   # every 15 min, matches the news script's own cycle
"""
import argparse
import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("sync_news_intelligence")

# ---------------------------------------------------------------- config

NEWS_DB_PATH = Path(os.environ.get("FINVEST_NEWS_DB_PATH", r"E:\FinVest News\finvest_news_intelligence.db"))
STATE_DIR = Path(__file__).resolve().parent.parent / "state"
STATE_FILE = STATE_DIR / "news_sync_state.json"

BATCH_SIZE = 500


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def get_supabase():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _load_env_file():
    """Minimal .env loader so this script works standalone via
    `python sync_news_intelligence.py`, not just through the FastAPI app
    (which loads FinSight/backend/.env itself via python-dotenv)."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------- sync steps

def sync_articles(sqlite_con: sqlite3.Connection, supabase, since_id: int) -> int:
    cur = sqlite_con.cursor()
    cur.execute(
        """
        SELECT id, article_hash, source, category, title, summary, url,
               published_at, fetched_at_ist, fetched_at_utc, keyword_score,
               ai_analyzed, sentiment, sentiment_score, impact_level,
               impact_score, impacted_sectors, impacted_stocks,
               impact_reasoning, market_action, key_signal, confidence,
               alert_sent
        FROM news_articles
        WHERE id > ?
        ORDER BY id ASC
        """,
        (since_id,),
    )
    rows = cur.fetchall()
    if not rows:
        return since_id

    cols = [d[0] for d in cur.description]
    max_id = since_id

    # SQLite is loosely typed - some historical rows (from before the
    # schema stabilized, back in the source script's early days) have
    # qualitative strings like "MEDIUM" sitting in numeric columns.
    # Coerce defensively rather than let one bad historical row fail an
    # entire batch upsert.
    numeric_fields = {"keyword_score", "sentiment_score", "impact_score", "confidence"}

    def _coerce_numeric(value):
        if value is None or isinstance(value, (int, float)):
            return value
        try:
            return float(value)
        except (TypeError, ValueError):
            return None  # e.g. "MEDIUM" ended up in a numeric column - drop it, don't crash

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        payload = []
        for row in batch:
            rec = dict(zip(cols, row))
            max_id = max(max_id, rec["id"])
            rec.pop("id", None)  # let Supabase assign its own bigserial id
            rec["ai_analyzed"] = bool(rec.get("ai_analyzed"))
            rec["alert_sent"] = bool(rec.get("alert_sent"))
            for field in numeric_fields:
                if field in rec:
                    rec[field] = _coerce_numeric(rec[field])
            payload.append(rec)

        supabase.table("news_articles").upsert(payload, on_conflict="article_hash").execute()
        log.info("Synced %d articles (batch ending id=%d)", len(payload), max_id)

    return max_id


def sync_digests(sqlite_con: sqlite3.Connection, supabase, since_id: int) -> int:
    cur = sqlite_con.cursor()
    cur.execute(
        """
        SELECT id, date, digest_html, articles_count, high_impact_count, created_at
        FROM daily_digest
        WHERE id > ?
        ORDER BY id ASC
        """,
        (since_id,),
    )
    rows = cur.fetchall()
    if not rows:
        return since_id

    cols = [d[0] for d in cur.description]
    max_id = since_id
    payload = []
    for row in rows:
        rec = dict(zip(cols, row))
        max_id = max(max_id, rec["id"])
        rec.pop("id", None)
        rec["digest_date"] = rec.pop("date")
        payload.append(rec)

    supabase.table("daily_digest").upsert(payload, on_conflict="digest_date").execute()
    log.info("Synced %d daily digests (batch ending id=%d)", len(payload), max_id)
    return max_id


# ---------------------------------------------------------------- main

def run_once() -> None:
    if not NEWS_DB_PATH.exists():
        log.error("News DB not found at %s — is finvest_news_intelligence_v2.py running?", NEWS_DB_PATH)
        return

    state = load_state()
    last_article_id = state.get("last_article_id", 0)
    last_digest_id = state.get("last_digest_id", 0)

    # Read-only connection — this script must never write to the news
    # script's own DB, only read from it.
    con = sqlite3.connect(f"file:{NEWS_DB_PATH}?mode=ro", uri=True, timeout=30)
    try:
        supabase = get_supabase()
        new_last_article_id = sync_articles(con, supabase, last_article_id)
        new_last_digest_id = sync_digests(con, supabase, last_digest_id)
    finally:
        con.close()

    state["last_article_id"] = new_last_article_id
    state["last_digest_id"] = new_last_digest_id
    state["last_sync_utc"] = datetime.now(timezone.utc).isoformat()
    save_state(state)

    log.info(
        "Sync complete. watermark: article_id=%d digest_id=%d",
        new_last_article_id,
        new_last_digest_id,
    )


def main():
    _load_env_file()
    parser = argparse.ArgumentParser(description="Sync FinVest News SQLite DB into Supabase")
    parser.add_argument("--loop", action="store_true", help="Run continuously instead of once")
    parser.add_argument("--every", type=int, default=900, help="Seconds between runs in --loop mode (default 900 = 15 min, matches the news script's own cycle)")
    args = parser.parse_args()

    if args.loop:
        log.info("Starting sync loop, every %ds", args.every)
        while True:
            try:
                run_once()
            except Exception:
                log.exception("Sync run failed — will retry next cycle")
            time.sleep(args.every)
    else:
        run_once()


if __name__ == "__main__":
    sys.exit(main())
