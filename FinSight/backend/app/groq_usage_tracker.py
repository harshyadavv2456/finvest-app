"""
Phase 4 hardening (FinSight/IMPLEMENTATION_NOTES.md): Groq API usage
tracking - the highest-leverage Phase 4 gap per the Phase 0 inventory.

Nothing in the codebase tracked Groq usage before this, despite many
modules calling it (ai_engine.py, finbot_api.py, layer7_llm_interpreter.py,
FinAx, IntrinsIQ, the news pipeline) - a bug in any one of them could
burn through Groq's rate limits or (on a paid tier) budget silently.

Groq's own API doesn't expose account-level usage via a simple
endpoint the way Cloudflare/Supabase's dashboards do, so this tracks
usage locally: every call site wraps its Groq client call with
`track_groq_call()`, which logs token counts to a local rolling file
and checks against a daily soft limit.

Usage (from any module making a Groq call):
    from app.groq_usage_tracker import track_groq_call
    response = client.chat.completions.create(...)
    track_groq_call(caller="ai_engine", response=response)
"""
import json
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

USAGE_DIR = Path(__file__).resolve().parent.parent.parent / "state" / "groq_usage"
DAILY_TOKEN_SOFT_LIMIT = int(os.environ.get("GROQ_DAILY_TOKEN_LIMIT", "2000000"))  # ~2M tokens/day default, override via env

_lock = Lock()
_alerted_today = set()  # avoid spamming the same alert every call once over the limit


def _today_file() -> Path:
    USAGE_DIR.mkdir(parents=True, exist_ok=True)
    return USAGE_DIR / f"{date.today().isoformat()}.json"


def _load_today() -> dict:
    f = _today_file()
    if f.exists():
        try:
            return json.loads(f.read_text())
        except Exception:
            pass
    return {"date": date.today().isoformat(), "total_tokens": 0, "total_calls": 0, "by_caller": {}}


def _save_today(data: dict) -> None:
    _today_file().write_text(json.dumps(data, indent=2))


def track_groq_call(caller: str, response=None, prompt_tokens: int = None, completion_tokens: int = None) -> None:
    """Call this right after any Groq API call. Never raises - usage
    tracking must never be the thing that breaks an AI feature.

    Pass either `response` (a groq ChatCompletion object, tokens read
    from response.usage) or explicit prompt_tokens/completion_tokens if
    the caller already has them separately.
    """
    try:
        if response is not None and hasattr(response, "usage") and response.usage:
            p_tok = getattr(response.usage, "prompt_tokens", 0) or 0
            c_tok = getattr(response.usage, "completion_tokens", 0) or 0
        else:
            p_tok = prompt_tokens or 0
            c_tok = completion_tokens or 0
        total = p_tok + c_tok

        with _lock:
            data = _load_today()
            data["total_tokens"] += total
            data["total_calls"] += 1
            data["by_caller"].setdefault(caller, {"tokens": 0, "calls": 0})
            data["by_caller"][caller]["tokens"] += total
            data["by_caller"][caller]["calls"] += 1
            _save_today(data)

            if data["total_tokens"] >= DAILY_TOKEN_SOFT_LIMIT and date.today().isoformat() not in _alerted_today:
                _alerted_today.add(date.today().isoformat())
                _alert_over_limit(data)

    except Exception as e:  # noqa: BLE001
        logger.warning("Groq usage tracking failed for caller=%s (call itself is unaffected): %s", caller, e)


def _alert_over_limit(data: dict) -> None:
    try:
        from app.notifications_api import _send_email, _send_telegram
        top_callers = sorted(data["by_caller"].items(), key=lambda kv: -kv[1]["tokens"])[:5]
        breakdown = "\n".join(f"  {name}: {stats['tokens']:,} tokens ({stats['calls']} calls)" for name, stats in top_callers)
        msg = (
            f"Groq usage hit {data['total_tokens']:,} tokens today "
            f"(soft limit: {DAILY_TOKEN_SOFT_LIMIT:,}). Top callers:\n{breakdown}"
        )
        _send_email("FinVest: Groq usage over daily soft limit", msg)
        _send_telegram(f"⚠️ {msg}")
    except Exception as e:
        logger.warning("Could not send Groq usage alert: %s", e)


def get_today_usage() -> dict:
    """For a status endpoint / dashboard, if wired up later."""
    with _lock:
        return _load_today()
