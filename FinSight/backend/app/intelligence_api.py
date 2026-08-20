"""
FinSight Intelligence API
==========================

Dedicated read-only API for serving FinSight pipeline outputs.
This API provides structured access to pre-computed intelligence data
without exposing raw filesystem paths.

Endpoints:
- GET /api/intelligence/top-opportunities - INITIATE + AVOID lists by market
- GET /api/intelligence/portfolio - Portfolio intelligence by market
- GET /api/intelligence/stock/{symbol} - Per-stock intelligence
- GET /api/intelligence/status - Pipeline status and schema version
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Intelligence data directories (relative to project root)
PROJECT_ROOT = Path(__file__).parent.parent.parent
INTELLIGENCE_DIR = PROJECT_ROOT / "public" / "intelligence"
PORTFOLIO_DIR = PROJECT_ROOT / "public" / "portfolio"
INSIGHTS_DIR = PROJECT_ROOT / "public" / "insights"

# Current schema version
SCHEMA_VERSION = "2.3-authority"
API_VERSION = "1.0.0"

# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================


class OpportunityItem(BaseModel):
    """Single opportunity in top opportunities list."""
    rank: int
    ticker: str
    market: str
    edge_score: Optional[float] = None
    intent: str
    conviction: float
    expected_return_p50: Optional[float] = None
    cvar_95: float
    regime: str
    regime_alignment: Optional[float] = None
    risk_summary: str
    why_this_beats_alternatives: Optional[str] = None
    recommended_position_pct: Optional[float] = None
    max_position_pct: Optional[float] = None


class AvoidItem(BaseModel):
    """Single item in avoid list."""
    rank: int
    ticker: str
    market: str
    intent: str
    conviction: float
    cvar_95: float
    regime: str
    risk_summary: str
    why_avoid: str


class TopOpportunitiesResponse(BaseModel):
    """Response for top opportunities endpoint."""
    success: bool
    market: str
    generated_at: Optional[str] = None
    schema_version: str = SCHEMA_VERSION
    api_version: str = API_VERSION
    total_stocks: int = 0
    intent_counts: Dict[str, int] = {}
    initiate_list: List[OpportunityItem] = []
    avoid_list: List[AvoidItem] = []
    error: Optional[str] = None


class PortfolioIntelligenceResponse(BaseModel):
    """Response for portfolio intelligence endpoint."""
    success: bool
    market: str
    generated_at: Optional[str] = None
    schema_version: str = SCHEMA_VERSION
    api_version: str = API_VERSION
    risk_regime: Optional[str] = None
    market_regime: Optional[str] = None
    capital_deployment_recommended_pct: Optional[float] = None
    cash_hold_recommended_pct: Optional[float] = None
    new_positions_allowed: Optional[bool] = None
    position_scaling_mode: Optional[str] = None
    max_new_positions_today: Optional[int] = None
    dominant_risk_factor: Optional[str] = None
    aggregate_cvar_95: Optional[float] = None
    aggregate_volatility: Optional[float] = None
    correlation_drag: Optional[float] = None
    portfolio_summary_explanation: Optional[str] = None
    stocks_analyzed: int = 0
    error: Optional[str] = None


class StockIntelligenceResponse(BaseModel):
    """Response for per-stock intelligence endpoint."""
    success: bool
    ticker: str
    market: Optional[str] = None
    as_of_date: Optional[str] = None
    schema_version: str = SCHEMA_VERSION
    api_version: str = API_VERSION
    
    # Core decision
    intent: Optional[str] = None
    direction: Optional[str] = None
    conviction: Optional[float] = None
    conviction_pct: Optional[float] = None
    confidence: Optional[float] = None
    
    # Regime
    asset_regime: Optional[str] = None
    asset_regime_confidence: Optional[float] = None
    market_regime: Optional[str] = None
    market_regime_confidence: Optional[float] = None
    regime_divergence: Optional[str] = None
    days_in_regime: Optional[int] = None
    
    # Volatility
    volatility_20d: Optional[float] = None
    volatility_regime: Optional[str] = None
    vol_percentile: Optional[float] = None
    vol_forecast: Optional[float] = None
    
    # Return distribution
    return_p10: Optional[float] = None
    return_p25: Optional[float] = None
    return_p50: Optional[float] = None
    return_p75: Optional[float] = None
    return_p90: Optional[float] = None
    
    # Risk metrics
    cvar_95: Optional[float] = None
    cvar_95_normal: Optional[float] = None
    cvar_95_stress: Optional[float] = None
    cvar_95_panic: Optional[float] = None
    max_drawdown_expected: Optional[float] = None
    sortino_ratio: Optional[float] = None
    risk_reward_ratio: Optional[float] = None
    
    # Position sizing
    max_position_pct: Optional[float] = None
    recommended_position_pct: Optional[float] = None
    risk_budget_used_pct: Optional[float] = None
    scale_in_tranches: Optional[int] = None
    
    # Signals
    supporting_signals: List[str] = []
    opposing_signals: List[str] = []
    signal_agreement: Optional[float] = None
    
    # Historical context
    n_comparable_setups: Optional[int] = None
    comparable_win_rate: Optional[float] = None
    comparable_median_return: Optional[float] = None
    comparable_worst_outcome: Optional[float] = None
    
    # Conditions
    upgrade_conditions: List[str] = []
    downgrade_conditions: List[str] = []
    risk_factors: List[str] = []
    
    # Rationale
    rationale: Optional[str] = None
    explanation: Optional[str] = None
    
    # Action guidance
    if_holding: Optional[str] = None
    if_not_holding: Optional[str] = None
    recommended_action_explanation: Optional[str] = None
    
    # Price info
    last_price: Optional[float] = None
    price_date: Optional[str] = None
    price_change_1d: Optional[float] = None
    price_change_5d: Optional[float] = None
    price_change_20d: Optional[float] = None
    
    # Data quality
    data_quality: Optional[str] = None
    data_points: Optional[int] = None
    
    # Full raw data for advanced consumers
    raw_data: Optional[Dict[str, Any]] = None
    
    error: Optional[str] = None


class IntelligenceStatusResponse(BaseModel):
    """Response for status endpoint."""
    success: bool
    api_version: str = API_VERSION
    schema_version: str = SCHEMA_VERSION
    last_run_time: Optional[str] = None
    markets_available: List[str] = []
    stocks_by_market: Dict[str, int] = {}
    portfolio_snapshots_available: List[str] = []
    intelligence_directory: str
    data_freshness_hours: Optional[float] = None
    error: Optional[str] = None


# =============================================================================
# ROUTER
# =============================================================================

router = APIRouter(
    prefix="/api/intelligence",
    tags=["Intelligence API"],
    responses={
        404: {"description": "Not found"},
        500: {"description": "Internal server error"},
    },
)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _validate_market(market: str) -> str:
    """Validate and normalize market code."""
    market_upper = market.upper()
    if market_upper not in ["US", "IN"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid market '{market}'. Supported markets: US, IN"
        )
    return market_upper


def _load_json_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Load JSON file with error handling."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error for {file_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error loading {file_path}: {e}")
        return None


def _get_data_freshness_hours(generated_at: Optional[str]) -> Optional[float]:
    """Calculate hours since data was generated."""
    if not generated_at:
        return None
    try:
        # Handle various datetime formats
        for fmt in ["%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
            try:
                gen_time = datetime.strptime(generated_at, fmt)
                delta = datetime.now() - gen_time
                return round(delta.total_seconds() / 3600, 2)
            except ValueError:
                continue
        return None
    except Exception:
        return None


def _safe_float(value, default=0) -> float:
    """Convert value to JSON-safe float, handling NaN, Inf, etc."""
    import math
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def _safe_int(value, default=0) -> int:
    """Convert value to int, handling NaN, etc."""
    import math
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (ValueError, TypeError):
        return default


def _validate_schema_version(data: Dict[str, Any]) -> bool:
    """Validate that data matches expected schema version."""
    version = data.get("version") or data.get("schema_version")
    if not version:
        return True  # Allow data without version for backwards compatibility
    # Check major version matches
    expected_major = SCHEMA_VERSION.split("-")[0]
    actual_major = version.split("-")[0]
    return actual_major == expected_major


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get(
    "/top-opportunities",
    response_model=TopOpportunitiesResponse,
    summary="Get Top Opportunities and Avoid List",
    description="""
    Returns ranked lists of investment opportunities (INITIATE recommendations)
    and stocks to avoid for the specified market.
    
    The opportunities are ranked by edge score and include conviction levels,
    expected returns, and risk metrics.
    """
)
async def get_top_opportunities(
    market: str = Query("US", description="Market code (US or IN)")
) -> TopOpportunitiesResponse:
    """Get top opportunities and avoid list for a market."""
    try:
        market = _validate_market(market)
        
        # Load top opportunities file
        opportunities_file = INTELLIGENCE_DIR / market / "_top_opportunities.json"
        data = _load_json_file(opportunities_file)
        
        if not data:
            return TopOpportunitiesResponse(
                success=False,
                market=market,
                error=f"No top opportunities data available for market: {market}"
            )
        
        # Validate schema
        if not _validate_schema_version(data):
            logger.warning(f"Schema version mismatch for {market} opportunities")
        
        # Parse opportunities
        initiate_list = []
        for opp in data.get("opportunities", []):
            try:
                initiate_list.append(OpportunityItem(**opp))
            except Exception as e:
                logger.warning(f"Failed to parse opportunity: {e}")
        
        # Parse avoid list
        avoid_list = []
        for avoid in data.get("avoid_list", []):
            try:
                avoid_list.append(AvoidItem(**avoid))
            except Exception as e:
                logger.warning(f"Failed to parse avoid item: {e}")
        
        return TopOpportunitiesResponse(
            success=True,
            market=market,
            generated_at=data.get("generated_at"),
            schema_version=data.get("version", SCHEMA_VERSION),
            total_stocks=data.get("total_stocks", 0),
            intent_counts=data.get("intent_counts", {}),
            initiate_list=initiate_list,
            avoid_list=avoid_list
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_top_opportunities: {e}", exc_info=True)
        return TopOpportunitiesResponse(
            success=False,
            market=market,
            error=str(e)
        )


@router.get(
    "/portfolio",
    response_model=PortfolioIntelligenceResponse,
    summary="Get Portfolio Intelligence",
    description="""
    Returns portfolio-level intelligence including risk regime, market regime,
    capital deployment recommendations, and aggregate risk metrics.
    """
)
async def get_portfolio_intelligence(
    market: str = Query("US", description="Market code (US or IN)")
) -> PortfolioIntelligenceResponse:
    """Get portfolio intelligence for a market."""
    try:
        market = _validate_market(market)
        
        # Load portfolio intelligence file
        portfolio_file = INTELLIGENCE_DIR / market / "_portfolio_intelligence.json"
        data = _load_json_file(portfolio_file)
        
        if not data:
            return PortfolioIntelligenceResponse(
                success=False,
                market=market,
                error=f"No portfolio intelligence data available for market: {market}"
            )
        
        # Validate schema
        if not _validate_schema_version(data):
            logger.warning(f"Schema version mismatch for {market} portfolio")
        
        return PortfolioIntelligenceResponse(
            success=True,
            market=market,
            generated_at=data.get("generated_at"),
            schema_version=data.get("version", SCHEMA_VERSION),
            risk_regime=data.get("risk_regime"),
            market_regime=data.get("market_regime"),
            capital_deployment_recommended_pct=data.get("capital_deployment_recommended_pct"),
            cash_hold_recommended_pct=data.get("cash_hold_recommended_pct"),
            new_positions_allowed=data.get("new_positions_allowed"),
            position_scaling_mode=data.get("position_scaling_mode"),
            max_new_positions_today=data.get("max_new_positions_today"),
            dominant_risk_factor=data.get("dominant_risk_factor"),
            aggregate_cvar_95=data.get("aggregate_cvar_95"),
            aggregate_volatility=data.get("aggregate_volatility"),
            correlation_drag=data.get("correlation_drag"),
            portfolio_summary_explanation=data.get("portfolio_summary_explanation"),
            stocks_analyzed=data.get("stocks_analyzed", 0)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_portfolio_intelligence: {e}", exc_info=True)
        return PortfolioIntelligenceResponse(
            success=False,
            market=market,
            error=str(e)
        )


@router.get(
    "/stock/{symbol}",
    response_model=StockIntelligenceResponse,
    summary="Get Stock Intelligence",
    description="""
    Returns comprehensive intelligence for a specific stock including:
    - Decision intent (INITIATE, HOLD, AVOID, etc.)
    - Conviction and confidence levels
    - Regime analysis (asset and market)
    - Risk metrics and return distribution
    - Position sizing recommendations
    - Signal analysis and historical context
    """
)
async def get_stock_intelligence(
    symbol: str,
    market: Optional[str] = Query(None, description="Market code (US or IN). If not provided, will search both markets.")
) -> StockIntelligenceResponse:
    """Get intelligence for a specific stock."""
    try:
        symbol = symbol.upper()
        
        # Try to find the stock in specified market or search both
        markets_to_search = [market.upper()] if market else ["US", "IN"]
        
        data = None
        found_market = None
        
        for m in markets_to_search:
            stock_file = INTELLIGENCE_DIR / m / f"{symbol}.json"
            data = _load_json_file(stock_file)
            if data:
                found_market = m
                break
        
        if not data:
            # Try with .NS suffix for Indian stocks
            if not market or market.upper() == "IN":
                stock_file = INTELLIGENCE_DIR / "IN" / f"{symbol}.NS.json"
                data = _load_json_file(stock_file)
                if data:
                    found_market = "IN"
        
        if not data:
            return StockIntelligenceResponse(
                success=False,
                ticker=symbol,
                error=f"No intelligence data available for symbol: {symbol}"
            )
        
        # Validate schema
        if not _validate_schema_version(data):
            logger.warning(f"Schema version mismatch for {symbol}")
        
        return StockIntelligenceResponse(
            success=True,
            ticker=data.get("ticker", symbol),
            market=found_market,
            as_of_date=data.get("as_of_date"),
            schema_version=data.get("schema_version", SCHEMA_VERSION),
            
            # Core decision
            intent=data.get("intent"),
            direction=data.get("direction"),
            conviction=data.get("conviction"),
            conviction_pct=data.get("conviction_pct"),
            confidence=data.get("confidence"),
            
            # Regime
            asset_regime=data.get("asset_regime"),
            asset_regime_confidence=data.get("asset_regime_confidence"),
            market_regime=data.get("market_regime"),
            market_regime_confidence=data.get("market_regime_confidence"),
            regime_divergence=data.get("regime_divergence"),
            days_in_regime=data.get("days_in_regime"),
            
            # Volatility
            volatility_20d=data.get("volatility_20d"),
            volatility_regime=data.get("volatility_regime"),
            vol_percentile=data.get("vol_percentile"),
            vol_forecast=data.get("vol_forecast"),
            
            # Return distribution
            return_p10=data.get("return_p10"),
            return_p25=data.get("return_p25"),
            return_p50=data.get("return_p50"),
            return_p75=data.get("return_p75"),
            return_p90=data.get("return_p90"),
            
            # Risk metrics
            cvar_95=data.get("cvar_95"),
            cvar_95_normal=data.get("cvar_95_normal"),
            cvar_95_stress=data.get("cvar_95_stress"),
            cvar_95_panic=data.get("cvar_95_panic"),
            max_drawdown_expected=data.get("max_drawdown_expected"),
            sortino_ratio=data.get("sortino_ratio"),
            risk_reward_ratio=data.get("risk_reward_ratio"),
            
            # Position sizing
            max_position_pct=data.get("max_position_pct"),
            recommended_position_pct=data.get("recommended_position_pct"),
            risk_budget_used_pct=data.get("risk_budget_used_pct"),
            scale_in_tranches=data.get("scale_in_tranches"),
            
            # Signals
            supporting_signals=data.get("supporting_signals", []),
            opposing_signals=data.get("opposing_signals", []),
            signal_agreement=data.get("signal_agreement"),
            
            # Historical context
            n_comparable_setups=data.get("n_comparable_setups"),
            comparable_win_rate=data.get("comparable_win_rate"),
            comparable_median_return=data.get("comparable_median_return"),
            comparable_worst_outcome=data.get("comparable_worst_outcome"),
            
            # Conditions
            upgrade_conditions=data.get("upgrade_conditions", []),
            downgrade_conditions=data.get("downgrade_conditions", []),
            risk_factors=data.get("risk_factors", []),
            
            # Rationale
            rationale=data.get("rationale"),
            explanation=data.get("explanation"),
            
            # Action guidance
            if_holding=data.get("if_holding"),
            if_not_holding=data.get("if_not_holding"),
            recommended_action_explanation=data.get("recommended_action_explanation"),
            
            # Price info
            last_price=data.get("last_price"),
            price_date=data.get("price_date"),
            price_change_1d=data.get("price_change_1d"),
            price_change_5d=data.get("price_change_5d"),
            price_change_20d=data.get("price_change_20d"),
            
            # Data quality
            data_quality=data.get("data_quality"),
            data_points=data.get("data_points"),
            
            # Include raw data for advanced consumers
            raw_data=data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_stock_intelligence: {e}", exc_info=True)
        return StockIntelligenceResponse(
            success=False,
            ticker=symbol,
            error=str(e)
        )


@router.get(
    "/status",
    response_model=IntelligenceStatusResponse,
    summary="Get Intelligence API Status",
    description="""
    Returns the status of the intelligence API including:
    - Last pipeline run time
    - Available markets
    - Number of stocks per market
    - Data freshness
    - Schema version
    """
)
async def get_intelligence_status() -> IntelligenceStatusResponse:
    """Get status of the intelligence API."""
    try:
        markets_available = []
        stocks_by_market = {}
        portfolio_snapshots = []
        last_run_time = None
        
        # Check each market directory
        for market in ["US", "IN"]:
            market_dir = INTELLIGENCE_DIR / market
            if market_dir.exists():
                markets_available.append(market)
                
                # Count stocks (exclude special files starting with _)
                stock_count = sum(
                    1 for f in market_dir.glob("*.json")
                    if not f.name.startswith("_")
                )
                stocks_by_market[market] = stock_count
                
                # Get last run time from portfolio intelligence
                portfolio_file = market_dir / "_portfolio_intelligence.json"
                portfolio_data = _load_json_file(portfolio_file)
                if portfolio_data:
                    gen_at = portfolio_data.get("generated_at")
                    if gen_at and (not last_run_time or gen_at > last_run_time):
                        last_run_time = gen_at
        
        # Check portfolio snapshots
        if PORTFOLIO_DIR.exists():
            for f in PORTFOLIO_DIR.glob("*.json"):
                portfolio_snapshots.append(f.stem)
        
        # Calculate data freshness
        freshness = _get_data_freshness_hours(last_run_time)
        
        return IntelligenceStatusResponse(
            success=True,
            last_run_time=last_run_time,
            markets_available=markets_available,
            stocks_by_market=stocks_by_market,
            portfolio_snapshots_available=portfolio_snapshots,
            intelligence_directory=str(INTELLIGENCE_DIR),
            data_freshness_hours=freshness
        )
        
    except Exception as e:
        logger.error(f"Error in get_intelligence_status: {e}", exc_info=True)
        return IntelligenceStatusResponse(
            success=False,
            intelligence_directory=str(INTELLIGENCE_DIR),
            error=str(e)
        )


@router.get(
    "/stocks/{market}",
    summary="List Available Stocks",
    description="Returns list of all stocks with intelligence data for a market."
)
async def list_stocks(
    market: str
) -> Dict[str, Any]:
    """List all stocks with intelligence data for a market."""
    try:
        market = _validate_market(market)
        market_dir = INTELLIGENCE_DIR / market
        
        if not market_dir.exists():
            return {
                "success": False,
                "market": market,
                "stocks": [],
                "count": 0,
                "error": f"No intelligence data directory for market: {market}"
            }
        
        stocks = []
        for f in market_dir.glob("*.json"):
            if not f.name.startswith("_"):
                stocks.append(f.stem)
        
        stocks.sort()
        
        return {
            "success": True,
            "market": market,
            "stocks": stocks,
            "count": len(stocks),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in list_stocks: {e}", exc_info=True)
        return {
            "success": False,
            "market": market,
            "stocks": [],
            "count": 0,
            "error": str(e)
        }


# =============================================================================
# BATCH ENDPOINTS (for FinVest integration)
# =============================================================================


@router.post(
    "/stocks/batch",
    summary="Get Intelligence for Multiple Stocks",
    description="Returns intelligence data for multiple stocks in a single request."
)
async def get_stocks_batch(
    symbols: List[str],
    market: Optional[str] = Query(None, description="Market code (US or IN)")
) -> Dict[str, Any]:
    """Get intelligence for multiple stocks."""
    try:
        results = {}
        errors = []
        
        for symbol in symbols[:50]:  # Limit to 50 stocks per request
            try:
                response = await get_stock_intelligence(symbol, market)
                if response.success:
                    results[symbol.upper()] = response.dict()
                else:
                    errors.append({"symbol": symbol, "error": response.error})
            except Exception as e:
                errors.append({"symbol": symbol, "error": str(e)})
        
        return {
            "success": True,
            "results": results,
            "count": len(results),
            "errors": errors,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
        
    except Exception as e:
        logger.error(f"Error in get_stocks_batch: {e}", exc_info=True)
        return {
            "success": False,
            "results": {},
            "count": 0,
            "errors": [{"error": str(e)}]
        }


# =============================================================================
# ADDITIONAL DATA DIRECTORIES
# =============================================================================

DATA_DIR = PROJECT_ROOT / "data"
INSIDER_SIGNALS_DIR = PROJECT_ROOT / "InsiderFlow" / "signals_output"
SMART_MONEY_DIR = PROJECT_ROOT / "Smart Money Flow" / "fii_dii_output"


# =============================================================================
# SCREENERS ENDPOINTS (/api/intelligence/screeners/*)
# =============================================================================


class ScreenerStockItem(BaseModel):
    """Single stock in screener results."""
    ticker: str
    market: str
    company_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    debt_to_equity: Optional[float] = None
    dividend_yield: Optional[float] = None
    ret_1d: Optional[float] = None
    ret_1w: Optional[float] = None
    ret_1m: Optional[float] = None
    ret_3m: Optional[float] = None
    ret_1y: Optional[float] = None
    rsi14: Optional[float] = None
    vol_20d: Optional[float] = None


@router.get(
    "/screeners/universes",
    summary="Get Available Screener Universes",
    description="Returns list of pre-computed screener universes (SP500, NIFTY50, etc.)"
)
async def get_screener_universes() -> Dict[str, Any]:
    """Get available screener universes."""
    try:
        universes = []
        portfolios_dir = INSIGHTS_DIR / "portfolios"
        
        if portfolios_dir.exists():
            for f in portfolios_dir.glob("*.json"):
                # Parse filename like US_SP500.json -> {market: US, universe: SP500}
                parts = f.stem.split("_")
                if len(parts) >= 2:
                    universes.append({
                        "market": parts[0],
                        "universe": parts[1],
                        "file": f.name
                    })
        
        return {
            "success": True,
            "universes": universes,
            "count": len(universes),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_screener_universes: {e}", exc_info=True)
        return {"success": False, "universes": [], "error": str(e)}


@router.get(
    "/screeners/universe/{market}/{universe}",
    summary="Get Screener Universe Data",
    description="Returns stocks and their metrics for a specific universe (e.g., US/SP500, IN/NIFTY50)"
)
async def get_screener_universe(
    market: str,
    universe: str
) -> Dict[str, Any]:
    """Get screener data for a specific universe."""
    try:
        market = market.upper()
        universe = universe.upper()
        
        # Try to load the universe file
        universe_file = INSIGHTS_DIR / "portfolios" / f"{market}_{universe}.json"
        data = _load_json_file(universe_file)
        
        if not data:
            return {
                "success": False,
                "market": market,
                "universe": universe,
                "error": f"Universe {market}/{universe} not found",
                "schema_version": SCHEMA_VERSION
            }
        
        return {
            "success": True,
            "market": market,
            "universe": universe,
            "generated_at": data.get("generated_at") or data.get("as_of_date"),
            "stocks": data.get("top_opportunities", []),
            "total_stocks": data.get("n_stocks_analyzed", 0),
            "intents": data.get("intents", {}),
            "regimes": data.get("regimes", {}),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_screener_universe: {e}", exc_info=True)
        return {"success": False, "error": str(e), "schema_version": SCHEMA_VERSION}


@router.get(
    "/screeners/by-intent/{intent}",
    summary="Get Stocks by Intent",
    description="Returns stocks filtered by decision intent (INITIATE, HOLD, AVOID)"
)
async def get_stocks_by_intent(
    intent: str,
    market: Optional[str] = Query(None, description="Filter by market (US or IN)"),
    limit: int = Query(50, ge=1, le=200)
) -> Dict[str, Any]:
    """Get stocks filtered by intent."""
    try:
        intent = intent.upper()
        valid_intents = ["INITIATE", "ADD", "HOLD", "REDUCE", "EXIT", "AVOID"]
        
        if intent not in valid_intents:
            return {
                "success": False,
                "error": f"Invalid intent '{intent}'. Valid: {valid_intents}",
                "schema_version": SCHEMA_VERSION
            }
        
        results = []
        markets_to_search = [market.upper()] if market else ["US", "IN"]
        
        for m in markets_to_search:
            market_dir = INTELLIGENCE_DIR / m
            if not market_dir.exists():
                continue
            
            for f in market_dir.glob("*.json"):
                if f.name.startswith("_"):
                    continue
                
                data = _load_json_file(f)
                if data and data.get("intent") == intent:
                    results.append({
                        "ticker": data.get("ticker"),
                        "market": m,
                        "intent": data.get("intent"),
                        "conviction": data.get("conviction"),
                        "asset_regime": data.get("asset_regime"),
                        "cvar_95": data.get("cvar_95"),
                        "last_price": data.get("last_price"),
                        "rationale": data.get("rationale")
                    })
        
        # Sort by conviction descending
        results.sort(key=lambda x: x.get("conviction") or 0, reverse=True)
        results = results[:limit]
        
        return {
            "success": True,
            "intent": intent,
            "market": market,
            "stocks": results,
            "count": len(results),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_stocks_by_intent: {e}", exc_info=True)
        return {"success": False, "error": str(e), "schema_version": SCHEMA_VERSION}


@router.get(
    "/screeners/by-regime/{regime}",
    summary="Get Stocks by Regime",
    description="Returns stocks filtered by asset regime (accumulation, markup, distribution, markdown, panic, recovery)"
)
async def get_stocks_by_regime(
    regime: str,
    market: Optional[str] = Query(None, description="Filter by market (US or IN)"),
    limit: int = Query(50, ge=1, le=200)
) -> Dict[str, Any]:
    """Get stocks filtered by regime."""
    try:
        regime = regime.lower()
        valid_regimes = ["accumulation", "markup", "distribution", "markdown", "panic", "recovery"]
        
        if regime not in valid_regimes:
            return {
                "success": False,
                "error": f"Invalid regime '{regime}'. Valid: {valid_regimes}",
                "schema_version": SCHEMA_VERSION
            }
        
        results = []
        markets_to_search = [market.upper()] if market else ["US", "IN"]
        
        for m in markets_to_search:
            market_dir = INTELLIGENCE_DIR / m
            if not market_dir.exists():
                continue
            
            for f in market_dir.glob("*.json"):
                if f.name.startswith("_"):
                    continue
                
                data = _load_json_file(f)
                if data and data.get("asset_regime") == regime:
                    results.append({
                        "ticker": data.get("ticker"),
                        "market": m,
                        "intent": data.get("intent"),
                        "conviction": data.get("conviction"),
                        "asset_regime": data.get("asset_regime"),
                        "days_in_regime": data.get("days_in_regime"),
                        "cvar_95": data.get("cvar_95"),
                        "last_price": data.get("last_price")
                    })
        
        # Sort by conviction descending
        results.sort(key=lambda x: x.get("conviction") or 0, reverse=True)
        results = results[:limit]
        
        return {
            "success": True,
            "regime": regime,
            "market": market,
            "stocks": results,
            "count": len(results),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_stocks_by_regime: {e}", exc_info=True)
        return {"success": False, "error": str(e), "schema_version": SCHEMA_VERSION}


# =============================================================================
# OWNERSHIP ENDPOINTS (/api/intelligence/ownership/*)
# =============================================================================


class InsiderSignal(BaseModel):
    """Insider trading signal."""
    symbol: str
    date: str
    num_trades: int = 0
    num_bullish: int = 0
    num_bearish: int = 0
    total_buy_value: float = 0
    total_sell_value: float = 0
    signal_strength: float = 0
    cluster_buy: bool = False
    cluster_sell: bool = False


class HedgeFundHolding(BaseModel):
    """Hedge fund 13F holding."""
    filer_cik: str
    filing_date: str
    issuer: str
    title_of_class: str
    cusip: str
    value: float
    shares: float
    position_change_type: Optional[str] = None
    delta_value: Optional[float] = None


@router.get(
    "/ownership/insider-signals",
    summary="Get Insider Trading Signals",
    description="Returns aggregated insider trading signals from SEC Form 4 filings"
)
async def get_insider_signals(
    days: int = Query(90, ge=1, le=365, description="Days of history"),
    ticker: Optional[str] = Query(None, description="Filter by ticker symbol"),
    signal_type: Optional[str] = Query(None, description="Filter: bullish, bearish, or all")
) -> Dict[str, Any]:
    """Get insider trading signals."""
    try:
        import pandas as pd
        from datetime import datetime, timedelta
        
        signals_file = INSIDER_SIGNALS_DIR / "insider_daily_signals.csv"
        
        if not signals_file.exists():
            return {
                "success": False,
                "error": "Insider signals data not available",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_csv(signals_file)
        df['eventDate'] = pd.to_datetime(df['eventDate'])
        cutoff = datetime.now() - timedelta(days=days)
        df = df[df['eventDate'] >= cutoff]
        
        # Filter by ticker if provided
        if ticker:
            df = df[df['issuerTradingSymbol'].str.upper() == ticker.upper()]
        
        # Filter by signal type
        if signal_type == "bullish":
            df = df[df['net_signal_strength'] > 0]
        elif signal_type == "bearish":
            df = df[df['net_signal_strength'] < 0]
        
        # Sort by date and signal strength
        df = df.sort_values(['eventDate', 'net_signal_strength'], ascending=[False, False])
        
        signals = []
        for _, row in df.head(200).iterrows():
            signals.append({
                "symbol": str(row.get('issuerTradingSymbol', '') or ''),
                "date": row['eventDate'].strftime('%Y-%m-%d'),
                "num_trades": _safe_int(row.get('num_trades')),
                "num_bullish": _safe_int(row.get('num_bullish')),
                "num_bearish": _safe_int(row.get('num_bearish')),
                "total_buy_value": _safe_float(row.get('total_buy_value')),
                "total_sell_value": _safe_float(row.get('total_sell_value')),
                "signal_strength": round(_safe_float(row.get('net_signal_strength')), 2),
                "cluster_buy": bool(row.get('has_cluster_buy', False)),
                "cluster_sell": bool(row.get('has_cluster_sell', False))
            })
        
        return {
            "success": True,
            "signals": signals,
            "count": len(signals),
            "days": days,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_insider_signals: {e}", exc_info=True)
        return {"success": False, "error": str(e), "signals": [], "schema_version": SCHEMA_VERSION}


@router.get(
    "/ownership/insider-trades",
    summary="Get Individual Insider Trades",
    description="Returns individual insider trades from SEC Form 4 filings"
)
async def get_insider_trades(
    days: int = Query(30, ge=1, le=180, description="Days of history"),
    ticker: Optional[str] = Query(None, description="Filter by ticker symbol"),
    limit: int = Query(100, ge=1, le=500)
) -> Dict[str, Any]:
    """Get individual insider trades."""
    try:
        import pandas as pd
        from datetime import datetime, timedelta
        
        trades_file = INSIDER_SIGNALS_DIR / "insider_trades_with_flags.csv"
        
        if not trades_file.exists():
            return {
                "success": False,
                "error": "Insider trades data not available",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_csv(trades_file)
        df['transactionDate'] = pd.to_datetime(df['transactionDate'], errors='coerce')
        cutoff = datetime.now() - timedelta(days=days)
        df = df[df['transactionDate'] >= cutoff]
        
        # Filter by ticker if provided
        if ticker:
            df = df[df['issuerTradingSymbol'].str.upper() == ticker.upper()]
        
        df = df.sort_values('transactionDate', ascending=False)
        
        trades = []
        for _, row in df.head(limit).iterrows():
            trades.append({
                "symbol": str(row.get('issuerTradingSymbol', '') or ''),
                "date": row['transactionDate'].strftime('%Y-%m-%d') if pd.notna(row['transactionDate']) else None,
                "owner": str(row.get('reportingOwnerName', '') or ''),
                "relationship": str(row.get('reportingOwnerRelationship', '') or ''),
                "transaction_code": str(row.get('transactionCode', '') or ''),
                "shares": _safe_float(row.get('transactionShares')),
                "price": _safe_float(row.get('transactionPricePerShare')),
                "value": _safe_float(row.get('transactionValue')),
                "is_bullish": bool(row.get('is_bullish', False)),
                "is_bearish": bool(row.get('is_bearish', False))
            })
        
        return {
            "success": True,
            "trades": trades,
            "count": len(trades),
            "days": days,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_insider_trades: {e}", exc_info=True)
        return {"success": False, "error": str(e), "trades": [], "schema_version": SCHEMA_VERSION}


@router.get(
    "/ownership/13f-holdings",
    summary="Get Hedge Fund 13F Holdings",
    description="Returns 13F institutional holdings data"
)
async def get_13f_holdings(
    fund: Optional[str] = Query(None, description="Fund name: berkshire, bridgewater, renaissance, citadel"),
    ticker: Optional[str] = Query(None, description="Filter by stock ticker"),
    limit: int = Query(100, ge=1, le=500)
) -> Dict[str, Any]:
    """Get 13F hedge fund holdings."""
    try:
        import pandas as pd
        
        holdings_file = INSIDER_SIGNALS_DIR / "13f_holdings_with_flags.csv"
        
        if not holdings_file.exists():
            return {
                "success": False,
                "error": "13F holdings data not available",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_csv(holdings_file)
        
        # Fund CIK mapping
        fund_ciks = {
            "berkshire": "1067983",
            "bridgewater": "1166559",
            "renaissance": "1103804",
            "citadel": "886982"
        }
        
        # Filter by fund if provided
        if fund:
            fund_lower = fund.lower()
            if fund_lower in fund_ciks:
                df = df[df['filer_cik'].astype(str) == fund_ciks[fund_lower]]
            else:
                return {
                    "success": False,
                    "error": f"Unknown fund '{fund}'. Available: {list(fund_ciks.keys())}",
                    "schema_version": SCHEMA_VERSION
                }
        
        # Filter by ticker if provided (match against nameOfIssuer or cusip)
        if ticker:
            ticker_upper = ticker.upper()
            df = df[df['nameOfIssuer'].str.contains(ticker_upper, case=False, na=False)]
        
        # Sort by value descending
        df = df.sort_values('value', ascending=False)
        
        holdings = []
        for _, row in df.head(limit).iterrows():
            delta_val = row.get('deltaPositionValueUSD')
            holdings.append({
                "filer_cik": str(row.get('filer_cik', '') or ''),
                "filing_date": str(row.get('filingDate', '') or ''),
                "issuer": str(row.get('nameOfIssuer', '') or ''),
                "title_of_class": str(row.get('titleOfClass', '') or ''),
                "cusip": str(row.get('cusip', '') or ''),
                "value": _safe_float(row.get('value')),
                "shares": _safe_float(row.get('sshPrnamt')),
                "position_change_type": str(row.get('positionChangeType', '') or '') if pd.notna(row.get('positionChangeType')) else None,
                "delta_value": _safe_float(delta_val) if pd.notna(delta_val) else None
            })
        
        return {
            "success": True,
            "holdings": holdings,
            "count": len(holdings),
            "fund": fund,
            "available_funds": list(fund_ciks.keys()),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_13f_holdings: {e}", exc_info=True)
        return {"success": False, "error": str(e), "holdings": [], "schema_version": SCHEMA_VERSION}


@router.get(
    "/ownership/stock/{symbol}",
    summary="Get Ownership Intelligence for Stock",
    description="Returns comprehensive ownership data for a specific stock"
)
async def get_stock_ownership(
    symbol: str
) -> Dict[str, Any]:
    """Get ownership intelligence for a stock."""
    try:
        import pandas as pd
        from datetime import datetime, timedelta
        
        symbol = symbol.upper()
        result = {
            "success": True,
            "symbol": symbol,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION,
            "insider_signals": [],
            "recent_trades": [],
            "institutional_holders": [],
            "summary": {}
        }
        
        # Load insider signals
        signals_file = INSIDER_SIGNALS_DIR / "insider_daily_signals.csv"
        if signals_file.exists():
            df = pd.read_csv(signals_file)
            df['eventDate'] = pd.to_datetime(df['eventDate'])
            cutoff = datetime.now() - timedelta(days=90)
            ticker_signals = df[(df['issuerTradingSymbol'] == symbol) & (df['eventDate'] >= cutoff)]
            ticker_signals = ticker_signals.sort_values('eventDate', ascending=False)
            
            for _, row in ticker_signals.head(20).iterrows():
                result["insider_signals"].append({
                    "date": row['eventDate'].strftime('%Y-%m-%d'),
                    "num_trades": _safe_int(row.get('num_trades')),
                    "signal_strength": round(_safe_float(row.get('net_signal_strength')), 2),
                    "cluster_buy": bool(row.get('has_cluster_buy', False)),
                    "cluster_sell": bool(row.get('has_cluster_sell', False))
                })
        
        # Load individual trades
        trades_file = INSIDER_SIGNALS_DIR / "insider_trades_with_flags.csv"
        if trades_file.exists():
            df = pd.read_csv(trades_file)
            df['transactionDate'] = pd.to_datetime(df['transactionDate'], errors='coerce')
            cutoff = datetime.now() - timedelta(days=90)
            ticker_trades = df[(df['issuerTradingSymbol'] == symbol) & (df['transactionDate'] >= cutoff)]
            ticker_trades = ticker_trades.sort_values('transactionDate', ascending=False)
            
            total_buy = 0.0
            total_sell = 0.0
            
            for _, row in ticker_trades.head(20).iterrows():
                value = _safe_float(row.get('transactionValue'))
                if row.get('is_bullish'):
                    total_buy += value
                elif row.get('is_bearish'):
                    total_sell += value
                
                result["recent_trades"].append({
                    "date": row['transactionDate'].strftime('%Y-%m-%d') if pd.notna(row['transactionDate']) else None,
                    "owner": str(row.get('reportingOwnerName', '') or ''),
                    "transaction_code": str(row.get('transactionCode', '') or ''),
                    "shares": _safe_float(row.get('transactionShares')),
                    "value": value
                })
            
            result["summary"] = {
                "total_buy_value_90d": round(total_buy, 2),
                "total_sell_value_90d": round(total_sell, 2),
                "net_value_90d": round(total_buy - total_sell, 2),
                "sentiment": "bullish" if total_buy > total_sell * 1.5 else ("bearish" if total_sell > total_buy * 1.5 else "neutral")
            }
        
        return result
    except Exception as e:
        logger.error(f"Error in get_stock_ownership: {e}", exc_info=True)
        return {"success": False, "symbol": symbol, "error": str(e), "schema_version": SCHEMA_VERSION}


# =============================================================================
# MARKET FLOW ENDPOINTS (/api/intelligence/market-flow/*)
# =============================================================================


@router.get(
    "/market-flow/fii-dii",
    summary="Get FII/DII Flow Data",
    description="Returns Foreign Institutional Investor (FII) and Domestic Institutional Investor (DII) flow data for Indian markets"
)
async def get_fii_dii_flows(
    days: int = Query(30, ge=1, le=365, description="Days of history")
) -> Dict[str, Any]:
    """Get FII/DII flow data."""
    try:
        import pandas as pd
        from datetime import datetime, timedelta
        
        flow_file = SMART_MONEY_DIR / "fii_dii_daily_outlook.csv"
        
        if not flow_file.exists():
            return {
                "success": False,
                "error": "FII/DII flow data not available",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_csv(flow_file)
        df['trade_date'] = pd.to_datetime(df['trade_date'])
        cutoff = datetime.now() - timedelta(days=days)
        df = df[df['trade_date'] >= cutoff]
        df = df.sort_values('trade_date', ascending=False)
        
        flows = []
        for _, row in df.iterrows():
            flows.append({
                "date": row['trade_date'].strftime('%Y-%m-%d'),
                "fii_net": _safe_float(row.get('fii_net')),
                "dii_net": _safe_float(row.get('dii_net')),
                "total_net": _safe_float(row.get('total_net')),
                "regime": str(row.get('regime', '') or ''),
                "flow_signal": str(row.get('flow_signal', '') or '')
            })
        
        # Calculate summary
        if len(df) > 0:
            summary = {
                "total_fii_net": round(_safe_float(df['fii_net'].sum()), 2),
                "total_dii_net": round(_safe_float(df['dii_net'].sum()), 2),
                "avg_fii_daily": round(_safe_float(df['fii_net'].mean()), 2),
                "avg_dii_daily": round(_safe_float(df['dii_net'].mean()), 2),
                "latest_regime": str(df.iloc[0].get('regime', '') or ''),
                "latest_signal": str(df.iloc[0].get('flow_signal', '') or '')
            }
        else:
            summary = {}
        
        return {
            "success": True,
            "flows": flows,
            "count": len(flows),
            "days": days,
            "summary": summary,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_fii_dii_flows: {e}", exc_info=True)
        return {"success": False, "error": str(e), "flows": [], "schema_version": SCHEMA_VERSION}


@router.get(
    "/market-flow/signals",
    summary="Get Smart Money Signals",
    description="Returns smart money flow signals with rolling averages"
)
async def get_smart_money_signals() -> Dict[str, Any]:
    """Get smart money flow signals."""
    try:
        import pandas as pd
        
        signals_file = SMART_MONEY_DIR / "fii_dii_nifty_joint_signals.csv"
        
        if not signals_file.exists():
            return {
                "success": False,
                "error": "Smart money signals not available",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_csv(signals_file)
        df['trade_date'] = pd.to_datetime(df['trade_date'])
        df = df.sort_values('trade_date', ascending=False)
        
        signals = []
        for _, row in df.head(60).iterrows():
            signals.append({
                "date": row['trade_date'].strftime('%Y-%m-%d'),
                "fii_net": _safe_float(row.get('fii_net')),
                "dii_net": _safe_float(row.get('dii_net')),
                "total_net": _safe_float(row.get('total_net')),
                "fii_roll5": _safe_float(row.get('fii_roll5')),
                "dii_roll5": _safe_float(row.get('dii_roll5')),
                "fii_roll20": _safe_float(row.get('fii_roll20')),
                "dii_roll20": _safe_float(row.get('dii_roll20')),
                "regime": str(row.get('regime', '') or ''),
                "flow_signal": str(row.get('flow_signal', '') or '')
            })
        
        # Get latest analysis
        latest = df.iloc[0] if len(df) > 0 else {}
        analysis = {
            "current_regime": str(latest.get('regime', 'unknown') or 'unknown'),
            "current_signal": str(latest.get('flow_signal', 'unknown') or 'unknown'),
            "fii_5d_trend": "buying" if _safe_float(latest.get('fii_roll5')) > 0 else "selling",
            "dii_5d_trend": "buying" if _safe_float(latest.get('dii_roll5')) > 0 else "selling",
            "combined_outlook": _interpret_flow_signal(str(latest.get('flow_signal', '') or ''))
        }
        
        return {
            "success": True,
            "signals": signals,
            "count": len(signals),
            "analysis": analysis,
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_smart_money_signals: {e}", exc_info=True)
        return {"success": False, "error": str(e), "signals": [], "schema_version": SCHEMA_VERSION}


def _interpret_flow_signal(signal: str) -> str:
    """Interpret flow signal into plain language."""
    interpretations = {
        "bullish_flow": "Both FII and DII are net buyers - Strong bullish sentiment",
        "bearish_flow": "Both FII and DII are net sellers - Strong bearish sentiment",
        "conflict_flow": "FII and DII have opposing flows - Mixed sentiment",
        "neutral_flow": "Minimal flow activity - Neutral sentiment"
    }
    return interpretations.get(signal, "Unknown signal pattern")


# =============================================================================
# NEWS ENDPOINTS (/api/intelligence/news/*)
# =============================================================================


class NewsItem(BaseModel):
    """News article item."""
    timestamp: Optional[str] = None
    title: str
    summary: Optional[str] = None
    link: Optional[str] = None
    source: Optional[str] = None
    ticker: Optional[str] = None
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None


@router.get(
    "/news/stock/{symbol}",
    summary="Get News for Stock",
    description="Returns recent news articles for a specific stock"
)
async def get_stock_news(
    symbol: str,
    limit: int = Query(20, ge=1, le=100)
) -> Dict[str, Any]:
    """Get news for a specific stock."""
    try:
        import pandas as pd
        
        symbol = symbol.upper()
        
        # Determine market from symbol
        market = "IN" if symbol.endswith(".NS") or symbol.endswith(".BO") else "US"
        
        # Try to load news file
        news_file = DATA_DIR / market / symbol / "news.parquet"
        
        if not news_file.exists():
            # Try without suffix
            base_symbol = symbol.replace(".NS", "").replace(".BO", "")
            news_file = DATA_DIR / market / base_symbol / "news.parquet"
        
        if not news_file.exists():
            return {
                "success": False,
                "symbol": symbol,
                "error": f"No news data available for {symbol}",
                "schema_version": SCHEMA_VERSION
            }
        
        df = pd.read_parquet(news_file)
        df = df.sort_values('timestamp', ascending=False)
        
        news_items = []
        for _, row in df.head(limit).iterrows():
            news_items.append({
                "timestamp": row['timestamp'].isoformat() if pd.notna(row.get('timestamp')) else None,
                "title": row.get('title', ''),
                "summary": row.get('summary', '')[:500] if row.get('summary') else None,
                "link": row.get('link', ''),
                "source": row.get('source', ''),
                "ticker": symbol
            })
        
        return {
            "success": True,
            "symbol": symbol,
            "news": news_items,
            "count": len(news_items),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_stock_news: {e}", exc_info=True)
        return {"success": False, "symbol": symbol, "error": str(e), "news": [], "schema_version": SCHEMA_VERSION}


@router.get(
    "/news/market/{market}",
    summary="Get Market News Summary",
    description="Returns aggregated news summary for a market"
)
async def get_market_news(
    market: str,
    limit: int = Query(50, ge=1, le=200)
) -> Dict[str, Any]:
    """Get aggregated market news."""
    try:
        import pandas as pd
        from datetime import datetime, timedelta
        
        market = market.upper()
        if market not in ["US", "IN"]:
            return {
                "success": False,
                "error": f"Invalid market '{market}'. Supported: US, IN",
                "schema_version": SCHEMA_VERSION
            }
        
        market_dir = DATA_DIR / market
        if not market_dir.exists():
            return {
                "success": False,
                "error": f"No data directory for market: {market}",
                "schema_version": SCHEMA_VERSION
            }
        
        all_news = []
        cutoff = datetime.now() - timedelta(days=7)
        
        # Sample stocks for news aggregation
        ticker_dirs = list(market_dir.iterdir())[:50]  # Limit to first 50 for performance
        
        for ticker_dir in ticker_dirs:
            if not ticker_dir.is_dir():
                continue
            
            news_file = ticker_dir / "news.parquet"
            if not news_file.exists():
                continue
            
            try:
                df = pd.read_parquet(news_file)
                df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
                recent = df[df['timestamp'] >= pd.Timestamp(cutoff, tz='UTC')]
                
                for _, row in recent.head(5).iterrows():
                    all_news.append({
                        "timestamp": row['timestamp'].isoformat() if pd.notna(row.get('timestamp')) else None,
                        "title": row.get('title', ''),
                        "summary": row.get('summary', '')[:200] if row.get('summary') else None,
                        "link": row.get('link', ''),
                        "source": row.get('source', ''),
                        "ticker": ticker_dir.name
                    })
            except Exception:
                continue
        
        # Sort by timestamp and limit
        all_news.sort(key=lambda x: x.get('timestamp') or '', reverse=True)
        all_news = all_news[:limit]
        
        return {
            "success": True,
            "market": market,
            "news": all_news,
            "count": len(all_news),
            "schema_version": SCHEMA_VERSION,
            "api_version": API_VERSION
        }
    except Exception as e:
        logger.error(f"Error in get_market_news: {e}", exc_info=True)
        return {"success": False, "market": market, "error": str(e), "news": [], "schema_version": SCHEMA_VERSION}


# =============================================================================
# COMPREHENSIVE STATUS ENDPOINT
# =============================================================================


@router.get(
    "/status/full",
    summary="Get Full API Status",
    description="Returns comprehensive status of all intelligence API features"
)
async def get_full_status() -> Dict[str, Any]:
    """Get comprehensive API status."""
    try:
        status = {
            "success": True,
            "api_version": API_VERSION,
            "schema_version": SCHEMA_VERSION,
            "timestamp": datetime.now().isoformat(),
            "features": {}
        }
        
        # Check intelligence data
        status["features"]["intelligence"] = {
            "available": INTELLIGENCE_DIR.exists(),
            "markets": []
        }
        if INTELLIGENCE_DIR.exists():
            for market in ["US", "IN"]:
                market_dir = INTELLIGENCE_DIR / market
                if market_dir.exists():
                    stock_count = sum(1 for f in market_dir.glob("*.json") if not f.name.startswith("_"))
                    status["features"]["intelligence"]["markets"].append({
                        "market": market,
                        "stocks": stock_count
                    })
        
        # Check screener universes
        portfolios_dir = INSIGHTS_DIR / "portfolios"
        status["features"]["screeners"] = {
            "available": portfolios_dir.exists(),
            "universes": [f.stem for f in portfolios_dir.glob("*.json")] if portfolios_dir.exists() else []
        }
        
        # Check insider signals
        insider_signals = INSIDER_SIGNALS_DIR / "insider_daily_signals.csv"
        insider_trades = INSIDER_SIGNALS_DIR / "insider_trades_with_flags.csv"
        holdings_13f = INSIDER_SIGNALS_DIR / "13f_holdings_with_flags.csv"
        
        status["features"]["ownership"] = {
            "insider_signals": insider_signals.exists(),
            "insider_trades": insider_trades.exists(),
            "13f_holdings": holdings_13f.exists()
        }
        
        # Check market flow data
        fii_dii = SMART_MONEY_DIR / "fii_dii_daily_outlook.csv"
        smart_signals = SMART_MONEY_DIR / "fii_dii_nifty_joint_signals.csv"
        
        status["features"]["market_flow"] = {
            "fii_dii_flows": fii_dii.exists(),
            "smart_money_signals": smart_signals.exists()
        }
        
        # Check news data (sample)
        status["features"]["news"] = {
            "available": DATA_DIR.exists(),
            "markets_with_news": []
        }
        for market in ["US", "IN"]:
            market_dir = DATA_DIR / market
            if market_dir.exists():
                # Check first few tickers for news
                has_news = any(
                    (d / "news.parquet").exists()
                    for d in list(market_dir.iterdir())[:5]
                    if d.is_dir()
                )
                if has_news:
                    status["features"]["news"]["markets_with_news"].append(market)
        
        return status
    except Exception as e:
        logger.error(f"Error in get_full_status: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "api_version": API_VERSION,
            "schema_version": SCHEMA_VERSION
        }

