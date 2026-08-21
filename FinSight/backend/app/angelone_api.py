"""
AngelOne diagnostic endpoint - Workstream D5.

Read-only visibility into the AngelOne provider's health: is it
configured, is the session active, which source (angelone/yfinance)
served the last IN-market request, and a live end-to-end check
(auth -> instrument lookup -> a real LTP read) so this can be verified
from wherever the backend is actually running, not just a dev machine.
"""
import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/angelone", tags=["AngelOne"])


@router.get("/health")
async def angelone_health():
    from app.angelone_provider import health_status
    return health_status()


@router.get("/verify-live")
async def angelone_verify_live(symbol: str = "RELIANCE-EQ", exchange: str = "NSE"):
    """Exercises the real auth+read path end-to-end. Safe to call
    repeatedly - session tokens are cached, so this doesn't re-auth on
    every call."""
    from app.angelone_provider import verify_live
    try:
        return await run_in_threadpool(verify_live, symbol, exchange)
    except Exception as e:  # noqa: BLE001
        logger.error("AngelOne verify-live failed: %s", e, exc_info=True)
        return {"ok": False, "step": "unexpected", "detail": str(e)}
