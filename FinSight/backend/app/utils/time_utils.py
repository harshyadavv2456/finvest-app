"""Timezone and time utility functions."""
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional
import pandas as pd


def ensure_utc_index(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure DataFrame index is UTC timezone-aware.
    
    Args:
        df: DataFrame with datetime index
    
    Returns:
        DataFrame with UTC timezone-aware index
    """
    if df.empty:
        return df
    
    if not isinstance(df.index, pd.DatetimeIndex):
        return df
    
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    elif df.index.tz != ZoneInfo("UTC"):
        df.index = df.index.tz_convert("UTC")
    
    return df

