"""
Decision call logging - the foundation Phase 1 of the AMC-backbone
hardening plan depends on (FinSight/IMPLEMENTATION_NOTES.md).

Every call to DecisionEngine.generate_decision() gets a unique ID and a
point-in-time record of what produced it: the exact signal/probability
state, the model version, and the timestamp. Without this, nothing else
in Phase 1 (live-vs-backtest divergence) or Phase 2 (point-in-time
reconstruction) has anything to key against.

Design choices, consistent with the rest of this session's work:
  - Writes locally first (JSONL, one file per day), synced to Supabase
    by a separate script - same local-write-then-sync pattern as
    sync_news_intelligence.py / sync_intelligence_to_supabase.py, not
    a new pattern.
  - Additive only: does not change what generate_decision() returns to
    its existing callers, just logs alongside it.
  - model_version is a simple content hash of this module + layer6, not
    a manually-bumped version string - so "what model produced this
    call" is always accurate even if nobody remembers to bump a number.
"""
import hashlib
import json
import logging
import uuid
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

LOG_DIR = Path(__file__).resolve().parent.parent / "state" / "decision_calls"


def _model_version() -> str:
    """Content hash of the decision-relevant source files, not a manually
    maintained version string. Cached after first call in a process."""
    if not hasattr(_model_version, "_cached"):
        h = hashlib.sha256()
        for fname in ("layer6_decision_engine.py", "layer4_probability_engine.py", "layer3_signal_efficacy.py"):
            fpath = Path(__file__).resolve().parent / fname
            if fpath.exists():
                h.update(fpath.read_bytes())
        _model_version._cached = h.hexdigest()[:12]
    return _model_version._cached


def _to_jsonable(obj: Any) -> Any:
    """Best-effort conversion of dataclasses/enums/dates into JSON-safe
    values, for the point-in-time snapshot of whatever objects fed the
    decision. Doesn't need to be exhaustive - this is diagnostic data for
    later comparison, not something else's source of truth."""
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _to_jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if hasattr(obj, "value") and hasattr(obj, "name"):  # Enum
        return obj.value
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    if isinstance(obj, float) and (obj != obj):  # NaN - same fix as sync_intelligence_to_supabase.py
        return None
    return obj


def log_decision_call(
    ticker: str,
    market: Optional[str],
    decision: Any,  # layer6_decision_engine.Decision - not imported directly, avoids a circular import
    outcome: Any = None,  # ProbabilisticOutcome - the signal state at call time
    efficacy_report: Any = None,  # EfficacyReport
    review_after_days: int = 20,  # matches Decision.expected_holding_days' typical default; overridden below if the decision has its own
) -> str:
    """Log one decision call, return its call_id. Never raises - a
    logging failure should never break the actual decision pipeline
    that's calling this."""
    call_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    try:
        holding_days = getattr(decision, "expected_holding_days", review_after_days) or review_after_days
        record = {
            "call_id": call_id,
            "ticker": ticker,
            "market": market or "UNKNOWN",
            "called_at_utc": now.isoformat(),
            "model_version": _model_version(),
            "decision": _to_jsonable(decision) if hasattr(decision, "to_dict") is False else decision.to_dict(),
            "signal_state": {
                "outcome": _to_jsonable(outcome) if outcome is not None else None,
                "efficacy_report": _to_jsonable(efficacy_report) if efficacy_report is not None else None,
            },
            "review_after_utc": None,  # filled in below
            "status": "open",
        }
        from datetime import timedelta
        record["review_after_utc"] = (now + timedelta(days=holding_days)).isoformat()

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_file = LOG_DIR / f"{now.date().isoformat()}.jsonl"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")

    except Exception as e:  # noqa: BLE001
        logger.warning("Decision call logging failed for %s (call proceeds regardless): %s", ticker, e)

    return call_id
