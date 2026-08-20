"""
sec_diagnose.py  –  Run this before the main pipeline to understand why data is stuck.
Zero writes. Zero CSV modifications. Just prints what SEC has vs what you have.

Usage:
    python sec_diagnose.py

It reads insider_tickers.txt and hedge_fund_ciks.txt from the same folder,
then for each entity:
  1. Hits SEC submissions API
  2. Shows what dates + form counts are in the recent block
  3. Shows what date range is in your existing CSV (if any)
  4. Shows whether a .full_fetch_done flag exists
  5. Flags any gap between your CSV and SEC

This tells you immediately:
  - Is the code eating 2026 data, or does SEC genuinely have none for your tickers?
  - Is the pipeline in incremental or recovery mode?
  - Are any flag files in a weird state?
"""

import requests
import os
import json
import time
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# ── Config (match your pipeline) ──────────────────────────────────────────────
HEADERS = {
    "User-Agent": "HarshYadav-FinSight/1.0 (your_email@example.com)",  # PUT REAL EMAIL
    "Accept-Encoding": "gzip, deflate",
}
INSIDER_TICKERS_FILE = "insider_tickers.txt"
HEDGE_FUNDS_FILE     = "hedge_fund_ciks.txt"
OUTPUT_DIR           = "sec_output_10y"
FLAG_SUFFIX          = ".full_fetch_done"
SEC_TICKER_JSON_URL  = "https://www.sec.gov/files/company_tickers.json"

_last_req = 0.0

def sec_get(url):
    global _last_req
    gap = 1.0 / 5.0
    wait = gap - (time.time() - _last_req)
    if wait > 0:
        time.sleep(wait)
    _last_req = time.time()
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return r

def load_lines(path):
    if not os.path.exists(path):
        return []
    lines = []
    with open(path) as f:
        for line in f:
            line = line.strip().split("#")[0].strip()
            if line:
                lines.append(line.split()[0])
    return lines

def normalize_cik(cik):
    return str(cik).zfill(10)

def get_ticker_map():
    cache = os.path.join(OUTPUT_DIR, "_ticker_cik_cache.json")
    if os.path.exists(cache):
        try:
            d = json.load(open(cache))
            return d["mapping"]
        except:
            pass
    print("[*] Downloading ticker->CIK map...")
    raw = sec_get(SEC_TICKER_JSON_URL).json()
    return {v["ticker"].upper(): str(v["cik_str"]) for _, v in raw.items()}

def diagnose_cik(cik: str, label: str, forms_filter: List[str], csv_path: str):
    print(f"\n{'='*60}")
    print(f"  {label}  (CIK: {cik})")
    print(f"{'='*60}")

    # ── 1) What's in the existing CSV? ────────────────────────────────────────
    flag_path = csv_path + FLAG_SUFFIX
    has_flag = os.path.exists(flag_path)
    has_csv  = os.path.exists(csv_path)

    if has_csv:
        df = pd.read_csv(csv_path)
        if "filingDate" in df.columns:
            dates = pd.to_datetime(df["filingDate"], errors="coerce").dropna()
            csv_min = dates.min().date() if not dates.empty else None
            csv_max = dates.max().date() if not dates.empty else None
        else:
            csv_min = csv_max = None
        print(f"  CSV rows      : {len(df):,}")
        print(f"  CSV date range: {csv_min}  →  {csv_max}")
        print(f"  Flag file     : {'EXISTS (incremental mode)' if has_flag else 'MISSING (recovery/full mode)'}")
        days_stale = (datetime.today().date() - csv_max).days if csv_max else None
        if days_stale is not None:
            staleness = f"{days_stale}d stale"
            if days_stale > 60:
                staleness += "  ⚠️  VERY STALE"
            elif days_stale > 14:
                staleness += "  ⚠️"
            print(f"  Staleness     : {staleness}")
    else:
        print(f"  CSV           : NOT FOUND")
        print(f"  Flag file     : {'EXISTS (orphaned!)' if has_flag else 'NOT FOUND'}")
        csv_max = None

    # ── 2) What does SEC actually have? ───────────────────────────────────────
    cik_norm = normalize_cik(cik)
    url = f"https://data.sec.gov/submissions/CIK{cik_norm}.json"
    print(f"\n  Fetching SEC: {url}")
    try:
        subs = sec_get(url).json()
    except Exception as e:
        print(f"  [ERROR] SEC fetch failed: {e}")
        return

    recent  = subs.get("filings", {}).get("recent", {})
    r_forms = recent.get("form", [])
    r_dates = recent.get("filingDate", [])

    target_dates = [d for f, d in zip(r_forms, r_dates) if f in forms_filter]

    print(f"\n  --- SEC recent block ---")
    print(f"  Total filings in recent block : {len(r_forms)}")
    print(f"  Target form(s) {forms_filter} : {len(target_dates)}")

    if target_dates:
        sec_max = max(target_dates)
        sec_min = min(target_dates)
        print(f"  SEC date range (target forms) : {sec_min}  →  {sec_max}")

        # 2026 filings
        filings_2026 = [d for d in target_dates if d.startswith("2026")]
        print(f"  2026 filings on SEC           : {len(filings_2026)}")
        if filings_2026:
            print(f"  Latest 5 on SEC:")
            for d in sorted(filings_2026, reverse=True)[:5]:
                print(f"    {d}")
        else:
            print(f"  ⚠️  SEC has ZERO 2026 target filings in the recent block for this entity.")
            print(f"      This means insiders haven't transacted / fund hasn't filed for 2026 yet.")
    else:
        print(f"  ⚠️  Zero target filings found in recent block for forms {forms_filter}!")

    # ── 3) Historical pagination files ────────────────────────────────────────
    files_meta = subs.get("filings", {}).get("files", [])
    print(f"\n  --- Historical pagination files ---")
    print(f"  Count: {len(files_meta)}")
    for fm in files_meta:
        name      = fm.get("name", "?")
        filing_from = fm.get("filingFrom", "?")
        filing_to   = fm.get("filingTo", "?")
        count     = fm.get("filingCount", "?")
        print(f"    {name}  |  {filing_from} → {filing_to}  |  {count} filings")

    # ── 4) Gap summary ────────────────────────────────────────────────────────
    if csv_max and target_dates:
        sec_latest = max(target_dates)
        gap_days = (datetime.strptime(sec_latest, "%Y-%m-%d").date() - csv_max).days
        print(f"\n  ── GAP SUMMARY ──")
        print(f"  Your CSV latest : {csv_max}")
        print(f"  SEC latest      : {sec_latest}")
        if gap_days > 0:
            print(f"  Gap             : {gap_days} days BEHIND  ← data missing")
            if not has_flag:
                print(f"  Likely cause    : No flag file → pipeline will do full refetch next run (should fix itself)")
            else:
                print(f"  Likely cause    : Derivative-only transactions (options/RSUs) being dropped by parser")
                print(f"                    OR pipeline hasn't run since {csv_max}")
        elif gap_days == 0:
            print(f"  Gap             : 0 days – CSV is current! ✅")
        else:
            print(f"  Gap             : CSV appears NEWER than SEC recent block (unusual)")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    tickers = load_lines(INSIDER_TICKERS_FILE)
    ciks    = load_lines(HEDGE_FUNDS_FILE)

    print(f"Loaded {len(tickers)} insider tickers, {len(ciks)} hedge fund CIKs")
    print(f"Today: {datetime.today().date()}")

    if tickers:
        ticker_map = get_ticker_map()
        for ticker in tickers:
            t = ticker.upper()
            cik = ticker_map.get(t)
            if not cik:
                print(f"\n[!] Ticker {t} not found in SEC map. Skipping.")
                continue
            csv_path = os.path.join(OUTPUT_DIR, f"{t}_insider_10y.csv")
            diagnose_cik(cik, f"INSIDER: {t}", ["4"], csv_path)

    if ciks:
        for c in ciks:
            cik_norm = normalize_cik(c)
            csv_path = os.path.join(OUTPUT_DIR, f"CIK{cik_norm}_13f_10y.csv")
            diagnose_cik(c, f"13F FUND: CIK {c}", ["13F-HR", "13F-HR/A"], csv_path)

    print(f"\n{'='*60}")
    print("DIAGNOSIS COMPLETE. No files were modified.")
    print("="*60)


if __name__ == "__main__":
    main()
