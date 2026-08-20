"""
AI Analysis Engine powered by GROQ
Provides intelligent insights across all data sources
"""

import os
import json
import httpx
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
import asyncio

router = APIRouter(prefix="/api/ai", tags=["AI Engine"])

# GROQ API Configuration - loaded from environment
# Set GROQ_API_KEYS as comma-separated in env, or single GROQ_API_KEY
_raw_keys = os.environ.get("GROQ_API_KEYS", "") or os.environ.get("GROQ_API_KEY", "")
GROQ_API_KEYS = [k.strip() for k in _raw_keys.split(",") if k.strip()]

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
current_key_index = 0

def get_next_api_key() -> str:
    """Rotate through API keys"""
    global current_key_index
    if not GROQ_API_KEYS:
        return ""
    key = GROQ_API_KEYS[current_key_index]
    current_key_index = (current_key_index + 1) % len(GROQ_API_KEYS)
    return key

async def call_groq(
    messages: List[Dict],
    model: str = "llama-3.3-70b-versatile",  # Current GROQ model Dec 2024
    max_tokens: int = 2000,
    temperature: float = 0.7
) -> str:
    """Call GROQ API with automatic key rotation"""
    
    # Current GROQ models as of Dec 2024 (old ones decommissioned)
    models_to_try = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]
    
    for model_name in models_to_try:
        for attempt in range(len(GROQ_API_KEYS)):
            api_key = get_next_api_key()
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
            
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    response = await client.post(GROQ_API_URL, json=payload, headers=headers)
                    
                    if response.status_code == 200:
                        result = response.json()
                        return result["choices"][0]["message"]["content"]
                    elif response.status_code == 429:  # Rate limited, try next key
                        print(f"Rate limited on {model_name}, trying next key...")
                        await asyncio.sleep(1)
                        continue
                    elif response.status_code == 400:  # Bad request - model issue
                        print(f"Model {model_name} error: {response.text}")
                        break  # Try next model
                    else:
                        print(f"GROQ API error ({model_name}): {response.status_code} - {response.text}")
                        continue
            except Exception as e:
                print(f"GROQ API exception ({model_name}): {e}")
                continue
    
    return "AI analysis temporarily unavailable. Please try again."

@router.get("/analyze-stock/{ticker}")
async def analyze_stock(ticker: str):
    """
    Comprehensive AI analysis of a stock combining all data sources
    """
    from . import insider_flow, stock_intelligence
    
    # Gather data from all sources
    try:
        insider_summary = await get_insider_summary_for_ai(ticker)
        fund_summary = await get_fund_summary_for_ai(ticker)
    except:
        insider_summary = "No insider data available"
        fund_summary = "No fund data available"
    
    prompt = f"""You are an expert financial analyst. Analyze {ticker} based on the following data:

INSIDER TRADING DATA (Last 90 days):
{insider_summary}

INSTITUTIONAL HOLDINGS:
{fund_summary}

Please provide:
1. **Executive Summary** (2-3 sentences on overall sentiment)
2. **Insider Signal Analysis** - What does insider activity tell us?
3. **Institutional Sentiment** - What are the smart money funds doing?
4. **Key Risks** - What should investors watch out for?
5. **Actionable Recommendation** - Buy/Hold/Sell with confidence level

Be specific and data-driven. Format with clear headers."""

    messages = [
        {"role": "system", "content": "You are a senior financial analyst with deep expertise in insider trading patterns and institutional investment flows. Provide clear, actionable insights."},
        {"role": "user", "content": prompt}
    ]
    
    analysis = await call_groq(messages, max_tokens=1500)
    
    return {
        "ticker": ticker.upper(),
        "analysis": analysis,
        "generated_at": datetime.now().isoformat(),
        "data_sources": ["insider_trades", "13f_holdings", "daily_signals"]
    }

@router.get("/market-outlook")
async def get_market_outlook():
    """
    AI-powered market outlook combining FII/DII flows and insider activity
    Uses REAL data from our databases
    """
    from pathlib import Path
    import pandas as pd
    
    BASE_DIR = Path(__file__).parent.parent
    
    # Load FII/DII data
    fii_dii_summary = "No FII/DII data available"
    try:
        possible_paths = [
            BASE_DIR / "Smart Money Flow" / "fii_dii_output" / "fii_dii_nifty_joint_signals.csv",
            Path("/opt/render/project/src/Smart Money Flow/fii_dii_output/fii_dii_nifty_joint_signals.csv"),
            BASE_DIR.parent / "Smart Money Flow" / "fii_dii_output" / "fii_dii_nifty_joint_signals.csv",
        ]
        
        fii_file = None
        for p in possible_paths:
            if p.exists():
                fii_file = p
                break
        
        if fii_file:
            df = pd.read_csv(fii_file)
            date_col = 'trade_date' if 'trade_date' in df.columns else 'date'
            df[date_col] = pd.to_datetime(df[date_col])
            df = df.sort_values(date_col)
            recent = df.tail(10)
            latest = recent.iloc[-1]
            
            fii_dii_summary = f"""
=== FII/DII FLOWS (REAL DATA) ===
Latest Date: {latest[date_col].strftime('%Y-%m-%d')}
Today's FII Net: ₹{latest.get('fii_net', 0):,.0f} Cr
Today's DII Net: ₹{latest.get('dii_net', 0):,.0f} Cr
5-Day FII Rolling Avg: ₹{latest.get('fii_roll5', 0):,.0f} Cr
5-Day DII Rolling Avg: ₹{latest.get('dii_roll5', 0):,.0f} Cr
Market Regime: {latest.get('regime', 'Unknown')}
Flow Signal: {latest.get('flow_signal', 'Unknown')}
Nifty Close: {latest.get('nifty_close', 'N/A')}

10-Day Summary:
- Total FII Net: ₹{recent['fii_net'].sum():,.0f} Cr
- Total DII Net: ₹{recent['dii_net'].sum():,.0f} Cr
- FII Buying Days: {len(recent[recent['fii_net'] > 0])}/10
- DII Buying Days: {len(recent[recent['dii_net'] > 0])}/10
"""
    except Exception as e:
        print(f"Error loading FII/DII: {e}")
    
    # Load insider activity summary
    insider_summary = "No insider data available"
    try:
        trades_file = BASE_DIR / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv"
        if trades_file.exists():
            df = pd.read_csv(trades_file)
            df['transactionDate'] = pd.to_datetime(df['transactionDate'])
            from datetime import timedelta
            cutoff = datetime.now() - timedelta(days=7)
            recent = df[df['transactionDate'] >= cutoff]
            
            bullish = len(recent[recent['is_bullish'] == 1])
            bearish = len(recent[recent['is_bearish'] == 1])
            total_buy_value = recent[recent['is_bullish'] == 1]['transactionValue'].sum()
            total_sell_value = recent[recent['is_bearish'] == 1]['transactionValue'].sum()
            
            insider_summary = f"""
=== INSIDER ACTIVITY (REAL DATA - Last 7 days) ===
Bullish Transactions (Open Market Buys): {bullish}
Bearish Transactions (Open Market Sells): {bearish}
Total Buy Value: ${total_buy_value:,.0f}
Total Sell Value: ${total_sell_value:,.0f}
Net Sentiment: {'BULLISH' if bullish > bearish else 'BEARISH' if bearish > bullish else 'NEUTRAL'}
Unique Companies with Activity: {recent['issuerTradingSymbol'].nunique()}
"""
    except Exception as e:
        print(f"Error loading insider data: {e}")

    prompt = f"""You are a macro strategist analyzing Indian equity markets. Based on the following data, provide a market outlook:

SMART MONEY FLOWS:
{fii_dii_summary}

INSIDER ACTIVITY:
{insider_summary}

Please provide:
1. **Market Regime Assessment** - Current market phase (risk-on/risk-off)
2. **FII/DII Flow Analysis** - What institutional flows indicate
3. **Insider Sentiment** - Corporate insider conviction levels
4. **Sector Recommendations** - Which sectors to favor/avoid
5. **Near-term Outlook** - 1-4 week view with key levels to watch

Be specific about Nifty/market levels and actionable."""

    messages = [
        {"role": "system", "content": "You are a senior macro strategist with expertise in Indian equity markets. Focus on actionable insights based on institutional flows."},
        {"role": "user", "content": prompt}
    ]
    
    analysis = await call_groq(messages, max_tokens=1500)
    
    return {
        "analysis": analysis,
        "generated_at": datetime.now().isoformat(),
        "data_sources": ["fii_dii_flows", "insider_signals"]
    }

@router.get("/hedge-fund-analysis/{cik}")
async def analyze_hedge_fund(cik: str):
    """
    AI analysis of a hedge fund's portfolio and recent moves
    """
    from . import hedge_fund_tracker
    
    try:
        portfolio = await hedge_fund_tracker.get_fund_portfolio(cik)
    except:
        raise HTTPException(status_code=404, detail="Fund not found")
    
    # Build summary of holdings
    holdings_summary = "\n".join([
        f"- {h['issuer']}: ${h['value']:,.0f} ({h['pct_portfolio']:.1f}%) - {h['change_type']}"
        for h in portfolio.get('holdings', [])[:15]
    ])
    
    prompt = f"""Analyze the portfolio of {portfolio.get('fund_name', 'Unknown Fund')} managed by {portfolio.get('manager', 'Unknown')}:

FUND INFO:
- Investment Style: {portfolio.get('style', 'Unknown')}
- Total AUM: ${portfolio.get('total_value', 0):,.0f}
- Positions: {portfolio.get('position_count', 0)}
- Filing Date: {portfolio.get('filing_date', 'Unknown')}

RECENT ACTIVITY:
- New Positions: {portfolio.get('summary', {}).get('new', 0)}
- Increased: {portfolio.get('summary', {}).get('increased', 0)}
- Decreased: {portfolio.get('summary', {}).get('decreased', 0)}

TOP HOLDINGS:
{holdings_summary}

Please provide:
1. **Portfolio Strategy Assessment** - What themes/sectors are they betting on?
2. **Recent Move Analysis** - What do their changes indicate?
3. **Conviction Positions** - Which holdings show highest conviction?
4. **Notable Changes** - Any significant new positions or exits?
5. **Follow-the-Money Ideas** - 2-3 interesting ideas from their portfolio

Focus on actionable insights retail investors can use."""

    messages = [
        {"role": "system", "content": "You are an expert in analyzing institutional portfolios and extracting actionable investment ideas."},
        {"role": "user", "content": prompt}
    ]
    
    analysis = await call_groq(messages, max_tokens=1500)
    
    return {
        "cik": cik,
        "fund_name": portfolio.get('fund_name'),
        "analysis": analysis,
        "generated_at": datetime.now().isoformat()
    }

@router.get("/ask")
async def ask_finsight(question: str = Query(..., description="Question to ask FinSight AI")):
    """
    Natural language Q&A about the market and stocks - Uses REAL data from our databases
    """
    from pathlib import Path
    import pandas as pd
    from datetime import timedelta
    
    BASE_DIR = Path(__file__).parent.parent
    question_lower = question.lower()
    
    # Context data to include based on question
    context_data = ""
    
    # Check if question is about FII/DII
    if any(keyword in question_lower for keyword in ['fii', 'dii', 'foreign', 'domestic', 'institutional', 'flow', 'sentiment', 'india', 'nifty', 'market']):
        try:
            # Try multiple possible paths
            possible_paths = [
                BASE_DIR / "Smart Money Flow" / "fii_dii_output" / "fii_dii_nifty_joint_signals.csv",
                Path("/opt/render/project/src/Smart Money Flow/fii_dii_output/fii_dii_nifty_joint_signals.csv"),
                BASE_DIR.parent / "Smart Money Flow" / "fii_dii_output" / "fii_dii_nifty_joint_signals.csv",
            ]
            
            fii_file = None
            for p in possible_paths:
                if p.exists():
                    fii_file = p
                    break
            
            if fii_file:
                df = pd.read_csv(fii_file)
                # Handle both 'date' and 'trade_date' column names
                date_col = 'trade_date' if 'trade_date' in df.columns else 'date'
                df[date_col] = pd.to_datetime(df[date_col])
                recent = df.sort_values(date_col).tail(10)
                latest = recent.tail(1).iloc[0]
                
                context_data += f"""
=== FII/DII DATA (REAL DATA FROM DATABASE) ===
Latest Date: {latest[date_col].strftime('%Y-%m-%d')}
Today's FII Net: ₹{latest.get('fii_net', 0):,.0f} Cr
Today's DII Net: ₹{latest.get('dii_net', 0):,.0f} Cr
5-Day FII Average: ₹{latest.get('fii_roll5', 0):,.0f} Cr
5-Day DII Average: ₹{latest.get('dii_roll5', 0):,.0f} Cr
Market Regime: {latest.get('regime', 'Unknown')}
Flow Signal: {latest.get('flow_signal', 'Unknown')}
Nifty Close: {latest.get('nifty_close', 'N/A')}

Last 10 Days Summary:
- Total FII Net: ₹{recent['fii_net'].sum():,.0f} Cr
- Total DII Net: ₹{recent['dii_net'].sum():,.0f} Cr
- FII Buying Days: {len(recent[recent['fii_net'] > 0])}/10
- DII Buying Days: {len(recent[recent['dii_net'] > 0])}/10

INTERPRETATION:
- FII Sentiment: {'BULLISH (Buying)' if latest.get('fii_net', 0) > 0 else 'BEARISH (Selling)'}
- DII Sentiment: {'BULLISH (Buying)' if latest.get('dii_net', 0) > 0 else 'BEARISH (Selling)'}
- Overall Flow: {latest.get('flow_signal', 'Unknown').replace('_', ' ').title()}
"""
            else:
                context_data += "FII/DII data file not found on server.\n"
        except Exception as e:
            context_data += f"FII/DII data error: {e}\n"
    
    # Check if question is about insider trading
    if any(keyword in question_lower for keyword in ['insider', 'form 4', 'buy', 'sell', 'ceo', 'cfo', 'director']):
        try:
            trades_file = BASE_DIR / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv"
            if trades_file.exists():
                df = pd.read_csv(trades_file)
                df['transactionDate'] = pd.to_datetime(df['transactionDate'])
                cutoff = datetime.now() - timedelta(days=30)
                recent = df[df['transactionDate'] >= cutoff]
                
                buys = recent[recent['is_bullish'] == 1]
                sells = recent[recent['is_bearish'] == 1]
                
                # Top buys
                top_buys = buys.nlargest(5, 'transactionValue')[['issuerTradingSymbol', 'reportingOwnerName', 'transactionValue', 'transactionDate']]
                
                context_data += f"""
=== INSIDER TRADING DATA (REAL DATA FROM SEC FORM 4) ===
Period: Last 30 Days
Total Transactions: {len(recent)}
Bullish Transactions (Open Market Buys): {len(buys)}
Bearish Transactions (Open Market Sells): {len(sells)}
Total Buy Value: ${buys['transactionValue'].sum():,.0f}
Total Sell Value: ${sells['transactionValue'].sum():,.0f}
Unique Companies with Insider Activity: {recent['issuerTradingSymbol'].nunique()}

Top 5 Insider Buys (Last 30 Days):
"""
                for _, row in top_buys.iterrows():
                    context_data += f"- {row['issuerTradingSymbol']}: {row['reportingOwnerName']} bought ${row['transactionValue']:,.0f}\n"
        except Exception as e:
            context_data += f"Insider data error: {e}\n"
    
    # Check if question is about hedge funds
    if any(keyword in question_lower for keyword in ['hedge fund', '13f', 'berkshire', 'buffett', 'citadel', 'bridgewater', 'institutional', 'renaissance', 'simons', 'griffin', 'dalio', 'holding', 'portfolio', 'position']):
        try:
            holdings_file = BASE_DIR / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv"
            if holdings_file.exists():
                df = pd.read_csv(holdings_file)
                df['filingDate'] = pd.to_datetime(df['filingDate'])
                df['filer_cik'] = df['filer_cik'].astype(str)
                latest_date = df['filingDate'].max()
                
                # CIK to Fund Name mapping
                FUND_NAMES = {
                    "886982": "Citadel Advisors (Ken Griffin)",
                    "1067983": "Berkshire Hathaway (Warren Buffett)",
                    "1103804": "Renaissance Technologies (Jim Simons)",
                    "1166559": "Bridgewater Associates (Ray Dalio)",
                }
                
                context_data += f"""
=== 13F HEDGE FUND HOLDINGS (REAL DATA FROM SEC 13F FILINGS) ===
Latest Filing Date: {latest_date.strftime('%Y-%m-%d')}
Funds Tracked: {', '.join(FUND_NAMES.values())}

"""
                # Check if asking about specific fund
                for cik, fund_name in FUND_NAMES.items():
                    fund_keywords = fund_name.lower().split()
                    if any(kw in question_lower for kw in fund_keywords) or cik in question_lower:
                        # Get this fund's holdings
                        fund_df = df[(df['filer_cik'] == cik) & (df['filingDate'] == latest_date)]
                        fund_df = fund_df.sort_values('positionValueUSD', ascending=False)
                        
                        total_value = fund_df['positionValueUSD'].sum() / 1000  # Convert from *1000
                        
                        context_data += f"""
--- {fund_name} PORTFOLIO ---
Total Portfolio Value: ${total_value:,.0f}
Total Positions: {len(fund_df)}

TOP 15 HOLDINGS (by value):
"""
                        for i, (_, row) in enumerate(fund_df.head(15).iterrows(), 1):
                            value = row['positionValueUSD'] / 1000
                            pct = (value / total_value * 100) if total_value > 0 else 0
                            context_data += f"{i}. {row['nameOfIssuer']}: ${value:,.0f} ({pct:.1f}% of portfolio) - {row.get('positionChangeType', 'N/A')}\n"
                        
                        # Recent changes
                        new_positions = fund_df[fund_df['positionChangeType'] == 'new']
                        increased = fund_df[fund_df['positionChangeType'] == 'increase']
                        decreased = fund_df[fund_df['positionChangeType'] == 'decrease']
                        
                        context_data += f"""
RECENT ACTIVITY:
- New Positions: {len(new_positions)}
- Increased Positions: {len(increased)}
- Decreased Positions: {len(decreased)}
"""
                        break
                else:
                    # No specific fund mentioned, show all funds
                    for cik, fund_name in FUND_NAMES.items():
                        fund_df = df[(df['filer_cik'] == cik) & (df['filingDate'] == latest_date)]
                        if fund_df.empty:
                            continue
                        fund_df = fund_df.sort_values('positionValueUSD', ascending=False)
                        total_value = fund_df['positionValueUSD'].sum() / 1000
                        top_holding = fund_df.head(1)
                        
                        if not top_holding.empty:
                            top_name = top_holding['nameOfIssuer'].iloc[0]
                            top_value = top_holding['positionValueUSD'].iloc[0] / 1000
                            context_data += f"""
{fund_name}:
- Total Value: ${total_value:,.0f}
- Positions: {len(fund_df)}
- Largest Holding: {top_name} (${top_value:,.0f})
"""
        except Exception as e:
            context_data += f"13F data error: {e}\n"
    
    # Always load comprehensive data context
    if not context_data or len(context_data) < 100:
        # Load screener data for stock recommendations
        try:
            screener_file = BASE_DIR / "data" / "screener.csv"
            if screener_file.exists():
                screener_df = pd.read_csv(screener_file)
                top_performers = screener_df.nlargest(10, 'ret_1m')[['ticker', 'company_name', 'current_price', 'ret_1m', 'ret_1w', 'pe_trailing', 'market_cap']] if 'ret_1m' in screener_df.columns else pd.DataFrame()
                
                context_data += f"""
=== STOCK SCREENER DATA (900+ stocks tracked) ===
Total Stocks in Database: {len(screener_df)}

TOP 10 PERFORMERS (Last Month):
"""
                for _, row in top_performers.head(10).iterrows():
                    context_data += f"- {row.get('ticker', 'N/A')}: {row.get('ret_1m', 0):.1f}% monthly return, PE: {row.get('pe_trailing', 'N/A')}\n"
        except Exception as e:
            print(f"Screener data error: {e}")
        
        # Load insider trades summary
        try:
            trades_file = BASE_DIR / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv"
            if trades_file.exists():
                trades_df = pd.read_csv(trades_file)
                trades_df['transactionDate'] = pd.to_datetime(trades_df['transactionDate'])
                recent_trades = trades_df[trades_df['transactionDate'] >= datetime.now() - timedelta(days=30)]
                
                top_buys = recent_trades[recent_trades['is_bullish'] == 1].nlargest(5, 'transactionValue')[['issuerTradingSymbol', 'reportingOwnerName', 'transactionValue']]
                
                context_data += f"""
=== INSIDER TRADING (SEC Form 4 - Last 30 Days) ===
Total Recent Trades: {len(recent_trades)}
Bullish Trades: {len(recent_trades[recent_trades['is_bullish'] == 1])}
Bearish Trades: {len(recent_trades[recent_trades['is_bearish'] == 1])}

TOP INSIDER BUYS:
"""
                for _, row in top_buys.iterrows():
                    context_data += f"- {row['issuerTradingSymbol']}: {row['reportingOwnerName']} bought ${row['transactionValue']:,.0f}\n"
        except Exception as e:
            print(f"Insider trades error: {e}")
        
        # Load 13F summary
        try:
            holdings_file = BASE_DIR / "InsiderFlow" / "signals_output" / "13f_holdings_with_flags.csv"
            if holdings_file.exists():
                holdings_df = pd.read_csv(holdings_file)
                holdings_df['filer_cik'] = holdings_df['filer_cik'].astype(str)
                
                FUND_NAMES = {
                    "886982": "Citadel (Ken Griffin)",
                    "1067983": "Berkshire (Warren Buffett)",
                    "1103804": "Renaissance (Jim Simons)",
                    "1166559": "Bridgewater (Ray Dalio)",
                }
                
                context_data += f"""
=== 13F HEDGE FUND HOLDINGS ===
Funds Tracked: {', '.join(FUND_NAMES.values())}
Total Positions: {len(holdings_df)}
"""
                # Show top holdings per fund
                for cik, name in list(FUND_NAMES.items())[:2]:
                    fund_df = holdings_df[holdings_df['filer_cik'] == cik]
                    if not fund_df.empty:
                        top = fund_df.nlargest(3, 'positionValueUSD')
                        context_data += f"\n{name} Top Holdings:\n"
                        for _, row in top.iterrows():
                            context_data += f"- {row['nameOfIssuer']}: ${row['positionValueUSD']/1000:,.0f}\n"
        except Exception as e:
            print(f"13F data error: {e}")
    
    # Build a helpful and friendly prompt
    system_prompt = """You are FinSight AI - a friendly, knowledgeable financial assistant. You can:

1. **Answer General Questions** - Chat naturally about any topic, explain concepts, give advice
2. **Financial Analysis** - Use the real-time data provided to answer market questions
3. **Investment Education** - Explain stocks, options, ETFs, mutual funds, technical analysis, etc.
4. **Market Commentary** - Discuss trends, news, and market conditions

GUIDELINES:
- Be conversational and helpful, like talking to a smart financial friend
- When you have data, use exact numbers from it
- When asked about topics outside finance, still be helpful
- Explain concepts clearly without being condescending
- For data questions without matching data, say what data IS available
- Be concise but thorough"""

    # Build the user message with context
    if context_data and len(context_data) > 50:
        user_message = f"""Here is real-time data from our database:

{context_data}

User Question: {question}

If this question relates to the data above, use those exact numbers. Otherwise, answer normally."""
    else:
        user_message = f"""User Question: {question}

(No specific data loaded for this query - answer based on general knowledge or ask if they want specific data like FII/DII flows, insider trades, or hedge fund holdings)"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    
    response = await call_groq(messages, max_tokens=1000)
    
    return {
        "question": question,
        "answer": response,
        "generated_at": datetime.now().isoformat(),
        "data_sources": ["fii_dii_flows", "insider_trades", "13f_holdings"] if context_data else []
    }

@router.get("/portfolio-analysis")
async def analyze_portfolio(tickers: str = Query(..., description="Comma-separated list of tickers")):
    """
    AI-powered portfolio analysis
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    
    if len(ticker_list) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tickers allowed")
    
    prompt = f"""Analyze this portfolio of {len(ticker_list)} stocks: {', '.join(ticker_list)}

Please provide:
1. **Portfolio Overview** - What type of portfolio is this? (Growth/Value/Balanced/etc.)
2. **Sector Exposure** - Are there any concentration risks?
3. **Correlation Analysis** - How correlated are these holdings likely to be?
4. **Risk Assessment** - What are the main risks?
5. **Optimization Suggestions** - 2-3 ideas to improve diversification
6. **Missing Exposures** - What's NOT in the portfolio that should be considered?

Be specific and actionable."""

    messages = [
        {"role": "system", "content": "You are an expert portfolio manager providing analysis and optimization suggestions."},
        {"role": "user", "content": prompt}
    ]
    
    analysis = await call_groq(messages, max_tokens=1500)
    
    return {
        "tickers": ticker_list,
        "analysis": analysis,
        "generated_at": datetime.now().isoformat()
    }


# Helper functions
async def get_insider_summary_for_ai(ticker: str) -> str:
    """Get insider activity summary for AI prompt"""
    from pathlib import Path
    import pandas as pd
    from datetime import timedelta
    
    BASE_DIR = Path(__file__).parent.parent
    trades_file = BASE_DIR / "InsiderFlow" / "signals_output" / "insider_trades_with_flags.csv"
    
    if not trades_file.exists():
        return "No insider data available"
    
    df = pd.read_csv(trades_file)
    df['transactionDate'] = pd.to_datetime(df['transactionDate'])
    
    cutoff = datetime.now() - timedelta(days=90)
    ticker_df = df[(df['issuerTradingSymbol'] == ticker.upper()) & (df['transactionDate'] >= cutoff)]
    
    if ticker_df.empty:
        return f"No insider transactions for {ticker} in the last 90 days"
    
    buys = ticker_df[ticker_df['is_bullish'] == 1]
    sells = ticker_df[ticker_df['is_bearish'] == 1]
    
    return f"""
Ticker: {ticker}
Period: Last 90 days
Total Transactions: {len(ticker_df)}
Open Market Buys: {len(buys)} worth ${buys['transactionValue'].sum():,.0f}
Open Market Sells: {len(sells)} worth ${sells['transactionValue'].sum():,.0f}
Unique Insiders: {ticker_df['reportingOwnerName'].nunique()}
Net Sentiment: {'Bullish' if len(buys) > len(sells) else 'Bearish' if len(sells) > len(buys) else 'Neutral'}
"""

async def get_fund_summary_for_ai(ticker: str) -> str:
    """Get institutional holdings summary for AI prompt"""
    # Note: This would need CUSIP mapping to be fully accurate
    return f"Institutional data for {ticker} - check 13F filings for detailed holdings"

