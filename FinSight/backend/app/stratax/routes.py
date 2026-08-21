"""
FastAPI routes for StrataX module.
"""

import json
import logging
from typing import List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.concurrency import run_in_threadpool
from app.stratax.schemas import OptionChainResponse, StrataXOptionRow, PaperTrade
from app.stratax.csv_data_provider import (
    get_option_chain_from_csv,
    get_available_symbols_from_csv,
    get_available_expiries_from_csv,
    clear_csv_cache,
    get_current_csv_file_info,
)
from app.stratax.ai_analyzer import analyze_option_chain, analyze_strategy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stratax", tags=["stratax"])

# Paper trades storage (file-based for v1, can be migrated to DB later)
PAPER_TRADES_FILE = Path(__file__).parent.parent.parent / "data" / "stratax_paper_trades.json"


@router.get("/option-chain", response_model=OptionChainResponse)
async def get_option_chain_endpoint(
    symbol: str = Query(..., description="Symbol (e.g., NIFTY, BANKNIFTY, RELIANCE)"),
):
    """
    Get option chain data for a symbol.

    AngelOne first (Workstream D4 - real-time reconstruction from the
    instrument master + batched quotes, only supports NIFTY/BANKNIFTY
    currently), falling back to the CSV snapshot for anything AngelOne
    doesn't cover or if it's unavailable - same fallback discipline as
    the rest of angelone_provider.py. Both paths return the exact same
    row shape, so this is invisible to the frontend either way.
    """
    symbol_upper = symbol.upper()

    try:
        rows = []
        source = "csv"
        if symbol_upper in ("NIFTY", "BANKNIFTY"):
            try:
                from app.angelone_option_chain import get_option_chain
                rows = await run_in_threadpool(get_option_chain, symbol_upper)
                if rows:
                    source = "angelone"
            except Exception as e:  # noqa: BLE001
                logger.warning(f"AngelOne option chain failed for {symbol_upper}, falling back to CSV: {e}")

        if not rows:
            rows = get_option_chain_from_csv(symbol_upper)
            source = "csv"

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"No option chain data found for symbol: {symbol_upper}"
            )

        # Convert to Pydantic models
        option_rows = [StrataXOptionRow(**row) for row in rows]

        logger.info(f"Returned {len(option_rows)} option rows for {symbol_upper} from {source}")
        return OptionChainResponse(rows=option_rows)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching option chain for {symbol_upper}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching option chain: {str(e)}"
        )


@router.get("/underlyings")
async def get_underlyings():
    """Get list of available symbols from CSV."""
    try:
        symbols = get_available_symbols_from_csv()
        if not symbols:
            # Fallback to default list if CSV is empty
            return ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]
        return symbols
    except Exception as e:
        logger.error(f"Error getting symbols: {e}")
        return ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]


@router.get("/expiries")
async def get_expiries(symbol: str = Query(..., description="Symbol")):
    """Get available expiry dates for a symbol - AngelOne (real, current
    weekly/monthly expiries) for NIFTY/BANKNIFTY, CSV fallback otherwise."""
    symbol_upper = symbol.upper()
    if symbol_upper in ("NIFTY", "BANKNIFTY"):
        try:
            from app.angelone_option_chain import get_available_expiries
            expiries = await run_in_threadpool(get_available_expiries, symbol_upper)
            if expiries:
                return [_parse_expiry_display(e) for e in expiries]
        except Exception as e:  # noqa: BLE001
            logger.warning(f"AngelOne expiries failed for {symbol_upper}, falling back to CSV: {e}")

    try:
        expiries = get_available_expiries_from_csv(symbol)
        return expiries
    except Exception as e:
        logger.error(f"Error getting expiries for {symbol}: {e}")
        return []


def _parse_expiry_display(angelone_expiry: str) -> str:
    """'29DEC2026' -> '2026-12-29', matching the CSV path's date format."""
    from datetime import datetime
    try:
        return datetime.strptime(angelone_expiry, "%d%b%Y").strftime("%Y-%m-%d")
    except ValueError:
        return angelone_expiry


def load_paper_trades() -> List[dict]:
    """Load paper trades from file."""
    if not PAPER_TRADES_FILE.exists():
        return []
    try:
        with open(PAPER_TRADES_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return []


def save_paper_trades(trades: List[dict]):
    """Save paper trades to file."""
    PAPER_TRADES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PAPER_TRADES_FILE, 'w') as f:
        json.dump(trades, f, indent=2)


@router.get("/paper-trades", response_model=List[PaperTrade])
async def get_paper_trades():
    """Get all paper trades."""
    trades = load_paper_trades()
    return trades


@router.post("/paper-trades", response_model=PaperTrade)
async def create_paper_trade(trade: PaperTrade = Body(...)):
    """Create a new paper trade."""
    trades = load_paper_trades()
    trades.append(trade.dict())
    save_paper_trades(trades)
    return trade


@router.delete("/paper-trades/{trade_id}")
async def delete_paper_trade(trade_id: str):
    """Delete a paper trade by ID."""
    trades = load_paper_trades()
    filtered = [t for t in trades if t.get('id') != trade_id]
    if len(filtered) == len(trades):
        raise HTTPException(status_code=404, detail=f"Paper trade {trade_id} not found")
    save_paper_trades(filtered)
    return {"message": "Paper trade deleted"}


@router.get("/data-status")
async def get_data_status():
    """
    Get current data source status - AngelOne (Workstream D) health plus
    the CSV fallback's own file info, so an all-fallback state is
    visible rather than silent (D5's own requirement - the same "don't
    let a degraded state go unnoticed" discipline as
    angelone_provider.py's health_status()).
    """
    from app.stratax.csv_data_provider import load_csv_data
    from app.angelone_provider import health_status as angelone_health_status

    csv_data = load_csv_data()
    file_info = get_current_csv_file_info()
    angelone_status = angelone_health_status()
    last_source = angelone_status.get("last_source_used", {})

    return {
        "active_source": last_source.get("source") or ("angelone" if angelone_status.get("session_active") else "csv"),
        "angelone_configured": angelone_status.get("angelone_configured", False),
        "angelone_session_active": angelone_status.get("session_active", False),
        "last_source_used": last_source,
        # Kept for backward compatibility with anything still reading the
        # old field names - nse_available was always about the retired
        # direct-scrape path, not AngelOne, so it stays false/None; the
        # real signal now is angelone_session_active above.
        "fallback_used_recently": last_source.get("source") == "csv",
        "last_successful_nse_fetch": None,
        "nse_available": False,
        "csv_rows_loaded": len(csv_data),
        "csv_file": file_info.get("file"),
        "csv_last_modified": file_info.get("last_modified"),
    }


@router.post("/refresh-data")
async def refresh_data():
    """
    Clear CSV cache and reload data from latest file.
    Call this after auto-refresh updates the CSV files.
    """
    clear_csv_cache()
    from app.stratax.csv_data_provider import load_csv_data
    csv_data = load_csv_data()
    file_info = get_current_csv_file_info()
    
    return {
        "message": "Data refreshed successfully",
        "csv_rows_loaded": len(csv_data),
        "csv_file": file_info.get("file"),
        "csv_last_modified": file_info.get("last_modified"),
    }


@router.post("/analyze-option-chain")
async def analyze_option_chain_endpoint(
    request: dict = Body(...),
):
    """
    Analyze option chain using Groq AI.
    """
    try:
        symbol = request.get('symbol', '').upper()
        spot_price = float(request.get('spot_price', 0))
        
        if not symbol:
            raise HTTPException(status_code=400, detail="Symbol is required")
        if spot_price <= 0:
            raise HTTPException(status_code=400, detail="Valid spot price is required")
        
        rows = get_option_chain_from_csv(symbol)
        if not rows:
            raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
        
        # Convert to dict format for AI (rows are already dicts from CSV)
        option_data = rows
        
        analysis = analyze_option_chain(symbol, option_data, spot_price)
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in AI analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/analyze-strategy")
async def analyze_strategy_endpoint(
    strategy_data: dict = Body(..., description="Strategy data"),
):
    """
    Analyze a specific options strategy using Groq AI.
    """
    try:
        # Get option chain for calculations
        symbol = strategy_data.get('legs', [{}])[0].get('underlying', 'NIFTY')
        rows = get_option_chain_from_csv(symbol.upper())
        option_data = [row for row in rows] if rows else []
        
        analysis = analyze_strategy(strategy_data, option_data)
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in strategy AI analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Strategy analysis failed: {str(e)}")

