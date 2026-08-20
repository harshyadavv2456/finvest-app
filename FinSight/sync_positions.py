#!/usr/bin/env python3
"""One-time position sync script."""

import json
from pathlib import Path
from datetime import datetime, timedelta

FINSIGHT = Path(__file__).parent
INTELLIGENCE_DIR = FINSIGHT / "public" / "intelligence"
TIMELINE_DIR = FINSIGHT / "public" / "timeline"
POSITIONS_DIR = FINSIGHT / "public" / "positions"
POSITIONS_DIR.mkdir(parents=True, exist_ok=True)

POSITIONS_FILE = POSITIONS_DIR / "active_positions.json"
today = datetime.now().strftime("%Y-%m-%d")

def load_positions():
    if not POSITIONS_FILE.exists():
        return {"US": {}, "IN": {}}
    try:
        return json.loads(POSITIONS_FILE.read_text())
    except:
        return {"US": {}, "IN": {}}

def save_positions(positions):
    positions["_metadata"] = {
        "last_sync": datetime.now().isoformat(),
        "version": 2
    }
    POSITIONS_FILE.write_text(json.dumps(positions, indent=2))

def find_first_initiate(market, ticker, max_days=90):
    """
    Find when a stock was FIRST marked INITIATE from timeline history.
    
    Scans ALL timeline files backwards and returns the EARLIEST INITIATE date.
    This properly tracks when a recommendation started, not just the most recent.
    """
    earliest_initiate = None
    
    for i in range(max_days):
        date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        snapshot_file = TIMELINE_DIR / market / f"{date_str}.json"
        
        if snapshot_file.exists():
            try:
                data = json.loads(snapshot_file.read_text())
                for rec in data.get("recommendations", []):
                    if rec.get("ticker", "").upper() == ticker.upper():
                        if rec.get("intent") == "INITIATE":
                            # Found INITIATE on this day - keep scanning for earlier ones
                            earliest_initiate = {
                                "date": date_str,
                                "conviction": rec.get("conviction")
                            }
                        # Don't stop - keep scanning backwards for earlier INITIATE
                        break
            except:
                continue
    
    return earliest_initiate

def sync_market(market, positions):
    """Sync positions for a market with current intelligence."""
    if market not in positions:
        positions[market] = {}
    
    market_positions = positions[market]
    intel_dir = INTELLIGENCE_DIR / market
    
    if not intel_dir.exists():
        print(f"{market}: No intelligence directory found")
        return positions
    
    added = 0
    updated = 0
    
    for intel_file in intel_dir.glob("*.json"):
        try:
            intel = json.loads(intel_file.read_text())
            ticker = intel.get("ticker", intel_file.stem)
            current_intent = intel.get("intent")
            
            # If INITIATE and not tracked, add it
            if current_intent == "INITIATE":
                if ticker not in market_positions:
                    first_initiate = find_first_initiate(market, ticker)
                    
                    entry_date = first_initiate["date"] if first_initiate else today
                    # Always use current price as entry price (timeline doesn't store historical prices)
                    entry_price = intel.get("last_price")
                    entry_conviction = first_initiate.get("conviction") if first_initiate else intel.get("conviction")
                    
                    market_positions[ticker] = {
                        "ticker": ticker,
                        "market": market,
                        "entry_date": entry_date,
                        "entry_price": entry_price,  # Use current price for now
                        "entry_conviction": entry_conviction,
                        "entry_intent": "INITIATE",
                        "suggested_holding_days": intel.get("expected_holding_days", 30),
                        "tracked_since": today
                    }
                    added += 1
            
            # For already tracked positions, update their current status
            if ticker in market_positions:
                pos = market_positions[ticker]
                entry_dt = datetime.strptime(pos["entry_date"], "%Y-%m-%d")
                days_held = (datetime.now() - entry_dt).days
                
                entry_price = pos.get("entry_price")
                current_price = intel.get("last_price")
                pnl_percent = None
                if entry_price and current_price:
                    pnl_percent = ((current_price - entry_price) / entry_price) * 100
                
                # Check holding period
                suggested_days = pos.get("suggested_holding_days", 30)
                holding_expired = days_held > suggested_days
                
                status = "HOLD"
                exit_reason = None
                if current_intent == "AVOID":
                    status = "EXIT_SIGNAL"
                    exit_reason = "Recommendation changed to AVOID"
                elif current_intent == "EXIT":
                    status = "EXIT_CRITICAL"
                    exit_reason = "EXIT signal triggered"
                elif current_intent == "REDUCE":
                    status = "REDUCE"
                    exit_reason = "Position reduction recommended"
                elif holding_expired:
                    status = "REVIEW"
                    exit_reason = f"Holding period ({suggested_days}d) exceeded"
                
                market_positions[ticker].update({
                    "current_intent": current_intent,
                    "current_conviction": intel.get("conviction"),
                    "current_price": current_price,
                    "days_held": days_held,
                    "pnl_percent": round(pnl_percent, 2) if pnl_percent else None,
                    "status": status,
                    "exit_reason": exit_reason,
                    "last_updated": datetime.now().isoformat()
                })
                updated += 1
        except Exception as e:
            continue
    
    positions[market] = market_positions
    print(f"{market}: {added} new, {updated} updated, {len(market_positions)} total")
    return positions


def full_discovery_sync(market, positions):
    """
    Discover ALL stocks that were ever INITIATE in timeline and track them.
    This ensures we catch stocks that were INITIATE earlier but are now HOLD.
    """
    if market not in positions:
        positions[market] = {}
    
    market_positions = positions[market]
    intel_dir = INTELLIGENCE_DIR / market
    timeline_market_dir = TIMELINE_DIR / market
    
    if not intel_dir.exists():
        print(f"{market}: No intelligence directory")
        return positions
    
    added = 0
    
    # Scan ALL timeline files to find any stock that was ever INITIATE
    if timeline_market_dir.exists():
        for timeline_file in timeline_market_dir.glob("*.json"):
            if "pm_regime" in timeline_file.name:
                continue
            try:
                data = json.loads(timeline_file.read_text())
                for rec in data.get("recommendations", []):
                    ticker = rec.get("ticker")
                    if not ticker or ticker in market_positions:
                        continue
                    
                    if rec.get("intent") == "INITIATE":
                        # Found a stock that was INITIATE - add if not already tracked
                        first_initiate = find_first_initiate(market, ticker)
                        
                        # Get current intelligence
                        intel_file = intel_dir / f"{ticker}.json"
                        if intel_file.exists():
                            intel = json.loads(intel_file.read_text())
                            entry_date = first_initiate["date"] if first_initiate else rec.get("as_of_date", today)
                            entry_conviction = first_initiate.get("conviction") if first_initiate else rec.get("conviction")
                            
                            market_positions[ticker] = {
                                "ticker": ticker,
                                "market": market,
                                "entry_date": entry_date,
                                "entry_price": intel.get("last_price"),
                                "entry_conviction": entry_conviction,
                                "entry_intent": "INITIATE",
                                "suggested_holding_days": intel.get("expected_holding_days", 30),
                                "tracked_since": today
                            }
                            added += 1
            except:
                continue
    
    print(f"{market}: Discovered {added} additional historical positions")
    positions[market] = market_positions
    return positions

def force_resync():
    """Force resync by clearing all positions and rebuilding from timeline."""
    print("FORCE RESYNC: Clearing existing positions...")
    positions = {"US": {}, "IN": {}}
    
    for market in ["US", "IN"]:
        # First, discover ALL historical INITIATE positions
        positions = full_discovery_sync(market, positions)
        # Then update with current status
        positions = sync_market(market, positions)
    
    save_positions(positions)
    return positions


if __name__ == "__main__":
    import sys
    
    print("=" * 50)
    print("Position Tracker Sync")
    print("=" * 50)
    
    # Check for --force flag to resync from scratch
    if "--force" in sys.argv:
        positions = force_resync()
    else:
        positions = load_positions()
        for market in ["US", "IN"]:
            positions = sync_market(market, positions)
        save_positions(positions)
    
    us_count = len([k for k in positions.get("US", {}).keys() if k != "_metadata"])
    in_count = len([k for k in positions.get("IN", {}).keys() if k != "_metadata"])
    total = us_count + in_count
    
    print("=" * 50)
    print(f"Sync complete. Total: {total} positions tracked")
    print(f"  US: {us_count}")
    print(f"  IN: {in_count}")
    print("=" * 50)

