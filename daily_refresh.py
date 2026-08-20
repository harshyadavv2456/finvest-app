#!/usr/bin/env python3
"""
FinVest Complete Daily Data Refresh Script
==========================================
This script refreshes ALL data for the FinVest platform.
Expected runtime: 2-4 hours depending on network speed.

Usage:
    python daily_refresh.py              # Full refresh (all data)
    python daily_refresh.py --screener   # Screener only (quick, ~5 min)
    python daily_refresh.py --insider    # Insider/13F only (~15 min)
    python daily_refresh.py --stocks     # Stock data only (~2-3 hrs)
    python daily_refresh.py --no-push    # Don't push to GitHub

Requirements:
    pip install pandas numpy yfinance requests loguru pyarrow scipy pydantic pydantic-settings
"""

import os
import sys
import subprocess
import argparse
import time
from datetime import datetime
from pathlib import Path

# Get the script directory
SCRIPT_DIR = Path(__file__).resolve().parent
FINSIGHT_DIR = SCRIPT_DIR / "FinSight"
BACKEND_DIR = FINSIGHT_DIR / "backend"
DATA_DIR = FINSIGHT_DIR / "data"
INSIDER_FLOW_DIR = FINSIGHT_DIR / "InsiderFlow"
SMART_MONEY_DIR = FINSIGHT_DIR / "Smart Money Flow"
INDIAN_ANN_DIR = FINSIGHT_DIR / "Indian_Announcements"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log(msg, level="INFO"):
    """Logging with timestamp and colors"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    symbols = {
        "INFO": f"{Colors.CYAN}ℹ️ {Colors.ENDC}",
        "SUCCESS": f"{Colors.GREEN}✅{Colors.ENDC}",
        "WARNING": f"{Colors.WARNING}⚠️ {Colors.ENDC}",
        "ERROR": f"{Colors.FAIL}❌{Colors.ENDC}",
        "START": f"{Colors.BLUE}🚀{Colors.ENDC}",
        "STEP": f"{Colors.HEADER}📌{Colors.ENDC}",
    }
    print(f"[{timestamp}] {symbols.get(level, 'ℹ️ ')} {msg}")

def run_python_script(script_path, args=None, cwd=None, description=""):
    """Run a Python script with optional arguments"""
    log(f"Running: {description or script_path}", "STEP")
    
    if not Path(script_path).exists():
        log(f"Script not found: {script_path}", "WARNING")
        return False
    
    cmd = [sys.executable, str(script_path)]
    if args:
        cmd.extend(args)
    
    try:
        start_time = time.time()
        result = subprocess.run(
            cmd,
            cwd=str(cwd or SCRIPT_DIR),
            capture_output=False,  # Show output in real-time
            text=True
        )
        elapsed = time.time() - start_time
        
        if result.returncode == 0:
            log(f"Completed in {elapsed:.1f}s: {description}", "SUCCESS")
            return True
        else:
            log(f"Failed: {description}", "ERROR")
            return False
    except Exception as e:
        log(f"Exception running {description}: {e}", "ERROR")
        return False

def run_python_code(code, cwd=None, description=""):
    """Run Python code directly"""
    log(f"Executing: {description}", "STEP")
    
    try:
        start_time = time.time()
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=str(cwd or SCRIPT_DIR),
            capture_output=True,
            text=True
        )
        elapsed = time.time() - start_time
        
        if result.stdout:
            print(result.stdout)
        
        if result.returncode == 0:
            log(f"Completed in {elapsed:.1f}s: {description}", "SUCCESS")
            return True
        else:
            if result.stderr:
                print(result.stderr[:500])
            log(f"Failed: {description}", "ERROR")
            return False
    except Exception as e:
        log(f"Exception: {e}", "ERROR")
        return False

def install_dependencies():
    """Install required Python packages"""
    log("Checking and installing dependencies...", "START")
    packages = [
        "pandas", "numpy", "yfinance", "requests", "loguru", 
        "pyarrow", "scipy", "pydantic", "pydantic-settings"
    ]
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet"] + packages,
        capture_output=True
    )
    log("Dependencies ready", "SUCCESS")

def refresh_stock_data():
    """Refresh stock price data for all markets"""
    log("=" * 60)
    log("STEP 1: Refreshing Stock Data (ALL MARKETS)", "START")
    log("This downloads prices, fundamentals, technicals for 1400+ stocks")
    log("Expected time: 2-3 hours")
    log("=" * 60)
    
    # Use update_all_data.py which is the correct script
    update_script = FINSIGHT_DIR / "update_all_data.py"
    tickers_file = FINSIGHT_DIR / "tickers.txt"
    
    if update_script.exists():
        args = []
        if tickers_file.exists():
            args = ["--tickers", str(tickers_file)]
        return run_python_script(update_script, args, FINSIGHT_DIR, "Stock data update (all markets)")
    
    # Fallback to stock_crawler.py
    crawler_script = FINSIGHT_DIR / "stock_crawler.py"
    if crawler_script.exists():
        return run_python_script(crawler_script, ["--tickers", str(tickers_file)], FINSIGHT_DIR, "Stock crawler")
    
    log("No stock update script found", "WARNING")
    return False

def build_screener():
    """Build the screener snapshot from all ticker data"""
    log("=" * 60)
    log("STEP 2: Building Screener Snapshot", "START")
    log("Aggregating data for 1400+ stocks into screener.parquet")
    log("Expected time: 2-5 minutes")
    log("=" * 60)
    
    code = '''
import sys
import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
sys.path.insert(0, ".")
try:
    from app.screener_snapshot import build_screener_snapshot
    print("Building screener snapshot...")
    df = build_screener_snapshot()
    print(f"SUCCESS: Built screener with {len(df)} stocks")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
'''
    return run_python_code(code, BACKEND_DIR, "Screener snapshot build")

def refresh_insider_data():
    """Refresh SEC Form 4 and 13F data"""
    log("=" * 60)
    log("STEP 3: Refreshing InsiderFlow Data", "START")
    log("Downloading SEC Form 4 filings and 13F holdings")
    log("Expected time: 10-30 minutes")
    log("=" * 60)
    
    pipeline_script = INSIDER_FLOW_DIR / "run_finsight_pipeline.py"
    
    if pipeline_script.exists():
        return run_python_script(pipeline_script, ["--force"], INSIDER_FLOW_DIR, "InsiderFlow pipeline (Form 4 + 13F)")
    
    log("InsiderFlow script not found", "WARNING")
    return False

def refresh_fii_dii():
    """Refresh FII/DII flows for India"""
    log("=" * 60)
    log("STEP 4: Refreshing FII/DII Flows", "START")
    log("Downloading Indian institutional flows")
    log("Expected time: 2-5 minutes")
    log("=" * 60)
    
    collector_script = SMART_MONEY_DIR / "fii_dii_collector.py"
    
    if collector_script.exists():
        return run_python_script(collector_script, [], SMART_MONEY_DIR, "FII/DII collector")
    
    log("FII/DII collector not found", "WARNING")
    return False

def refresh_indian_announcements():
    """Refresh Indian corporate announcements"""
    log("=" * 60)
    log("STEP 5: Refreshing Indian Corporate Announcements", "START")
    log("Downloading NSE corporate announcements")
    log("Expected time: 2-5 minutes")
    log("=" * 60)
    
    collector_script = INDIAN_ANN_DIR / "run_collector_fixed.py"
    
    if collector_script.exists():
        return run_python_script(collector_script, [], INDIAN_ANN_DIR, "Indian announcements collector")
    
    log("Indian announcements collector not found", "WARNING")
    return False

def refresh_stratax():
    """Refresh StrataX sector rotation analysis"""
    log("=" * 60)
    log("STEP 6: Refreshing StrataX Analysis", "START")
    log("Running sector rotation analytics")
    log("Expected time: 5-10 minutes")
    log("=" * 60)
    
    code = '''
import sys
sys.path.insert(0, ".")
try:
    from app.stratax.routes import refresh_stratax_data
    print("Refreshing StrataX data...")
    refresh_stratax_data()
    print("SUCCESS: StrataX refresh complete")
except Exception as e:
    print(f"WARNING: StrataX refresh skipped - {e}")
'''
    return run_python_code(code, BACKEND_DIR, "StrataX sector rotation")

def run_intelligence_pipeline():
    """Run the full intelligence pipeline"""
    log("=" * 60)
    log("STEP 7: Running Intelligence Pipeline", "START")
    log("Computing 14-layer intelligence for all stocks")
    log("Expected time: 30-60 minutes")
    log("=" * 60)
    
    intel_script = FINSIGHT_DIR / "quant_system" / "run_full_daily_intelligence.py"
    
    if intel_script.exists():
        return run_python_script(
            intel_script, 
            ["--full-universe"], 
            FINSIGHT_DIR, 
            "Intelligence pipeline (14-layer analysis)"
        )
    
    log("Intelligence pipeline script not found", "WARNING")
    return False

def git_commit_and_push():
    """Commit all changes and push to GitHub"""
    log("=" * 60)
    log("FINAL: Committing and Pushing to GitHub", "START")
    log("=" * 60)
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    try:
        # Add all changes
        subprocess.run(["git", "add", "-A"], cwd=SCRIPT_DIR, check=True)
        
        # Check if there are changes
        result = subprocess.run(
            ["git", "diff", "--staged", "--quiet"],
            cwd=SCRIPT_DIR
        )
        
        if result.returncode == 0:
            log("No changes to commit", "INFO")
            return True
        
        # Commit
        commit_msg = f"🔄 Daily data refresh {timestamp}"
        subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=SCRIPT_DIR,
            check=True
        )
        log("Changes committed", "SUCCESS")
        
        # Push
        subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=SCRIPT_DIR,
            check=True
        )
        log("Pushed to GitHub", "SUCCESS")
        return True
        
    except subprocess.CalledProcessError as e:
        log(f"Git operation failed: {e}", "ERROR")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="FinVest Complete Daily Data Refresh",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python daily_refresh.py              # Full refresh (2-4 hours)
    python daily_refresh.py --screener   # Quick screener rebuild (~5 min)
    python daily_refresh.py --insider    # Insider/13F only (~15 min)
    python daily_refresh.py --stocks     # Stock data only (~2-3 hrs)
    python daily_refresh.py --no-push    # Don't push to GitHub
        """
    )
    parser.add_argument("--screener", action="store_true", help="Rebuild screener only (quick)")
    parser.add_argument("--insider", action="store_true", help="Refresh insider/13F data only")
    parser.add_argument("--stocks", action="store_true", help="Refresh stock data only")
    parser.add_argument("--intel", action="store_true", help="Run intelligence pipeline only")
    parser.add_argument("--no-push", action="store_true", help="Skip git push")
    parser.add_argument("--install-deps", action="store_true", help="Install dependencies first")
    args = parser.parse_args()
    
    start_time = time.time()
    
    print(f"\n{Colors.BOLD}{'=' * 60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}  FinVest Complete Daily Data Refresh{Colors.ENDC}")
    print(f"{Colors.BOLD}  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{Colors.ENDC}")
    print(f"{Colors.BOLD}{'=' * 60}{Colors.ENDC}\n")
    
    results = {}
    
    # Install dependencies if requested
    if args.install_deps:
        install_dependencies()
    
    # Determine which steps to run
    if args.screener:
        results["Screener"] = build_screener()
    elif args.insider:
        results["InsiderFlow"] = refresh_insider_data()
        results["FII/DII"] = refresh_fii_dii()
    elif args.stocks:
        results["Stock Data"] = refresh_stock_data()
        results["Screener"] = build_screener()
    elif args.intel:
        results["Intelligence"] = run_intelligence_pipeline()
    else:
        # Full refresh - all steps
        results["Stock Data"] = refresh_stock_data()
        results["Screener"] = build_screener()
        results["InsiderFlow"] = refresh_insider_data()
        results["FII/DII"] = refresh_fii_dii()
        results["Indian Announcements"] = refresh_indian_announcements()
        results["StrataX"] = refresh_stratax()
        results["Intelligence"] = run_intelligence_pipeline()
    
    # Git commit and push
    if not args.no_push:
        results["Git Push"] = git_commit_and_push()
    
    # Summary
    elapsed = time.time() - start_time
    elapsed_str = f"{int(elapsed // 3600)}h {int((elapsed % 3600) // 60)}m {int(elapsed % 60)}s"
    
    print(f"\n{Colors.BOLD}{'=' * 60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}  REFRESH SUMMARY{Colors.ENDC}")
    print(f"{Colors.BOLD}{'=' * 60}{Colors.ENDC}")
    
    success_count = 0
    for step, success in results.items():
        status = f"{Colors.GREEN}✅ SUCCESS{Colors.ENDC}" if success else f"{Colors.FAIL}❌ FAILED{Colors.ENDC}"
        print(f"  {step}: {status}")
        if success:
            success_count += 1
    
    print(f"\n  Total: {success_count}/{len(results)} steps successful")
    print(f"  Elapsed time: {elapsed_str}")
    print(f"  Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{Colors.BOLD}{'=' * 60}{Colors.ENDC}\n")
    
    return 0 if success_count == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
