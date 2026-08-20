"""FastAPI main application.

FinSight Backend API v1.1.0

MARKET SUPPORT:
- Intelligence enabled: US, IN (14-layer decision engine)
- Screener only: UK, JP, CN, HK, SG, AU (price data, no signals)
"""
import logging
import json
import time
import threading
from typing import Optional, List, Dict, Any
from pathlib import Path
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.data_access import (
    list_tickers,
    load_daily,
    load_minute,
    load_technicals,
    load_fundamentals,
    load_news,
    load_metadata,
)
from app.schemas import (
    TickerBasic,
    ScreenerFilter,
    ScreenerRow,
    ScreenerResponse,
    DailyDataResponse,
    MinuteDataResponse,
    PriceDataPoint,
    TechnicalIndicator,
    NewsItem,
    FundamentalsResponse,
    AIInsightsRequest,
    AIInsightsResponse,
    RatioMetadata,
    RatiosResponse,
)
# Old ai_analysis.py removed - using ai_analysis_v2 only
from app.screener_engine import compute_screener_row
from app.stratax import routes as stratax_routes

# Enhanced Intelligence & Analytics modules
from app import stock_intelligence
from app import analytics_engine
from app import hedge_fund_tracker
from app import insider_intelligence
from app import ai_engine
from app import portfolio_analyzer
from app import intelligence_api
from app import announcements_api
from app import finbot_api
from app import timeline_api
from app import position_tracker_api
from app import pm_regime_api
from app import intrinsiq_api
from app import stock_dashboard_api
from app import notifications_api
from app import mnemos_api
from app import insights_api

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    logger.info("=" * 50)
    logger.info("FinSight API Server Starting...")
    logger.info(f"Host: {settings.API_HOST}")
    logger.info(f"Port: {settings.API_PORT}")
    logger.info(f"API Docs: http://localhost:{settings.API_PORT}/docs")
    logger.info("=" * 50)
    
    # Log data directory status
    logger.info(f"Data directory: {settings.DATA_DIR}")
    logger.info(f"Data directory exists: {settings.DATA_DIR.exists()}")
    if settings.DATA_DIR.exists():
        try:
            dir_contents = list(settings.DATA_DIR.iterdir())
            logger.info(f"Data directory has {len(dir_contents)} items")
            if dir_contents:
                logger.info(f"Sample items: {[str(p.name) for p in dir_contents[:5]]}")
        except Exception as e:
            logger.warning(f"Could not list data directory: {e}")
    
    # Check if data exists, download if missing
    if not settings.DATA_DIR.exists() or not any(settings.DATA_DIR.iterdir()):
        logger.warning("Data directory not found or empty!")
        logger.info(f"Looking for data at: {settings.DATA_DIR}")
        logger.info("Attempting to download from GitHub...")
        try:
            from app.download_data import download_data_from_github
            download_data_from_github()
        except Exception as e:
            logger.error(f"Could not download data: {e}")
            logger.warning("Server will start but screener may not work until data is available")
    
    # Load screener data from ticker folders on startup (cached)
    logger.info("Screener will load data directly from ticker folders (parquet files)")
    logger.info("Data will be cached for 5 minutes")
    
    # Pre-warm the screener cache in background to avoid slow first request
    # This is especially important for Render free tier which spins down after inactivity
    import asyncio
    import threading
    
    def preload_screener_cache():
        """Preload screener cache in background thread."""
        try:
            logger.info("Pre-warming screener cache in background...")
            rows = load_screener_data_from_files()
            logger.info(f"Pre-warmed cache with {len(rows)} rows")
        except Exception as e:
            logger.warning(f"Failed to pre-warm cache: {e}")
            logger.info("Cache will be built on first request")
    
    # Start pre-loading in background thread (non-blocking)
    preload_thread = threading.Thread(target=preload_screener_cache, daemon=True)
    preload_thread.start()
    
    logger.info("Server ready!")
    yield
    # Shutdown
    logger.info("Shutting down FinSight API Server...")


app = FastAPI(
    title="FinSight API",
    description="Premium stock screening and analysis platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware - Allow all origins for public API
# This is safe for a read-only public API
logger.info("CORS: Allowing all origins (public API)")

# CORS Configuration - Allow all origins for API access
CORS_ORIGINS = [
    "https://finvest.fintaxlife.com",
    "https://finsight.fintaxlife.com",
    "https://finsight-sand.vercel.app",
    "https://finvest-harsh-yadavs-projects-2f5a688d.vercel.app",
    "https://finvest-git-main-harsh-yadavs-projects-2f5a688d.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "*"  # Fallback allow all
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Must be False when using wildcard
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,  # Cache preflight for 24 hours
)

# Include StrataX routes
app.include_router(stratax_routes.router)

# Include Stock Intelligence & Analytics routes
app.include_router(stock_intelligence.router)
app.include_router(analytics_engine.router)

# Include Hedge Fund & Insider Intelligence routes
app.include_router(hedge_fund_tracker.router)
app.include_router(insider_intelligence.router)
app.include_router(ai_engine.router)
app.include_router(portfolio_analyzer.router)

# Include FinSight Intelligence API (dedicated pipeline output API)
app.include_router(intelligence_api.router)

# Include Announcements API (insider trades, 13F, FII/DII)
app.include_router(announcements_api.router)

# Include FinBot API (AI-powered recommendation query engine)
app.include_router(finbot_api.router)

# Include Timeline API (recommendation history storage)
app.include_router(timeline_api.router)

# Position Tracker - Exit signals and position management
app.include_router(position_tracker_api.router)

# PM Regime API - Precious Metals macro context
app.include_router(pm_regime_api.router)

# IntrinsIQ API - AI Value Investor (internal data valuation)
app.include_router(intrinsiq_api.router)

# Stock Dashboard - consolidated single-stock view
app.include_router(stock_dashboard_api.router)

# Unified Notifications - email + telegram
app.include_router(notifications_api.router)

# Mnemos Intelligence - buy-side AI analysis
app.include_router(mnemos_api.router)

# Cross-signal insights - quant conviction vs. news sentiment, confirms/diverges
app.include_router(insights_api.router)

# In-memory cache for screener data (loaded from files)
# 
# Caching Strategy:
# - Cache is built on-demand when /api/screener is first called
# - Cache TTL is configurable via SCREENER_CACHE_TTL (default: 300 seconds = 5 minutes)
# - Cache is cleared on server restart
# - For production with many tickers, consider:
#   1. Pre-building a screener.parquet snapshot
#   2. Using a persistent cache (Redis, etc.)
#   3. Loading snapshot on startup instead of computing on-demand
#
_screener_cache: Optional[List[Dict[str, Any]]] = None
_cache_timestamp: Optional[float] = None


def load_screener_data_from_files() -> List[Dict[str, Any]]:
    """
    Load screener data directly from ticker folders (parquet files).
    
    This function:
    1. Checks in-memory cache (if valid, returns cached data)
    2. Checks for pre-built screener.parquet snapshot (fast path)
    3. If no snapshot, discovers all tickers via list_tickers()
    4. For each ticker, loads:
       - history.parquet (daily OHLCV)
       - tech_indicators.parquet (SMA, RSI, etc.)
       - financials_full.json (fundamentals)
       - metadata.json (ticker metadata)
    5. Computes screener metrics via compute_screener_row()
    6. Caches result in memory for SCREENER_CACHE_TTL seconds
    
    Returns:
        List of dicts, each matching ScreenerRow schema
    """
    global _screener_cache, _cache_timestamp
    import time
    
    # Check cache validity
    if _screener_cache is not None and _cache_timestamp:
        cache_age = time.time() - _cache_timestamp
        if cache_age < settings.SCREENER_CACHE_TTL:
            logger.debug(f"Returning cached screener data (age: {cache_age:.1f}s)")
            return _screener_cache
        else:
            logger.info(f"Cache expired (age: {cache_age:.1f}s > {settings.SCREENER_CACHE_TTL}s), rebuilding...")
    
    # Fast path: Check for pre-built screener.parquet snapshot
    # IMPORTANT: Only use snapshot if it has >= 80% of known tickers
    tickers = list_tickers()
    expected_count = len(tickers)
    
    if settings.SCREENER_SNAPSHOT_PATH.exists():
        try:
            logger.info(f"Loading screener data from snapshot: {settings.SCREENER_SNAPSHOT_PATH}")
            df = pd.read_parquet(settings.SCREENER_SNAPSHOT_PATH)
            snapshot_count = len(df)
            
            # Check if snapshot is complete (at least 80% of expected tickers)
            if expected_count > 0 and snapshot_count < expected_count * 0.8:
                logger.warning(f"Snapshot incomplete: {snapshot_count} rows vs {expected_count} tickers ({snapshot_count/expected_count*100:.1f}%)")
                logger.info("Ignoring incomplete snapshot, will build from individual files...")
            else:
                rows = df.to_dict('records')
                logger.info(f"Loaded {len(rows)} rows from snapshot (expected: {expected_count})")
                
                # Ensure company_name exists
                for row in rows:
                    if "company_name" not in row or not row.get("company_name") or pd.isna(row.get("company_name")):
                        row["company_name"] = row.get("ticker", "Unknown")
                
                # Cache the result
                _screener_cache = rows
                _cache_timestamp = time.time()
                return rows
        except Exception as e:
            logger.warning(f"Failed to load screener snapshot: {e}, falling back to individual files")
            import traceback
            logger.warning(f"Traceback: {traceback.format_exc()}")
    
    # Load data from all ticker folders (tickers already loaded above)
    rows: List[Dict[str, Any]] = []
    
    if len(tickers) == 0:
        logger.error(f"No tickers found! Data directory: {settings.DATA_DIR}")
        logger.error(f"Data directory exists: {settings.DATA_DIR.exists()}")
        if settings.DATA_DIR.exists():
            try:
                dir_contents = list(settings.DATA_DIR.iterdir())
                logger.error(f"Data directory contents: {[str(p.name) for p in dir_contents[:10]]}")
            except Exception as e:
                logger.error(f"Could not list data directory: {e}")
        return rows  # Return empty list
    
    logger.info(f"Loading screener data for {len(tickers)} tickers from parquet files...")
    
    # Parallelize loading for faster performance
    import concurrent.futures
    
    def process_ticker(ticker_meta):
        ticker = ticker_meta.get("ticker")
        market = ticker_meta.get("market")
        
        if not ticker:
            return None
        
        try:
            # Load data directly from ticker folder parquet files
            daily_df = load_daily(ticker, market)
            tech_df = load_technicals(ticker, market)
            fundamentals = load_fundamentals(ticker, market)
            metadata = load_metadata(ticker, market)
            
            if not metadata.get("market"):
                metadata["market"] = market
            
            # Compute screener row (this is the single source of truth for metrics)
            row = compute_screener_row(
                ticker=ticker,
                daily_df=daily_df,
                tech_df=tech_df,
                fundamentals=fundamentals,
                metadata=metadata,
            )
            
            # Ensure all required fields exist (set to None if missing)
            # This ensures the row matches ScreenerRow schema
            if "company_name" not in row or not row.get("company_name"):
                row["company_name"] = ticker
            
            return row
        
        except Exception as e:
            logger.warning(f"Failed to process {ticker}: {e}")
            return None
    
    # Use ThreadPoolExecutor for I/O-bound operations (file reading)
    # Increased workers for faster processing on Render
    # Add timeout to prevent hanging on slow loads
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(process_ticker, ticker_meta) for ticker_meta in tickers]
            
            completed = 0
            start_time = time.time()
            timeout = 45  # Don't spend more than 45 seconds loading data
            
            for future in concurrent.futures.as_completed(futures):
                # Check timeout
                if time.time() - start_time > timeout:
                    logger.warning(f"Data loading timeout after {timeout}s, returning {len(rows)} rows loaded so far")
                    # Cancel remaining futures
                    for f in futures:
                        f.cancel()
                    break
                
                try:
                    row = future.result(timeout=1)  # 1 second timeout per ticker
                    if row:
                        rows.append(row)
                    completed += 1
                    
                    if completed % 100 == 0:
                        elapsed = time.time() - start_time
                        logger.info(f"Processed {completed}/{len(tickers)} tickers (elapsed: {elapsed:.1f}s)")
                except concurrent.futures.TimeoutError:
                    logger.warning(f"Ticker processing timeout, skipping")
                    completed += 1
                except Exception as e:
                    logger.warning(f"Error processing future: {e}")
                    completed += 1
    except Exception as e:
        logger.error(f"Error in parallel processing, falling back to sequential: {e}")
        # Fallback to sequential processing
        for i, ticker_meta in enumerate(tickers):
            row = process_ticker(ticker_meta)
            if row:
                rows.append(row)
            if (i + 1) % 100 == 0:
                logger.info(f"Processed {i + 1}/{len(tickers)} tickers")
    
    # Cache the result
    _screener_cache = rows
    _cache_timestamp = time.time()
    logger.info(f"Loaded screener data for {len(rows)} tickers from parquet files (cached for {settings.SCREENER_CACHE_TTL}s)")
    
    return rows


def get_screener_df() -> pd.DataFrame:
    """
    Get screener data as a DataFrame.
    Helper function that converts list of dicts to DataFrame.
    
    Returns:
        DataFrame with all screener rows, empty DataFrame if no data
    """
    rows = load_screener_data_from_files()
    if not rows:
        return pd.DataFrame()
    
    # Convert to DataFrame
    df = pd.DataFrame(rows)
    
    # Ensure required columns exist
    if df.empty:
        return df
    
    return df


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "FinSight API", "version": "1.0.0"}


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    screener_exists = settings.SCREENER_SNAPSHOT_PATH.exists()
    tickers = list_tickers()
    
    # Check data directory structure
    data_dir_info = {}
    if settings.DATA_DIR.exists():
        try:
            dir_contents = list(settings.DATA_DIR.iterdir())
            data_dir_info = {
                "exists": True,
                "item_count": len(dir_contents),
                "items": [str(p.name) for p in dir_contents[:10]],
                "sample_market_structure": {}
            }
            # Check one market directory structure
            for item in dir_contents[:3]:
                if item.is_dir():
                    try:
                        ticker_dirs = list(item.iterdir())
                        data_dir_info["sample_market_structure"][item.name] = {
                            "ticker_count": len([d for d in ticker_dirs if d.is_dir()]),
                            "sample_tickers": [d.name for d in ticker_dirs[:5] if d.is_dir()],
                        }
                    except:
                        pass
        except Exception as e:
            data_dir_info = {"exists": True, "error": str(e)}
    else:
        data_dir_info = {"exists": False}
    
    return {
        "status": "ok",
        "screener_available": screener_exists,
        "screener_path": str(settings.SCREENER_SNAPSHOT_PATH),
        "data_dir": str(settings.DATA_DIR),
        "data_directory_found": settings.DATA_DIR.exists(),
        "data_dir_info": data_dir_info,
        "ticker_count": len(tickers),
        "total_tickers": len(tickers),  # Alias for clarity
        "markets": list(set(t.get("market") for t in tickers if t.get("market"))),
        "cache_status": {
            "cached": _screener_cache is not None,
            "cache_size": len(_screener_cache) if _screener_cache else 0,
        }
    }


@app.post("/api/admin/invalidate-cache")
async def invalidate_cache():
    """
    Force invalidate the screener cache to trigger a rebuild from individual files.
    This is useful when screener.parquet is outdated/incomplete.
    """
    global _screener_cache, _cache_timestamp
    _screener_cache = None
    _cache_timestamp = None
    logger.info("Cache invalidated - next request will rebuild from individual files")
    return {
        "status": "ok",
        "message": "Cache invalidated. Next screener request will rebuild from source files.",
    }


@app.get("/api/admin/rebuild-screener")
async def rebuild_screener():
    """
    Force rebuild screener cache by loading from all individual ticker files.
    Ignores any existing screener.parquet snapshot.
    """
    global _screener_cache, _cache_timestamp
    
    # Clear cache first
    _screener_cache = None
    _cache_timestamp = None
    
    tickers = list_tickers()
    logger.info(f"Rebuilding screener for {len(tickers)} tickers...")
    
    rows: List[Dict[str, Any]] = []
    for i, ticker_meta in enumerate(tickers):
        ticker = ticker_meta.get("ticker")
        market = ticker_meta.get("market")
        if not ticker:
            continue
        try:
            daily_df = load_daily(ticker, market)
            tech_df = load_technicals(ticker, market)
            fundamentals = load_fundamentals(ticker, market)
            metadata = load_metadata(ticker, market)
            if not metadata.get("market"):
                metadata["market"] = market
            row = compute_screener_row(
                ticker=ticker,
                daily_df=daily_df,
                tech_df=tech_df,
                fundamentals=fundamentals,
                metadata=metadata,
            )
            rows.append(row)
        except Exception as e:
            logger.debug(f"Skipping {ticker}: {e}")
            continue
    
    # Update cache
    _screener_cache = rows
    _cache_timestamp = time.time()
    
    market_counts = {}
    for row in rows:
        m = row.get("market", "UNKNOWN")
        market_counts[m] = market_counts.get(m, 0) + 1
    
    logger.info(f"Rebuilt screener with {len(rows)} rows")
    return {
        "status": "ok",
        "total_rows": len(rows),
        "by_market": market_counts,
        "message": f"Rebuilt screener with {len(rows)} rows from {len(tickers)} tickers",
    }


@app.get("/api/markets")
async def get_markets():
    """
    Get list of markets that have data available.
    
    Returns dict with market codes as keys and boolean values indicating if data exists.
    """
    try:
        tickers = list_tickers()
        markets_with_data = set()
        
        for ticker_meta in tickers:
            market = ticker_meta.get("market")
            if market:
                markets_with_data.add(market)
        
        # Return as dict for easy lookup
        all_markets = ["IN", "US", "UK", "JP", "CN", "SG", "HK", "OTHER"]
        result = {market: market in markets_with_data for market in all_markets}
        
        return result
    except Exception as e:
        logger.error(f"Error in get_markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/meta/filters")
async def get_filter_options(market: Optional[str] = Query(None)):
    """Get available sectors and industries for filter dropdowns."""
    try:
        screener_df = get_screener_df()
        
        if screener_df.empty:
            return {"sectors": [], "industries": []}
        
        # Filter by market if provided
        if market:
            screener_df = screener_df[screener_df["market"] == market]
        
        # Get unique sectors and industries (non-null, non-empty)
        sectors = screener_df["sector"].dropna().astype(str)
        sectors = sectors[sectors.str.strip() != ""].unique().tolist()
        
        industries = screener_df["industry"].dropna().astype(str)
        industries = industries[industries.str.strip() != ""].unique().tolist()
        
        # Sort alphabetically
        sectors.sort()
        industries.sort()
        
        return {
            "sectors": sectors,
            "industries": industries
        }
    except Exception as e:
        logger.error(f"Error in get_filter_options: {e}")
        return {"sectors": [], "industries": []}


@app.get("/api/ratios", response_model=RatiosResponse)
async def get_ratios():
    """
    Get list of all available financial ratios/metrics with metadata.
    
    Returns comprehensive list of ratios that can be used for:
    - Screener filtering
    - Stock detail page ratio inspector
    - Dynamic UI generation
    
    Each ratio includes:
    - key: Internal field name
    - label: Display name
    - category: Grouping (Valuation, Quality, Momentum, etc.)
    - source: Where to find the data (screener, fundamentals, etc.)
    - field_path: Path to the value in the data structure
    - format: How to display (number, percent, currency)
    """
    ratios = [
        # Valuation
        RatioMetadata(key="pe_trailing", label="PE Ratio", category="Valuation", source="screener", field_path="pe_trailing", format="number"),
        RatioMetadata(key="pe_forward", label="PE Forward", category="Valuation", source="screener", field_path="pe_forward", format="number"),
        RatioMetadata(key="pb_ratio", label="P/B Ratio", category="Valuation", source="screener", field_path="pb_ratio", format="number"),
        RatioMetadata(key="price_to_sales", label="Price/Sales", category="Valuation", source="screener", field_path="price_to_sales", format="number"),
        RatioMetadata(key="ev_to_ebitda", label="EV/EBITDA", category="Valuation", source="screener", field_path="ev_to_ebitda", format="number"),
        RatioMetadata(key="ev_to_revenue", label="EV/Revenue", category="Valuation", source="screener", field_path="ev_to_revenue", format="number"),
        RatioMetadata(key="peg_ratio", label="PEG Ratio", category="Valuation", source="screener", field_path="peg_ratio", format="number"),
        RatioMetadata(key="earnings_yield", label="Earnings Yield", category="Valuation", source="screener", field_path="earnings_yield", format="percent"),
        RatioMetadata(key="dividend_yield", label="Dividend Yield", category="Valuation", source="screener", field_path="dividend_yield", format="percent"),
        RatioMetadata(key="industry_pe", label="Industry PE", category="Valuation", source="screener", field_path="industry_pe", format="number"),
        
        # Profitability & Quality
        RatioMetadata(key="roe", label="ROE", category="Quality", source="screener", field_path="roe", format="percent"),
        RatioMetadata(key="roa", label="ROA", category="Quality", source="screener", field_path="roa", format="percent"),
        RatioMetadata(key="roce", label="ROCE", category="Quality", source="screener", field_path="roce", format="percent"),
        RatioMetadata(key="gross_margin", label="Gross Margin", category="Quality", source="screener", field_path="gross_margin", format="percent"),
        RatioMetadata(key="operating_margin", label="Operating Margin", category="Quality", source="screener", field_path="operating_margin", format="percent"),
        RatioMetadata(key="ebitda_margin", label="EBITDA Margin", category="Quality", source="screener", field_path="ebitda_margin", format="percent"),
        RatioMetadata(key="profit_margin", label="Net Margin", category="Quality", source="screener", field_path="profit_margin", format="percent"),
        RatioMetadata(key="debt_to_equity", label="Debt/Equity", category="Quality", source="screener", field_path="debt_to_equity", format="number"),
        RatioMetadata(key="current_ratio", label="Current Ratio", category="Quality", source="screener", field_path="current_ratio", format="number"),
        RatioMetadata(key="quick_ratio", label="Quick Ratio", category="Quality", source="screener", field_path="quick_ratio", format="number"),
        
        # Cash Flow
        RatioMetadata(key="free_cash_flow", label="Free Cash Flow", category="Cash Flow", source="screener", field_path="free_cash_flow", format="currency"),
        RatioMetadata(key="operating_cash_flow", label="Operating Cash Flow", category="Cash Flow", source="screener", field_path="operating_cash_flow", format="currency"),
        RatioMetadata(key="fcf_yield", label="FCF Yield", category="Cash Flow", source="screener", field_path="fcf_yield", format="percent"),
        
        # Growth
        RatioMetadata(key="revenue_growth", label="Revenue Growth", category="Growth", source="screener", field_path="revenue_growth", format="percent"),
        RatioMetadata(key="earnings_growth", label="Earnings Growth", category="Growth", source="screener", field_path="earnings_growth", format="percent"),
        RatioMetadata(key="earnings_quarterly_growth", label="Quarterly Earnings Growth", category="Growth", source="screener", field_path="earnings_quarterly_growth", format="percent"),
        RatioMetadata(key="eps_growth_yoy", label="EPS Growth YOY", category="Growth", source="screener", field_path="eps_growth_yoy", format="percent"),
        
        # Dividend
        RatioMetadata(key="payout_ratio", label="Payout Ratio", category="Dividend", source="screener", field_path="payout_ratio", format="percent"),
        
        # Risk & Ownership
        RatioMetadata(key="beta", label="Beta", category="Risk", source="screener", field_path="beta", format="number"),
        RatioMetadata(key="insider_holding", label="Insider Holding", category="Ownership", source="screener", field_path="insider_holding", format="percent"),
        RatioMetadata(key="institutional_holding", label="Institutional Holding", category="Ownership", source="screener", field_path="institutional_holding", format="percent"),
        RatioMetadata(key="short_ratio", label="Short Ratio", category="Sentiment", source="screener", field_path="short_ratio", format="number"),
        RatioMetadata(key="short_pct_float", label="Short % of Float", category="Sentiment", source="screener", field_path="short_pct_float", format="percent"),
        
        # Analyst
        RatioMetadata(key="analyst_target_mean", label="Analyst Target", category="Analyst", source="screener", field_path="analyst_target_mean", format="currency"),
        RatioMetadata(key="analyst_rating", label="Analyst Rating", category="Analyst", source="screener", field_path="analyst_rating", format="number"),
        RatioMetadata(key="num_analysts", label="# Analysts", category="Analyst", source="screener", field_path="num_analysts", format="number"),
        RatioMetadata(key="analyst_upside", label="Analyst Upside", category="Analyst", source="screener", field_path="analyst_upside", format="percent"),
        
        # Size & Price
        RatioMetadata(key="market_cap", label="Market Cap", category="Size", source="screener", field_path="market_cap", format="currency"),
        RatioMetadata(key="enterprise_value", label="Enterprise Value", category="Size", source="screener", field_path="enterprise_value", format="currency"),
        RatioMetadata(key="current_price", label="Current Price", category="Price", source="screener", field_path="current_price", format="currency"),
        RatioMetadata(key="high_52w", label="52W High", category="Price", source="screener", field_path="high_52w", format="currency"),
        RatioMetadata(key="low_52w", label="52W Low", category="Price", source="screener", field_path="low_52w", format="currency"),
        RatioMetadata(key="pct_from_52w_high", label="% from 52W High", category="Price", source="screener", field_path="pct_from_52w_high", format="percent"),
        RatioMetadata(key="pct_from_52w_low", label="% from 52W Low", category="Price", source="screener", field_path="pct_from_52w_low", format="percent"),
        
        # Momentum & Returns
        RatioMetadata(key="ret_1d", label="1D Return", category="Momentum", source="screener", field_path="ret_1d", format="percent"),
        RatioMetadata(key="ret_1w", label="1W Return", category="Momentum", source="screener", field_path="ret_1w", format="percent"),
        RatioMetadata(key="ret_1m", label="1M Return", category="Momentum", source="screener", field_path="ret_1m", format="percent"),
        RatioMetadata(key="ret_3m", label="3M Return", category="Momentum", source="screener", field_path="ret_3m", format="percent"),
        RatioMetadata(key="ret_6m", label="6M Return", category="Momentum", source="screener", field_path="ret_6m", format="percent"),
        RatioMetadata(key="ret_1y", label="1Y Return", category="Momentum", source="screener", field_path="ret_1y", format="percent"),
        
        # Technicals
        RatioMetadata(key="rsi14", label="RSI(14)", category="Technicals", source="screener", field_path="rsi14", format="number"),
        RatioMetadata(key="sma20", label="SMA20", category="Technicals", source="screener", field_path="sma20", format="currency"),
        RatioMetadata(key="sma50", label="SMA50", category="Technicals", source="screener", field_path="sma50", format="currency"),
        RatioMetadata(key="sma200", label="SMA200", category="Technicals", source="screener", field_path="sma200", format="currency"),
        RatioMetadata(key="vol_20d", label="Volatility (20d)", category="Technicals", source="screener", field_path="vol_20d", format="percent"),
        RatioMetadata(key="vol_60d", label="Volatility (60d)", category="Technicals", source="screener", field_path="vol_60d", format="percent"),
        
        # Volume
        RatioMetadata(key="volume_latest", label="Latest Volume", category="Volume", source="screener", field_path="volume_latest", format="number"),
        RatioMetadata(key="avg_volume_20d", label="Avg Volume (20d)", category="Volume", source="screener", field_path="avg_volume_20d", format="number"),
        RatioMetadata(key="volume_spike_20d", label="Volume Spike (20d)", category="Volume", source="screener", field_path="volume_spike_20d", format="number"),
        
        # Fundamentals (from fundamentals.json - not in screener row)
        RatioMetadata(key="sales", label="Sales", category="Fundamentals", source="fundamentals", field_path="income_statement.Total Revenue", format="currency"),
        RatioMetadata(key="net_profit", label="Net Profit", category="Fundamentals", source="fundamentals", field_path="income_statement.Net Income", format="currency"),
        RatioMetadata(key="operating_profit", label="Operating Profit", category="Fundamentals", source="fundamentals", field_path="income_statement.Operating Income", format="currency"),
        RatioMetadata(key="face_value", label="Face Value", category="Fundamentals", source="fundamentals", field_path="info.faceValue", format="currency"),
    ]
    
    return RatiosResponse(ratios=ratios)


def safe_float(val) -> Optional[float]:
    """Convert value to float, handling NaN and None."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
        return float(val)
    except (ValueError, TypeError):
        return None


@app.get("/api/tickers", response_model=List[TickerBasic])
async def get_tickers():
    """Get list of all tickers with basic info."""
    try:
        tickers = list_tickers()
        
        try:
            screener_df = get_screener_df()
        except Exception as e:
            logger.warning(f"Could not load screener DataFrame: {e}")
            screener_df = pd.DataFrame()
        
        result = []
        for ticker_meta in tickers:
            ticker = ticker_meta.get("ticker")
            if not ticker:
                continue
            
            # Get metrics from screener if available
            row = None
            try:
                if not screener_df.empty and "ticker" in screener_df.columns:
                    ticker_rows = screener_df[screener_df["ticker"] == ticker]
                    if not ticker_rows.empty:
                        row = ticker_rows.iloc[0].to_dict()
            except Exception:
                pass
            
            result.append(TickerBasic(
                ticker=ticker,
                market=ticker_meta.get("market", "UNKNOWN"),
                exchange_tz=ticker_meta.get("exchange_tz", "UTC"),
                current_price=safe_float(row.get("current_price")) if row else None,
                pe_trailing=safe_float(row.get("pe_trailing")) if row else None,
                market_cap=safe_float(row.get("market_cap")) if row else None,
            ))
        
        return result
    except Exception as e:
        logger.error(f"Error in get_tickers: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# UNIVERSE ENDPOINT - RETURNS ALL INGESTED TICKERS
# =============================================================================

@app.get("/api/universe")
async def get_universe(market: Optional[str] = Query(None)):
    """
    Get ALL ingested tickers from data directories.
    
    This endpoint returns the FULL universe of tickers, not limited by screener.parquet.
    Used by Screener and Market Intelligence pages to show complete data.
    
    Parameters:
        market: Optional market filter (US, IN, UK, JP, CN, HK, SG, AU)
    
    Returns:
        {
            "tickers": [...],
            "total": 1409,
            "by_market": {"US": 439, "IN": 584, ...},
            "markets_available": ["US", "IN", "UK", ...]
        }
    """
    try:
        # Get all tickers for market breakdown
        all_tickers = list_tickers()
        
        # Build market breakdown from all tickers
        by_market: Dict[str, int] = {}
        for t in all_tickers:
            m = t.get("market", "UNKNOWN")
            by_market[m] = by_market.get(m, 0) + 1
        
        # Filter by market if specified (before expensive enrichment)
        if market:
            market_upper = market.upper()
            tickers = [t for t in all_tickers if t.get("market") == market_upper]
        else:
            tickers = all_tickers
        
        # Try to enrich with screener data if available
        try:
            screener_df = get_screener_df()
        except Exception as e:
            logger.warning(f"Could not load screener DataFrame: {e}")
            screener_df = pd.DataFrame()  # Empty DataFrame as fallback
        
        # Build ticker lookup from screener for O(1) access
        screener_lookup: Dict[str, Dict] = {}
        if not screener_df.empty and "ticker" in screener_df.columns:
            try:
                for _, row in screener_df.iterrows():
                    t = row.get("ticker")
                    if t:
                        screener_lookup[t] = row.to_dict()
            except Exception as e:
                logger.warning(f"Could not build screener lookup: {e}")
        
        enriched_tickers = []
        
        for ticker_meta in tickers:
            ticker = ticker_meta.get("ticker")
            if not ticker:
                continue
            
            # Base ticker data
            ticker_data = {
                "ticker": ticker,
                "market": ticker_meta.get("market", "UNKNOWN"),
                "exchange_tz": ticker_meta.get("exchange_tz", "UTC"),
                "updated_utc": ticker_meta.get("updated_utc"),
                "daily_rows": ticker_meta.get("daily_rows", 0),
                # Default values - will be enriched if screener data exists
                "company_name": ticker,
                "current_price": None,
                "market_cap": None,
                "pe_trailing": None,
                "roe": None,
                "sector": None,
                "industry": None,
                "has_screener_data": False,
            }
            
            # Enrich with screener data if available (O(1) lookup)
            if ticker in screener_lookup:
                try:
                    row = screener_lookup[ticker]
                    company_name = row.get("company_name", ticker)
                    if pd.isna(company_name):
                        company_name = ticker
                    sector = row.get("sector")
                    industry = row.get("industry")
                    ticker_data.update({
                        "company_name": company_name,
                        "current_price": safe_float(row.get("current_price")),
                        "market_cap": safe_float(row.get("market_cap")),
                        "pe_trailing": safe_float(row.get("pe_trailing")),
                        "roe": safe_float(row.get("roe")),
                        "sector": sector if not pd.isna(sector) else None,
                        "industry": industry if not pd.isna(industry) else None,
                        "ret_3m": safe_float(row.get("ret_3m")),
                        "ret_1y": safe_float(row.get("ret_1y")),
                        "rsi": safe_float(row.get("rsi")),
                        "has_screener_data": True,
                    })
                except Exception as e:
                    logger.debug(f"Could not enrich {ticker}: {e}")
            
            enriched_tickers.append(ticker_data)
        
        return {
            "tickers": enriched_tickers,
            "total": len(enriched_tickers),
            "by_market": by_market,
            "markets_available": sorted(by_market.keys()),
            "screener_coverage": sum(1 for t in enriched_tickers if t.get("has_screener_data")),
        }
        
    except Exception as e:
        logger.error(f"Error in get_universe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screener", response_model=ScreenerResponse)
async def get_screener(
    market: Optional[str] = Query(None),
    min_market_cap: Optional[float] = Query(None),
    max_market_cap: Optional[float] = Query(None),
    min_pe: Optional[float] = Query(None),
    max_pe: Optional[float] = Query(None),
    min_pb: Optional[float] = Query(None),
    max_pb: Optional[float] = Query(None),
    min_roe: Optional[float] = Query(None),
    max_roe: Optional[float] = Query(None),
    min_roa: Optional[float] = Query(None),
    max_roa: Optional[float] = Query(None),
    min_roce: Optional[float] = Query(None),
    max_roce: Optional[float] = Query(None),
    max_debt_to_equity: Optional[float] = Query(None),
    min_debt_to_equity: Optional[float] = Query(None),
    min_ret_3m: Optional[float] = Query(None),
    max_ret_3m: Optional[float] = Query(None),
    min_ret_1y: Optional[float] = Query(None),
    max_ret_1y: Optional[float] = Query(None),
    min_eps_growth_yoy: Optional[float] = Query(None),
    max_eps_growth_yoy: Optional[float] = Query(None),
    min_profit_margin: Optional[float] = Query(None),
    max_profit_margin: Optional[float] = Query(None),
    min_revenue_growth: Optional[float] = Query(None),
    max_revenue_growth: Optional[float] = Query(None),
    min_dividend_yield: Optional[float] = Query(None),
    max_dividend_yield: Optional[float] = Query(None),
    min_beta: Optional[float] = Query(None),
    max_beta: Optional[float] = Query(None),
    min_current_ratio: Optional[float] = Query(None),
    max_current_ratio: Optional[float] = Query(None),
    min_ev_to_ebitda: Optional[float] = Query(None),
    max_ev_to_ebitda: Optional[float] = Query(None),
    search: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("market_cap"),
    sort_dir: Optional[str] = Query("desc"),
    limit: Optional[int] = Query(50),
    offset: Optional[int] = Query(0),
):
    """
    Get screener results by loading data directly from ticker folders.
    
    Pagination behavior:
    - Filters are applied first (market, sector, industry, numeric filters, search)
    - Then sorting is applied
    - Finally pagination (limit/offset) is applied to the filtered and sorted results
    - limit: default 50, max 2000 (use limit=0 for no limit)
    - offset: default 0
    - total_count: total rows matching filters (before pagination)
    
    All filtering and sorting operates on in-memory cached DataFrame for performance.
    """
    try:
        # Load data from cache or files
        # This may take time on first request (cold start) or cache miss
        import time
        start_time = time.time()
        rows = load_screener_data_from_files()
        load_time = time.time() - start_time
        
        logger.info(f"Loaded {len(rows)} rows from cache/files (took {load_time:.2f}s)")
        
        if not rows:
            logger.error("No screener data available - returning empty response")
            logger.error(f"This means either: 1) No tickers found, 2) All tickers failed to load, 3) Data directory issue")
            # Return empty response but log diagnostic info
            tickers_check = list_tickers()
            logger.error(f"list_tickers() returned {len(tickers_check)} tickers")
            if len(tickers_check) > 0:
                logger.error(f"Sample tickers: {[t.get('ticker') for t in tickers_check[:5]]}")
            return ScreenerResponse(rows=[], total=0, total_count=0, limit=limit or 50, offset=offset or 0)
        
        # Ensure all rows have company_name field before converting to DataFrame
        for row in rows:
            if "company_name" not in row or not row.get("company_name") or pd.isna(row.get("company_name")):
                row["company_name"] = row.get("ticker", "Unknown")
        
        # Convert to DataFrame for filtering
        df = pd.DataFrame(rows)
        
        # Apply market filter first
        if market:
            df = df[df["market"] == market]
        
        # Apply sector filter (case-insensitive)
        if sector:
            df = df[df["sector"].astype(str).str.lower() == sector.lower()]
        
        # Apply industry filter (case-insensitive)
        if industry:
            df = df[df["industry"].astype(str).str.lower() == industry.lower()]
        
        # Apply filters with proper AND logic
        # Each filter narrows down the DataFrame (AND operation)
        # NaN values are excluded from numeric comparisons (strict filtering)
        
        if min_market_cap is not None:
            # Exclude NaN: only include rows where market_cap is not NaN and >= min
            df = df[(df["market_cap"].notna()) & (df["market_cap"] >= min_market_cap)]
        
        if max_market_cap is not None:
            # Exclude NaN: only include rows where market_cap is not NaN and <= max
            df = df[(df["market_cap"].notna()) & (df["market_cap"] <= max_market_cap)]
        
        if min_pe is not None:
            # Exclude NaN: only include rows where pe_trailing is not NaN and >= min
            df = df[(df["pe_trailing"].notna()) & (df["pe_trailing"] >= min_pe)]
        
        if max_pe is not None:
            # Exclude NaN: only include rows where pe_trailing is not NaN and <= max
            df = df[(df["pe_trailing"].notna()) & (df["pe_trailing"] <= max_pe)]
        
        if min_roe is not None:
            df = df[(df["roe"].notna()) & (df["roe"] >= min_roe)]
        if max_roe is not None:
            df = df[(df["roe"].notna()) & (df["roe"] <= max_roe)]
        
        if min_roa is not None:
            df = df[(df["roa"].notna()) & (df["roa"] >= min_roa)]
        if max_roa is not None:
            df = df[(df["roa"].notna()) & (df["roa"] <= max_roa)]
        
        if min_roce is not None:
            df = df[(df["roce"].notna()) & (df["roce"] >= min_roce)]
        if max_roce is not None:
            df = df[(df["roce"].notna()) & (df["roce"] <= max_roce)]
        
        if min_debt_to_equity is not None:
            df = df[(df["debt_to_equity"].notna()) & (df["debt_to_equity"] >= min_debt_to_equity)]
        if max_debt_to_equity is not None:
            df = df[(df["debt_to_equity"].notna()) & (df["debt_to_equity"] <= max_debt_to_equity)]
        
        if min_ret_3m is not None:
            df = df[(df["ret_3m"].notna()) & (df["ret_3m"] >= min_ret_3m)]
        if max_ret_3m is not None:
            df = df[(df["ret_3m"].notna()) & (df["ret_3m"] <= max_ret_3m)]
        
        if min_ret_1y is not None:
            df = df[(df["ret_1y"].notna()) & (df["ret_1y"] >= min_ret_1y)]
        if max_ret_1y is not None:
            df = df[(df["ret_1y"].notna()) & (df["ret_1y"] <= max_ret_1y)]
        
        if min_eps_growth_yoy is not None:
            df = df[(df["eps_growth_yoy"].notna()) & (df["eps_growth_yoy"] >= min_eps_growth_yoy)]
        if max_eps_growth_yoy is not None:
            df = df[(df["eps_growth_yoy"].notna()) & (df["eps_growth_yoy"] <= max_eps_growth_yoy)]
        
        if min_profit_margin is not None:
            df = df[(df["profit_margin"].notna()) & (df["profit_margin"] >= min_profit_margin)]
        if max_profit_margin is not None:
            df = df[(df["profit_margin"].notna()) & (df["profit_margin"] <= max_profit_margin)]
        
        if min_pb is not None and "pb_ratio" in df.columns:
            df = df[(df["pb_ratio"].notna()) & (df["pb_ratio"] >= min_pb)]
        if max_pb is not None and "pb_ratio" in df.columns:
            df = df[(df["pb_ratio"].notna()) & (df["pb_ratio"] <= max_pb)]
        
        if min_revenue_growth is not None and "revenue_growth" in df.columns:
            df = df[(df["revenue_growth"].notna()) & (df["revenue_growth"] >= min_revenue_growth)]
        if max_revenue_growth is not None and "revenue_growth" in df.columns:
            df = df[(df["revenue_growth"].notna()) & (df["revenue_growth"] <= max_revenue_growth)]
        
        if min_dividend_yield is not None and "dividend_yield" in df.columns:
            df = df[(df["dividend_yield"].notna()) & (df["dividend_yield"] >= min_dividend_yield)]
        if max_dividend_yield is not None and "dividend_yield" in df.columns:
            df = df[(df["dividend_yield"].notna()) & (df["dividend_yield"] <= max_dividend_yield)]
        
        if min_beta is not None and "beta" in df.columns:
            df = df[(df["beta"].notna()) & (df["beta"] >= min_beta)]
        if max_beta is not None and "beta" in df.columns:
            df = df[(df["beta"].notna()) & (df["beta"] <= max_beta)]
        
        if min_current_ratio is not None and "current_ratio" in df.columns:
            df = df[(df["current_ratio"].notna()) & (df["current_ratio"] >= min_current_ratio)]
        if max_current_ratio is not None and "current_ratio" in df.columns:
            df = df[(df["current_ratio"].notna()) & (df["current_ratio"] <= max_current_ratio)]
        
        if min_ev_to_ebitda is not None and "ev_to_ebitda" in df.columns:
            df = df[(df["ev_to_ebitda"].notna()) & (df["ev_to_ebitda"] >= min_ev_to_ebitda)]
        if max_ev_to_ebitda is not None and "ev_to_ebitda" in df.columns:
            df = df[(df["ev_to_ebitda"].notna()) & (df["ev_to_ebitda"] <= max_ev_to_ebitda)]
        
        # Search filter
        if search:
            search_lower = search.lower().strip()
            if search_lower:
                # Create mask with same index as df to avoid alignment issues
                mask = pd.Series([False] * len(df), index=df.index)
                if "ticker" in df.columns:
                    ticker_match = df["ticker"].astype(str).str.lower().str.contains(search_lower, na=False)
                    mask = mask | ticker_match
                if "company_name" in df.columns:
                    company_match = df["company_name"].astype(str).str.lower().str.contains(search_lower, na=False)
                    mask = mask | company_match
                if "market" in df.columns:
                    market_match = df["market"].astype(str).str.lower().str.contains(search_lower, na=False)
                    mask = mask | market_match
                df = df[mask]
        
        # Market priority: India, USA, UK, Japan, China, Singapore, then others
        market_priority = {"IN": 1, "US": 2, "UK": 3, "JP": 4, "CN": 5, "SG": 6}
        
        # Sort by user preference, but maintain market priority
        sort_col = sort_by or "market_cap"
        if sort_col in df.columns:
            ascending = sort_dir == "asc"
            # Group by market priority first, then sort within each group
            df["_market_priority"] = df["market"].map(lambda x: market_priority.get(x, 999))
            df = df.sort_values(by=["_market_priority", sort_col], ascending=[True, ascending], na_position="last")
            df = df.drop(columns=["_market_priority"])
        
        # Paginate: Apply limit/offset AFTER filtering and sorting
        # This ensures we only return the requested page of results
        total_count = len(df)  # Total matching rows (before pagination)
        # Pagination: limit=0 means no limit, otherwise max 2000
        limit_val = min(limit or 50, 2000) if limit != 0 else len(df)  # Default 50, max 2000, 0=all
        offset_val = max(offset or 0, 0)  # Ensure non-negative
        
        # Apply pagination using iloc
        df = df.iloc[offset_val:offset_val + limit_val]
        
        # Convert to response
        rows = []
        for _, row in df.iterrows():
            try:
                row_dict = row.to_dict()
                # Ensure required fields exist
                if "ticker" not in row_dict or not row_dict.get("ticker"):
                    continue
                if "market" not in row_dict:
                    row_dict["market"] = "UNKNOWN"
                if "exchange_tz" not in row_dict:
                    row_dict["exchange_tz"] = "UTC"
                # Ensure company_name exists (it should from compute_screener_row)
                if "company_name" not in row_dict or pd.isna(row_dict.get("company_name")):
                    # Try to get it from ticker if missing
                    ticker_val = row_dict.get("ticker", "")
                    if ticker_val:
                        row_dict["company_name"] = ticker_val
                
                # Convert NaN/None values to None for Pydantic
                for key, value in row_dict.items():
                    try:
                        # Handle pandas NaN, numpy NaN, Python None, and float NaN
                        if value is None:
                            row_dict[key] = None
                        elif isinstance(value, float) and (value != value):  # NaN check
                            row_dict[key] = None
                        elif hasattr(pd, 'isna') and pd.isna(value):
                            row_dict[key] = None
                        # Convert string NaN to None
                        elif isinstance(value, str) and value.lower() in ['nan', 'none', '']:
                            row_dict[key] = None
                    except (TypeError, ValueError, AttributeError):
                        # If we can't check, leave as is
                        pass
                rows.append(ScreenerRow(**row_dict))
            except Exception as e:
                logger.warning(f"Failed to convert row {row.get('ticker', 'unknown')}: {e}")
                continue
        
        return ScreenerResponse(
            rows=rows,
            total=total_count,  # Legacy field
            total_count=total_count,  # Preferred field
            limit=limit_val,
            offset=offset_val,
        )
    except Exception as e:
        logger.error(f"Error in get_screener: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/daily", response_model=DailyDataResponse)
async def get_ticker_daily(ticker: str):
    """Get daily OHLCV data for a ticker."""
    try:
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        daily_df = load_daily(ticker, market)
        tech_df = load_technicals(ticker, market)
        
        if daily_df.empty:
            raise HTTPException(status_code=404, detail=f"No daily data found for {ticker}")
        
        # Convert to response format
        data_points = []
        for idx, row in daily_df.iterrows():
            timestamp_str = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
            local_ts = None
            if "local_timestamp" in row and pd.notna(row["local_timestamp"]):
                local_ts = str(row["local_timestamp"])
            
            data_points.append(PriceDataPoint(
                timestamp=timestamp_str,
                local_timestamp=local_ts,
                open=float(row.get("Open", 0)),
                high=float(row.get("High", 0)),
                low=float(row.get("Low", 0)),
                close=float(row.get("Close", 0)),
                adj_close=float(row.get("Adj Close")) if "Adj Close" in row and pd.notna(row.get("Adj Close")) else None,
                volume=float(row.get("Volume")) if "Volume" in row and pd.notna(row.get("Volume")) else None,
            ))
        
        # Technical indicators
        tech_indicators = None
        if tech_df is not None and not tech_df.empty:
            tech_indicators = []
            for idx, row in tech_df.iterrows():
                timestamp_str = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
                tech_indicators.append(TechnicalIndicator(
                    timestamp=timestamp_str,
                    sma20=float(row.get("SMA20")) if "SMA20" in row and pd.notna(row.get("SMA20")) else None,
                    sma50=float(row.get("SMA50")) if "SMA50" in row and pd.notna(row.get("SMA50")) else None,
                    sma200=float(row.get("SMA200")) if "SMA200" in row and pd.notna(row.get("SMA200")) else None,
                    ema20=float(row.get("EMA20")) if "EMA20" in row and pd.notna(row.get("EMA20")) else None,
                    ema50=float(row.get("EMA50")) if "EMA50" in row and pd.notna(row.get("EMA50")) else None,
                    rsi14=float(row.get("RSI14")) if "RSI14" in row and pd.notna(row.get("RSI14")) else None,
                ))
        
        return DailyDataResponse(
            ticker=ticker,
            data=data_points,
            technicals=tech_indicators,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ticker_daily for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/minute", response_model=MinuteDataResponse)
async def get_ticker_minute(ticker: str):
    """Get 1-minute intraday data for a ticker."""
    try:
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        minute_df = load_minute(ticker, market)
        
        if minute_df.empty:
            raise HTTPException(status_code=404, detail=f"No minute data found for {ticker}")
        
        # Convert to response format
        data_points = []
        for idx, row in minute_df.iterrows():
            timestamp_str = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
            local_ts = None
            if "local_timestamp" in row and pd.notna(row["local_timestamp"]):
                local_ts = str(row["local_timestamp"])
            
            data_points.append(PriceDataPoint(
                timestamp=timestamp_str,
                local_timestamp=local_ts,
                open=float(row.get("Open", 0)),
                high=float(row.get("High", 0)),
                low=float(row.get("Low", 0)),
                close=float(row.get("Close", 0)),
                adj_close=float(row.get("Adj Close")) if "Adj Close" in row and pd.notna(row.get("Adj Close")) else None,
                volume=float(row.get("Volume")) if "Volume" in row and pd.notna(row.get("Volume")) else None,
            ))
        
        return MinuteDataResponse(
            ticker=ticker,
            data=data_points,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ticker_minute for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/fundamentals", response_model=FundamentalsResponse)
async def get_ticker_fundamentals(ticker: str):
    """Get fundamentals for a ticker."""
    try:
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        fundamentals = load_fundamentals(ticker, market)
        
        if not fundamentals:
            raise HTTPException(status_code=404, detail=f"No fundamentals found for {ticker}")
        
        return FundamentalsResponse(
            ticker=ticker,
            info=fundamentals.get("info", {}),
            fast_info=fundamentals.get("fast_info"),
            balance_sheet=fundamentals.get("balance_sheet"),
            income_statement=fundamentals.get("income_statement"),
            cashflow_statement=fundamentals.get("cashflow_statement"),
            derived=fundamentals.get("derived"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ticker_fundamentals for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/peers")
async def get_ticker_peers(ticker: str, limit: Optional[int] = Query(10)):
    """
    Get peer companies (same industry/sector) for a ticker.
    
    Uses industry/sector from screener data, with fallback to fundamentals if missing.
    """
    try:
        # Get screener data
        screener_df = get_screener_df()
        if screener_df.empty:
            return {
                "peers": [],
                "industry": None,
                "sector": None,
                "reason": "No screener data available."
            }
        
        # USE FUNDAMENTALS ONLY - This is the PRIMARY and ONLY source for sector/industry
        # Do NOT use screener snapshot as it may be stale or have NULL values
        industry = None
        sector = None
        
        try:
            # Get market from metadata
            from app.data_access import load_metadata
            metadata = load_metadata(ticker)
            market = metadata.get("market") if metadata else None
            
            if not market:
                logger.warning(f"Could not determine market for {ticker}")
                return {
                    "peers": [],
                    "industry": None,
                    "sector": None,
                    "reason": f"Could not determine market for {ticker}. Cannot load fundamentals."
                }
            
            # Load fundamentals - THIS IS THE ONLY SOURCE
            fundamentals = load_fundamentals(ticker, market)
            logger.info(f"Loading sector/industry from fundamentals for {ticker} (market={market}): has_fundamentals={bool(fundamentals)}")
            
            if fundamentals and isinstance(fundamentals, dict):
                # Try to get info from multiple possible locations
                info = fundamentals.get("info", {})
                if not info or not isinstance(info, dict):
                    info = fundamentals.get("Info", {})
                if not info or not isinstance(info, dict):
                    info = {}
                
                logger.info(f"Fundamentals keys for {ticker}: {list(fundamentals.keys())}")
                if info:
                    logger.info(f"Info keys for {ticker}: {list(info.keys())[:30]}")
                    
                    # Try ALL possible sources for industry - check every key that might contain industry
                    industry_candidates = []
                    for key in info.keys():
                        key_lower = str(key).lower()
                        if "industry" in key_lower and key_lower != "industrycategory":
                            industry_candidates.append(info.get(key))
                    
                    # Also try standard names
                    industry_candidates.extend([
                        info.get("industry"),
                        info.get("Industry"),
                        info.get("industryDisp"),
                        info.get("industryKey"),
                        info.get("industryClassification"),
                        info.get("industryName"),
                        info.get("industryCategory"),
                    ])
                    
                    for candidate in industry_candidates:
                        if candidate and not pd.isna(candidate) if hasattr(pd, 'isna') else (candidate == candidate if isinstance(candidate, float) else True):
                            candidate_str = str(candidate).strip()
                            if candidate_str.lower() not in ["none", "null", "nan", "n/a", ""]:
                                industry = candidate_str
                                logger.info(f"Found industry for {ticker} from fundamentals: {industry}")
                                break
                    
                    # Try ALL possible sources for sector
                    sector_candidates = []
                    for key in info.keys():
                        key_lower = str(key).lower()
                        if "sector" in key_lower:
                            sector_candidates.append(info.get(key))
                    
                    # Also try standard names
                    sector_candidates.extend([
                        info.get("sector"),
                        info.get("Sector"),
                        info.get("sectorDisp"),
                        info.get("sectorKey"),
                        info.get("sectorClassification"),
                        info.get("sectorName"),
                    ])
                    
                    for candidate in sector_candidates:
                        if candidate and not pd.isna(candidate) if hasattr(pd, 'isna') else (candidate == candidate if isinstance(candidate, float) else True):
                            candidate_str = str(candidate).strip()
                            if candidate_str.lower() not in ["none", "null", "nan", "n/a", ""]:
                                sector = candidate_str
                                logger.info(f"Found sector for {ticker} from fundamentals: {sector}")
                                break
                else:
                    logger.warning(f"Info dict is empty or invalid for {ticker}: type={type(info)}, value={info}")
            else:
                logger.warning(f"Fundamentals is empty or invalid for {ticker}: type={type(fundamentals)}")
        except Exception as e:
            logger.error(f"Error loading fundamentals for {ticker}: {e}", exc_info=True)
            return {
                "peers": [],
                "industry": None,
                "sector": None,
                "reason": f"Error loading fundamentals for {ticker}: {str(e)}"
            }
        
        # Normalize to strings and strip
        if industry:
            industry = str(industry).strip()
            if industry == "" or industry.lower() in ["none", "null", "nan", "n/a"]:
                industry = None
        if sector:
            sector = str(sector).strip()
            if sector == "" or sector.lower() in ["none", "null", "nan", "n/a"]:
                sector = None
        
        # If we don't have sector/industry from fundamentals, return early with debug info
        if not industry and not sector:
            logger.warning(f"Could not find industry/sector for {ticker} from fundamentals")
            # Log what we actually found for debugging
            if fundamentals and isinstance(fundamentals, dict):
                info = fundamentals.get("info", {})
                if info:
                    logger.warning(f"Available info keys for {ticker}: {list(info.keys())[:50]}")
                    # Log any keys that might be related
                    related_keys = [k for k in info.keys() if 'industry' in str(k).lower() or 'sector' in str(k).lower()]
                    if related_keys:
                        logger.warning(f"Found related keys for {ticker}: {related_keys}")
                        for key in related_keys:
                            logger.warning(f"  {key} = {info.get(key)}")
            return {
                "peers": [],
                "industry": None,
                "sector": None,
                "reason": f"No industry/sector information found in fundamentals for {ticker}. Please ensure financials_full.json contains this data in the 'info' section. Check backend logs for available keys."
            }
        
        # Now find peers from screener data using the sector/industry we found
        logger.info(f"Filtering peers for {ticker} with sector={sector}, industry={industry}")
        
        # Normalize the search values
        industry_search = str(industry).strip().lower() if industry else ""
        sector_search = str(sector).strip().lower() if sector else ""
        
        # Filter peers by computing industry/sector from fundamentals for each ticker
        # This ensures we always use the latest data from financials_full.json
        peers = []
        from app.screener_engine import safe_get
        
        for _, row in screener_df.iterrows():
            peer_ticker = row.get("ticker")
            if not peer_ticker or peer_ticker == ticker:
                continue
            
            try:
                # Get market for this peer
                peer_market = row.get("market")
                if not peer_market:
                    continue
                
                # Load fundamentals for this peer to get industry/sector
                peer_fundamentals = load_fundamentals(peer_ticker, peer_market)
                if not peer_fundamentals or not isinstance(peer_fundamentals, dict):
                    continue
                
                # Extract industry/sector using same logic as compute_screener_row
                peer_info = peer_fundamentals.get("info", {})
                if not peer_info or not isinstance(peer_info, dict):
                    continue
                
                # Try all possible sources for sector
                peer_sector = None
                sector_candidates = [
                    peer_info.get("sector"),
                    peer_info.get("Sector"),
                    peer_info.get("sectorDisp"),
                    peer_info.get("sectorKey"),
                    peer_info.get("sectorClassification"),
                    peer_info.get("sectorInfo"),
                ]
                for candidate in sector_candidates:
                    if candidate and str(candidate).strip().lower() not in ["none", "null", "nan", "n/a", ""]:
                        peer_sector = str(candidate).strip().lower()
                        break
                
                # Try all possible sources for industry
                peer_industry = None
                industry_candidates = [
                    peer_info.get("industry"),
                    peer_info.get("Industry"),
                    peer_info.get("industryDisp"),
                    peer_info.get("industryKey"),
                    peer_info.get("industryClassification"),
                    peer_info.get("industryInfo"),
                    peer_info.get("industryName"),
                ]
                for candidate in industry_candidates:
                    if candidate and str(candidate).strip().lower() not in ["none", "null", "nan", "n/a", ""]:
                        peer_industry = str(candidate).strip().lower()
                        break
                
                # Match if industry/sector matches
                match = False
                if industry and sector:
                    # Match both industry and sector
                    match = (peer_industry == industry_search and peer_sector == sector_search)
                elif industry:
                    # Match industry only
                    match = (peer_industry == industry_search)
                elif sector:
                    # Match sector only
                    match = (peer_sector == sector_search)
                else:
                    # No criteria to match
                    continue
                
                if match:
                    # Convert row to dict and add to peers
                    row_dict = row.to_dict()
                    # Convert NaN/None values to None for Pydantic
                    for key, value in row_dict.items():
                        if pd.isna(value) if hasattr(pd, 'isna') else (value != value if isinstance(value, float) else False):
                            row_dict[key] = None
                    peers.append(ScreenerRow(**row_dict))
                    
            except Exception as e:
                logger.debug(f"Failed to process peer {peer_ticker}: {e}")
                continue
        
        logger.info(f"Found {len(peers)} peers for {ticker} (sector={sector}, industry={industry})")
        
        # Sort by market cap and limit
        peers.sort(key=lambda x: x.market_cap or 0, reverse=True)
        peers = peers[:limit] if limit else peers
        
        return {
            "peers": [p.dict() for p in peers],
            "industry": industry,
            "sector": sector,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ticker_peers for {ticker}: {e}", exc_info=True)
        return {
            "peers": [],
            "industry": None,
            "sector": None,
            "reason": f"Error loading peers: {str(e)}"
        }


@app.get("/api/ticker/{ticker}/quarterly")
async def get_ticker_quarterly(ticker: str):
    """
    Get quarterly financial results.
    
    Returns last 12 quarters of income statement, balance sheet, and cash flow data.
    Date keys are in format "YYYY-MM-DD 00:00:00" (yfinance format).
    """
    try:
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        fundamentals = load_fundamentals(ticker, market)
        
        if not fundamentals:
            raise HTTPException(status_code=404, detail=f"No fundamentals found for {ticker}")
        
        income_stmt = fundamentals.get("income_statement", {})
        balance_sheet = fundamentals.get("balance_sheet", {})
        cashflow = fundamentals.get("cashflow_statement", {})
        
        # Extract dates from income statement (dates are keys like "2025-03-31 00:00:00")
        # Filter for quarterly data by checking date intervals (quarterly = ~3 months apart)
        dates = []
        if isinstance(income_stmt, dict):
            from datetime import datetime, timedelta
            all_dates = []
            for key in income_stmt.keys():
                if isinstance(key, str) and len(key) >= 10:
                    # Try to parse as date (first 10 chars are YYYY-MM-DD)
                    try:
                        date_obj = datetime.strptime(key[:10], "%Y-%m-%d")
                        all_dates.append((key, date_obj))
                    except (ValueError, TypeError):
                        continue
            
            # Sort by date descending
            all_dates.sort(key=lambda x: x[1], reverse=True)
            
            # Filter for quarterly data: dates should be approximately 3 months apart
            # (not 12 months which would be annual)
            quarterly_dates = []
            for i, (key, date_obj) in enumerate(all_dates):
                if i == 0:
                    # Always include the most recent date
                    quarterly_dates.append((key, date_obj))
                else:
                    # Check if this date is approximately 3 months (90 days) from the previous
                    prev_date = quarterly_dates[-1][1]
                    days_diff = abs((date_obj - prev_date).days)
                    # Quarterly: 60-120 days apart, Annual: 300-400 days apart
                    if 60 <= days_diff <= 120:
                        quarterly_dates.append((key, date_obj))
                    elif days_diff > 120 and len(quarterly_dates) < 4:
                        # If we have less than 4 quarters, might be annual data, skip
                        continue
            
            # Take last 12 quarters
            dates = [key for key, _ in quarterly_dates[:12]]
        
        # Build quarters data
        quarters = []
        for date in dates:
            quarter_data = {
                "date": date,  # Full date string "YYYY-MM-DD 00:00:00"
                "income_statement": income_stmt.get(date, {}),
                "balance_sheet": balance_sheet.get(date, {}),
                "cashflow": cashflow.get(date, {}),
            }
            quarters.append(quarter_data)
        
        return {
            "ticker": ticker,
            "quarters": quarters,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ticker_quarterly for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/realtime")
async def get_ticker_realtime(ticker: str):
    """
    Get real-time price and change for a ticker using yfinance.
    Uses fast_info for quick access, falls back to history, then cached data.
    """
    try:
        import yfinance as yf
        from datetime import datetime, timedelta
        
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        # Create yfinance ticker symbol
        yf_ticker = ticker
        if market == "IN" and not ticker.endswith(".NS"):
            yf_ticker = f"{ticker.split('.')[0]}.NS"
        elif market == "UK" and not ticker.endswith(".L"):
            yf_ticker = f"{ticker.split('.')[0]}.L"
        elif market == "HK" and not ticker.endswith(".HK"):
            yf_ticker = f"{ticker.split('.')[0]}.HK"
        elif market == "JP" and not ticker.endswith(".T"):
            yf_ticker = f"{ticker.split('.')[0]}.T"
        
        # Try fast_info first (faster than info)
        try:
            stock = yf.Ticker(yf_ticker)
            fast_info = stock.fast_info
            
            current_price = fast_info.get("lastPrice") or fast_info.get("regularMarketPrice")
            prev_close = fast_info.get("previousClose")
            
            if current_price and prev_close:
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                return {
                    "ticker": ticker,
                    "current_price": float(current_price),
                    "change": float(change),
                    "change_percent": float(change_percent),
                    "source": "yfinance_fast_info"
                }
        except Exception as fast_err:
            logger.debug(f"fast_info failed for {ticker}, trying history: {fast_err}")
        
        # Fallback to history (last 2 days)
        try:
            stock = yf.Ticker(yf_ticker)
            hist = stock.history(period="2d", interval="1d")
            if not hist.empty and len(hist) >= 1:
                latest_close = float(hist.iloc[-1]["Close"])
                prev_close = float(hist.iloc[-2]["Close"]) if len(hist) > 1 else latest_close
                change = latest_close - prev_close
                change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                return {
                    "ticker": ticker,
                    "current_price": float(latest_close),
                    "change": float(change),
                    "change_percent": float(change_percent),
                    "source": "yfinance_history"
                }
        except Exception as hist_err:
            logger.debug(f"history failed for {ticker}, using cached data: {hist_err}")
        
        # Final fallback: use cached daily data
        daily_df = load_daily(ticker, market)
        if not daily_df.empty:
            latest_close = float(daily_df.iloc[-1]["Close"])
            prev_close = float(daily_df.iloc[-2]["Close"]) if len(daily_df) > 1 else latest_close
            change = latest_close - prev_close
            change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
            return {
                "ticker": ticker,
                "current_price": float(latest_close),
                "change": float(change),
                "change_percent": float(change_percent),
                "source": "cached_daily"
            }
        
        raise HTTPException(status_code=404, detail=f"No price data available for {ticker}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching real-time data for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch real-time data: {str(e)}")


@app.get("/api/ticker/{ticker}/news")
async def get_ticker_news(ticker: str):
    """
    Get comprehensive news for a ticker, organized by relevance:
    - Stock-specific news (first)
    - Sector/peer news (second)
    - Generic news (last)
    All news includes sentiment analysis.
    """
    try:
        from app.news_utils import organize_news_by_relevance
        
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        # Get sector/industry from screener or fundamentals
        sector = None
        industry = None
        try:
            screener_df = get_screener_df()
            if not screener_df.empty:
                ticker_row = screener_df[screener_df["ticker"] == ticker]
                if not ticker_row.empty:
                    ticker_row_dict = ticker_row.iloc[0].to_dict()
                    industry = ticker_row_dict.get("industry")
                    sector = ticker_row_dict.get("sector")
                    import pandas as pd
                    if pd.isna(industry) if hasattr(pd, 'isna') else (industry != industry if isinstance(industry, float) else False):
                        industry = None
                    if pd.isna(sector) if hasattr(pd, 'isna') else (sector != sector if isinstance(sector, float) else False):
                        sector = None
                    if industry:
                        industry = str(industry).strip()
                    if sector:
                        sector = str(sector).strip()
        except Exception as e:
            logger.debug(f"Could not get sector/industry from screener: {e}")
        
        # Fallback to fundamentals
        if not industry or not sector:
            try:
                fundamentals = load_fundamentals(ticker, market)
                if fundamentals:
                    info = fundamentals.get("info", {})
                    if not industry:
                        industry = (info.get("industry") or info.get("industryDisp") or 
                                  info.get("industryKey") or info.get("industryClassification"))
                    if not sector:
                        sector = (info.get("sector") or info.get("sectorDisp") or 
                                info.get("sectorKey") or info.get("sectorClassification"))
            except Exception:
                pass
        
        # Load all news for this ticker
        news_list = load_news(ticker, market)
        
        # Organize by relevance and add sentiment
        organized = organize_news_by_relevance(news_list, ticker, sector, industry)
        
        # Get sector/peer news
        sector_peer_news = []
        try:
            sector_news_response = await get_sector_news(ticker, limit=20)
            if sector_news_response and sector_news_response.get("news"):
                sector_peer_news = sector_news_response["news"]
                # Add sentiment to sector news
                from app.news_utils import analyze_sentiment
                for news in sector_peer_news:
                    sentiment_data = analyze_sentiment(
                        news.get("title", ""),
                        news.get("summary", "")
                    )
                    news["sentiment"] = sentiment_data["sentiment"]
                    news["sentiment_score"] = sentiment_data["score"]
        except Exception as e:
            logger.debug(f"Could not load sector news: {e}")
        
        # Combine sector/peer news with organized news
        organized["sector_peer"].extend(sector_peer_news)
        # Remove duplicates by link
        seen_links = set()
        deduped_sector_peer = []
        for news in organized["sector_peer"]:
            link = news.get("link", "")
            if link and link not in seen_links:
                seen_links.add(link)
                deduped_sector_peer.append(news)
            elif not link:
                deduped_sector_peer.append(news)
        organized["sector_peer"] = deduped_sector_peer
        organized["sector_peer"].sort(
            key=lambda x: x.get("provider_time_utc") or x.get("timestamp") or "",
            reverse=True
        )
        
        # Return organized structure
        return {
            "stock_specific": organized["stock_specific"],
            "sector_peer": organized["sector_peer"][:30],  # Limit sector/peer news
            "generic": organized["generic"],
            "sector": sector,
            "industry": industry,
        }
    except Exception as e:
        logger.error(f"Error in get_ticker_news for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker/{ticker}/sector-news")
async def get_sector_news(ticker: str, limit: Optional[int] = Query(20)):
    """Get news relevant to the ticker's sector/industry."""
    try:
        # Get screener data to find sector/industry
        screener_df = get_screener_df()
        if screener_df.empty:
            return {
                "news": [],
                "industry": None,
                "sector": None,
                "reason": "No screener data available for sector news."
            }
        
        # Find the ticker in screener data
        ticker_row = screener_df[screener_df["ticker"] == ticker]
        if ticker_row.empty:
            return {
                "news": [],
                "industry": None,
                "sector": None,
                "reason": f"Ticker {ticker} not found in screener data."
            }
        
        # Get industry/sector from screener row - handle NaN/None properly
        ticker_row_dict = ticker_row.iloc[0].to_dict()
        industry = ticker_row_dict.get("industry")
        sector = ticker_row_dict.get("sector")
        
        # Convert pandas NaN to None
        import pandas as pd
        if pd.isna(industry) if hasattr(pd, 'isna') else (industry != industry if isinstance(industry, float) else False):
            industry = None
        if pd.isna(sector) if hasattr(pd, 'isna') else (sector != sector if isinstance(sector, float) else False):
            sector = None
        
        # Fallback: try to load from fundamentals if missing
        if not industry and not sector:
            try:
                # Get market from metadata or screener row
                market = ticker_row_dict.get("market")
                if not market:
                    # Try to infer from ticker or load metadata
                    from app.data_access import load_metadata
                    metadata = load_metadata(ticker)
                    market = metadata.get("market")
                
                fundamentals = load_fundamentals(ticker, market)
                if fundamentals:
                    info = fundamentals.get("info", {})
                    # Try multiple sources
                    industry = (industry or 
                               info.get("industry") or 
                               info.get("industryDisp") or 
                               info.get("industryKey") or
                               info.get("industryClassification"))
                    sector = (sector or 
                             info.get("sector") or 
                             info.get("sectorDisp") or 
                             info.get("sectorKey") or
                             info.get("sectorClassification"))
            except Exception as e:
                logger.warning(f"Could not load fundamentals for {ticker} fallback in sector-news: {e}")
        
        # Normalize to strings and strip
        if industry:
            industry = str(industry).strip()
            if industry == "" or industry.lower() == "none":
                industry = None
        if sector:
            sector = str(sector).strip()
            if sector == "" or sector.lower() == "none":
                sector = None
        
        if not industry and not sector:
            return {
                "news": [],
                "industry": None,
                "sector": None,
                "reason": "No sector/industry available for sector news."
            }
        
        # Get metadata for market
        try:
            metadata = load_metadata(ticker)
            market = metadata.get("market")
        except Exception as e:
            logger.warning(f"Could not load metadata for {ticker}: {e}")
            market = None
        
        # Get all tickers in same industry/sector (using screener data)
        relevant_tickers = []
        
        if not screener_df.empty and (industry or sector):
            # Use industry/sector from screener data directly
            if industry:
                industry_matches = screener_df[
                    (screener_df["industry"].astype(str).str.strip() == industry) &
                    (screener_df["ticker"] != ticker)
                ]
                relevant_tickers.extend(industry_matches["ticker"].tolist())
            
            if sector:
                sector_matches = screener_df[
                    (screener_df["sector"].astype(str).str.strip() == sector) &
                    (screener_df["ticker"] != ticker)
                ]
                relevant_tickers.extend(sector_matches["ticker"].tolist())
            
            # Remove duplicates
            relevant_tickers = list(set(relevant_tickers))
        
        # Collect news from relevant tickers
        all_news = []
        for rel_ticker in relevant_tickers[:10]:  # Limit to avoid too many calls
            try:
                news_list = load_news(rel_ticker, market)
                for news in news_list:
                    news["related_ticker"] = rel_ticker
                    all_news.append(news)
            except Exception as e:
                logger.debug(f"Could not load news for {rel_ticker}: {e}")
                continue
        
        # Sort by timestamp and limit
        all_news.sort(key=lambda x: x.get("timestamp") or x.get("provider_time_utc") or "", reverse=True)
        
        return {
            "news": all_news[:limit],
            "industry": industry,
            "sector": sector,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_sector_news for {ticker}: {e}", exc_info=True)
        return {
            "news": [],
            "industry": None,
            "sector": None,
            "reason": f"Error loading sector news: {str(e)}"
        }


@app.post("/api/ticker/{ticker}/ai-insights", response_model=AIInsightsResponse)
@app.get("/api/ticker/{ticker}/ai-insights", response_model=AIInsightsResponse)
async def get_ai_insights(ticker: str, request: Optional[AIInsightsRequest] = None):
    """
    Generate AI insights for a ticker using Groq LLM.
    
    Requires GROQ_API_KEY to be set in environment or .env file.
    If not configured, returns an error message in the response.
    
    Uses:
    - Latest screener metrics (valuation, returns, quality)
    - Recent daily prices and technical indicators
    - Recent news headlines (from news.json)
    - Optional strategy context from request
    """
    try:
        # Check if Groq is configured - with fallback to hardcoded key
        api_key = settings.GROQ_API_KEY
        if not api_key or not api_key.strip():
            # Try environment variable
            import os
            api_key = os.getenv("GROQ_API_KEY")
            if api_key:
                settings.GROQ_API_KEY = api_key
            else:
                logger.warning("GROQ_API_KEY not configured")
        
        # Ensure API key is set
        if not api_key or not api_key.strip():
            return AIInsightsResponse(
                summary="AI analysis is currently unavailable. Please check API configuration.",
                bull_case="",
                bear_case="",
                key_points=[],
                risk_factors=[],
                metrics_to_watch=[],
                time_horizon="N/A",
                risk_profile="N/A",
                data_warnings=["GROQ_API_KEY not configured"],
                key_metrics=[],
            )
        
        metadata = load_metadata(ticker)
        market = metadata.get("market")
        
        # Load data - use sequential for reliability (pandas/pyarrow thread safety)
        # Parallel loading can cause issues with pandas DataFrames
        daily_df = load_daily(ticker, market)
        tech_df = load_technicals(ticker, market)
        fundamentals = load_fundamentals(ticker, market)
        news = load_news(ticker, market)
        
        # Get screener row - ensure it's a dict, not a Pydantic model
        screener_row_dict = compute_screener_row(
            ticker=ticker,
            daily_df=daily_df,
            tech_df=tech_df,
            fundamentals=fundamentals,
            metadata=metadata,
        )
        # Ensure screener_row is a plain dict (not Pydantic model)
        if hasattr(screener_row_dict, 'dict'):
            screener_row = screener_row_dict.dict()
        elif hasattr(screener_row_dict, '__dict__'):
            screener_row = screener_row_dict.__dict__
        else:
            screener_row = screener_row_dict
        
        # Ensure screener_row is a proper dict and handle any special types
        if not isinstance(screener_row, dict):
            screener_row = dict(screener_row) if screener_row else {}
        
        # Convert any pandas Series or special types to plain Python types
        import pandas as pd
        screener_row_clean = {}
        for key, value in screener_row.items():
            if pd.isna(value) if hasattr(pd, 'isna') else (value != value if isinstance(value, float) else False):
                screener_row_clean[key] = None
            elif hasattr(value, 'item'):  # numpy scalar
                screener_row_clean[key] = value.item()
            else:
                screener_row_clean[key] = value
        screener_row = screener_row_clean
        
        # Load peers for comparison
        peers_data = None
        try:
            peers_response = await get_ticker_peers(ticker, limit=5)
            if peers_response and peers_response.get("peers"):
                peers_data = peers_response["peers"]
        except Exception as e:
            logger.warning(f"Failed to load peers for {ticker}: {e}")
        
        # Generate AI insights
        strategy_context = request.strategy_context if request else None
        
        # Use analyst-grade function
        from app.ai_analysis import generate_analyst_insights
        try:
            insights = generate_analyst_insights(
                ticker=ticker,
                screener_row=screener_row,
                daily_df=daily_df,
                tech_df=tech_df,
                fundamentals=fundamentals,
                news=news,
                peers=peers_data,
                strategy_context=strategy_context,
            )
            
            # Validate response matches schema
            return AIInsightsResponse(**insights)
        except Exception as ai_error:
            logger.error(f"Error in generate_analyst_insights for {ticker}: {ai_error}", exc_info=True)
            # Return structured error instead of crashing
            return AIInsightsResponse(
                summary=f"AI analysis failed: {str(ai_error)}. Please try again or check logs for details.",
                bull_case="",
                bear_case="",
                key_points=[],
                risk_factors=[],
                metrics_to_watch=[],
                time_horizon="N/A",
                risk_profile="N/A",
                data_warnings=[f"Error: {str(ai_error)}"],
                key_metrics=[],
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_ai_insights for {ticker}: {e}", exc_info=True)
        # Return structured error instead of crashing
        return AIInsightsResponse(
            summary=f"AI analysis is currently unavailable. Please check API configuration. Error: {str(e)}",
            bull_case="",
            bear_case="",
            key_points=[],
            risk_factors=[],
            metrics_to_watch=[],
            time_horizon="N/A",
            risk_profile="N/A",
            data_warnings=[f"Error: {str(e)}"],
            key_metrics=[],
        )


# ============================================================================
# INSIDER FLOW API ROUTES (SEC Form 4 + 13F)
# ============================================================================

@app.get("/api/insider-flow/signals")
async def get_insider_signals(days: int = Query(90, ge=1, le=365)):
    """Get insider trading signals (daily aggregated) from SEC Form 4."""
    try:
        from app.insider_flow import load_insider_signals
        signals = load_insider_signals(days=days)
        return {"signals": signals, "count": len(signals)}
    except Exception as e:
        logger.error(f"Error in get_insider_signals: {e}", exc_info=True)
        return {"signals": [], "count": 0, "error": str(e)}


@app.get("/api/insider-flow/trades")
async def get_insider_trades(days: int = Query(30, ge=1, le=180), limit: int = Query(100, ge=1, le=500)):
    """Get recent insider trades from SEC Form 4."""
    try:
        from app.insider_flow import load_insider_trades
        trades = load_insider_trades(days=days, limit=limit)
        return {"trades": trades, "count": len(trades)}
    except Exception as e:
        logger.error(f"Error in get_insider_trades: {e}", exc_info=True)
        return {"trades": [], "count": 0, "error": str(e)}


@app.get("/api/insider-flow/summary")
async def get_insider_summary_endpoint():
    """Get summary statistics for insider trading."""
    try:
        from app.insider_flow import get_insider_summary
        summary = get_insider_summary()
        return summary
    except Exception as e:
        logger.error(f"Error in get_insider_summary: {e}", exc_info=True)
        return {"error": str(e)}


@app.get("/api/insider-flow/13f")
async def get_13f_signals(days: int = Query(180, ge=1, le=365)):
    """Get 13F hedge fund position signals."""
    try:
        from app.insider_flow import load_13f_signals
        signals = load_13f_signals(days=days)
        return {"signals": signals, "count": len(signals)}
    except Exception as e:
        logger.error(f"Error in get_13f_signals: {e}", exc_info=True)
        return {"signals": [], "count": 0, "error": str(e)}


# ============================================================================
# SMART MONEY FLOW API ROUTES (FII/DII)
# ============================================================================

@app.get("/api/smart-money/daily")
async def get_fii_dii_daily():
    """Get FII/DII daily cash market data."""
    try:
        from app.insider_flow import load_fii_dii_daily
        data = load_fii_dii_daily()
        return {"data": data, "count": len(data)}
    except Exception as e:
        logger.error(f"Error in get_fii_dii_daily: {e}", exc_info=True)
        return {"data": [], "count": 0, "error": str(e)}


@app.get("/api/smart-money/outlook")
async def get_fii_dii_outlook():
    """Get FII/DII daily outlook with regime analysis."""
    try:
        from app.insider_flow import load_fii_dii_outlook
        outlook = load_fii_dii_outlook()
        return outlook
    except Exception as e:
        logger.error(f"Error in get_fii_dii_outlook: {e}", exc_info=True)
        return {"error": str(e)}


@app.get("/api/smart-money/signals")
async def get_fii_dii_signals():
    """Get FII/DII signals with rolling averages."""
    try:
        from app.insider_flow import load_fii_dii_signals
        signals = load_fii_dii_signals()
        return {"signals": signals, "count": len(signals)}
    except Exception as e:
        logger.error(f"Error in get_fii_dii_signals: {e}", exc_info=True)
        return {"signals": [], "count": 0, "error": str(e)}


@app.get("/api/smart-money/summary")
async def get_fii_dii_summary():
    """Get summary statistics for FII/DII flows."""
    try:
        from app.insider_flow import get_fii_dii_summary
        summary = get_fii_dii_summary()
        return summary
    except Exception as e:
        logger.error(f"Error in get_fii_dii_summary: {e}", exc_info=True)
        return {"error": str(e)}


# ============================================================================
# MARKET OVERVIEW API
# ============================================================================

@app.get("/api/intelligence/market-overview")
async def get_market_overview():
    """
    Get market overview with stock counts per market and smart money data.
    Combines screener counts + FII/DII summary.
    """
    try:
        from app.insider_flow import get_fii_dii_summary
        
        # Get stock counts per market from screener
        markets = {}
        for market_code in ['US', 'IN', 'UK', 'JP', 'CN', 'HK', 'SG', 'AU']:
            try:
                # Get count from screener for each market
                if market_code in ['US', 'IN']:
                    # Check intelligence directory for actual stock counts
                    intel_path = INTELLIGENCE_DIR / market_code
                    if intel_path.exists():
                        stock_files = list(intel_path.glob("*.json"))
                        markets[market_code] = {"ticker_count": len(stock_files)}
                    else:
                        # Fallback to estimated counts
                        markets[market_code] = {"ticker_count": 500 if market_code == 'US' else 200}
                else:
                    # Other markets not yet supported
                    markets[market_code] = {"ticker_count": 0}
            except Exception as e:
                logger.warning(f"Error getting count for {market_code}: {e}")
                markets[market_code] = {"ticker_count": 0}
        
        # Get smart money (FII/DII) summary
        smart_money = None
        try:
            summary = get_fii_dii_summary()
            if summary and 'error' not in summary:
                smart_money = {
                    "date": summary.get("latest_date"),
                    "fii_net": summary.get("fii_today", 0),
                    "dii_net": summary.get("dii_today", 0),
                    "total_net": summary.get("total_today", 0),
                    "regime": summary.get("regime", "unknown"),
                    "flow_signal": summary.get("flow_signal", "neutral"),
                    "nifty_close": None,  # Not tracked in current summary
                    "fii_5d_avg": summary.get("fii_5d", 0),
                    "dii_5d_avg": summary.get("dii_5d", 0),
                }
        except Exception as e:
            logger.warning(f"Error getting smart money summary: {e}")
        
        return {
            "markets": markets,
            "smart_money": smart_money,
        }
    except Exception as e:
        logger.error(f"Error in get_market_overview: {e}", exc_info=True)
        return {"markets": {}, "smart_money": None, "error": str(e)}


# ============================================================================
# PRECOMPUTED INTELLIGENCE API ROUTES (READ-ONLY)
# ============================================================================

# Intelligence Version
INTELLIGENCE_VERSION = "v2.0-full-pipeline"

# Path to precomputed snapshots (check multiple locations)
INSIGHTS_DIR = Path(__file__).parent.parent.parent / "public" / "insights"
INTELLIGENCE_DIR = Path(__file__).parent.parent.parent / "public" / "intelligence"
PORTFOLIO_DIR = Path(__file__).parent.parent.parent / "public" / "portfolio"


@app.get("/api/portfolio-snapshot")
async def get_portfolio_snapshot(
    market: str = Query("US", description="Market (US, IN)"),
    universe: str = Query("ALL", description="Universe (ALL, SP500, NASDAQ100, NIFTY50, NIFTY100)"),
):
    """
    Get PRECOMPUTED portfolio intelligence snapshot (FULL 9-LAYER PIPELINE).
    
    NO live computation - returns daily-updated JSON.
    All heavy computation runs offline via GitHub Actions.
    """
    try:
        snapshot_path = None
        
        # Priority 1: Check market-specific portfolio file in new portfolio directory
        market_specific_path = PORTFOLIO_DIR / f"{market}_{universe}.json"
        if market_specific_path.exists():
            snapshot_path = market_specific_path
        
        # Priority 2: Check market-specific portfolio file in insights directory
        if not snapshot_path:
            insights_path = INSIGHTS_DIR / "portfolios" / f"{market}_{universe}.json"
            if insights_path.exists():
                snapshot_path = insights_path
        
        # Priority 3: Fallback to ALL universe for the market
        if not snapshot_path:
            fallback_path = INSIGHTS_DIR / "portfolios" / f"{market}_ALL.json"
            if fallback_path.exists():
                snapshot_path = fallback_path
        
        # Priority 4: Generic portfolio_snapshot.json (only if it matches the requested market)
        if not snapshot_path:
            generic_path = PORTFOLIO_DIR / "portfolio_snapshot.json"
            if generic_path.exists():
                # Check if the generic file has data for the requested market
                try:
                    with open(generic_path, 'r') as f:
                        temp_snapshot = json.load(f)
                    if temp_snapshot.get('market') == market or 'market' not in temp_snapshot:
                        snapshot_path = generic_path
                except:
                    pass
        
        if not snapshot_path:
            return {
                "success": False,
                "error": f"No precomputed snapshot available for {market}/{universe}",
                "hint": "Run 'python -m quant_system.run_full_daily_intelligence' to generate snapshots",
                "version": INTELLIGENCE_VERSION,
                "available_paths_checked": [
                    str(PORTFOLIO_DIR / f"{market}_{universe}.json"),
                    str(INSIGHTS_DIR / "portfolios" / f"{market}_{universe}.json"),
                    str(INSIGHTS_DIR / "portfolios" / f"{market}_ALL.json"),
                    str(PORTFOLIO_DIR / "portfolio_snapshot.json")
                ]
            }
        
        with open(snapshot_path, 'r') as f:
            snapshot = json.load(f)
        
        return {
            "success": True,
            "version": INTELLIGENCE_VERSION,
            "last_updated": snapshot.get('as_of_date') or snapshot.get('generated_at'),
            "data": snapshot
        }
        
    except Exception as e:
        logger.error(f"Error loading portfolio snapshot: {e}")
        return {
            "success": False,
            "error": str(e),
            "version": INTELLIGENCE_VERSION
        }


@app.get("/api/stock-snapshot/{market}/{ticker}")
async def get_stock_snapshot(market: str, ticker: str):
    """
    Get PRECOMPUTED stock intelligence snapshot (FULL 9-LAYER PIPELINE).
    
    Returns decision intent, regime, risk metrics, and historical context.
    NO live computation.
    """
    try:
        # Check new intelligence directory first (9-layer pipeline)
        snapshot_path = INTELLIGENCE_DIR / market / f"{ticker}.json"
        
        # Fallback to old insights directory
        if not snapshot_path.exists():
            snapshot_path = INSIGHTS_DIR / "stocks" / market / f"{ticker}.json"
        
        if not snapshot_path.exists():
            return {
                "success": False,
                "error": f"No snapshot available for {market}/{ticker}",
                "hint": "Stock may not have sufficient data or snapshot not yet generated",
                "version": INTELLIGENCE_VERSION,
                "available_paths_checked": [
                    str(INTELLIGENCE_DIR / market / f"{ticker}.json"),
                    str(INSIGHTS_DIR / "stocks" / market / f"{ticker}.json")
                ]
            }
        
        with open(snapshot_path, 'r') as f:
            snapshot = json.load(f)
        
        return {
            "success": True,
            "version": INTELLIGENCE_VERSION,
            "last_updated": snapshot.get('as_of_date') or snapshot.get('generated_at'),
            "data": snapshot
        }
        
    except Exception as e:
        logger.error(f"Error loading stock snapshot: {e}")
        return {
            "success": False,
            "error": str(e),
            "version": INTELLIGENCE_VERSION
        }


@app.get("/api/intelligence-index")
async def get_intelligence_index():
    """Get index of all available precomputed intelligence."""
    try:
        index_path = INSIGHTS_DIR / "index.json"
        
        if not index_path.exists():
            return {
                "success": False,
                "error": "Intelligence index not found",
                "hint": "Run daily intelligence pipeline to generate snapshots",
                "version": INTELLIGENCE_VERSION
            }
        
        with open(index_path, 'r') as f:
            index = json.load(f)
        
        return {
            "success": True,
            "version": INTELLIGENCE_VERSION,
            **index
        }
        
    except Exception as e:
        logger.error(f"Error loading intelligence index: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.get("/api/intelligence-stocks/{market}")
async def get_intelligence_stocks(market: str):
    """Get list of all available stocks with intelligence data for a market."""
    try:
        market_dir = INTELLIGENCE_DIR / market
        
        if not market_dir.exists():
            return {
                "success": False,
                "stocks": [],
                "error": f"No intelligence data found for market: {market}",
                "version": INTELLIGENCE_VERSION
            }
        
        # Get all JSON files and extract ticker names
        stocks = []
        for f in market_dir.glob("*.json"):
            # Skip special files that start with underscore
            if f.name.startswith("_"):
                continue
            # Remove .json extension to get ticker name
            ticker = f.stem
            stocks.append(ticker)
        
        stocks.sort()
        
        return {
            "success": True,
            "market": market,
            "stocks": stocks,
            "count": len(stocks),
            "version": INTELLIGENCE_VERSION
        }
        
    except Exception as e:
        logger.error(f"Error listing intelligence stocks: {e}")
        return {
            "success": False,
            "stocks": [],
            "error": str(e)
        }


@app.get("/api/top-opportunities/{market}")
async def get_top_opportunities(market: str):
    """
    Get top opportunities and avoid list for a market.
    
    Returns pre-computed ranked lists from _top_opportunities.json.
    """
    try:
        market_upper = market.upper()
        opportunities_file = INTELLIGENCE_DIR / market_upper / "_top_opportunities.json"
        
        if not opportunities_file.exists():
            return {
                "success": False,
                "error": f"Top opportunities not available for market: {market}",
                "opportunities": [],
                "avoid_list": [],
                "version": INTELLIGENCE_VERSION
            }
        
        with open(opportunities_file, "r") as f:
            data = json.load(f)
        
        return {
            "success": True,
            "market": market_upper,
            "generated_at": data.get("generated_at"),
            "version": data.get("version", INTELLIGENCE_VERSION),
            "total_stocks": data.get("total_stocks", 0),
            "initiate_candidates": data.get("initiate_candidates", 0),
            "avoid_candidates": data.get("avoid_candidates", 0),
            "intent_counts": data.get("intent_counts", {}),
            "opportunities": data.get("opportunities", []),
            "avoid_list": data.get("avoid_list", []),
        }
        
    except Exception as e:
        logger.error(f"Error loading top opportunities: {e}")
        return {
            "success": False,
            "error": str(e),
            "opportunities": [],
            "avoid_list": []
        }


# LEGACY ENDPOINT - redirect to new precomputed version
@app.get("/api/portfolio-simulation")
async def get_portfolio_simulation_legacy(
    market: str = Query("US", description="Market (US, IN)"),
    universe: str = Query("ALL", description="Universe"),
    capital: float = Query(1000000, description="Initial capital (ignored - using precomputed)"),
    start_date: str = Query("2019-01-01", description="Start date (ignored - using precomputed)"),
    end_date: str = Query("2024-12-01", description="End date (ignored - using precomputed)"),
):
    """
    LEGACY ENDPOINT - Redirects to precomputed snapshots.
    
    Live computation has been removed for stability.
    All intelligence is now pre-generated daily via GitHub Actions.
    """
    # Redirect to precomputed snapshot
    return await get_portfolio_snapshot(market=market, universe=universe)


# ============================================================================
# LEGACY ENDPOINT REMOVED - Was causing timeouts
# ============================================================================
# The ~500 lines of live simulation code have been removed.
# All computation now happens offline via run_daily_intelligence.py
# API only serves precomputed JSON files.
#
# To regenerate snapshots:
#   python -m quant_system.run_daily_intelligence
# ============================================================================


# ============================================================================
# COVERAGE & SYSTEM STATUS ENDPOINTS
# ============================================================================

@app.get("/api/coverage")
async def get_coverage():
    """
    Returns per-market pipeline coverage breakdown for ALL markets.
    
    MARKET SUPPORT LEVELS:
    - INTELLIGENCE_ENABLED: US, IN (full 14-layer decision engine)
    - SCREENER_ONLY: UK, JP, CN, HK, SG, AU (price data only, no signals)
    
    Shows:
    - Total ingested tickers
    - Valid data count
    - Signal-eligible count (0 for screener-only markets)
    - Decision breakdown (INITIATE, HOLD, AVOID, etc.)
    - Last pipeline run timestamp
    - Pipeline version
    - Explicit status: LIVE, STALE, NOT_SUPPORTED, etc.
    """
    from datetime import datetime
    
    # Find intelligence directory relative to DATA_DIR
    # DATA_DIR is already correctly resolved in config.py
    # Intelligence is at {repo_root}/public/intelligence
    # DATA_DIR is at {repo_root}/data
    # So: INTELLIGENCE_DIR = DATA_DIR.parent / "public" / "intelligence"
    DATA_DIR = settings.DATA_DIR
    REPO_ROOT = DATA_DIR.parent  # Go up from /data to repo root
    INTELLIGENCE_DIR = REPO_ROOT / "public" / "intelligence"
    
    # Log for debugging
    logger.debug(f"Coverage endpoint - DATA_DIR: {DATA_DIR}, INTELLIGENCE_DIR: {INTELLIGENCE_DIR}")
    
    # =========================================================================
    # MARKET CONFIGURATION - EXPLICIT AND TRUTHFUL
    # =========================================================================
    # Intelligence pipeline is ONLY enabled for US and IN
    # Other markets have price data but NO signal/decision engine
    
    INTELLIGENCE_ENABLED_MARKETS = ["US", "IN"]
    SCREENER_ONLY_MARKETS = ["UK", "JP", "CN", "HK", "SG", "AU"]
    ALL_MARKETS = INTELLIGENCE_ENABLED_MARKETS + SCREENER_ONLY_MARKETS
    
    coverage = []
    
    for market in ALL_MARKETS:
        is_intelligence_enabled = market in INTELLIGENCE_ENABLED_MARKETS
        
        market_data = {
            "market": market,
            "total_ingested": 0,
            "data_valid": 0,
            "signal_eligible": 0,
            "decision_generated": {
                "INITIATE": 0,
                "ADD": 0,
                "HOLD": 0,
                "REDUCE": 0,
                "EXIT": 0,
                "AVOID": 0
            },
            "last_pipeline_run": None,
            "pipeline_version": "v2.3-authority",
            "status": "unknown",
            "status_reason": None,
            "support_level": "INTELLIGENCE" if is_intelligence_enabled else "SCREENER_ONLY"
        }
        
        # Count ingested tickers from data directory
        market_data_dir = DATA_DIR / market
        if market_data_dir.exists():
            try:
                ticker_folders = [d for d in market_data_dir.iterdir() if d.is_dir()]
                market_data["total_ingested"] = len(ticker_folders)
                
                # Count valid data (has history.parquet)
                valid_count = sum(1 for d in ticker_folders if (d / "history.parquet").exists())
                market_data["data_valid"] = valid_count
            except Exception as e:
                logger.warning(f"Error counting tickers for {market}: {e}")
        
        # =====================================================================
        # INTELLIGENCE-ENABLED MARKETS (US, IN)
        # =====================================================================
        if is_intelligence_enabled:
            # Load intelligence data for decision breakdown
            opportunities_file = INTELLIGENCE_DIR / market / "_top_opportunities.json"
            if opportunities_file.exists():
                try:
                    with open(opportunities_file, 'r') as f:
                        opp_data = json.load(f)
                    
                    # Get intent counts
                    intent_counts = opp_data.get("intent_counts", {})
                    market_data["decision_generated"] = {
                        "INITIATE": intent_counts.get("INITIATE", 0),
                        "ADD": intent_counts.get("ADD", 0),
                        "HOLD": intent_counts.get("HOLD", 0),
                        "REDUCE": intent_counts.get("REDUCE", 0),
                        "EXIT": intent_counts.get("EXIT", 0),
                        "AVOID": intent_counts.get("AVOID", 0)
                    }
                    
                    # Signal eligible = total stocks with decisions
                    market_data["signal_eligible"] = opp_data.get("total_stocks", 0)
                    
                    # Last pipeline run
                    market_data["last_pipeline_run"] = opp_data.get("generated_at")
                    market_data["pipeline_version"] = opp_data.get("version", "v2.3-authority")
                    
                    # Determine status based on freshness
                    if market_data["last_pipeline_run"]:
                        try:
                            run_time = datetime.fromisoformat(market_data["last_pipeline_run"].replace("Z", "+00:00"))
                            age_hours = (datetime.now() - run_time.replace(tzinfo=None)).total_seconds() / 3600
                            
                            if age_hours < 24:
                                market_data["status"] = "LIVE"
                                market_data["status_reason"] = f"Intelligence updated {age_hours:.1f}h ago"
                            elif age_hours < 48:
                                market_data["status"] = "STALE"
                                market_data["status_reason"] = f"Intelligence is {age_hours:.1f}h old"
                            else:
                                market_data["status"] = "OUTDATED"
                                market_data["status_reason"] = f"Intelligence is {age_hours:.1f}h old - needs refresh"
                        except Exception:
                            market_data["status"] = "LIVE"
                            market_data["status_reason"] = "Timestamp parse error"
                    else:
                        market_data["status"] = "NO_DATA"
                        market_data["status_reason"] = "No pipeline output found"
                        
                except Exception as e:
                    logger.warning(f"Error loading opportunities for {market}: {e}")
                    market_data["status"] = "FAILED"
                    market_data["status_reason"] = f"Error loading intelligence: {str(e)}"
            else:
                market_data["status"] = "NOT_PROCESSED"
                market_data["status_reason"] = f"Intelligence pipeline not yet run for {market}"
        
        # =====================================================================
        # SCREENER-ONLY MARKETS (UK, JP, CN, HK, SG, AU)
        # =====================================================================
        else:
            # Explicitly mark as NOT_SUPPORTED for intelligence
            market_data["signal_eligible"] = 0
            market_data["status"] = "NOT_SUPPORTED"
            market_data["status_reason"] = "Intelligence pipeline not enabled for this market. Screener data only."
            market_data["last_pipeline_run"] = None
            # Decision counts stay at 0 - this is CORRECT, not a bug
        
        coverage.append(market_data)
    
    # Get git commit if available
    git_commit = None
    try:
        git_head = PROJECT_ROOT / ".git" / "HEAD"
        if git_head.exists():
            with open(git_head, 'r') as f:
                ref = f.read().strip()
                if ref.startswith("ref: "):
                    ref_path = PROJECT_ROOT / ".git" / ref[5:]
                    if ref_path.exists():
                        with open(ref_path, 'r') as rf:
                            git_commit = rf.read().strip()[:8]
    except Exception:
        pass
    
    # Summary stats
    intel_markets = [c for c in coverage if c["support_level"] == "INTELLIGENCE"]
    screener_markets = [c for c in coverage if c["support_level"] == "SCREENER_ONLY"]
    
    return {
        "coverage": coverage,
        "summary": {
            "total_markets": len(coverage),
            "intelligence_enabled": len(intel_markets),
            "screener_only": len(screener_markets),
            "total_ingested": sum(c["total_ingested"] for c in coverage),
            "total_signal_eligible": sum(c["signal_eligible"] for c in coverage),
            "total_decisions": sum(
                sum(c["decision_generated"].values()) 
                for c in intel_markets
            )
        },
        "api_version": "1.1.0",
        "git_commit": git_commit,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/system/status")
async def get_system_status():
    """
    Returns system-wide status including:
    - Last successful pipeline run
    - Next scheduled run (if known)
    - Pipeline health per market (intelligence-enabled only)
    - Screener-only markets status
    - Backend environment info
    """
    import os
    from datetime import datetime
    
    # Find intelligence directory relative to DATA_DIR (same as /api/coverage)
    DATA_DIR = settings.DATA_DIR
    REPO_ROOT = DATA_DIR.parent  # Go up from /data to repo root
    INTELLIGENCE_DIR = REPO_ROOT / "public" / "intelligence"
    
    # Market configuration
    INTELLIGENCE_ENABLED_MARKETS = ["US", "IN"]
    SCREENER_ONLY_MARKETS = ["UK", "JP", "CN", "HK", "SG", "AU"]
    
    # Collect pipeline runs from intelligence-enabled markets
    pipeline_runs = []
    market_health = {}
    
    # Intelligence-enabled markets
    for market in INTELLIGENCE_ENABLED_MARKETS:
        opp_file = INTELLIGENCE_DIR / market / "_top_opportunities.json"
        if opp_file.exists():
            try:
                with open(opp_file, 'r') as f:
                    data = json.load(f)
                generated_at = data.get("generated_at")
                if generated_at:
                    pipeline_runs.append(generated_at)
                    
                    # Calculate age
                    try:
                        run_time = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
                        age_hours = (datetime.now() - run_time.replace(tzinfo=None)).total_seconds() / 3600
                        
                        market_health[market] = {
                            "support_level": "INTELLIGENCE",
                            "last_run": generated_at,
                            "age_hours": round(age_hours, 1),
                            "status": "healthy" if age_hours < 24 else ("stale" if age_hours < 48 else "outdated"),
                            "total_stocks": data.get("total_stocks", 0),
                            "version": data.get("version", "unknown")
                        }
                    except Exception:
                        market_health[market] = {
                            "support_level": "INTELLIGENCE",
                            "last_run": generated_at,
                            "status": "unknown"
                        }
            except Exception as e:
                market_health[market] = {
                    "support_level": "INTELLIGENCE",
                    "status": "error",
                    "error": str(e)
                }
        else:
            market_health[market] = {
                "support_level": "INTELLIGENCE",
                "status": "not_available",
                "error": "No intelligence data found"
            }
    
    # Screener-only markets - explicitly mark as NOT_SUPPORTED for intelligence
    for market in SCREENER_ONLY_MARKETS:
        market_data_dir = DATA_DIR / market
        ticker_count = 0
        if market_data_dir.exists():
            try:
                ticker_count = len([d for d in market_data_dir.iterdir() if d.is_dir()])
            except Exception:
                pass
        
        market_health[market] = {
            "support_level": "SCREENER_ONLY",
            "status": "not_supported",
            "status_reason": "Intelligence pipeline not enabled. Screener data only.",
            "ticker_count": ticker_count
        }
    
    # Determine last successful run (intelligence markets only)
    last_successful_run = max(pipeline_runs) if pipeline_runs else None
    
    # Calculate overall health (intelligence markets only)
    intel_markets = [m for m, v in market_health.items() if v.get("support_level") == "INTELLIGENCE"]
    healthy_markets = sum(1 for m in intel_markets if market_health[m].get("status") == "healthy")
    total_intel_markets = len(intel_markets)
    
    if total_intel_markets == 0:
        overall_health = "unhealthy"
    elif healthy_markets == total_intel_markets:
        overall_health = "healthy"
    elif healthy_markets > 0:
        overall_health = "degraded"
    else:
        overall_health = "unhealthy"
    
    return {
        "status": "ok",
        "overall_health": overall_health,
        "last_successful_run": last_successful_run,
        "next_scheduled_run": "06:00 IST daily (GitHub Actions)",
        "market_support": {
            "intelligence_enabled": INTELLIGENCE_ENABLED_MARKETS,
            "screener_only": SCREENER_ONLY_MARKETS,
            "note": "Intelligence pipeline (14-layer decision engine) runs only for US and IN markets. Other markets have screener data only."
        },
        "pipeline_health": market_health,
        "backend": {
            "environment": os.environ.get("RENDER", "local"),
            "api_url": os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8001"),
            "data_dir": str(settings.DATA_DIR),
            "data_dir_exists": settings.DATA_DIR.exists()
        },
        "timestamp": datetime.now().isoformat()
    }


# Run the server


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting uvicorn server...")
    uvicorn.run(
        app,
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level="info",
    )
