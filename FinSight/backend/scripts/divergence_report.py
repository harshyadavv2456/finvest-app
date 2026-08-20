#!/usr/bin/env python3
"""
Phase 1 hardening (FinSight/IMPLEMENTATION_NOTES.md): live-vs-backtest
divergence report.

For each signal, compares its live hit rate (from scored
decision_outcomes) against what backtesting promised
(quant_system/layer3_signal_efficacy.py's stored efficacy stats).
Flags signals where the gap exceeds a threshold - that's the actual
"is this system's edge real or was it curve-fit" question, answered
with live data instead of another backtest.

Usage:
    python divergence_report.py                  # print + alert on divergent signals
    python divergence_report.py --market IN
"""
import argparse
import logging
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("divergence_report")

DIVERGENCE_THRESHOLD_PCT = 15.0  # percentage-point gap that triggers a flag
MIN_SAMPLE_SIZE = 20  # don't flag on noise - need enough scored calls to mean something


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


def compute_live_hit_rates(supabase, market: str = None) -> dict:
    """Per-signal live hit rate: for every closed call where a signal
    was in supporting_signals or opposing_signals, was direction_correct
    true? Signals get credit/blame proportionally, not just the overall
    decision - a signal that only ever shows up on correct calls is
    doing real work, one that shows up equally on both isn't."""
    query = (
        supabase.table("decision_calls")
        .select("call_id, decision, decision_outcomes(direction_correct)")
        .eq("status", "closed")
    )
    if market:
        query = query.eq("market", market)
    resp = query.execute()

    signal_correct = defaultdict(int)
    signal_total = defaultdict(int)

    for row in resp.data or []:
        outcomes = row.get("decision_outcomes")
        if not outcomes:
            continue
        outcome = outcomes[0] if isinstance(outcomes, list) else outcomes
        correct = outcome.get("direction_correct")
        if correct is None:
            continue

        decision = row["decision"]
        for sig in decision.get("key_supporting_signals", []) or []:
            signal_total[sig] += 1
            if correct:
                signal_correct[sig] += 1
        for sig in decision.get("key_opposing_signals", []) or []:
            # An opposing signal "worked" if the decision was WRONG in
            # the direction it opposed - i.e. correct=False means the
            # opposing signal's caution was justified.
            signal_total[sig] += 1
            if not correct:
                signal_correct[sig] += 1

    return {
        sig: {"hit_rate_pct": round(100 * signal_correct[sig] / signal_total[sig], 1), "n": signal_total[sig]}
        for sig in signal_total
        if signal_total[sig] >= MIN_SAMPLE_SIZE
    }


def load_backtest_hit_rates() -> dict:
    """Reads what signal_efficacy_trainer.py already computed from
    backtesting. Best-effort - if the stats file/table isn't available,
    this report just can't compute divergence, not a hard failure."""
    try:
        from quant_system.signal_efficacy_trainer import load_efficacy_stats
        df = load_efficacy_stats()
        if df is None or df.empty:
            return {}
        # Expecting columns like signal_name / win_rate or similar -
        # best-effort mapping, logged clearly if the shape doesn't match
        # rather than silently returning nothing.
        rates = {}
        for _, row in df.iterrows():
            name = row.get("signal_name") or row.get("signal")
            rate = row.get("win_rate") or row.get("hit_rate")
            if name is not None and rate is not None:
                rates[name] = float(rate) * 100 if rate <= 1 else float(rate)
        return rates
    except Exception as e:
        log.warning("Could not load backtest efficacy stats: %s", e)
        return {}


def _alert(divergent: list):
    try:
        from app.notifications_api import _send_email, _send_telegram
        lines = [f"  {d['signal']}: live {d['live_hit_rate']}% vs backtest {d['backtest_hit_rate']}% (n={d['n']})" for d in divergent]
        msg = "Signals with live/backtest divergence exceeding threshold:\n" + "\n".join(lines)
        _send_email("FinVest: signal divergence alert", msg)
        _send_telegram(f"⚠️ {msg}")
    except Exception as e:
        log.warning("Could not send divergence alert: %s", e)


def main():
    _load_env_file()
    parser = argparse.ArgumentParser()
    parser.add_argument("--market", default=None)
    args = parser.parse_args()

    supabase = get_supabase()
    live_rates = compute_live_hit_rates(supabase, args.market)
    backtest_rates = load_backtest_hit_rates()

    if not live_rates:
        log.info("No scored decision_calls with enough sample size yet (need >= %d per signal) - nothing to compare.", MIN_SAMPLE_SIZE)
        return 0

    divergent = []
    for signal, live in live_rates.items():
        backtest_rate = backtest_rates.get(signal)
        if backtest_rate is None:
            log.info("%s: live=%.1f%% (n=%d), no backtest rate found to compare against", signal, live["hit_rate_pct"], live["n"])
            continue

        gap = abs(live["hit_rate_pct"] - backtest_rate)
        log.info("%s: live=%.1f%% backtest=%.1f%% gap=%.1fpp (n=%d)", signal, live["hit_rate_pct"], backtest_rate, gap, live["n"])

        if gap >= DIVERGENCE_THRESHOLD_PCT:
            divergent.append({
                "signal": signal, "live_hit_rate": live["hit_rate_pct"],
                "backtest_hit_rate": backtest_rate, "gap": round(gap, 1), "n": live["n"],
            })

    if divergent:
        log.warning("%d signal(s) exceed the %.0fpp divergence threshold", len(divergent), DIVERGENCE_THRESHOLD_PCT)
        _alert(divergent)
    else:
        log.info("No signals exceed the divergence threshold.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
