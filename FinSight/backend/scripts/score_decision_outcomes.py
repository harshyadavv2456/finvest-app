#!/usr/bin/env python3
"""
Phase 1 hardening (FinSight/IMPLEMENTATION_NOTES.md): revisit open
decision calls whose review date has arrived, and score them against
what actually happened.

This is what turns decision_calls (a log of predictions) into an
actual feedback loop - without this, Phase 1's other pieces (live
efficacy, divergence report) have nothing to read from.

Run daily, alongside the rest of the pipeline (see
.github/workflows/daily-refresh.yml).

Usage:
    python score_decision_outcomes.py
"""
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("score_decision_outcomes")

BATCH_SIZE = 100


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
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _price_on_or_before(df, target_date):
    """Closest trading-day close at or before target_date - markets
    don't trade every calendar day, so an exact-date lookup would miss
    weekends/holidays."""
    import pandas as pd
    if df.empty:
        return None
    target_ts = pd.Timestamp(target_date, tz="UTC")
    eligible = df[df.index <= target_ts]
    if eligible.empty:
        return None
    row = eligible.iloc[-1]
    for col in ("close", "Close", "adj_close", "Adj Close"):
        if col in df.columns:
            return float(row[col])
    return None


def score_call(supabase, call: dict) -> bool:
    """Returns True if scored (call is now closed), False if not yet
    scorable (e.g. price data not available for the review date yet)."""
    from app.data_access import load_daily

    ticker = call["ticker"]
    market = call["market"]
    decision = call["decision"]
    called_at = datetime.fromisoformat(call["called_at_utc"].replace("Z", "+00:00"))
    review_after = datetime.fromisoformat(call["review_after_utc"].replace("Z", "+00:00"))

    df = load_daily(ticker, market)
    if df is None or df.empty:
        log.warning("No price data for %s/%s - can't score yet", market, ticker)
        return False

    price_at_call = _price_on_or_before(df, called_at.date())
    price_at_review = _price_on_or_before(df, review_after.date())

    if price_at_call is None or price_at_review is None:
        log.warning("Missing price at call or review date for %s/%s - skipping this run", market, ticker)
        return False

    actual_return = (price_at_review - price_at_call) / price_at_call if price_at_call else None
    expected_return = decision.get("expected_return")
    direction = decision.get("direction", "neutral")

    direction_correct = None
    if actual_return is not None:
        if direction == "long":
            direction_correct = actual_return > 0
        elif direction == "short":
            direction_correct = actual_return < 0
        else:  # neutral - "correct" if the move stayed small, a looser bar
            direction_correct = abs(actual_return) < 0.02

    magnitude_error = abs(actual_return - expected_return) if (actual_return is not None and expected_return is not None) else None

    supabase.table("decision_outcomes").upsert({
        "call_id": call["call_id"],
        "price_at_call": price_at_call,
        "price_at_review": price_at_review,
        "actual_return": actual_return,
        "expected_return": expected_return,
        "direction_correct": direction_correct,
        "magnitude_error": magnitude_error,
    }, on_conflict="call_id").execute()

    supabase.table("decision_calls").update({"status": "closed"}).eq("call_id", call["call_id"]).execute()
    return True


def main():
    _load_env_file()
    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    resp = (
        supabase.table("decision_calls")
        .select("call_id, ticker, market, called_at_utc, review_after_utc, decision")
        .eq("status", "open")
        .lte("review_after_utc", now_iso)
        .limit(BATCH_SIZE)
        .execute()
    )
    open_calls = resp.data or []
    log.info("Found %d open calls due for review", len(open_calls))

    scored = 0
    for call in open_calls:
        try:
            if score_call(supabase, call):
                scored += 1
        except Exception as e:
            log.warning("Failed to score call %s (%s/%s): %s", call["call_id"], call["market"], call["ticker"], e)

    log.info("Done. %d/%d calls scored this run.", scored, len(open_calls))
    return 0


if __name__ == "__main__":
    sys.exit(main())
