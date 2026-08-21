import os
import json
import re
import time
import hashlib
import feedparser
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from bs4 import BeautifulSoup
from groq import Groq

# ===================== CONFIG =====================

BASE_DIR = os.getcwd()
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "finax_feed.json")
GROQ_KEY_FILE = os.path.join(BASE_DIR, "groq_key.txt")

LOOKBACK_DAYS = 3
SIM_THRESHOLD = 0.85
MIN_CHARS = 90

MODEL = "llama-3.1-8b-instant"

RSS_FEEDS = {
    "et_markets": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "business_standard": "https://www.business-standard.com/rss/markets-106.rss",
    "inc42": "https://inc42.com/feed/",
    "yourstory": "https://yourstory.com/feed",
    "et_startups": "https://economictimes.indiatimes.com/small-biz/rssfeeds/5575607.cms",
    "pib": "https://pib.gov.in/rssfeed.aspx"
}

# ===================== SETUP =====================

def setup():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)

def load_existing():
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_existing(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ===================== TEXT UTILITIES =====================

def clean_text(text):
    text = BeautifulSoup(text, "html.parser").get_text(" ")
    return re.sub(r"\s+", " ", text).strip()

def is_broker_call(text):
    t = text.lower()
    return any(k in t for k in [
        "target price", "buy rating", "sell rating", "downgraded",
        "brokerage", "nuvama", "icici securities", "emkay",
        "motilal", "jefferies", "axis securities", "technical call"
    ])

# ===================== CLASSIFICATION =====================

def classify(text):
    t = text.lower()

    if any(k in t for k in ["sebi", "rbi", "penalty", "ban", "fraud", "barred"]):
        return "REGULATORY_ACTION"

    if any(k in t for k in ["merger", "acquisition", "stake", "buyout", "settlement"]):
        return "CORPORATE_ACTION"

    if any(k in t for k in ["startup", "funding", "raised", "ipo", "drhp", "resigned"]):
        return "STARTUP_FUNDING"

    if any(k in t for k in ["profit", "loss", "revenue", "earnings", "fy", "q1", "q2", "q3", "q4"]):
        return "EARNINGS"

    if any(k in t for k in ["gdp", "inflation", "interest rate", "rupee", "bond", "yield"]):
        return "MACRO"

    return "IGNORE"

# ===================== HARD QUALITY GATES =====================

def quality_gate(text):
    t = text.lower()

    if len(text) < MIN_CHARS:
        return False

    if is_broker_call(text):
        return False

    if any(x in t for x in [
        "no factual", "no financial", "not mentioned",
        "there is no", "this article", "the provided text"
    ]):
        return False

    if any(x in t for x in [
        "may", "could", "should", "likely",
        "outlook", "journey", "story", "analysis", "review"
    ]):
        return False

    if not re.search(r"\d|rs|₹|%|crore|billion|million", t):
        return False

    return True

def event_gate(text):
    t = text.lower()
    return any(k in t for k in [
        "barred", "fined", "penalty", "approved", "ordered",
        "resigned", "steps down",
        "raises", "raised", "receives",
        "ipo", "drhp", "filed", "pre-filed",
        "reported", "posted", "narrowed", "grew", "declined",
        "announced", "introduced", "notified"
    ])

def is_duplicate(text, existing):
    for e in existing:
        if SequenceMatcher(None, text, e["raw_text"]).ratio() >= SIM_THRESHOLD:
            return True
    return False

# ===================== GROQ REFINER =====================

def groq_refine(client, text):
    prompt = f"""
Rewrite into ONE factual financial event sentence.

Rules:
- No opinions
- No forecasts
- No commentary
- No broker language
- Preserve numbers, entities, actions
- Output ONLY the sentence

TEXT:
{text}
"""

    try:
        r = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=120
        )

        try:
            import sys
            _backend_dir = os.path.join(BASE_DIR, "..", "..", "FinSight", "backend")
            if _backend_dir not in sys.path:
                sys.path.insert(0, _backend_dir)
            from app.groq_usage_tracker import track_groq_call
            track_groq_call("finax_engine", response=r)
        except Exception:  # noqa: BLE001 - FinAx may run standalone, outside the FinSight backend env entirely
            pass

        refined = r.choices[0].message.content.strip()

        if quality_gate(refined) and event_gate(refined):
            return refined

    except Exception:
        pass

    return None

# ===================== RSS INGEST =====================

def crawl_rss(existing, client):
    items = []
    cutoff = datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)

    for source, url in RSS_FEEDS.items():
        feed = feedparser.parse(url)

        for e in feed.entries:
            if not getattr(e, "published_parsed", None):
                continue

            published = datetime(*e.published_parsed[:6])
            if published < cutoff:
                continue

            raw = clean_text(e.title + " " + e.get("summary", ""))

            if not quality_gate(raw):
                continue

            category = classify(raw)
            if category == "IGNORE":
                continue

            if is_duplicate(raw, existing):
                continue

            refined = groq_refine(client, raw)
            if not refined:
                continue

            if is_duplicate(refined, existing):
                continue

            items.append({
                "id": hashlib.md5(refined.encode()).hexdigest(),
                "raw_text": refined,
                "category": category,
                "source": source,
                "created_at": published.isoformat()
            })

            time.sleep(0.4)

    return items

# ===================== MAIN =====================

def run():
    setup()

    # Prefer environment variable; fall back to a local (untracked) key file
    # if present. Never read a committed key file — apps/FinAx/groq_key.txt
    # previously held a hardcoded key in plaintext and has been scrubbed.
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key and os.path.exists(GROQ_KEY_FILE):
        with open(GROQ_KEY_FILE, "r") as f:
            api_key = f.read().strip()
    if not api_key:
        raise RuntimeError(
            "No Groq API key found. Set the GROQ_API_KEY environment variable "
            "(see FinSight/backend/.env.example)."
        )

    client = Groq(api_key=api_key)
    existing = load_existing()

    new_items = crawl_rss(existing, client)

    if not new_items:
        print("No new high-signal intelligence.")
        return

    existing.extend(new_items)
    save_existing(existing)

    print(f"✅ Added {len(new_items)} FINAL FinTaxLife intelligence items.")

if __name__ == "__main__":
    run()
