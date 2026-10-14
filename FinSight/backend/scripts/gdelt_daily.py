"""GDELT 1.0 daily event files -> small daily aggregates in R2  macro/gdelt_daily.parquet

One row per (date, scope): scope is GLOBAL or a FIPS country code of the event location (US, CH, RS, IN, IS, IR, UP, TW, SA, JA, UK).
Columns: n_events, mentions, conflict_mentions (CAMEO root 14-20), violent_mentions (18-20), coop_mentions (root 03-06), tone (mention-weighted avg tone), goldstein (mention-weighted).
`date` is the GDELT file date (events added that day), published the next morning; consumers must treat it as available from date+1.
Raw files are streamed and discarded. Resumable: fetches at most --max-days missing days per run (oldest first), so the backfill finishes over a few runs.
Env: R2_ENDPOINT_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.   Flags: --start YYYY-MM-DD  --max-days N  --dry-run
"""
import argparse, datetime as dt, io, os, sys, time, zipfile
import pandas as pd
import requests

COUNTRIES = ["US", "CH", "RS", "IN", "IS", "IR", "UP", "TW", "SA", "JA", "UK"]
COLS = {1: "sqldate", 28: "root", 30: "gold", 31: "mentions", 34: "tone", 51: "geo"}
KEY = "macro/gdelt_daily.parquet"


def day_agg(d):
    url = f"http://data.gdeltproject.org/events/{d:%Y%m%d}.export.CSV.zip"
    for i in range(4):
        try:
            r = requests.get(url, timeout=120)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            break
        except Exception:
            if i == 3:
                return None
            time.sleep(5 * (i + 1))
    z = zipfile.ZipFile(io.BytesIO(r.content))
    df = pd.read_csv(z.open(z.namelist()[0]), sep="\t", header=None, usecols=list(COLS), names=None, dtype=str, on_bad_lines="skip")
    df.columns = [COLS[c] for c in sorted(COLS)]
    for c in ("root", "gold", "mentions", "tone"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["root", "mentions"])
    df["w"] = df["mentions"].clip(lower=1)
    df["conf"] = df["root"].between(14, 20) * df["w"]
    df["viol"] = df["root"].between(18, 20) * df["w"]
    df["coop"] = df["root"].between(3, 6) * df["w"]
    df["tw"] = df["tone"].fillna(0) * df["w"]; df["gw"] = df["gold"].fillna(0) * df["w"]
    rows = []
    for scope, g in [("GLOBAL", df)] + [(c, df[df["geo"] == c]) for c in COUNTRIES]:
        if len(g) == 0:
            continue
        w = g["w"].sum()
        rows.append(dict(date=pd.Timestamp(d), scope=scope, n_events=len(g), mentions=float(w), conflict_mentions=float(g["conf"].sum()), violent_mentions=float(g["viol"].sum()),
                         coop_mentions=float(g["coop"].sum()), tone=float(g["tw"].sum() / w), goldstein=float(g["gw"].sum() / w)))
    return rows


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--start", default="2016-01-01"); ap.add_argument("--max-days", type=int, default=1200); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    import boto3
    s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT_URL"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")
    bucket = os.environ["R2_BUCKET_NAME"]
    try:
        old = pd.read_parquet(io.BytesIO(s3.get_object(Bucket=bucket, Key=KEY)["Body"].read()))
    except Exception:
        old = pd.DataFrame()
    have = set(pd.to_datetime(old["date"]).dt.date) if len(old) else set()
    yday = dt.date.today() - dt.timedelta(days=1)
    todo, d = [], dt.date.fromisoformat(a.start)
    while d <= yday:
        if d not in have:
            todo.append(d)
        d += dt.timedelta(days=1)
    todo = todo[:a.max_days]
    print(f"[gdelt] have {len(have)} days, fetching {len(todo)}", flush=True)
    new, miss, t0 = [], 0, time.time()
    for i, d in enumerate(todo):
        if time.time() - t0 > 5 * 3600:
            print("[gdelt] time budget reached; will resume next run"); break
        rows = day_agg(d)
        if rows:
            new += rows
        else:
            miss += 1
        if (i + 1) % 100 == 0:
            print(f"[gdelt] {i + 1}/{len(todo)} (missing files so far: {miss})", flush=True)
    if not new:
        print("[gdelt] nothing new"); return
    out = pd.concat([old, pd.DataFrame(new)], ignore_index=True).drop_duplicates(["date", "scope"]).sort_values(["date", "scope"])
    print(f"[gdelt] total rows {len(out):,}, days {out['date'].nunique()}, range {out['date'].min().date()}..{out['date'].max().date()}")
    if a.dry_run:
        return
    buf = io.BytesIO(); out.to_parquet(buf, index=False, compression="zstd")
    s3.put_object(Bucket=bucket, Key=KEY, Body=buf.getvalue())
    print(f"[gdelt] uploaded {len(buf.getvalue()) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
