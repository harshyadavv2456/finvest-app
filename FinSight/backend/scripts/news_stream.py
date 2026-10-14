"""5-minute market-news stream -> R2.

Every run polls a set of public finance RSS/Atom feeds, de-duplicates against a rolling seen-set kept in R2,
and writes ONLY the new items as one gzip JSONL object:

    news_stream/{YYYY-MM-DD}/{HHMMSS}.jsonl.gz      (HHMMSS = UTC time this run detected the items)
    news_stream/_state/seen.json.gz                 {item_hash: first_seen_epoch}, pruned after 10 days

Each line: {id, first_seen_utc, published_utc, source, feed, title, summary, link, region}
`first_seen_utc` is when WE saw it (<=5 min resolution) - the authoritative timing for market-reaction studies;
`published_utc` is the publisher's own timestamp when the feed provides one.

Append-only: objects under news_stream/{date}/ are never rewritten or deleted.
Env: R2_ENDPOINT_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.   Flags: --dry-run
"""
import calendar, datetime as dt, gzip, hashlib, io, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor

import boto3
import feedparser
import requests
from botocore.config import Config

FEEDS = {
    # (feed_name): (region, url)
    "cnbc_top": ("US", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    "cnbc_markets": ("US", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    "cnbc_finance": ("US", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    "cnbc_earnings": ("US", "https://www.cnbc.com/id/15839135/device/rss/rss.html"),
    "marketwatch_top": ("US", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    "wsj_markets": ("US", "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"),
    "sec_8k": ("US", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=40&output=atom"),
    "seekingalpha": ("US", "https://seekingalpha.com/market_currents.xml"),
    "investing": ("GLOBAL", "https://www.investing.com/rss/news.rss"),
    "et_markets": ("IN", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    "et_stocks": ("IN", "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"),
    "mint_markets": ("IN", "https://www.livemint.com/rss/markets"),
    "hindu_bl": ("IN", "https://www.thehindubusinessline.com/markets/feeder/default.rss"),
    "nikkei_asia": ("JP", "https://asia.nikkei.com/rss/feed/nar"),
    "scmp_business": ("HK", "https://www.scmp.com/rss/92/feed"),
    "abc_business": ("AU", "https://www.abc.net.au/news/feed/51120/rss.xml"),
    "straits_business": ("SG", "https://www.straitstimes.com/news/business/rss.xml"),
    "bbc_business": ("UK", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    "guardian_business": ("UK", "https://www.theguardian.com/uk/business/rss"),
    "gn_reuters": ("GLOBAL", "https://news.google.com/rss/search?q=site:reuters.com+markets+when:1d&hl=en-US&gl=US&ceid=US:en"),
    "gn_us": ("US", "https://news.google.com/rss/search?q=Wall+Street+stocks+when:1d&hl=en-US&gl=US&ceid=US:en"),
    "gn_in": ("IN", "https://news.google.com/rss/search?q=Nifty+Sensex+when:1d&hl=en-IN&gl=IN&ceid=IN:en"),
    "gn_hk": ("HK", "https://news.google.com/rss/search?q=Hang+Seng+when:1d&hl=en-US&gl=US&ceid=US:en"),
    "gn_cn": ("CN", "https://news.google.com/rss/search?q=China+stocks+Shanghai+Composite+when:1d&hl=en-US&gl=US&ceid=US:en"),
    "gn_jp": ("JP", "https://news.google.com/rss/search?q=Nikkei+225+when:1d&hl=en-US&gl=US&ceid=US:en"),
    "gn_uk": ("UK", "https://news.google.com/rss/search?q=FTSE+100+when:1d&hl=en-GB&gl=GB&ceid=GB:en"),
    "gn_au": ("AU", "https://news.google.com/rss/search?q=ASX+200+when:1d&hl=en-AU&gl=AU&ceid=AU:en"),
    "gn_sg": ("SG", "https://news.google.com/rss/search?q=Straits+Times+Index+when:1d&hl=en-SG&gl=SG&ceid=SG:en"),
    "gn_macro": ("GLOBAL", "https://news.google.com/rss/search?q=Federal+Reserve+OR+RBI+OR+ECB+when:1d&hl=en-US&gl=US&ceid=US:en"),
}
UA = {"User-Agent": "Mozilla/5.0 (compatible; FinVestNews/1.0; +https://finvest.fintaxlife.com)"}
STATE_KEY = "news_stream/_state/seen.json.gz"
KEEP_SECONDS = 10 * 86400


def fetch(item):
    name, (region, url) = item
    try:
        r = requests.get(url, headers=UA, timeout=15)
        r.raise_for_status()
        entries = feedparser.parse(r.content).entries
    except Exception as e:
        print(f"::warning::feed {name} failed: {str(e)[:100]}")
        return name, region, []
    return name, region, entries


def entry_time(e):
    for k in ("published_parsed", "updated_parsed"):
        t = e.get(k)
        if t:
            return dt.datetime.fromtimestamp(calendar.timegm(t), dt.timezone.utc).isoformat()
    return None


def main(dry=False):
    now = time.time()
    run_dt = dt.datetime.fromtimestamp(now, dt.timezone.utc)
    s3 = bucket = None
    if not dry:
        s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT_URL"], region_name="auto",
                          aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                          aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                          config=Config(retries={"max_attempts": 5, "mode": "adaptive"}))
        bucket = os.environ["R2_BUCKET_NAME"]
    seen = {}
    if s3:
        try:
            seen = json.loads(gzip.decompress(s3.get_object(Bucket=bucket, Key=STATE_KEY)["Body"].read()))
        except s3.exceptions.NoSuchKey:
            seen = {}
    with ThreadPoolExecutor(12) as ex:
        results = list(ex.map(fetch, FEEDS.items()))

    new, ok = [], 0
    for name, region, entries in results:
        ok += bool(entries)
        for e in entries:
            title = (e.get("title") or "").strip()
            link = e.get("link") or ""
            if not title:
                continue
            h = hashlib.sha1(f"{link}|{title}".encode()).hexdigest()[:20]
            if h in seen:
                continue
            seen[h] = now
            new.append(dict(id=h, first_seen_utc=run_dt.isoformat(), published_utc=entry_time(e), feed=name, region=region,
                            title=title, summary=(e.get("summary") or "")[:600], link=link))
    print(f"feeds ok {ok}/{len(FEEDS)}; new items {len(new)}")
    if dry:
        for n in new[:8]:
            print(n["feed"], "|", n["published_utc"], "|", n["title"][:90])
        return
    if ok == 0:
        sys.exit("no feed returned entries")
    if new:
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as g:
            g.write("\n".join(json.dumps(n, ensure_ascii=False) for n in new).encode())
        key = f"news_stream/{run_dt:%Y-%m-%d}/{run_dt:%H%M%S}.jsonl.gz"
        s3.put_object(Bucket=bucket, Key=key, Body=buf.getvalue(), ContentType="application/gzip")
        print("wrote", key)
    seen = {k: v for k, v in seen.items() if now - v < KEEP_SECONDS}
    s3.put_object(Bucket=bucket, Key=STATE_KEY, Body=gzip.compress(json.dumps(seen).encode()))


def loop(minutes, every=300):
    """Poll every `every` seconds for `minutes` minutes (one long GitHub job). Cadence no longer depends on GitHub's unreliable cron."""
    end = time.time() + minutes * 60; n = 0
    while time.time() < end:
        t0 = time.time()
        try:
            main(False)
        except SystemExit as e:
            print("::warning::cycle skipped:", e)
        except Exception as e:
            print("::warning::cycle failed:", str(e)[:150])
        n += 1
        time.sleep(max(1, every - (time.time() - t0)))
    print(f"loop finished after {n} cycles")


if __name__ == "__main__":
    if "--loop" in sys.argv:
        loop(float(sys.argv[sys.argv.index("--loop") + 1]) if len(sys.argv) > sys.argv.index("--loop") + 1 else 345)
    else:
        main(dry="--dry-run" in sys.argv)
