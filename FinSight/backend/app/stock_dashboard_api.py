"""
Stock Dashboard API
====================
Consolidated endpoint that returns ALL data we have for a single stock:
  - Screener metrics
  - Intelligence (14-layer signals)
  - IntrinsIQ valuation
  - StrataX options (if available)
  - Fundamentals, technicals, price history
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.data_access import load_daily, load_technicals, load_fundamentals, load_metadata, load_news
from app.screener_engine import compute_screener_row
from app.intrinsiq_api import compute_valuation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stock-dashboard", tags=["Stock Dashboard"])

PROJECT_ROOT = Path(__file__).parent.parent.parent
INTELLIGENCE_DIR = PROJECT_ROOT / "public" / "intelligence"
STRATAX_DIR = PROJECT_ROOT / "backend" / "data" / "stratax_cache"


def _load_intel(ticker: str, market: str) -> Dict[str, Any]:
    for m in [market, "IN", "US"]:
        fpath = INTELLIGENCE_DIR / m / f"{ticker}.json"
        if fpath.exists():
            try:
                return json.loads(fpath.read_text(encoding="utf-8"))
            except Exception:
                pass
    return {}


def _load_stratax(ticker: str) -> Dict[str, Any]:
    symbol = ticker.replace(".NS", "")
    fpath = STRATAX_DIR / f"{symbol}.json"
    if fpath.exists():
        try:
            return json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


@router.get("/{ticker}")
async def get_stock_dashboard(ticker: str, market: Optional[str] = None):
    """
    Returns everything we know about a stock in a single call.
    Used by the Technical Dashboard page.
    """
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker required")

    # Load raw data
    metadata = load_metadata(ticker, market)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")

    detected_market = metadata.get("market", market or "US")
    daily_df = load_daily(ticker, detected_market)
    tech_df = load_technicals(ticker, detected_market)
    fundamentals = load_fundamentals(ticker, detected_market) or {}
    news = load_news(ticker, detected_market) or []

    # Screener metrics
    screener = {}
    if daily_df is not None and not daily_df.empty:
        try:
            screener = compute_screener_row(ticker, daily_df, tech_df, fundamentals, metadata)
        except Exception as e:
            logger.warning(f"Screener computation failed for {ticker}: {e}")

    # Intelligence
    intel = _load_intel(ticker, detected_market)

    # IntrinsIQ valuation
    valuation = compute_valuation(ticker)
    if "error" in valuation:
        valuation = {}

    # StrataX options
    stratax = _load_stratax(ticker)

    # Price summary
    price_summary = {}
    if daily_df is not None and not daily_df.empty:
        close_col = "Adj Close" if "Adj Close" in daily_df.columns else "Close"
        if close_col in daily_df.columns:
            prices = daily_df[close_col]
            current = float(prices.iloc[-1])
            price_summary = {
                "current": current,
                "change_1d": float(prices.iloc[-1] - prices.iloc[-2]) if len(prices) > 1 else 0,
                "change_1d_pct": float((prices.iloc[-1] / prices.iloc[-2] - 1) * 100) if len(prices) > 1 else 0,
                "high_52w": float(prices.tail(252).max()) if len(prices) >= 252 else float(prices.max()),
                "low_52w": float(prices.tail(252).min()) if len(prices) >= 252 else float(prices.min()),
                "sma20": float(prices.tail(20).mean()),
                "sma50": float(prices.tail(50).mean()) if len(prices) >= 50 else None,
                "sma200": float(prices.tail(200).mean()) if len(prices) >= 200 else None,
            }

    return {
        "ticker": ticker,
        "market": detected_market,
        "companyName": screener.get("company_name") or metadata.get("ticker", ticker),
        "metadata": metadata,
        "price": price_summary,
        "screener": screener,
        "intelligence": {
            "intent": intel.get("intent"),
            "conviction": intel.get("conviction"),
            "conviction_pct": intel.get("conviction_pct"),
            "direction": intel.get("direction"),
            "asset_regime": intel.get("asset_regime"),
            "market_regime": intel.get("market_regime"),
            "volatility_regime": intel.get("volatility_regime"),
            "cvar_95": intel.get("cvar_95"),
            "supporting_signals": intel.get("supporting_signals", []),
            "opposing_signals": intel.get("opposing_signals", []),
            "explanation": intel.get("explanation"),
        } if intel else None,
        "valuation": {
            "intrinsicValue": valuation.get("intrinsicValue"),
            "marginOfSafety": valuation.get("marginOfSafety"),
            "recommendation": valuation.get("recommendation"),
            "methods": valuation.get("methods", []),
            "regime": valuation.get("regime"),
        } if valuation else None,
        "stratax": {
            "available": bool(stratax),
            "data": stratax if stratax else None,
        },
        "news": news[:10] if news else [],
        "timestamp": datetime.now().isoformat(),
    }
