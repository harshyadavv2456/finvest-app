#!/usr/bin/env python3
"""
FinSight Automation Runner
===========================
A unified script to run all data updates for FinSight.
This script is designed to work both locally and in GitHub Actions.

Usage:
    python scripts/automation_runner.py                    # Run all updates
    python scripts/automation_runner.py --screener-only    # Only screener data
    python scripts/automation_runner.py --stratax-only     # Only StrataX data
    python scripts/automation_runner.py --force            # Run even outside market hours
    python scripts/automation_runner.py --dry-run          # Check what would run

Features:
    - Automatic market hours detection (IST)
    - Graceful error handling (continues on partial failures)
    - Detailed logging
    - Exit codes for CI/CD integration
"""

import argparse
import logging
import sys
import os
from pathlib import Path
from datetime import datetime, time
from typing import Tuple, List
import subprocess

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("FinSightAutomation")


def get_ist_time() -> datetime:
    """Get current time in IST."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except ImportError:
        # Fallback for older Python
        import pytz
        return datetime.now(pytz.timezone("Asia/Kolkata"))


def is_market_open(force: bool = False) -> Tuple[bool, str]:
    """
    Check if Indian stock market is open.
    
    Returns:
        Tuple of (is_open: bool, reason: str)
    """
    if force:
        return True, "Forced run requested"
    
    now = get_ist_time()
    
    # Check if weekend
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False, f"Weekend ({now.strftime('%A')})"
    
    # Market hours: 9:15 AM - 3:30 PM IST
    market_open = time(9, 15)
    market_close = time(15, 30)
    current_time = now.time()
    
    # Extended window for data operations (9:00 AM - 4:00 PM)
    extended_open = time(9, 0)
    extended_close = time(16, 0)
    
    if extended_open <= current_time <= extended_close:
        return True, f"Market hours ({now.strftime('%H:%M IST')})"
    elif current_time < extended_open:
        return False, f"Before market ({now.strftime('%H:%M IST')})"
    else:
        return False, f"After market ({now.strftime('%H:%M IST')})"


def run_screener_update() -> bool:
    """Run the screener data update (stock prices, fundamentals, news)."""
    logger.info("=" * 60)
    logger.info("SCREENER DATA UPDATE")
    logger.info("=" * 60)
    
    try:
        # Import and run the update script
        os.chdir(PROJECT_ROOT)
        
        # Try to run update_all_data.py
        update_script = PROJECT_ROOT / "update_all_data.py"
        tickers_file = PROJECT_ROOT / "tickers.txt"
        
        if not update_script.exists():
            logger.error(f"Update script not found: {update_script}")
            return False
        
        if not tickers_file.exists():
            logger.warning(f"Tickers file not found: {tickers_file}")
            logger.info("Attempting to run with default tickers...")
        
        # Run the update
        from update_all_data import main as update_main
        
        # Temporarily modify sys.argv
        old_argv = sys.argv.copy()
        sys.argv = ["update_all_data.py", "--tickers", str(tickers_file)]
        
        try:
            update_main()
            logger.info("✅ Screener data update completed successfully")
            return True
        finally:
            sys.argv = old_argv
            
    except Exception as e:
        logger.error(f"❌ Screener update failed: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return False


def run_stratax_update() -> bool:
    """Run the StrataX option chain data fetch."""
    logger.info("=" * 60)
    logger.info("STRATAX OPTION CHAIN UPDATE")
    logger.info("=" * 60)
    
    success_count = 0
    underlyings = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]
    
    os.chdir(PROJECT_ROOT / "backend")
    
    for underlying in underlyings:
        try:
            logger.info(f"📊 Fetching {underlying} option chain...")
            
            # Import the fetch function
            from scripts.fetch_stratax_data import save_option_chain_data
            
            output_dir = PROJECT_ROOT / "backend" / "data" / "stratax_cache"
            result = save_option_chain_data(underlying, None, output_dir)
            
            if result:
                logger.info(f"✅ {underlying} fetch successful")
                success_count += 1
            else:
                logger.warning(f"⚠️ {underlying} fetch returned no data")
                
            # Rate limit delay
            import time as time_module
            time_module.sleep(3)
            
        except Exception as e:
            logger.warning(f"⚠️ {underlying} fetch failed: {e}")
            continue
    
    os.chdir(PROJECT_ROOT)
    
    logger.info(f"StrataX update: {success_count}/{len(underlyings)} successful")
    return success_count > 0


def rebuild_screener_snapshot() -> bool:
    """Rebuild the screener snapshot from data files."""
    logger.info("=" * 60)
    logger.info("SCREENER SNAPSHOT REBUILD")
    logger.info("=" * 60)
    
    try:
        os.chdir(PROJECT_ROOT / "backend")
        
        from app.screener_snapshot import build_screener_snapshot
        from app.config import settings
        
        logger.info(f"Data directory: {settings.DATA_DIR}")
        df = build_screener_snapshot()
        
        logger.info(f"✅ Screener snapshot rebuilt with {len(df)} tickers")
        logger.info(f"   Location: {settings.SCREENER_SNAPSHOT_PATH}")
        
        os.chdir(PROJECT_ROOT)
        return True
        
    except Exception as e:
        logger.error(f"❌ Screener snapshot rebuild failed: {e}")
        os.chdir(PROJECT_ROOT)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="FinSight Automation Runner - Unified data update script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/automation_runner.py                  # Run all updates
  python scripts/automation_runner.py --screener-only  # Only screener
  python scripts/automation_runner.py --stratax-only   # Only StrataX
  python scripts/automation_runner.py --force          # Ignore market hours
  python scripts/automation_runner.py --dry-run        # Preview only
        """
    )
    
    parser.add_argument(
        "--screener-only",
        action="store_true",
        help="Only update screener data"
    )
    parser.add_argument(
        "--stratax-only",
        action="store_true",
        help="Only update StrataX option chain data"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run even outside market hours"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check what would run without executing"
    )
    parser.add_argument(
        "--skip-snapshot",
        action="store_true",
        help="Skip screener snapshot rebuild"
    )
    
    args = parser.parse_args()
    
    # Print banner
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 15 + "FINSIGHT AUTOMATION RUNNER" + " " * 17 + "║")
    print("╚" + "═" * 58 + "╝")
    print()
    
    # Get current time
    now = get_ist_time()
    logger.info(f"Current time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    logger.info(f"Day: {now.strftime('%A')}")
    
    # Check market hours
    is_open, reason = is_market_open(args.force)
    logger.info(f"Market status: {reason}")
    
    if not is_open:
        logger.warning("Market is closed. Use --force to run anyway.")
        if not args.dry_run:
            logger.info("Exiting without updates.")
            sys.exit(0)
    
    # Determine what to run
    run_screener = not args.stratax_only
    run_stratax = not args.screener_only
    run_snapshot = not args.skip_snapshot
    
    logger.info("")
    logger.info("Tasks to run:")
    logger.info(f"  • Screener data update: {'Yes' if run_screener else 'No'}")
    logger.info(f"  • StrataX option chain: {'Yes' if run_stratax else 'No'}")
    logger.info(f"  • Screener snapshot:    {'Yes' if run_snapshot else 'No'}")
    logger.info("")
    
    if args.dry_run:
        logger.info("DRY RUN - No changes will be made")
        sys.exit(0)
    
    # Execute updates
    results: List[Tuple[str, bool]] = []
    
    if run_screener:
        success = run_screener_update()
        results.append(("Screener Update", success))
    
    if run_stratax:
        success = run_stratax_update()
        results.append(("StrataX Update", success))
    
    if run_snapshot:
        success = rebuild_screener_snapshot()
        results.append(("Snapshot Rebuild", success))
    
    # Print summary
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 22 + "SUMMARY" + " " * 29 + "║")
    print("╠" + "═" * 58 + "╣")
    
    all_success = True
    for task, success in results:
        status = "✅ Success" if success else "❌ Failed"
        all_success = all_success and success
        padding = 58 - len(task) - len(status) - 4
        print(f"║ {task}:{' ' * padding}{status} ║")
    
    print("╚" + "═" * 58 + "╝")
    print()
    
    if all_success:
        logger.info("🎉 All updates completed successfully!")
        logger.info("")
        logger.info("Next steps:")
        logger.info("  1. Review the changes")
        logger.info("  2. Commit and push to GitHub")
        logger.info("  3. Render & Vercel will auto-deploy")
    else:
        logger.warning("⚠️ Some updates failed. Check logs above.")
    
    sys.exit(0 if all_success else 1)


if __name__ == "__main__":
    main()

