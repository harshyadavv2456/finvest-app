"""
FinSight InsiderFlow Pipeline
=============================

This script orchestrates the SEC data fetching and signal building.

Usage:
  python run_finsight_pipeline.py           # Full update
  python run_finsight_pipeline.py --incremental  # Skip if data is < 12 hours old
"""

import subprocess
import sys
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path


def get_last_update_time() -> datetime:
    """Get the last modification time of the output files."""
    output_dir = Path(__file__).parent / "sec_output_10y"
    signals_dir = Path(__file__).parent / "signals_output"
    
    latest_time = None
    
    for directory in [output_dir, signals_dir]:
        if directory.exists():
            for f in directory.glob("*.csv"):
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if latest_time is None or mtime > latest_time:
                    latest_time = mtime
    
    return latest_time


def is_data_fresh(max_age_hours: int = 12) -> bool:
    """Check if data was updated within the last N hours."""
    last_update = get_last_update_time()
    
    if last_update is None:
        return False
    
    age = datetime.now() - last_update
    is_fresh = age < timedelta(hours=max_age_hours)
    
    if is_fresh:
        print(f"[*] Data was last updated {age.total_seconds()/3600:.1f} hours ago (threshold: {max_age_hours}h)")
    
    return is_fresh


def run_script(script_name: str):
    """
    Run a Python script (in the same folder) with the same interpreter.
    """
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), script_name)
    print(f"\n=== RUNNING {script_name} ===")
    try:
        result = subprocess.run([sys.executable, script_path], check=True)
        print(f"=== FINISHED {script_name} (return code {result.returncode}) ===\n")
    except subprocess.CalledProcessError as e:
        print(f"[!] {script_name} FAILED with return code {e.returncode}")
        raise


def main():
    parser = argparse.ArgumentParser(description="Run FinSight InsiderFlow pipeline")
    parser.add_argument(
        "--incremental", 
        action="store_true",
        help="Skip if data was updated within last 12 hours"
    )
    parser.add_argument(
        "--max-age-hours",
        type=int,
        default=12,
        help="Maximum age in hours for --incremental mode (default: 12)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force full update even if data is fresh"
    )
    
    args = parser.parse_args()
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)
    
    print("=" * 60)
    print("FinSight InsiderFlow Pipeline")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Check if we should skip due to fresh data
    if args.incremental and not args.force:
        if is_data_fresh(args.max_age_hours):
            print(f"[*] Data is fresh (< {args.max_age_hours}h old). Skipping update.")
            print("[*] Use --force to override.")
            return
    
    # 1) First: crawl / update SEC data (insiders + 13F)
    # This is already incremental - it only fetches new data since last update
    print("\n" + "=" * 60)
    print("STEP 1: Fetching SEC Data (Form 4 + 13F)")
    print("=" * 60)
    run_script("sec_10y_pipeline.py")

    # 2) Then: build signals from the updated CSVs
    print("\n" + "=" * 60)
    print("STEP 2: Building Trading Signals")
    print("=" * 60)
    run_script("build_signals.py")
    
    print("\n" + "=" * 60)
    print("✅ InsiderFlow Pipeline Complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
