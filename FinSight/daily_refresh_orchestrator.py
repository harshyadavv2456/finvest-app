#!/usr/bin/env python3
"""
FinVest Daily Refresh Orchestrator v3.0
=======================================

STATE-AWARE pipeline that tracks per-module status, dependencies,
and failure history. Replaces daily_refresh_final.py.

Architecture:
  - Each module has declared dependencies
  - Modules with failed dependencies are SKIPPED (not crashed)
  - All state is written to state/refresh_registry.json
  - Intelligence snapshots are archived to public/intelligence/history/{date}/
  - Designed to run locally, on VPS, and in GitHub Actions

Modules (in order):
  Phase 1 (data collection, no deps):
    market_data, insider_flow, fii_dii, stratax, announcements, finax

  Phase 2 (processing, depends on data):
    screener, intelligence

  Phase 3 (post-processing, depends on intelligence):
    intelligence_archive, timeline, positions, pipeline_audit
"""

import socket
import time
import sys
import subprocess
import json
import shutil
from datetime import datetime, timezone, date
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════════════

BASE = Path(__file__).resolve().parent
BACKEND = BASE / "backend"
DATA = BASE / "data"

INSIDER_DIR = BASE / "InsiderFlow"
ANN_DIR = BASE / "Indian_Announcements"
SMART_MONEY_DIR = BASE / "Smart Money Flow"
FINAX_DIR = BASE.parent / "apps" / "FinAx"
MNEMOS_DIR = BASE.parent / "apps" / "Mnemos"

STATE_DIR = BASE / "state"
STATE_DIR.mkdir(exist_ok=True)

REGISTRY_FILE = STATE_DIR / "refresh_registry.json"
LEGACY_STATE_FILE = STATE_DIR / "refresh_last_run.json"
INSIDER_STATE = STATE_DIR / "insider_last_run.json"

DEPLOYED_ANN = DATA / "announcements"
INTELLIGENCE_DIR = BASE / "public" / "intelligence"
INTELLIGENCE_HISTORY = INTELLIGENCE_DIR / "history"

INSIDER_TIMEOUT = 90 * 60  # 90 minutes

# ═══════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def section(title):
    print("\n" + "=" * 90, flush=True)
    log(title)
    print("=" * 90, flush=True)

# ═══════════════════════════════════════════════════════════════════════
# STATE REGISTRY
# ═══════════════════════════════════════════════════════════════════════

def load_registry():
    if REGISTRY_FILE.exists():
        try:
            return json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"schema_version": "1.0", "modules": {}}

def save_registry(registry):
    registry["last_orchestration_utc"] = datetime.now(timezone.utc).isoformat()
    REGISTRY_FILE.write_text(json.dumps(registry, indent=2, default=str), encoding="utf-8")

def update_module(registry, name, success, elapsed, error=None):
    now_utc = datetime.now(timezone.utc).isoformat()
    prev = registry["modules"].get(name, {})
    prev_failures = prev.get("consecutive_failures", 0)

    registry["modules"][name] = {
        "last_attempt_utc": now_utc,
        "last_success_utc": now_utc if success else prev.get("last_success_utc"),
        "status": "success" if success else "failed",
        "elapsed_seconds": round(elapsed, 1),
        "error": None if success else (str(error)[:200] if error else "unknown"),
        "consecutive_failures": 0 if success else prev_failures + 1,
        "depends_on": prev.get("depends_on", []),
    }

# ═══════════════════════════════════════════════════════════════════════
# INTERNET CHECK
# ═══════════════════════════════════════════════════════════════════════

def wait_for_internet():
    log("Checking internet connection...")
    for _ in range(30):
        try:
            socket.create_connection(("8.8.8.8", 53), timeout=5)
            log("Internet connected")
            return
        except OSError:
            log("No internet. Retrying in 10s...")
            time.sleep(10)
    log("WARNING: Could not verify internet after 5 minutes. Proceeding anyway.")

# ═══════════════════════════════════════════════════════════════════════
# PROCESS RUNNER
# ═══════════════════════════════════════════════════════════════════════

def run_process(cmd, cwd=None, timeout=None, heartbeat=30):
    start = time.time()
    last_beat = start
    log(f"  RUN: {' '.join(map(str, cmd))}")

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=None,
        stderr=None,
        text=True,
    )

    while True:
        time.sleep(1)
        if time.time() - last_beat >= heartbeat:
            log("  ... still running ...")
            last_beat = time.time()
        if timeout and (time.time() - start) >= timeout:
            log("  TIME LIMIT reached - terminating")
            proc.terminate()
            return True
        if proc.poll() is not None:
            rc = proc.returncode
            mins = (time.time() - start) / 60
            if rc != 0:
                log(f"  FAILED (exit code {rc}) in {mins:.1f} min")
                return False
            log(f"  OK in {mins:.1f} min")
            return True

# ═══════════════════════════════════════════════════════════════════════
# PIPELINE STEPS
# ═══════════════════════════════════════════════════════════════════════

def step_market_data():
    section("MARKET DATA")
    return run_process([sys.executable, "update_all_data.py"], BASE, heartbeat=20)

def step_screener():
    section("SCREENER SNAPSHOT")
    return run_process(
        [sys.executable, "-c",
         "from app.screener_snapshot import build_screener_snapshot;"
         "df=build_screener_snapshot();"
         "print(f'Screener rows: {len(df)}')"],
        BACKEND,
    )

def step_insider():
    section("INSIDER FLOW (90 MIN CAP)")
    script = INSIDER_DIR / "run_finsight_pipeline.py"
    if not script.exists():
        log("InsiderFlow script not found - skipping")
        return False
    ok = run_process(
        [sys.executable, str(script), "--incremental"],
        INSIDER_DIR,
        timeout=INSIDER_TIMEOUT,
        heartbeat=60,
    )
    INSIDER_STATE.write_text(json.dumps({
        "last_attempt_utc": datetime.now(timezone.utc).isoformat(),
        "success": ok,
    }, indent=2))
    return ok

def step_fii_dii():
    section("FII / DII (Smart Money Flow)")
    script = SMART_MONEY_DIR / "fii_dii_pipeline.py"
    if not script.exists():
        log(f"FII/DII script not found at {script} - skipping")
        return False
    ok = run_process([sys.executable, str(script)], SMART_MONEY_DIR)
    if ok:
        src_dir = SMART_MONEY_DIR / "fii_dii_output"
        if src_dir.exists():
            for f in src_dir.glob("*.csv"):
                dst = DATA / "smart_money" / f.name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dst)
                log(f"  Copied {f.name} -> data/smart_money/")
    return ok

def step_stratax():
    section("STRATAX OPTIONS DATA")
    script = BACKEND / "scripts" / "fetch_stratax_data.py"
    if not script.exists():
        log("StrataX script not found - skipping")
        return False
    health_dir = BASE / "artifacts" / "health"
    health_dir.mkdir(parents=True, exist_ok=True)
    return run_process(
        [sys.executable, str(script), "--all", "--quiet", "--delay", "5"],
        BACKEND,
        timeout=1800,
    )

def step_announcements():
    section("INDIAN ANNOUNCEMENTS")
    script = ANN_DIR / "run_collector_fixed.py"
    if not script.exists():
        log("Announcements script not found - skipping")
        return False
    ok = run_process([sys.executable, str(script)], ANN_DIR)
    if ok:
        DEPLOYED_ANN.mkdir(parents=True, exist_ok=True)
        for f in ["corporate_announcements.csv", "insider_filings.csv"]:
            src = ANN_DIR / f
            if src.exists():
                shutil.copy2(src, DEPLOYED_ANN / f)
                log(f"  Copied {f}")
    return ok

def step_finax():
    section("FINAX NEWS FEED")
    script = FINAX_DIR / "finax_engine.py"
    if not script.exists():
        log(f"FinAx script not found at {script} - skipping")
        return False
    return run_process([sys.executable, str(script)], FINAX_DIR, timeout=600)

def step_intelligence():
    section("INTELLIGENCE (14-LAYER FULL UNIVERSE)")
    return run_process(
        [sys.executable, "-m", "quant_system.run_full_daily_intelligence", "--full-universe"],
        BASE,
        heartbeat=60,
    )

def step_intelligence_archive():
    section("INTELLIGENCE ARCHIVE")
    today_str = date.today().isoformat()
    try:
        for market in ["IN", "US"]:
            src_dir = INTELLIGENCE_DIR / market
            if not src_dir.exists():
                continue
            dst_dir = INTELLIGENCE_HISTORY / today_str / market
            dst_dir.mkdir(parents=True, exist_ok=True)
            count = 0
            for f in src_dir.glob("*.json"):
                shutil.copy2(f, dst_dir / f.name)
                count += 1
            log(f"  Archived {count} files for {market} to history/{today_str}/")
        return True
    except Exception as e:
        log(f"  Archive failed: {e}")
        return False

def step_timeline():
    section("TIMELINE SNAPSHOTS")
    today_str = date.today().isoformat()
    try:
        for market in ["IN", "US"]:
            src_dir = INTELLIGENCE_DIR / market
            if not src_dir.exists():
                continue
            timeline_dir = BASE / "public" / "timeline" / market
            timeline_dir.mkdir(parents=True, exist_ok=True)
            recommendations = []
            for f in src_dir.glob("*.json"):
                if f.name.startswith("_"):
                    continue
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    recommendations.append({
                        "ticker": data.get("ticker"),
                        "market": data.get("market"),
                        "intent": data.get("intent"),
                        "conviction": data.get("conviction"),
                        "conviction_pct": data.get("conviction_pct"),
                        "direction": data.get("direction"),
                        "asset_regime": data.get("asset_regime"),
                        "market_regime": data.get("market_regime"),
                        "last_price": data.get("last_price"),
                        "price_change_1d": data.get("price_change_1d"),
                        "volatility_regime": data.get("volatility_regime"),
                        "cvar_95": data.get("cvar_95"),
                        "supporting_signals": data.get("supporting_signals", []),
                        "opposing_signals": data.get("opposing_signals", []),
                    })
                except Exception:
                    continue
            snapshot = {
                "date": today_str,
                "market": market,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "total_stocks": len(recommendations),
                "recommendations": recommendations,
            }
            out_file = timeline_dir / f"{today_str}.json"
            out_file.write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
            log(f"  Timeline {market}: {len(recommendations)} stocks -> {out_file.name}")
        return True
    except Exception as e:
        log(f"  Timeline failed: {e}")
        return False

def step_positions():
    section("POSITION SYNC")
    return run_process([sys.executable, "sync_positions.py"], BASE)

def step_mnemos():
    section("MNEMOS 1.0 DAILY INTELLIGENCE")
    script = MNEMOS_DIR / "run.py"
    if not script.exists():
        log(f"Mnemos run.py not found at {script} - skipping")
        return False
    config_file = MNEMOS_DIR / "config.yaml"
    if not config_file.exists():
        log(f"Mnemos config.yaml not found - skipping")
        return False
    return run_process(
        [sys.executable, str(script)],
        MNEMOS_DIR,
        timeout=1800,
        heartbeat=60,
    )

def step_mnemos2_sync():
    section("MNEMOS 2.0 DATA SYNC")
    sync_script = MNEMOS_DIR / "sync_mnemos2.py"
    if not sync_script.exists():
        log(f"Mnemos 2.0 sync script not found at {sync_script} - skipping")
        return False
    return run_process([sys.executable, str(sync_script)], MNEMOS_DIR, timeout=120)

def step_alpha_rankings():
    section("ALPHA RANKING ENGINE")
    script = BASE / "scripts" / "alpha_ranking_batch.py"
    if not script.exists():
        log(f"Alpha ranking script not found at {script} - skipping")
        return False
    return run_process(
        [sys.executable, str(script)],
        BASE,
        timeout=3600,
        heartbeat=120,
    )

def step_pipeline_audit():
    section("PIPELINE AUDIT")
    return run_process(
        [sys.executable, "-m", "quant_system.pipeline_audit"],
        BASE,
        timeout=900,
    )

# ═══════════════════════════════════════════════════════════════════════
# PIPELINE DEFINITION
# ═══════════════════════════════════════════════════════════════════════

PIPELINE = [
    # Phase 1: Data collection (no dependencies)
    {"name": "market_data",   "fn": step_market_data,   "depends_on": []},
    {"name": "insider_flow",  "fn": step_insider,        "depends_on": []},
    {"name": "fii_dii",       "fn": step_fii_dii,        "depends_on": []},
    {"name": "stratax",       "fn": step_stratax,         "depends_on": []},
    {"name": "announcements", "fn": step_announcements,   "depends_on": []},
    {"name": "finax",         "fn": step_finax,            "depends_on": []},
    {"name": "mnemos",        "fn": step_mnemos,           "depends_on": []},
    {"name": "mnemos2_sync",  "fn": step_mnemos2_sync,     "depends_on": []},
    # Phase 2: Processing
    {"name": "screener",      "fn": step_screener,         "depends_on": ["market_data"]},
    {"name": "intelligence",  "fn": step_intelligence,     "depends_on": ["market_data", "screener"]},
    # Phase 3: Post-processing
    {"name": "intelligence_archive", "fn": step_intelligence_archive, "depends_on": ["intelligence"]},
    {"name": "timeline",      "fn": step_timeline,         "depends_on": ["intelligence"]},
    {"name": "positions",     "fn": step_positions,         "depends_on": ["intelligence"]},
    {"name": "alpha_rankings","fn": step_alpha_rankings,    "depends_on": ["market_data"]},
    {"name": "pipeline_audit","fn": step_pipeline_audit,    "depends_on": ["intelligence"]},
]

# ═══════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════

def main():
    section("FINVEST DAILY REFRESH ORCHESTRATOR v3.0")
    total_start = time.time()

    wait_for_internet()

    registry = load_registry()
    results = {}

    for step in PIPELINE:
        name = step["name"]
        deps = step["depends_on"]

        # Store declared dependencies
        if name not in registry["modules"]:
            registry["modules"][name] = {}
        registry["modules"][name]["depends_on"] = deps

        # Check dependencies
        deps_ok = True
        for dep in deps:
            dep_status = results.get(dep)
            if dep_status is not True:
                deps_ok = False
                log(f"SKIP {name}: dependency '{dep}' not met")
                break

        if not deps_ok:
            update_module(registry, name, False, 0, error=f"dependency failed: {dep}")
            registry["modules"][name]["status"] = "skipped"
            results[name] = False
            save_registry(registry)
            continue

        # Run the step
        step_start = time.time()
        try:
            ok = step["fn"]()
        except Exception as e:
            ok = False
            log(f"EXCEPTION in {name}: {e}")

        elapsed = time.time() - step_start
        results[name] = ok
        update_module(registry, name, ok, elapsed, error=None if ok else "step returned False")
        save_registry(registry)

    # Write legacy state file for backward compatibility
    total_mins = (time.time() - total_start) / 60
    LEGACY_STATE_FILE.write_text(json.dumps({
        "last_run_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_minutes": round(total_mins, 2),
        "results": {k: v for k, v in results.items()},
    }, indent=2))

    # Summary
    section("PIPELINE COMPLETE")
    for name, ok in results.items():
        status = registry["modules"].get(name, {}).get("status", "unknown")
        icon = {"success": "OK", "failed": "FAIL", "skipped": "SKIP"}.get(status, "??")
        print(f"  [{icon:>4}] {name}", flush=True)

    log(f"Total runtime: {total_mins:.1f} minutes")

    critical = ["market_data", "screener"]
    if any(results.get(s) is not True for s in critical):
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
