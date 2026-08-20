"""
Timeline API - Daily Recommendation History Storage & Retrieval

Saves and retrieves historical recommendations to enable:
- Day-over-day comparison
- Stance change detection  
- Recommendation memory

Data is stored in public/timeline/{market}/{date}.json
"""

import os
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/timeline", tags=["Timeline"])

# Path to timeline data - works on both local and Render
_app_dir = Path(__file__).parent  # app/
_backend_dir = _app_dir.parent    # backend/
_finsight_dir = _backend_dir.parent  # FinSight/
TIMELINE_DIR = _finsight_dir / "public" / "timeline"
INTELLIGENCE_DIR = _finsight_dir / "public" / "intelligence"

# Log paths for debugging
logger.info(f"Timeline directory: {TIMELINE_DIR}")
logger.info(f"Intelligence directory: {INTELLIGENCE_DIR}")


class DailySnapshot(BaseModel):
    date: str
    market: str
    generated_at: str
    total_stocks: int
    intent_counts: Dict[str, int]
    recommendations: List[Dict[str, Any]]


def get_date_str(days_ago: int = 0) -> str:
    """Get date string for N days ago."""
    d = datetime.now() - timedelta(days=days_ago)
    return d.strftime("%Y-%m-%d")


def save_daily_snapshot(market: str, date_str: str = None) -> Dict[str, Any]:
    """
    Save current intelligence data as a daily snapshot.
    Called by the daily data refresh pipeline.
    """
    if date_str is None:
        date_str = get_date_str(0)
    
    # Ensure timeline directory exists
    market_dir = TIMELINE_DIR / market
    market_dir.mkdir(parents=True, exist_ok=True)
    
    snapshot_file = market_dir / f"{date_str}.json"
    
    # Load intelligence data
    intel_dir = INTELLIGENCE_DIR / market
    if not intel_dir.exists():
        logger.warning(f"Intelligence directory not found: {intel_dir}")
        return {"error": "No intelligence data available"}
    
    recommendations = []
    intent_counts = {"INITIATE": 0, "HOLD": 0, "AVOID": 0}
    
    try:
        for f in intel_dir.glob("*.json"):
            try:
                with open(f) as fp:
                    data = json.load(fp)
                    intent = data.get("intent", "HOLD")
                    intent_counts[intent] = intent_counts.get(intent, 0) + 1
                    
                    recommendations.append({
                        "ticker": data.get("ticker"),
                        "intent": intent,
                        "conviction": data.get("conviction"),
                        "conviction_pct": data.get("conviction_pct"),
                        "expected_return": data.get("return_p50"),
                        "cvar_95": data.get("cvar_95"),
                        "regime": data.get("asset_regime"),
                        "rationale": data.get("rationale", "")[:300],
                        "as_of_date": data.get("as_of_date")
                    })
            except Exception as e:
                logger.debug(f"Skipping {f}: {e}")
                continue
        
        # Sort by conviction
        recommendations.sort(key=lambda x: x.get("conviction", 0) or 0, reverse=True)
        
        snapshot = {
            "date": date_str,
            "market": market,
            "generated_at": datetime.now().isoformat(),
            "total_stocks": len(recommendations),
            "intent_counts": intent_counts,
            "recommendations": recommendations
        }
        
        # Save to file
        with open(snapshot_file, 'w') as f:
            json.dump(snapshot, f, indent=2)
        
        logger.info(f"Saved timeline snapshot: {snapshot_file} with {len(recommendations)} stocks")
        return snapshot
        
    except Exception as e:
        logger.error(f"Error saving snapshot: {e}")
        return {"error": str(e)}


def load_daily_snapshot(market: str, date_str: str) -> Optional[Dict[str, Any]]:
    """Load a specific day's snapshot."""
    snapshot_file = TIMELINE_DIR / market / f"{date_str}.json"
    
    if not snapshot_file.exists():
        return None
    
    try:
        with open(snapshot_file) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading snapshot {snapshot_file}: {e}")
        return None


def get_stance_changes(market: str, from_date: str, to_date: str) -> List[Dict[str, Any]]:
    """Compare two dates and return stance changes."""
    old_snapshot = load_daily_snapshot(market, from_date)
    new_snapshot = load_daily_snapshot(market, to_date)
    
    if not old_snapshot or not new_snapshot:
        return []
    
    # Build lookup of old stances
    old_stances = {r["ticker"]: r for r in old_snapshot.get("recommendations", [])}
    
    changes = []
    for rec in new_snapshot.get("recommendations", []):
        ticker = rec["ticker"]
        old_rec = old_stances.get(ticker)
        
        if old_rec:
            if old_rec["intent"] != rec["intent"]:
                changes.append({
                    "ticker": ticker,
                    "previous_intent": old_rec["intent"],
                    "previous_conviction": old_rec["conviction"],
                    "current_intent": rec["intent"],
                    "current_conviction": rec["conviction"],
                    "from_date": from_date,
                    "to_date": to_date,
                    "change_type": f"{old_rec['intent']} → {rec['intent']}"
                })
    
    return changes


@router.post("/save/{market}")
async def save_snapshot(market: str, date: Optional[str] = None):
    """
    Save current intelligence as daily snapshot.
    This is called by the daily data refresh pipeline.
    """
    market = market.upper()
    result = save_daily_snapshot(market, date)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return {
        "status": "OK",
        "message": f"Saved snapshot for {market} on {result.get('date')}",
        "total_stocks": result.get("total_stocks"),
        "intent_counts": result.get("intent_counts")
    }


@router.get("/snapshot/{market}/{date}")
async def get_snapshot(market: str, date: str):
    """Get a specific day's snapshot."""
    market = market.upper()
    snapshot = load_daily_snapshot(market, date)
    
    if not snapshot:
        # Try to create it from current data if it's today
        if date == get_date_str(0):
            snapshot = save_daily_snapshot(market, date)
            if "error" not in snapshot:
                return snapshot
        
        raise HTTPException(status_code=404, detail=f"No snapshot found for {market} on {date}")
    
    return snapshot


@router.get("/history/{market}")
async def get_history(
    market: str, 
    days: int = Query(7, description="Number of days of history")
):
    """Get history of snapshots for the last N days."""
    market = market.upper()
    history = []
    
    for i in range(days):
        date_str = get_date_str(i)
        snapshot = load_daily_snapshot(market, date_str)
        
        if snapshot:
            # Return summary, not full recommendations
            history.append({
                "date": snapshot["date"],
                "total_stocks": snapshot["total_stocks"],
                "intent_counts": snapshot["intent_counts"],
                "generated_at": snapshot.get("generated_at")
            })
    
    return {
        "market": market,
        "days_requested": days,
        "days_found": len(history),
        "history": history
    }


@router.get("/changes/{market}")
async def get_changes(
    market: str,
    from_date: Optional[str] = Query(None, description="Compare from this date"),
    to_date: Optional[str] = Query(None, description="Compare to this date (default: today)")
):
    """Get stance changes between two dates."""
    market = market.upper()
    
    if to_date is None:
        to_date = get_date_str(0)
    if from_date is None:
        from_date = get_date_str(1)  # Yesterday
    
    changes = get_stance_changes(market, from_date, to_date)
    
    return {
        "market": market,
        "from_date": from_date,
        "to_date": to_date,
        "total_changes": len(changes),
        "changes": changes
    }


@router.get("/compare/{market}/{ticker}")
async def compare_stock(
    market: str,
    ticker: str,
    days: int = Query(7, description="Days of history")
):
    """Get history of a specific stock's recommendations."""
    market = market.upper()
    ticker = ticker.upper()
    
    history = []
    for i in range(days):
        date_str = get_date_str(i)
        snapshot = load_daily_snapshot(market, date_str)
        
        if snapshot:
            # Find this ticker in the snapshot
            for rec in snapshot.get("recommendations", []):
                if rec.get("ticker", "").upper() == ticker:
                    history.append({
                        "date": date_str,
                        "intent": rec["intent"],
                        "conviction": rec["conviction"],
                        "expected_return": rec.get("expected_return"),
                        "rationale": rec.get("rationale", "")[:200]
                    })
                    break
    
    return {
        "ticker": ticker,
        "market": market,
        "days_requested": days,
        "days_found": len(history),
        "history": history
    }


@router.post("/save-all")
async def save_all_snapshots():
    """Save snapshots for all markets."""
    results = {}
    for market in ["US", "IN"]:
        result = save_daily_snapshot(market)
        results[market] = {
            "status": "OK" if "error" not in result else "ERROR",
            "total_stocks": result.get("total_stocks", 0),
            "error": result.get("error")
        }
    
    return {
        "status": "OK",
        "date": get_date_str(0),
        "results": results
    }

