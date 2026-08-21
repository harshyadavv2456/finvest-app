"""
Announcements API
Serves insider trades, corporate announcements, and institutional flows.

Data sources:
- InsiderFlow/signals_output/insider_trades_with_flags.csv (SEC for US)
- InsiderFlow/signals_output/13f_holdings_with_flags.csv (13F filings)
- Smart Money Flow/fii_dii_output/ (FII/DII flows)
- Indian_Announcements/insider_filings.csv (NSE insider filings)
- Indian_Announcements/corporate_announcements.csv (NSE corporate announcements)
"""

import os
import time
import logging
import functools
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

import pandas as pd
from fastapi import APIRouter, Query, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


def _ttl_cache(seconds: int):
    """Minimal TTL cache for the zero-argument CSV loader functions below.

    Found live (2026-08-21): the Dashboard fires several of these routes
    concurrently on every page load, and each one re-parses a CSV with
    tens of thousands of rows from disk with plain pandas.read_csv - all
    of it synchronous work inside `async def` handlers, so it blocks
    FastAPI's single event loop instead of running in a thread. Under
    concurrent load that serializes and stacks up past the frontend's
    30s timeout (confirmed: /api/announcements/today alone took >45s).
    The data underneath only refreshes once a day at most, so a cache
    this short still always serves same-day data - it just stops
    re-reading the same unchanged file for every single request.
    """
    def decorator(func):
        cache = {"value": None, "at": 0.0}

        @functools.wraps(func)
        def wrapper():
            now = time.monotonic()
            if cache["value"] is None or (now - cache["at"]) > seconds:
                cache["value"] = func()
                cache["at"] = now
            # Callers mutate columns on the returned df in place (e.g.
            # pd.to_datetime assignment) - hand back a copy so that never
            # corrupts what's cached, even though today's callers happen
            # to do it idempotently.
            v = cache["value"]
            return v.copy() if isinstance(v, pd.DataFrame) else v
        return wrapper
    return decorator

# Paths relative to backend directory
BACKEND_DIR = Path(__file__).parent.parent
FINSIGHT_DIR = BACKEND_DIR.parent
INSIDERFLOW_DIR = FINSIGHT_DIR / "InsiderFlow"
SMARTMONEY_DIR = FINSIGHT_DIR / "Smart Money Flow"
# Indian announcements - primary location (deployed with app)
DATA_ANNOUNCEMENTS_DIR = FINSIGHT_DIR / "data" / "announcements"
# Fallback locations
INDIAN_ANN_DIR = FINSIGHT_DIR / "Indian_Announcements"
INDIAN_ANN_DIR_ALT = FINSIGHT_DIR.parent / "apps" / "finsight" / "Indian Insider + Corporate Announcements" / "indian_market_filings"

logger.info(f"Announcements primary dir: {DATA_ANNOUNCEMENTS_DIR}")
logger.info(f"Announcements primary exists: {DATA_ANNOUNCEMENTS_DIR.exists()}")


@_ttl_cache(300)
def load_insider_trades() -> pd.DataFrame:
    """Load US insider trades from SEC data."""
    trades_file = INSIDERFLOW_DIR / "signals_output" / "insider_trades_with_flags.csv"
    
    if not trades_file.exists():
        logger.warning(f"Insider trades file not found: {trades_file}")
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(trades_file)
        logger.info(f"Loaded {len(df)} US insider trades")
        return df
    except Exception as e:
        logger.error(f"Failed to load insider trades: {e}")
        return pd.DataFrame()


@_ttl_cache(300)
def load_13f_holdings() -> pd.DataFrame:
    """Load 13F hedge fund holdings from CSV."""
    holdings_file = INSIDERFLOW_DIR / "signals_output" / "13f_holdings_with_flags.csv"
    
    if not holdings_file.exists():
        logger.warning(f"13F holdings file not found: {holdings_file}")
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(holdings_file)
        logger.info(f"Loaded {len(df)} 13F holdings")
        return df
    except Exception as e:
        logger.error(f"Failed to load 13F holdings: {e}")
        return pd.DataFrame()


@_ttl_cache(300)
def load_fii_dii_outlook() -> pd.DataFrame:
    """Load FII/DII daily outlook from CSV."""
    fii_dii_dir = SMARTMONEY_DIR / "fii_dii_output"
    outlook_file = fii_dii_dir / "fii_dii_daily_outlook.csv"
    
    if not outlook_file.exists():
        logger.warning(f"FII/DII outlook file not found: {outlook_file}")
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(outlook_file)
        logger.info(f"Loaded {len(df)} FII/DII outlook records")
        return df
    except Exception as e:
        logger.error(f"Failed to load FII/DII outlook: {e}")
        return pd.DataFrame()


@_ttl_cache(300)
def load_indian_insider_filings() -> pd.DataFrame:
    """Load Indian insider filings from NSE data.
    
    CSV columns: timestamp, symbol, company, subject, details, date, attachment, hash
    - timestamp: scrape datetime
    - symbol: stock ticker  
    - details: category (e.g., "Acquisition", "Disclosure under SEBI")
    - attachment: actual announcement text
    """
    # Try paths in order of priority
    paths_to_try = [
        DATA_ANNOUNCEMENTS_DIR / "insider_filings.csv",  # Primary - deployed with app
        INDIAN_ANN_DIR / "insider_filings.csv",
        INDIAN_ANN_DIR_ALT / "insider_filings.csv",
    ]
    
    for filings_file in paths_to_try:
        if filings_file.exists():
            try:
                df = pd.read_csv(filings_file)
                logger.info(f"Loaded {len(df)} Indian insider filings from {filings_file}")
                return df
            except Exception as e:
                logger.error(f"Failed to load from {filings_file}: {e}")
                continue
    
    logger.warning(f"Indian insider filings not found in any location")
    return pd.DataFrame()


@_ttl_cache(300)
def load_indian_corporate_announcements() -> pd.DataFrame:
    """Load Indian corporate announcements from NSE data.
    
    CSV columns: timestamp, symbol, company, subject, details, date, attachment, hash
    - timestamp: scrape datetime
    - symbol: stock ticker
    - details: category (e.g., "Updates", "Credit Rating", "Trading Window")
    - attachment: actual announcement text
    """
    # Try paths in order of priority
    paths_to_try = [
        DATA_ANNOUNCEMENTS_DIR / "corporate_announcements.csv",  # Primary - deployed with app
        INDIAN_ANN_DIR / "corporate_announcements.csv",
        INDIAN_ANN_DIR_ALT / "corporate_announcements.csv",
    ]
    
    for ann_file in paths_to_try:
        if ann_file.exists():
            try:
                df = pd.read_csv(ann_file)
                logger.info(f"Loaded {len(df)} Indian corporate announcements from {ann_file}")
                return df
            except Exception as e:
                logger.error(f"Failed to load from {ann_file}: {e}")
                continue
    
    logger.warning(f"Indian corporate announcements not found in any location")
    return pd.DataFrame()


@router.get("/insider")
async def get_insider_trades(
    market: Optional[str] = Query(None, description="Market filter (US, IN)"),
    symbol: Optional[str] = Query(None, description="Stock symbol filter"),
    days: int = Query(0, description="Days to look back (0 = all data)"),
    limit: int = Query(500, description="Max records to return"),
    signal_type: Optional[str] = Query(None, description="Filter by signal type (bullish, bearish)")
):
    """
    Get insider trades from US (SEC) and India (NSE).
    days=0 returns ALL historical data.
    """
    all_trades = []
    
    # Load US insider trades
    if market is None or market.upper() == "US":
        df = load_insider_trades()
        if not df.empty:
            if 'filingDate' in df.columns:
                df['filingDate'] = pd.to_datetime(df['filingDate'], errors='coerce')
                if days > 0:
                    cutoff_date = datetime.now() - timedelta(days=days)
                    df = df[df['filingDate'] >= cutoff_date]
            
            if symbol:
                symbol_upper = symbol.upper().split('.')[0]
                if 'issuerTradingSymbol' in df.columns:
                    df = df[df['issuerTradingSymbol'].str.upper() == symbol_upper]
            
            if signal_type:
                if signal_type.lower() == 'bullish' and 'is_bullish' in df.columns:
                    df = df[df['is_bullish'] == 1]
                elif signal_type.lower() == 'bearish' and 'is_bearish' in df.columns:
                    df = df[df['is_bearish'] == 1]
            
            for _, row in df.head(limit).iterrows():
                all_trades.append({
                    "symbol": row.get('issuerTradingSymbol', ''),
                    "company_name": row.get('issuerTradingSymbol', ''),
                    "filing_date": row.get('filingDate').isoformat() if pd.notna(row.get('filingDate')) else None,
                    "insider_name": row.get('reportingOwnerName', ''),
                    "relationship": row.get('reportingOwnerRelationship', ''),
                    "transaction_type": row.get('transactionCode', ''),
                    "shares": row.get('transactionShares', 0),
                    "price": row.get('transactionPricePerShare', 0),
                    "value": row.get('transactionValue', 0),
                    "signal": "BULLISH" if row.get('is_bullish') else ("BEARISH" if row.get('is_bearish') else "NEUTRAL"),
                    "source": "SEC",
                    "market": "US"
                })
    
    # Load Indian insider filings
    if market is None or market.upper() == "IN":
        df = load_indian_insider_filings()
        if not df.empty:
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
                if days > 0:
                    cutoff_date = datetime.now() - timedelta(days=days)
                    df = df[df['timestamp'] >= cutoff_date]
            
            if symbol:
                symbol_upper = symbol.upper().split('.')[0]
                if 'symbol' in df.columns:
                    df = df[df['symbol'].str.upper() == symbol_upper]
            
            for _, row in df.head(limit).iterrows():
                category = str(row.get('details', ''))  # 'details' column contains category
                announcement_text = str(row.get('attachment', ''))  # 'attachment' column contains text
                all_trades.append({
                    "symbol": row.get('symbol', ''),
                    "company_name": row.get('company', row.get('symbol', '')),
                    "filing_date": row.get('timestamp').isoformat() if pd.notna(row.get('timestamp')) else None,
                    "insider_name": "",
                    "relationship": "",
                    "transaction_type": category,
                    "shares": 0,
                    "price": 0,
                    "value": 0,
                    "signal": "ACQUISITION" if "acquisition" in category.lower() else (
                        "DISPOSAL" if "disposal" in category.lower() or "sale" in category.lower() else "DISCLOSURE"
                    ),
                    "details": announcement_text,
                    "source": "NSE",
                    "market": "IN"
                })
    
    return {
        "status": "OK",
        "trades": all_trades[:limit],
        "total": len(all_trades),
        "days": days,
        "filters": {
            "symbol": symbol,
            "signal_type": signal_type,
            "market": market
        }
    }


@router.get("/corporate")
async def get_corporate_announcements(
    market: Optional[str] = Query("IN", description="Market filter (IN for now)"),
    symbol: Optional[str] = Query(None, description="Stock symbol filter"),
    category: Optional[str] = Query(None, description="Category filter"),
    days: int = Query(0, description="Days to look back (0 = all data)"),
    limit: int = Query(500, description="Max records to return")
):
    """
    Get corporate announcements (India NSE).
    days=0 returns ALL historical announcements.
    """
    df = load_indian_corporate_announcements()
    
    if df.empty:
        return {
            "status": "NO_DATA",
            "message": "Corporate announcements not available. Run: python Indian_Announcements/run_collector_fixed.py",
            "announcements": [],
            "total": 0
        }
    
    # Filter by date only if days > 0
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
        if days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            df = df[df['timestamp'] >= cutoff_date]
    
    # Filter by symbol
    if symbol:
        symbol_upper = symbol.upper().split('.')[0]
        if 'symbol' in df.columns:
            df = df[df['symbol'].str.upper() == symbol_upper]
    
    # Filter by category (stored in 'details' column)
    if category and 'details' in df.columns:
        df = df[df['details'].str.contains(category, case=False, na=False)]
    
    # Sort by date descending
    if 'timestamp' in df.columns:
        df = df.sort_values('timestamp', ascending=False)
    
    # Convert to records
    # Note: In the CSV, 'details' = category, 'attachment' = actual text
    announcements = []
    for _, row in df.head(limit).iterrows():
        announcements.append({
            "symbol": row.get('symbol', ''),
            "company_name": row.get('company', row.get('symbol', '')),
            "date": row.get('timestamp').isoformat() if pd.notna(row.get('timestamp')) else None,
            "category": row.get('details', ''),  # 'details' column is the category
            "summary": row.get('attachment', ''),  # 'attachment' column is the actual text
            "source": "NSE",
            "market": "IN"
        })
    
    return {
        "status": "OK",
        "announcements": announcements,
        "total": len(announcements),
        "days": days,
        "filters": {
            "symbol": symbol,
            "category": category,
            "market": market
        }
    }


@router.get("/13f")
async def get_13f_holdings(
    symbol: Optional[str] = Query(None, description="Stock symbol filter"),
    fund: Optional[str] = Query(None, description="Fund name filter"),
    limit: int = Query(100, description="Max records to return")
):
    """
    Get 13F hedge fund filings (US only).
    """
    df = load_13f_holdings()
    
    if df.empty:
        return {
            "status": "NO_DATA",
            "message": "13F holdings data not available",
            "holdings": [],
            "total": 0
        }
    
    if symbol and 'ticker' in df.columns:
        symbol_upper = symbol.upper().split('.')[0]
        df = df[df['ticker'].str.upper() == symbol_upper]
    
    if fund and 'fund_name' in df.columns:
        df = df[df['fund_name'].str.contains(fund, case=False, na=False)]
    
    holdings = []
    for _, row in df.head(limit).iterrows():
        holdings.append({
            "symbol": row.get('ticker', ''),
            "cusip": row.get('cusip', ''),
            "fund_name": row.get('fund_name', ''),
            "shares": row.get('shares', 0),
            "value": row.get('value', 0),
            "filing_date": str(row.get('filing_date', '')) if pd.notna(row.get('filing_date')) else None,
            "quarter": row.get('quarter', ''),
            "is_new": bool(row.get('is_new_position', 0)),
            "is_increased": bool(row.get('is_increased', 0)),
            "is_decreased": bool(row.get('is_decreased', 0)),
            "is_sold": bool(row.get('is_sold', 0)),
            "source": "SEC_13F",
            "market": "US"
        })
    
    return {
        "status": "OK",
        "holdings": holdings,
        "total": len(holdings)
    }


@router.get("/fii-dii")
async def get_fii_dii_flows(
    days: int = Query(30, description="Days to look back"),
    limit: int = Query(100, description="Max records to return")
):
    """
    Get FII/DII cash flows for India.
    """
    df = load_fii_dii_outlook()
    
    if df.empty:
        return {
            "status": "NO_DATA",
            "message": "FII/DII data not available. Run: cd 'Smart Money Flow' && python fii_dii_pipeline.py",
            "flows": [],
            "total": 0
        }
    
    if 'trade_date' in df.columns:
        df['trade_date'] = pd.to_datetime(df['trade_date'], errors='coerce')
        df = df.sort_values('trade_date', ascending=False)
        cutoff_date = datetime.now() - timedelta(days=days)
        df = df[df['trade_date'] >= cutoff_date]
    
    flows = []
    for _, row in df.head(limit).iterrows():
        flows.append({
            "date": row.get('trade_date').isoformat() if pd.notna(row.get('trade_date')) else None,
            "fii_buy": row.get('fii_buy', 0),
            "fii_sell": row.get('fii_sell', 0),
            "fii_net": row.get('fii_net', 0),
            "dii_buy": row.get('dii_buy', 0),
            "dii_sell": row.get('dii_sell', 0),
            "dii_net": row.get('dii_net', 0),
            "total_net": row.get('total_net', 0),
            "regime": row.get('regime', ''),
            "nifty_close": row.get('nifty_close', None),
            "source": "NSE",
            "market": "IN"
        })
    
    return {
        "status": "OK",
        "flows": flows,
        "total": len(flows),
        "days": days,
        "latest": flows[0] if flows else None
    }


def get_intelligence_announcements() -> List[Dict]:
    """
    Generate announcements from intelligence data when local files aren't available.
    This provides meaningful content on cloud deployments (Render).
    """
    import json
    announcements = []
    
    intel_dir = FINSIGHT_DIR / "public" / "intelligence"
    
    for market in ["US", "IN"]:
        market_dir = intel_dir / market
        if not market_dir.exists():
            continue
        
        try:
            files = list(market_dir.glob("*.json"))[:50]  # Sample 50 stocks
            for f in files:
                try:
                    with open(f) as fp:
                        data = json.load(fp)
                        intent = data.get("intent", "HOLD")
                        
                        # Create announcement-style entry for notable stocks
                        if intent in ["INITIATE", "AVOID"]:
                            conviction = data.get("conviction", 0)
                            if conviction > 0.5:
                                announcements.append({
                                    "symbol": data.get("ticker", f.stem),
                                    "category": f"Signal: {intent}",
                                    "summary": data.get("rationale", "")[:200],
                                    "date": data.get("as_of_date", datetime.now().strftime("%Y-%m-%d")),
                                    "market": market,
                                    "type": "INTELLIGENCE"
                                })
                except:
                    continue
        except:
            continue
    
    # Sort by date
    announcements.sort(key=lambda x: x.get("date", ""), reverse=True)
    return announcements[:15]


def _sanitize_nan(obj):
    """Recursively replace NaN/inf with None. FastAPI's JSONResponse encoder
    rejects them outright (500, no traceback useful to the client) - Python's
    own json.dumps would silently emit an invalid bareword `NaN` instead,
    which is just as broken for any real JSON consumer. Values here come
    straight out of pandas (row.get(...) on a DataFrame column), which is
    exactly where NaN turns up unannounced."""
    if isinstance(obj, float) and (obj != obj or obj in (float("inf"), float("-inf"))):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_nan(v) for v in obj]
    return obj


@router.get("/today")
async def get_todays_announcements():
    """
    Get all announcements from today/recent.
    Falls back to intelligence-based announcements if local files unavailable.
    """
    results = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "insider_us": {"count": 0, "bullish": 0, "bearish": 0, "trades": []},
        "insider_in": {"count": 0, "filings": []},
        "corporate_in": {"count": 0, "announcements": []},
        "hedge_funds": {"count": 0, "holdings": []},
        "fii_dii": {"latest": None},
        "status": "OK"
    }
    
    has_any_data = False
    
    # US Insider trades (last 7 days)
    us_df = load_insider_trades()
    if not us_df.empty and 'filingDate' in us_df.columns:
        has_any_data = True
        us_df['filingDate'] = pd.to_datetime(us_df['filingDate'], errors='coerce')
        cutoff = datetime.now() - timedelta(days=7)
        recent = us_df[us_df['filingDate'] >= cutoff]
        
        results["insider_us"]["count"] = len(recent)
        results["insider_us"]["bullish"] = int(recent.get('is_bullish', pd.Series()).sum()) if 'is_bullish' in recent.columns else 0
        results["insider_us"]["bearish"] = int(recent.get('is_bearish', pd.Series()).sum()) if 'is_bearish' in recent.columns else 0
        
        for _, row in recent.sort_values('filingDate', ascending=False).head(5).iterrows():
            results["insider_us"]["trades"].append({
                "symbol": row.get('issuerTradingSymbol', ''),
                "insider": row.get('reportingOwnerName', ''),
                "type": "BUY" if row.get('is_bullish') else ("SELL" if row.get('is_bearish') else "OTHER"),
                "value": row.get('transactionValue', 0),
                "date": row.get('filingDate').strftime("%Y-%m-%d") if pd.notna(row.get('filingDate')) else None
            })
    
    # Indian Insider filings (ALL historical data)
    in_insider_df = load_indian_insider_filings()
    if not in_insider_df.empty and 'timestamp' in in_insider_df.columns:
        has_any_data = True
        in_insider_df['timestamp'] = pd.to_datetime(in_insider_df['timestamp'], errors='coerce')
        sorted_df = in_insider_df.sort_values('timestamp', ascending=False)
        
        results["insider_in"]["count"] = len(sorted_df)
        for _, row in sorted_df.head(200).iterrows():
            results["insider_in"]["filings"].append({
                "symbol": row.get('symbol', ''),
                "category": row.get('details', ''),
                "summary": row.get('attachment', '')[:200] if row.get('attachment') else '',
                "date": row.get('timestamp').strftime("%Y-%m-%d") if pd.notna(row.get('timestamp')) else None
            })
    
    # Indian Corporate announcements (ALL historical data)
    corp_df = load_indian_corporate_announcements()
    if not corp_df.empty and 'timestamp' in corp_df.columns:
        has_any_data = True
        corp_df['timestamp'] = pd.to_datetime(corp_df['timestamp'], errors='coerce')
        # Sort by date descending, show ALL records (up to 500 for performance)
        sorted_df = corp_df.sort_values('timestamp', ascending=False)
        
        results["corporate_in"]["count"] = len(sorted_df)
        for _, row in sorted_df.head(500).iterrows():
            results["corporate_in"]["announcements"].append({
                "symbol": row.get('symbol', ''),
                "category": row.get('details', ''),
                "summary": row.get('attachment', '')[:300] if row.get('attachment') else '',
                "date": row.get('timestamp').strftime("%Y-%m-%d") if pd.notna(row.get('timestamp')) else None
            })
    
    # 13F holdings
    holdings_df = load_13f_holdings()
    if not holdings_df.empty:
        has_any_data = True
        results["hedge_funds"]["count"] = len(holdings_df)
    
    # FII/DII latest
    fii_dii_df = load_fii_dii_outlook()
    if not fii_dii_df.empty and 'trade_date' in fii_dii_df.columns:
        has_any_data = True
        fii_dii_df['trade_date'] = pd.to_datetime(fii_dii_df['trade_date'], errors='coerce')
        latest = fii_dii_df.sort_values('trade_date', ascending=False).head(1)
        if not latest.empty:
            row = latest.iloc[0]
            results["fii_dii"]["latest"] = {
                "date": row.get('trade_date').strftime("%Y-%m-%d") if pd.notna(row.get('trade_date')) else None,
                "fii_net": row.get('fii_net', 0),
                "dii_net": row.get('dii_net', 0),
                "regime": row.get('regime', '')
            }
    
    # FALLBACK: Always include intelligence-based announcements if corporate_in is empty
    if not results["corporate_in"]["announcements"]:
        intel_announcements = get_intelligence_announcements()
        if intel_announcements:
            results["corporate_in"]["count"] = len(intel_announcements)
            results["corporate_in"]["announcements"] = intel_announcements
            results["status"] = "OK_INTELLIGENCE_FALLBACK" if not has_any_data else "OK_WITH_FALLBACK"
    
    return _sanitize_nan(results)


@router.get("/{market}/{symbol}")
async def get_stock_announcements(
    market: str,
    symbol: str,
    days: int = Query(90, description="Days to look back")
):
    """
    Get all announcements for a specific stock.
    """
    symbol_upper = symbol.upper().split('.')[0]
    market_upper = market.upper()
    
    result = {
        "symbol": symbol_upper,
        "market": market_upper,
        "insider_trades": [],
        "corporate_announcements": [],
        "hedge_fund_holdings": [],
        "status": "OK"
    }
    
    if market_upper == "US":
        # US insider trades
        insider_df = load_insider_trades()
        if not insider_df.empty and 'issuerTradingSymbol' in insider_df.columns:
            symbol_trades = insider_df[insider_df['issuerTradingSymbol'].str.upper() == symbol_upper]
            if 'filingDate' in symbol_trades.columns:
                symbol_trades['filingDate'] = pd.to_datetime(symbol_trades['filingDate'], errors='coerce')
                cutoff = datetime.now() - timedelta(days=days)
                symbol_trades = symbol_trades[symbol_trades['filingDate'] >= cutoff]
                symbol_trades = symbol_trades.sort_values('filingDate', ascending=False).head(20)
            
            for _, row in symbol_trades.iterrows():
                result["insider_trades"].append({
                    "date": row.get('filingDate').strftime("%Y-%m-%d") if pd.notna(row.get('filingDate')) else None,
                    "insider": row.get('reportingOwnerName', ''),
                    "type": row.get('transactionCode', ''),
                    "shares": row.get('transactionShares', 0),
                    "price": row.get('transactionPricePerShare', 0),
                    "value": row.get('transactionValue', 0),
                    "signal": "BULLISH" if row.get('is_bullish') else ("BEARISH" if row.get('is_bearish') else "NEUTRAL")
                })
        
        # 13F holdings
        holdings_df = load_13f_holdings()
        if not holdings_df.empty and 'ticker' in holdings_df.columns:
            symbol_holdings = holdings_df[holdings_df['ticker'].str.upper() == symbol_upper]
            for _, row in symbol_holdings.head(20).iterrows():
                result["hedge_fund_holdings"].append({
                    "fund": row.get('fund_name', ''),
                    "shares": row.get('shares', 0),
                    "value": row.get('value', 0),
                    "quarter": row.get('quarter', ''),
                    "change": "NEW" if row.get('is_new_position') else (
                        "INCREASED" if row.get('is_increased') else (
                            "DECREASED" if row.get('is_decreased') else "UNCHANGED"
                        )
                    )
                })
    
    elif market_upper == "IN":
        # Indian insider filings
        insider_df = load_indian_insider_filings()
        if not insider_df.empty and 'symbol' in insider_df.columns:
            symbol_filings = insider_df[insider_df['symbol'].str.upper() == symbol_upper]
            if 'timestamp' in symbol_filings.columns:
                symbol_filings['timestamp'] = pd.to_datetime(symbol_filings['timestamp'], errors='coerce')
                cutoff = datetime.now() - timedelta(days=days)
                symbol_filings = symbol_filings[symbol_filings['timestamp'] >= cutoff]
                symbol_filings = symbol_filings.sort_values('timestamp', ascending=False).head(20)
            
            for _, row in symbol_filings.iterrows():
                category = str(row.get('details', ''))  # 'details' column = category
                result["insider_trades"].append({
                    "date": row.get('timestamp').strftime("%Y-%m-%d") if pd.notna(row.get('timestamp')) else None,
                    "type": category,
                    "details": row.get('attachment', ''),  # 'attachment' column = text
                    "signal": "ACQUISITION" if "acquisition" in category.lower() else "DISCLOSURE"
                })
        
        # Indian corporate announcements
        corp_df = load_indian_corporate_announcements()
        if not corp_df.empty and 'symbol' in corp_df.columns:
            symbol_ann = corp_df[corp_df['symbol'].str.upper() == symbol_upper]
            if 'timestamp' in symbol_ann.columns:
                symbol_ann['timestamp'] = pd.to_datetime(symbol_ann['timestamp'], errors='coerce')
                cutoff = datetime.now() - timedelta(days=days)
                symbol_ann = symbol_ann[symbol_ann['timestamp'] >= cutoff]
                symbol_ann = symbol_ann.sort_values('timestamp', ascending=False).head(20)
            
            for _, row in symbol_ann.iterrows():
                result["corporate_announcements"].append({
                    "date": row.get('timestamp').strftime("%Y-%m-%d") if pd.notna(row.get('timestamp')) else None,
                    "category": row.get('details', ''),  # 'details' column = category
                    "summary": row.get('attachment', '')  # 'attachment' column = text
                })
    
    return result
