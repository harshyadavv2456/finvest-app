#!/usr/bin/env python3
"""
Live-site fix (discovered post-migration): data_access.list_tickers() only
ever walked FinSight/data/ on local disk. That's fine in dev (data/ is
still populated locally) but on Render, the git repo no longer ships
FinSight/data/ at all (that's the whole point of the R2 migration) - so
list_tickers() returned 0 tickers and the screener/homepage came back
empty on the first post-migration deploy.

Per-ticker detail pages self-heal fine (get_ticker_dir in utils/paths.py
already pulls individual ticker files from R2 on a cache miss) but there
was no R2-side answer to "what tickers exist at all" - that would mean
listing and downloading ~13,430 metadata.json objects one by one on every
cold list_tickers() call, which is much too slow for a live request.

Fix: build the full ticker list locally (where data/ still exists) once,
upload it as a single JSON manifest to R2. list_tickers() then falls back
to one R2 GET for this file instead of a local directory walk, when local
is empty - see app/data_access.py.

Usage:
    python upload_tickers_manifest.py
"""
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("upload_tickers_manifest")

MANIFEST_KEY = "meta/tickers_manifest.json"


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


def main():
    _load_env_file()
    from app.data_access import list_tickers
    from app.storage.r2_client import get_r2_client

    tickers = list_tickers()
    log.info("Built manifest of %d tickers from local FinSight/data/", len(tickers))
    if not tickers:
        log.error("list_tickers() returned 0 - refusing to upload an empty manifest (would break the live site worse than not uploading at all)")
        return 1

    client = get_r2_client()
    client.put_json(MANIFEST_KEY, {"tickers": tickers, "count": len(tickers)})
    log.info("Uploaded manifest to R2 key '%s' (%d tickers)", MANIFEST_KEY, len(tickers))
    return 0


if __name__ == "__main__":
    sys.exit(main())
