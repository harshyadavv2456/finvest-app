"""
Portfolio Analyzer
Comprehensive portfolio analysis with smart money tracking
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Query, HTTPException, Body
from datetime import datetime, timedelta
from pydantic import BaseModel
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio Analyzer"])

# Base directory - handle both local and deployed environments
def get_base_dir():
    """Get the base directory for data files"""
    possible_paths = [
        Path(__file__).parent.parent,
        Path(__file__).parent.parent.parent,
        Path(os.getcwd()),
        Path("/opt/render/project/src"),
    ]
    
    for base in possible_paths:
        data_path = base / "data" / "screener.csv"
        if data_path.exists():
            logger.info(f"Found data at: {base}")
            return base
    
    return Path(__file__).parent.parent

BASE_DIR = get_base_dir()

class PortfolioPosition(BaseModel):
    ticker: str
    shares: float
    cost_basis: float

class Portfolio(BaseModel):
    positions: List[PortfolioPosition]
    name: str = "My Portfolio"

def load_screener_data() -> pd.DataFrame:
    """Load screener data for current prices"""
    possible_paths = [
        BASE_DIR / "data" / "screener.csv",
        Path("/opt/render/project/src/data/screener.csv"),
        Path(os.getcwd()) / "data" / "screener.csv",
    ]
    
    for path in possible_paths:
        if path.exists():
            logger.info(f"Loading screener from: {path}")
            try:
                return pd.read_csv(path)
            except Exception as e:
                logger.error(f"Error loading screener: {e}")
    
    logger.warning("Screener data not found")
    return pd.DataFrame()

def load_insider_data() -> pd.DataFrame:
    """Load insider trades data"""
    possible_paths = [
        BASE_DIR / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv",
        Path("/opt/render/project/src/InsiderFlow/signals_output/insider_trades_with_flags.csv"),
        Path(os.getcwd()) / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv",
    ]
    
    for path in possible_paths:
        if path.exists():
            logger.info(f"Loading insider data from: {path}")
            try:
                df = pd.read_csv(path)
                df['transactionDate'] = pd.to_datetime(df['transactionDate'])
                return df
            except Exception as e:
                logger.error(f"Error loading insider data: {e}")
    
    logger.warning("Insider data not found")
    return pd.DataFrame()

@router.post("/analyze")
async def analyze_portfolio(portfolio: Portfolio):
    """
    Comprehensive portfolio analysis with smart money alerts
    """
    screener = load_screener_data()
    insider_df = load_insider_data()
    
    positions_analysis = []
    total_value = 0
    total_cost = 0
    warnings = []
    opportunities = []
    
    for pos in portfolio.positions:
        ticker = pos.ticker.upper()
        
        # Get current price from screener
        stock_data = screener[screener['ticker'] == ticker]
        current_price = stock_data['current_price'].iloc[0] if not stock_data.empty and 'current_price' in stock_data.columns else None
        
        # Calculate position metrics
        position_value = pos.shares * current_price if current_price else pos.shares * pos.cost_basis
        position_cost = pos.shares * pos.cost_basis
        pnl = position_value - position_cost
        pnl_pct = (pnl / position_cost * 100) if position_cost > 0 else 0
        
        total_value += position_value
        total_cost += position_cost
        
        # Check insider activity for this stock
        insider_alert = None
        if not insider_df.empty:
            cutoff = datetime.now() - timedelta(days=30)
            ticker_insiders = insider_df[
                (insider_df['issuerTradingSymbol'] == ticker) & 
                (insider_df['transactionDate'] >= cutoff)
            ]
            
            if not ticker_insiders.empty:
                buys = ticker_insiders[ticker_insiders['is_bullish'] == 1]
                sells = ticker_insiders[ticker_insiders['is_bearish'] == 1]
                
                if len(sells) > len(buys) and len(sells) >= 2:
                    insider_alert = {
                        "type": "warning",
                        "message": f"⚠️ {len(sells)} insider sells detected in last 30 days",
                        "sell_value": sells['transactionValue'].sum()
                    }
                    warnings.append(f"{ticker}: {len(sells)} insider sells (${sells['transactionValue'].sum():,.0f})")
                elif len(buys) > len(sells) and len(buys) >= 2:
                    insider_alert = {
                        "type": "bullish",
                        "message": f"🟢 {len(buys)} insider buys detected in last 30 days",
                        "buy_value": buys['transactionValue'].sum()
                    }
                    opportunities.append(f"{ticker}: {len(buys)} insider buys (${buys['transactionValue'].sum():,.0f})")
        
        # Get stock metrics from screener
        pe_ratio = stock_data['pe_trailing'].iloc[0] if not stock_data.empty and 'pe_trailing' in stock_data.columns else None
        market_cap = stock_data['market_cap'].iloc[0] if not stock_data.empty and 'market_cap' in stock_data.columns else None
        sector = stock_data['sector'].iloc[0] if not stock_data.empty and 'sector' in stock_data.columns else "Unknown"
        
        positions_analysis.append({
            "ticker": ticker,
            "shares": pos.shares,
            "cost_basis": pos.cost_basis,
            "current_price": current_price,
            "position_value": position_value,
            "position_cost": position_cost,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "pe_ratio": pe_ratio,
            "market_cap": market_cap,
            "sector": sector,
            "insider_alert": insider_alert,
        })
    
    # Calculate portfolio-level metrics
    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0
    
    # Calculate sector allocation
    sector_allocation = {}
    for pos in positions_analysis:
        sector = pos.get('sector', 'Unknown')
        if sector not in sector_allocation:
            sector_allocation[sector] = 0
        sector_allocation[sector] += pos['position_value']
    
    # Convert to percentages
    for sector in sector_allocation:
        sector_allocation[sector] = (sector_allocation[sector] / total_value * 100) if total_value > 0 else 0
    
    # Sort positions by value
    positions_analysis = sorted(positions_analysis, key=lambda x: x['position_value'], reverse=True)
    
    # Calculate concentration risk
    top_position_pct = (positions_analysis[0]['position_value'] / total_value * 100) if total_value > 0 and len(positions_analysis) > 0 else 0
    concentration_risk = "high" if top_position_pct > 30 else "medium" if top_position_pct > 20 else "low"
    
    return {
        "portfolio_name": portfolio.name,
        "summary": {
            "total_value": total_value,
            "total_cost": total_cost,
            "total_pnl": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "position_count": len(positions_analysis),
            "winning_positions": len([p for p in positions_analysis if p['pnl'] > 0]),
            "losing_positions": len([p for p in positions_analysis if p['pnl'] < 0]),
        },
        "positions": positions_analysis,
        "sector_allocation": sector_allocation,
        "risk_metrics": {
            "concentration_risk": concentration_risk,
            "top_position_pct": top_position_pct,
            "sector_count": len(sector_allocation),
        },
        "smart_money_alerts": {
            "warnings": warnings,
            "opportunities": opportunities,
        },
        "generated_at": datetime.now().isoformat()
    }

@router.get("/insider-check/{ticker}")
async def check_insider_activity(
    ticker: str,
    days: int = Query(90, ge=7, le=365)
):
    """Check insider activity for a specific stock"""
    insider_df = load_insider_data()
    
    if insider_df.empty:
        return {"ticker": ticker, "insider_activity": None, "message": "No insider data available"}
    
    cutoff = datetime.now() - timedelta(days=days)
    ticker_df = insider_df[
        (insider_df['issuerTradingSymbol'] == ticker.upper()) & 
        (insider_df['transactionDate'] >= cutoff)
    ]
    
    if ticker_df.empty:
        return {
            "ticker": ticker.upper(),
            "period_days": days,
            "insider_activity": None,
            "message": f"No insider transactions for {ticker} in the last {days} days"
        }
    
    buys = ticker_df[ticker_df['is_bullish'] == 1]
    sells = ticker_df[ticker_df['is_bearish'] == 1]
    
    # Get recent transactions
    recent = ticker_df.sort_values('transactionDate', ascending=False).head(10)
    transactions = []
    for _, row in recent.iterrows():
        transactions.append({
            "date": row['transactionDate'].strftime("%Y-%m-%d"),
            "insider": row['reportingOwnerName'],
            "type": "buy" if row.get('is_bullish', 0) == 1 else "sell" if row.get('is_bearish', 0) == 1 else "other",
            "value": row['transactionValue'],
            "shares": row.get('transactionShares', 0),
        })
    
    sentiment = "bullish" if len(buys) > len(sells) else "bearish" if len(sells) > len(buys) else "neutral"
    
    return {
        "ticker": ticker.upper(),
        "period_days": days,
        "insider_activity": {
            "total_transactions": len(ticker_df),
            "buy_count": len(buys),
            "buy_value": buys['transactionValue'].sum() if len(buys) > 0 else 0,
            "sell_count": len(sells),
            "sell_value": sells['transactionValue'].sum() if len(sells) > 0 else 0,
            "unique_insiders": ticker_df['reportingOwnerName'].nunique(),
            "sentiment": sentiment,
        },
        "recent_transactions": transactions
    }

@router.get("/hedge-fund-check/{ticker}")
async def check_hedge_fund_activity(ticker: str):
    """Check if major hedge funds hold this stock"""
    holdings_file = BASE_DIR / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv"
    
    if not holdings_file.exists():
        return {"ticker": ticker, "funds": [], "message": "No 13F data available"}
    
    df = pd.read_csv(holdings_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    
    # Search by name (case insensitive partial match)
    ticker_upper = ticker.upper()
    matches = df[df['nameOfIssuer'].str.upper().str.contains(ticker_upper, na=False)]
    
    if matches.empty:
        return {
            "ticker": ticker.upper(),
            "funds": [],
            "message": f"No institutional holdings found for {ticker}"
        }
    
    # Get latest filing for each fund holding this stock
    latest_date = matches['filingDate'].max()
    latest_holdings = matches[matches['filingDate'] == latest_date]
    
    # Import fund names
    from .hedge_fund_tracker import HEDGE_FUND_NAMES
    
    funds = []
    for _, row in latest_holdings.iterrows():
        cik = str(row['filer_cik'])
        fund_info = HEDGE_FUND_NAMES.get(cik, {"name": f"Fund {cik}", "manager": "Unknown"})
        funds.append({
            "fund_name": fund_info["name"],
            "manager": fund_info["manager"],
            "value": row.get('positionValueUSD', 0) / 1000,
            "shares": row.get('sshPrnamt', 0),
            "change_type": row.get('positionChangeType', 'unchanged'),
        })
    
    # Sort by value
    funds = sorted(funds, key=lambda x: x['value'], reverse=True)
    
    # Calculate sentiment
    bullish = sum(1 for f in funds if f['change_type'] in ['new', 'increase'])
    bearish = sum(1 for f in funds if f['change_type'] == 'decrease')
    
    return {
        "ticker": ticker.upper(),
        "issuer": latest_holdings['nameOfIssuer'].iloc[0],
        "filing_date": latest_date.strftime("%Y-%m-%d"),
        "fund_count": len(funds),
        "total_institutional_value": sum(f['value'] for f in funds),
        "sentiment": "bullish" if bullish > bearish else "bearish" if bearish > bullish else "neutral",
        "funds": funds[:20]
    }

@router.get("/watchlist-alerts")
async def get_watchlist_alerts(tickers: str = Query(..., description="Comma-separated tickers")):
    """
    Get smart money alerts for a watchlist of tickers
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    
    if len(ticker_list) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers allowed")
    
    insider_df = load_insider_data()
    
    alerts = []
    cutoff = datetime.now() - timedelta(days=30)
    
    for ticker in ticker_list:
        if not insider_df.empty:
            ticker_data = insider_df[
                (insider_df['issuerTradingSymbol'] == ticker) & 
                (insider_df['transactionDate'] >= cutoff)
            ]
            
            if not ticker_data.empty:
                buys = ticker_data[ticker_data['is_bullish'] == 1]
                sells = ticker_data[ticker_data['is_bearish'] == 1]
                
                if len(buys) >= 2:
                    alerts.append({
                        "ticker": ticker,
                        "alert_type": "insider_buying",
                        "severity": "high" if len(buys) >= 3 else "medium",
                        "message": f"{len(buys)} insiders bought ${buys['transactionValue'].sum():,.0f} worth",
                        "details": {
                            "buy_count": len(buys),
                            "buy_value": buys['transactionValue'].sum(),
                            "unique_insiders": buys['reportingOwnerName'].nunique(),
                        }
                    })
                
                if len(sells) >= 2:
                    alerts.append({
                        "ticker": ticker,
                        "alert_type": "insider_selling",
                        "severity": "warning",
                        "message": f"{len(sells)} insiders sold ${sells['transactionValue'].sum():,.0f} worth",
                        "details": {
                            "sell_count": len(sells),
                            "sell_value": sells['transactionValue'].sum(),
                            "unique_insiders": sells['reportingOwnerName'].nunique(),
                        }
                    })
    
    # Sort by severity
    severity_order = {"high": 0, "medium": 1, "warning": 2, "low": 3}
    alerts = sorted(alerts, key=lambda x: severity_order.get(x['severity'], 99))
    
    return {
        "watchlist": ticker_list,
        "alerts": alerts,
        "period_days": 30,
        "generated_at": datetime.now().isoformat()
    }

@router.get("/smart-picks")
async def get_smart_picks():
    """
    Get AI-curated stock picks based on insider + institutional confluence
    """
    insider_df = load_insider_data()
    
    if insider_df.empty:
        return {"picks": [], "message": "Insufficient data"}
    
    cutoff = datetime.now() - timedelta(days=60)
    recent = insider_df[insider_df['transactionDate'] >= cutoff]
    
    # Find stocks with multiple insider buys
    buys = recent[recent['is_bullish'] == 1]
    
    # Group by ticker and count
    ticker_stats = buys.groupby('issuerTradingSymbol').agg({
        'transactionValue': 'sum',
        'reportingOwnerName': 'nunique',
        'transactionDate': 'max'
    }).reset_index()
    
    ticker_stats.columns = ['ticker', 'total_buy_value', 'unique_insiders', 'last_buy_date']
    
    # Filter to meaningful activity
    picks = ticker_stats[
        (ticker_stats['unique_insiders'] >= 2) & 
        (ticker_stats['total_buy_value'] >= 100000)
    ].copy()
    
    picks = picks.sort_values('total_buy_value', ascending=False).head(20)
    
    result = []
    for _, row in picks.iterrows():
        result.append({
            "ticker": row['ticker'],
            "total_buy_value": row['total_buy_value'],
            "unique_insiders": int(row['unique_insiders']),
            "last_buy_date": row['last_buy_date'].strftime("%Y-%m-%d") if pd.notna(row['last_buy_date']) else None,
            "signal_strength": min(100, row['unique_insiders'] * 25 + (row['total_buy_value'] / 500000) * 25),
            "pick_reason": f"{int(row['unique_insiders'])} insiders bought ${row['total_buy_value']:,.0f}"
        })
    
    return {
        "picks": result,
        "period_days": 60,
        "methodology": "Stocks with 2+ unique insiders making open market purchases",
        "generated_at": datetime.now().isoformat()
    }

