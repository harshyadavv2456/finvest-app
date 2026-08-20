"""
PM Regime API - Precious Metals Macro Context Endpoint
=======================================================

Provides the current PM Regime state for frontend display.
This is a READ-ONLY endpoint - PM regime is computed during daily intelligence.

FAIL-OPEN: Returns neutral state if no PM data available.
"""

import json
import logging
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, Optional, List
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pm-regime", tags=["PM Regime"])

# Paths
_app_dir = Path(__file__).parent
_backend_dir = _app_dir.parent
_finsight_dir = _backend_dir.parent
TIMELINE_DIR = _finsight_dir / "public" / "timeline"


def get_pm_regime_for_date(date_str: str) -> Optional[Dict]:
    """Load PM regime for a specific date."""
    try:
        filepath = TIMELINE_DIR / "IN" / f"pm_regime_{date_str}.json"
        
        if not filepath.exists():
            return None
        
        with open(filepath, 'r') as f:
            return json.load(f)
            
    except Exception as e:
        logger.error(f"Error loading PM regime for {date_str}: {e}")
        return None


def get_latest_pm_regime() -> Optional[Dict]:
    """Get the most recent PM regime (today or yesterday)."""
    today = date.today().strftime("%Y-%m-%d")
    yesterday = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Try today first
    regime = get_pm_regime_for_date(today)
    if regime:
        return regime
    
    # Fall back to yesterday
    return get_pm_regime_for_date(yesterday)


@router.get("/current")
async def get_current_pm_regime():
    """
    Get current PM Regime state.
    
    FAIL-OPEN: Returns neutral TRANSITION state if no data available.
    This ensures frontend always receives valid data.
    
    Returns:
    {
        "state": "RISK_ON" | "TRANSITION" | "RISK_OFF",
        "confidence": 0-100,
        "triggers": ["gold_above_20dma", ...],
        "context_description": "Human-readable description",
        "date": "YYYY-MM-DD",
        "state_changed": true/false,
        "available": true/false
    }
    """
    regime = get_latest_pm_regime()
    
    if regime:
        return {
            **regime,
            "available": True
        }
    
    # FAIL-OPEN: Return neutral state
    return {
        "state": "TRANSITION",
        "confidence": 0,
        "triggers": ["no_pm_data"],
        "context_description": "PM regime data not available - neutral macro context",
        "date": date.today().strftime("%Y-%m-%d"),
        "state_changed": False,
        "gold_above_20dma": False,
        "gold_above_50dma": False,
        "gold_above_200dma": False,
        "silver_above_20dma": False,
        "silver_above_50dma": False,
        "gold_silver_ratio_trend": "neutral",
        "gold_vs_nifty_strength": 0.0,
        "available": False
    }


@router.get("/history")
async def get_pm_regime_history(days: int = 14):
    """
    Get PM regime history for the last N days.
    
    Useful for showing regime changes over time.
    """
    history = []
    
    for i in range(days):
        date_str = (date.today() - timedelta(days=i)).strftime("%Y-%m-%d")
        regime = get_pm_regime_for_date(date_str)
        
        if regime:
            history.append({
                "date": date_str,
                "state": regime.get("state"),
                "confidence": regime.get("confidence"),
                "triggers": regime.get("triggers", [])[:2]
            })
    
    # Find state changes
    state_changes = []
    for i in range(1, len(history)):
        if history[i]["state"] != history[i-1]["state"]:
            state_changes.append({
                "date": history[i-1]["date"],
                "from_state": history[i]["state"],
                "to_state": history[i-1]["state"]
            })
    
    return {
        "history": history,
        "state_changes": state_changes,
        "current_state": history[0]["state"] if history else "TRANSITION",
        "days_in_current_state": next(
            (i for i, h in enumerate(history) if i > 0 and h["state"] != history[0]["state"]),
            len(history)
        ) if history else 0
    }


@router.get("/context-badge")
async def get_pm_context_badge():
    """
    Get a simple context badge for UI display.
    
    Returns a single-line context description suitable for badges.
    """
    regime = get_latest_pm_regime()
    
    if not regime:
        return {
            "badge_text": "Macro: Neutral",
            "badge_type": "neutral",
            "tooltip": "PM regime data not available"
        }
    
    state = regime.get("state", "TRANSITION")
    confidence = regime.get("confidence", 0)
    
    if state == "RISK_OFF":
        return {
            "badge_text": f"Macro: Defensive ({confidence}%)",
            "badge_type": "warning",
            "tooltip": "Gold showing strength vs equities - defensive positioning suggested",
            "icon": "shield"
        }
    elif state == "RISK_ON":
        return {
            "badge_text": f"Macro: Constructive ({confidence}%)",
            "badge_type": "success",
            "tooltip": "Equities favored - gold showing relative weakness",
            "icon": "trending-up"
        }
    else:
        return {
            "badge_text": "Macro: Mixed",
            "badge_type": "neutral",
            "tooltip": "Mixed PM signals - proceed with normal caution",
            "icon": "activity"
        }

