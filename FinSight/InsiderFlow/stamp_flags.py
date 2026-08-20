"""
stamp_flags.py  —  Run this ONCE before the next pipeline run.

Scans every CSV in sec_output_10y, and for each one that looks healthy
(date span >= MIN_YEARS), writes the .full_fetch_done flag file.

After this runs, every entity is in fast incremental mode.
The main pipeline will then only fetch the last 30 days per ticker
instead of doing a slow full refetch every time.

Takes ~5 seconds. Zero network calls. Zero CSV modifications.

Usage:
    python stamp_flags.py
"""

import os
import pandas as pd
from datetime import datetime

OUTPUT_DIR      = "sec_output_10y"
FLAG_SUFFIX     = ".full_fetch_done"
MIN_YEARS       = 3      # stamp flag if CSV spans at least this many years
MIN_ROWS        = 50     # also require at least this many rows (rules out stub CSVs)

stamped   = 0
skipped   = 0
already   = 0
too_thin  = 0
errors    = 0

print(f"Scanning {OUTPUT_DIR} ...")
print(f"Criteria: date span >= {MIN_YEARS}y AND rows >= {MIN_ROWS}\n")

csv_files = sorted([
    f for f in os.listdir(OUTPUT_DIR)
    if f.endswith(".csv") and not f.startswith("_")
])

print(f"Found {len(csv_files)} CSV files.\n")

for fname in csv_files:
    csv_path  = os.path.join(OUTPUT_DIR, fname)
    flag_path = csv_path + FLAG_SUFFIX

    if os.path.exists(flag_path):
        already += 1
        continue

    try:
        df = pd.read_csv(csv_path, usecols=["filingDate"] if "filingDate" in
                         pd.read_csv(csv_path, nrows=0).columns else None)

        if "filingDate" not in df.columns:
            print(f"  [SKIP] {fname}  — no filingDate column")
            skipped += 1
            continue

        n_rows = len(df)
        if n_rows < MIN_ROWS:
            print(f"  [THIN] {fname}  — only {n_rows} rows, needs >= {MIN_ROWS}")
            too_thin += 1
            continue

        dates = pd.to_datetime(df["filingDate"], errors="coerce").dropna()
        if dates.empty:
            print(f"  [SKIP] {fname}  — no parseable dates")
            skipped += 1
            continue

        span_years = (dates.max() - dates.min()).days / 365.0
        latest     = dates.max().date()

        if span_years >= MIN_YEARS:
            with open(flag_path, "w") as f:
                f.write(f"stamped_by_stamp_flags.py at {datetime.now().isoformat()}")
            print(f"  [STAMP] {fname}  — {n_rows:,} rows, span={span_years:.1f}y, latest={latest}")
            stamped += 1
        else:
            print(f"  [THIN] {fname}  — span only {span_years:.1f}y < {MIN_YEARS}y threshold")
            too_thin += 1

    except Exception as e:
        print(f"  [ERROR] {fname}  — {e}")
        errors += 1

print(f"""
{'='*55}
  DONE
{'='*55}
  Already had flag : {already:>5}
  Stamped now      : {stamped:>5}
  Too thin / new   : {too_thin:>5}   ← these will do full refetch
  No date col/skip : {skipped:>5}
  Errors           : {errors:>5}
  ─────────────────────────
  Total CSVs       : {len(csv_files):>5}
{'='*55}

Now run the main pipeline — every stamped ticker will be
in fast incremental mode (last 30 days only).
""")
