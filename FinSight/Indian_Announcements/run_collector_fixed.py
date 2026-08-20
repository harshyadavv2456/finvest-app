import csv
import os
import time
import hashlib
import logging
from datetime import datetime, timedelta

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ================= CONFIG =================

# MAIN SAVE LOCATION
BASE_DIR = r"D:\FinVest2\FinSight\Indian_Announcements"

# OPTIONAL BACKUP / SECOND SAVE LOCATION
SECONDARY_DIR = r"D:\FinVest2\Indian_Announcements"

# CREATE BOTH DIRECTORIES
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(SECONDARY_DIR, exist_ok=True)

# PRIMARY FILES
ANN_CSV = os.path.join(BASE_DIR, "corporate_announcements.csv")
INSIDER_CSV = os.path.join(BASE_DIR, "insider_filings.csv")

# SECONDARY FILES
ANN_CSV_SECONDARY = os.path.join(
    SECONDARY_DIR,
    "corporate_announcements.csv"
)

INSIDER_CSV_SECONDARY = os.path.join(
    SECONDARY_DIR,
    "insider_filings.csv"
)

FIELDS = [
    "timestamp",
    "symbol",
    "company",
    "subject",
    "details",
    "date",
    "attachment",
    "hash"
]

INSIDER_PATTERNS = [
    "regulation 7",
    "regulation 30",
    "sast",
    "sebi",
    "promoter",
    "shareholding",
    "acquisition",
    "disposal",
    "insider",
    "encumbrance",
    "pledge"
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

log = logging.getLogger("NSE")

# =========================================


def get_session():
    s = requests.Session()

    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504]
    )

    s.mount("https://", HTTPAdapter(max_retries=retries))

    s.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.nseindia.com/",
        "X-Requested-With": "XMLHttpRequest"
    })

    return s


def warmup(session):
    session.get(
        "https://www.nseindia.com",
        timeout=10
    )

    time.sleep(1)

    session.get(
        "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
        timeout=10
    )

    time.sleep(1)


def init_csv(path):
    if not os.path.exists(path):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=FIELDS
            )
            writer.writeheader()


def make_hash(text):
    return hashlib.sha256(
        text.encode()
    ).hexdigest()


def fetch_announcements():
    session = get_session()

    warmup(session)

    url = "https://www.nseindia.com/api/corporate-announcements"

    params = {
        "index": "equities",
        "from_date": (
            datetime.now() - timedelta(days=7)
        ).strftime("%d-%m-%Y"),
        "to_date": datetime.now().strftime("%d-%m-%Y")
    }

    response = session.get(
        url,
        params=params,
        timeout=20
    )

    response.raise_for_status()

    return response.json()


def load_existing_hashes(path):
    existing = set()

    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row in reader:
                h = row.get("hash")

                if h:
                    existing.add(h)

    return existing


def append_rows(path, rows):
    if not rows:
        return

    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=FIELDS
        )

        writer.writerows(rows)


def save_announcements(data):
    existing = load_existing_hashes(ANN_CSV)

    rows = []

    for item in data:
        subject = item.get("subject") or ""

        details = (
            item.get("details")
            or item.get("desc")
            or ""
        )

        base = (
            f"{item.get('symbol')}|"
            f"{subject}|"
            f"{item.get('date')}"
        )

        row = {
            "timestamp": datetime.now().isoformat(),
            "symbol": item.get("symbol", ""),
            "company": item.get("companyName", ""),
            "subject": subject,
            "details": details,
            "date": item.get("date", ""),
            "attachment": item.get("attchmntText", ""),
            "hash": make_hash(base)
        }

        if row["hash"] not in existing:
            rows.append(row)

    # SAVE PRIMARY
    append_rows(ANN_CSV, rows)

    # SAVE SECONDARY
    append_rows(ANN_CSV_SECONDARY, rows)

    return len(rows)


def rebuild_insider_filings():
    if not os.path.exists(ANN_CSV):
        return 0

    insider_rows = []

    with open(ANN_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            subject = row.get("subject", "")
            details = row.get("details", "")

            combined = f"{subject} {details}".lower()

            if any(
                pattern in combined
                for pattern in INSIDER_PATTERNS
            ):
                insider_rows.append({
                    "timestamp": row.get("timestamp", ""),
                    "symbol": row.get("symbol", ""),
                    "company": row.get("company", ""),
                    "subject": subject,
                    "details": details,
                    "date": row.get("date", ""),
                    "attachment": row.get("attachment", ""),
                    "hash": row.get("hash", "")
                })

    # PRIMARY INSIDER FILE
    with open(
        INSIDER_CSV,
        "w",
        newline="",
        encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=FIELDS
        )

        writer.writeheader()
        writer.writerows(insider_rows)

    # SECONDARY INSIDER FILE
    with open(
        INSIDER_CSV_SECONDARY,
        "w",
        newline="",
        encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=FIELDS
        )

        writer.writeheader()
        writer.writerows(insider_rows)

    return len(insider_rows)


def run():
    # INIT PRIMARY FILES
    init_csv(ANN_CSV)
    init_csv(INSIDER_CSV)

    # INIT SECONDARY FILES
    init_csv(ANN_CSV_SECONDARY)
    init_csv(INSIDER_CSV_SECONDARY)

    log.info("Fetching corporate announcements")

    data = fetch_announcements()

    added = save_announcements(data)

    log.info(
        "Deriving insider filings from announcements"
    )

    insider_count = rebuild_insider_filings()

    log.info(
        f"New announcements added: {added}"
    )

    log.info(
        f"Total insider filings identified: "
        f"{insider_count}"
    )

    log.info(
        "Saved to BOTH locations successfully"
    )


# ================= ENTRY ==================

if __name__ == "__main__":
    run()