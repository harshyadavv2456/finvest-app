"""
Hedge Fund Portfolio Tracker
Track 145+ institutional investors from 13F filings
"""

import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
import json
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hedge-funds", tags=["Hedge Fund Tracker"])

# Base directory - handle both local and deployed environments
def get_base_dir():
    """Get the base directory for data files"""
    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent.parent,  # backend/
        Path(__file__).parent.parent.parent,  # project root
        Path(os.getcwd()),  # current working directory
        Path("/opt/render/project/src"),  # Render deployment
    ]
    
    for base in possible_paths:
        insider_path = base / "InsiderFlow" / "signals_output"
        if insider_path.exists():
            logger.info(f"Found InsiderFlow data at: {insider_path}")
            return base
    
    # Fallback
    return Path(__file__).parent.parent

BASE_DIR = get_base_dir()

# Major hedge fund CIK to name mapping
HEDGE_FUND_NAMES = {
    "886982": {"name": "Citadel Advisors LLC", "manager": "Ken Griffin", "style": "Quantitative Multi-Strategy"},
    "1067983": {"name": "Berkshire Hathaway Inc", "manager": "Warren Buffett", "style": "Value Investing"},
    "1166559": {"name": "Bridgewater Associates", "manager": "Ray Dalio", "style": "Macro/Risk Parity"},
    "1103804": {"name": "Renaissance Technologies", "manager": "Jim Simons", "style": "Quantitative"},
    "356028": {"name": "Soros Fund Management", "manager": "George Soros", "style": "Macro"},
    "909410": {"name": "Viking Global Investors", "manager": "Andreas Halvorsen", "style": "Long/Short Equity"},
    "350548": {"name": "Tiger Global Management", "manager": "Chase Coleman", "style": "Growth/Tech"},
    "818757": {"name": "Baupost Group", "manager": "Seth Klarman", "style": "Value/Distressed"},
    "1403085": {"name": "Appaloosa Management", "manager": "David Tepper", "style": "Event-Driven"},
    "1057060": {"name": "Third Point LLC", "manager": "Dan Loeb", "style": "Activist"},
    "1061768": {"name": "Pershing Square", "manager": "Bill Ackman", "style": "Activist"},
    "1167483": {"name": "Greenlight Capital", "manager": "David Einhorn", "style": "Value"},
    "1086364": {"name": "Elliott Management", "manager": "Paul Singer", "style": "Activist/Distressed"},
    "1081406": {"name": "Two Sigma Investments", "manager": "John Overdeck", "style": "Quantitative"},
    "1037389": {"name": "DE Shaw & Co", "manager": "David Shaw", "style": "Quantitative"},
    "1166272": {"name": "Point72 Asset Management", "manager": "Steve Cohen", "style": "Multi-Strategy"},
    "1120758": {"name": "Paulson & Co", "manager": "John Paulson", "style": "Event-Driven"},
    "1393818": {"name": "Lone Pine Capital", "manager": "Steve Mandel", "style": "Long/Short Growth"},
    "1436851": {"name": "Coatue Management", "manager": "Philippe Laffont", "style": "Tech/Growth"},
    "1656456": {"name": "Dragoneer Investment", "manager": "Marc Stad", "style": "Growth"},
    "1638599": {"name": "Whale Rock Capital", "manager": "Alex Sacerdote", "style": "Growth/Tech"},
    "1545074": {"name": "Maverick Capital", "manager": "Lee Ainslie", "style": "Long/Short"},
    "1494731": {"name": "Tiger Cubs Various", "manager": "Various", "style": "Growth"},
    "1350694": {"name": "Duquesne Family Office", "manager": "Stanley Druckenmiller", "style": "Macro"},
    "1580647": {"name": "Hillhouse Capital", "manager": "Lei Zhang", "style": "Asia/Growth"},
}

# Load 13F holdings data
def load_13f_holdings() -> pd.DataFrame:
    """Load all 13F holdings with position changes"""
    holdings_file = BASE_DIR / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv"
    logger.info(f"Loading 13F holdings from: {holdings_file}")
    logger.info(f"File exists: {holdings_file.exists()}")
    
    if holdings_file.exists():
        try:
            df = pd.read_csv(holdings_file)
            df['filer_cik'] = df['filer_cik'].astype(str)
            df['filingDate'] = pd.to_datetime(df['filingDate'])
            logger.info(f"Loaded {len(df)} 13F holdings records")
            return df
        except Exception as e:
            logger.error(f"Error loading 13F holdings: {e}")
            return pd.DataFrame()
    else:
        logger.warning(f"13F holdings file not found at: {holdings_file}")
        # Try alternate paths
        alt_paths = [
            Path("/opt/render/project/src/InsiderFlow/signals_output/13f_holdings_with_flags.csv"),
            Path(os.getcwd()) / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv",
        ]
        for alt in alt_paths:
            if alt.exists():
                logger.info(f"Found at alternate path: {alt}")
                try:
                    df = pd.read_csv(alt)
                    df['filer_cik'] = df['filer_cik'].astype(str)
                    df['filingDate'] = pd.to_datetime(df['filingDate'])
                    return df
                except Exception as e:
                    logger.error(f"Error loading from {alt}: {e}")
    return pd.DataFrame()

def load_asset_signals() -> pd.DataFrame:
    """Load aggregated asset signals"""
    signals_file = BASE_DIR / "InsiderFlow" / "signals_output" / "13f_asset_signals.csv"
    logger.info(f"Loading asset signals from: {signals_file}")
    
    if signals_file.exists():
        try:
            df = pd.read_csv(signals_file)
            df['filingDate'] = pd.to_datetime(df['filingDate'])
            logger.info(f"Loaded {len(df)} asset signal records")
            return df
        except Exception as e:
            logger.error(f"Error loading asset signals: {e}")
    return pd.DataFrame()

@router.get("/list")
async def get_hedge_fund_list():
    """Get list of all tracked hedge funds with basic stats
    
    Note: SEC 13F data is rate-limited. Currently tracking major funds:
    - Citadel Advisors (Ken Griffin)
    - Berkshire Hathaway (Warren Buffett)
    - Renaissance Technologies (Jim Simons)
    - Bridgewater Associates (Ray Dalio)
    
    More funds will be added as data is fetched incrementally.
    """
    df = load_13f_holdings()
    if df.empty:
        return {
            "funds": [], 
            "total_funds": 0,
            "note": "13F data is being fetched. Currently tracking: Citadel, Berkshire, Renaissance, Bridgewater."
        }
    
    funds = []
    unique_ciks = df['filer_cik'].unique()
    
    for cik in unique_ciks:
        fund_df = df[df['filer_cik'] == cik]
        latest_filing = fund_df['filingDate'].max()
        latest_positions = fund_df[fund_df['filingDate'] == latest_filing]
        
        fund_info = HEDGE_FUND_NAMES.get(cik, {
            "name": f"Fund CIK {cik}",
            "manager": "Unknown",
            "style": "Unknown"
        })
        
        # Calculate stats
        total_value = latest_positions['positionValueUSD'].sum() if 'positionValueUSD' in latest_positions.columns else 0
        position_count = len(latest_positions)
        
        # Get position changes
        new_positions = len(latest_positions[latest_positions['positionChangeType'] == 'new']) if 'positionChangeType' in latest_positions.columns else 0
        increased = len(latest_positions[latest_positions['positionChangeType'] == 'increase']) if 'positionChangeType' in latest_positions.columns else 0
        decreased = len(latest_positions[latest_positions['positionChangeType'] == 'decrease']) if 'positionChangeType' in latest_positions.columns else 0
        
        funds.append({
            "cik": cik,
            "name": fund_info["name"],
            "manager": fund_info["manager"],
            "style": fund_info["style"],
            "aum_estimated": total_value / 1000 if total_value else 0,  # Convert from *1000 format
            "position_count": position_count,
            "last_filing": latest_filing.strftime("%Y-%m-%d") if pd.notna(latest_filing) else None,
            "new_positions": new_positions,
            "increased": increased,
            "decreased": decreased,
        })
    
    # Sort by AUM
    funds = sorted(funds, key=lambda x: x['aum_estimated'], reverse=True)
    
    return {
        "funds": funds[:50],  # Top 50
        "total_funds": len(funds)
    }

@router.get("/portfolio/{cik}")
async def get_fund_portfolio(
    cik: str,
    limit: int = Query(50, ge=1, le=500)
):
    """Get detailed portfolio for a specific hedge fund"""
    df = load_13f_holdings()
    if df.empty:
        raise HTTPException(status_code=404, detail="No 13F data available")
    
    fund_df = df[df['filer_cik'] == cik]
    if fund_df.empty:
        raise HTTPException(status_code=404, detail=f"Fund CIK {cik} not found")
    
    # Get latest filing
    latest_filing = fund_df['filingDate'].max()
    latest_positions = fund_df[fund_df['filingDate'] == latest_filing].copy()
    
    # Calculate portfolio metrics
    total_value = latest_positions['positionValueUSD'].sum() / 1000 if 'positionValueUSD' in latest_positions.columns else 0
    
    # Get fund info
    fund_info = HEDGE_FUND_NAMES.get(cik, {
        "name": f"Fund CIK {cik}",
        "manager": "Unknown", 
        "style": "Unknown"
    })
    
    # Sort by position value
    latest_positions = latest_positions.sort_values('positionValueUSD', ascending=False)
    
    holdings = []
    for _, row in latest_positions.head(limit).iterrows():
        position_value = row.get('positionValueUSD', 0) / 1000
        prev_value = row.get('prevPositionValueUSD', 0) / 1000 if pd.notna(row.get('prevPositionValueUSD')) else 0
        delta = row.get('deltaPositionValueUSD', 0) / 1000 if pd.notna(row.get('deltaPositionValueUSD')) else 0
        
        holdings.append({
            "issuer": row.get('nameOfIssuer', 'Unknown'),
            "class": row.get('titleOfClass', ''),
            "cusip": row.get('cusip', ''),
            "value": position_value,
            "shares": row.get('sshPrnamt', 0),
            "pct_portfolio": (position_value / total_value * 100) if total_value > 0 else 0,
            "change_type": row.get('positionChangeType', 'unchanged'),
            "delta_value": delta,
            "prev_value": prev_value,
        })
    
    # Get historical filing dates for this fund
    filing_dates = sorted(fund_df['filingDate'].unique(), reverse=True)
    
    return {
        "cik": cik,
        "fund_name": fund_info["name"],
        "manager": fund_info["manager"],
        "style": fund_info["style"],
        "filing_date": latest_filing.strftime("%Y-%m-%d"),
        "total_value": total_value,
        "position_count": len(latest_positions),
        "holdings": holdings,
        "filing_history": [d.strftime("%Y-%m-%d") for d in filing_dates[:8]],
        "summary": {
            "new": len(latest_positions[latest_positions['positionChangeType'] == 'new']),
            "increased": len(latest_positions[latest_positions['positionChangeType'] == 'increase']),
            "decreased": len(latest_positions[latest_positions['positionChangeType'] == 'decrease']),
            "unchanged": len(latest_positions[latest_positions['positionChangeType'] == 'unchanged']),
        }
    }

@router.get("/stock/{cusip}")
async def get_stock_holders(cusip: str):
    """Get all hedge funds holding a specific stock (by CUSIP)"""
    df = load_13f_holdings()
    if df.empty:
        return {"holders": [], "total_funds": 0}
    
    # Get latest holdings for this CUSIP
    stock_df = df[df['cusip'] == cusip]
    if stock_df.empty:
        return {"holders": [], "total_funds": 0, "cusip": cusip}
    
    # Get only latest filing for each fund
    latest_holdings = []
    for cik in stock_df['filer_cik'].unique():
        fund_stock = stock_df[stock_df['filer_cik'] == cik]
        latest = fund_stock[fund_stock['filingDate'] == fund_stock['filingDate'].max()]
        if not latest.empty:
            latest_holdings.append(latest.iloc[0])
    
    holders = []
    for row in latest_holdings:
        fund_info = HEDGE_FUND_NAMES.get(str(row['filer_cik']), {"name": f"Fund {row['filer_cik']}", "manager": "Unknown"})
        holders.append({
            "cik": str(row['filer_cik']),
            "fund_name": fund_info["name"],
            "manager": fund_info["manager"],
            "value": row.get('positionValueUSD', 0) / 1000,
            "shares": row.get('sshPrnamt', 0),
            "change_type": row.get('positionChangeType', 'unchanged'),
            "delta_value": row.get('deltaPositionValueUSD', 0) / 1000 if pd.notna(row.get('deltaPositionValueUSD')) else 0,
            "filing_date": row['filingDate'].strftime("%Y-%m-%d"),
        })
    
    # Sort by value
    holders = sorted(holders, key=lambda x: x['value'], reverse=True)
    
    # Get stock name
    issuer_name = stock_df['nameOfIssuer'].iloc[0] if 'nameOfIssuer' in stock_df.columns else cusip
    
    return {
        "cusip": cusip,
        "issuer": issuer_name,
        "holders": holders,
        "total_funds": len(holders),
        "total_institutional_value": sum(h['value'] for h in holders),
        "net_sentiment": sum(1 if h['change_type'] in ['new', 'increase'] else -1 if h['change_type'] == 'decrease' else 0 for h in holders)
    }

@router.get("/convergence")
async def get_convergence_signals(
    min_funds: int = Query(3, ge=2, le=20),
    change_type: str = Query("all", regex="^(all|increase|new|decrease)$")
):
    """Find stocks that multiple hedge funds are buying/selling together"""
    df = load_13f_holdings()
    if df.empty:
        return {"signals": []}
    
    # Get latest filing date
    latest_date = df['filingDate'].max()
    latest_df = df[df['filingDate'] == latest_date].copy()
    
    # Filter by change type if specified
    if change_type != "all":
        latest_df = latest_df[latest_df['positionChangeType'] == change_type]
    
    # Group by issuer
    convergence = []
    for issuer in latest_df['nameOfIssuer'].unique():
        issuer_df = latest_df[latest_df['nameOfIssuer'] == issuer]
        
        if len(issuer_df) >= min_funds:
            funds = []
            for _, row in issuer_df.iterrows():
                fund_info = HEDGE_FUND_NAMES.get(str(row['filer_cik']), {"name": f"Fund {row['filer_cik']}"})
                funds.append({
                    "fund_name": fund_info["name"],
                    "change_type": row.get('positionChangeType', 'unknown'),
                    "value": row.get('positionValueUSD', 0) / 1000,
                })
            
            # Calculate sentiment
            bullish = sum(1 for f in funds if f['change_type'] in ['new', 'increase'])
            bearish = sum(1 for f in funds if f['change_type'] == 'decrease')
            
            convergence.append({
                "issuer": issuer,
                "cusip": issuer_df['cusip'].iloc[0],
                "fund_count": len(funds),
                "total_value": sum(f['value'] for f in funds),
                "bullish_funds": bullish,
                "bearish_funds": bearish,
                "sentiment": "bullish" if bullish > bearish else "bearish" if bearish > bullish else "neutral",
                "funds": funds[:10],  # Top 10 funds
            })
    
    # Sort by fund count
    convergence = sorted(convergence, key=lambda x: x['fund_count'], reverse=True)
    
    return {
        "signals": convergence[:50],
        "filing_date": latest_date.strftime("%Y-%m-%d"),
        "filter": change_type
    }

@router.get("/top-moves")
async def get_top_moves(limit: int = Query(20, ge=1, le=100)):
    """Get biggest position changes across all hedge funds"""
    df = load_13f_holdings()
    if df.empty:
        return {"moves": []}
    
    # Get latest filing
    latest_date = df['filingDate'].max()
    latest_df = df[df['filingDate'] == latest_date].copy()
    
    # Filter to positions with changes
    changes_df = latest_df[latest_df['positionChangeType'].isin(['new', 'increase', 'decrease'])].copy()
    changes_df['abs_delta'] = changes_df['deltaPositionValueUSD'].abs()
    changes_df = changes_df.sort_values('abs_delta', ascending=False)
    
    moves = []
    for _, row in changes_df.head(limit).iterrows():
        fund_info = HEDGE_FUND_NAMES.get(str(row['filer_cik']), {"name": f"Fund {row['filer_cik']}", "manager": "Unknown"})
        moves.append({
            "fund_name": fund_info["name"],
            "manager": fund_info["manager"],
            "issuer": row.get('nameOfIssuer', 'Unknown'),
            "cusip": row.get('cusip', ''),
            "change_type": row.get('positionChangeType', 'unknown'),
            "value": row.get('positionValueUSD', 0) / 1000,
            "delta_value": row.get('deltaPositionValueUSD', 0) / 1000 if pd.notna(row.get('deltaPositionValueUSD')) else 0,
            "shares": row.get('sshPrnamt', 0),
        })
    
    return {
        "moves": moves,
        "filing_date": latest_date.strftime("%Y-%m-%d")
    }

@router.get("/legends")
async def get_legend_portfolios():
    """Get portfolios of legendary investors (Buffett, Dalio, Simons, etc.)"""
    legends = ["1067983", "1166559", "1103804", "886982", "1350694", "1061768"]
    
    df = load_13f_holdings()
    if df.empty:
        return {"legends": []}
    
    result = []
    for cik in legends:
        fund_df = df[df['filer_cik'] == cik]
        if fund_df.empty:
            continue
        
        latest_filing = fund_df['filingDate'].max()
        latest = fund_df[fund_df['filingDate'] == latest_filing].copy()
        latest = latest.sort_values('positionValueUSD', ascending=False)
        
        fund_info = HEDGE_FUND_NAMES.get(cik, {"name": cik, "manager": "Unknown", "style": "Unknown"})
        
        top_holdings = []
        for _, row in latest.head(10).iterrows():
            top_holdings.append({
                "issuer": row.get('nameOfIssuer', 'Unknown'),
                "value": row.get('positionValueUSD', 0) / 1000,
                "change_type": row.get('positionChangeType', 'unchanged'),
            })
        
        total_value = latest['positionValueUSD'].sum() / 1000
        
        result.append({
            "cik": cik,
            "name": fund_info["name"],
            "manager": fund_info["manager"],
            "style": fund_info["style"],
            "aum": total_value,
            "position_count": len(latest),
            "top_holdings": top_holdings,
            "filing_date": latest_filing.strftime("%Y-%m-%d"),
        })
    
    return {"legends": result}

