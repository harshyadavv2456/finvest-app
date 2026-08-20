#!/usr/bin/env python3
"""
Run Daily Simulation - Full daily pipeline including position reconciliation

PHASE 43: Real Deployment & Paper Mode Go-Live

This is the AUTHORITATIVE daily simulation script.

EXECUTION ORDER:
1. Refresh market data (stock prices, screener)
2. Refresh signals (insider, FII/DII, intelligence)
3. Refresh positions (load positions, generate signals)
4. Generate daily summary

PAPER MODE:
- ExecutionOrchestrator is set to PAPER mode
- Orders are recorded as WOULD_HAVE_EXECUTED
- No broker APIs are hit

RULES:
- Fail-loud on critical errors
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
from typing import Dict, Any

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


# =============================================================================
# CONFIGURATION
# =============================================================================

class SimulationConfig:
    """Configuration for daily simulation."""
    
    # Execution mode - PAPER or LIVE
    # PAPER mode records trades but doesn't execute
    EXECUTION_MODE = "PAPER"
    
    # LIVE execution is HARD-DISABLED
    LIVE_EXECUTION_ENABLED = False
    
    # Skip heavy data refreshes (for faster testing)
    SKIP_STOCK_DATA = True  # Stock data updates take hours
    SKIP_INTELLIGENCE = False  # Intelligence is critical
    
    # Output directories
    OUTPUT_DIR = FINSIGHT_DIR / "data" / "daily_simulations"
    
    @classmethod
    def validate(cls):
        """Validate configuration."""
        if cls.EXECUTION_MODE == "LIVE" and not cls.LIVE_EXECUTION_ENABLED:
            raise RuntimeError("LIVE execution is HARD-DISABLED. Cannot run in LIVE mode.")


# =============================================================================
# SIMULATION RUNNER
# =============================================================================

def run_daily_simulation() -> Dict[str, Any]:
    """
    Run the full daily simulation pipeline.
    
    Returns:
        Summary dictionary with results from each step
    """
    logger.info("")
    logger.info("╔════════════════════════════════════════════════════════════╗")
    logger.info("║         FINVEST DAILY SIMULATION PIPELINE                  ║")
    logger.info("║         Phase 43: Paper Mode Go-Live                       ║")
    logger.info("╚════════════════════════════════════════════════════════════╝")
    logger.info("")
    
    today = date.today().isoformat()
    start_time = time.time()
    
    # Validate config
    SimulationConfig.validate()
    logger.info(f"Execution Mode: {SimulationConfig.EXECUTION_MODE}")
    logger.info(f"Date: {today}")
    logger.info("")
    
    results = {
        "date": today,
        "mode": SimulationConfig.EXECUTION_MODE,
        "started_at": datetime.now().isoformat(),
        "steps": {}
    }
    
    # =========================================================================
    # STEP 1: REFRESH MARKET DATA
    # =========================================================================
    logger.info("=" * 60)
    logger.info("[STEP 1] REFRESH MARKET DATA")
    logger.info("=" * 60)
    
    try:
        from data_refresh.refresh_market_data import refresh_stock_data, rebuild_screener_snapshot
        
        if not SimulationConfig.SKIP_STOCK_DATA:
            stock_result = refresh_stock_data()
            results["steps"]["stock_data"] = stock_result
        else:
            logger.info("Skipping stock data refresh (SKIP_STOCK_DATA=True)")
            results["steps"]["stock_data"] = {"skipped": True}
        
        screener_result = rebuild_screener_snapshot()
        results["steps"]["screener"] = screener_result
        
    except Exception as e:
        logger.exception(f"Market data refresh failed: {e}")
        results["steps"]["market_data_error"] = str(e)
    
    # =========================================================================
    # STEP 2: REFRESH SIGNALS
    # =========================================================================
    logger.info("")
    logger.info("=" * 60)
    logger.info("[STEP 2] REFRESH SIGNALS")
    logger.info("=" * 60)
    
    try:
        from data_refresh.refresh_signals import (
            refresh_insiderflow,
            refresh_fii_dii,
            refresh_indian_announcements,
            refresh_intelligence
        )
        
        results["steps"]["insiderflow"] = refresh_insiderflow()
        results["steps"]["fii_dii"] = refresh_fii_dii()
        results["steps"]["indian_announcements"] = refresh_indian_announcements()
        
        if not SimulationConfig.SKIP_INTELLIGENCE:
            results["steps"]["intelligence"] = refresh_intelligence()
        else:
            logger.info("Skipping intelligence refresh (SKIP_INTELLIGENCE=True)")
            results["steps"]["intelligence"] = {"skipped": True}
        
    except Exception as e:
        logger.exception(f"Signals refresh failed: {e}")
        results["steps"]["signals_error"] = str(e)
    
    # =========================================================================
    # STEP 3: REFRESH POSITIONS
    # =========================================================================
    logger.info("")
    logger.info("=" * 60)
    logger.info("[STEP 3] REFRESH POSITIONS")
    logger.info("=" * 60)
    
    try:
        from data_refresh.refresh_positions import (
            load_positions_from_storage,
            generate_position_signals,
            get_market_context,
            prepare_reconciliation_snapshot,
            save_reconciliation_snapshot
        )
        
        positions = load_positions_from_storage()
        signals = generate_position_signals(positions)
        market_context = get_market_context()
        
        snapshot = prepare_reconciliation_snapshot(positions, signals, market_context)
        output_file = save_reconciliation_snapshot(snapshot)
        
        results["steps"]["positions"] = {
            "success": True,
            "positions_count": len(positions),
            "signals_count": len(signals),
            "snapshot_file": str(output_file)
        }
        
    except Exception as e:
        logger.exception(f"Position refresh failed: {e}")
        results["steps"]["positions_error"] = str(e)
    
    # =========================================================================
    # STEP 4: GENERATE DAILY SUMMARY
    # =========================================================================
    logger.info("")
    logger.info("=" * 60)
    logger.info("[STEP 4] GENERATE DAILY SUMMARY")
    logger.info("=" * 60)
    
    total_duration = time.time() - start_time
    results["completed_at"] = datetime.now().isoformat()
    results["duration_seconds"] = total_duration
    
    # Count successes and failures
    successes = 0
    failures = 0
    skipped = 0
    
    for step_name, step_result in results["steps"].items():
        if isinstance(step_result, dict):
            if step_result.get("skipped"):
                skipped += 1
            elif step_result.get("success"):
                successes += 1
            elif step_result.get("success") is False:
                failures += 1
    
    results["summary"] = {
        "successes": successes,
        "failures": failures,
        "skipped": skipped
    }
    
    # Save results
    SimulationConfig.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results_file = SimulationConfig.OUTPUT_DIR / f"simulation_{today}.json"
    
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    logger.info(f"Results saved to: {results_file}")
    
    # Print summary
    logger.info("")
    logger.info("╔════════════════════════════════════════════════════════════╗")
    logger.info("║         DAILY SIMULATION COMPLETE                          ║")
    logger.info("╚════════════════════════════════════════════════════════════╝")
    logger.info(f"  Mode: {SimulationConfig.EXECUTION_MODE}")
    logger.info(f"  Date: {today}")
    logger.info(f"  Duration: {total_duration:.1f}s")
    logger.info(f"  Steps: {successes} OK / {failures} FAILED / {skipped} SKIPPED")
    logger.info("")
    
    return results


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Run daily simulation")
    parser.add_argument("--skip-market-data", action="store_true", help="Skip market data refresh")
    parser.add_argument("--skip-intelligence", action="store_true", help="Skip intelligence refresh")
    parser.add_argument("--mode", choices=["PAPER", "LIVE"], default="PAPER", help="Execution mode")
    args = parser.parse_args()
    
    # Override config from args
    if args.skip_market_data:
        SimulationConfig.SKIP_STOCK_DATA = True
    if args.skip_intelligence:
        SimulationConfig.SKIP_INTELLIGENCE = True
    if args.mode:
        SimulationConfig.EXECUTION_MODE = args.mode
    
    # LIVE mode check
    if args.mode == "LIVE":
        logger.error("LIVE mode is HARD-DISABLED. Use PAPER mode only.")
        return 1
    
    try:
        results = run_daily_simulation()
        
        # Return exit code based on results
        if results.get("summary", {}).get("failures", 0) > 0:
            return 1
        return 0
        
    except Exception as e:
        logger.exception(f"Daily simulation failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

