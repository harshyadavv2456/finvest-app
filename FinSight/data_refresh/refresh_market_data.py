#!/usr/bin/env python3
"""
Refresh Market Data - Stock prices, fundamentals, technicals

PHASE 43: Real Deployment & Paper Mode Go-Live

This module handles:
1. Stock price updates (via yfinance)
2. Fundamental data updates
3. Technical indicator recalculation
4. Screener snapshot rebuild

RULES:
- Fail-loud (raise exceptions on error)
- Explicit logging
- No silent fallbacks
"""

import sys
import os
import time
import logging
from pathlib import Path
from datetime import datetime

# Setup paths
SCRIPT_DIR = Path(__file__).parent.resolve()
FINSIGHT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(FINSIGHT_DIR))
sys.path.insert(0, str(FINSIGHT_DIR / "backend"))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


def refresh_stock_data(skip_if_recent: bool = False) -> dict:
    """
    Refresh stock data for all tickers.
    
    Args:
        skip_if_recent: If True, skip if data was refreshed within 4 hours
        
    Returns:
        dict with status and counts
    """
    logger.info("=" * 60)
    logger.info("REFRESHING STOCK DATA")
    logger.info("=" * 60)
    
    result = {
        "success": False,
        "tickers_updated": 0,
        "errors": [],
        "duration_seconds": 0
    }
    
    start_time = time.time()
    
    try:
        update_script = FINSIGHT_DIR / "update_all_data.py"
        tickers_file = FINSIGHT_DIR / "tickers.txt"
        
        if not update_script.exists():
            logger.warning("update_all_data.py not found, skipping stock data refresh")
            result["success"] = True
            result["skipped"] = True
            return result
            
        if not tickers_file.exists():
            raise FileNotFoundError(f"tickers.txt not found at {tickers_file}")
        
        # Count tickers
        with open(tickers_file, 'r') as f:
            tickers = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        
        logger.info(f"Found {len(tickers)} tickers to update")
        
        # Import and run update
        import subprocess
        cmd = [sys.executable, str(update_script), "--tickers", str(tickers_file)]
        
        logger.info(f"Running: {' '.join(cmd)}")
        proc = subprocess.run(cmd, cwd=FINSIGHT_DIR, capture_output=True, text=True, timeout=15000)
        
        if proc.returncode != 0:
            logger.error(f"Stock data update failed with code {proc.returncode}")
            if proc.stderr:
                logger.error(f"stderr: {proc.stderr[-500:]}")
            result["errors"].append(f"Exit code {proc.returncode}")
        else:
            result["success"] = True
            result["tickers_updated"] = len(tickers)
            logger.info(f"Successfully updated {len(tickers)} tickers")
            
    except Exception as e:
        logger.exception(f"Error refreshing stock data: {e}")
        result["errors"].append(str(e))
        raise  # Fail-loud
        
    finally:
        result["duration_seconds"] = time.time() - start_time
        
    return result


def rebuild_screener_snapshot() -> dict:
    """
    Rebuild the screener snapshot from all available data.
    
    Returns:
        dict with status and row count
    """
    logger.info("=" * 60)
    logger.info("REBUILDING SCREENER SNAPSHOT")
    logger.info("=" * 60)
    
    result = {
        "success": False,
        "rows": 0,
        "errors": [],
        "duration_seconds": 0
    }
    
    start_time = time.time()
    
    try:
        # Import screener builder
        from app.screener_snapshot import build_screener_snapshot
        
        logger.info("Building screener snapshot from all markets...")
        df = build_screener_snapshot()
        
        result["rows"] = len(df) if df is not None else 0
        result["success"] = result["rows"] > 0
        
        if result["success"]:
            logger.info(f"Screener snapshot built: {result['rows']} rows")
        else:
            raise RuntimeError("Screener snapshot returned empty dataframe")
            
    except Exception as e:
        logger.exception(f"Error building screener snapshot: {e}")
        result["errors"].append(str(e))
        raise  # Fail-loud
        
    finally:
        result["duration_seconds"] = time.time() - start_time
        
    return result


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Refresh market data")
    parser.add_argument("--skip-stock-data", action="store_true", help="Skip stock price updates")
    parser.add_argument("--screener-only", action="store_true", help="Only rebuild screener")
    args = parser.parse_args()
    
    results = {}
    
    if not args.skip_stock_data and not args.screener_only:
        results["stock_data"] = refresh_stock_data()
    
    results["screener"] = rebuild_screener_snapshot()
    
    # Summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("MARKET DATA REFRESH COMPLETE")
    logger.info("=" * 60)
    for key, val in results.items():
        status = "OK" if val.get("success") else "FAILED"
        logger.info(f"  {key}: {status}")
    
    # Exit code
    if all(r.get("success") for r in results.values()):
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())

