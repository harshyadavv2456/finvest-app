"""
Redis caching layer (Upstash free tier) — REPO_AUDIT_REPORT.md §9.2.

Directly inspired by World Monitor's architecture: a Redis -> CDN -> cache
layer in front of live external data pulls, instead of archiving every pull
to disk forever (the exact discipline that put 152,861 dead files into
this repo's history).

What this actually fixes for FinVest specifically: Render's free tier
spins down after inactivity and cold-starts slowly. A short-TTL cache in
front of the hot read paths (screener, per-ticker snapshots) means a cold
start serves a still-fresh cached response instantly instead of
recomputing/re-fetching from R2 + Supabase on every request after a spin-down.

Graceful by design: if REDIS_URL / UPSTASH_REDIS_* env vars aren't set
(e.g. no Upstash account created yet), every call here is a silent no-op
cache miss — nothing errors, nothing depends on this being configured.
This activates the moment credentials are added, no code changes needed.

Upstash free tier: 10,000 commands/day, no card required. At FinVest's
scale (a screener read + a handful of ticker reads per user session),
this is nowhere close to that ceiling even with dozens of concurrent users.
"""
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Reasonable defaults: screener/hot data doesn't need to be fresher than
# this in normal operation, and it bounds how stale a cold-start response
# can be if the underlying data hasn't actually changed.
DEFAULT_TTL_SECONDS = 300  # 5 minutes, matches the screener's existing in-memory cache window


def _cache_enabled() -> bool:
    return bool(os.environ.get("REDIS_URL") or os.environ.get("UPSTASH_REDIS_REST_URL"))


_client = None
_client_init_attempted = False


def _get_client():
    """Lazily construct a Redis client. Returns None (silently) if not
    configured or if the redis package isn't installed - callers must
    treat None as "cache unavailable, fall through to the real source",
    never as an error."""
    global _client, _client_init_attempted
    if _client is not None or _client_init_attempted:
        return _client
    _client_init_attempted = True

    if not _cache_enabled():
        return None

    try:
        import redis  # lazy import - not a hard dependency until configured
        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            _client = redis.from_url(redis_url, decode_responses=True, socket_timeout=3)
        else:
            # Upstash REST-style env vars, translated to a standard redis:// URL
            # if that's how the project's Upstash instance exposes it.
            rest_url = os.environ["UPSTASH_REDIS_REST_URL"]
            token = os.environ["UPSTASH_REDIS_REST_TOKEN"]
            _client = redis.Redis(
                host=rest_url.replace("https://", "").split(":")[0],
                port=6379,
                password=token,
                ssl=True,
                decode_responses=True,
                socket_timeout=3,
            )
        _client.ping()
        logger.info("Redis cache connected")
    except Exception as e:  # noqa: BLE001 - any failure here just disables caching
        logger.warning("Redis cache unavailable, running without it: %s", e)
        _client = None

    return _client


def cache_get_json(key: str) -> Optional[Any]:
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as e:  # noqa: BLE001
        logger.debug("Cache get failed for %s: %s", key, e)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception as e:  # noqa: BLE001
        logger.debug("Cache set failed for %s: %s", key, e)


def cached(key_fn, ttl_seconds: int = DEFAULT_TTL_SECONDS):
    """Decorator for FastAPI route handlers / functions returning
    JSON-serializable data. `key_fn` builds the cache key from the same
    args the wrapped function receives.

    Usage:
        @cached(lambda ticker, market=None: f"snapshot:{market}:{ticker}")
        async def get_stock_snapshot(ticker: str, market: str = None):
            ...
    """
    def decorator(fn):
        import functools
        import inspect

        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args, **kwargs):
                key = key_fn(*args, **kwargs)
                hit = cache_get_json(key)
                if hit is not None:
                    return hit
                result = await fn(*args, **kwargs)
                cache_set_json(key, result, ttl_seconds)
                return result
            return async_wrapper

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs)
            hit = cache_get_json(key)
            if hit is not None:
                return hit
            result = fn(*args, **kwargs)
            cache_set_json(key, result, ttl_seconds)
            return result
        return sync_wrapper

    return decorator
