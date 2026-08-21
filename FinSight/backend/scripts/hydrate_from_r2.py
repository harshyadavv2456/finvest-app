#!/usr/bin/env python3
"""
Companion to upload_static_bundle_to_r2.py - run this at build/deploy time
(see the Render build command) to pull the small aggregate JSON bundle
(FinSight/public/intelligence/, FinSight/data/alpha_tracking/) back onto
local disk before the app starts. Without this, Market Intel, Alpha
Rankings, top-opportunities, and IntrinsIQ come up empty on every fresh
Render deploy, since those directories are gitignored and only live in R2.

Safe to run repeatedly (build step runs on every deploy) - just
overwrites with whatever's currently in R2. If R2 isn't configured
(e.g. local dev) or the bundle doesn't exist yet, this is a no-op, not a
build failure - local dev without R2 creds works exactly as before.

Usage:
    python hydrate_from_r2.py
"""
import io
import logging
import os
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("hydrate_from_r2")

FINSIGHT_ROOT = Path(__file__).resolve().parent.parent.parent  # FinSight/backend/scripts -> FinSight
BUNDLE_KEY = "bundles/static_bundle.zip"


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
    if not os.environ.get("R2_ACCESS_KEY_ID"):
        log.info("R2 not configured - skipping hydration (local dev, presumably data/ is populated already)")
        return 0

    from app.storage.r2_client import get_r2_client

    client = get_r2_client()
    raw = client.get_bytes(BUNDLE_KEY)
    if raw is None:
        log.warning("No bundle found at R2 key '%s' - nothing to hydrate yet (run upload_static_bundle_to_r2.py first)", BUNDLE_KEY)
        return 0

    extracted = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        for member in zf.namelist():
            if member.endswith("/"):
                continue
            target = FINSIGHT_ROOT / member
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(target, "wb") as dst:
                dst.write(src.read())
            extracted += 1

    log.info("Hydrated %d files from R2 bundle into %s", extracted, FINSIGHT_ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
