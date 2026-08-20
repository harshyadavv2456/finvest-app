#!/usr/bin/env python3
"""
Master update script - Updates all ticker data and rebuilds screener.
Run this script to update all data and prepare for deployment.

Usage:
    python update_all_data.py
    python update_all_data.py --tickers tickers.txt
    python update_all_data.py --tick AAPL
"""
import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("MasterUpdate")

def main():
    parser = argparse.ArgumentParser(description="Update all ticker data and rebuild screener")
    parser.add_argument("--tick", type=str, default=None, help="Single ticker to update")
    parser.add_argument("--tickers", type=str, default="tickers.txt", help="Path to tickers file")
    args = parser.parse_args()
    
    logger.info("=" * 70)
    logger.info("FinSight Master Data Update Script")
    logger.info("=" * 70)
    logger.info("This script will:")
    logger.info("  1. Update all ticker data (prices, fundamentals, news)")
    logger.info("  2. Rebuild screener snapshot automatically")
    logger.info("=" * 70)
    
    # Step 1: Run stock crawler
    logger.info("\n[STEP 1] Running stock crawler to update ticker data...")
    logger.info("-" * 70)
    try:
        from stock_crawler import main as crawler_main
        
        # Temporarily replace sys.argv to pass arguments to crawler
        old_argv = sys.argv.copy()  # Make a copy to restore later
        sys.argv = ["stock_crawler.py"]
        if args.tick:
            sys.argv.extend(["--tick", args.tick])
        else:
            sys.argv.extend(["--tickers", args.tickers])
        # Don't pass --no-screener, so screener will rebuild automatically
        
        try:
            crawler_main()
            logger.info("\n[STEP 1] ✓ Stock crawler completed successfully")
        finally:
            # Always restore sys.argv, even if crawler_main() raises an exception
            sys.argv = old_argv
            
    except Exception as e:
        logger.error(f"\n[STEP 1] ✗ Stock crawler failed: {e}", exc_info=True)
        logger.error("Please check the error above and fix issues before continuing")
        sys.exit(1)
    
    # Step 2: Always rebuild screener snapshot to ensure it's up to date
    logger.info("\n[STEP 2] Rebuilding screener snapshot...")
    logger.info("-" * 70)
    try:
        # Ensure we're using the correct data directory
        repo_root = Path(__file__).parent.resolve()
        data_dir = repo_root / "data"
        
        # Add backend to path if not already there
        backend_path = repo_root / "backend"
        if str(backend_path) not in sys.path:
            sys.path.insert(0, str(backend_path))
        
        # Force reload config to pick up correct data directory
        if 'backend.app.config' in sys.modules:
            del sys.modules['backend.app.config']
        if 'app.config' in sys.modules:
            del sys.modules['app.config']
        
        # Import and rebuild
        from app.screener_snapshot import build_screener_snapshot
        from app.config import settings
        
        logger.info(f"Data directory: {settings.DATA_DIR} (exists: {settings.DATA_DIR.exists()})")
        
        df = build_screener_snapshot()
        logger.info(f"✓ Screener snapshot rebuilt with {len(df)} tickers")
        logger.info(f"  Location: {settings.SCREENER_SNAPSHOT_PATH}")
        
        if len(df) == 0:
            logger.warning("⚠ WARNING: Screener snapshot has 0 tickers!")
            logger.warning(f"  Data directory: {settings.DATA_DIR}")
            logger.warning(f"  Data directory exists: {settings.DATA_DIR.exists()}")
            if settings.DATA_DIR.exists():
                markets = [d.name for d in settings.DATA_DIR.iterdir() if d.is_dir()]
                logger.warning(f"  Markets found: {markets}")
    except Exception as e:
        logger.error(f"✗ Screener rebuild failed: {e}", exc_info=True)
        import traceback
        logger.error(traceback.format_exc())
        logger.warning("You may need to manually rebuild: cd backend && python -m app.screener_snapshot")
    
    # Summary
    logger.info("\n" + "=" * 70)
    logger.info("UPDATE COMPLETE!")
    logger.info("=" * 70)
    logger.info("Next steps:")
    logger.info("  1. Review the data updates above")
    logger.info("  2. Open GitHub Desktop")
    logger.info("  3. Click 'Fetch origin' to pull any remote changes")
    logger.info("  4. Review changes in GitHub Desktop")
    logger.info("  5. Commit and push your changes")
    logger.info("  6. Render and Vercel will auto-deploy")
    logger.info("=" * 70)

if __name__ == "__main__":
    main()

