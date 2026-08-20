#!/usr/bin/env python3
"""
FinVest Complete Daily Data Refresh (FINAL v2.3)
================================================

• EXACT same logs as running scripts individually
• NO buffering
• NO silent waits
• NO retries
• Heartbeat logs so you know it’s alive
• ONLY InsiderFlow has time limit
• FII/DII uses FIXED ABSOLUTE PATH
"""

import socket
import time
import sys
import subprocess
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════
# INTERNET CHECK (BLOCKING, NO RETRIES INSIDE PIPELINE)
# ═══════════════════════════════════════════════════════════════════════

def wait_for_internet():
    print("Checking internet connection...", flush=True)
    while True:
        try:
            socket.create_connection(("8.8.8.8", 53), timeout=5)
            print("✓ Internet connected", flush=True)
            return
        except OSError:
            print("No internet. Retrying in 10s...", flush=True)
            time.sleep(10)

wait_for_internet()

# ═══════════════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════════════

BASE = Path(__file__).resolve().parent
BACKEND = BASE / "backend"
DATA = BASE / "data"

INSIDER_DIR = BASE / "InsiderFlow"
ANN_DIR = BASE / "Indian_Announcements"

FII_DII_SCRIPT = Path(
    r"C:\Users\HARSH\OneDrive\Desktop\FinVest\FinSight\Smart Money Flow\fii_dii_pipeline.py"
)

STATE_DIR = BASE / "state"
STATE_DIR.mkdir(exist_ok=True)

INSIDER_STATE = STATE_DIR / "insider_last_run.json"
REFRESH_STATE = STATE_DIR / "refresh_last_run.json"

DEPLOYED_ANN = DATA / "announcements"

INSIDER_TIMEOUT = 90 * 60  # 90 minutes

# ═══════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def section(title):
    print("\n" + "=" * 90)
    log(title)
    print("=" * 90)

# ═══════════════════════════════════════════════════════════════════════
# SAFE PROCESS RUNNER (WINDOWS-PROOF)
# ═══════════════════════════════════════════════════════════════════════

def run_process(cmd, cwd=None, timeout=None, heartbeat=30):
    start = time.time()
    last_beat = start

    log(f"▶ RUNNING: {' '.join(map(str, cmd))}")

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=None,   # <-- CRITICAL: inherit console
        stderr=None,   # <-- EXACT SAME logs as manual run
        text=True
    )

    while True:
        time.sleep(1)

        # Heartbeat
        if time.time() - last_beat >= heartbeat:
            log("⏳ Still running...")
            last_beat = time.time()

        # Timeout (ONLY InsiderFlow)
        if timeout and (time.time() - start) >= timeout:
            log("⏱ InsiderFlow time limit reached — terminating")
            proc.terminate()
            return True

        # Exit
        if proc.poll() is not None:
            rc = proc.returncode
            mins = (time.time() - start) / 60
            if rc != 0:
                log(f"❌ Process exited with code {rc}")
                return False
            log(f"✅ Completed in {mins:.1f} min")
            return True

# ═══════════════════════════════════════════════════════════════════════
# PIPELINE STEPS
# ═══════════════════════════════════════════════════════════════════════

def step_market_data():
    section("STEP 1: MARKET DATA (FULL RUN)")
    return run_process(
        [sys.executable, "update_all_data.py"],
        BASE,
        heartbeat=20
    )

def step_screener():
    section("STEP 2: SCREENER SNAPSHOT")
    return run_process(
        [sys.executable, "-c",
         "from app.screener_snapshot import build_screener_snapshot;"
         "df=build_screener_snapshot();"
         "print(f'Screener rows: {len(df)}')"],
        BACKEND
    )

def step_insider():
    section("STEP 3: INSIDER FLOW (90 MIN CAP)")
    ok = run_process(
        [sys.executable, "run_finsight_pipeline.py", "--incremental"],
        INSIDER_DIR,
        timeout=INSIDER_TIMEOUT,
        heartbeat=60
    )
    INSIDER_STATE.write_text(json.dumps({
        "last_success_utc": datetime.now(timezone.utc).isoformat()
    }, indent=2))
    return ok

def step_fii_dii():
    section("STEP 4: FII / DII (FIXED PATH)")
    if not FII_DII_SCRIPT.exists():
        log("❌ FII/DII script not found — skipping")
        return False
    return run_process(
        [sys.executable, str(FII_DII_SCRIPT)],
        FII_DII_SCRIPT.parent
    )

def step_announcements():
    section("STEP 5: INDIAN ANNOUNCEMENTS")
    ok = run_process(
        [sys.executable, "run_collector_fixed.py"],
        ANN_DIR
    )
    if ok:
        DEPLOYED_ANN.mkdir(parents=True, exist_ok=True)
        for f in ["corporate_announcements.csv", "insider_filings.csv"]:
            src = ANN_DIR / f
            if src.exists():
                shutil.copy2(src, DEPLOYED_ANN / f)
                log(f"Copied {f}")
    return ok

def step_intelligence():
    section("STEP 6: INTELLIGENCE (FULL RUN)")
    return run_process(
        [sys.executable, "-m", "quant_system.run_full_daily_intelligence", "--full-universe"],
        BASE,
        heartbeat=60
    )

def step_timeline():
    section("STEP 7: TIMELINE SNAPSHOTS")
    return run_process([sys.executable, "build_timeline_snapshots.py"], BASE)

def step_positions():
    section("STEP 8: POSITION SYNC")
    return run_process([sys.executable, "sync_positions.py"], BASE)

# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    section("🚀 FINVEST DAILY REFRESH STARTED")
    start = time.time()

    results = {
        "market_data": step_market_data(),
        "screener": step_screener(),
        "insider": step_insider(),
        "fii_dii": step_fii_dii(),
        "announcements": step_announcements(),
        "intelligence": step_intelligence(),
        "timeline": step_timeline(),
        "positions": step_positions(),
    }

    mins = (time.time() - start) / 60

    section("✅ PIPELINE COMPLETE")
    for k, v in results.items():
        print(f"{'✅' if v else '❌'} {k}", flush=True)

    REFRESH_STATE.write_text(json.dumps({
        "last_run_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_minutes": round(mins, 2),
        "results": results
    }, indent=2))

    log(f"Total runtime: {mins:.1f} minutes")
    sys.exit(0 if results["market_data"] and results["screener"] else 1)

if __name__ == "__main__":
    main()
