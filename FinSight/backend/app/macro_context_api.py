"""
Macro Context API - Workstream A/F serving endpoint.
=====================================================

Thin read-only wrapper around quant_system/macro_signals.py's
compute_macro_context(), which already handles its own R2-backed
caching (6h TTL) and per-source graceful degradation. This module just
exposes it over HTTP, mirroring pm_regime_api.py's fail-open pattern:
never a 500, always a well-formed response even when every source is
unavailable.
"""
import logging
import sys
from pathlib import Path

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/macro-context", tags=["Macro Context"])

_quant_system_dir = str(Path(__file__).resolve().parent.parent.parent / "quant_system")
if _quant_system_dir not in sys.path:
    sys.path.insert(0, _quant_system_dir)


@router.get("/current")
async def get_current_macro_context():
    """Current macro/geopolitical context - US rates (FRED), India macro
    (data.gov.in), physical-disruption proxies (NASA FIRMS + USGS), and
    Mnemos's geopolitical narrative. Cached ~6h by the underlying module,
    so this is fast on every call except the first cold one - run off
    the event loop regardless, since it can still hit up to 5 external
    APIs on a cache miss."""
    try:
        from macro_signals import compute_macro_context
        return await run_in_threadpool(compute_macro_context)
    except Exception as e:  # noqa: BLE001
        logger.error("Macro context fetch failed entirely: %s", e, exc_info=True)
        return {
            "as_of": None,
            "available": False,
            "error": str(e),
            "summary": "Macro context unavailable.",
        }
