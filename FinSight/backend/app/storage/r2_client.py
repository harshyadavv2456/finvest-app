"""
Cloudflare R2 storage client.

Replaces `FinSight/data/` and `FinSight/public/` as the home for per-ticker
market data and intelligence snapshots — see REPO_AUDIT_REPORT.md §6/§7.

CRITICAL DESIGN RULE, do not violate this:
    Every object here is written to a STABLE key (current/latest state only)
    and OVERWRITTEN in place on each refresh. Nothing is ever written to a
    date-stamped key (e.g. "2026-08-20/AAPL.json").

    This is not a style preference — it's what keeps this bucket flat at
    ~5-7GB forever instead of growing daily forever, which is the exact
    failure mode that put 152,861 dead files into git in the first place
    (FinSight/public/intelligence/history/). R2's free tier is 10GB; unlike
    Supabase, going over it auto-charges the card on file with no warning
    gate. Bounded, overwrite-in-place storage is a hard financial
    requirement here, not just tidiness.

    Bounded history (if ever needed) belongs in Supabase Postgres with an
    explicit retention policy — see supabase_client.py — never in R2 as
    per-day objects.

Key scheme:
    data/{market}/{ticker}/{filename}            e.g. data/US/AAPL/history.parquet
    intelligence/{market}/{ticker}.json           e.g. intelligence/US/AAPL.json
"""
import io
import json
import logging
import os
from pathlib import Path
from typing import Optional

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)


def _env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"Missing required env var {name}. Set it in FinSight/backend/.env "
            f"(see .env.example) — never hardcode R2 credentials in source."
        )
    return val


class R2Client:
    """Thin wrapper around boto3's S3-compatible client, pointed at R2."""

    def __init__(self):
        self.bucket = _env("R2_BUCKET_NAME")
        self._s3 = boto3.client(
            "s3",
            endpoint_url=_env("R2_ENDPOINT_URL"),
            aws_access_key_id=_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=_env("R2_SECRET_ACCESS_KEY"),
            # THE root cause of three separate backend-wide hangs tonight,
            # found in production logs: no connect_timeout/read_timeout
            # here meant boto3's defaults applied - 60s connect + 60s read,
            # x3 retries ("standard" mode retries on timeouts too) = a
            # single slow/stuck R2 call could block a thread for 6+
            # minutes. The self-heal path in utils/paths.py fetches up to
            # 6 files per ticker from a ThreadPoolExecutor(max_workers=8);
            # with the full ~2300-ticker universe and no per-call timeout,
            # one bad R2 response was enough to stall the whole pool far
            # past the caller's intended 45s cap (confirmed live: still
            # running after 84s+ on a fresh restart, walking tickers
            # alphabetically from ADANIGREEN with no end in sight).
            # 5s/10s here means a stuck call fails fast and the caller's
            # own timeout logic actually gets to run.
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 2, "mode": "standard"},
                connect_timeout=5,
                read_timeout=10,
            ),
            region_name="auto",
        )

    # ---------------------------------------------------------------- writes

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        """Overwrite the object at `key` with `data`. No versioning, no history."""
        self._s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        logger.debug("R2 put_object: %s (%d bytes)", key, len(data))

    def put_json(self, key: str, obj: dict) -> None:
        self.put_bytes(key, json.dumps(obj, default=str).encode("utf-8"), content_type="application/json")

    def put_file(self, key: str, local_path: Path) -> None:
        """Upload a local file's current contents, overwriting the R2 key."""
        with open(local_path, "rb") as f:
            self._s3.upload_fileobj(f, self.bucket, key)
        logger.debug("R2 put_file: %s <- %s", key, local_path)

    # ----------------------------------------------------------------- reads

    def get_bytes(self, key: str) -> Optional[bytes]:
        try:
            resp = self._s3.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"].read()
        except self._s3.exceptions.NoSuchKey:
            return None
        except Exception as e:  # noqa: BLE001 - surfaced to caller as a miss
            if "NoSuchKey" in str(e) or "404" in str(e):
                return None
            raise

    def get_json(self, key: str) -> Optional[dict]:
        raw = self.get_bytes(key)
        return json.loads(raw) if raw is not None else None

    def download_to_file(self, key: str, local_path: Path) -> bool:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._s3.download_file(self.bucket, key, str(local_path))
            return True
        except Exception as e:  # noqa: BLE001
            if "404" in str(e) or "NoSuchKey" in str(e):
                return False
            raise

    # --------------------------------------------------------------- listing

    def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        paginator = self._s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    # ------------------------------------------------------------- bucket size (sanity check)

    def approx_bucket_size_bytes(self, prefix: str = "") -> int:
        """Rough total size — call occasionally (e.g. end of daily refresh) to
        sanity-check we're staying well under the 10GB free-tier cap, since
        going over auto-charges with no warning (see module docstring)."""
        total = 0
        paginator = self._s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                total += obj.get("Size", 0)
        return total


# Convenience helpers matching the two key namespaces used by the pipeline

def ticker_data_key(market: str, ticker: str, filename: str) -> str:
    return f"data/{market}/{ticker}/{filename}"


def intelligence_key(market: str, ticker: str) -> str:
    return f"intelligence/{market}/{ticker}.json"


_client: Optional[R2Client] = None


def get_r2_client() -> R2Client:
    global _client
    if _client is None:
        _client = R2Client()
    return _client
