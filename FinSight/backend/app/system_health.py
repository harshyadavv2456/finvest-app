"""
System Health API
=================
Reads state/refresh_registry.json and returns per-module freshness.
Also provides intelligence file counts and data age.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["System Health"])

PROJECT_ROOT = Path(__file__).parent.parent.parent
REGISTRY_FILE = PROJECT_ROOT / "state" / "refresh_registry.json"
INTELLIGENCE_DIR = PROJECT_ROOT / "public" / "intelligence"
DATA_DIR = PROJECT_ROOT / "data"


def _age_hours(iso_str: str) -> float:
    try:
        ts = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - ts).total_seconds() / 3600
    except Exception:
        return 9999.0


def _freshness_label(age_h: float) -> str:
    if age_h < 26:
        return "fresh"
    if age_h < 50:
        return "stale"
    return "outdated"


@router.get("/health")
async def system_health():
    """
    Per-module health derived from state/refresh_registry.json.
    Returns freshness status for every data source and pipeline module.
    """
    registry: Dict[str, Any] = {}
    if REGISTRY_FILE.exists():
        try:
            registry = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    modules = registry.get("modules", {})
    last_orch = registry.get("last_orchestration_utc")

    module_health: Dict[str, Any] = {}
    for name, info in modules.items():
        last_success = info.get("last_success_utc")
        status = info.get("status", "unknown")
        age_h = _age_hours(last_success) if last_success else 9999.0

        module_health[name] = {
            "status": status,
            "freshness": _freshness_label(age_h) if last_success else "never_run",
            "age_hours": round(age_h, 1) if last_success else None,
            "last_success": last_success,
            "last_attempt": info.get("last_attempt_utc"),
            "elapsed_seconds": info.get("elapsed_seconds"),
            "consecutive_failures": info.get("consecutive_failures", 0),
            "error": info.get("error"),
        }

    # Intelligence file counts
    intel_counts: Dict[str, int] = {}
    for market in ["IN", "US"]:
        market_dir = INTELLIGENCE_DIR / market
        if market_dir.exists():
            intel_counts[market] = len(list(market_dir.glob("*.json")))
        else:
            intel_counts[market] = 0

    # Data directory freshness
    data_tickers = 0
    if DATA_DIR.exists():
        for mdir in DATA_DIR.iterdir():
            if mdir.is_dir():
                data_tickers += len([d for d in mdir.iterdir() if d.is_dir()])

    # Overall status
    critical_modules = ["market_data", "screener", "intelligence"]
    critical_ok = all(
        module_health.get(m, {}).get("freshness") == "fresh"
        for m in critical_modules if m in module_health
    )

    return {
        "status": "healthy" if critical_ok else "degraded",
        "last_orchestration_utc": last_orch,
        "modules": module_health,
        "intelligence_files": intel_counts,
        "data_tickers": data_tickers,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
