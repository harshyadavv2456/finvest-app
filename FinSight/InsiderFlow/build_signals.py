import pandas as pd
import numpy as np
import os
from typing import List

# ==========================
# CONFIG
# ==========================

# Folder where your 10y scraper dumped files:
#   - AAPL_insider_10y.csv, MSFT_insider_10y.csv, ...
#   - CIK0001067983_13f_10y.csv, ...
INSIDER_INPUT_DIR = "sec_output_10y"     # change if different
FORM13F_INPUT_DIR = "sec_output_10y"     # same folder is fine
OUTPUT_DIR = "signals_output"            # all outputs go here

# Only keep this many years of data in the OUTPUT signal files.
# Raw 10y CSVs stay untouched. This just trims what Render loads into memory.
# 425K rows → ~85K rows at 2y. Cuts memory by ~80%.
SIGNAL_WINDOW_YEARS = 1   # 1 year keeps Render well within memory limits


# ==========================
# UTILS
# ==========================

def ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


# ==========================
# INSIDER SIGNALS
# ==========================

def load_insider_trades(input_dir: str) -> pd.DataFrame:
    files: List[str] = [
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if f.endswith("_insider_10y.csv")
    ]
    if not files:
        raise FileNotFoundError(f"No *_insider_10y.csv files found in {input_dir}")
    dfs = []
    for fp in files:
        df = pd.read_csv(fp)
        # If issuerTradingSymbol missing for some reason, infer from filename
        if "issuerTradingSymbol" not in df.columns:
            ticker = os.path.basename(fp).split("_")[0].upper()
            df["issuerTradingSymbol"] = ticker
        dfs.append(df)
    all_df = pd.concat(dfs, ignore_index=True)

    # Trim to signal window — keeps output files small for Render
    cutoff = pd.Timestamp.today() - pd.DateOffset(years=SIGNAL_WINDOW_YEARS)
    date_col = "filingDate" if "filingDate" in all_df.columns else None
    if date_col:
        all_df[date_col] = pd.to_datetime(all_df[date_col], errors="coerce")
        before = len(all_df)
        all_df = all_df[all_df[date_col] >= cutoff]
        print(f"[*] Insider: trimmed {before:,} → {len(all_df):,} rows "
              f"(last {SIGNAL_WINDOW_YEARS}y from {cutoff.date()})")

    return all_df


def engineer_insider_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Parse dates
    if "transactionDate" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["transactionDate"]):
        df["transactionDate"] = pd.to_datetime(df["transactionDate"], errors="coerce")
    if "filingDate" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["filingDate"]):
        df["filingDate"] = pd.to_datetime(df["filingDate"], errors="coerce")

    # Numeric casts
    for col in ["transactionShares", "transactionPricePerShare", "sharesOwnedFollowingTransaction"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Approx monetary size of each trade
    df["transactionValue"] = df["transactionShares"] * df["transactionPricePerShare"]

    # Map Form 4 codes to categories
    code = df["transactionCode"].astype(str).str.upper()

    bullish_codes = {"P"}          # Open market Purchase
    bearish_codes = {"S"}          # Sale
    comp_codes = {"M", "F", "G"}   # Option exercise, tax, gift (mostly comp/noise)

    df["signalCategory"] = "other"
    df.loc[code.isin(bullish_codes), "signalCategory"] = "bullish"
    df.loc[code.isin(bearish_codes), "signalCategory"] = "bearish"
    df.loc[code.isin(comp_codes), "signalCategory"] = "compensation"

    df["is_bullish"] = (df["signalCategory"] == "bullish").astype(int)
    df["is_bearish"] = (df["signalCategory"] == "bearish").astype(int)
    df["is_compensation"] = (df["signalCategory"] == "compensation").astype(int)

    # Log transaction size -> strength (log10 to tame huge trades)
    df["transactionValueAbs"] = df["transactionValue"].abs()
    df["logTransactionValue"] = np.where(
        df["transactionValueAbs"] > 0,
        np.log10(df["transactionValueAbs"]),
        0.0,
    )

    df["signalStrength"] = 0.0
    df.loc[df["signalCategory"] == "bullish", "signalStrength"] = df["logTransactionValue"]
    df.loc[df["signalCategory"] == "bearish", "signalStrength"] = -df["logTransactionValue"]

    return df


def aggregate_insider_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate to (ticker, date) level:
      - how many bullish / bearish trades
      - cluster flags
      - net signal strength
      - total transaction value
    """
    df = df.copy()

    # Event date = transactionDate if present, else filingDate
    if "transactionDate" in df.columns and df["transactionDate"].notna().any():
        df["eventDate"] = df["transactionDate"]
    else:
        df["eventDate"] = df["filingDate"]

    df = df.dropna(subset=["eventDate"])

    # Drop garbage future dates — any date beyond 1 year from today is a bad
    # transactionDate value in the Form 4 XML (e.g. AMP 2031, TMUS 2028)
    cutoff_future = pd.Timestamp.today() + pd.DateOffset(years=1)
    bad_future = df["eventDate"] > cutoff_future
    if bad_future.any():
        print(f"[!] Dropping {bad_future.sum()} rows with implausible future dates "
              f"(>{cutoff_future.date()})")
        df = df[~bad_future]

    group_cols = ["issuerTradingSymbol", "eventDate"]

    def sum_where(series, mask):
        # sum only when mask is True, safe for NaNs
        return series[mask].sum()

    agg = df.groupby(group_cols).apply(
        lambda g: pd.Series({
            "num_trades": len(g),
            "num_bullish": g["is_bullish"].sum(),
            "num_bearish": g["is_bearish"].sum(),
            "num_compensation": g["is_compensation"].sum(),
            "unique_insiders": g["reportingOwnerName"].nunique(),
            "total_value": g["transactionValue"].sum(),
            "total_buy_value": sum_where(g["transactionValue"], g["is_bullish"] == 1),
            "total_sell_value": sum_where(g["transactionValue"], g["is_bearish"] == 1),
            "net_signal_strength": g["signalStrength"].sum(),
        })
    ).reset_index()

    # Cluster events: multiple bullish/bearish trades same day
    agg["has_cluster_buy"] = (agg["num_bullish"] >= 2).astype(int)
    agg["has_cluster_sell"] = (agg["num_bearish"] >= 2).astype(int)

    # Z-score net signal per ticker (basic normalization)
    def zscore(s: pd.Series) -> pd.Series:
        m = s.mean()
        sd = s.std(ddof=0)
        if sd == 0 or np.isnan(sd):
            return (s - m)
        return (s - m) / sd

    agg["signal_z"] = agg.groupby("issuerTradingSymbol")["net_signal_strength"].transform(zscore)

    return agg


# ==========================
# 13F SIGNALS
# ==========================

def load_13f_holdings(input_dir: str) -> pd.DataFrame:
    files: List[str] = [
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if f.endswith("_13f_10y.csv")
    ]
    if not files:
        raise FileNotFoundError(f"No *_13f_10y.csv files found in {input_dir}")
    dfs = []
    for fp in files:
        df = pd.read_csv(fp)
        dfs.append(df)
    all_df = pd.concat(dfs, ignore_index=True)

    # Load WIDER window for diff calculation (need previous quarter as baseline).
    # Trimming to 1y immediately causes prevPositionValueUSD = null for all first-quarter
    # entries → classify_change returns "new" for everything → Hedge Fund Tracker shows 0.
    # Fix: load 2y for calculation, trim the OUTPUT to 1y after diffs are computed.
    calc_cutoff = pd.Timestamp.today() - pd.DateOffset(years=2)
    output_cutoff = pd.Timestamp.today() - pd.DateOffset(years=SIGNAL_WINDOW_YEARS)
    if "filingDate" in all_df.columns:
        all_df["filingDate"] = pd.to_datetime(all_df["filingDate"], errors="coerce")
        before = len(all_df)
        all_df = all_df[all_df["filingDate"] >= calc_cutoff]
        print(f"[*] 13F: loaded {before:,} → {len(all_df):,} rows for calculation "
              f"(2y window from {calc_cutoff.date()})")

    return all_df, output_cutoff


def engineer_13f_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Dates
    if "filingDate" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["filingDate"]):
        df["filingDate"] = pd.to_datetime(df["filingDate"], errors="coerce")

    # Numeric
    for col in ["value", "sshPrnamt"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Value is in thousands of USD in 13F
    if "value" in df.columns:
        df["positionValueUSD"] = df["value"] * 1000.0

    # Sort for time-series calculations
    sort_cols = [c for c in ["filer_cik", "cusip", "filingDate"] if c in df.columns]
    df = df.sort_values(sort_cols)

    # Compute change per fund+asset over time
    if all(c in df.columns for c in ["filer_cik", "cusip"]):
        df["prevPositionValueUSD"] = df.groupby(["filer_cik", "cusip"])["positionValueUSD"].shift(1)
        df["deltaPositionValueUSD"] = df["positionValueUSD"] - df["prevPositionValueUSD"]

        def classify_change(row):
            pv = row["prevPositionValueUSD"]
            cv = row["positionValueUSD"]
            if pd.isna(pv) and cv > 0:
                return "new"
            if cv == 0 or pd.isna(cv):
                return "exit"
            if pv == 0 or pd.isna(pv):
                return "new"
            if cv > pv:
                return "increase"
            if cv < pv:
                return "decrease"
            return "unchanged"

        df["positionChangeType"] = df.apply(classify_change, axis=1)
    else:
        df["prevPositionValueUSD"] = pd.NA
        df["deltaPositionValueUSD"] = pd.NA
        df["positionChangeType"] = "unknown"

    return df


def aggregate_13f_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate to asset (cusip) per filingDate:
      - number of funds holding
      - total value held
      - net increases/decreases
    """
    df = df.copy()

    # Asset identifier
    if "cusip" in df.columns:
        df["assetId"] = df["cusip"]
    else:
        df["assetId"] = df["nameOfIssuer"]

    group_cols = ["assetId", "filingDate"]

    agg = df.groupby(group_cols).agg(
        num_funds=("filer_cik", pd.Series.nunique),
        total_position_value=("positionValueUSD", "sum"),
        num_increases=("positionChangeType", lambda x: (x == "increase").sum()),
        num_decreases=("positionChangeType", lambda x: (x == "decrease").sum()),
        num_new=("positionChangeType", lambda x: (x == "new").sum()),
        num_exits=("positionChangeType", lambda x: (x == "exit").sum()),
    ).reset_index()

    agg["avg_position_value_per_fund"] = agg["total_position_value"] / agg["num_funds"].replace(0, np.nan)
    agg["net_fund_flow_count"] = agg["num_increases"] - agg["num_decreases"]

    return agg


# ==========================
# MAIN
# ==========================

def main():
    ensure_dir(OUTPUT_DIR)

    # ----- INSIDER -----
    try:
        insider_raw = load_insider_trades(INSIDER_INPUT_DIR)
        insider_enriched = engineer_insider_features(insider_raw)
        insider_agg = aggregate_insider_signals(insider_enriched)

        insider_raw_out = os.path.join(OUTPUT_DIR, "insider_trades_with_flags.csv")
        insider_agg_out = os.path.join(OUTPUT_DIR, "insider_daily_signals.csv")

        # Drop intermediate calculation columns and fields not used by frontend
        # Keeps file small — raw 10y CSVs retain everything locally
        drop_cols = [
            "cik", "accessionNumber", "transactionValueAbs", "logTransactionValue",
            "sharesOwnedFollowingTransaction", "directOrIndirectOwnership",
            "underlyingSecurityTitle", "underlyingSecurityShares",
            "exercisePrice", "expirationDate", "is_compensation",
        ]
        insider_out_df = insider_enriched.drop(
            columns=[c for c in drop_cols if c in insider_enriched.columns]
        )

        # Add displayDate = transactionDate if valid and sane, else filingDate.
        # Frontend "Recent Trades" filters on this — without it, null transactionDates
        # cause the entire table to show empty.
        cutoff_future = pd.Timestamp.today() + pd.DateOffset(years=1)
        td = pd.to_datetime(insider_out_df.get("transactionDate"), errors="coerce")
        fd = pd.to_datetime(insider_out_df.get("filingDate"),      errors="coerce")
        valid_td = td.notna() & (td <= cutoff_future)
        insider_out_df["displayDate"] = td.where(valid_td, fd)

        # Also drop any rows where displayDate is a garbage future date
        bad = insider_out_df["displayDate"] > cutoff_future
        if bad.any():
            print(f"[!] Dropping {bad.sum()} rows with future displayDate")
            insider_out_df = insider_out_df[~bad]

        insider_out_df.to_csv(insider_raw_out, index=False)
        insider_agg.to_csv(insider_agg_out, index=False)

        print(f"[*] Insider: wrote {len(insider_out_df)} trades "
              f"({len(insider_out_df.columns)} cols) to {insider_raw_out}")
        print(f"[*] Insider: wrote {len(insider_agg)} aggregated rows to {insider_agg_out}")
    except FileNotFoundError as e:
        print(f"[!] Insider pipeline skipped: {e}")

    # ----- 13F -----
    try:
        f13_raw, f13_output_cutoff = load_13f_holdings(FORM13F_INPUT_DIR)
        f13_enriched = engineer_13f_features(f13_raw)
        f13_agg = aggregate_13f_signals(f13_enriched)

        # NOW trim to 1y output window — after diffs/classify_change already computed
        if "filingDate" in f13_enriched.columns:
            before_enrich = len(f13_enriched)
            f13_enriched = f13_enriched[f13_enriched["filingDate"] >= f13_output_cutoff]
            print(f"[*] 13F: trimmed enriched {before_enrich:,} → {len(f13_enriched):,} rows "
                  f"for output (1y window)")
        if "filingDate" in f13_agg.columns:
            f13_agg = f13_agg[f13_agg["filingDate"] >= f13_output_cutoff]

        f13_raw_out = os.path.join(OUTPUT_DIR, "13f_holdings_with_flags.csv")
        f13_agg_out = os.path.join(OUTPUT_DIR, "13f_asset_signals.csv")

        f13_enriched.to_csv(f13_raw_out, index=False)
        f13_agg.to_csv(f13_agg_out, index=False)

        print(f"[*] 13F: wrote {len(f13_enriched)} rows to {f13_raw_out}")
        print(f"[*] 13F: wrote {len(f13_agg)} aggregated rows to {f13_agg_out}")
    except FileNotFoundError as e:
        print(f"[!] 13F pipeline skipped: {e}")


if __name__ == "__main__":
    main()
