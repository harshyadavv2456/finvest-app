import csv
import json
import os
import time
import hashlib
import logging
from datetime import datetime
import requests
import pandas as pd
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ================= CONFIG =================
BASE_DIR = "./indian_market_filings"
INSIDER_CSV = f"{BASE_DIR}/insider_filings.csv"
META_FILE = f"{BASE_DIR}/metadata.json"

CSV_COLUMNS = [
    "timestamp",
    "company_symbol",
    "company_name",
    "person_name",
    "designation",
    "transaction_type",
    "security_type",
    "quantity",
    "price",
    "transaction_value",
    "transaction_date",
    "filing_date",
    "regulation",
    "mode_of_acquisition",
    "remarks",
    "record_hash"
]

os.makedirs(BASE_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger("INSIDER")

# ==========================================

class InsiderFilingsCollector:

    def __init__(self):
        self.session = self._create_session()
        self._init_csv()
        self.meta = self._load_meta()

    # ---------- NETWORK ----------
    def _create_session(self):
        s = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://www.nseindia.com/",
            "X-Requested-With": "XMLHttpRequest"
        })
        return s

    def _warmup_nse(self):
        self.session.get("https://www.nseindia.com", timeout=10)
        time.sleep(1)
        self.session.get(
            "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
            timeout=10
        )
        time.sleep(1)

    # ---------- STORAGE ----------
    def _init_csv(self):
        if not os.path.exists(INSIDER_CSV):
            with open(INSIDER_CSV, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
                writer.writeheader()

    def _load_meta(self):
        if os.path.exists(META_FILE):
            return json.load(open(META_FILE))
        return {"last_run": None}

    def _save_meta(self):
        json.dump(self.meta, open(META_FILE, "w"), indent=2)

    # ---------- LOGIC ----------
    def _hash_record(self, r):
        key = f"{r['company_symbol']}|{r['person_name']}|{r['transaction_date']}|{r['quantity']}"
        return hashlib.sha256(key.encode()).hexdigest()

    def fetch_insider_filings(self):
        self._warmup_nse()

        url = "https://www.nseindia.com/json.o"
        params = {"url": "InsiderTrading:http"}

        r = self.session.get(url, params=params, timeout=20)
        r.raise_for_status()
        payload = r.json()

        rows = []
        for i in payload.get("data", []):
            row = {
                "timestamp": datetime.now().isoformat(),
                "company_symbol": i.get("SYMBOL", "").strip(),
                "company_name": i.get("COMPANY_NAME", "").strip(),
                "person_name": i.get("PERSON_NAME", "").strip(),
                "designation": i.get("DESIGNATION", "").strip(),
                "transaction_type": i.get("TRANSACTION_TYPE", "").strip(),
                "security_type": i.get("SECURITY_TYPE", "Equity"),
                "quantity": i.get("QTY_TRANSACTED", "0"),
                "price": i.get("PRICE_PER_SHARE", "0"),
                "transaction_value": i.get("TXN_VALUE", "0"),
                "transaction_date": i.get("TXN_DATE", ""),
                "filing_date": i.get("DTD_OF_ACQUISITION", ""),
                "regulation": i.get("REGULATION", ""),
                "mode_of_acquisition": i.get("MODE_OF_ACQUISITION", ""),
                "remarks": i.get("REMARKS", "")
            }
            row["record_hash"] = self._hash_record(row)
            if row["company_symbol"] and row["transaction_date"]:
                rows.append(row)

        return rows

    def save_new_records(self, rows):
        if not rows:
            return 0

        existing = pd.read_csv(INSIDER_CSV)
        existing_hashes = set(existing["record_hash"]) if len(existing) else set()

        new_rows = [r for r in rows if r["record_hash"] not in existing_hashes]

        if new_rows:
            with open(INSIDER_CSV, "a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
                writer.writerows(new_rows)

        return len(new_rows)

    # ---------- RUN ----------
    def run(self):
        log.info("Fetching insider filings from NSE")
        rows = self.fetch_insider_filings()
        added = self.save_new_records(rows)
        self.meta["last_run"] = datetime.now().isoformat()
        self._save_meta()
        log.info(f"New insider records added: {added}")
