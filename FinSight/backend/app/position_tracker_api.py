"""
Position Tracker API - Historical Recommendation Memory with EXIT Signals
==========================================================================

CORE CONCEPT: Track ALL recommendations from INITIATE through their lifecycle.
This is a MEMORY system, not a trading system.

Key Features:
1. ACCUMULATES positions over time - never forgets past recommendations
2. Tracks when INITIATE first appeared (not today's date)
3. Shows full lifecycle: INITIATE → HOLD → AVOID/EXIT
4. Holding period countdown and warnings
5. Historical performance tracking

Data stored in: public/positions/
- active_positions.json - Currently tracked positions (accumulated)
- position_history.json - Full historical record
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/positions", tags=["Position Tracker"])

# Paths
_app_dir = Path(__file__).parent
_backend_dir = _app_dir.parent
_finsight_dir = _backend_dir.parent
POSITIONS_DIR = _finsight_dir / "public" / "positions"
INTELLIGENCE_DIR = _finsight_dir / "public" / "intelligence"
TIMELINE_DIR = _finsight_dir / "public" / "timeline"
DATA_DIR = _finsight_dir / "data"

POSITIONS_FILE = POSITIONS_DIR / "active_positions.json"
HISTORY_FILE = POSITIONS_DIR / "position_history.json"

# Ensure directory exists
POSITIONS_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================================
# DATA LOADING FUNCTIONS
# ============================================================================

def load_active_positions() -> Dict[str, Dict]:
    """Load active positions from file - these ACCUMULATE over time."""
    if not POSITIONS_FILE.exists():
        return {"US": {}, "IN": {}, "_metadata": {"last_sync": None, "version": 2}}
    
    try:
        with open(POSITIONS_FILE) as f:
            data = json.load(f)
            # Ensure market keys exist
            if "US" not in data:
                data["US"] = {}
            if "IN" not in data:
                data["IN"] = {}
            return data
    except Exception as e:
        logger.error(f"Error loading positions: {e}")
        return {"US": {}, "IN": {}, "_metadata": {"last_sync": None, "version": 2}}

def save_active_positions(positions: Dict[str, Dict]):
    """Save active positions to file with metadata."""
    positions["_metadata"] = {
        "last_sync": datetime.now().isoformat(),
        "version": 2
    }
    try:
        with open(POSITIONS_FILE, 'w') as f:
            json.dump(positions, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving positions: {e}")

def load_position_history() -> Dict:
    """Load full position history."""
    if not HISTORY_FILE.exists():
        return {"US": {}, "IN": {}}
    
    try:
        with open(HISTORY_FILE) as f:
            return json.load(f)
    except:
        return {"US": {}, "IN": {}}

def save_position_history(history: Dict):
    """Save position history."""
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving history: {e}")

def get_current_intelligence(market: str, ticker: str) -> Optional[Dict]:
    """Load current intelligence for a ticker."""
    intel_file = INTELLIGENCE_DIR / market / f"{ticker}.json"
    
    if not intel_file.exists():
        return None
    
    try:
        with open(intel_file) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading intelligence for {ticker}: {e}")
        return None


# ============================================================================
# TIMELINE SCANNING - Find when INITIATE first appeared
# ============================================================================

def find_first_initiate_date(market: str, ticker: str, max_days: int = 90) -> Optional[dict]:
    """
    Scan timeline snapshots to find when a stock was first marked INITIATE.
    Returns the earliest date with INITIATE status.
    NOTE: Does NOT include price from timeline (expected_return is a %, not a price)
    """
    initiate_dates = []
    
    for i in range(max_days):
        date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        snapshot_file = TIMELINE_DIR / market / f"{date_str}.json"
        
        if snapshot_file.exists():
            try:
                with open(snapshot_file) as f:
                    snapshot = json.load(f)
                
                for rec in snapshot.get("recommendations", []):
                    if rec.get("ticker", "").upper() == ticker.upper():
                        if rec.get("intent") == "INITIATE":
                            initiate_dates.append({
                                "date": date_str,
                                "conviction": rec.get("conviction")
                                # Note: Don't use expected_return as price!
                            })
                        break
            except:
                continue
    
    # Return the EARLIEST initiate date found
    if initiate_dates:
        initiate_dates.sort(key=lambda x: x["date"])
        return initiate_dates[0]
    
    return None

def get_position_timeline(market: str, ticker: str, days: int = 90) -> List[Dict]:
    """Get the full stance timeline for a stock."""
    timeline = []
    
    for i in range(days):
        date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        snapshot_file = TIMELINE_DIR / market / f"{date_str}.json"
        
        if snapshot_file.exists():
            try:
                with open(snapshot_file) as f:
                    snapshot = json.load(f)
                
                for rec in snapshot.get("recommendations", []):
                    if rec.get("ticker", "").upper() == ticker.upper():
                        timeline.append({
                            "date": date_str,
                            "intent": rec.get("intent"),
                            "conviction": rec.get("conviction"),
                            "price": rec.get("price") or rec.get("last_price")
                        })
                        break
            except:
                continue
    
    # Sort oldest first
    timeline.sort(key=lambda x: x["date"])
    return timeline

def detect_lifecycle_stage(timeline: List[Dict]) -> Dict:
    """
    Analyze timeline to determine lifecycle stage.
    Returns: {stage, transitions, days_at_current_stage}
    """
    if not timeline:
        return {"stage": "UNKNOWN", "transitions": [], "days_at_stage": 0}
    
    transitions = []
    current_intent = timeline[-1]["intent"] if timeline else None
    days_at_stage = 0
    
    # Find transitions
    for i in range(1, len(timeline)):
        if timeline[i]["intent"] != timeline[i-1]["intent"]:
            transitions.append({
                "date": timeline[i]["date"],
                "from": timeline[i-1]["intent"],
                "to": timeline[i]["intent"]
            })
    
    # Count days at current stage
    if timeline:
        for entry in reversed(timeline):
            if entry["intent"] == current_intent:
                days_at_stage += 1
            else:
                break
    
    return {
        "stage": current_intent,
        "transitions": transitions,
        "days_at_stage": days_at_stage,
        "total_tracked_days": len(timeline)
    }


# ============================================================================
# POSITION SYNC LOGIC - Accumulative, Never Forgets
# ============================================================================

def sync_market_positions(market: str, positions: Dict) -> Dict:
    """
    Sync positions for a market with current intelligence.
    
    KEY LOGIC:
    1. Scan ALL current INITIATE stocks from intelligence
    2. For each: find FIRST initiate date from timeline history
    3. ADD new positions (never remove unless explicitly closed)
    4. UPDATE existing positions with current status
    """
    if market not in positions:
        positions[market] = {}
    
    market_positions = positions[market]
    intel_dir = INTELLIGENCE_DIR / market
    
    if not intel_dir.exists():
        return positions
    
    today = datetime.now().strftime("%Y-%m-%d")
    added = 0
    updated = 0
    
    # Scan all intelligence files for INITIATE recommendations
    for intel_file in intel_dir.glob("*.json"):
        try:
            with open(intel_file) as f:
                intel = json.load(f)
            
            ticker = intel.get("ticker", intel_file.stem)
            current_intent = intel.get("intent")
            
            # If this is INITIATE and not yet tracked, add it
            if current_intent == "INITIATE":
                if ticker not in market_positions:
                    # Find when INITIATE first appeared
                    first_initiate = find_first_initiate_date(market, ticker)
                    
                    entry_date = first_initiate["date"] if first_initiate else today
                    # Always use current price as entry price (timeline doesn't store historical prices)
                    entry_price = intel.get("last_price")
                    entry_conviction = first_initiate.get("conviction") if first_initiate else intel.get("conviction")
                    
                    market_positions[ticker] = {
                        "ticker": ticker,
                        "market": market,
                        "entry_date": entry_date,
                        "entry_price": entry_price,
                        "entry_conviction": entry_conviction,
                        "entry_intent": "INITIATE",
                        "suggested_holding_days": intel.get("expected_holding_days", 30),
                        "rationale": intel.get("rationale", "")[:500],
                        "tracked_since": today,
                        "status": "ACTIVE"
                    }
                    added += 1
                else:
                    # Already tracked, just update
                    updated += 1
            
            # For already tracked positions, update their current status
            elif ticker in market_positions:
                # Update the position with current intelligence
                pos = market_positions[ticker]
                
                # Calculate days held from ORIGINAL entry date
                entry_dt = datetime.strptime(pos["entry_date"], "%Y-%m-%d")
                days_held = (datetime.now() - entry_dt).days
                
                # Calculate P&L
                entry_price = pos.get("entry_price")
                current_price = intel.get("last_price")
                pnl_percent = None
                if entry_price and current_price:
                    pnl_percent = ((current_price - entry_price) / entry_price) * 100
                
                # Determine status
                status = "ACTIVE"
                exit_reason = None
                exit_urgency = "normal"
                holding_warning = None
                suggested_days = pos.get("suggested_holding_days", 30)
                
                if current_intent == "AVOID":
                    status = "EXIT_SIGNAL"
                    exit_reason = f"Stance changed from INITIATE to AVOID on {today}"
                    exit_urgency = "urgent"
                elif current_intent == "EXIT":
                    status = "EXIT_CRITICAL"
                    exit_reason = "EXIT signal - immediate action recommended"
                    exit_urgency = "critical"
                elif current_intent == "REDUCE":
                    status = "REDUCE"
                    exit_reason = "Consider reducing position size"
                    exit_urgency = "normal"
                elif current_intent == "HOLD":
                    status = "HOLD"
                    # Check holding period warning
                    if days_held >= suggested_days:
                        holding_warning = f"Holding period of {suggested_days} days reached"
                        exit_urgency = "review"
                    elif days_held >= suggested_days - 5:
                        holding_warning = f"Holding period ending in {suggested_days - days_held} days"
                
                # Update position
                market_positions[ticker].update({
                    "current_intent": current_intent,
                    "current_conviction": intel.get("conviction"),
                    "current_price": current_price,
                    "days_held": days_held,
                    "pnl_percent": round(pnl_percent, 2) if pnl_percent else None,
                    "status": status,
                    "exit_reason": exit_reason,
                    "exit_urgency": exit_urgency,
                    "holding_warning": holding_warning,
                    "last_updated": datetime.now().isoformat()
                })
                updated += 1
        
        except Exception as e:
            logger.error(f"Error processing {intel_file}: {e}")
            continue
    
    # For positions not in today's intelligence, mark as stale
    for ticker in list(market_positions.keys()):
        if ticker not in [f.stem for f in intel_dir.glob("*.json")]:
            market_positions[ticker]["status"] = "NO_DATA"
            market_positions[ticker]["exit_reason"] = "Stock no longer in intelligence coverage"
    
    positions[market] = market_positions
    positions["_sync_stats"] = positions.get("_sync_stats", {})
    positions["_sync_stats"][market] = {
        "last_sync": today,
        "added": added,
        "updated": updated,
        "total": len(market_positions)
    }
    
    return positions


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/active/{market}")
async def get_active_positions(market: str):
    """
    Get all actively tracked positions for a market.
    Returns ACCUMULATED positions from history, not just today's.
    """
    market = market.upper()
    positions = load_active_positions()
    market_positions = positions.get(market, {})
    
    # Group positions by status
    exit_signals = []
    active_holds = []
    all_positions = []
    
    for ticker, pos in market_positions.items():
        # Get latest intelligence for current status
        intel = get_current_intelligence(market, ticker)
        if intel:
            # Recalculate based on current intelligence
            entry_dt = datetime.strptime(pos["entry_date"], "%Y-%m-%d")
            days_held = (datetime.now() - entry_dt).days
            
            entry_price = pos.get("entry_price")
            current_price = intel.get("last_price")
            pnl_percent = None
            if entry_price and current_price:
                pnl_percent = ((current_price - entry_price) / entry_price) * 100
            
            current_intent = intel.get("intent")
            suggested_days = pos.get("suggested_holding_days", 30)
            
            # Determine status
            status = "HOLD"
            exit_reason = None
            exit_urgency = "normal"
            holding_warning = None
            
            if current_intent == "AVOID":
                status = "EXIT_SIGNAL"
                exit_reason = "Stance changed to AVOID - Exit recommended"
                exit_urgency = "urgent"
            elif current_intent == "EXIT":
                status = "EXIT_SIGNAL"
                exit_reason = "EXIT signal - Close immediately"
                exit_urgency = "critical"
            elif current_intent == "REDUCE":
                status = "REDUCE"
                exit_reason = "Consider reducing position"
            else:
                if days_held >= suggested_days:
                    holding_warning = f"⚠️ Holding period ({suggested_days}d) reached!"
                elif days_held >= suggested_days - 5:
                    holding_warning = f"⏰ {suggested_days - days_held}d until holding period ends"
            
            position_data = {
                **pos,
                "current_intent": current_intent,
                "current_conviction": intel.get("conviction"),
                "current_price": current_price,
                "days_held": days_held,
                "pnl_percent": round(pnl_percent, 2) if pnl_percent else None,
                "status": status,
                "exit_reason": exit_reason,
                "exit_urgency": exit_urgency,
                "holding_warning": holding_warning,
                "holding_progress": min(100, int((days_held / suggested_days) * 100)) if suggested_days > 0 else 0
            }
            
            all_positions.append(position_data)
            
            if status in ["EXIT_SIGNAL", "EXIT_CRITICAL"]:
                exit_signals.append(position_data)
            else:
                active_holds.append(position_data)
    
    # Sort by urgency and days held
    exit_signals.sort(key=lambda x: (
        0 if x["exit_urgency"] == "critical" else 1,
        -x.get("days_held", 0)
    ))
    active_holds.sort(key=lambda x: -x.get("days_held", 0))
    all_positions.sort(key=lambda x: (
        0 if x["status"] == "EXIT_SIGNAL" else 1,
        -x.get("days_held", 0)
    ))
    
    # Calculate averages
    avg_days = sum(p.get("days_held", 0) for p in all_positions) / len(all_positions) if all_positions else 0
    
    return {
        "market": market,
        "total_positions": len(all_positions),
        "exit_signals": len(exit_signals),
        "active_holds": len(active_holds),
        "avg_days_held": round(avg_days, 1),
        "positions": all_positions,
        "exit_required": exit_signals,
        "holds": active_holds,
        "sync_info": positions.get("_sync_stats", {}).get(market, {}),
        "generated_at": datetime.now().isoformat()
    }

@router.post("/sync/{market}")
async def sync_positions(market: str, force: bool = False):
    """
    Sync positions with current intelligence.
    
    This is the KEY function that:
    1. Scans ALL INITIATE stocks from intelligence
    2. Finds their FIRST initiate date from timeline history
    3. ACCUMULATES new positions (never removes old ones)
    4. Updates existing positions with current status
    """
    market = market.upper()
    positions = load_active_positions()
    
    # Perform sync
    positions = sync_market_positions(market, positions)
    save_active_positions(positions)
    
    stats = positions.get("_sync_stats", {}).get(market, {})
    
    return {
        "status": "OK",
        "market": market,
        "sync_stats": stats,
        "message": f"Synced {stats.get('total', 0)} positions ({stats.get('added', 0)} new)"
    }

@router.post("/sync-all")
async def sync_all_markets():
    """Sync both US and IN markets."""
    positions = load_active_positions()
    
    for market in ["US", "IN"]:
        positions = sync_market_positions(market, positions)
    
    save_active_positions(positions)
    
    return {
        "status": "OK",
        "US": positions.get("_sync_stats", {}).get("US", {}),
        "IN": positions.get("_sync_stats", {}).get("IN", {})
    }

@router.get("/timeline/{market}/{ticker}")
async def get_ticker_timeline(market: str, ticker: str, days: int = 90):
    """
    Get full stance timeline for a stock.
    Shows: INITIATE → HOLD → AVOID transitions with dates.
    """
    market = market.upper()
    ticker = ticker.upper()
    
    timeline = get_position_timeline(market, ticker, days)
    lifecycle = detect_lifecycle_stage(timeline)
    
    # Find first INITIATE
    first_initiate = None
    for entry in timeline:
        if entry["intent"] == "INITIATE":
            first_initiate = entry
            break
    
    return {
        "ticker": ticker,
        "market": market,
        "timeline": timeline,
        "lifecycle": lifecycle,
        "first_initiate": first_initiate,
        "current_intent": timeline[-1]["intent"] if timeline else None,
        "total_days_tracked": len(timeline)
    }

@router.delete("/close/{market}/{ticker}")
async def close_position(market: str, ticker: str, reason: str = "manual"):
    """
    Close a position (mark as historical).
    Position is moved to history, not deleted.
    """
    market = market.upper()
    ticker = ticker.upper()
    
    positions = load_active_positions()
    
    if market in positions and ticker in positions[market]:
        # Move to history
        history = load_position_history()
        if market not in history:
            history[market] = {}
        
        closed_pos = positions[market][ticker]
        closed_pos["closed_at"] = datetime.now().isoformat()
        closed_pos["close_reason"] = reason
        closed_pos["status"] = "CLOSED"
        
        history[market][f"{ticker}_{datetime.now().strftime('%Y%m%d')}"] = closed_pos
        save_position_history(history)
        
        # Remove from active
        del positions[market][ticker]
        save_active_positions(positions)
        
        return {"status": "OK", "message": f"Position {ticker} closed and moved to history"}
    
    raise HTTPException(status_code=404, detail=f"Position {ticker} not found")

@router.get("/exits/{market}")
async def get_exit_signals(market: str):
    """Get all positions that need EXIT action."""
    market = market.upper()
    result = await get_active_positions(market)
    
    return {
        "market": market,
        "total_exits": len(result.get("exit_required", [])),
        "exits": result.get("exit_required", []),
        "generated_at": datetime.now().isoformat()
    }

@router.get("/holding-warnings/{market}")
async def get_holding_warnings(market: str):
    """Get positions where holding period is ending soon."""
    market = market.upper()
    result = await get_active_positions(market)
    
    warnings = [
        p for p in result.get("positions", [])
        if p.get("holding_warning")
    ]
    
    return {
        "market": market,
        "warnings": warnings,
        "total": len(warnings)
    }

@router.get("/summary")
async def get_summary():
    """Get summary across all markets."""
    us_result = await get_active_positions("US")
    in_result = await get_active_positions("IN")
    
    return {
        "total_positions": us_result["total_positions"] + in_result["total_positions"],
        "total_exits": us_result["exit_signals"] + in_result["exit_signals"],
        "US": {
            "positions": us_result["total_positions"],
            "exits": us_result["exit_signals"],
            "avg_days": us_result["avg_days_held"]
        },
        "IN": {
            "positions": in_result["total_positions"],
            "exits": in_result["exit_signals"],
            "avg_days": in_result["avg_days_held"]
        }
    }

@router.post("/track/{market}/{ticker}")
async def manual_track(market: str, ticker: str, entry_price: Optional[float] = None):
    """Manually track a position (if user wants to add one)."""
    market = market.upper()
    ticker = ticker.upper()
    
    intel = get_current_intelligence(market, ticker)
    if not intel:
        raise HTTPException(status_code=404, detail=f"No intelligence for {ticker}")
    
    positions = load_active_positions()
    if market not in positions:
        positions[market] = {}
    
    if ticker in positions[market]:
        return {"status": "EXISTS", "message": f"{ticker} already tracked"}
    
    # Find first INITIATE date
    first_initiate = find_first_initiate_date(market, ticker)
    
    today = datetime.now().strftime("%Y-%m-%d")
    entry_date = first_initiate["date"] if first_initiate else today
    
    positions[market][ticker] = {
        "ticker": ticker,
        "market": market,
        "entry_date": entry_date,
        "entry_price": entry_price or (first_initiate.get("price") if first_initiate else intel.get("last_price")),
        "entry_conviction": first_initiate.get("conviction") if first_initiate else intel.get("conviction"),
        "entry_intent": "INITIATE",
        "suggested_holding_days": intel.get("expected_holding_days", 30),
        "tracked_since": today,
        "manual_add": True
    }
    
    save_active_positions(positions)
    
    return {
        "status": "OK",
        "message": f"Now tracking {ticker} (entry: {entry_date})",
        "position": positions[market][ticker]
    }


# ============================================================================
# REFRESH FUNCTION - Called by daily_refresh_final.py
# ============================================================================

def refresh_all_positions():
    """
    Called by daily refresh script to sync all positions.
    This ensures positions are updated with latest intelligence.
    """
    positions = load_active_positions()
    
    for market in ["US", "IN"]:
        positions = sync_market_positions(market, positions)
    
    save_active_positions(positions)
    
    us_stats = positions.get("_sync_stats", {}).get("US", {})
    in_stats = positions.get("_sync_stats", {}).get("IN", {})
    
    return {
        "status": "OK",
        "US": us_stats,
        "IN": in_stats,
        "total": us_stats.get("total", 0) + in_stats.get("total", 0)
    }
