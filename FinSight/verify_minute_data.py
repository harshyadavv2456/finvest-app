#!/usr/bin/env python3
"""Quick verification of minute data timezones."""
import pandas as pd
from pathlib import Path

print("=== MINUTE DATA TIMEZONE VERIFICATION ===\n")

data_dir = Path("data/Stocks")
tickers = ["TCS.NS", "INFY.NS", "RELIANCE.NS", "AAPL", "MSFT", "GOOGL"]

for ticker in tickers:
    file_path = data_dir / ticker / "minute_1m.parquet"
    if not file_path.exists():
        print(f"{ticker}: File not found")
        continue
    
    try:
        df = pd.read_parquet(file_path)
        print(f"{ticker}:")
        print(f"  Rows: {len(df)}")
        print(f"  Index (UTC): {df.index[0]}")
        print(f"  local_timestamp: {df['local_timestamp'].iloc[0]}")
        print(f"  Last local_timestamp: {df['local_timestamp'].iloc[-1]}")
        print(f"  Dtype: {df['local_timestamp'].dtype}")
        print()
    except Exception as e:
        print(f"{ticker}: Error - {e}\n")

print("=== VERIFICATION COMPLETE ===")

