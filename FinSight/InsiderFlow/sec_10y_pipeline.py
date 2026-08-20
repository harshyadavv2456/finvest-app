import requests
import pandas as pd
import xml.etree.ElementTree as ET
import os
import time
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

# ==========================
# CONFIG – EDIT THIS SECTION
# ==========================

HEADERS = {
    "User-Agent": "HarshYadav-FinSight/1.0 (your_email@example.com)",  # PUT REAL EMAIL
    "Accept-Encoding": "gzip, deflate",
}

YEARS_BACK = 10                   # look back this many years on first run
MODE = "both"                     # "insider", "13f", or "both"

INSIDER_TICKERS_FILE = "insider_tickers.txt"
HEDGE_FUNDS_FILE = "hedge_fund_ciks.txt"

OUTPUT_DIR = "sec_output_10y"
SEC_TICKER_JSON_URL = "https://www.sec.gov/files/company_tickers.json"

MAX_SEC_REQ_PER_SEC = 5.0         # be nice to SEC, do NOT crank this

# Internal constants – do not touch
TICKER_CACHE_FILE = os.path.join(OUTPUT_DIR, "_ticker_cik_cache.json")
TICKER_CACHE_TTL_HOURS = 12       # re-download SEC ticker map only after this many hours
FLAG_SUFFIX = ".full_fetch_done"  # flag file written alongside each CSV after a successful full fetch
INCREMENTAL_OVERLAP_DAYS = 30     # re-fetch this many days before last known date on incremental runs
                                  # handles lag, backdated amendments, same-day edge cases; dedup kills dupes
MIN_YEARS_FOR_HEALTHY_CSV = 3     # if CSV already spans this many years of data, treat missing flag as
                                  # incremental (flag just wasn't written), NOT as broken old-pipeline output


# ==========================
# RATE LIMIT / COMMON UTILS
# ==========================

_last_request_ts = 0.0

def sec_get(url: str, headers: Dict[str, str] = None) -> requests.Response:
    """Simple rate-limited GET wrapper for SEC."""
    global _last_request_ts
    now = time.time()
    min_interval = 1.0 / MAX_SEC_REQ_PER_SEC
    if now - _last_request_ts < min_interval:
        time.sleep(min_interval - (now - _last_request_ts))
    _last_request_ts = time.time()
    h = headers or HEADERS
    resp = requests.get(url, headers=h)
    resp.raise_for_status()
    return resp


def ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def normalize_cik(cik: str) -> str:
    return str(cik).zfill(10)


def load_list_from_txt(path: str) -> List[str]:
    """Load non-empty, non-comment lines. First token per line."""
    if not os.path.exists(path):
        print(f"[!] Config file not found: {path}")
        return []
    items: List[str] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            token = line.split()[0].strip()
            if token:
                items.append(token)
    return items


def get_ticker_cik_map() -> Dict[str, str]:
    """
    Download ticker->CIK map from SEC.
    Cached to disk for TICKER_CACHE_TTL_HOURS to avoid re-downloading on every run.
    """
    ensure_dir(OUTPUT_DIR)

    # Try loading from cache
    if os.path.exists(TICKER_CACHE_FILE):
        try:
            with open(TICKER_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached_at = datetime.fromisoformat(cached.get("cached_at", "2000-01-01"))
            age_hours = (datetime.now() - cached_at).total_seconds() / 3600
            if age_hours < TICKER_CACHE_TTL_HOURS:
                print(f"[*] Using cached ticker->CIK map ({age_hours:.1f}h old, TTL={TICKER_CACHE_TTL_HOURS}h).")
                return cached["mapping"]
            else:
                print(f"[*] Ticker cache expired ({age_hours:.1f}h old). Re-downloading.")
        except Exception as e:
            print(f"[!] Could not read ticker cache: {e}. Re-downloading.")

    print("[*] Downloading ticker -> CIK map from SEC...")
    resp = sec_get(SEC_TICKER_JSON_URL)
    raw = resp.json()
    mapping: Dict[str, str] = {}
    for _, v in raw.items():
        ticker = v["ticker"].upper()
        cik = str(v["cik_str"])
        mapping[ticker] = cik
    print(f"[*] Loaded {len(mapping)} tickers from SEC.")

    # Save to cache
    try:
        with open(TICKER_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"cached_at": datetime.now().isoformat(), "mapping": mapping}, f)
        print(f"[*] Ticker->CIK map cached to {TICKER_CACHE_FILE}")
    except Exception as e:
        print(f"[!] Could not write ticker cache: {e}")

    return mapping


def ticker_to_cik(ticker: str, mapping: Dict[str, str]) -> str:
    t = ticker.upper()
    if t not in mapping:
        raise ValueError(f"Ticker {t} not found in SEC mapping.")
    return mapping[t]


def get_company_submissions(cik: str) -> Dict[str, Any]:
    cik_norm = normalize_cik(cik)
    url = f"https://data.sec.gov/submissions/CIK{cik_norm}.json"
    print(f"[*] Fetching submissions JSON for CIK {cik_norm} ...")
    resp = sec_get(url)
    return resp.json()


def fetch_filing_file(cik: str, accession: str, filename: str) -> str:
    cik_no_zeros = str(int(cik))  # remove leading zeros
    acc_nodash = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{cik_no_zeros}/{acc_nodash}/{filename}"
    print(f"[*] Downloading: {url}")
    resp = sec_get(url)
    return resp.text


def get_filing_index_items(cik: str, accession: str) -> List[Dict[str, Any]]:
    """Use filing index.json to discover files."""
    cik_no_zeros = str(int(cik))
    acc_nodash = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{cik_no_zeros}/{acc_nodash}/index.json"
    print(f"[*] Fetching filing index JSON: {url}")
    resp = sec_get(url)
    j = resp.json()
    items = j.get("directory", {}).get("item", [])
    return items


def parse_date(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def _extract_parallel_arrays(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    SEC historical submission files are flat dicts of parallel arrays at the top level:
      { "accessionNumber": [...], "filingDate": [...], "form": [...], ... }

    BUT the main CIK{}.json wraps them under filings.recent:
      { "filings": { "recent": { "accessionNumber": [...], ... }, "files": [...] } }

    This helper normalises both so callers always get the parallel-array dict back,
    or None if the structure is unrecognised.
    """
    # Already the raw parallel-array format (standard case for historical files)
    if "accessionNumber" in block:
        return block

    # Wrapped under a "filings" key (rare variant)
    inner = block.get("filings")
    if isinstance(inner, dict):
        if "accessionNumber" in inner:
            return inner
        recent = inner.get("recent")
        if isinstance(recent, dict) and "accessionNumber" in recent:
            return recent

    return None


# ===========================================
# GET FILINGS FOR A CIK WITH DATE FILTER
# ===========================================

def get_filings_for_cik_since(
    cik: str,
    forms_filter: List[str],
    earliest_date: datetime,
) -> List[Dict[str, Any]]:
    """
    Aggregate filings from:
      - submissions.recent  (always present, ~40 most recent filings)
      - submissions.filings.files  (historical paginated JSONs for older filings)
    Filter by form in forms_filter and filingDate >= earliest_date.

    FIX: Historical JSON files are flat parallel-array dicts at the top level —
    NOT nested under a 'filings' key. The original code did .get("filings",[]) then
    .get("filings",[]) again which always returned [] and silently dropped everything.
    """
    subs = get_company_submissions(cik)
    filings_all: List[Dict[str, Any]] = []

    # ── 1) recent block ──────────────────────────────────────────────────────
    recent = subs.get("filings", {}).get("recent", {})
    r_forms       = recent.get("form", [])
    r_dates       = recent.get("filingDate", [])
    r_accessions  = recent.get("accessionNumber", [])
    r_primary_docs = recent.get("primaryDocument", [])

    for form, date_str, acc, doc in zip(r_forms, r_dates, r_accessions, r_primary_docs):
        try:
            d = parse_date(date_str)
        except Exception:
            continue
        if form in forms_filter and d >= earliest_date:
            filings_all.append({
                "form": form,
                "filingDate": date_str,
                "accessionNumber": acc,
                "primaryDocument": doc,
            })

    # ── 2) historical pagination files ───────────────────────────────────────
    files_meta = subs.get("filings", {}).get("files", [])
    for fm in files_meta:
        name = fm.get("name")
        if not name:
            continue

        # Early-skip optimisation: each entry in files_meta carries a "filingTo" field
        # which is the date of the most recent filing in that pagination file.
        # If that date is earlier than our window, everything in the file is too old.
        # NOTE: correct SEC field is "filingTo", NOT "date" — wrong key silently returned None.
        file_last_date_str = fm.get("filingTo")
        if file_last_date_str:
            try:
                file_last_date = parse_date(file_last_date_str)
                if file_last_date < earliest_date:
                    print(f"[*] Skipping historical file {name} "
                          f"(newest entry {file_last_date_str} < window start {earliest_date.date()})")
                    continue
            except Exception:
                pass  # unparseable date → fetch anyway

        if name.startswith("CIK"):
            hist_url = f"https://data.sec.gov/submissions/{name}"
        else:
            hist_url = f"https://data.sec.gov/submissions/CIK{normalize_cik(cik)}-{name}"

        print(f"[*] Fetching historical filings file: {hist_url}")
        try:
            resp = sec_get(hist_url)
        except requests.HTTPError as e:
            print(f"[!] Could not fetch {hist_url}: {e}")
            continue

        hist_json = resp.json()

        # ── THE ACTUAL FIX ───────────────────────────────────────────────────
        # Historical files are flat parallel-array dicts at the top level.
        # Normalise whatever variant we get back to a single parallel-array dict.
        hist_block = _extract_parallel_arrays(hist_json)
        if hist_block is None:
            print(f"[!] Unrecognised JSON structure in historical file {name}. Skipping.")
            continue
        # ─────────────────────────────────────────────────────────────────────

        hf_forms        = hist_block.get("form", [])
        hf_dates        = hist_block.get("filingDate", [])
        hf_accessions   = hist_block.get("accessionNumber", [])
        hf_primary_docs = hist_block.get("primaryDocument", [])

        for form, date_str, acc, doc in zip(hf_forms, hf_dates, hf_accessions, hf_primary_docs):
            if not (form and date_str and acc and doc):
                continue
            try:
                d = parse_date(date_str)
            except Exception:
                continue
            if form in forms_filter and d >= earliest_date:
                filings_all.append({
                    "form": form,
                    "filingDate": date_str,
                    "accessionNumber": acc,
                    "primaryDocument": doc,
                })

    # Deduplicate by accessionNumber
    seen: set = set()
    unique_filings: List[Dict[str, Any]] = []
    for f in filings_all:
        acc = f["accessionNumber"]
        if acc in seen:
            continue
        seen.add(acc)
        unique_filings.append(f)

    # Sort oldest-first (consistent ordering for incremental appends)
    unique_filings.sort(key=lambda x: x["filingDate"])
    print(f"[*] CIK {cik}: {len(unique_filings)} filings of {forms_filter} since {earliest_date.date()}")
    return unique_filings


# ==========================
# 13F (HEDGE FUND HOLDINGS)
# ==========================

def extract_information_table_xml_from_text(filing_text: str) -> str:
    lower = filing_text.lower()
    start_tag = "<informationtable"
    end_tag = "</informationtable>"

    start_idx = lower.find(start_tag)
    end_idx = lower.rfind(end_tag)

    if start_idx == -1 or end_idx == -1:
        raise RuntimeError("Could not find <informationTable> XML in filing text.")

    end_idx += len(end_tag)
    xml_str = filing_text[start_idx:end_idx]
    return xml_str


def parse_13f_information_table(xml_str: str) -> pd.DataFrame:
    """
    Parse a 13F information table XML into a DataFrame.
    Handles namespaces by stripping them from tag names.
    """
    root = ET.fromstring(xml_str)

    # Strip namespaces: {ns}tag -> tag
    for elem in root.iter():
        if isinstance(elem.tag, str) and "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]

    rows = []

    for info in root.findall(".//infoTable"):
        row = {}

        def get_text(path: str):
            parts = path.split("/")
            el = info
            for p in parts:
                if el is None:
                    return None
                el = el.find(p)
            if el is not None and el.text is not None:
                return el.text.strip()
            return None

        row["nameOfIssuer"]          = get_text("nameOfIssuer")
        row["titleOfClass"]          = get_text("titleOfClass")
        row["cusip"]                 = get_text("cusip")
        row["value"]                 = get_text("value")          # thousands
        row["sshPrnamt"]             = get_text("shrsOrPrnAmt/sshPrnamt")
        row["sshPrnamtType"]         = get_text("shrsOrPrnAmt/sshPrnamtType")
        row["investmentDiscretion"]  = get_text("investmentDiscretion")
        row["votingAuthoritySole"]   = get_text("votingAuthority/Sole")
        row["votingAuthorityShared"] = get_text("votingAuthority/Shared")
        row["votingAuthorityNone"]   = get_text("votingAuthority/None")

        rows.append(row)

    return pd.DataFrame(rows)


def get_13f_holdings_for_cik_since(cik: str, earliest_date: datetime) -> pd.DataFrame:
    """Fetch all 13F-HR / 13F-HR/A filings for a manager CIK since earliest_date."""
    filings = get_filings_for_cik_since(
        cik=cik,
        forms_filter=["13F-HR", "13F-HR/A"],
        earliest_date=earliest_date,
    )

    all_rows: List[Dict[str, Any]] = []

    for f in filings:
        accession   = f["accessionNumber"]
        filing_date = f["filingDate"]

        try:
            items = get_filing_index_items(cik, accession)
        except Exception as e:
            print(f"[!] Failed index for 13F {accession}: {e}")
            continue

        # Try to find info table XML by description first
        xml_candidate: Optional[str] = None
        for itm in items:
            name = itm.get("name", "").lower()
            desc = itm.get("description", "").lower()
            if name.endswith(".xml") and "information table" in desc:
                xml_candidate = itm["name"]
                break

        # Fallback: first xml
        if xml_candidate is None:
            for itm in items:
                if itm.get("name", "").lower().endswith(".xml"):
                    xml_candidate = itm["name"]
                    break

        if xml_candidate is None:
            print(f"[!] No XML info table for 13F {accession}. Skipping.")
            continue

        try:
            xml_text = fetch_filing_file(cik, accession, xml_candidate)
            try:
                df = parse_13f_information_table(xml_text)
            except ET.ParseError:
                print("[!] Direct XML parse failed, trying txt extraction...")
                txt_name = None
                for itm in items:
                    if itm.get("name", "").lower().endswith(".txt"):
                        txt_name = itm["name"]
                        break
                if txt_name is None:
                    print(f"[!] No .txt fallback for 13F {accession}")
                    continue
                txt_content = fetch_filing_file(cik, accession, txt_name)
                xml_str = extract_information_table_xml_from_text(txt_content)
                df = parse_13f_information_table(xml_str)
        except Exception as e:
            print(f"[!] Failed to parse 13F {accession}: {e}")
            continue

        if df is None or df.empty:
            print(f"[!] Empty holdings for 13F {accession}")
            continue

        df.insert(0, "filer_cik", normalize_cik(cik))
        df.insert(1, "accessionNumber", accession)
        df.insert(2, "filingDate", filing_date)

        all_rows.extend(df.to_dict("records"))

    return pd.DataFrame(all_rows)


# ==========================
# FORM 4 (INSIDER TRADING)
# ==========================

def choose_form4_xml_file(items: List[Dict[str, Any]]) -> Optional[str]:
    """Prefer a non-XSL XML file; fall back to any XML."""
    candidates = []
    for itm in items:
        name = itm.get("name", "").lower()
        if not name.endswith(".xml"):
            continue
        if "xsl" in name:
            continue
        candidates.append(itm["name"])
    if candidates:
        return candidates[0]
    for itm in items:
        if itm.get("name", "").lower().endswith(".xml"):
            return itm["name"]
    return None


def parse_form4_ownership_xml(xml_text: str, cik: str, accession: str, filing_date: str) -> List[Dict[str, Any]]:
    rows = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        stripped = xml_text[xml_text.find("<"):]
        root = ET.fromstring(stripped)

    issuer_symbol = None
    issuer_el = root.find(".//issuer")
    if issuer_el is not None:
        sym_el = issuer_el.find("issuerTradingSymbol")
        if sym_el is not None and sym_el.text:
            issuer_symbol = sym_el.text.strip()

    reporting_owner_name = None
    reporting_owner_rel  = None
    ro_el = root.find(".//reportingOwner")
    if ro_el is not None:
        name_el = ro_el.find(".//rptOwnerName")
        if name_el is not None and name_el.text:
            reporting_owner_name = name_el.text.strip()

        rel_el = ro_el.find(".//reportingOwnerRelationship")
        if rel_el is not None:
            rel_parts = []
            for tag in ["isDirector", "isOfficer", "isTenPercentOwner", "isOther"]:
                t = rel_el.find(tag)
                if t is not None and t.text and t.text.strip().lower() == "true":
                    rel_parts.append(tag)
            reporting_owner_rel = ",".join(rel_parts) if rel_parts else None

    def get_tx_text(tx, tag):
        el = tx.find(tag)
        return el.text.strip() if el is not None and el.text is not None else None

    # ── Non-derivative transactions (open market buys/sells, gifts, etc.) ─────
    non_deriv_txs = root.findall(".//nonDerivativeTable/nonDerivativeTransaction")
    for tx in non_deriv_txs:
        row = {
            "cik": normalize_cik(cik),
            "filingDate": filing_date,
            "issuerTradingSymbol": issuer_symbol,
            "reportingOwnerName": reporting_owner_name,
            "reportingOwnerRelationship": reporting_owner_rel,
            "accessionNumber": accession,
            "transactionType": "non_derivative",
        }
        row["transactionDate"]                  = get_tx_text(tx, "transactionDate/value")
        row["transactionCode"]                  = get_tx_text(tx, "transactionCoding/transactionCode")
        row["transactionShares"]                = get_tx_text(tx, "transactionAmounts/transactionShares/value")
        row["transactionPricePerShare"]         = get_tx_text(tx, "transactionAmounts/transactionPricePerShare/value")
        row["sharesOwnedFollowingTransaction"]  = get_tx_text(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")
        row["directOrIndirectOwnership"]        = get_tx_text(tx, "ownershipNature/directOrIndirectOwnership/value")
        row["securityTitle"]                    = get_tx_text(tx, "securityTitle/value")
        row["underlyingSecurityTitle"]          = None
        row["underlyingSecurityShares"]         = None
        row["exercisePrice"]                    = None
        row["expirationDate"]                   = None
        rows.append(row)

    # ── Derivative transactions (options, RSUs, warrants, convertibles) ───────
    # Old code completely ignored this block — caused ALL option grants,
    # RSU vestings and option exercises to be silently dropped.
    deriv_txs = root.findall(".//derivativeTable/derivativeTransaction")
    for tx in deriv_txs:
        row = {
            "cik": normalize_cik(cik),
            "filingDate": filing_date,
            "issuerTradingSymbol": issuer_symbol,
            "reportingOwnerName": reporting_owner_name,
            "reportingOwnerRelationship": reporting_owner_rel,
            "accessionNumber": accession,
            "transactionType": "derivative",
        }
        row["transactionDate"]                  = get_tx_text(tx, "transactionDate/value")
        row["transactionCode"]                  = get_tx_text(tx, "transactionCoding/transactionCode")
        row["transactionShares"]                = get_tx_text(tx, "transactionAmounts/transactionShares/value")
        row["transactionPricePerShare"]         = get_tx_text(tx, "transactionAmounts/transactionPricePerShare/value")
        row["sharesOwnedFollowingTransaction"]  = get_tx_text(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")
        row["directOrIndirectOwnership"]        = get_tx_text(tx, "ownershipNature/directOrIndirectOwnership/value")
        row["securityTitle"]                    = get_tx_text(tx, "securityTitle/value")
        row["underlyingSecurityTitle"]          = get_tx_text(tx, "underlyingSecurity/underlyingSecurityTitle/value")
        row["underlyingSecurityShares"]         = get_tx_text(tx, "underlyingSecurity/underlyingSecurityShares/value")
        row["exercisePrice"]                    = get_tx_text(tx, "conversionOrExercisePrice/value")
        row["expirationDate"]                   = get_tx_text(tx, "expirationDate/value")
        rows.append(row)

    if not rows:
        print(f"[!] Form 4 {accession} ({filing_date}): zero transactions parsed "
              f"(non_deriv={len(non_deriv_txs)}, deriv={len(deriv_txs)} in XML). "
              f"Likely a holdings-only ownership statement with no transactions.")

    return rows


def get_form4_transactions_for_cik_since(cik: str, earliest_date: datetime) -> pd.DataFrame:
    filings = get_filings_for_cik_since(
        cik=cik,
        forms_filter=["4"],
        earliest_date=earliest_date,
    )

    all_rows: List[Dict[str, Any]] = []

    for f in filings:
        accession   = f["accessionNumber"]
        filing_date = f["filingDate"]

        try:
            items = get_filing_index_items(cik, accession)
        except Exception as e:
            print(f"[!] Failed index.json for Form 4 {accession}: {e}")
            continue

        xml_name = choose_form4_xml_file(items)
        if xml_name is None:
            print(f"[!] No XML file for Form 4 {accession}. Skipping.")
            continue

        try:
            xml_text = fetch_filing_file(cik, accession, xml_name)
        except Exception as e:
            print(f"[!] Failed to download Form 4 XML {accession}/{xml_name}: {e}")
            continue

        try:
            rows = parse_form4_ownership_xml(xml_text, cik, accession, filing_date)
        except Exception as e:
            print(f"[!] Failed to parse Form 4 XML {accession}: {e}")
            continue

        all_rows.extend(rows)

    return pd.DataFrame(all_rows)


# ==========================
# PIPELINES (INCREMENTAL)
# ==========================

def _write_flag(out_path: str):
    """Mark that a successful full-history fetch has been completed for this output file."""
    flag_path = out_path + FLAG_SUFFIX
    try:
        with open(flag_path, "w", encoding="utf-8") as f:
            f.write(datetime.today().isoformat())
    except Exception as e:
        print(f"[!] Could not write flag file {flag_path}: {e}")


def _has_full_fetch_flag(out_path: str) -> bool:
    return os.path.exists(out_path + FLAG_SUFFIX)


def incremental_insider_for_ticker(ticker: str, cik_map: Dict[str, str], earliest_allowed: datetime):
    ensure_dir(OUTPUT_DIR)
    try:
        cik = ticker_to_cik(ticker, cik_map)
    except ValueError as e:
        print(f"[!] {e}")
        return

    out_path = os.path.join(OUTPUT_DIR, f"{ticker}_insider_10y.csv")

    existing_df: Optional[pd.DataFrame] = None
    earliest_date: datetime = earliest_allowed

    if os.path.exists(out_path):
        existing_df = pd.read_csv(out_path)

        if _has_full_fetch_flag(out_path):
            # ── Normal incremental mode ──────────────────────────────────────
            print(f"[*] {ticker}: flag present → incremental update.")
            if "filingDate" in existing_df.columns:
                last_filing_date = pd.to_datetime(existing_df["filingDate"], errors="coerce").max()
                if pd.notna(last_filing_date):
                    overlap_start = last_filing_date - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
                    earliest_date = max(earliest_allowed, overlap_start)
                    print(f"[*] {ticker}: fetching since {earliest_date.date()} "
                          f"(last known {last_filing_date.date()}, {INCREMENTAL_OVERLAP_DAYS}d overlap)")
                else:
                    print(f"[*] {ticker}: cannot determine last date, re-fetching from {earliest_date.date()}")
            else:
                print(f"[*] {ticker}: no filingDate column, re-fetching from {earliest_date.date()}")
        else:
            # ── Smart recovery mode ──────────────────────────────────────────
            # Case A: CSV spans 3+ years → data is healthy, flag just wasn't written
            #         (pipeline was killed mid-run). Treat as incremental with overlap.
            #         Write flag NOW before the fetch so even a mid-run kill preserves it.
            # Case B: CSV spans < 3 years → thin/broken old pipeline output.
            #         Full 10-year refetch needed.
            csv_healthy = False
            if "filingDate" in existing_df.columns:
                dates = pd.to_datetime(existing_df["filingDate"], errors="coerce").dropna()
                if not dates.empty:
                    span_years = (dates.max() - dates.min()).days / 365.0
                    last_filing_date = dates.max()
                    if span_years >= MIN_YEARS_FOR_HEALTHY_CSV:
                        csv_healthy = True

            if csv_healthy:
                overlap_start = last_filing_date - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
                earliest_date = max(earliest_allowed, overlap_start)
                print(f"[*] {ticker}: no flag but CSV spans {span_years:.1f}y (healthy). "
                      f"Incremental from {earliest_date.date()}. Writing flag now.")
                _write_flag(out_path)   # write flag BEFORE fetch — survives mid-run kill
            else:
                print(f"[*] {ticker}: no flag, CSV looks incomplete ({span_years:.1f}y span). "
                      f"Full 10-year refetch.")
                earliest_date = earliest_allowed
    else:
        print(f"[*] {ticker}: no existing CSV. Full 10-year fetch.")

    new_df = get_form4_transactions_for_cik_since(cik, earliest_date)

    if new_df is None or new_df.empty:
        print(f"[!] No new insider records for {ticker}.")
        if existing_df is None:
            print(f"[!] And no existing data. Nothing to save for {ticker}.")
            return
        # Existing file is already up to date; write flag if missing
        if not _has_full_fetch_flag(out_path):
            _write_flag(out_path)
        return

    # Combine with existing and deduplicate
    if existing_df is not None and not existing_df.empty:
        combined = pd.concat([existing_df, new_df], ignore_index=True)
    else:
        combined = new_df

    dedup_cols = [c for c in ["accessionNumber", "transactionDate", "transactionCode",
                               "transactionType", "securityTitle"]
                  if c in combined.columns]
    if dedup_cols:
        combined = combined.drop_duplicates(subset=dedup_cols)

    # Sort by filingDate for clean append ordering
    if "filingDate" in combined.columns:
        combined = combined.sort_values("filingDate", ignore_index=True)

    combined.to_csv(out_path, index=False)
    _write_flag(out_path)
    print(f"[*] {ticker}: {len(combined)} insider records saved to {out_path}")


def incremental_13f_for_fund(cik: str, earliest_allowed: datetime):
    ensure_dir(OUTPUT_DIR)
    cik_norm = normalize_cik(cik)
    out_path = os.path.join(OUTPUT_DIR, f"CIK{cik_norm}_13f_10y.csv")

    existing_df: Optional[pd.DataFrame] = None
    earliest_date: datetime = earliest_allowed

    if os.path.exists(out_path):
        existing_df = pd.read_csv(out_path)

        if _has_full_fetch_flag(out_path):
            # ── Normal incremental mode ──────────────────────────────────────
            print(f"[*] CIK {cik_norm}: flag present → incremental update.")
            if "filingDate" in existing_df.columns:
                last_filing_date = pd.to_datetime(existing_df["filingDate"], errors="coerce").max()
                if pd.notna(last_filing_date):
                    overlap_start = last_filing_date - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
                    earliest_date = max(earliest_allowed, overlap_start)
                    print(f"[*] CIK {cik_norm}: fetching since {earliest_date.date()} "
                          f"(last known {last_filing_date.date()}, {INCREMENTAL_OVERLAP_DAYS}d overlap)")
                else:
                    print(f"[*] CIK {cik_norm}: cannot determine last date, re-fetching from {earliest_date.date()}")
            else:
                print(f"[*] CIK {cik_norm}: no filingDate column, re-fetching from {earliest_date.date()}")
        else:
            # ── Smart recovery mode ──────────────────────────────────────────
            csv_healthy = False
            if "filingDate" in existing_df.columns:
                dates = pd.to_datetime(existing_df["filingDate"], errors="coerce").dropna()
                if not dates.empty:
                    span_years = (dates.max() - dates.min()).days / 365.0
                    last_filing_date = dates.max()
                    if span_years >= MIN_YEARS_FOR_HEALTHY_CSV:
                        csv_healthy = True

            if csv_healthy:
                overlap_start = last_filing_date - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
                earliest_date = max(earliest_allowed, overlap_start)
                print(f"[*] CIK {cik_norm}: no flag but CSV spans {span_years:.1f}y (healthy). "
                      f"Incremental from {earliest_date.date()}. Writing flag now.")
                _write_flag(out_path)   # write flag BEFORE fetch — survives mid-run kill
            else:
                print(f"[*] CIK {cik_norm}: no flag, CSV looks incomplete. Full 10-year refetch.")
                earliest_date = earliest_allowed
    else:
        print(f"[*] No existing 13F file for CIK {cik_norm}. Full 10-year fetch.")

    new_df = get_13f_holdings_for_cik_since(cik, earliest_date)

    if new_df is None or new_df.empty:
        print(f"[!] No new 13F records for CIK {cik_norm}.")
        if existing_df is None:
            print(f"[!] And no existing data. Nothing to save for CIK {cik_norm}.")
            return
        if not _has_full_fetch_flag(out_path):
            _write_flag(out_path)
        return

    if existing_df is not None and not existing_df.empty:
        combined = pd.concat([existing_df, new_df], ignore_index=True)
    else:
        combined = new_df

    dedup_cols = [c for c in ["accessionNumber", "cusip"] if c in combined.columns]
    if dedup_cols:
        combined = combined.drop_duplicates(subset=dedup_cols)

    if "filingDate" in combined.columns:
        combined = combined.sort_values("filingDate", ignore_index=True)

    combined.to_csv(out_path, index=False)
    _write_flag(out_path)
    print(f"[*] CIK {cik_norm}: {len(combined)} 13F rows saved to {out_path}")


# ==========================
# MAIN
# ==========================

def main():
    ensure_dir(OUTPUT_DIR)
    earliest_allowed = datetime.today() - timedelta(days=365 * YEARS_BACK)
    print(f"[*] Earliest allowed date: {earliest_allowed.date()} (last {YEARS_BACK} years)")

    insider_tickers = load_list_from_txt(INSIDER_TICKERS_FILE)
    hedge_ciks      = load_list_from_txt(HEDGE_FUNDS_FILE)

    print(f"[*] Loaded {len(insider_tickers)} insider tickers from {INSIDER_TICKERS_FILE}")
    print(f"[*] Loaded {len(hedge_ciks)} hedge fund CIKs from {HEDGE_FUNDS_FILE}")

    if MODE not in {"insider", "13f", "both"}:
        raise ValueError("MODE must be one of: insider, 13f, both")

    if MODE in {"insider", "both"} and not insider_tickers:
        print("[!] MODE includes 'insider' but insider_tickers.txt is empty or missing.")

    if MODE in {"13f", "both"} and not hedge_ciks:
        print("[!] MODE includes '13f' but hedge_fund_ciks.txt is empty or missing.")

    if MODE in {"insider", "both"} and insider_tickers:
        ticker_map = get_ticker_cik_map()
        for t in insider_tickers:
            print(f"\n=== INSIDER: {t} ===")
            incremental_insider_for_ticker(t, ticker_map, earliest_allowed)

    if MODE in {"13f", "both"} and hedge_ciks:
        for c in hedge_ciks:
            print(f"\n=== 13F: CIK {c} ===")
            incremental_13f_for_fund(c, earliest_allowed)


if __name__ == "__main__":
    main()
