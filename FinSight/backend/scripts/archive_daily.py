"""
Append-only daily archive of everything the pipeline overwrites.

Why: every daily-refresh run OVERWRITES its outputs in place -
  * bundles/static_bundle.zip  (every stock's verdict, screener, alpha
    rankings, announcements) - replaced daily
  * data/{M}/{T}/minute_1m.parquet - rebuilt on a fresh runner each day, so it
    only ever holds the last ~7 days of 1-minute bars
  * data/{M}/{T}/news.parquet      - same: only what the RSS feeds return today
  * data/{M}/{T}/financials_full.json - point-in-time fundamentals, overwritten
  * Supabase intelligence_history - pruned to weekly samples after 90 days
Nothing else keeps yesterday. This script copies each day into R2 under
archive/ and NEVER overwrites or deletes anything there.

Layout (all under archive/ in the same bucket):
  intelligence/{as_of}/{IN,US}.jsonl.gz   one line per stock = full verdict payload
  side/{as_of}/bundle_extras.zip          screener, alpha rankings, announcements,
                                          _top_opportunities etc. from that day's bundle
  minute/{M}/{YYYY-MM}/{run_date}_{HHMMSS}.parquet 1m bars newer than last archived (all tickers)
  news/{M}/{YYYY-MM}/{run_date}_{HHMMSS}.parquet news rows newer than last archived
  closes/{M}/{YYYY-MM}/{run_date}_{HHMMSS}.parquet new daily OHLCV bars (first run: full history)
  fundamentals/{run_date}/{M}.jsonl.gz     weekly full financials_full.json snapshot
  macro/{run_date}/context.json            daily macro overlay
  _state/watermarks.json                   last archived timestamp per ticker
  _state/runs.jsonl                        one line per run (audit trail)

Run: python archive_daily.py            (normal daily run)
     python archive_daily.py --backfill (also recover past days from Supabase)
Idempotent: re-running the same day writes nothing new.
"""
import argparse
import collections
import datetime as dt
import gzip
import io
import json
import logging
import os
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("archive_daily")

ROOT = "archive"
BUNDLE_KEY = "bundles/static_bundle.zip"
MARKETS = ["IN", "US"]
MAX_SIDE_BYTES = 60 * 1024 * 1024
FUNDAMENTALS_EVERY_DAYS = 7
WORKERS = 16


def _load_env_file():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def _gz_jsonl(rows):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as g:
        for r in rows:
            g.write((json.dumps(r, separators=(",", ":"), default=str) + "\n").encode("utf-8"))
    return buf.getvalue()


class Archive:
    def __init__(self, client, dry=False):
        self.c = client
        self.dry = dry
        self.existing = set(client.list_keys(ROOT + "/"))
        self.written = []

    def has(self, key):
        return f"{ROOT}/{key}" in self.existing

    def has_prefix(self, prefix):
        p = f"{ROOT}/{prefix}"
        return any(k.startswith(p) for k in self.existing)

    def put(self, key, data, content_type="application/octet-stream"):
        full = f"{ROOT}/{key}"
        if full in self.existing:  # append-only: never overwrite
            return False
        if not self.dry:
            if not self.c.put_bytes(full, data, content_type=content_type):
                raise RuntimeError("R2 safety cutoff tripped - archive write refused")
        self.existing.add(full)
        self.written.append((key, len(data)))
        log.info("archived %s (%.1f KB)", key, len(data) / 1024)
        return True

    def put_state(self, key, obj):
        # _state/ files are the only mutable objects in archive/
        full = f"{ROOT}/_state/{key}"
        if not self.dry:
            self.c.put_bytes(full, json.dumps(obj, default=str).encode("utf-8"), "application/json")

    def get_state(self, key, default):
        raw = self.c.get_bytes(f"{ROOT}/_state/{key}")
        return json.loads(raw) if raw else default


# ----------------------------------------------------------------- verdicts

def archive_bundle(a):
    raw = a.c.get_bytes(BUNDLE_KEY)
    if not raw:
        log.error("No %s in R2", BUNDLE_KEY)
        return {}
    zf = zipfile.ZipFile(io.BytesIO(raw))
    stocks = collections.defaultdict(list)
    extras = []
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        parts = Path(name).parts
        if (len(parts) == 4 and parts[:2] == ("public", "intelligence") and parts[2] in MARKETS
                and name.endswith(".json") and not parts[3].startswith("_")):
            try:
                payload = json.loads(zf.read(name))
            except Exception as e:
                log.warning("bad json %s: %s", name, e)
                continue
            if isinstance(payload, dict) and payload.get("intent"):
                payload.setdefault("ticker", Path(parts[3]).stem)
                payload.setdefault("market", parts[2])
                stocks[parts[2]].append(payload)
        else:
            extras.append(name)

    out = {}
    as_of_all = []
    for m, rows in stocks.items():
        as_of = collections.Counter(r.get("as_of_date") for r in rows).most_common(1)[0][0]
        as_of_all.append(as_of)
        a.put(f"intelligence/{as_of}/{m}.jsonl.gz", _gz_jsonl(rows), "application/gzip")
        out[m] = {"as_of": as_of, "n": len(rows)}

    if extras and as_of_all:
        as_of = max(as_of_all)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for name in extras:
                z.writestr(name, zf.read(name))
        if buf.tell() <= MAX_SIDE_BYTES:
            a.put(f"side/{as_of}/bundle_extras.zip", buf.getvalue(), "application/zip")
        else:
            log.warning("bundle extras %.1f MB > cap, skipped", buf.tell() / 1e6)
    return out


def backfill_from_supabase(a):
    """Recover every past day still held in Supabase intelligence_history."""
    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    except Exception as e:
        log.warning("Supabase unavailable, backfill skipped: %s", e)
        return {}
    dates = set()
    start = 0
    while True:
        res = sb.table("intelligence_history").select("as_of_date").order("as_of_date").range(start, start + 999).execute()
        if not res.data:
            break
        dates.update(r["as_of_date"] for r in res.data)
        start += 1000
        if len(res.data) < 1000:
            break
    recovered = {}
    for d in sorted(dates):
        for m in MARKETS:
            if a.has(f"intelligence/{d}/{m}.jsonl.gz"):
                continue
            rows, off = [], 0
            while True:
                res = (sb.table("intelligence_history").select("ticker,payload")
                       .eq("as_of_date", d).eq("market", m).range(off, off + 499).execute())
                if not res.data:
                    break
                for r in res.data:
                    p = r["payload"] or {}
                    p.setdefault("ticker", r["ticker"])
                    p.setdefault("market", m)
                    rows.append(p)
                off += 500
                if len(res.data) < 500:
                    break
            if rows:
                a.put(f"intelligence/{d}/{m}.jsonl.gz", _gz_jsonl(rows), "application/gzip")
                recovered[f"{d}/{m}"] = len(rows)
    log.info("Supabase backfill: %d market-days recovered", len(recovered))
    return recovered


# ------------------------------------------------- rolling per-ticker files

def _tickers(a):
    man = a.c.get_json("meta/tickers_manifest.json") or {}
    items = man.get("tickers", man) if isinstance(man, dict) else man
    out = []
    for t in items if isinstance(items, list) else []:
        if isinstance(t, dict) and t.get("ticker") and t.get("market"):
            out.append((t["market"], t["ticker"]))
        elif isinstance(t, str) and "/" in t:
            out.append(tuple(t.split("/", 1)))
    if not out:  # fall back to listing data/
        for k in a.c.list_keys("data/"):
            p = k.split("/")
            if len(p) == 4 and p[3] == "metadata.json":
                out.append((p[1], p[2]))
    return sorted(set(out))


def archive_rolling(a, run_date, tickers):
    import pandas as pd

    wm = a.get_state("watermarks.json", {})

    def load(mt, fname):
        m, t = mt
        raw = a.c.get_bytes(f"data/{m}/{t}/{fname}")
        if not raw:
            return None
        try:
            return pd.read_parquet(io.BytesIO(raw))
        except Exception:
            return None

    for kind, fname in (("closes", "history.parquet"), ("minute", "minute_1m.parquet"), ("news", "news.parquet")):
        by_market = collections.defaultdict(list)
        with ThreadPoolExecutor(WORKERS) as ex:
            frames = list(ex.map(lambda mt: (mt, load(mt, fname)), tickers))
        for (m, t), df in frames:
            if df is None or df.empty:
                continue
            if kind in ("minute", "closes"):
                ts = pd.to_datetime(df.index, utc=True)
                df = df.copy()
                df.index = ts
            else:
                if "timestamp" not in df.columns:
                    continue
                df = df.copy()
                ts = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
                df["timestamp"] = ts
            key = f"{kind}:{m}:{t}"
            last = pd.Timestamp(wm[key]) if key in wm else None
            new = df[ts > last] if last is not None else df
            if new.empty:
                continue
            new = new.copy()
            new.insert(0, "ticker", t)
            by_market[m].append(new)
            wm[key] = str(ts.max())
        for m, parts in by_market.items():
            out = pd.concat(parts)
            if kind == "news":
                for col in out.columns:  # parquet-safe
                    if out[col].dtype == object:
                        out[col] = out[col].astype(str)
            buf = io.BytesIO()
            out.to_parquet(buf, compression="zstd")
            stamp = dt.datetime.now(dt.timezone.utc).strftime("%H%M%S")
            a.put(f"{kind}/{m}/{run_date[:7]}/{run_date}_{stamp}.parquet", buf.getvalue())
    a.put_state("watermarks.json", wm)


def archive_fundamentals(a, run_date, tickers):
    prior = sorted(k.split("/")[2] for k in a.existing if k.startswith(f"{ROOT}/fundamentals/"))
    if prior:
        last = dt.date.fromisoformat(prior[-1])
        if (dt.date.fromisoformat(run_date) - last).days < FUNDAMENTALS_EVERY_DAYS:
            return
    by_market = collections.defaultdict(list)

    def load(mt):
        m, t = mt
        try:
            return m, t, a.c.get_json(f"data/{m}/{t}/financials_full.json")
        except Exception:
            return m, t, None

    with ThreadPoolExecutor(WORKERS) as ex:
        for m, t, j in ex.map(load, tickers):
            if j:
                by_market[m].append({"ticker": t, "market": m, "financials": j})
    for m, rows in by_market.items():
        a.put(f"fundamentals/{run_date}/{m}.jsonl.gz", _gz_jsonl(rows), "application/gzip")


def archive_macro(a, run_date):
    for src in ("macro/context.json", "macro/map_points.json"):
        raw = a.c.get_bytes(src)
        if raw:
            a.put(f"macro/{run_date}/{Path(src).name}", raw, "application/json")


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="recover past days from Supabase")
    ap.add_argument("--skip-rolling", action="store_true", help="verdicts only (fast)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    _load_env_file()
    from app.storage.r2_client import get_r2_client

    a = Archive(get_r2_client(), dry=args.dry_run)
    run_date = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date().isoformat()
    summary = {"run_at_ist": dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).isoformat(timespec="seconds"),
               "run_date": run_date}

    summary["verdicts"] = archive_bundle(a)
    if args.backfill or not a.has_prefix("intelligence/"):
        summary["backfill"] = backfill_from_supabase(a)
    if not args.skip_rolling:
        tickers = _tickers(a)
        summary["tickers"] = len(tickers)
        archive_rolling(a, run_date, tickers)
        archive_fundamentals(a, run_date, tickers)
        archive_macro(a, run_date)

    summary["written"] = len(a.written)
    summary["bytes"] = sum(n for _, n in a.written)
    days = sorted({k.split("/")[2] for k in a.existing if k.startswith(f"{ROOT}/intelligence/")})
    summary["verdict_days_total"] = len(days)
    summary["verdict_days_range"] = [days[0], days[-1]] if days else None
    # append to audit log (read-modify-write of a small file)
    prev = a.c.get_bytes(f"{ROOT}/_state/runs.jsonl") or b""
    if not args.dry_run:
        a.c.put_bytes(f"{ROOT}/_state/runs.jsonl", prev + (json.dumps(summary) + "\n").encode(), "application/json")
    log.info("SUMMARY %s", json.dumps(summary))
    if not summary["verdicts"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
