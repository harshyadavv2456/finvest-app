#!/usr/bin/env python3
"""
FinVest Complete Daily Data Refresh (ROOT WRAPPER v2.1)
=======================================================

Root-level convenience wrapper.
Calls FinSight/daily_refresh_final.py

Features:
- NO time limits on stock data, screener, announcements, intelligence
- ONLY InsiderFlow has 90-minute cap (it's the slow one)
- InsiderFlow runs in incremental mode after first run
- Internet connectivity check before starting

Usage:
    python daily_refresh2.py                    # Full refresh
    python daily_refresh2.py --no-insider       # Skip InsiderFlow
    python daily_refresh2.py --quick            # Only intelligence + timeline
    python daily_refresh2.py --data-only        # Only market data
"""

import socket
import time
import sys

# ═══════════════════════════════════════════════════════════════════════════════
# INTERNET CONNECTIVITY CHECK
# ═══════════════════════════════════════════════════════════════════════════════

def wait_for_internet(max_retries=10, retry_delay=10):
    """Wait until internet connection is established."""
    hosts = [
        ("8.8.8.8", 53),
        ("1.1.1.1", 53),
        ("208.67.222.222", 53),
    ]
    
    print("Checking internet connection...")
    
    for attempt in range(max_retries):
        for host, port in hosts:
            try:
                socket.create_connection((host, port), timeout=5)
                print("✓ Internet connected! Starting refresh pipeline...")
                return True
            except OSError:
                continue
        
        if attempt < max_retries - 1:
            print(f"No internet detected. Retrying in {retry_delay}s... ({attempt + 1}/{max_retries})")
            time.sleep(retry_delay)
    
    print("✗ Failed to establish internet connection.")
    return False

if not wait_for_internet():
    print("Exiting due to no internet connection.")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════════
# IMPORTS
# ═══════════════════════════════════════════════════════════════════════════════

import subprocess
import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).resolve().parent
FINSIGHT_DIR = SCRIPT_DIR / "FinSight"
BACKEND_DIR = FINSIGHT_DIR / "backend"
INSIDER_FLOW_DIR = FINSIGHT_DIR / "InsiderFlow"
SMART_MONEY_DIR = FINSIGHT_DIR / "Smart Money Flow"
INDIAN_ANN_DIR = FINSIGHT_DIR / "Indian_Announcements"
QUANT_DIR = FINSIGHT_DIR / "quant_system"
DATA_DIR = FINSIGHT_DIR / "data"
PUBLIC_DIR = FINSIGHT_DIR / "public"

# State tracking
STATE_DIR = FINSIGHT_DIR / "state"
INSIDER_STATE_FILE = STATE_DIR / "insider_last_run.json"
REFRESH_STATE_FILE = STATE_DIR / "refresh_last_run.json"

# ONLY InsiderFlow has a time limit
INSIDER_MAX_RUNTIME = 90 * 60  # 1.5 hours = 90 minutes

# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

def log(msg, level="INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    icons = {
        "INFO": "ℹ️ ",
        "SUCCESS": "✅",
        "WARNING": "⚠️ ",
        "ERROR": "❌",
        "START": "🚀",
        "STEP": "📌",
        "DATA": "📊",
    }
    print(f"[{ts}] {icons.get(level, '')} {msg}")

def log_section(title):
    print("\n" + "═" * 70)
    log(title, "START")
    print("═" * 70)

# ═══════════════════════════════════════════════════════════════════════════════
# STATE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

def load_state(state_file):
    if state_file.exists():
        try:
            return json.loads(state_file.read_text())
        except:
            return {}
    return {}

def save_state(state_file, data):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(data, indent=2))

def should_run_incremental(state_file, max_age_hours=24):
    state = load_state(state_file)
    last_run = state.get("last_success_utc")
    if not last_run:
        return False, None
    try:
        last_dt = datetime.fromisoformat(last_run.replace('Z', '+00:00'))
        hours_since = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
        return hours_since < max_age_hours * 2, last_dt
    except:
        return False, None

# ═══════════════════════════════════════════════════════════════════════════════
# EXECUTION HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def run_python(script, args=None, cwd=None, timeout=None, desc="", code=None):
    log(desc, "STEP")
    
    if code:
        cmd = [sys.executable, "-c", code]
    else:
        script = Path(script)
        if not script.exists():
            log(f"Script not found: {script}", "WARNING")
            return False
        cmd = [sys.executable, str(script)]
        if args:
            cmd.extend(args)
    
    try:
        start = time.time()
        subprocess.run(cmd, cwd=str(cwd or SCRIPT_DIR), check=True, timeout=timeout)
        log(f"Completed in {(time.time() - start)/60:.1f} min", "SUCCESS")
        return True
    except subprocess.TimeoutExpired:
        log(f"Time cap hit after {(time.time() - start)/60:.1f} min — continuing", "WARNING")
        return True
    except subprocess.CalledProcessError as e:
        log(f"Failed: exit code {e.returncode}", "ERROR")
        return False
    except Exception as e:
        log(f"Error: {e}", "ERROR")
        return False

# ═══════════════════════════════════════════════════════════════════════════════
# PIPELINE STEPS (NO TIMEOUT except InsiderFlow)
# ═══════════════════════════════════════════════════════════════════════════════

def step_market_data():
    log_section("STEP 1: Market Data (NO LIMIT)")
    script = FINSIGHT_DIR / "update_all_data.py"
    tickers = FINSIGHT_DIR / "tickers.txt"
    args = ["--tickers", str(tickers)] if tickers.exists() else []
    return run_python(script, args, FINSIGHT_DIR, timeout=None, desc="Updating stock prices...")

def step_screener():
    log_section("STEP 2: Screener (NO LIMIT)")
    code = """
import sys; sys.path.insert(0, ".")
from app.screener_snapshot import build_screener_snapshot
df = build_screener_snapshot()
print(f"Screener: {len(df)} stocks")
"""
    return run_python(None, None, BACKEND_DIR, timeout=None, desc="Building screener...", code=code)

def step_insider_flow():
    log_section("STEP 3: InsiderFlow (90-MIN CAP, INCREMENTAL)")
    
    pipeline = INSIDER_FLOW_DIR / "run_finsight_pipeline.py"
    if not pipeline.exists():
        log("InsiderFlow not found — skipping", "WARNING")
        return True
    
    is_incremental, last_run = should_run_incremental(INSIDER_STATE_FILE, 24)
    
    if is_incremental:
        log(f"Incremental mode (last: {last_run})", "INFO")
        args = ["--incremental", "--max-age-hours", "24"]
    else:
        log("Full refresh mode", "INFO")
        args = ["--force"]
    
    success = run_python(pipeline, args, INSIDER_FLOW_DIR, timeout=INSIDER_MAX_RUNTIME, desc="Running InsiderFlow...")
    
    save_state(INSIDER_STATE_FILE, {
        "last_success_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "incremental" if is_incremental else "full"
    })
    return success

def step_fii_dii():
    log_section("STEP 4: FII/DII (NO LIMIT)")
    script = SMART_MONEY_DIR / "fii_dii_pipeline.py"
    if not script.exists():
        script = SMART_MONEY_DIR / "fii_dii_collector.py"
    if not script.exists():
        log("FII/DII not found — skipping", "WARNING")
        return True
    return run_python(script, None, SMART_MONEY_DIR, timeout=None, desc="Fetching FII/DII...")

def step_indian_announcements():
    log_section("STEP 5: Indian Announcements (NO LIMIT)")
    script = INDIAN_ANN_DIR / "run_collector_fixed.py"
    if not script.exists():
        log("Indian announcements not found — skipping", "WARNING")
        return True
    
    success = run_python(script, None, INDIAN_ANN_DIR, timeout=None, desc="Fetching NSE...")
    
    if success:
        dest_dir = DATA_DIR / "announcements"
        dest_dir.mkdir(parents=True, exist_ok=True)
        copied = set()
        for src_name in ["corporate_announcements.csv", "insider_filings.csv"]:
            for src_dir in [INDIAN_ANN_DIR / "indian_market_filings", INDIAN_ANN_DIR]:
                src = src_dir / src_name
                if src.exists() and src_name not in copied:
                    shutil.copy2(src, dest_dir / src_name)
                    log(f"Copied {src_name}", "DATA")
                    copied.add(src_name)
                    break
    return success

def step_intelligence():
    log_section("STEP 6: Intelligence Pipeline (NO LIMIT)")
    script = QUANT_DIR / "run_full_daily_intelligence.py"
    if not script.exists():
        log("Intelligence pipeline not found — skipping", "WARNING")
        return True
    return run_python(script, ["--full-universe"], FINSIGHT_DIR, timeout=None, desc="Running intelligence...")

def step_timeline():
    log_section("STEP 7: Timeline Snapshots (NO LIMIT)")
    code = """
import json
from pathlib import Path
from datetime import datetime

INTEL_DIR = Path("public/intelligence")
TIMELINE_DIR = Path("public/timeline")
today = datetime.now().strftime("%Y-%m-%d")

for market in ["US", "IN"]:
    intel = INTEL_DIR / market
    tl = TIMELINE_DIR / market
    tl.mkdir(parents=True, exist_ok=True)
    if not intel.exists(): continue
    
    recs = []
    counts = {"INITIATE": 0, "HOLD": 0, "AVOID": 0}
    for f in intel.glob("*.json"):
        try:
            d = json.loads(f.read_text())
            intent = d.get("intent", "HOLD")
            counts[intent] = counts.get(intent, 0) + 1
            recs.append({
                "ticker": d.get("ticker"),
                "intent": intent,
                "conviction": d.get("conviction"),
                "conviction_pct": d.get("conviction_pct"),
                "expected_return": d.get("return_p50"),
                "rationale": d.get("rationale", "")[:300]
            })
        except: pass
    
    recs.sort(key=lambda x: x.get("conviction") or 0, reverse=True)
    snapshot = {
        "date": today, "market": market,
        "generated_at": datetime.now().isoformat(),
        "total_stocks": len(recs), "intent_counts": counts,
        "recommendations": recs
    }
    (tl / f"{today}.json").write_text(json.dumps(snapshot, indent=2))
    print(f"Saved {market}: {len(recs)} stocks")
"""
    return run_python(None, None, FINSIGHT_DIR, timeout=None, desc="Saving timeline...", code=code)

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser("FinVest Daily Refresh v2.1")
    parser.add_argument("--no-insider", action="store_true", help="Skip InsiderFlow")
    parser.add_argument("--quick", action="store_true", help="Only intelligence + timeline")
    parser.add_argument("--data-only", action="store_true", help="Only market data + screener")
    args = parser.parse_args()
    
    print("\n" + "═" * 70)
    print("  FinVest Daily Refresh v2.1")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("")
    print("  Time Limits:")
    print("    • InsiderFlow: 90 minutes (incremental)")
    print("    • All other steps: NO LIMIT")
    print("═" * 70)
    
    start = time.time()
    results = {}
    
    if args.data_only:
        results["market_data"] = step_market_data()
        results["screener"] = step_screener()
    elif args.quick:
        results["intelligence"] = step_intelligence()
        results["timeline"] = step_timeline()
    else:
        results["market_data"] = step_market_data()
        results["screener"] = step_screener()
        if not args.no_insider:
            results["insider_flow"] = step_insider_flow()
        results["fii_dii"] = step_fii_dii()
        results["indian_announcements"] = step_indian_announcements()
        results["intelligence"] = step_intelligence()
        results["timeline"] = step_timeline()
    
    elapsed = (time.time() - start) / 60
    
    print("\n" + "═" * 70)
    log("PIPELINE COMPLETE", "SUCCESS")
    print("═" * 70)
    print("\nResults:")
    for step, ok in results.items():
        print(f"  {'✅' if ok else '❌'} {step}")
    print(f"\nTotal: {elapsed:.1f} min")
    
    # Save state
    save_state(REFRESH_STATE_FILE, {
        "last_run_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_minutes": round(elapsed, 2),
        "results": {k: v for k, v in results.items()}
    })
    
    sys.exit(0 if all(results.values()) else 1)

if __name__ == "__main__":
    main()
