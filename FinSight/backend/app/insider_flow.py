"""
InsiderFlow API - SEC Form 4 Insider Trading & 13F Hedge Fund Analysis
Smart Money Flow API - FII/DII Daily Analysis
"""
import os
import time
import pandas as pd
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

_csv_cache: dict = {}
_CSV_CACHE_TTL_SECONDS = 300


def _read_csv_cached(path: Path) -> pd.DataFrame:
    """pd.read_csv with a short TTL cache, keyed by path.

    Found live (2026-08-21): the Dashboard fires several InsiderFlow
    routes concurrently on every load, each re-parsing the same
    tens-of-thousands-row CSVs from disk synchronously inside an
    `async def` handler - that blocks FastAPI's single event loop, and
    concurrent requests stack up past the frontend's 30s timeout. These
    files only change once a day at most, so a short cache is always
    same-day-accurate while cutting repeated parses. Returns a copy so
    callers filtering/mutating in place never corrupt the cached df.
    """
    key = str(path)
    now = time.monotonic()
    cached = _csv_cache.get(key)
    if cached is None or (now - cached[1]) > _CSV_CACHE_TTL_SECONDS:
        df = pd.read_csv(path)
        _csv_cache[key] = (df, now)
        return df.copy()
    return cached[0].copy()

# Data paths - Find the project root dynamically
def get_project_root():
    """Find project root by looking for InsiderFlow folder"""
    # Start from this file's directory
    current = Path(__file__).resolve().parent
    
    # Try multiple approaches
    search_paths = [
        current,
        current.parent,  # backend/app -> backend
        current.parent.parent,  # backend/app -> project root
        current.parent.parent.parent,  # Just in case
        Path("/opt/render/project/src"),  # Render deployment path
        Path.cwd(),  # Current working directory
    ]
    
    for path in search_paths:
        if (path / "InsiderFlow" / "signals_output").exists():
            logger.info(f"Found InsiderFlow at: {path}")
            return path
        if (path / "Smart Money Flow" / "fii_dii_output").exists():
            logger.info(f"Found Smart Money Flow at: {path}")
            return path
    
    # Last resort - go up from backend
    backend_parent = Path(__file__).resolve().parent.parent.parent
    logger.warning(f"Using fallback project root: {backend_parent}")
    return backend_parent

BASE_DIR = get_project_root()
INSIDER_SIGNALS_DIR = BASE_DIR / "InsiderFlow" / "signals_output"
# Look for FII/DII output in multiple locations
_SM_PRIMARY = BASE_DIR / "Smart Money Flow" / "fii_dii_output"
_SM_FALLBACK = BASE_DIR / "data" / "smart_money"
SMART_MONEY_DIR = _SM_PRIMARY if _SM_PRIMARY.exists() else _SM_FALLBACK

logger.info(f"InsiderFlow BASE_DIR: {BASE_DIR}")
logger.info(f"InsiderFlow INSIDER_SIGNALS_DIR: {INSIDER_SIGNALS_DIR}, exists: {INSIDER_SIGNALS_DIR.exists()}")
logger.info(f"SmartMoney SMART_MONEY_DIR: {SMART_MONEY_DIR}, exists: {SMART_MONEY_DIR.exists()}")

# ============================================================================
# INSIDER FLOW (SEC Form 4 + 13F)
# ============================================================================

def load_insider_signals(days: int = 90) -> list[dict]:
    """Load recent insider daily signals from SEC Form 4 data.
    Falls back to latest available if nothing in requested window."""
    try:
        signals_file = INSIDER_SIGNALS_DIR / "insider_daily_signals.csv"
        logger.info(f"Loading insider signals from: {signals_file}, exists: {signals_file.exists()}")
        
        if not signals_file.exists():
            logger.warning(f"Insider signals file not found: {signals_file}")
            return []
            
        df = _read_csv_cached(signals_file)
        logger.info(f"Loaded {len(df)} rows from insider_daily_signals.csv")
        
        df['eventDate'] = pd.to_datetime(df['eventDate'], errors='coerce')
        df = df.dropna(subset=['eventDate'])
        cutoff = datetime.now() - timedelta(days=days)
        filtered = df[df['eventDate'] >= cutoff]
        
        if filtered.empty and not df.empty:
            logger.info(f"No signals in last {days} days, showing latest available")
            filtered = df.sort_values('eventDate', ascending=False).head(200)
        else:
            filtered = filtered.copy()
        
        filtered = filtered.sort_values(['eventDate', 'net_signal_strength'], ascending=[False, False])
        
        # Get top signals
        result = []
        for _, row in filtered.head(200).iterrows():
            result.append({
                "symbol": row['issuerTradingSymbol'],
                "date": row['eventDate'].strftime('%Y-%m-%d'),
                "num_trades": int(row['num_trades']) if pd.notna(row['num_trades']) else 0,
                "num_bullish": int(row['num_bullish']) if pd.notna(row['num_bullish']) else 0,
                "num_bearish": int(row['num_bearish']) if pd.notna(row['num_bearish']) else 0,
                "total_buy_value": float(row['total_buy_value']) if pd.notna(row['total_buy_value']) else 0,
                "total_sell_value": float(row['total_sell_value']) if pd.notna(row['total_sell_value']) else 0,
                "signal_strength": round(float(row['net_signal_strength']), 2) if pd.notna(row['net_signal_strength']) else 0,
                "cluster_buy": bool(row['has_cluster_buy']) if pd.notna(row['has_cluster_buy']) else False,
                "cluster_sell": bool(row['has_cluster_sell']) if pd.notna(row['has_cluster_sell']) else False,
            })
        logger.info(f"Returning {len(result)} insider signals")
        return result
    except Exception as e:
        logger.error(f"Error loading insider signals: {e}", exc_info=True)
        return []

def load_insider_trades(days: int = 30, limit: int = 100) -> list[dict]:
    """Load recent insider trades from SEC Form 4 data.
    Falls back to showing latest available trades if none found in requested window."""
    try:
        trades_file = INSIDER_SIGNALS_DIR / "insider_trades_with_flags.csv"
        logger.info(f"Loading insider trades from: {trades_file}, exists: {trades_file.exists()}")
        
        if not trades_file.exists():
            logger.warning(f"Insider trades file not found: {trades_file}")
            return []
            
        df = _read_csv_cached(trades_file)
        logger.info(f"Loaded {len(df)} rows from insider_trades_with_flags.csv")
        
        df['transactionDate'] = pd.to_datetime(df['transactionDate'], errors='coerce')
        df = df.dropna(subset=['transactionDate'])

        # Filter to buy/sell only (not compensation). Current CSV schema
        # (as of the pipeline that generates insider_trades_with_flags.csv)
        # carries this as signalCategory=='compensation', not a boolean
        # is_compensation column - support both so this survives either
        # schema without silently returning nothing again.
        if 'is_compensation' in df.columns:
            df = df[df['is_compensation'] == 0]
        elif 'signalCategory' in df.columns:
            df = df[df['signalCategory'] != 'compensation']

        # Try requested window first
        cutoff = datetime.now() - timedelta(days=days)
        filtered = df[df['transactionDate'] >= cutoff]

        # If no data in requested window, show the most recent data available
        if filtered.empty and not df.empty:
            logger.info(f"No trades in last {days} days, showing latest available data")
            filtered = df.sort_values('transactionDate', ascending=False).head(limit)

        filtered = filtered.copy()
        # transactionValueAbs isn't in the current schema either - derive it
        # from transactionValue (present) rather than requiring the old name.
        if 'transactionValueAbs' not in filtered.columns:
            filtered['transactionValueAbs'] = filtered.get('transactionValue', 0).abs()
        filtered['transactionValueAbs'] = filtered['transactionValueAbs'].fillna(0)
        filtered = filtered.sort_values('transactionValueAbs', ascending=False)

        result = []
        for _, row in filtered.head(limit).iterrows():
            if 'is_bullish' in row and pd.notna(row.get('is_bullish')):
                trade_type = "BUY" if row['is_bullish'] == 1 else "SELL"
            else:
                trade_type = "BUY" if row.get('signalCategory') == 'bullish' else "SELL"
            result.append({
                "symbol": row['issuerTradingSymbol'],
                "insider": row['reportingOwnerName'] if pd.notna(row['reportingOwnerName']) else 'Unknown',
                "date": row['transactionDate'].strftime('%Y-%m-%d'),
                "type": trade_type,
                "shares": int(row['transactionShares']) if pd.notna(row['transactionShares']) else 0,
                "price": round(float(row['transactionPricePerShare']), 2) if pd.notna(row['transactionPricePerShare']) else 0,
                "value": float(row['transactionValueAbs']) if pd.notna(row['transactionValueAbs']) else 0,
            })
        logger.info(f"Returning {len(result)} insider trades")
        return result
    except Exception as e:
        logger.error(f"Error loading insider trades: {e}", exc_info=True)
        return []

def load_13f_signals(days: int = 180) -> list[dict]:
    """Load 13F hedge fund position signals with ticker mapping"""
    try:
        from app.cusip_mapper import cusip_to_ticker, enrich_13f_with_tickers
        
        signals_file = INSIDER_SIGNALS_DIR / "13f_asset_signals.csv"
        holdings_file = INSIDER_SIGNALS_DIR / "13f_holdings_with_flags.csv"
        
        logger.info(f"Loading 13F signals from: {signals_file}, exists: {signals_file.exists()}")
        
        if not signals_file.exists():
            logger.warning(f"13F signals file not found: {signals_file}")
            return []
            
        df = _read_csv_cached(signals_file)
        logger.info(f"Loaded {len(df)} rows from 13f_asset_signals.csv")
        
        # Load holdings for names
        cusip_to_name = {}
        if holdings_file.exists():
            holdings_df = _read_csv_cached(holdings_file)
            cusip_to_name = dict(zip(holdings_df['cusip'], holdings_df['nameOfIssuer']))
        
        df['filingDate'] = pd.to_datetime(df['filingDate'], errors='coerce')
        df = df.dropna(subset=['filingDate'])
        cutoff = datetime.now() - timedelta(days=days)
        filtered = df[df['filingDate'] >= cutoff]
        
        if filtered.empty and not df.empty:
            logger.info(f"No 13F signals in last {days} days, showing latest available")
            filtered = df.copy()
        else:
            filtered = filtered.copy()
        
        filtered = filtered.sort_values('filingDate', ascending=False)
        df = filtered.drop_duplicates(subset=['assetId'], keep='first')
        
        # Sort by total position value
        df = df.sort_values('total_position_value', ascending=False)
        
        result = []
        tickers_found = 0
        for _, row in df.head(100).iterrows():
            cusip = row['assetId']
            name = cusip_to_name.get(cusip, cusip)
            name_str = name if pd.notna(name) else str(cusip)
            
            # Get ticker from CUSIP mapper
            ticker = cusip_to_ticker(cusip, name_str)
            if ticker:
                tickers_found += 1
                logger.info(f"Mapped {name_str} -> {ticker}")
            
            result.append({
                "cusip": cusip,
                "ticker": ticker,  # New field - mapped ticker symbol
                "name": name_str,
                "date": row['filingDate'].strftime('%Y-%m-%d'),
                "num_funds": int(row['num_funds']) if pd.notna(row['num_funds']) else 0,
                "total_value": float(row['total_position_value']) if pd.notna(row['total_position_value']) else 0,
                "increases": int(row['num_increases']) if pd.notna(row['num_increases']) else 0,
                "decreases": int(row['num_decreases']) if pd.notna(row['num_decreases']) else 0,
                "new_positions": int(row['num_new']) if pd.notna(row['num_new']) else 0,
                "exits": int(row['num_exits']) if pd.notna(row['num_exits']) else 0,
                "net_flow": int(row['net_fund_flow_count']) if pd.notna(row['net_fund_flow_count']) else 0,
            })
        logger.info(f"Returning {len(result)} 13F signals with {tickers_found} tickers mapped")
        return result
    except Exception as e:
        logger.error(f"Error loading 13F signals: {e}", exc_info=True)
        return []

def get_insider_summary() -> dict:
    """Get summary stats for insider trading"""
    try:
        signals = load_insider_signals(days=30)
        trades = load_insider_trades(days=30)
        
        bullish = sum(1 for s in signals if s['signal_strength'] > 0)
        bearish = sum(1 for s in signals if s['signal_strength'] < 0)
        cluster_buys = sum(1 for s in signals if s['cluster_buy'])
        cluster_sells = sum(1 for s in signals if s['cluster_sell'])
        
        total_buy = sum(t['value'] for t in trades if t['type'] == 'BUY')
        total_sell = sum(t['value'] for t in trades if t['type'] == 'SELL')
        
        return {
            "bullish_signals": bullish,
            "bearish_signals": bearish,
            "cluster_buys": cluster_buys,
            "cluster_sells": cluster_sells,
            "total_buy_value": total_buy,
            "total_sell_value": total_sell,
            "total_trades": len(trades),
        }
    except Exception as e:
        logger.error(f"Error in get_insider_summary: {e}")
        return {"error": str(e)}

# ============================================================================
# SMART MONEY FLOW (FII/DII)
# ============================================================================

def _normalize_date_str(raw) -> str:
    """Normalize any date value to YYYY-MM-DD string."""
    if pd.isna(raw):
        return ""
    try:
        ts = pd.Timestamp(raw)
        if pd.isna(ts):
            return str(raw).split(" ")[0].split("T")[0]
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return str(raw).split(" ")[0].split("T")[0]

def load_fii_dii_daily() -> list[dict]:
    """Load FII/DII daily cash data"""
    try:
        cash_file = SMART_MONEY_DIR / "fii_dii_cash_history.csv"
        logger.info(f"Loading FII/DII cash from: {cash_file}, exists: {cash_file.exists()}")
        
        if not cash_file.exists():
            logger.warning(f"FII/DII cash file not found: {cash_file}")
            return []
            
        df = _read_csv_cached(cash_file)
        logger.info(f"Loaded {len(df)} rows from fii_dii_cash_history.csv")

        # Normalize all trade_date values to YYYY-MM-DD
        df['trade_date_norm'] = df['trade_date'].apply(_normalize_date_str)
        
        result = []
        dates = df['trade_date_norm'].unique()
        
        for date_str in dates:
            if not date_str:
                continue
            date_data = df[df['trade_date_norm'] == date_str]
            fii_row = date_data[date_data['category'].str.contains('FII', case=False, na=False)]
            dii_row = date_data[date_data['category'].str.contains('DII', case=False, na=False)]
            
            fii_buy = float(fii_row['buyValue'].iloc[0]) if len(fii_row) > 0 and pd.notna(fii_row['buyValue'].iloc[0]) else 0
            fii_sell = float(fii_row['sellValue'].iloc[0]) if len(fii_row) > 0 and pd.notna(fii_row['sellValue'].iloc[0]) else 0
            fii_net = float(fii_row['netValue'].iloc[0]) if len(fii_row) > 0 and pd.notna(fii_row['netValue'].iloc[0]) else 0
            
            dii_buy = float(dii_row['buyValue'].iloc[0]) if len(dii_row) > 0 and pd.notna(dii_row['buyValue'].iloc[0]) else 0
            dii_sell = float(dii_row['sellValue'].iloc[0]) if len(dii_row) > 0 and pd.notna(dii_row['sellValue'].iloc[0]) else 0
            dii_net = float(dii_row['netValue'].iloc[0]) if len(dii_row) > 0 and pd.notna(dii_row['netValue'].iloc[0]) else 0
            
            result.append({
                "date": date_str,
                "fii_buy": fii_buy,
                "fii_sell": fii_sell,
                "fii_net": fii_net,
                "dii_buy": dii_buy,
                "dii_sell": dii_sell,
                "dii_net": dii_net,
                "total_net": fii_net + dii_net,
            })
        
        result.sort(key=lambda x: x['date'], reverse=True)
        logger.info(f"Returning {len(result)} FII/DII daily records")
        return result
    except Exception as e:
        logger.error(f"Error loading FII/DII daily: {e}", exc_info=True)
        return []

def load_fii_dii_outlook() -> dict:
    """Load FII/DII daily outlook with regime and signals"""
    try:
        outlook_file = SMART_MONEY_DIR / "fii_dii_daily_outlook.csv"
        logger.info(f"Loading FII/DII outlook from: {outlook_file}, exists: {outlook_file.exists()}")
        
        if not outlook_file.exists():
            logger.warning(f"FII/DII outlook file not found: {outlook_file}")
            return {}
            
        df = _read_csv_cached(outlook_file)
        logger.info(f"Loaded {len(df)} rows from fii_dii_daily_outlook.csv")
        
        if df.empty:
            return {}
        
        # Get latest row
        latest = df.iloc[-1]
        
        return {
            "date": _normalize_date_str(latest.get('trade_date', '')),
            "fii_net": float(latest.get('fii_net', 0)) if pd.notna(latest.get('fii_net')) else 0,
            "dii_net": float(latest.get('dii_net', 0)) if pd.notna(latest.get('dii_net')) else 0,
            "total_net": float(latest.get('total_net', 0)) if pd.notna(latest.get('total_net')) else 0,
            "fii_roll5": float(latest.get('fii_roll5', 0)) if pd.notna(latest.get('fii_roll5')) else 0,
            "dii_roll5": float(latest.get('dii_roll5', 0)) if pd.notna(latest.get('dii_roll5')) else 0,
            "fii_roll20": float(latest.get('fii_roll20', 0)) if pd.notna(latest.get('fii_roll20')) else 0,
            "dii_roll20": float(latest.get('dii_roll20', 0)) if pd.notna(latest.get('dii_roll20')) else 0,
            "regime": str(latest.get('regime', 'unknown')),
            "flow_signal": str(latest.get('flow_signal', 'unknown')),
        }
    except Exception as e:
        logger.error(f"Error loading FII/DII outlook: {e}", exc_info=True)
        return {}

def load_fii_dii_signals() -> list[dict]:
    """Load FII/DII signals with rolling averages"""
    try:
        signals_file = SMART_MONEY_DIR / "fii_dii_cash_signals.csv"
        logger.info(f"Loading FII/DII signals from: {signals_file}, exists: {signals_file.exists()}")
        
        if not signals_file.exists():
            logger.warning(f"FII/DII signals file not found: {signals_file}")
            return []
            
        df = _read_csv_cached(signals_file)
        logger.info(f"Loaded {len(df)} rows from fii_dii_cash_signals.csv")
        
        result = []
        for _, row in df.iterrows():
            result.append({
                "date": _normalize_date_str(row.get('trade_date', '')),
                "category": str(row.get('category', '')),
                "buy_value": float(row.get('buyValue', 0)) if pd.notna(row.get('buyValue')) else 0,
                "sell_value": float(row.get('sellValue', 0)) if pd.notna(row.get('sellValue')) else 0,
                "net_value": float(row.get('netValue', 0)) if pd.notna(row.get('netValue')) else 0,
                "net_roll5": float(row.get('netValue_roll5', 0)) if pd.notna(row.get('netValue_roll5')) else 0,
                "net_roll20": float(row.get('netValue_roll20', 0)) if pd.notna(row.get('netValue_roll20')) else 0,
            })
        
        logger.info(f"Returning {len(result)} FII/DII signal records")
        return result
    except Exception as e:
        logger.error(f"Error loading FII/DII signals: {e}", exc_info=True)
        return []

def get_fii_dii_summary() -> dict:
    """Get summary stats for FII/DII flows"""
    try:
        daily = load_fii_dii_daily()
        outlook = load_fii_dii_outlook()
        
        if not daily:
            return {"error": "No FII/DII data available"}
        
        latest = daily[0] if daily else {}
        
        # Calculate totals for last 5 and 20 days
        last_5 = daily[:5]
        last_20 = daily[:20]
        
        fii_5d = sum(d.get('fii_net', 0) for d in last_5)
        dii_5d = sum(d.get('dii_net', 0) for d in last_5)
        fii_20d = sum(d.get('fii_net', 0) for d in last_20)
        dii_20d = sum(d.get('dii_net', 0) for d in last_20)
        
        return {
            "latest_date": latest.get('date', ''),
            "fii_today": latest.get('fii_net', 0),
            "dii_today": latest.get('dii_net', 0),
            "total_today": latest.get('total_net', 0),
            "fii_5d": fii_5d,
            "dii_5d": dii_5d,
            "fii_20d": fii_20d,
            "dii_20d": dii_20d,
            "regime": outlook.get('regime', 'unknown'),
            "flow_signal": outlook.get('flow_signal', 'unknown'),
            "data_days": len(daily),
        }
    except Exception as e:
        logger.error(f"Error in get_fii_dii_summary: {e}")
        return {"error": str(e)}


