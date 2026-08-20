"""
fii_dii_pipeline.py v2.0

FII/DII daily cash flow pipeline for India (NSE).
Fetches from NSE, appends to history CSV, builds signals + daily outlook.

Requires: pip install nsepython pandas
"""

import os
import sys
import traceback
from datetime import datetime

import pandas as pd

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fii_dii_output")
HISTORY_FILE = os.path.join(OUT_DIR, "fii_dii_cash_history.csv")
SIGNALS_FILE = os.path.join(OUT_DIR, "fii_dii_cash_signals.csv")
DAILY_OUTLOOK_FILE = os.path.join(OUT_DIR, "fii_dii_daily_outlook.csv")


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def ensure_outdir():
    os.makedirs(OUT_DIR, exist_ok=True)


def parse_date(val):
    if pd.isna(val):
        return pd.NaT
    s = str(val).strip()
    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y %H:%M:%S",
                "%d-%m-%Y %H:%M", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y"]:
        try:
            return pd.to_datetime(s, format=fmt)
        except (ValueError, TypeError):
            continue
    try:
        return pd.to_datetime(s, dayfirst=True)
    except Exception:
        return pd.NaT


def clean_category(cat):
    if pd.isna(cat):
        return "Unknown"
    return str(cat).replace("*", "").strip()


def clean_number(val):
    if pd.isna(val):
        return 0.0
    s = str(val).replace(",", "").strip()
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def fetch_from_nse():
    """Fetch latest FII/DII data from NSE."""
    log("Fetching FII/DII data from NSE...")
    try:
        from nsepython import nse_fiidii
    except ImportError:
        log("ERROR: nsepython not installed. Run: pip install nsepython")
        return None

    try:
        raw = nse_fiidii()
    except Exception as e:
        log(f"ERROR: NSE API call failed: {e}")
        return None

    if raw is None:
        log("ERROR: NSE returned None")
        return None

    if isinstance(raw, list):
        df = pd.DataFrame(raw)
    elif isinstance(raw, pd.DataFrame):
        df = raw.copy()
    else:
        log(f"ERROR: Unexpected type from NSE: {type(raw)}")
        return None

    if df.empty:
        log("WARNING: NSE returned empty data")
        return None

    df.columns = [c.strip() for c in df.columns]
    log(f"  NSE returned {len(df)} rows, columns: {list(df.columns)}")

    rename_map = {}
    for c in df.columns:
        cl = c.lower().strip()
        if cl in ("category",):
            rename_map[c] = "category"
        elif cl in ("date",):
            rename_map[c] = "date"
        elif cl in ("buyvalue", "buy value"):
            rename_map[c] = "buyValue"
        elif cl in ("sellvalue", "sell value"):
            rename_map[c] = "sellValue"
        elif cl in ("netvalue", "net value"):
            rename_map[c] = "netValue"
    df.rename(columns=rename_map, inplace=True)

    required = ["category", "date", "buyValue", "sellValue", "netValue"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        log(f"ERROR: Missing columns: {missing}. Available: {list(df.columns)}")
        return None

    df["category"] = df["category"].apply(clean_category)
    df["trade_date"] = df["date"].apply(parse_date)
    df["buyValue"] = df["buyValue"].apply(clean_number)
    df["sellValue"] = df["sellValue"].apply(clean_number)
    df["netValue"] = df["netValue"].apply(clean_number)
    df["run_date"] = pd.Timestamp.today().normalize()
    df["source"] = "NSE_FII_DII_CASH"

    df = df.dropna(subset=["trade_date"])
    if df.empty:
        log("WARNING: All dates parsed as NaT")
        return None

    result = df[["trade_date", "category", "buyValue", "sellValue", "netValue", "run_date", "source"]]
    result = result.sort_values(["trade_date", "category"]).reset_index(drop=True)

    for _, row in result.iterrows():
        log(f"  {row['trade_date'].date()} | {row['category']:10s} | "
            f"Buy={row['buyValue']:>10.2f} Sell={row['sellValue']:>10.2f} Net={row['netValue']:>10.2f}")

    return result


def load_history():
    """Load existing history CSV, handling date formats."""
    if not os.path.exists(HISTORY_FILE):
        log("No existing history file. Starting fresh.")
        return pd.DataFrame(columns=["trade_date", "category", "buyValue", "sellValue", "netValue", "run_date", "source"])

    log(f"Loading history from {HISTORY_FILE}")
    df = pd.read_csv(HISTORY_FILE)
    if "trade_date" in df.columns:
        df["trade_date"] = df["trade_date"].apply(parse_date)
    if "run_date" in df.columns:
        df["run_date"] = df["run_date"].apply(parse_date)
    if "category" in df.columns:
        df["category"] = df["category"].apply(clean_category)

    df = df.dropna(subset=["trade_date"])
    log(f"  Loaded {len(df)} history rows")
    return df


def append_to_history(new_data):
    """Append new data to history, deduplicating by (trade_date, category)."""
    ensure_outdir()

    cols = ["trade_date", "category", "buyValue", "sellValue", "netValue", "run_date", "source"]

    if not os.path.exists(HISTORY_FILE):
        log("No existing history. Creating new file.")
        new_data[cols].to_csv(HISTORY_FILE, index=False)
        log(f"History saved: {len(new_data)} rows (all new)")
        return new_data[cols].copy()

    hist = pd.read_csv(HISTORY_FILE)
    log(f"  Existing history: {len(hist)} rows")

    new_rows = []
    new_date_cats = set()
    for _, row in new_data.iterrows():
        ds = pd.Timestamp(row["trade_date"]).strftime("%Y-%m-%d")
        new_date_cats.add((ds, row["category"]))
        new_rows.append({
            "trade_date": ds,
            "category": row["category"],
            "buyValue": row["buyValue"],
            "sellValue": row["sellValue"],
            "netValue": row["netValue"],
            "run_date": pd.Timestamp(row["run_date"]).strftime("%Y-%m-%d"),
            "source": row["source"],
        })

    existing_dates = set()
    for _, row in hist.iterrows():
        ds = str(row["trade_date"])[:10]
        existing_dates.add((ds, str(row["category"]).replace("*", "").strip()))

    actually_new = [r for r in new_rows if (r["trade_date"], r["category"]) not in existing_dates]

    if not actually_new:
        log("  No new rows to append (all dates already in history)")
        hist["trade_date"] = hist["trade_date"].apply(parse_date)
        hist["run_date"] = hist["run_date"].apply(parse_date)
        hist["category"] = hist["category"].apply(clean_category)
        return hist

    new_df = pd.DataFrame(actually_new)

    with open(HISTORY_FILE, "a", newline="", encoding="utf-8") as f:
        new_df.to_csv(f, header=False, index=False)

    log(f"  Appended {len(actually_new)} new rows to history")

    combined = pd.read_csv(HISTORY_FILE)
    combined["trade_date"] = combined["trade_date"].apply(parse_date)
    combined["run_date"] = combined["run_date"].apply(parse_date)
    combined["category"] = combined["category"].apply(clean_category)
    combined = combined.sort_values(["trade_date", "category"]).reset_index(drop=True)
    log(f"History total: {len(combined)} rows")
    return combined


def build_signals(hist):
    """Build per-category signals with rolling windows."""
    if hist.empty:
        log("Skipping signals: empty history")
        return hist

    df = hist.copy().sort_values(["category", "trade_date"]).reset_index(drop=True)
    parts = []
    for cat in df["category"].unique():
        cat_df = df[df["category"] == cat].copy()
        cat_df["netValue_change"] = cat_df["netValue"].diff()
        cat_df["netValue_roll5"] = cat_df["netValue"].rolling(5, min_periods=1).sum()
        cat_df["netValue_roll20"] = cat_df["netValue"].rolling(20, min_periods=1).sum()
        parts.append(cat_df)

    result = pd.concat(parts, ignore_index=True) if parts else df
    ensure_outdir()
    result.to_csv(SIGNALS_FILE, index=False)
    log(f"Signals saved: {len(result)} rows -> {SIGNALS_FILE}")
    return result


def build_daily_outlook(hist):
    """Build daily FII/DII outlook with regime classification."""
    if hist.empty:
        log("Skipping outlook: empty history")
        return pd.DataFrame()

    df = hist.copy()
    df["cat_upper"] = df["category"].str.upper()

    daily_rows = []
    for dt, grp in df.groupby("trade_date"):
        fii_mask = grp["cat_upper"].str.contains("FII", na=False) | grp["cat_upper"].str.contains("FPI", na=False)
        dii_mask = grp["cat_upper"].str.contains("DII", na=False)
        fii_net = grp.loc[fii_mask, "netValue"].sum() if fii_mask.any() else 0.0
        dii_net = grp.loc[dii_mask, "netValue"].sum() if dii_mask.any() else 0.0
        daily_rows.append({"trade_date": dt, "fii_net": fii_net, "dii_net": dii_net, "total_net": fii_net + dii_net})

    daily = pd.DataFrame(daily_rows).sort_values("trade_date").reset_index(drop=True)

    if daily.empty:
        log("No daily rows produced")
        return daily

    daily["fii_roll5"] = daily["fii_net"].rolling(5, min_periods=1).sum()
    daily["dii_roll5"] = daily["dii_net"].rolling(5, min_periods=1).sum()
    daily["total_roll5"] = daily["total_net"].rolling(5, min_periods=1).sum()
    daily["fii_roll20"] = daily["fii_net"].rolling(20, min_periods=1).sum()
    daily["dii_roll20"] = daily["dii_net"].rolling(20, min_periods=1).sum()
    daily["total_roll20"] = daily["total_net"].rolling(20, min_periods=1).sum()

    def classify_regime(row):
        f, d = row["fii_net"], row["dii_net"]
        if f > 0 and d > 0:
            return "both_buying"
        if f < 0 and d < 0:
            return "both_selling"
        if f > 0 and d < 0:
            return "fii_buy_dii_sell"
        if f < 0 and d > 0:
            return "fii_sell_dii_buy"
        return "neutral"

    def classify_flow(row):
        t, r = row["total_net"], row["regime"]
        if r in ("fii_buy_dii_sell", "fii_sell_dii_buy"):
            return "conflict_flow"
        if t > 0:
            return "bullish_flow"
        if t < 0:
            return "bearish_flow"
        return "neutral_flow"

    daily["regime"] = daily.apply(classify_regime, axis=1)
    daily["flow_signal"] = daily.apply(classify_flow, axis=1)

    ensure_outdir()
    daily.to_csv(DAILY_OUTLOOK_FILE, index=False)
    log(f"Daily outlook saved: {len(daily)} rows -> {DAILY_OUTLOOK_FILE}")

    latest = daily.iloc[-1]
    log(f"  Latest: {latest['trade_date']} | FII={latest['fii_net']:.1f} DII={latest['dii_net']:.1f} "
        f"Total={latest['total_net']:.1f} | {latest['regime']} / {latest['flow_signal']}")

    return daily


def main():
    log("=" * 60)
    log("FII/DII CASH PIPELINE v2.0")
    log("=" * 60)

    new_data = fetch_from_nse()
    if new_data is None or new_data.empty:
        log("No new data from NSE. Exiting.")
        sys.exit(1)

    hist = append_to_history(new_data)

    try:
        build_signals(hist)
    except Exception as e:
        log(f"WARNING: Signals build failed: {e}")
        traceback.print_exc()

    try:
        build_daily_outlook(hist)
    except Exception as e:
        log(f"WARNING: Outlook build failed: {e}")
        traceback.print_exc()

    log("=" * 60)
    log("FII/DII PIPELINE COMPLETE")
    log("=" * 60)


if __name__ == "__main__":
    main()
