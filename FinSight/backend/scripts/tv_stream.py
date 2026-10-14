"""Live finance-TV transcription -> topic-tagged text in R2 (PRIVATE bucket).

Captures the audio of public finance live streams, transcribes it on the runner (faster-whisper, CPU), tags each chunk
by topic and appends the chunks that carry any market/macro/geopolitical/company signal as gzip JSONL:

    tv_stream/{YYYY-MM-DD}/{HHMMSS}.jsonl.gz     lines: {stream, ts_utc, topics, text}

Machine speech-to-text: may contain errors, not verified news. Transcript text stays in the private bucket and is used only as
model input; it is not published to any website verbatim. Nothing is printed to the (public) Actions log except counts.
Env: R2_ENDPOINT_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.   Flags: --loop MINUTES  --dry-run
"""
import argparse, datetime as dt, gzip, io, json, os, queue, re, subprocess, sys, tempfile, threading, time
from pathlib import Path

STREAMS = {"Bloomberg TV": "https://www.youtube.com/@markets/live", "Yahoo Finance": "https://www.youtube.com/@YahooFinance/live",
           "ET Now": "https://www.youtube.com/@ETNow/live", "CNBC TV18": "https://www.youtube.com/@CNBCTV18/live",
           "CNBC Television": "https://www.youtube.com/@CNBCtelevision/live", "Reuters": "https://www.youtube.com/@Reuters/live"}
CHUNK = 60
FLUSH_EVERY = 300
MIN_WORDS = 20
HALLUCINATIONS = ("thanks for watching", "thank you for watching", "subscribe", "like and subscribe", "amara.org", "subtitles by")

TOPICS = {
    "geopolitics": r"\b(wars?|warfare|ceasefires?|sanctions?|sanctioned|tariffs?|missiles?|invasion|invaded|nato|russia\w*|ukrain\w*|israel\w*|gaza|iran\w*|hezbollah|taiwan|embargo\w*|coups?|treaty|geopolitic\w*|military|troops|airstrikes?|nuclear|summit|elections?)\b",
    "inflation": r"\b(inflation|cpi|ppi|price pressures?|core prices|disinflation|deflation|wage growth)\b",
    "rates": r"\b(fed|federal reserve|fomc|rate (cut|hike|decision)s?|interest rates?|rbi|repo rate|ecb|bank of (japan|england)|powell|yields?|treasur(y|ies)|bond market)\b",
    "energy": r"\b(oil|crude|brent|wti|opec|natural gas|lng|refiner\w*|energy prices?)\b",
    "commodities": r"\b(gold|silver|copper|iron ore|commodit\w+|wheat|palm oil)\b",
    "fx": r"\b(dollar|rupee|yen|yuan|euro|currency|forex|dxy)\b",
    "earnings": r"\b(earnings|quarterly results|q[1-4] results|profits?|revenues?|guidance|margins?|eps|beat estimates|missed estimates)\b",
    "india": r"\b(nifty|sensex|bank nifty|india|indian|dalal street|fiis?|diis?|sebi|nse|bse)\b",
    "us_markets": r"\b(s&p|dow|nasdaq|wall street|magnificent seven)\b",
    "policy": r"\b(budget|stimulus|regulation|antitrust|subsidy|gst|tax (cut|hike)|fiscal)\b",
    "risk": r"\b(crash|selloff|sell-off|plunge|surge|rally|record high|volatility|vix|recession|default|bankruptcy)\b",
    "tech_ai": r"\b(artificial intelligence|ai|chips?|semiconductors?|nvidia|openai|data centers?|cloud|software|cyber\w*)\b",
    "crypto": r"\b(bitcoin|crypto\w*|ethereum|stablecoins?|etf inflows?)\b",
    "banking_credit": r"\b(banks?|lenders?|credit|loans?|npas?|liquidity|private credit|mortgage\w*)\b",
    "health_pharma": r"\b(pharma\w*|drugmakers?|fda|vaccines?|biotech|hospitals?|clinical trials?)\b",
    "autos_industry": r"\b(autos?|ev|electric vehicles?|steel|cement|manufacturing|supply chain|shipping|freight|ports?)\b",
    "consumer_property": r"\b(consumer|retail\w*|housing|real estate|property|demand|spending)\b",
    "jobs": r"\b(jobs report|payrolls?|unemployment|layoffs?|hiring|labor market)\b",
    "corporate_actions": r"\b(dividends?|buybacks?|stock split|bonus shares?|merger|acquisition|takeover|ipo|stake sale|block deal)\b",
    "climate_weather": r"\b(monsoon|el nino|hurricane|drought|heatwave|floods?|climate)\b",
}
RX = {k: re.compile(v, re.I) for k, v in TOPICS.items()}


def clean(text):
    t = re.sub(r"\s+", " ", text).strip()
    if len(t.split()) < 6:
        return ""
    low = t.lower()
    if any(h in low for h in HALLUCINATIONS) and len(t.split()) < 25:
        return ""
    w = low.split()
    if len(set(w)) / len(w) < 0.35:
        return ""
    return t


def audio_url(page):
    import yt_dlp
    with yt_dlp.YoutubeDL(dict(quiet=True, no_warnings=True, skip_download=True, socket_timeout=20)) as y:
        info = y.extract_info(page, download=False)
    if not info.get("is_live"):
        raise RuntimeError("not live")
    fm = [f for f in info["formats"] if f.get("vcodec") == "none" or f.get("resolution") == "audio only"] or info["formats"]
    return fm[0]["url"]


def capture_loop(name, page, q, stop, stats, work):
    state, fails = {}, 0
    slug = re.sub(r"[^A-Za-z0-9]", "_", name)
    while not stop.is_set():
        try:
            if time.time() - state.get("t", 0) > 20 * 60 or "url" not in state:
                state["url"], state["t"] = audio_url(page), time.time()
            wav = work / f"{slug}_{int(time.time())}.wav"
            start = dt.datetime.now(dt.timezone.utc)
            r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", state["url"], "-t", str(CHUNK), "-ac", "1", "-ar", "16000", str(wav)],
                               capture_output=True, timeout=CHUNK + 60)
            if r.returncode or not wav.exists() or wav.stat().st_size < 50_000:
                state.pop("url", None); raise RuntimeError("capture failed")
            q.put((name, wav, start)); fails = 0; stats["captured"] += 1
        except Exception as e:
            fails += 1; stats["errors"][name] = f"{type(e).__name__}: {str(e)[:90]}"
            stop.wait(min(600, 30 * fails))            # back off when a stream is offline / blocked


def flush(buf, dry):
    if not buf:
        return 0
    body = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in buf).encode()
    if dry:
        return len(buf)
    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT_URL"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto", config=Config(retries={"max_attempts": 5, "mode": "adaptive"}))
    now = dt.datetime.now(dt.timezone.utc)
    s3.put_object(Bucket=os.environ["R2_BUCKET_NAME"], Key=f"tv_stream/{now:%Y-%m-%d}/{now:%H%M%S}.jsonl.gz", Body=gzip.compress(body),
                  ContentType="application/gzip", CacheControl="private, no-store")
    return len(buf)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--loop", type=float, default=5); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=max(2, os.cpu_count() or 2))
    work = Path(tempfile.mkdtemp(prefix="tv_")); q, stop = queue.Queue(), threading.Event()
    stats = dict(captured=0, transcribed=0, kept=0, flushed=0, errors={})
    for n, p in STREAMS.items():
        threading.Thread(target=capture_loop, args=(n, p, q, stop, stats, work), daemon=True).start()
    end, last_flush, buf = time.time() + a.loop * 60, time.time(), []
    while time.time() < end:
        try:
            name, wav, start = q.get(timeout=20)
        except queue.Empty:
            name = None
        if name:
            try:
                segs, _ = model.transcribe(str(wav), language="en", beam_size=1, vad_filter=True, condition_on_previous_text=False)
                text = clean(" ".join(s.text for s in segs)); stats["transcribed"] += 1
                if len(text.split()) >= MIN_WORDS:
                    tg = [k for k, rx in RX.items() if rx.search(text)]
                    if tg:
                        buf.append(dict(stream=name, ts_utc=start.isoformat(timespec="seconds"), topics=tg, text=text)); stats["kept"] += 1
            finally:
                wav.unlink(missing_ok=True)
        if time.time() - last_flush >= FLUSH_EVERY:
            try:
                stats["flushed"] += flush(buf, a.dry_run); buf = []
            except Exception as e:
                print("flush failed (will retry):", str(e)[:120])
            last_flush = time.time()
            print(f"[tv_stream] captured={stats['captured']} transcribed={stats['transcribed']} kept={stats['kept']} flushed={stats['flushed']} errors={stats['errors']}", flush=True)
    stop.set()
    try:
        stats["flushed"] += flush(buf, a.dry_run)
    except Exception as e:
        print("final flush failed:", str(e)[:120])
    print(f"[tv_stream] done {json.dumps(stats)}")


if __name__ == "__main__":
    main()
