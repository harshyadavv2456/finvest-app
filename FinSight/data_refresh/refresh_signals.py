#!/usr/bin/env python3
"""
Refresh Intelligence Signals

PHASE 43: Real Deployment & Paper Mode Go-Live

This module handles:
1. InsiderFlow pipeline (SEC Form 4 + 13F)
2. FII/DII flows (India)
3. Indian announcements (NSE)
4. 14-Layer Intelligence pipeline

RULES:
- Fail-loud (raise exceptions on critical errors)
- Explicit logging
- Deterministic ordering
"""

import sys
import os
import time
import subprocess
import logging
from pathlib import Path
from datetime import datetime

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


def run_script(script_path: Path, cwd: Path = None, timeout: int = 3600, args: list = None) -> dict:
    """
    Run a Python script and return result.
    
    Returns:
        dict with success, stdout, stderr, duration
    """
    if not script_path.exists():
        logger.warning(f"Script not found: {script_path}")
        return {"success": None, "skipped": True, "reason": "Script not found"}
    
    cmd = [sys.executable, str(script_path)]
    if args:
        cmd.extend(args)
    
    logger.info(f"Running: {' '.join(cmd)}")
    
    start_time = time.time()
    
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd or script_path.parent,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        duration = time.time() - start_time
        
        if proc.returncode == 0:
            logger.info(f"  Completed in {duration:.1f}s")
            return {
                "success": True,
                "duration_seconds": duration,
                "stdout": proc.stdout[-1000:] if proc.stdout else ""
            }
        else:
            logger.error(f"  Failed with code {proc.returncode}")
            if proc.stderr:
                logger.error(f"  stderr: {proc.stderr[-500:]}")
            return {
                "success": False,
                "duration_seconds": duration,
                "error": f"Exit code {proc.returncode}",
                "stderr": proc.stderr[-1000:] if proc.stderr else ""
            }
            
    except subprocess.TimeoutExpired:
        logger.error(f"  Timeout after {timeout}s")
        return {"success": False, "error": f"Timeout after {timeout}s"}
    except Exception as e:
        logger.exception(f"  Error: {e}")
        return {"success": False, "error": str(e)}


def refresh_insiderflow() -> dict:
    """Run InsiderFlow pipeline (SEC Form 4 + 13F)."""
    logger.info("-" * 50)
    logger.info("INSIDERFLOW PIPELINE")
    logger.info("-" * 50)
    
    script = FINSIGHT_DIR / "InsiderFlow" / "run_finsight_pipeline.py"
    return run_script(script, args=["--incremental"], timeout=3600)


def refresh_fii_dii() -> dict:
    """Run FII/DII pipeline (India smart money)."""
    logger.info("-" * 50)
    logger.info("FII/DII PIPELINE")
    logger.info("-" * 50)
    
    # Note: The actual file is fii_dii_pipeline.py, not fii_dii_collector.py
    script = FINSIGHT_DIR / "Smart Money Flow" / "fii_dii_pipeline.py"
    return run_script(script, timeout=1800)


def refresh_indian_announcements() -> dict:
    """Run Indian announcements collector (NSE Corporate + Insider)."""
    logger.info("-" * 50)
    logger.info("INDIAN ANNOUNCEMENTS")
    logger.info("-" * 50)
    
    script = FINSIGHT_DIR / "Indian_Announcements" / "run_collector_fixed.py"
    return run_script(script, timeout=1800)


def refresh_intelligence() -> dict:
    """Run full 14-layer intelligence pipeline."""
    logger.info("-" * 50)
    logger.info("14-LAYER INTELLIGENCE PIPELINE")
    logger.info("-" * 50)
    
    # Ensure output directories exist
    for subdir in ["US", "IN"]:
        dir_path = FINSIGHT_DIR / "public" / "intelligence" / subdir
        dir_path.mkdir(parents=True, exist_ok=True)
    
    cmd = [sys.executable, "-m", "quant_system.run_full_daily_intelligence", "--full-universe"]
    
    logger.info(f"Running: {' '.join(cmd)}")
    
    start_time = time.time()
    
    try:
        proc = subprocess.run(
            cmd,
            cwd=FINSIGHT_DIR,
            capture_output=True,
            text=True,
            timeout=7200  # 2 hours
        )
        
        duration = time.time() - start_time
        
        if proc.returncode == 0:
            logger.info(f"  Intelligence pipeline completed in {duration:.1f}s")
            
            # Verify output counts
            us_dir = FINSIGHT_DIR / "public" / "intelligence" / "US"
            in_dir = FINSIGHT_DIR / "public" / "intelligence" / "IN"
            
            us_count = len(list(us_dir.glob("*.json"))) if us_dir.exists() else 0
            in_count = len(list(in_dir.glob("*.json"))) if in_dir.exists() else 0
            
            logger.info(f"  US intelligence files: {us_count}")
            logger.info(f"  IN intelligence files: {in_count}")
            
            if us_count < 30 or in_count < 30:
                logger.warning("  Low intelligence count!")
                
            return {
                "success": True,
                "duration_seconds": duration,
                "us_count": us_count,
                "in_count": in_count
            }
        else:
            logger.error(f"  Failed with code {proc.returncode}")
            if proc.stderr:
                logger.error(f"  stderr: {proc.stderr[-500:]}")
            return {
                "success": False,
                "duration_seconds": duration,
                "error": f"Exit code {proc.returncode}"
            }
            
    except subprocess.TimeoutExpired:
        logger.error("  Timeout after 2 hours")
        return {"success": False, "error": "Timeout after 7200s"}
    except Exception as e:
        logger.exception(f"  Error: {e}")
        return {"success": False, "error": str(e)}


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Refresh intelligence signals")
    parser.add_argument("--skip-insider", action="store_true", help="Skip InsiderFlow")
    parser.add_argument("--skip-fii-dii", action="store_true", help="Skip FII/DII")
    parser.add_argument("--skip-announcements", action="store_true", help="Skip Indian announcements")
    parser.add_argument("--intelligence-only", action="store_true", help="Only run intelligence pipeline")
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("REFRESHING INTELLIGENCE SIGNALS")
    logger.info("=" * 60)
    
    results = {}
    
    if not args.intelligence_only:
        if not args.skip_insider:
            results["insiderflow"] = refresh_insiderflow()
        
        if not args.skip_fii_dii:
            results["fii_dii"] = refresh_fii_dii()
        
        if not args.skip_announcements:
            results["indian_announcements"] = refresh_indian_announcements()
    
    # Always run intelligence pipeline
    results["intelligence"] = refresh_intelligence()
    
    # Summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("SIGNALS REFRESH COMPLETE")
    logger.info("=" * 60)
    
    for key, val in results.items():
        if val.get("skipped"):
            status = "SKIPPED"
        elif val.get("success"):
            status = "OK"
        elif val.get("success") is False:
            status = "FAILED"
        else:
            status = "UNKNOWN"
        logger.info(f"  {key}: {status}")
    
    # Exit code - only fail on intelligence failure
    if results.get("intelligence", {}).get("success") is False:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

