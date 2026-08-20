"""
Regression tests for the quant intelligence pipeline's output.

No automated tests existed anywhere in this codebase before this file
(see REPO_AUDIT_REPORT.md §9.1) - for a system that outputs position-
sizing recommendations, that's the single biggest gap this session
didn't originally set out to fix but is worth closing.

Deliberately not testing the pipeline's internal logic (layer1-9) in
isolation - that would mean mocking market data and regime state, a
much larger undertaking. Instead: structural + sanity invariants on the
actual output every ticker's intelligence JSON must satisfy, checked
against whatever the pipeline most recently produced. This is exactly
the kind of test that would have caught the two real bugs found this
session (NaN in JSON payloads, qualitative strings in numeric columns)
automatically, instead of via manual testing during a live migration.

Run as part of CI (add to .github/workflows/daily-refresh.yml's
intelligence job) so a bad run gets caught before it publishes, not
after a user reports numbers that don't make sense.

Usage:
    cd FinSight/quant_system && python -m pytest tests/ -v
"""
import json
import math
from pathlib import Path

import pytest

INTEL_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "intelligence"
MARKETS = ["US", "IN"]

VALID_INTENTS = {"INITIATE", "HOLD", "AVOID", "BUY", "SELL", "REDUCE", "ACCUMULATE"}
VALID_DIRECTIONS = {"bullish", "bearish", "neutral"}
VALID_REGIMES = {"markup", "markdown", "accumulation", "distribution", "ranging"}


def _all_snapshots(include_aggregates: bool = False):
    """Every current intelligence JSON on disk, across both intelligence-
    enabled markets. Skipped (not failed) if the pipeline hasn't run
    locally yet - these tests validate output shape, not that a run
    happened.

    Files with a leading underscore (e.g. _portfolio_intelligence.json)
    are portfolio-level aggregates, not per-ticker snapshots - excluded
    by default since they don't share the per-ticker schema this test
    module validates. Found by running this suite for real: the first
    version's glob was too broad and flagged them as malformed tickers."""
    snapshots = []
    for market in MARKETS:
        market_dir = INTEL_DIR / market
        if not market_dir.exists():
            continue
        for f in market_dir.glob("*.json"):
            if not include_aggregates and f.stem.startswith("_"):
                continue
            try:
                payload = json.loads(f.read_text(encoding="utf-8"))
                snapshots.append((market, f.stem, payload))
            except Exception:
                pytest.fail(f"Unparseable intelligence JSON: {f}")
    return snapshots


@pytest.fixture(scope="module")
def snapshots():
    data = _all_snapshots()
    if not data:
        pytest.skip("No intelligence snapshots found locally - run the pipeline first")
    return data


def test_no_nan_or_inf_in_numeric_fields(snapshots):
    """The exact bug found and fixed in sync_intelligence_to_supabase.py
    this session - a NaN here breaks the Supabase sync, and more
    importantly signals the pipeline computed something over insufficient
    or corrupted data. Should never ship, not just never sync."""
    bad = []

    def _check(obj, path):
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                bad.append(path)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                _check(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                _check(v, f"{path}[{i}]")

    for market, ticker, payload in snapshots:
        _check(payload, f"{market}/{ticker}")

    assert not bad, f"NaN/Infinity found in {len(bad)} field(s), e.g. {bad[:10]}"


def test_intent_is_valid(snapshots):
    """Layer 6's decision output must be one of the known intents - an
    unrecognized value here means either a new intent type shipped
    without updating this test (fine, update VALID_INTENTS), or the
    decision engine produced garbage (not fine)."""
    for market, ticker, payload in snapshots:
        intent = payload.get("intent")
        assert intent in VALID_INTENTS, f"{market}/{ticker}: unexpected intent {intent!r}"


def test_conviction_in_valid_range(snapshots):
    """conviction_pct is a percentage (0-100), conviction/conviction_raw
    are the 0-1 fractional form. Out-of-range values mean a scaling bug
    somewhere in layer 6/7, not a real conviction level."""
    for market, ticker, payload in snapshots:
        conv_pct = payload.get("conviction_pct")
        if conv_pct is not None:
            assert 0 <= conv_pct <= 100, f"{market}/{ticker}: conviction_pct={conv_pct} out of [0,100]"

        conv = payload.get("conviction")
        if conv is not None:
            assert 0 <= conv <= 1, f"{market}/{ticker}: conviction={conv} out of [0,1]"


def test_confidence_in_valid_range(snapshots):
    for market, ticker, payload in snapshots:
        conf = payload.get("confidence")
        if conf is not None:
            assert 0 <= conf <= 1, f"{market}/{ticker}: confidence={conf} out of [0,1]"


def test_position_sizing_bounded(snapshots):
    """max_position_pct / recommended_position_pct are risk-management
    outputs from Layer 9. A value above 1.0 (100% of capital in one
    position) or negative would be a genuinely dangerous bug to ship
    silently, given this feeds actual position-sizing recommendations."""
    for market, ticker, payload in snapshots:
        for field in ("max_position_pct", "recommended_position_pct", "risk_budget_used_pct"):
            val = payload.get(field)
            if val is not None:
                assert 0 <= val <= 1, f"{market}/{ticker}: {field}={val} outside sane [0,1] bounds"


def test_required_fields_present(snapshots):
    """The minimum a frontend/API consumer can rely on existing - not
    exhaustive, but covers what insights_api.py and the frontend's
    intelligence pages actually read."""
    required = ["ticker", "market", "intent", "as_of_date"]
    for market, ticker, payload in snapshots:
        missing = [f for f in required if f not in payload]
        assert not missing, f"{market}/{ticker}: missing required field(s) {missing}"


def test_signal_agreement_reflects_signal_counts(snapshots):
    """A sanity cross-check specific to this system: if there are zero
    supporting AND zero opposing signals, signal_agreement claiming a
    strong value would be internally inconsistent - the empty
    top_signals_ic finding from the original audit (REPO_AUDIT_REPORT.md
    §3A) is exactly this class of bug."""
    for market, ticker, payload in snapshots:
        supporting = payload.get("supporting_signals", [])
        opposing = payload.get("opposing_signals", [])
        agreement = payload.get("signal_agreement")
        if agreement is not None and not supporting and not opposing:
            assert agreement == 0 or agreement is None, (
                f"{market}/{ticker}: signal_agreement={agreement} with zero signals on either side"
            )
