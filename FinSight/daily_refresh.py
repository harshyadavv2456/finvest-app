# -*- coding: utf-8 -*-
"""
DEPRECATED: Use daily_refresh_orchestrator.py instead.
This file is kept for reference only.

Original description:
FINVEST FULL-UNIVERSE DAILY UPDATE PIPELINE

Usage:
    python daily_refresh_orchestrator.py

EXECUTION ORDER:
1. Update Stock Data (All Tickers from tickers.txt)
2. Rebuild Screener Snapshot
3. Update InsiderFlow Data (SEC Form 4 + 13F)
4. Update Smart Money Flow (FII/DII)
5. Update StrataX Data
6. Run Pipeline Audit
7. Generate Full Daily Intelligence (14-Layer System)
8. Verify Full Universe Output

After running, push changes via GitHub Desktop to trigger Vercel/Render redeployment.
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from datetime import datetime

# Get the FinSight directory (where this script lives)
FINSIGHT_DIR = Path(__file__).parent.resolve()


def print_banner(text, char="="):
    """Print a visible banner"""
    width = 60
    print("")
    print(char * width)
    print("  " + text)
    print(char * width)
    print("")


def print_step(num, total, name):
    """Print step header"""
    print("")
    print("[{}/{}] {}".format(num, total, name))
    print("-" * 50)


def run_command(cmd, cwd=None, timeout=None, description=""):
    """Run a command and return success status"""
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
    print("> " + cmd_str)
    
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or FINSIGHT_DIR,
            shell=isinstance(cmd, str),
            capture_output=False,
            timeout=timeout
        )
        
        if result.returncode == 0:
            print("[OK] " + (description or "Completed"))
            return True
        else:
            print("[FAIL] Failed with code {}".format(result.returncode))
            return False
            
    except subprocess.TimeoutExpired:
        print("[FAIL] Timeout after {}s".format(timeout))
        return False
    except Exception as e:
        print("[FAIL] Error: {}".format(e))
        return False


def run_python_module(module, args=None, cwd=None, timeout=None, description=""):
    """Run a Python module"""
    cmd = [sys.executable, "-m", module]
    if args:
        cmd.extend(args)
    return run_command(cmd, cwd=cwd, timeout=timeout, description=description)


def run_python_script(script, args=None, cwd=None, timeout=None, description=""):
    """Run a Python script"""
    cmd = [sys.executable, str(script)]
    if args:
        cmd.extend(args)
    return run_command(cmd, cwd=cwd, timeout=timeout, description=description)


def check_file_exists(path, name):
    """Check if a file exists and report"""
    if path.exists():
        print("  [OK] Found: " + name)
        return True
    else:
        print("  [MISSING] " + name)
        return False


def main():
    """Main pipeline execution"""
    start_time = time.time()
    results = {}
    total_steps = 8
    
    # Header
    print("")
    print("=" * 64)
    print("         FINVEST FULL-UNIVERSE DAILY UPDATE PIPELINE")
    print("=" * 64)
    print("  Version: v2.3-authority")
    print("  Mode: FULL-UNIVERSE (NO FALLBACKS)")
    print("  Started: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 64)
    print("")

    # Check required files
    print_banner("PRE-FLIGHT CHECKS")
    
    required_files = [
        (FINSIGHT_DIR / "tickers.txt", "Tickers list"),
        (FINSIGHT_DIR / "update_all_data.py", "Stock data updater"),
        (FINSIGHT_DIR / "backend" / "app" / "screener_snapshot.py", "Screener builder"),
    ]
    
    all_found = True
    for path, name in required_files:
        if not check_file_exists(path, name):
            all_found = False
    
    if not all_found:
        print("")
        print("Some required files are missing. Continuing with available steps...")

    # =========================================================================
    # STEP 1: UPDATE STOCK DATA
    # =========================================================================
    print_step(1, total_steps, "UPDATE STOCK DATA (All Tickers)")
    
    update_script = FINSIGHT_DIR / "update_all_data.py"
    tickers_file = FINSIGHT_DIR / "tickers.txt"
    
    if update_script.exists() and tickers_file.exists():
        results["stock_data"] = run_python_script(
            update_script,
            args=["--tickers", str(tickers_file)],
            cwd=FINSIGHT_DIR,
            timeout=15000,
            description="Stock data update complete"
        )
    else:
        print("Stock data updater not found, skipping...")
        results["stock_data"] = None

    # =========================================================================
    # STEP 2: REBUILD SCREENER SNAPSHOT
    # =========================================================================
    print_step(2, total_steps, "REBUILD SCREENER SNAPSHOT")
    
    results["screener"] = run_python_module(
        "app.screener_snapshot",
        cwd=FINSIGHT_DIR / "backend",
        timeout=1800,
        description="Screener rebuilt"
    )

    # =========================================================================
    # STEP 3: UPDATE INSIDERFLOW DATA
    # =========================================================================
    print_step(3, total_steps, "UPDATE INSIDERFLOW DATA (SEC Form 4 + 13F)")
    
    insiderflow_script = FINSIGHT_DIR / "InsiderFlow" / "run_finsight_pipeline.py"
    
    if insiderflow_script.exists():
        results["insiderflow"] = run_python_script(
            insiderflow_script,
            args=["--incremental"],
            cwd=FINSIGHT_DIR / "InsiderFlow",
            timeout=3600,
            description="InsiderFlow update complete"
        )
    else:
        print("InsiderFlow script not found, skipping...")
        results["insiderflow"] = None

    # =========================================================================
    # STEP 4: UPDATE SMART MONEY FLOW (FII/DII)
    # =========================================================================
    print_step(4, total_steps, "UPDATE SMART MONEY FLOW (FII/DII)")
    
    fii_dii_script = FINSIGHT_DIR / "Smart Money Flow" / "fii_dii_pipeline.py"
    
    if fii_dii_script.exists():
        results["fii_dii"] = run_python_script(
            fii_dii_script,
            cwd=FINSIGHT_DIR / "Smart Money Flow",
            timeout=1800,
            description="Smart Money Flow update complete"
        )
    else:
        print("FII/DII pipeline not found, skipping...")
        results["fii_dii"] = None

    # =========================================================================
    # STEP 5: UPDATE STRATAX DATA
    # =========================================================================
    print_step(5, total_steps, "UPDATE STRATAX DATA")
    
    stratax_script = FINSIGHT_DIR / "backend" / "scripts" / "fetch_stratax_data.py"
    
    if stratax_script.exists():
        health_dir = FINSIGHT_DIR / "artifacts" / "health"
        health_dir.mkdir(parents=True, exist_ok=True)
        
        results["stratax"] = run_python_script(
            stratax_script,
            args=["--all", "--quiet", "--delay", "5"],
            cwd=FINSIGHT_DIR / "backend",
            timeout=1800,
            description="StrataX update complete"
        )
    else:
        print("StrataX script not found, skipping...")
        results["stratax"] = None

    # =========================================================================
    # STEP 6: UPDATE INDIAN ANNOUNCEMENTS (NSE Corporate + Insider)
    # =========================================================================
    print_step(6, total_steps, "UPDATE INDIAN ANNOUNCEMENTS (NSE Corporate + Insider)")
    
    indian_ann_script = FINSIGHT_DIR / "Indian_Announcements" / "run_collector_fixed.py"
    
    if indian_ann_script.exists():
        results["indian_announcements"] = run_python_script(
            indian_ann_script,
            cwd=FINSIGHT_DIR / "Indian_Announcements",
            timeout=1800,
            description="Indian announcements update complete"
        )
    else:
        print("Indian announcements script not found, skipping...")
        results["indian_announcements"] = None

    # =========================================================================
    # STEP 7: RUN PIPELINE AUDIT
    # =========================================================================
    print_step(7, total_steps, "RUN PIPELINE AUDIT")
    
    results["audit"] = run_python_module(
        "quant_system.pipeline_audit",
        cwd=FINSIGHT_DIR,
        timeout=900,
        description="Pipeline audit complete"
    )

    # =========================================================================
    # STEP 8: GENERATE FULL DAILY INTELLIGENCE (14-LAYER SYSTEM)
    # =========================================================================
    print_step(8, total_steps, "GENERATE FULL DAILY INTELLIGENCE (14-LAYER SYSTEM)")
    
    # Create required directories
    dirs_to_create = [
        "public/intelligence/US",
        "public/intelligence/IN",
        "public/portfolio",
        "artifacts/models/US",
        "artifacts/models/IN",
        "artifacts/efficacy/US",
        "artifacts/efficacy/IN",
        "artifacts/backtests/US",
        "artifacts/backtests/IN",
    ]
    
    for d in dirs_to_create:
        dir_path = FINSIGHT_DIR / d
        dir_path.mkdir(parents=True, exist_ok=True)
    
    print("  Created {} output directories".format(len(dirs_to_create)))
    
    results["intelligence"] = run_python_module(
        "quant_system.run_full_daily_intelligence",
        args=["--full-universe"],
        cwd=FINSIGHT_DIR,
        timeout=7200,
        description="Intelligence generation complete"
    )

    # =========================================================================
    # POST-RUN VERIFICATION
    # =========================================================================
    print_banner("POST-RUN UNIVERSE VERIFICATION")
    
    us_dir = FINSIGHT_DIR / "public" / "intelligence" / "US"
    in_dir = FINSIGHT_DIR / "public" / "intelligence" / "IN"
    
    us_count = len(list(us_dir.glob("*.json"))) if us_dir.exists() else 0
    in_count = len(list(in_dir.glob("*.json"))) if in_dir.exists() else 0
    
    print("  US stocks in output: {}".format(us_count))
    print("  IN stocks in output: {}".format(in_count))
    
    if us_count >= 30 and in_count >= 30:
        print("")
        print("[OK] Universe verification PASSED")
        results["verification"] = True
    else:
        print("")
        print("[WARN] Universe count is low (minimum: 30 each)")
        results["verification"] = False

    # =========================================================================
    # SUMMARY
    # =========================================================================
    total_time = time.time() - start_time
    
    print("")
    print("=" * 64)
    print("                    PIPELINE SUMMARY")
    print("=" * 64)
    
    step_names = {
        "stock_data": "Stock Data Update",
        "screener": "Screener Rebuild",
        "insiderflow": "InsiderFlow (SEC)",
        "fii_dii": "Smart Money (FII/DII)",
        "stratax": "StrataX Options",
        "indian_announcements": "Indian Announcements",
        "audit": "Pipeline Audit",
        "intelligence": "Intelligence (14-Layer)",
        "verification": "Universe Verification",
    }
    
    for key, name in step_names.items():
        status = results.get(key)
        if status is True:
            icon = "[OK] SUCCESS"
        elif status is False:
            icon = "[FAIL] FAILED"
        else:
            icon = "[SKIP] SKIPPED"
        print("  {} : {}".format(name.ljust(25), icon))
    
    print("-" * 64)
    print("  Total Time: {:.1f} minutes".format(total_time / 60))
    print("  US Stocks: {}".format(us_count))
    print("  IN Stocks: {}".format(in_count))
    print("=" * 64)
    print("")

    print("NEXT STEPS:")
    print("   1. Open GitHub Desktop")
    print("   2. Review changed files in FinVest repository")
    print("   3. Commit with message: 'Daily data refresh {}'".format(
        datetime.now().strftime("%Y-%m-%d")))
    print("   4. Push to origin/main")
    print("   5. Vercel and Render will auto-redeploy")
    print("")
    print("DEPLOYED URLS:")
    print("   - Frontend: https://finvest.vercel.app")
    print("   - API: https://finvest-api-gwkz.onrender.com")
    print("")

    # Return exit code
    critical_steps = ["screener", "intelligence"]
    failed_critical = any(results.get(s) is False for s in critical_steps)
    
    return 1 if failed_critical else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("")
        print("Pipeline interrupted by user")
        sys.exit(130)
    except Exception as e:
        print("")
        print("Pipeline failed with error: {}".format(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)
