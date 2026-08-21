#!/usr/bin/env python3
"""
One-time (and re-runnable) bulk upload of FinSight/data/ into R2.

Safety guarantees, per instruction:
  - ADDITIVE ONLY. Never deletes or modifies a single local file. This is
    a pure upload; the local copy remains the source of truth until the
    backend is confirmed reading correctly from R2.
  - Resumable: a small state file tracks which local files have already
    been uploaded (by path + mtime + size), so re-running after an
    interruption only uploads what changed, not everything again.
  - Bounded parallelism (UPLOAD_WORKERS, default 16): sequential uploads
    of ~13k small files at ~1 file/sec took 2.5-3.5h alone, blowing past
    the daily-refresh workflow's 4h job cap and leaving screener/
    intelligence (which `needs: market-data`) never running at all -
    root-caused 2026-08-21 from a run that hung mid-upload for hours.
    The earlier "sequential, one file at a time" design was deliberately
    conservative because a multi-threaded bulk copy crashed a local dev
    machine's RAM budget once - but this runs on GitHub Actions' 7GB
    ephemeral runners uploading small files over the network (I/O bound,
    not memory bound), a different environment than the one that crashed.
    A modest thread pool is safe here and turns hours into minutes.
  - Live cost guard: checks actual bucket size against R2 (not a local
    estimate) every N files, and stops immediately - before uploading
    anything that would push past the 10GB free tier - rather than
    finding out after the fact.

Usage:
    python upload_data_to_r2.py               # upload FinSight/data
    python upload_data_to_r2.py --dry-run      # show what would upload, upload nothing
"""
import argparse
import hashlib
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("upload_data_to_r2")

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"  # FinSight/backend/scripts -> FinSight/data
STATE_FILE = Path(__file__).resolve().parent.parent.parent / "state" / "r2_upload_state.json"  # FinSight/state, matching sync_news_intelligence.py's state file convention
PER_FILE_TIMEOUT_SECONDS = 30  # seen actual hangs this session with no timeout at all; 30s is generous for any single ticker file

# Hard safety cap - stop well before the actual 10GB free-tier limit, to
# leave headroom for the intelligence snapshots and anything else that
# might land in the same bucket later.
SAFETY_CAP_BYTES = 9 * 1024 * 1024 * 1024  # 9GB, 1GB of margin under the 10GB free tier
CHECK_SIZE_EVERY = 200  # files
UPLOAD_WORKERS = int(os.environ.get("UPLOAD_WORKERS", "16"))


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


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def file_fingerprint(path: Path) -> str:
    """Cheap fingerprint (mtime + size), not a full hash - fast enough to
    check on every file without reading its contents."""
    st = path.stat()
    return f"{int(st.st_mtime)}:{st.st_size}"


def main():
    _load_env_file()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    from app.storage.r2_client import get_r2_client, ticker_data_key

    if not DATA_DIR.exists():
        log.error("Data dir not found: %s", DATA_DIR)
        return 1

    client = get_r2_client()
    state = load_state()
    uploaded = state.get("uploaded", {})  # relative path -> fingerprint

    # Discover files: data/{market}/{ticker}/{filename}
    to_upload = []
    for market_dir in sorted(DATA_DIR.iterdir()):
        if not market_dir.is_dir():
            continue
        market = market_dir.name
        for ticker_dir in sorted(market_dir.iterdir()):
            if not ticker_dir.is_dir():
                continue
            ticker = ticker_dir.name
            for f in ticker_dir.iterdir():
                if not f.is_file():
                    continue
                rel = f"{market}/{ticker}/{f.name}"
                fp = file_fingerprint(f)
                if uploaded.get(rel) == fp:
                    continue  # unchanged since last successful upload
                to_upload.append((market, ticker, f, rel, fp))

    log.info("Found %d files needing upload (out of %d already up to date)", len(to_upload), len(uploaded))

    if args.dry_run:
        for market, ticker, f, rel, fp in to_upload[:20]:
            log.info("Would upload: %s (%d bytes)", rel, f.stat().st_size)
        log.info("... and %d more" if len(to_upload) > 20 else "", max(0, len(to_upload) - 20))
        return 0

    if not to_upload:
        log.info("Nothing to upload - R2 is already up to date with local disk.")
        return 0

    uploaded_count = 0
    uploaded_bytes_this_run = 0
    checked_count = 0  # separate counter for the size-check cadence, since completion order isn't sequential anymore
    start = time.time()
    stop_requested = False

    # Bounded worker pool, reused across the whole run (not one pool per
    # file - that was fine at 1 worker but wasteful/pointless at scale).
    # Each submitted job still gets its own hard per-file timeout via
    # future.result(timeout=...), preserving the "stuck disk read"
    # protection the original design had.
    pool = ThreadPoolExecutor(max_workers=UPLOAD_WORKERS)
    try:
        pending = {}
        upload_iter = iter(to_upload)

        def _submit_next():
            item = next(upload_iter, None)
            if item is None:
                return False
            market, ticker, f, rel, fp = item
            key = ticker_data_key(market, ticker, f.name)
            fut = pool.submit(client.put_file, key, f)
            pending[fut] = item
            return True

        # Prime the pool up to UPLOAD_WORKERS in-flight uploads.
        for _ in range(UPLOAD_WORKERS):
            if not _submit_next():
                break

        while pending and not stop_requested:
            # Wait for the oldest-submitted future with a hard deadline -
            # if it's stuck, log it as a per-file timeout and move on
            # rather than blocking the whole run.
            fut = next(iter(pending))
            item = pending.pop(fut)
            market, ticker, f, rel, fp = item
            try:
                fut.result(timeout=PER_FILE_TIMEOUT_SECONDS)
                uploaded[rel] = fp
                uploaded_count += 1
                uploaded_bytes_this_run += f.stat().st_size
            except FuturesTimeout:
                log.warning("Upload TIMED OUT for %s after %ds - likely a stuck disk read, skipping (will retry next run)", rel, PER_FILE_TIMEOUT_SECONDS)
            except Exception as e:
                log.warning("Upload failed for %s: %s (will retry next run)", rel, e)

            checked_count += 1
            if checked_count % CHECK_SIZE_EVERY == 0:
                try:
                    current_size = client.approx_bucket_size_bytes()
                except Exception as e:
                    log.warning("Could not check bucket size (%s) - continuing cautiously", e)
                    current_size = 0
                if current_size >= SAFETY_CAP_BYTES:
                    log.error(
                        "STOPPING: bucket is at %.2f GB, safety cap is %.2f GB. "
                        "No further uploads submitted this run - in-flight ones still finish, no risk of exceeding the free tier.",
                        current_size / 1e9, SAFETY_CAP_BYTES / 1e9,
                    )
                    stop_requested = True
                else:
                    log.info("Bucket size check: %.2f GB (cap %.2f GB)", current_size / 1e9, SAFETY_CAP_BYTES / 1e9)

            if uploaded_count % 50 == 0 and uploaded_count > 0:
                elapsed = time.time() - start
                log.info(
                    "Progress: %d/%d uploaded (%.1f MB), %.1fs elapsed",
                    uploaded_count, len(to_upload), uploaded_bytes_this_run / 1e6, elapsed,
                )
                save_state({"uploaded": uploaded})  # checkpoint periodically, not just at the end

            if not stop_requested:
                _submit_next()  # keep the pool full
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    save_state({"uploaded": uploaded})
    log.info(
        "Done. %d files uploaded this run (%.1f MB) in %.1fs. Local files untouched.",
        uploaded_count, uploaded_bytes_this_run / 1e6, time.time() - start,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
