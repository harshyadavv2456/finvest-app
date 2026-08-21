"""Build screener snapshot from all tickers."""
import logging
from pathlib import Path
from typing import List, Dict, Any
import pandas as pd
from app.config import settings
from app.data_access import (
    list_tickers,
    load_daily,
    load_technicals,
    load_fundamentals,
    load_metadata,
)
from app.screener_engine import compute_screener_row

logger = logging.getLogger(__name__)


def build_screener_snapshot() -> pd.DataFrame:
    """
    Build screener snapshot DataFrame from all available tickers.
    
    Returns:
        DataFrame with all screener metrics
    """
    logger.info("Building screener snapshot...")
    
    tickers = list_tickers()
    logger.info(f"Found {len(tickers)} tickers")

    # Parallelized - this job runs on a fresh GitHub Actions checkout
    # every time (no local ticker data), so every one of ~2300 tickers
    # self-heals from R2 (see utils/paths.py), up to 6 files each. A
    # sequential loop here took 78+ minutes, right at the edge of this
    # job's 90min timeout and the actual cause of stale screener/Market
    # Intel data whenever it tipped over. Same R2 client timeout fix
    # applied to the live backend's now-removed inline fallback (see
    # main.py) applies here automatically via r2_client.py, so this is
    # now safe to parallelize the same way - bounded per-call timeouts
    # mean a stuck ticker can't stall the whole batch.
    import concurrent.futures

    def process_ticker(ticker_meta: Dict[str, Any]) -> Dict[str, Any] | None:
        ticker = ticker_meta.get("ticker")
        market = ticker_meta.get("market")
        if not ticker:
            return None
        try:
            daily_df = load_daily(ticker, market)
            tech_df = load_technicals(ticker, market)
            fundamentals = load_fundamentals(ticker, market)
            metadata = load_metadata(ticker, market)
            if not metadata.get("market"):
                metadata["market"] = market
            return compute_screener_row(
                ticker=ticker, daily_df=daily_df, tech_df=tech_df,
                fundamentals=fundamentals, metadata=metadata,
            )
        except Exception as e:  # noqa: BLE001
            logger.error(f"Failed to process {ticker}: {e}")
            return None

    rows: List[Dict[str, Any]] = []
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(process_ticker, tm): tm for tm in tickers}
        for future in concurrent.futures.as_completed(futures):
            completed += 1
            try:
                row = future.result()
                if row:
                    rows.append(row)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Future failed: {e}")
            if completed % 100 == 0:
                logger.info(f"Processed {completed}/{len(tickers)} tickers")

    logger.info(f"Computed metrics for {len(rows)} tickers")
    
    if not rows:
        logger.warning("No rows to create DataFrame")
        return pd.DataFrame()
    
    df = pd.DataFrame(rows)

    # ── Post-hoc: compute industry PE from median of same-industry peers ──
    if "industry" in df.columns and "pe_trailing" in df.columns:
        valid_pe = df[df["pe_trailing"].notna() & df["industry"].notna()].copy()
        if not valid_pe.empty:
            industry_medians = valid_pe.groupby("industry")["pe_trailing"].median()
            industry_pe_map = industry_medians.to_dict()
            df["industry_pe"] = df.apply(
                lambda r: (
                    r["industry_pe"]
                    if pd.notna(r.get("industry_pe"))
                    else industry_pe_map.get(r.get("industry"))
                ),
                axis=1,
            )
            logger.info(f"Computed industry PE for {len(industry_pe_map)} industries")
    
    # Ensure data directory exists
    data_dir = settings.DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Data directory: {data_dir} (exists: {data_dir.exists()})")
    
    # Save to parquet - use absolute path to ensure correct location
    parquet_path = data_dir / "screener.parquet"
    parquet_path = parquet_path.resolve()  # Get absolute path
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Saving screener snapshot to: {parquet_path}")
    df.to_parquet(parquet_path, engine="pyarrow", compression="snappy")
    logger.info(f"✓ Saved screener snapshot to {parquet_path} ({len(df)} rows)")
    
    # Verify file was written
    if parquet_path.exists():
        file_size = parquet_path.stat().st_size
        logger.info(f"✓ Verified: File exists, size: {file_size:,} bytes")
    else:
        logger.error(f"✗ ERROR: File was not created at {parquet_path}")
    
    # Also save CSV for debugging
    csv_path = data_dir / "screener.csv"
    csv_path = csv_path.resolve()  # Get absolute path
    logger.info(f"Saving CSV to: {csv_path}")
    df.to_csv(csv_path, index=False)
    logger.info(f"✓ Saved CSV to {csv_path} ({len(df)} rows)")
    
    # Verify CSV was written
    if csv_path.exists():
        file_size = csv_path.stat().st_size
        logger.info(f"✓ Verified: CSV exists, size: {file_size:,} bytes")
    else:
        logger.error(f"✗ ERROR: CSV was not created at {csv_path}")
    
    return df


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    build_screener_snapshot()

