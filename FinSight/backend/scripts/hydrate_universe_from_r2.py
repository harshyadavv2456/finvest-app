#!/usr/bin/env python3
"""
Hydrate the FULL ticker universe's per-ticker data files from R2 onto
local disk - the missing piece for the `intelligence` GH Actions job.

Root cause this fixes: `quant_system/run_full_daily_intelligence.py`'s
`discover_universe()` is a deliberately "LOCKED" filesystem-only scanner
(no R2 fallback by design - see its own docstring: "Discovers from
filesystem ONLY... NO fallbacks... FAILS HARD if no stocks found"). On a
fresh GitHub Actions checkout, `FinSight/data/{market}/` is empty
(gitignored), so `discover_universe()` always found 0 tickers and hard-
failed with "FATAL: No valid stocks found" - true on every single run
since the R2 migration, masked earlier by a *different* startup-
validator bug that failed first and got fixed without noticing this one
underneath it.

This script is the fix at the right layer: populate local disk from R2
BEFORE `discover_universe()` runs, rather than touching the locked
discovery logic itself. Companion to `upload_data_to_r2.py` (the reverse
direction) - same R2 key layout (`data/{market}/{ticker}/{filename}`),
same bounded-concurrency pattern.

Usage:
    python hydrate_universe_from_r2.py
"""
import concurrent.futures
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("hydrate_universe_from_r2")

FINSIGHT_ROOT = Path(__file__).resolve().parent.parent  # FinSight/backend/scripts -> FinSight/backend
DATA_DIR = FINSIGHT_ROOT.parent / "data"  # FinSight/data

# history.parquet is the only file discover_universe() actually requires
# (a ticker is included iff this exists) - the rest are optional and
# only affect which analysis layers are active per stock (data_validator.py),
# not whether the ticker is discovered at all. Download all of them so the
# intelligence run gets full-quality layer coverage, not just bare inclusion.
TICKER_FILES = [
    "history.parquet",
    "tech_indicators.parquet",
    "financials_full.json",
    "metadata.json",
    "news.parquet",
]

HYDRATE_WORKERS = int(os.environ.get("HYDRATE_WORKERS", "16"))


def _load_env_file():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _hydrate_ticker(client, market: str, ticker: str) -> int:
    from app.storage.r2_client import ticker_data_key

    downloaded = 0
    ticker_dir = DATA_DIR / market / ticker
    for filename in TICKER_FILES:
        local_path = ticker_dir / filename
        if local_path.exists():
            continue
        key = ticker_data_key(market, ticker, filename)
        try:
            if client.download_to_file(key, local_path):
                downloaded += 1
        except Exception as e:  # noqa: BLE001
            log.debug(f"Failed to fetch {key}: {e}")
    return downloaded


def main() -> int:
    _load_env_file()
    if not os.environ.get("R2_ACCESS_KEY_ID"):
        log.info("R2 not configured - skipping universe hydration (local dev, presumably data/ is populated already)")
        return 0

    from app.storage.r2_client import get_r2_client

    client = get_r2_client()
    manifest = client.get_json("meta/tickers_manifest.json")
    if not manifest or not manifest.get("tickers"):
        log.error("No ticker manifest found at meta/tickers_manifest.json - cannot hydrate universe. "
                   "Run upload_tickers_manifest.py first.")
        return 1

    tickers = manifest["tickers"]
    log.info(f"Hydrating {len(tickers)} tickers from R2 (up to {len(TICKER_FILES)} files each, {HYDRATE_WORKERS} workers)...")

    total_files = 0
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=HYDRATE_WORKERS) as executor:
        futures = {
            executor.submit(_hydrate_ticker, client, t.get("market", "US"), t["ticker"]): t
            for t in tickers if t.get("ticker")
        }
        for future in concurrent.futures.as_completed(futures):
            completed += 1
            try:
                total_files += future.result()
            except Exception as e:  # noqa: BLE001
                log.warning(f"Hydration failed for {futures[future].get('ticker')}: {e}")
            if completed % 200 == 0:
                log.info(f"Hydrated {completed}/{len(tickers)} tickers ({total_files} files so far)")

    log.info(f"Done: {completed} tickers processed, {total_files} files downloaded from R2 into {DATA_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
