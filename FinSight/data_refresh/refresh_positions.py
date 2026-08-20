#!/usr/bin/env python3
"""
Refresh Positions - Position reconciliation for Phase 42

PHASE 43: Real Deployment & Paper Mode Go-Live

This module handles:
1. Loading position state from storage
2. Generating position signals from intelligence data
3. Preparing reconciliation input for frontend

NOTE: The actual reconciliation happens in TypeScript (frontend).
This script prepares the data and generates a reconciliation snapshot.

RULES:
- Fail-loud (raise exceptions on critical errors)
- Explicit logging
- Deterministic ordering
"""

import sys
import os
import json
import time
import logging
from pathlib import Path
from datetime import datetime, date
from typing import Dict, List, Any, Optional

# Setup paths
SCRIPT_DIR = Path(__file__).parent.resolve()
FINSIGHT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(FINSIGHT_DIR))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


def load_positions_from_storage() -> List[Dict[str, Any]]:
    """
    Load positions from the position storage file.
    
    Returns:
        List of position dictionaries
    """
    positions_file = FINSIGHT_DIR / "data" / "positions" / "positions.json"
    
    if not positions_file.exists():
        logger.info("No positions file found, returning empty list")
        return []
    
    try:
        with open(positions_file, 'r') as f:
            data = json.load(f)
            positions = data.get("positions", [])
            logger.info(f"Loaded {len(positions)} positions from storage")
            return positions
    except Exception as e:
        logger.exception(f"Error loading positions: {e}")
        return []


def load_intelligence_for_symbol(symbol: str, market: str = "IN") -> Optional[Dict[str, Any]]:
    """
    Load intelligence data for a symbol.
    
    Args:
        symbol: Stock symbol (e.g., "RELIANCE")
        market: Market code (US or IN)
        
    Returns:
        Intelligence data dict or None
    """
    intel_file = FINSIGHT_DIR / "public" / "intelligence" / market / f"{symbol}.json"
    
    if not intel_file.exists():
        return None
    
    try:
        with open(intel_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Error loading intelligence for {symbol}: {e}")
        return None


def generate_position_signals(positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate signal data for each position from intelligence.
    
    Args:
        positions: List of position dictionaries
        
    Returns:
        List of signal data for reconciliation
    """
    signals = []
    
    for pos in positions:
        symbol = pos.get("symbol", "")
        market = "IN" if pos.get("exchange") == "NSE" else "US"
        
        intel = load_intelligence_for_symbol(symbol, market)
        
        if intel:
            # Extract signal data from intelligence
            signal = {
                "symbol": symbol,
                "composite_score": intel.get("composite_score", 50),
                "momentum_score": intel.get("momentum_score", 50),
                "value_score": intel.get("value_score", 50),
                "quality_score": intel.get("quality_score", 50),
                "recommendation": intel.get("intent", "HOLD")
            }
        else:
            # Default signal when no intelligence available
            signal = {
                "symbol": symbol,
                "composite_score": 50,
                "momentum_score": 50,
                "value_score": 50,
                "quality_score": 50,
                "recommendation": "HOLD"
            }
        
        signals.append(signal)
        logger.debug(f"  {symbol}: composite_score={signal['composite_score']}")
    
    return signals


def get_market_context() -> Dict[str, Any]:
    """
    Get current market context for reconciliation.
    
    Returns:
        Market context dictionary
    """
    today = date.today().isoformat()
    
    # Try to load from market data
    # For now, return a default neutral context
    return {
        "date": today,
        "market_regime": "NEUTRAL",
        "sector_sentiments": {},
        "volatility_level": "MEDIUM",
        "nifty_change_percent": 0.0,
        "sector_changes": {}
    }


def prepare_reconciliation_snapshot(
    positions: List[Dict[str, Any]],
    signals: List[Dict[str, Any]],
    market_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Prepare a reconciliation snapshot for the frontend.
    
    Args:
        positions: List of positions
        signals: List of signals
        market_context: Market context
        
    Returns:
        Reconciliation snapshot ready for frontend
    """
    today = date.today().isoformat()
    
    snapshot = {
        "date": today,
        "generated_at": datetime.now().isoformat(),
        "positions_count": len(positions),
        "positions": positions,
        "signals": signals,
        "market_context": market_context,
        "risk_budget_remaining": 50.0,  # 50% remaining
        "capital_available": 1000000  # 10L available
    }
    
    return snapshot


def save_reconciliation_snapshot(snapshot: Dict[str, Any]) -> Path:
    """
    Save the reconciliation snapshot for frontend to process.
    
    Args:
        snapshot: Reconciliation snapshot
        
    Returns:
        Path to saved file
    """
    today = date.today().isoformat()
    
    output_dir = FINSIGHT_DIR / "data" / "positions" / "reconciliation"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / f"reconciliation_{today}.json"
    
    with open(output_file, 'w') as f:
        json.dump(snapshot, f, indent=2, default=str)
    
    logger.info(f"Saved reconciliation snapshot to {output_file}")
    return output_file


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Refresh position data for reconciliation")
    parser.add_argument("--dry-run", action="store_true", help="Don't save snapshot")
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("REFRESHING POSITION DATA")
    logger.info("=" * 60)
    
    start_time = time.time()
    
    # Step 1: Load positions
    logger.info("Loading positions from storage...")
    positions = load_positions_from_storage()
    logger.info(f"  Found {len(positions)} positions")
    
    # Step 2: Generate signals
    logger.info("Generating signals from intelligence...")
    signals = generate_position_signals(positions)
    logger.info(f"  Generated {len(signals)} signals")
    
    # Step 3: Get market context
    logger.info("Getting market context...")
    market_context = get_market_context()
    
    # Step 4: Prepare snapshot
    logger.info("Preparing reconciliation snapshot...")
    snapshot = prepare_reconciliation_snapshot(positions, signals, market_context)
    
    # Step 5: Save snapshot
    if not args.dry_run:
        output_file = save_reconciliation_snapshot(snapshot)
    else:
        logger.info("Dry run - not saving snapshot")
    
    # Summary
    duration = time.time() - start_time
    
    logger.info("")
    logger.info("=" * 60)
    logger.info("POSITION REFRESH COMPLETE")
    logger.info("=" * 60)
    logger.info(f"  Positions: {len(positions)}")
    logger.info(f"  Signals: {len(signals)}")
    logger.info(f"  Duration: {duration:.1f}s")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

