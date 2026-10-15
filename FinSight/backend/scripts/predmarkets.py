"""Prediction-market probabilities (Polymarket, Kalshi) -> macro/predmarkets_daily.parquet in R2.
Polymarket: top active markets by volume plus their daily price history (backfill). Kalshi: daily snapshot of open markets (last price as probability).
Rows: date, source, market_id, question, prob, volume. Public endpoints, no keys. Idempotent: merges with the existing object and keeps the latest value per (date, source, id)."""
import io, os, sys, time, json
from datetime import datetime, timezone

import boto3, pandas as pd, requests

KEY = "macro/predmarkets_daily.parquet"
GAMMA, CLOB, KALSHI = "https://gamma-api.polymarket.com", "https://clob.polymarket.com", "https://api.elections.kalshi.com/trade-api/v2"
TOP = int(os.environ.get("PM_TOP", "300"))


def s3():
    return boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT_URL"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")


def get(url, **kw):
    for k in range(3):
        try:
            r = requests.get(url, timeout=30, **kw)
            if r.status_code == 200: return r.json()
            print("HTTP", r.status_code, url[:90], file=sys.stderr)
        except Exception as e:
            print("ERR", repr(e)[:100], url[:90], file=sys.stderr)
        time.sleep(2 * (k + 1))
    return None


def polymarket():
    rows, today = [], datetime.now(timezone.utc).date()
    ms = []
    for closed in ("false", "true"):                       # live markets plus resolved high-volume ones (long history for backfill)
        for off in range(0, TOP, 100):
            j = get(f"{GAMMA}/markets", params=dict(limit=100, offset=off, closed=closed, order="volumeNum", ascending="false"))
            if not j: break
            ms += j
    print("polymarket markets", len(ms))
    for m in ms:
        try:
            toks = json.loads(m["clobTokenIds"]) if isinstance(m.get("clobTokenIds"), str) else m.get("clobTokenIds")
            q, vol, mid = m.get("question"), float(m.get("volume") or 0), "pm" + str(m["id"])
            p = json.loads(m["outcomePrices"]) if isinstance(m.get("outcomePrices"), str) else m.get("outcomePrices")
            if p and not m.get("closed"): rows.append(dict(date=pd.Timestamp(today), source="polymarket", market_id=mid, question=q, prob=float(p[0]), volume=vol))
            if toks:
                h = get(f"{CLOB}/prices-history", params=dict(market=toks[0], interval="max", fidelity=1440))
                for pt in (h or {}).get("history", []):
                    rows.append(dict(date=pd.Timestamp(datetime.fromtimestamp(pt["t"], timezone.utc).date()), source="polymarket", market_id=mid, question=q, prob=float(pt["p"]), volume=vol))
        except Exception as e:
            print("skip", repr(e)[:80], file=sys.stderr)
    return rows


def kalshi():
    rows, cur, today = [], None, pd.Timestamp(datetime.now(timezone.utc).date())
    for _ in range(10):
        j = get(f"{KALSHI}/markets", params=dict(limit=1000, status="open", **({"cursor": cur} if cur else {})))
        if not j: break
        for m in j.get("markets", []):
            if float(m.get("volume") or 0) < 20000 or "MVE" in m["ticker"] or "CROSSCATEGORY" in m["ticker"]: continue          # skip thin and multi-leg parlay markets
            p = m.get("last_price_dollars") if m.get("last_price_dollars") is not None else (m.get("last_price") or 0) / 100
            try: rows.append(dict(date=today, source="kalshi", market_id=m["ticker"], question=m.get("title"), prob=float(p), volume=float(m.get("volume") or 0)))
            except Exception: pass
        cur = j.get("cursor")
        if not cur: break
    print("kalshi rows", len(rows))
    return rows


def main():
    new = pd.DataFrame(polymarket() + kalshi())
    if new.empty:
        print("no rows fetched"); sys.exit(1)
    c = s3(); bucket = os.environ["R2_BUCKET_NAME"]
    try:
        old = pd.read_parquet(io.BytesIO(c.get_object(Bucket=bucket, Key=KEY)["Body"].read()))
    except Exception:
        old = pd.DataFrame(columns=new.columns)
    d = pd.concat([old, new], ignore_index=True)
    d["date"] = pd.to_datetime(d["date"]); d = d.drop_duplicates(["date", "source", "market_id"], keep="last").sort_values(["date", "source", "market_id"])
    buf = io.BytesIO(); d.to_parquet(buf, index=False); c.put_object(Bucket=bucket, Key=KEY, Body=buf.getvalue())
    print("rows", len(d), "dates", d.date.min().date(), d.date.max().date(), "markets", d.market_id.nunique())


if __name__ == "__main__":
    main()
