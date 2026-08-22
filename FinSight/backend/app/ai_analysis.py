"""AI analysis using Groq LLM API - Clean implementation with comprehensive error handling."""
import logging
import time
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np
from datetime import datetime
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)

# Safe number formatting helper
def fmt_num(val, spec: str = ".2f", default: str = "N/A") -> str:
    """Safely format a numeric value."""
    if val is None:
        return default
    try:
        if pd.isna(val):
            return default
        return format(val, spec)
    except (TypeError, ValueError, AttributeError):
        return default

# Initialize Groq client - with retry and re-initialization support
groq_client = None

def get_groq_client():
    """Get or initialize Groq client with retry logic."""
    global groq_client
    
    # Check if we have an API key
    api_key = settings.GROQ_API_KEY
    if not api_key or not api_key.strip():
        # Try to reload from environment
        import os
        api_key = os.getenv("GROQ_API_KEY") or api_key
        if api_key:
            settings.GROQ_API_KEY = api_key
    
    if not api_key or not api_key.strip():
        logger.warning("GROQ_API_KEY not configured - AI analysis will be unavailable")
        return None
    
    # If client exists and is valid, return it
    if groq_client is not None:
        return groq_client
    
    # Initialize new client
    try:
        groq_client = Groq(api_key=api_key)
        logger.info("Groq client initialized successfully")
        return groq_client
    except Exception as e:
        logger.error(f"Failed to initialize Groq client: {e}")
        groq_client = None
        return None

# Initialize on module load
get_groq_client()


def safe_get(data: Any, *keys, default=None) -> Any:
    """Safely get nested dict values."""
    if not data or not isinstance(data, dict):
        return default
    current = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current if current is not None else default


def get_metric_safe(screener_row: dict, metric_name: str, default=None) -> Any:
    """Safely get a metric from screener_row with multiple name variations."""
    if not screener_row or not isinstance(screener_row, dict):
        return default
    
    # Try multiple variations
    variations = [
        metric_name,
        metric_name.lower(),
        metric_name.upper(),
        metric_name.capitalize(),
    ]
    
    for var in variations:
        value = screener_row.get(var)
        if value is not None:
            # Check for pandas NaN
            if pd.isna(value) if hasattr(pd, 'isna') else (value != value if isinstance(value, float) else False):
                continue
            return value
    
    return default


def compute_roe_from_fundamentals(fundamentals: dict) -> Optional[float]:
    """Compute ROE from fundamentals if not available in screener_row."""
    if not fundamentals or not isinstance(fundamentals, dict):
        return None
    
    try:
        # Try from derived metrics first
        derived = safe_get(fundamentals, "derived")
        if derived and isinstance(derived, dict):
            roe = derived.get("return_on_equity")
            if roe is not None:
                try:
                    roe_val = float(roe)
                    if not pd.isna(roe_val):
                        return roe_val * 100  # Convert to percentage
                except (TypeError, ValueError):
                    pass
        
        # Try from info
        info = safe_get(fundamentals, "info")
        if info and isinstance(info, dict):
            roe = info.get("returnOnEquity")
            if roe is not None:
                try:
                    roe_val = float(roe)
                    if not pd.isna(roe_val):
                        return roe_val * 100
                except (TypeError, ValueError):
                    pass
        
        # Compute from income statement and balance sheet
        income_stmt = safe_get(fundamentals, "income_statement")
        balance_sheet = safe_get(fundamentals, "balance_sheet")
        
        if income_stmt and balance_sheet and isinstance(income_stmt, dict) and isinstance(balance_sheet, dict):
            # Get latest date
            dates = [k for k in income_stmt.keys() if isinstance(k, str) and len(k) >= 10]
            if dates:
                latest_date = sorted(dates, reverse=True)[0]
                latest_income = income_stmt.get(latest_date, {})
                latest_balance = balance_sheet.get(latest_date, {})
                
                if isinstance(latest_income, dict) and isinstance(latest_balance, dict):
                    net_income = latest_income.get("Net Income") or latest_income.get("netIncome")
                    equity = latest_balance.get("Stockholders Equity") or latest_balance.get("stockholdersEquity") or latest_balance.get("totalStockholderEquity")
                    
                    if net_income is not None and equity is not None and equity != 0:
                        try:
                            roe = (float(net_income) / float(equity)) * 100
                            if not pd.isna(roe):
                                return roe
                        except (TypeError, ValueError, ZeroDivisionError):
                            pass
    except Exception as e:
        logger.debug(f"Error computing ROE from fundamentals: {e}")
    
    return None


def generate_analyst_insights(
    ticker: str,
    screener_row: dict,
    daily_df: pd.DataFrame,
    tech_df: Optional[pd.DataFrame],
    fundamentals: dict,
    news: List[dict],
    peers: Optional[List[dict]] = None,
    strategy_context: Optional[str] = None,
) -> dict:
    """
    Generate analyst-grade AI insights for a ticker using Groq LLM.
    
    This function provides comprehensive buy-side analyst quality analysis.
    All dict accesses are safe and handle missing data gracefully.
    """
    # Get Groq client (with retry)
    client = get_groq_client()
    if not client:
        logger.warning(f"Groq client not available for {ticker}. AI insights disabled.")
        return {
            "summary": "AI analysis not configured (GROQ_API_KEY missing). Please check API configuration.",
            "bull_case": "",
            "bear_case": "",
            "key_points": [],
            "risk_factors": [],
            "metrics_to_watch": [],
            "time_horizon": "N/A",
            "risk_profile": "N/A",
            "data_warnings": ["AI analysis unavailable - GROQ_API_KEY not configured"],
            "key_metrics": [],
        }
    
    try:
        # Ensure screener_row is a dict
        if not isinstance(screener_row, dict):
            logger.warning(f"screener_row is not a dict for {ticker}, converting...")
            try:
                if hasattr(screener_row, 'dict'):
                    screener_row = screener_row.dict()
                elif hasattr(screener_row, '__dict__'):
                    screener_row = screener_row.__dict__
                else:
                    screener_row = dict(screener_row) if screener_row else {}
            except Exception as e:
                logger.error(f"Failed to convert screener_row to dict for {ticker}: {e}")
                screener_row = {}
        
        # Clean screener_row - convert pandas types to Python types
        screener_row_clean = {}
        for key, value in screener_row.items():
            if pd.isna(value) if hasattr(pd, 'isna') else (value != value if isinstance(value, float) else False):
                screener_row_clean[key] = None
            elif hasattr(value, 'item'):  # numpy scalar
                try:
                    screener_row_clean[key] = value.item()
                except:
                    screener_row_clean[key] = value
            else:
                screener_row_clean[key] = value
        screener_row = screener_row_clean
        
        # Ensure fundamentals is a dict
        if not fundamentals or not isinstance(fundamentals, dict):
            logger.warning(f"Fundamentals is not a dict for {ticker}: {type(fundamentals)}")
            fundamentals = {}
        
        # Get info safely
        info = safe_get(fundamentals, "info")
        if not info or not isinstance(info, dict):
            logger.warning(f"Info is not a dict for {ticker}: {type(info)}")
            info = {}
        
        # Extract basic info - ALL using safe access
        company_name = get_metric_safe(screener_row, "company_name") or info.get("longName") or info.get("shortName") or ticker
        sector = get_metric_safe(screener_row, "sector") or info.get("sector") or info.get("sectorDisp")
        industry = get_metric_safe(screener_row, "industry") or info.get("industry") or info.get("industryDisp")
        market = get_metric_safe(screener_row, "market", "UNKNOWN")
        currency = get_metric_safe(screener_row, "currency", "")
        
        # Get ROE - try multiple sources
        roe = get_metric_safe(screener_row, "roe")
        if roe is None:
            roe = compute_roe_from_fundamentals(fundamentals)
            # Update screener_row if we computed it - SAFELY
            if roe is not None:
                try:
                    if isinstance(screener_row, dict):
                        screener_row['roe'] = roe
                    else:
                        # Create new dict if needed
                        screener_row = dict(screener_row) if screener_row else {}
                        screener_row['roe'] = roe
                except (TypeError, KeyError) as e:
                    logger.debug(f"Could not update screener_row['roe'] for {ticker}: {e}")
                    # Create new dict
                    try:
                        screener_row = dict(screener_row) if screener_row else {}
                        screener_row['roe'] = roe
                    except:
                        pass  # If we still can't update, that's fine - we'll use the computed value directly
        
        # Get all other metrics safely
        current_price = get_metric_safe(screener_row, "current_price")
        market_cap = get_metric_safe(screener_row, "market_cap")
        pe_trailing = get_metric_safe(screener_row, "pe_trailing") or get_metric_safe(screener_row, "pe")
        pe_forward = get_metric_safe(screener_row, "pe_forward")
        pb_ratio = get_metric_safe(screener_row, "pb_ratio") or get_metric_safe(screener_row, "pb")
        price_to_sales = get_metric_safe(screener_row, "price_to_sales")
        earnings_yield = get_metric_safe(screener_row, "earnings_yield")
        roa = get_metric_safe(screener_row, "roa")
        profit_margin = get_metric_safe(screener_row, "profit_margin")
        debt_to_equity = get_metric_safe(screener_row, "debt_to_equity")
        roce = get_metric_safe(screener_row, "roce")
        dividend_yield = get_metric_safe(screener_row, "dividend_yield")
        ret_1d = get_metric_safe(screener_row, "ret_1d")
        ret_1w = get_metric_safe(screener_row, "ret_1w")
        ret_1m = get_metric_safe(screener_row, "ret_1m")
        ret_3m = get_metric_safe(screener_row, "ret_3m")
        ret_6m = get_metric_safe(screener_row, "ret_6m")
        ret_1y = get_metric_safe(screener_row, "ret_1y")
        high_52w = get_metric_safe(screener_row, "high_52w")
        low_52w = get_metric_safe(screener_row, "low_52w")
        pct_from_52w_high = get_metric_safe(screener_row, "pct_from_52w_high")
        pct_from_52w_low = get_metric_safe(screener_row, "pct_from_52w_low")
        rsi14 = get_metric_safe(screener_row, "rsi14")
        vol_20d = get_metric_safe(screener_row, "vol_20d")
        vol_60d = get_metric_safe(screener_row, "vol_60d")
        sma20 = get_metric_safe(screener_row, "sma20")
        sma50 = get_metric_safe(screener_row, "sma50")
        sma200 = get_metric_safe(screener_row, "sma200")
        eps_growth_yoy = get_metric_safe(screener_row, "eps_growth_yoy")
        shares_outstanding = get_metric_safe(screener_row, "shares_outstanding_est")
        
        # Build comprehensive data block for LLM - ALL values use fmt_num for safety
        data_block = f"""
=== COMPANY DATA FOR {ticker.upper()} ===

IDENTITY:
- Company Name: {company_name}
- Ticker: {ticker}
- Sector: {sector or "N/A"}
- Industry: {industry or "N/A"}
- Market: {market}
- Currency: {currency or "USD"}
- Shares Outstanding: {fmt_num(shares_outstanding, ',.0f')}

VALUATION METRICS:
- Current Price: {fmt_num(current_price, ',.2f')} {currency or ''}
- Market Cap: {fmt_num(market_cap, ',.0f')}
- P/E (Trailing): {fmt_num(pe_trailing, '.2f')}
- P/E (Forward): {fmt_num(pe_forward, '.2f')}
- P/B Ratio: {fmt_num(pb_ratio, '.2f')}
- Price/Sales: {fmt_num(price_to_sales, '.2f')}
- Earnings Yield: {fmt_num(earnings_yield, '.2f')}%

PROFITABILITY & QUALITY:
- ROE: {fmt_num(roe, '.2f')}%
- ROA: {fmt_num(roa, '.2f')}%
- ROCE: {fmt_num(roce, '.2f')}%
- Profit Margin: {fmt_num(profit_margin, '.2f')}%
- Debt/Equity: {fmt_num(debt_to_equity, '.2f')}
- Dividend Yield: {fmt_num(dividend_yield, '.2f')}%

RETURNS & MOMENTUM:
- 1D Return: {fmt_num(ret_1d, '.2f')}%
- 1W Return: {fmt_num(ret_1w, '.2f')}%
- 1M Return: {fmt_num(ret_1m, '.2f')}%
- 3M Return: {fmt_num(ret_3m, '.2f')}%
- 6M Return: {fmt_num(ret_6m, '.2f')}%
- 1Y Return: {fmt_num(ret_1y, '.2f')}%
- 52W High: {fmt_num(high_52w, ',.2f')}
- 52W Low: {fmt_num(low_52w, ',.2f')}
- % from 52W High: {fmt_num(pct_from_52w_high, '.2f')}%
- % from 52W Low: {fmt_num(pct_from_52w_low, '.2f')}%

TECHNICAL INDICATORS:
- RSI(14): {fmt_num(rsi14, '.2f')}
- Volatility (20d): {fmt_num(vol_20d, '.2f')}%
- Volatility (60d): {fmt_num(vol_60d, '.2f')}%
- SMA(20): {fmt_num(sma20, ',.2f')}
- SMA(50): {fmt_num(sma50, ',.2f')}
- SMA(200): {fmt_num(sma200, ',.2f')}

GROWTH:
- EPS Growth (YoY): {fmt_num(eps_growth_yoy, '.2f')}%
"""
        
        # Add comprehensive fundamentals data if available
        if fundamentals:
            income_stmt = safe_get(fundamentals, "income_statement")
            balance_sheet = safe_get(fundamentals, "balance_sheet")
            cashflow = safe_get(fundamentals, "cashflow_statement")
            info = safe_get(fundamentals, "info")
            
            if income_stmt and isinstance(income_stmt, dict):
                dates = [k for k in income_stmt.keys() if isinstance(k, str) and len(k) >= 10]
                if dates:
                    dates_sorted = sorted(dates, reverse=True)
                    latest_date = dates_sorted[0]
                    latest_income = income_stmt.get(latest_date, {})
                    if isinstance(latest_income, dict):
                        data_block += f"\nLATEST INCOME STATEMENT ({latest_date[:10]}):\n"
                        data_block += f"- Total Revenue: {fmt_num(latest_income.get('Total Revenue') or latest_income.get('totalRevenue'), ',.0f')}\n"
                        data_block += f"- Operating Income: {fmt_num(latest_income.get('Operating Income') or latest_income.get('operatingIncome'), ',.0f')}\n"
                        data_block += f"- Net Income: {fmt_num(latest_income.get('Net Income') or latest_income.get('netIncome'), ',.0f')}\n"
                        data_block += f"- EPS: {fmt_num(latest_income.get('Earnings Per Share') or latest_income.get('earningsPerShare'), '.2f')}\n"
                    
                    # Add historical trends (last 5 years if available)
                    if len(dates_sorted) >= 2:
                        data_block += f"\nHISTORICAL REVENUE TREND (Last {min(5, len(dates_sorted))} periods):\n"
                        for i, date in enumerate(dates_sorted[:5]):
                            period_income = income_stmt.get(date, {})
                            if isinstance(period_income, dict):
                                revenue = period_income.get('Total Revenue') or period_income.get('totalRevenue')
                                net_income = period_income.get('Net Income') or period_income.get('netIncome')
                                data_block += f"- {date[:10]}: Revenue={fmt_num(revenue, ',.0f')}, Net Income={fmt_num(net_income, ',.0f')}\n"
                        
                        # Calculate growth rates
                        if len(dates_sorted) >= 2:
                            prev_date = dates_sorted[1]
                            prev_income = income_stmt.get(prev_date, {})
                            if isinstance(prev_income, dict):
                                prev_revenue = prev_income.get('Total Revenue') or prev_income.get('totalRevenue')
                                latest_revenue = latest_income.get('Total Revenue') or latest_income.get('totalRevenue')
                                if prev_revenue and latest_revenue and prev_revenue != 0:
                                    revenue_growth = ((latest_revenue - prev_revenue) / prev_revenue) * 100
                                    data_block += f"- Revenue Growth (YoY): {fmt_num(revenue_growth, '.2f')}%\n"
                                
                                prev_net = prev_income.get('Net Income') or prev_income.get('netIncome')
                                latest_net = latest_income.get('Net Income') or latest_income.get('netIncome')
                                if prev_net and latest_net and prev_net != 0:
                                    net_growth = ((latest_net - prev_net) / abs(prev_net)) * 100
                                    data_block += f"- Net Income Growth (YoY): {fmt_num(net_growth, '.2f')}%\n"
            
            if balance_sheet and isinstance(balance_sheet, dict):
                dates = [k for k in balance_sheet.keys() if isinstance(k, str) and len(k) >= 10]
                if dates:
                    latest_date = sorted(dates, reverse=True)[0]
                    latest_balance = balance_sheet.get(latest_date, {})
                    if isinstance(latest_balance, dict):
                        data_block += f"\nLATEST BALANCE SHEET ({latest_date[:10]}):\n"
                        data_block += f"- Total Assets: {fmt_num(latest_balance.get('Total Assets') or latest_balance.get('totalAssets'), ',.0f')}\n"
                        data_block += f"- Total Debt: {fmt_num(latest_balance.get('Total Debt') or latest_balance.get('totalDebt'), ',.0f')}\n"
                        data_block += f"- Total Equity: {fmt_num(latest_balance.get('Stockholders Equity') or latest_balance.get('stockholdersEquity') or latest_balance.get('totalStockholderEquity'), ',.0f')}\n"
                        data_block += f"- Cash & Equivalents: {fmt_num(latest_balance.get('Cash And Cash Equivalents') or latest_balance.get('cashAndCashEquivalents'), ',.0f')}\n"
            
            if cashflow and isinstance(cashflow, dict):
                dates = [k for k in cashflow.keys() if isinstance(k, str) and len(k) >= 10]
                if dates:
                    latest_date = sorted(dates, reverse=True)[0]
                    latest_cf = cashflow.get(latest_date, {})
                    if isinstance(latest_cf, dict):
                        data_block += f"\nLATEST CASH FLOW ({latest_date[:10]}):\n"
                        data_block += f"- Operating Cash Flow: {fmt_num(latest_cf.get('Operating Cash Flow') or latest_cf.get('operatingCashFlow'), ',.0f')}\n"
                        data_block += f"- Free Cash Flow: {fmt_num(latest_cf.get('Free Cash Flow') or latest_cf.get('freeCashFlow'), ',.0f')}\n"
            
            if info and isinstance(info, dict):
                data_block += f"\nADDITIONAL INFO:\n"
                data_block += f"- Business Summary: {info.get('longBusinessSummary', 'N/A')[:500]}\n"
                data_block += f"- Employees: {fmt_num(info.get('fullTimeEmployees'), ',.0f')}\n"
                data_block += f"- Website: {info.get('website', 'N/A')}\n"
        
        # Add historical price trends from daily data
        if not daily_df.empty:
            price_col = "Adj Close" if "Adj Close" in daily_df.columns else "Close"
            prices = daily_df[price_col]
            
            # Calculate historical returns
            if len(prices) >= 252:  # 1 year
                price_1y_ago = prices.iloc[-252] if len(prices) >= 252 else None
                price_2y_ago = prices.iloc[-504] if len(prices) >= 504 else None
                price_3y_ago = prices.iloc[-756] if len(prices) >= 756 else None
                price_5y_ago = prices.iloc[-1260] if len(prices) >= 1260 else None
                current_price_val = prices.iloc[-1]
                
                data_block += f"\nHISTORICAL PRICE TRENDS:\n"
                data_block += f"- Current Price: {fmt_num(current_price_val, ',.2f')}\n"
                if price_1y_ago:
                    ret_1y_calc = ((current_price_val / price_1y_ago) - 1) * 100
                    data_block += f"- 1Y Return: {fmt_num(ret_1y_calc, '.2f')}% (Price 1Y ago: {fmt_num(price_1y_ago, ',.2f')})\n"
                if price_2y_ago:
                    ret_2y_calc = ((current_price_val / price_2y_ago) - 1) * 100
                    data_block += f"- 2Y Return: {fmt_num(ret_2y_calc, '.2f')}% (Price 2Y ago: {fmt_num(price_2y_ago, ',.2f')})\n"
                if price_3y_ago:
                    ret_3y_calc = ((current_price_val / price_3y_ago) - 1) * 100
                    data_block += f"- 3Y Return: {fmt_num(ret_3y_calc, '.2f')}% (Price 3Y ago: {fmt_num(price_3y_ago, ',.2f')})\n"
                if price_5y_ago:
                    ret_5y_calc = ((current_price_val / price_5y_ago) - 1) * 100
                    data_block += f"- 5Y Return: {fmt_num(ret_5y_calc, '.2f')}% (Price 5Y ago: {fmt_num(price_5y_ago, ',.2f')})\n"
                
                # Calculate volatility trends
                if len(prices) >= 252:
                    returns = prices.pct_change().dropna()
                    vol_1y = returns.tail(252).std() * np.sqrt(252) * 100 if len(returns) >= 252 else None
                    vol_2y = returns.tail(504).std() * np.sqrt(252) * 100 if len(returns) >= 504 else None
                    if vol_1y:
                        data_block += f"- 1Y Volatility: {fmt_num(vol_1y, '.2f')}%\n"
                    if vol_2y:
                        data_block += f"- 2Y Volatility: {fmt_num(vol_2y, '.2f')}%\n"
        
        # Add news summary
        if news:
            data_block += "\nRECENT NEWS:\n"
            for item in news[:5]:
                title = item.get("title", "N/A") if isinstance(item, dict) else "N/A"
                pub = item.get("publisher", "N/A") if isinstance(item, dict) else "N/A"
                data_block += f"- {title} ({pub})\n"
        
        # Add peer comparison if available
        if peers:
            data_block += "\nPEER COMPARISON:\n"
            for peer in peers[:5]:
                if isinstance(peer, dict):
                    peer_ticker = peer.get("ticker", "N/A")
                    peer_pe = peer.get("pe_trailing") or peer.get("pe")
                    peer_roe = peer.get("roe")
                    peer_margin = peer.get("profit_margin")
                    data_block += f"- {peer_ticker}: PE={fmt_num(peer_pe, '.2f')}, ROE={fmt_num(peer_roe, '.2f')}%, Margin={fmt_num(peer_margin, '.2f')}%\n"
        
        # Build prompt
        prompt = f"""You are a buy-side equity analyst providing professional stock analysis. Analyze the following data for {ticker} ({company_name}).

{data_block}

ANALYSIS REQUIREMENTS:

Provide a comprehensive, in-depth analysis covering ALL of the following in detail:

1. BUSINESS & CONTEXT: 
   - What does the company do? Describe its business model, main products/services, and revenue streams
   - Market position: Is it a leader, challenger, or niche player? Market share trends?
   - Competitive advantages or moats
   - Recent strategic initiatives or pivots

2. QUALITY: 
   - Profitability trends: Analyze ROE, ROA, profit margins over time
   - Earnings quality: Are earnings sustainable? Cash flow vs earnings?
   - Operating efficiency: Operating margins, asset turnover
   - Management quality indicators

3. GROWTH: 
   - Revenue growth: Historical trends, growth drivers, sustainability
   - Earnings growth: EPS growth, margin expansion/contraction
   - Future growth prospects: Pipeline, market expansion, new products
   - Growth quality: Organic vs acquired growth

4. BALANCE SHEET: 
   - Leverage: Debt-to-equity, interest coverage, debt maturity profile
   - Cash position: Free cash flow generation, cash reserves
   - Working capital management
   - Capital allocation: Dividends, buybacks, capex, M&A

5. VALUATION: 
   - Is it cheap/fair/expensive? Compare PE, PB, EV/EBITDA to historical ranges
   - Relative to peers: How does valuation compare to similar companies?
   - Relative to growth: PEG ratio analysis
   - DCF or sum-of-parts if applicable
   - Valuation catalysts or headwinds

6. MOMENTUM: 
   - Technical picture: Price trends, support/resistance, chart patterns
   - Returns: Recent performance vs market, vs sector
   - Volume trends: Institutional interest, retail sentiment
   - Momentum indicators: RSI, moving averages

7. RISK: 
   - Business risks: Competition, disruption, regulatory
   - Financial risks: Debt, liquidity, currency exposure
   - Sector/industry risks: Cyclicality, secular trends
   - Company-specific risks: Management, governance, execution

8. NEWS: 
   - Impact of recent news: Earnings, guidance, strategic announcements
   - Market sentiment: Analyst upgrades/downgrades, insider activity
   - Catalysts: Upcoming events that could move the stock

9. PEERS: 
   - How does it compare to peers? Better/worse on key metrics?
   - Relative valuation: Premium or discount to peers justified?
   - Competitive positioning: Strengths and weaknesses vs peers

10. FINAL VERDICT: 
    - Bull case: 3-5 key reasons to be positive, with specific catalysts
    - Bear case: 3-5 key concerns, with specific risks
    - Investment thesis: Clear recommendation with reasoning
    - Key metrics to watch: What to monitor going forward
    - Price targets or scenarios if data supports

Return your analysis in this EXACT format:

SUMMARY: [4-6 sentence comprehensive overview covering business, valuation, and investment thesis]

BULL_CASE: [Detailed 4-6 sentence explanation of what needs to go right, with specific catalysts and scenarios]

BEAR_CASE: [Detailed 4-6 sentence explanation of what can go wrong, with specific risks and scenarios]

KEY_POINTS:
- [Detailed point 1 - 2-3 sentences]
- [Detailed point 2 - 2-3 sentences]
- [Detailed point 3 - 2-3 sentences]
- [Detailed point 4 - 2-3 sentences]
- [Detailed point 5 - 2-3 sentences]

RISK_FACTORS:
- [Detailed risk 1 with explanation]
- [Detailed risk 2 with explanation]
- [Detailed risk 3 with explanation]
- [Detailed risk 4 with explanation]

METRICS_TO_WATCH:
- [Metric 1 with why it matters]
- [Metric 2 with why it matters]
- [Metric 3 with why it matters]
- [Metric 4 with why it matters]

TIME_HORIZON: [Short-term / Medium-term / Long-term] with brief reasoning

RISK_PROFILE: [Conservative / Moderate / Aggressive] with brief reasoning

DATA_WARNINGS: [List any missing data, or "None"]

IMPORTANT: 
- Provide detailed, in-depth analysis. Be thorough and comprehensive.
- Use specific numbers from the data provided.
- Only use data provided. If data is missing, say "Data not available".
- Be direct, professional, and analytical.
- Write as if you're preparing a professional equity research report."""
        
        # Call Groq API with retry logic
        # Bounded down from max_retries=3 / timeout=90.0 (worst case ~273s of
        # this single request blocking the entire server - see the
        # threadpool offload in main.py's get_ai_insights for why that
        # alone isn't enough. 90s was already generous for a real Groq
        # completion; this keeps that headroom while capping the disaster
        # case to something the health check can survive even if this
        # request weren't offloaded at all.
        max_retries = 2
        retry_delay = 1  # seconds
        last_error = None
        
        for attempt in range(max_retries):
            try:
                # Ensure client is available (re-initialize if needed)
                client = get_groq_client()
                if not client:
                    raise Exception("Groq client not available")
                
                response = client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a professional buy-side equity analyst. Provide thorough, data-driven analysis. Never invent numbers. Be direct and professional.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=4000,
                    timeout=25.0,  # was 90.0 - see max_retries comment above
                )
                # Phase 4 hardening (IMPLEMENTATION_NOTES.md): track usage
                # so a bug here can't silently burn through Groq's limits.
                try:
                    from app.groq_usage_tracker import track_groq_call
                    track_groq_call(caller="ai_analysis", response=response)
                except Exception:
                    pass  # tracking must never break the actual AI call
                # Success - break out of retry loop
                break
            except Exception as api_error:
                last_error = api_error
                logger.warning(f"Groq API call attempt {attempt + 1}/{max_retries} failed for {ticker}: {api_error}")
                
                # If it's the last attempt, return error
                if attempt == max_retries - 1:
                    # Try to re-initialize client before final failure
                    global groq_client
                    groq_client = None
                    client = get_groq_client()
                    
                    if not client:
                        return {
                            "summary": f"AI analysis failed: Unable to connect to AI service. Please check API configuration and try again.",
                            "bull_case": "",
                            "bear_case": "",
                            "key_points": [],
                            "risk_factors": [],
                            "metrics_to_watch": [],
                            "time_horizon": "N/A",
                            "risk_profile": "N/A",
                            "data_warnings": [f"API connection error after {max_retries} attempts"],
                            "key_metrics": [],
                        }
                    
                    # Last attempt with fresh client
                    try:
                        response = client.chat.completions.create(
                            model=settings.GROQ_MODEL,
                            messages=[
                                {
                                    "role": "system",
                                    "content": "You are a professional buy-side equity analyst. Provide thorough, data-driven analysis. Never invent numbers. Be direct and professional.",
                                },
                                {"role": "user", "content": prompt},
                            ],
                            temperature=0.3,
                            max_tokens=4000,
                            timeout=90.0,
                        )
                        break
                    except Exception as final_error:
                        logger.error(f"Groq API call failed for {ticker} after {max_retries} attempts: {final_error}")
                        return {
                            "summary": f"AI analysis failed: {str(final_error)}. Please try again in a moment.",
                            "bull_case": "",
                            "bear_case": "",
                            "key_points": [],
                            "risk_factors": [],
                            "metrics_to_watch": [],
                            "time_horizon": "N/A",
                            "risk_profile": "N/A",
                            "data_warnings": [f"API error after retries: {str(final_error)}"],
                            "key_metrics": [],
                        }
                else:
                    # Wait before retry
                    time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
        
        # Get response content - ensure we have a response
        if 'response' not in locals() or response is None:
            raise Exception("No response received from API after retries")
        
        content = response.choices[0].message.content
        if not content:
            raise Exception("Empty response from API")
        
        # Parse response
        result = {
            "summary": "",
            "bull_case": "",
            "bear_case": "",
            "key_points": [],
            "risk_factors": [],
            "metrics_to_watch": [],
            "time_horizon": "N/A",
            "risk_profile": "N/A",
            "data_warnings": [],
            "key_metrics": [],
        }
        
        # Enhanced text parsing with better error handling
        lines = content.split("\n")
        current_section = None
        section_keywords = ["SUMMARY", "BULL", "BEAR", "KEY", "RISK", "METRICS", "TIME", "DATA"]
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            line_upper = line.upper()
            
            # Check for section headers (more flexible matching)
            if "SUMMARY" in line_upper and (":" in line or line_upper.startswith("SUMMARY")):
                current_section = "summary"
                if ":" in line:
                    result["summary"] = line.split(":", 1)[1].strip()
                continue
            elif ("BULL_CASE" in line_upper or "BULL CASE" in line_upper) and (":" in line or line_upper.startswith("BULL")):
                current_section = "bull_case"
                if ":" in line:
                    result["bull_case"] = line.split(":", 1)[1].strip()
                continue
            elif ("BEAR_CASE" in line_upper or "BEAR CASE" in line_upper) and (":" in line or line_upper.startswith("BEAR")):
                current_section = "bear_case"
                if ":" in line:
                    result["bear_case"] = line.split(":", 1)[1].strip()
                continue
            elif ("KEY_POINTS" in line_upper or "KEY POINTS" in line_upper):
                current_section = "key_points"
                continue
            elif ("RISK_FACTORS" in line_upper or "RISK FACTORS" in line_upper):
                current_section = "risk_factors"
                continue
            elif ("METRICS_TO_WATCH" in line_upper or "METRICS TO WATCH" in line_upper):
                current_section = "metrics_to_watch"
                continue
            elif "TIME_HORIZON" in line_upper:
                current_section = "time_horizon"
                if ":" in line:
                    result["time_horizon"] = line.split(":", 1)[1].strip()
                continue
            elif "RISK_PROFILE" in line_upper:
                current_section = "risk_profile"
                if ":" in line:
                    result["risk_profile"] = line.split(":", 1)[1].strip()
                continue
            elif "DATA_WARNINGS" in line_upper:
                current_section = "data_warnings"
                continue
            
            # Process content based on current section
            if current_section == "summary":
                # Check if this line starts a new section
                if any(keyword in line_upper for keyword in section_keywords if keyword != "SUMMARY"):
                    continue
                if result["summary"]:
                    result["summary"] += " " + line
                else:
                    result["summary"] = line
            elif current_section == "bull_case":
                if any(keyword in line_upper for keyword in section_keywords if keyword not in ["BULL", "SUMMARY"]):
                    continue
                if result["bull_case"]:
                    result["bull_case"] += " " + line
                else:
                    result["bull_case"] = line
            elif current_section == "bear_case":
                if any(keyword in line_upper for keyword in section_keywords if keyword not in ["BEAR", "SUMMARY", "BULL"]):
                    continue
                if result["bear_case"]:
                    result["bear_case"] += " " + line
                else:
                    result["bear_case"] = line
            elif current_section == "key_points":
                # Handle bullet points with various formats
                if line.startswith("-") or line.startswith("•") or line.startswith("*") or (line and line[0].isdigit() and "." in line[:3]):
                    point = line.lstrip("- •*0123456789. ").strip()
                    if point and len(point) > 5:  # Filter out very short points
                        result["key_points"].append(point)
            elif current_section == "risk_factors":
                if line.startswith("-") or line.startswith("•") or line.startswith("*") or (line and line[0].isdigit() and "." in line[:3]):
                    risk = line.lstrip("- •*0123456789. ").strip()
                    if risk and len(risk) > 5:
                        result["risk_factors"].append(risk)
            elif current_section == "metrics_to_watch":
                if line.startswith("-") or line.startswith("•") or line.startswith("*") or (line and line[0].isdigit() and "." in line[:3]):
                    metric = line.lstrip("- •*0123456789. ").strip()
                    if metric and len(metric) > 5:
                        result["metrics_to_watch"].append(metric)
            elif current_section == "data_warnings":
                if line.startswith("-") or line.startswith("•") or line.startswith("*"):
                    warning = line.lstrip("- •*").strip()
                    if warning:
                        result["data_warnings"].append(warning)
        
        # Clean up extracted text (remove markdown formatting)
        for key in ["summary", "bull_case", "bear_case"]:
            if result[key]:
                # Remove markdown bold/italic
                result[key] = result[key].replace("**", "").replace("*", "").replace("__", "").replace("_", "")
                result[key] = result[key].strip()
        
        # If parsing failed significantly, use raw content but try to extract what we can
        parsing_success = bool(result["summary"] or result["bull_case"] or result["bear_case"] or result["key_points"])
        if not parsing_success:
            # Try to extract summary from first paragraph
            paragraphs = content.split("\n\n")
            if paragraphs:
                first_para = paragraphs[0].strip()
                if len(first_para) > 50:
                    result["summary"] = first_para[:800]  # Limit length
                    result["data_warnings"].append("Response parsing incomplete - extracted summary from raw content")
                else:
                    result["summary"] = content[:800] if len(content) > 800 else content
                    result["data_warnings"].append("Response parsing incomplete - using raw content")
        elif not result["summary"]:
            # If we have other sections but no summary, create one from first paragraph
            paragraphs = content.split("\n\n")
            if paragraphs:
                first_para = paragraphs[0].strip()
                if len(first_para) > 50 and not any(keyword in first_para.upper() for keyword in ["SUMMARY", "BULL", "BEAR"]):
                    result["summary"] = first_para[:800]
        
        return result
        
    except KeyError as ke:
        logger.error(f"KeyError in AI analysis for {ticker}: {ke}", exc_info=True)
        return {
            "summary": f"AI analysis failed: Missing data for key '{ke}'. Please ensure all required metrics are available.",
            "bull_case": "",
            "bear_case": "",
            "key_points": [],
            "risk_factors": [],
            "metrics_to_watch": [],
            "time_horizon": "N/A",
            "risk_profile": "N/A",
            "data_warnings": [f"KeyError: {str(ke)}"],
            "key_metrics": [],
        }
    except Exception as e:
        logger.error(f"Error generating analyst insights for {ticker}: {e}", exc_info=True)
        return {
            "summary": f"AI analysis failed: {str(e)}. Please try again later or check the logs for details.",
            "bull_case": "",
            "bear_case": "",
            "key_points": [],
            "risk_factors": [],
            "metrics_to_watch": [],
            "time_horizon": "N/A",
            "risk_profile": "N/A",
            "data_warnings": [f"Error: {str(e)}"],
            "key_metrics": [],
        }

