"""
Stock Intelligence Module - Deep Analytics Engine
Combines all data sources for comprehensive stock analysis
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pathlib import Path
import pandas as pd
import json
from datetime import datetime, timedelta
import numpy as np

router = APIRouter(prefix="/api/stock-data", tags=["Stock Data & Intelligence"])

# Paths
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
INSIDER_FLOW_DIR = PROJECT_ROOT / "InsiderFlow"
SEC_10Y_DIR = INSIDER_FLOW_DIR / "sec_output_10y"
SIGNALS_DIR = INSIDER_FLOW_DIR / "signals_output"
SMART_MONEY_DIR = PROJECT_ROOT / "Smart Money Flow" / "fii_dii_output"


def get_market_for_ticker(ticker: str) -> str:
    """Determine market from ticker suffix"""
    if ticker.endswith(".NS") or ticker.endswith(".BO") or ticker.endswith(".BOM"):
        return "IN"
    elif ticker.endswith(".L"):
        return "UK"
    elif ticker.endswith(".T"):
        return "JP"
    elif ticker.endswith(".SI"):
        return "SG"
    elif ticker.endswith(".HK"):
        return "HK"
    elif ticker.endswith(".SS") or ticker.endswith(".SZ"):
        return "CN"
    elif ticker.endswith(".AX"):
        return "AU"
    else:
        return "US"


def load_stock_financials(ticker: str) -> Optional[Dict]:
    """Load full financials for a stock"""
    market = get_market_for_ticker(ticker)
    financials_path = DATA_DIR / market / ticker / "financials_full.json"
    
    if financials_path.exists():
        with open(financials_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def load_insider_10y(ticker: str) -> Optional[pd.DataFrame]:
    """Load 10-year insider trading data for a stock"""
    # Convert ticker for file lookup (remove suffix for US stocks)
    base_ticker = ticker.replace(".NS", "").replace(".BO", "").replace(".L", "")
    insider_file = SEC_10Y_DIR / f"{base_ticker}_insider_10y.csv"
    
    if insider_file.exists():
        return pd.read_csv(insider_file)
    return None


def load_13f_holdings(cik: str = None) -> Optional[pd.DataFrame]:
    """Load 13F holdings data for a specific fund or all funds"""
    holdings_file = SIGNALS_DIR / "13f_holdings_with_flags.csv"
    
    # Try multiple paths
    possible_paths = [
        holdings_file,
        Path("/opt/render/project/src/InsiderFlow/signals_output/13f_holdings_with_flags.csv"),
        BASE_DIR.parent / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv",
    ]
    
    for fpath in possible_paths:
        if fpath.exists():
            df = pd.read_csv(fpath)
            # Ensure filer_cik is string for consistent matching
            df['filer_cik'] = df['filer_cik'].astype(str).str.strip()
            if cik:
                # Match as string
                df = df[df['filer_cik'] == str(cik).strip()]
            return df
    return None


def calculate_insider_score(insider_data: pd.DataFrame) -> Dict:
    """Calculate insider sentiment score from trading data"""
    if insider_data is None or insider_data.empty:
        return {"score": 0, "signal": "neutral", "recent_buys": 0, "recent_sells": 0}
    
    # Last 90 days of data
    insider_data['transactionDate'] = pd.to_datetime(insider_data['transactionDate'], errors='coerce')
    cutoff = datetime.now() - timedelta(days=90)
    recent = insider_data[insider_data['transactionDate'] >= cutoff]
    
    buys = recent[recent['transactionCode'].isin(['P', 'A'])]
    sells = recent[recent['transactionCode'] == 'S']
    exercises = recent[recent['transactionCode'] == 'M']
    
    buy_value = (buys['transactionShares'].fillna(0) * buys['transactionPricePerShare'].fillna(0)).sum()
    sell_value = (sells['transactionShares'].fillna(0) * sells['transactionPricePerShare'].fillna(0)).sum()
    
    # Score: -100 (all sells) to +100 (all buys)
    total_value = buy_value + sell_value
    if total_value > 0:
        score = ((buy_value - sell_value) / total_value) * 100
    else:
        score = 0
    
    signal = "bullish" if score > 20 else ("bearish" if score < -20 else "neutral")
    
    return {
        "score": round(score, 1),
        "signal": signal,
        "recent_buys": len(buys),
        "recent_sells": len(sells),
        "recent_exercises": len(exercises),
        "buy_value": round(buy_value, 2),
        "sell_value": round(sell_value, 2),
        "net_value": round(buy_value - sell_value, 2)
    }


def calculate_governance_score(financials: Dict) -> Dict:
    """Extract and interpret governance scores"""
    info = financials.get('info', {})
    
    return {
        "audit_risk": info.get('auditRisk', None),
        "board_risk": info.get('boardRisk', None),
        "compensation_risk": info.get('compensationRisk', None),
        "shareholder_rights_risk": info.get('shareHolderRightsRisk', None),
        "overall_risk": info.get('overallRisk', None),
        "interpretation": interpret_governance(info.get('overallRisk', 5))
    }


def interpret_governance(risk: int) -> str:
    """Interpret governance risk score"""
    if risk is None:
        return "Unknown"
    if risk <= 2:
        return "Excellent governance - Low risk"
    elif risk <= 4:
        return "Good governance - Moderate risk"
    elif risk <= 6:
        return "Average governance - Some concerns"
    elif risk <= 8:
        return "Below average - Significant concerns"
    else:
        return "Poor governance - High risk"


def extract_executive_info(financials: Dict) -> List[Dict]:
    """Extract detailed executive information"""
    info = financials.get('info', {})
    officers = info.get('companyOfficers', [])
    
    executives = []
    for officer in officers[:10]:  # Top 10 executives
        exec_data = {
            "name": officer.get('name', 'Unknown'),
            "title": officer.get('title', 'Unknown'),
            "age": officer.get('age'),
            "year_born": officer.get('yearBorn'),
            "fiscal_year": officer.get('fiscalYear'),
            "total_pay": officer.get('totalPay'),
            "exercised_value": officer.get('exercisedValue', 0),
            "unexercised_value": officer.get('unexercisedValue', 0)
        }
        executives.append(exec_data)
    
    return executives


def calculate_valuation_metrics(financials: Dict) -> Dict:
    """Calculate comprehensive valuation metrics"""
    info = financials.get('info', {})
    
    return {
        "pe_trailing": info.get('trailingPE'),
        "pe_forward": info.get('forwardPE'),
        "peg_ratio": info.get('pegRatio'),
        "price_to_book": info.get('priceToBook'),
        "price_to_sales": info.get('priceToSalesTrailing12Months'),
        "ev_to_revenue": info.get('enterpriseToRevenue'),
        "ev_to_ebitda": info.get('enterpriseToEbitda'),
        "market_cap": info.get('marketCap'),
        "enterprise_value": info.get('enterpriseValue'),
        "52_week_high": info.get('fiftyTwoWeekHigh'),
        "52_week_low": info.get('fiftyTwoWeekLow'),
        "all_time_high": info.get('allTimeHigh'),
        "current_price": info.get('currentPrice'),
        "distance_from_52w_high": calculate_distance(info.get('currentPrice'), info.get('fiftyTwoWeekHigh')),
        "distance_from_52w_low": calculate_distance(info.get('currentPrice'), info.get('fiftyTwoWeekLow')),
        "distance_from_ath": calculate_distance(info.get('currentPrice'), info.get('allTimeHigh'))
    }


def calculate_distance(current: float, target: float) -> Optional[float]:
    """Calculate percentage distance between two prices"""
    if current and target and target > 0:
        return round(((current - target) / target) * 100, 2)
    return None


def extract_analyst_info(financials: Dict) -> Dict:
    """Extract analyst recommendations and targets"""
    info = financials.get('info', {})
    
    return {
        "target_high": info.get('targetHighPrice'),
        "target_low": info.get('targetLowPrice'),
        "target_mean": info.get('targetMeanPrice'),
        "target_median": info.get('targetMedianPrice'),
        "recommendation_mean": info.get('recommendationMean'),
        "recommendation_key": interpret_recommendation(info.get('recommendationMean')),
        "number_of_analysts": info.get('numberOfAnalystOpinions'),
        "upside_potential": calculate_upside(info.get('currentPrice'), info.get('targetMeanPrice'))
    }


def interpret_recommendation(score: float) -> str:
    """Interpret analyst recommendation score"""
    if score is None:
        return "Unknown"
    if score <= 1.5:
        return "Strong Buy"
    elif score <= 2.5:
        return "Buy"
    elif score <= 3.5:
        return "Hold"
    elif score <= 4.5:
        return "Sell"
    else:
        return "Strong Sell"


def calculate_upside(current: float, target: float) -> Optional[float]:
    """Calculate upside potential to analyst target"""
    if current and target and current > 0:
        return round(((target - current) / current) * 100, 2)
    return None


def extract_ownership_info(financials: Dict) -> Dict:
    """Extract ownership breakdown"""
    info = financials.get('info', {})
    
    return {
        "insider_percent": round((info.get('heldPercentInsiders', 0) or 0) * 100, 2),
        "institutional_percent": round((info.get('heldPercentInstitutions', 0) or 0) * 100, 2),
        "float_shares": info.get('floatShares'),
        "shares_outstanding": info.get('sharesOutstanding'),
        "shares_short": info.get('sharesShort'),
        "short_ratio": info.get('shortRatio'),
        "short_percent_of_float": round((info.get('shortPercentOfFloat', 0) or 0) * 100, 2),
        "short_percent_shares_out": round((info.get('sharesPercentSharesOut', 0) or 0) * 100, 2)
    }


def extract_dividend_info(financials: Dict) -> Dict:
    """Extract dividend information"""
    info = financials.get('info', {})
    
    return {
        "dividend_rate": info.get('dividendRate'),
        "dividend_yield": round((info.get('dividendYield', 0) or 0) * 100, 2),
        "ex_dividend_date": info.get('exDividendDate'),
        "payout_ratio": round((info.get('payoutRatio', 0) or 0) * 100, 2),
        "five_year_avg_yield": info.get('fiveYearAvgDividendYield'),
        "last_dividend_value": info.get('lastDividendValue'),
        "last_dividend_date": info.get('lastDividendDate')
    }


def extract_growth_metrics(financials: Dict) -> Dict:
    """Extract growth metrics"""
    info = financials.get('info', {})
    
    return {
        "revenue_growth": round((info.get('revenueGrowth', 0) or 0) * 100, 2),
        "earnings_growth": round((info.get('earningsGrowth', 0) or 0) * 100, 2),
        "earnings_quarterly_growth": round((info.get('earningsQuarterlyGrowth', 0) or 0) * 100, 2),
        "trailing_eps": info.get('trailingEps'),
        "forward_eps": info.get('forwardEps'),
        "profit_margins": round((info.get('profitMargins', 0) or 0) * 100, 2),
        "gross_margins": round((info.get('grossMargins', 0) or 0) * 100, 2),
        "operating_margins": round((info.get('operatingMargins', 0) or 0) * 100, 2),
        "beta": info.get('beta')
    }


@router.get("/stock/{ticker}")
async def get_stock_intelligence(ticker: str):
    """
    Get comprehensive stock intelligence combining all data sources
    """
    financials = load_stock_financials(ticker)
    insider_data = load_insider_10y(ticker)
    
    if not financials:
        raise HTTPException(status_code=404, detail=f"Stock {ticker} not found")
    
    info = financials.get('info', {})
    
    # Build comprehensive intelligence report
    intelligence = {
        "ticker": ticker,
        "name": info.get('shortName') or info.get('longName', ticker),
        "sector": info.get('sector'),
        "industry": info.get('industry'),
        "country": info.get('country'),
        "website": info.get('website'),
        "employees": info.get('fullTimeEmployees'),
        "business_summary": info.get('longBusinessSummary', '')[:500] + "..." if info.get('longBusinessSummary') else None,
        
        # Core metrics
        "current_price": info.get('currentPrice'),
        "market_cap": info.get('marketCap'),
        "volume": info.get('volume'),
        "avg_volume": info.get('averageVolume'),
        
        # Comprehensive analysis sections
        "valuation": calculate_valuation_metrics(financials),
        "growth": extract_growth_metrics(financials),
        "ownership": extract_ownership_info(financials),
        "dividends": extract_dividend_info(financials),
        "analysts": extract_analyst_info(financials),
        "governance": calculate_governance_score(financials),
        "executives": extract_executive_info(financials),
        "insider_sentiment": calculate_insider_score(insider_data),
        
        # Metadata
        "last_updated": datetime.utcnow().isoformat()
    }
    
    return intelligence


@router.get("/stock/{ticker}/insider-history")
async def get_insider_history(
    ticker: str,
    days: int = Query(default=365, le=3650, description="Days of history (max 10 years)")
):
    """
    Get detailed insider trading history for a stock (up to 10 years)
    """
    insider_data = load_insider_10y(ticker)
    
    if insider_data is None or insider_data.empty:
        return {"ticker": ticker, "trades": [], "summary": None}
    
    # Convert dates and filter
    insider_data['transactionDate'] = pd.to_datetime(insider_data['transactionDate'], errors='coerce')
    cutoff = datetime.now() - timedelta(days=days)
    filtered = insider_data[insider_data['transactionDate'] >= cutoff].copy()
    
    # Calculate trade values
    filtered['tradeValue'] = (
        filtered['transactionShares'].fillna(0) * 
        filtered['transactionPricePerShare'].fillna(0)
    )
    
    # Group by transaction type
    buys = filtered[filtered['transactionCode'].isin(['P', 'A'])]
    sells = filtered[filtered['transactionCode'] == 'S']
    exercises = filtered[filtered['transactionCode'] == 'M']
    
    # Top insiders by activity
    insider_activity = filtered.groupby('reportingOwnerName').agg({
        'transactionShares': 'sum',
        'tradeValue': 'sum',
        'transactionCode': 'count'
    }).reset_index()
    insider_activity.columns = ['name', 'total_shares', 'total_value', 'trade_count']
    top_insiders = insider_activity.nlargest(10, 'total_value').to_dict('records')
    
    # Recent trades
    recent_trades = filtered.sort_values('transactionDate', ascending=False).head(50)
    trades = []
    for _, row in recent_trades.iterrows():
        trades.append({
            "date": row['transactionDate'].strftime('%Y-%m-%d') if pd.notna(row['transactionDate']) else None,
            "owner": row.get('reportingOwnerName'),
            "relationship": row.get('reportingOwnerRelationship'),
            "transaction_type": interpret_transaction_code(row.get('transactionCode')),
            "shares": row.get('transactionShares'),
            "price": row.get('transactionPricePerShare'),
            "value": row.get('tradeValue'),
            "shares_owned_after": row.get('sharesOwnedFollowingTransaction')
        })
    
    summary = {
        "total_trades": len(filtered),
        "total_buys": len(buys),
        "total_sells": len(sells),
        "total_exercises": len(exercises),
        "buy_value": round(buys['tradeValue'].sum(), 2),
        "sell_value": round(sells['tradeValue'].sum(), 2),
        "net_value": round(buys['tradeValue'].sum() - sells['tradeValue'].sum(), 2),
        "unique_insiders": filtered['reportingOwnerName'].nunique(),
        "top_insiders": top_insiders
    }
    
    return {
        "ticker": ticker,
        "period_days": days,
        "trades": trades,
        "summary": summary
    }


def interpret_transaction_code(code: str) -> str:
    """Interpret SEC Form 4 transaction codes"""
    codes = {
        'P': 'Open Market Purchase',
        'S': 'Open Market Sale',
        'A': 'Award/Grant',
        'M': 'Option Exercise',
        'F': 'Tax Withholding',
        'G': 'Gift',
        'D': 'Disposition to Issuer',
        'J': 'Other Acquisition/Disposition',
        'C': 'Conversion of Derivative',
        'E': 'Expiration of Derivative',
        'H': 'Expiration (Short Position)',
        'I': 'Discretionary Transaction',
        'K': 'Equity Swap',
        'L': 'Small Acquisition',
        'U': 'Disposition due to Tender',
        'W': 'Acquisition/Disposition by Will/Laws',
        'X': 'Exercise of In-the-Money Derivative',
        'Z': 'Deposit/Withdrawal from Voting Trust'
    }
    return codes.get(code, f'Unknown ({code})')


@router.get("/fund-holdings/{fund_name}")
async def get_fund_holdings(fund_name: str):
    """
    Get 13F holdings for a specific hedge fund
    Known funds: berkshire, bridgewater, renaissance, citadel
    """
    # Map fund names to CIKs
    fund_ciks = {
        "berkshire": "1067983",
        "bridgewater": "1166559",
        "renaissance": "1103804",
        "citadel": "886982"
    }
    
    cik = fund_ciks.get(fund_name.lower())
    if not cik:
        raise HTTPException(status_code=404, detail=f"Fund {fund_name} not found. Available: {list(fund_ciks.keys())}")
    
    holdings = load_13f_holdings(cik)
    
    if holdings is None or holdings.empty:
        return {"fund": fund_name, "holdings": []}
    
    # Get latest filing
    holdings['filingDate'] = pd.to_datetime(holdings['filingDate'])
    latest_date = holdings['filingDate'].max()
    latest = holdings[holdings['filingDate'] == latest_date]
    
    # Sort by value
    latest = latest.sort_values('value', ascending=False)
    
    holdings_list = []
    for _, row in latest.head(50).iterrows():
        holdings_list.append({
            "issuer": row.get('nameOfIssuer'),
            "class": row.get('titleOfClass'),
            "cusip": row.get('cusip'),
            "value": row.get('value'),
            "shares": row.get('sshPrnamt'),
            "position_change": row.get('positionChangeType'),
            "delta_value": row.get('deltaPositionValueUSD')
        })
    
    return {
        "fund": fund_name,
        "cik": cik,
        "filing_date": latest_date.strftime('%Y-%m-%d'),
        "total_holdings": len(latest),
        "holdings": holdings_list
    }


@router.get("/market-overview")
async def get_market_overview():
    """
    Get cross-market overview with FII/DII flows and market sentiment
    """
    # Load FII/DII data
    fii_dii_file = SMART_MONEY_DIR / "fii_dii_nifty_joint_signals.csv"
    
    overview = {
        "timestamp": datetime.utcnow().isoformat(),
        "markets": {},
        "smart_money": None
    }
    
    # Count stocks per market
    markets = ["US", "IN", "UK", "HK", "JP", "SG", "CN", "AU"]
    for market in markets:
        market_dir = DATA_DIR / market
        if market_dir.exists():
            ticker_count = len([d for d in market_dir.iterdir() if d.is_dir()])
            overview["markets"][market] = {"ticker_count": ticker_count}
    
    # Smart money flow
    if fii_dii_file.exists():
        fii_dii = pd.read_csv(fii_dii_file)
        if not fii_dii.empty:
            latest = fii_dii.iloc[-1]
            overview["smart_money"] = {
                "date": latest.get('trade_date'),
                "fii_net": latest.get('fii_net'),
                "dii_net": latest.get('dii_net'),
                "total_net": latest.get('total_net'),
                "regime": latest.get('regime'),
                "flow_signal": latest.get('flow_signal'),
                "nifty_close": latest.get('nifty_close'),
                "fii_5d_avg": latest.get('fii_roll5'),
                "dii_5d_avg": latest.get('dii_roll5')
            }
    
    return overview


@router.get("/signals/confluence")
async def get_confluence_signals(min_signals: int = Query(default=2, ge=1, le=5)):
    """
    Get stocks with multiple bullish/bearish signals (confluence)
    Combines: Insider activity + Technical + Fundamental signals
    """
    # Load insider signals
    signals_file = SIGNALS_DIR / "insider_daily_signals.csv"
    
    confluence = []
    
    if signals_file.exists():
        signals_df = pd.read_csv(signals_file)
        
        # Group by ticker and aggregate signals
        if not signals_df.empty and 'issuerTradingSymbol' in signals_df.columns:
            ticker_signals = signals_df.groupby('issuerTradingSymbol').agg({
                'is_bullish': 'sum',
                'is_bearish': 'sum',
                'transactionValue': 'sum'
            }).reset_index()
            
            # Add confluence score
            ticker_signals['bullish_count'] = ticker_signals['is_bullish']
            ticker_signals['bearish_count'] = ticker_signals['is_bearish']
            ticker_signals['net_signal'] = ticker_signals['is_bullish'] - ticker_signals['is_bearish']
            
            # Filter by minimum signals
            strong_signals = ticker_signals[
                (ticker_signals['bullish_count'] >= min_signals) | 
                (ticker_signals['bearish_count'] >= min_signals)
            ]
            
            for _, row in strong_signals.iterrows():
                signal_type = "bullish" if row['net_signal'] > 0 else "bearish"
                confluence.append({
                    "ticker": row['issuerTradingSymbol'],
                    "signal_type": signal_type,
                    "bullish_signals": int(row['bullish_count']),
                    "bearish_signals": int(row['bearish_count']),
                    "net_signal": int(row['net_signal']),
                    "total_value": round(row['transactionValue'], 2)
                })
    
    # Sort by absolute net signal
    confluence.sort(key=lambda x: abs(x['net_signal']), reverse=True)
    
    return {
        "min_signals": min_signals,
        "total_stocks": len(confluence),
        "bullish_count": len([c for c in confluence if c['signal_type'] == 'bullish']),
        "bearish_count": len([c for c in confluence if c['signal_type'] == 'bearish']),
        "signals": confluence[:50]
    }


@router.get("/executives/top-paid")
async def get_top_paid_executives(market: str = Query(default="US")):
    """
    Get highest paid executives across all tracked stocks
    """
    market_dir = DATA_DIR / market
    if not market_dir.exists():
        raise HTTPException(status_code=404, detail=f"Market {market} not found")
    
    executives = []
    
    for ticker_dir in market_dir.iterdir():
        if not ticker_dir.is_dir():
            continue
            
        financials_file = ticker_dir / "financials_full.json"
        if not financials_file.exists():
            continue
        
        try:
            with open(financials_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            info = data.get('info', {})
            officers = info.get('companyOfficers', [])
            
            for officer in officers[:5]:  # Top 5 per company
                if officer.get('totalPay'):
                    executives.append({
                        "name": officer.get('name'),
                        "title": officer.get('title'),
                        "company": info.get('shortName') or ticker_dir.name,
                        "ticker": ticker_dir.name,
                        "total_pay": officer.get('totalPay'),
                        "age": officer.get('age'),
                        "fiscal_year": officer.get('fiscalYear')
                    })
        except:
            continue
    
    # Sort by pay
    executives.sort(key=lambda x: x['total_pay'] or 0, reverse=True)
    
    return {
        "market": market,
        "total_executives": len(executives),
        "executives": executives[:50]
    }

