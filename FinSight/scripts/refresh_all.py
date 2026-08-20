#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FinVest Master Data Refresh Script

This script refreshes ALL data sources in a single run:
1. Stock data (prices, fundamentals, technicals)
2. Screener snapshot
3. InsiderFlow (SEC Form 4 + 13F)
4. Smart Money Flow (FII/DII)
5. Intelligence pipeline (14-layer system)

Usage:
    python scripts/refresh_all.py [--skip-stock-data] [--skip-intelligence]

Exit codes:
    0 = Success (all critical datasets refreshed)
    1 = Critical failure (screener or intelligence failed)
    2 = Partial failure (non-critical datasets failed)
"""

import os
import sys
import time
import argparse
import subprocess
import json
from pathlib import Path
from datetime import datetime

# Setup paths
SCRIPT_DIR = Path(__file__).parent.resolve()
FINSIGHT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = FINSIGHT_DIR / "backend"
INSIDERFLOW_DIR = FINSIGHT_DIR / "InsiderFlow"
SMARTMONEY_DIR = FINSIGHT_DIR / "Smart Money Flow"
PUBLIC_DIR = FINSIGHT_DIR / "public"
DATA_DIR = FINSIGHT_DIR / "data"


def log(msg, level="INFO"):
    """Simple logging function."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def run_step(name, cmd, cwd, timeout=None, required=True):
    """Run a pipeline step and return success status."""
    log(f"Starting: {name}")
    start_time = time.time()
    
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            shell=isinstance(cmd, str),
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        elapsed = time.time() - start_time
        
        if result.returncode == 0:
            log(f"Completed: {name} ({elapsed:.1f}s)", "OK")
            return True
        else:
            log(f"Failed: {name} (exit code {result.returncode})", "ERROR")
            if result.stderr:
                for line in result.stderr.split('\n')[-5:]:
                    if line.strip():
                        log(f"  stderr: {line}", "ERROR")
            return False
            
    except subprocess.TimeoutExpired:
        log(f"Timeout: {name} (after {timeout}s)", "ERROR")
        return False
    except Exception as e:
        log(f"Exception in {name}: {e}", "ERROR")
        return False


def validate_json_files(directory, min_count=1):
    """Validate that JSON files exist and are readable."""
    if not directory.exists():
        return False, 0, "Directory does not exist"
    
    json_files = list(directory.glob("*.json"))
    count = len(json_files)
    
    if count < min_count:
        return False, count, f"Expected at least {min_count} files, found {count}"
    
    # Validate a sample file
    if json_files:
        try:
            with open(json_files[0], 'r') as f:
                json.load(f)
        except json.JSONDecodeError as e:
            return False, count, f"Invalid JSON: {e}"
    
    return True, count, "OK"


def main():
    parser = argparse.ArgumentParser(description="FinVest Master Data Refresh")
    parser.add_argument("--skip-stock-data", action="store_true", help="Skip stock data update")
    parser.add_argument("--skip-intelligence", action="store_true", help="Skip intelligence pipeline")
    parser.add_argument("--validate-only", action="store_true", help="Only validate existing data")
    args = parser.parse_args()
    
    log("=" * 60)
    log("FINVEST MASTER DATA REFRESH")
    log(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("=" * 60)
    
    results = {}
    start_time = time.time()
    
    if args.validate_only:
        log("Validation-only mode")
    else:
        # =====================================================================
        # STEP 1: Stock Data Update
        # =====================================================================
        if not args.skip_stock_data:
            update_script = FINSIGHT_DIR / "update_all_data.py"
            tickers_file = FINSIGHT_DIR / "tickers.txt"
            
            if update_script.exists() and tickers_file.exists():
                results["stock_data"] = run_step(
                    "Stock Data Update",
                    [sys.executable, str(update_script), "--tickers", str(tickers_file)],
                    cwd=FINSIGHT_DIR,
                    timeout=15000,  # 4+ hours
                    required=False
                )
            else:
                log("Stock data updater not found, skipping", "WARN")
                results["stock_data"] = None
        else:
            log("Skipping stock data update (--skip-stock-data)", "INFO")
            results["stock_data"] = None
        
        # =====================================================================
        # STEP 2: Screener Snapshot
        # =====================================================================
        results["screener"] = run_step(
            "Screener Snapshot",
            [sys.executable, "-m", "app.screener_snapshot"],
            cwd=BACKEND_DIR,
            timeout=1800,  # 30 min
            required=True
        )
        
        # =====================================================================
        # STEP 3: InsiderFlow Pipeline
        # =====================================================================
        insiderflow_script = INSIDERFLOW_DIR / "run_finsight_pipeline.py"
        
        if insiderflow_script.exists():
            results["insiderflow"] = run_step(
                "InsiderFlow Pipeline",
                [sys.executable, str(insiderflow_script), "--incremental"],
                cwd=INSIDERFLOW_DIR,
                timeout=3600,  # 60 min
                required=False
            )
        else:
            log("InsiderFlow script not found", "WARN")
            results["insiderflow"] = None
        
        # =====================================================================
        # STEP 4: Smart Money Flow (FII/DII)
        # =====================================================================
        fii_dii_script = SMARTMONEY_DIR / "fii_dii_pipeline.py"
        
        if fii_dii_script.exists():
            results["fii_dii"] = run_step(
                "FII/DII Pipeline",
                [sys.executable, str(fii_dii_script)],
                cwd=SMARTMONEY_DIR,
                timeout=1800,  # 30 min
                required=False
            )
        else:
            log("FII/DII script not found", "WARN")
            results["fii_dii"] = None
        
        # =====================================================================
        # STEP 5: Intelligence Pipeline
        # =====================================================================
        if not args.skip_intelligence:
            # Create output directories
            for subdir in ["US", "IN"]:
                (PUBLIC_DIR / "intelligence" / subdir).mkdir(parents=True, exist_ok=True)
            
            results["intelligence"] = run_step(
                "Intelligence Pipeline (14-Layer)",
                [sys.executable, "-m", "quant_system.run_full_daily_intelligence", "--full-universe"],
                cwd=FINSIGHT_DIR,
                timeout=7200,  # 2 hours
                required=True
            )
        else:
            log("Skipping intelligence pipeline (--skip-intelligence)", "INFO")
            results["intelligence"] = None
    
    # =========================================================================
    # VALIDATION
    # =========================================================================
    log("")
    log("=" * 60)
    log("VALIDATION")
    log("=" * 60)
    
    validations = {}
    
    # Validate screener
    screener_file = DATA_DIR / "screener.parquet"
    if screener_file.exists():
        try:
            import pandas as pd
            df = pd.read_parquet(screener_file)
            validations["screener"] = (True, len(df), f"{len(df)} rows")
        except Exception as e:
            validations["screener"] = (False, 0, str(e))
    else:
        validations["screener"] = (False, 0, "File not found")
    
    # Validate US intelligence
    us_intel_dir = PUBLIC_DIR / "intelligence" / "US"
    validations["intelligence_us"] = validate_json_files(us_intel_dir, min_count=30)
    
    # Validate IN intelligence
    in_intel_dir = PUBLIC_DIR / "intelligence" / "IN"
    validations["intelligence_in"] = validate_json_files(in_intel_dir, min_count=30)
    
    # Validate insider trades
    insider_file = INSIDERFLOW_DIR / "signals_output" / "insider_trades_with_flags.csv"
    if insider_file.exists():
        try:
            import pandas as pd
            df = pd.read_csv(insider_file)
            validations["insider_trades"] = (True, len(df), f"{len(df)} trades")
        except Exception as e:
            validations["insider_trades"] = (False, 0, str(e))
    else:
        validations["insider_trades"] = (False, 0, "File not found")
    
    # Print validation results
    for name, (valid, count, msg) in validations.items():
        status = "OK" if valid else "FAIL"
        log(f"  {name}: [{status}] {msg}")
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    total_time = time.time() - start_time
    
    log("")
    log("=" * 60)
    log("SUMMARY")
    log("=" * 60)
    
    for step, success in results.items():
        if success is True:
            log(f"  {step}: SUCCESS")
        elif success is False:
            log(f"  {step}: FAILED")
        else:
            log(f"  {step}: SKIPPED")
    
    log(f"\nTotal time: {total_time/60:.1f} minutes")
    log(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Determine exit code
    critical_failures = [
        results.get("screener") is False,
        results.get("intelligence") is False,
    ]
    
    if any(critical_failures):
        log("\nEXIT: Critical failure (screener or intelligence)", "ERROR")
        return 1
    
    non_critical_failures = [
        results.get("insiderflow") is False,
        results.get("fii_dii") is False,
    ]
    
    if any(non_critical_failures):
        log("\nEXIT: Partial success (non-critical failures)", "WARN")
        return 2
    
    log("\nEXIT: Success", "OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

