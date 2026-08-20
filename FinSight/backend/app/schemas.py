"""Pydantic schemas for API requests and responses."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class TickerBasic(BaseModel):
    """Basic ticker information."""
    ticker: str
    market: str
    exchange_tz: str
    current_price: Optional[float] = None
    pe_trailing: Optional[float] = None
    market_cap: Optional[float] = None


class ScreenerFilter(BaseModel):
    """Screener filter parameters."""
    market: Optional[str] = None
    min_market_cap: Optional[float] = None
    max_market_cap: Optional[float] = None
    min_pe: Optional[float] = None
    max_pe: Optional[float] = None
    min_roe: Optional[float] = None
    min_roa: Optional[float] = None
    max_debt_to_equity: Optional[float] = None
    min_ret_3m: Optional[float] = None
    min_ret_1y: Optional[float] = None
    sort_by: Optional[str] = "market_cap"
    sort_dir: Optional[str] = "desc"  # asc | desc
    limit: Optional[int] = 100
    offset: Optional[int] = 0


class ScreenerRow(BaseModel):
    """
    Screener table row - v2 comprehensive schema.
    
    All yfinance-sourced percentage metrics are normalized:
    - debtToEquity: yfinance returns %, stored as ratio (divide by 100)
    - dividendYield: computed from dividendRate/price for reliability
    - ROE, ROA, margins: yfinance returns decimal, stored as % (multiply by 100)
    """
    # Identity
    ticker: str
    market: str
    exchange_tz: str
    currency: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    sector: Optional[str] = None
    
    # Price & Size
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None
    shares_outstanding_est: Optional[float] = None
    
    # Valuation
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    pb_ratio: Optional[float] = None
    price_to_sales: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    peg_ratio: Optional[float] = None
    earnings_yield: Optional[float] = None
    dividend_yield: Optional[float] = None
    industry_pe: Optional[float] = None
    
    # Profitability & Quality
    roe: Optional[float] = None
    roa: Optional[float] = None
    roce: Optional[float] = None
    gross_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    profit_margin: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    
    # Cash Flow
    free_cash_flow: Optional[float] = None
    operating_cash_flow: Optional[float] = None
    fcf_yield: Optional[float] = None
    
    # Growth
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    earnings_quarterly_growth: Optional[float] = None
    eps_growth_yoy: Optional[float] = None
    
    # Dividend
    payout_ratio: Optional[float] = None
    
    # Ownership & Sentiment
    beta: Optional[float] = None
    insider_holding: Optional[float] = None
    institutional_holding: Optional[float] = None
    short_ratio: Optional[float] = None
    short_pct_float: Optional[float] = None
    
    # Analyst
    analyst_target_mean: Optional[float] = None
    analyst_rating: Optional[float] = None
    num_analysts: Optional[int] = None
    analyst_upside: Optional[float] = None
    
    # Momentum & Returns
    ret_1d: Optional[float] = None
    ret_1w: Optional[float] = None
    ret_1m: Optional[float] = None
    ret_3m: Optional[float] = None
    ret_6m: Optional[float] = None
    ret_1y: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    pct_from_52w_high: Optional[float] = None
    pct_from_52w_low: Optional[float] = None
    
    # Technical Indicators
    sma20: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    rsi14: Optional[float] = None
    price_above_sma50: Optional[bool] = None
    price_above_sma200: Optional[bool] = None
    golden_cross_50_200: Optional[bool] = None
    
    # Volume
    volume_latest: Optional[float] = None
    avg_volume_20d: Optional[float] = None
    avg_volume_60d: Optional[float] = None
    volume_spike_20d: Optional[float] = None
    
    # Volatility
    vol_20d: Optional[float] = None
    vol_60d: Optional[float] = None


class ScreenerResponse(BaseModel):
    """Screener API response."""
    rows: List[ScreenerRow]
    total: int  # Total rows before pagination (legacy, for backward compatibility)
    total_count: int  # Total rows before pagination (preferred)
    limit: int
    offset: int


class PriceDataPoint(BaseModel):
    """Price data point for charts."""
    timestamp: str
    local_timestamp: Optional[str] = None
    open: float
    high: float
    low: float
    close: float
    adj_close: Optional[float] = None
    volume: Optional[float] = None


class TechnicalIndicator(BaseModel):
    """Technical indicator data point."""
    timestamp: str
    sma20: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    rsi14: Optional[float] = None


class DailyDataResponse(BaseModel):
    """Daily price data response."""
    ticker: str
    data: List[PriceDataPoint]
    technicals: Optional[List[TechnicalIndicator]] = None


class MinuteDataResponse(BaseModel):
    """Minute price data response."""
    ticker: str
    data: List[PriceDataPoint]


class NewsItem(BaseModel):
    """
    News item - canonical format from news.json.
    
    Schema matches the normalized format stored in news.json:
    - ticker: Ticker symbol (optional, may be inferred from context)
    - title: News headline (required)
    - publisher: Publisher name (optional)
    - link: URL to full article (optional)
    - type: News type/category (optional)
    - provider_time_utc: ISO8601 timestamp in UTC (optional)
    - timestamp: Alias for provider_time_utc (optional)
    - summary: News summary/body (optional)
    - source: News source (optional)
    """
    ticker: Optional[str] = None
    title: str
    publisher: Optional[str] = None
    link: Optional[str] = None
    type: Optional[str] = None
    provider_time_utc: Optional[str] = None
    timestamp: Optional[str] = None
    summary: Optional[str] = None
    source: Optional[str] = None


class FundamentalsResponse(BaseModel):
    """Fundamentals response."""
    ticker: str
    info: Dict[str, Any]
    fast_info: Optional[Dict[str, Any]] = None
    balance_sheet: Optional[Dict[str, Any]] = None
    income_statement: Optional[Dict[str, Any]] = None
    cashflow_statement: Optional[Dict[str, Any]] = None
    derived: Optional[Dict[str, Any]] = None


class AIInsightsRequest(BaseModel):
    """AI insights request."""
    strategy_context: Optional[str] = None


class AIInsightsResponse(BaseModel):
    """AI insights response - analyst-grade structure."""
    summary: str  # 2-3 sentence high-level overview
    bull_case: str  # Upside narrative
    bear_case: str  # Downside narrative
    key_points: List[str]  # 4-8 important points
    risk_factors: List[str]  # 3-6 key risks
    metrics_to_watch: List[str]  # Concrete metrics to monitor
    time_horizon: str  # e.g. "Short-term", "Medium-term (1-3 years)", "Long-term (3+ years)"
    risk_profile: str  # e.g. "Conservative / Moderate / Aggressive"
    data_warnings: List[str]  # Missing/partial data warnings
    # Legacy fields for backward compatibility
    key_metrics: Optional[List[str]] = None


class RatioMetadata(BaseModel):
    """Metadata for a financial ratio/metric."""
    key: str  # Internal field name (e.g., 'pe_trailing', 'roe', 'market_cap')
    label: str  # Display label (e.g., 'PE Ratio', 'ROE %', 'Market Cap')
    category: str  # Category (e.g., 'Valuation', 'Quality', 'Momentum', 'Size')
    source: str = "screener"  # Data source: 'screener', 'fundamentals', 'derived', 'info'
    field_path: Optional[str] = None  # Path to value (e.g., 'pe_trailing', 'info.trailingPE')
    format: str = "number"  # Format: 'number', 'percent', 'currency', 'multiple'


class RatiosResponse(BaseModel):
    """Response containing all available ratios metadata."""
    ratios: List[RatioMetadata]

