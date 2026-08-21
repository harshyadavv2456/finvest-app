#!/usr/bin/env python3
"""
Live-site fix (2026-08-21): several features came up broken/empty on
Render even after the R2 migration - Market Intel ("0 signals"), the
Dashboard's real stock count, Alpha Rankings ("not yet generated"),
IntrinsIQ. Root cause: they all read small aggregate JSON files under
FinSight/public/intelligence/ or FinSight/data/alpha_tracking/, both of
which are gitignored (same reason FinSight/data/{market}/{ticker}/ is)
but were never migrated anywhere - not to git, not to R2's per-ticker
scheme. On Render they just don't exist.

Unlike the big per-ticker data tree (self-healed lazily, one ticker at a
time, on request), these are small (well under 50MB combined) and read
eagerly on every dashboard/rankings/market-intel load - lazily
self-healing ~2,500 individual small files one R2 GET at a time would be
far too slow for a live request. So instead: bundle them into a single
zip, upload as one R2 object, and have the Render build step download +
extract that one object before the app starts (see
hydrate_from_r2.py and the Render build command). One request instead
of thousands.

Usage:
    python upload_static_bundle_to_r2.py
"""
import io
import logging
import os
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("upload_static_bundle_to_r2")

FINSIGHT_ROOT = Path(__file__).resolve().parent.parent.parent  # FinSight/backend/scripts -> FinSight
BUNDLE_KEY = "bundles/static_bundle.zip"

# (local dir relative to FinSight/, arcname prefix to use inside the zip -
#  same relative path, so hydrate_from_r2.py can extract it straight back
#  onto FinSight/ with no path translation needed)
BUNDLE_DIRS = [
    "public/intelligence",
    "data/alpha_tracking",
]

# Individual files (not whole dirs) that belong in the same bundle for the
# same reason - small, gitignored, read eagerly. screener.parquet added
# 2026-08-21: /api/screener came back empty (India especially - it's later
# in ticker order than the incomplete-snapshot 80% fallback would tolerate)
# because this file was never migrated anywhere, so the backend fell back
# to building it from 2,298 individual per-ticker files - up to ~9,000
# individual R2 GETs, which is far too slow to ever actually complete.
BUNDLE_FILES = [
    "data/screener.parquet",
]


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
    from app.storage.r2_client import get_r2_client

    buf = io.BytesIO()
    total_files = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel_dir in BUNDLE_DIRS:
            src = FINSIGHT_ROOT / rel_dir
            if not src.exists():
                log.warning("Skipping missing dir: %s", src)
                continue
            count = 0
            for f in src.rglob("*"):
                if f.is_file():
                    arcname = str(Path(rel_dir) / f.relative_to(src))
                    zf.write(f, arcname)
                    count += 1
            log.info("Added %d files from %s", count, rel_dir)
            total_files += count

        for rel_file in BUNDLE_FILES:
            src = FINSIGHT_ROOT / rel_file
            if not src.exists():
                log.warning("Skipping missing file: %s", src)
                continue
            zf.write(src, rel_file)
            log.info("Added file %s", rel_file)
            total_files += 1

    if total_files == 0:
        log.error("No files found to bundle - refusing to upload an empty bundle")
        return 1

    size_mb = buf.tell() / (1024 * 1024)
    log.info("Bundle built: %d files, %.1f MB compressed", total_files, size_mb)

    client = get_r2_client()
    client.put_bytes(BUNDLE_KEY, buf.getvalue(), content_type="application/zip")
    log.info("Uploaded to R2 key '%s'", BUNDLE_KEY)
    return 0


if __name__ == "__main__":
    sys.exit(main())
