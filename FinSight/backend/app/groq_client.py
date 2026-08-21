"""
Shared Groq client with free-tier key rotation.

Why this exists: every Groq call site in the codebase (ai_engine.py,
finbot_api.py, intrinsiq_api.py, stratax/ai_analyzer.py, ai_analysis.py)
independently reads a single GROQ_API_KEY and instantiates its own
client. On the free tier that means one rate limit shared across the
whole app - and per the user's own instruction, we're staying on free
tier and rotating multiple keys instead of paying, so a single-key
client isn't enough anymore.

Usage (new call sites - existing ones can migrate opportunistically,
this doesn't require touching all of them at once):

    from app.groq_client import get_groq_client, groq_chat_completion
    resp = groq_chat_completion(messages=[...], model="openai/gpt-oss-120b")

Key source: GROQ_API_KEYS (comma-separated, preferred) or GROQ_API_KEY
(single, backward compatible with every existing call site). Rotates
round-robin per call, and on a 429/rate-limit error from one key,
retries the same request against the next key before giving up -
turns "one free-tier key's limit" into "N free-tier keys' limits,
summed" without adding any paid infrastructure.
"""
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_key_index = 0
_keys_cache: Optional[List[str]] = None


def _load_env_file() -> None:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def get_groq_keys() -> List[str]:
    """GROQ_API_KEYS (comma-separated) takes priority; falls back to
    the single GROQ_API_KEY every existing call site already reads, so
    nothing breaks for callers that don't know about rotation yet."""
    global _keys_cache
    if _keys_cache is not None:
        return _keys_cache
    _load_env_file()
    multi = os.environ.get("GROQ_API_KEYS", "")
    keys = [k.strip() for k in multi.split(",") if k.strip()]
    if not keys:
        single = os.environ.get("GROQ_API_KEY", "").strip()
        if single:
            keys = [single]
    _keys_cache = keys
    return keys


def _next_key_order() -> List[str]:
    """Round-robin starting point, rotated across calls so repeated
    calls don't all hammer the same key first."""
    global _key_index
    keys = get_groq_keys()
    if not keys:
        return []
    with _lock:
        start = _key_index % len(keys)
        _key_index += 1
    return keys[start:] + keys[:start]


def groq_available() -> bool:
    return len(get_groq_keys()) > 0


def groq_chat_completion(
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-oss-120b",
    caller: str = "unknown",
    **kwargs: Any,
) -> Optional[Dict[str, Any]]:
    """Try each configured key in rotation order until one succeeds.
    Returns the raw completion dict, or None if every key failed / no
    key is configured - callers should treat None as "AI unavailable",
    the same fail-open discipline every other optional source in this
    codebase already uses, not raise and break the page."""
    keys = _next_key_order()
    if not keys:
        logger.debug("groq_chat_completion: no GROQ_API_KEY(s) configured, skipping (caller=%s)", caller)
        return None

    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq package not installed")
        return None

    last_error = None
    for i, key in enumerate(keys):
        try:
            client = Groq(api_key=key)
            response = client.chat.completions.create(model=model, messages=messages, **kwargs)
            try:
                from app.groq_usage_tracker import track_groq_call
                track_groq_call(caller=caller, response=response)
            except Exception:  # noqa: BLE001 - usage tracking must never break the actual call
                pass
            if i > 0:
                logger.info("groq_chat_completion: key #%d succeeded after %d rotation(s) (caller=%s)", i, i, caller)
            return response
        except Exception as e:  # noqa: BLE001
            last_error = e
            msg = str(e).lower()
            if "rate" in msg or "429" in msg or "quota" in msg:
                logger.info("groq_chat_completion: key #%d rate-limited, rotating (caller=%s)", i, caller)
                continue
            # Non-rate-limit error (bad request, model not found, etc.) -
            # not something another key would fix, stop rotating.
            logger.warning("groq_chat_completion: non-rate-limit failure (caller=%s): %s", caller, e)
            break

    logger.warning("groq_chat_completion: all %d key(s) exhausted/failed (caller=%s): %s", len(keys), caller, last_error)
    return None
