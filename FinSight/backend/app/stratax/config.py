"""
StrataX Configuration Module

Controls data source selection via environment variable STRATAX_DATA_SOURCE.

Allowed values:
- "mock": Use mock data provider
- "nse": Use NSE real-time data fetcher

Default: "mock" if env var not set or invalid.

To switch data sources:
1. Set environment variable: STRATAX_DATA_SOURCE=nse
2. Restart backend server
3. Check /api/stratax/data-status endpoint to verify

If NSE fails, the system will return an error (no automatic fallback to mock).
"""

import os
import logging
from typing import Literal

logger = logging.getLogger(__name__)

# Allowed data source values
DataSource = Literal["mock", "nse"]

# Read configuration from environment - default to nse for real data
_STRATAX_DATA_SOURCE = os.getenv("STRATAX_DATA_SOURCE", "nse").lower().strip()

# Validate and set data source
if _STRATAX_DATA_SOURCE not in ["mock", "nse"]:
    logger.warning(
        f"Invalid STRATAX_DATA_SOURCE value: '{_STRATAX_DATA_SOURCE}'. "
        f"Allowed values: 'mock', 'nse'. Defaulting to 'mock'."
    )
    _STRATAX_DATA_SOURCE = "mock"

# Export the configured data source
STRATAX_DATA_SOURCE: DataSource = _STRATAX_DATA_SOURCE  # type: ignore

logger.info(f"StrataX data source configured: {STRATAX_DATA_SOURCE}")

