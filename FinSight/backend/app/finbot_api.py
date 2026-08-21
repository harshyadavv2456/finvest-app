"""
FinBot API - AI-Powered Recommendation Memory Query Engine
Uses Groq LLaMA for natural language understanding with platform data context.

FinBot ONLY answers questions about:
- Recommendations (INITIATE/HOLD/AVOID)
- What changed between dates
- Stance for specific stocks
- Why the system recommends something

FinBot NEVER provides:
- Trading advice
- Portfolio management
- Best stocks to buy
- Predictions
"""

import os
import json
import httpx
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/finbot", tags=["FinBot"])

# Groq Configuration - Use llama models only
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq deprecated the llama-3.x family (2026-08-21) - see FinSight/IMPLEMENTATION_NOTES.md
GROQ_MODEL = "openai/gpt-oss-20b"

# Path to intelligence data - works on both local and Render
# Local: FinSight/backend/app/ -> FinSight/public/intelligence
# Render: FinSight/backend/app/ -> FinSight/public/intelligence
_app_dir = Path(__file__).parent  # app/
_backend_dir = _app_dir.parent    # backend/
_finsight_dir = _backend_dir.parent  # FinSight/
INTELLIGENCE_DIR = _finsight_dir / "public" / "intelligence"

# Log the path for debugging
logger.info(f"Intelligence directory: {INTELLIGENCE_DIR}")


class ChatRequest(BaseModel):
    message: str
    market: str = "US"
    history: Optional[List[Dict[str, str]]] = None


class ChatResponse(BaseModel):
    response: str
    sources: List[str] = []
    intent_detected: str = "GENERAL"


def load_intelligence_data(market: str = "US", symbol: Optional[str] = None) -> Dict[str, Any]:
    """Load intelligence data for context."""
    data = {
        "stocks": [],
        "summary": {},
        "timestamp": datetime.now().isoformat()
    }
    
    intel_dir = INTELLIGENCE_DIR / market
    if not intel_dir.exists():
        logger.warning(f"Intelligence directory not found: {intel_dir}")
        return data
    
    try:
        # Load specific stock if requested
        if symbol:
            symbol_file = intel_dir / f"{symbol}.json"
            if symbol_file.exists():
                with open(symbol_file) as f:
                    stock_data = json.load(f)
                    data["stocks"].append(stock_data)
        else:
            # Load sample stocks for context (first 20)
            files = list(intel_dir.glob("*.json"))[:20]
            for f in files:
                try:
                    with open(f) as fp:
                        stock_data = json.load(fp)
                        data["stocks"].append({
                            "ticker": stock_data.get("ticker"),
                            "intent": stock_data.get("intent"),
                            "conviction": stock_data.get("conviction"),
                            "as_of_date": stock_data.get("as_of_date"),
                            "rationale": stock_data.get("rationale", "")[:200]
                        })
                except:
                    continue
        
        # Count intents
        intents = {}
        for s in data["stocks"]:
            intent = s.get("intent", "UNKNOWN")
            intents[intent] = intents.get(intent, 0) + 1
        data["summary"] = intents
        
    except Exception as e:
        logger.error(f"Error loading intelligence: {e}")
    
    return data


def get_stock_intelligence(market: str, symbol: str) -> Optional[Dict]:
    """Get specific stock intelligence."""
    intel_file = INTELLIGENCE_DIR / market / f"{symbol}.json"
    if not intel_file.exists():
        # Try uppercase
        intel_file = INTELLIGENCE_DIR / market / f"{symbol.upper()}.json"
    if not intel_file.exists():
        return None
    
    try:
        with open(intel_file) as f:
            return json.load(f)
    except:
        return None


def build_system_prompt(context_data: Dict) -> str:
    """Build system prompt with platform context."""
    
    # Build stock summary
    stock_summary = ""
    for s in context_data.get("stocks", [])[:10]:
        stock_summary += f"- {s.get('ticker')}: {s.get('intent')} ({s.get('conviction', 0)*100:.0f}% conviction)\n"
    
    intent_counts = context_data.get("summary", {})
    
    return f"""You are FinBot, the recommendation memory assistant for FinVest.

CRITICAL RULES (NEVER BREAK):
1. You ONLY answer questions about FinVest's recommendation memory
2. You NEVER provide trading advice, best stocks, or opportunities
3. You NEVER predict prices or suggest what to buy
4. You ALWAYS cite specific data from the platform
5. If asked for trading advice, politely refuse and explain your role

YOUR ROLE:
- Explain past and current recommendations (INITIATE/HOLD/AVOID)
- Show what changed between dates
- Explain WHY the system recommends something
- Help users understand conviction levels and risk

CURRENT PLATFORM DATA ({datetime.now().strftime('%Y-%m-%d')}):
Intent Summary: {json.dumps(intent_counts)}
Sample Stocks:
{stock_summary}

RESPONSE STYLE:
- Be concise and data-driven
- Always reference specific metrics when available
- Use markdown for formatting
- If you don't have data, say so honestly

If user asks "what are the best stocks" or "what should I buy":
Respond: "I don't provide trading recommendations. I only explain the system's analysis. Would you like me to explain the stance on a specific stock?"
"""


async def call_groq(messages: List[Dict], temperature: float = 0.3) -> str:
    """Call Groq API with llama model."""
    
    # API keys from environment (supports comma-separated GROQ_API_KEYS)
    _extra = os.environ.get("GROQ_API_KEYS", "")
    api_keys = [k.strip() for k in [GROQ_API_KEY] + _extra.split(",") if k.strip()]
    
    # Models to try in order
    # gpt-oss family only - see ai_engine.py's call_groq for why qwen was tried and dropped
    models_to_try = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
    
    for model in models_to_try:
        for api_key in api_keys:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": 1500,
                "temperature": temperature
            }
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:  # Increased timeout
                    response = await client.post(GROQ_API_URL, json=payload, headers=headers)
                    
                    if response.status_code == 200:
                        result = response.json()
                        return result["choices"][0]["message"]["content"]
                    elif response.status_code == 429:
                        logger.warning(f"Rate limited on {model}, trying next key...")
                        await asyncio.sleep(0.5)
                        continue
                    elif response.status_code == 400:
                        logger.warning(f"Model {model} error, trying next...")
                        break  # Try next model
                    else:
                        logger.error(f"Groq API error: {response.status_code}")
                        continue
                        
            except httpx.TimeoutException:
                logger.warning(f"Timeout on {model}, trying next...")
                continue
            except Exception as e:
                logger.error(f"Groq API exception: {e}")
                continue
    
    # All attempts failed - return a helpful response without AI
    return "I'm having trouble connecting to AI services. In the meantime, you can check the Simulator page for current recommendations or the Intelligence page for detailed stock analysis."


def extract_symbol_from_message(message: str) -> Optional[str]:
    """Extract stock symbol from user message."""
    import re
    
    # Common patterns
    patterns = [
        r'\b([A-Z]{1,5})\b',  # Uppercase ticker
        r'for\s+([A-Za-z]{1,5})\b',  # "for AAPL"
        r'about\s+([A-Za-z]{1,5})\b',  # "about TSLA"
        r'on\s+([A-Za-z]{1,5})\b',  # "on MSFT"
    ]
    
    # List of common words to exclude
    exclude = {'THE', 'FOR', 'AND', 'BUT', 'NOT', 'YOU', 'CAN', 'WHY', 'HOW', 'WAS', 'ARE', 'HAS', 'HAD', 'NOW', 'SAY', 'DID', 'DAY'}
    
    for pattern in patterns:
        matches = re.findall(pattern, message.upper())
        for match in matches:
            if match not in exclude and len(match) >= 2:
                return match.upper()
    
    return None


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with FinBot about recommendation memory.
    
    FinBot uses Groq LLaMA to understand natural language and
    answers questions about the platform's recommendations.
    """
    message = request.message.strip()
    market = request.market.upper()
    
    if not message:
        return ChatResponse(
            response="Please ask a question about recommendations.",
            intent_detected="EMPTY"
        )
    
    # Extract symbol if mentioned
    symbol = extract_symbol_from_message(message)
    
    # Load context data
    context_data = load_intelligence_data(market, symbol)
    
    # If specific symbol asked, add detailed data
    stock_detail = ""
    sources = []
    if symbol:
        intel = get_stock_intelligence(market, symbol)
        if not intel:
            # Try the other market
            other_market = "IN" if market == "US" else "US"
            intel = get_stock_intelligence(other_market, symbol)
            if intel:
                market = other_market
        
        if intel:
            stock_detail = f"""
DETAILED DATA FOR {symbol}:
- Current Stance: {intel.get('intent', 'UNKNOWN')}
- Conviction: {intel.get('conviction', 0)*100:.1f}%
- Confidence: {intel.get('confidence', 0)*100:.1f}%
- Regime: {intel.get('asset_regime', 'unknown')}
- Expected Return (30d): {intel.get('return_p50', 0)*100:.1f}%
- Risk (CVaR 95): {intel.get('cvar_95', 0)*100:.1f}%
- Volatility: {intel.get('volatility_20d', 0)*100:.1f}%
- Analysis Date: {intel.get('as_of_date', 'unknown')}
- Rationale: {intel.get('rationale', 'N/A')}
- Explanation: {intel.get('explanation', 'N/A')}
- Supporting Signals: {', '.join(intel.get('supporting_signals', []))}
- Opposing Signals: {', '.join(intel.get('opposing_signals', []))}
- Upgrade Conditions: {intel.get('upgrade_conditions', [])}
- Downgrade Conditions: {intel.get('downgrade_conditions', [])}
- Risk Factors: {intel.get('risk_factors', [])}
"""
            sources.append(f"{market}/{symbol}")
    
    # Build messages for Groq
    system_prompt = build_system_prompt(context_data)
    if stock_detail:
        system_prompt += f"\n{stock_detail}"
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    # Add history if provided
    if request.history:
        for h in request.history[-4:]:  # Last 4 messages only
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    
    messages.append({"role": "user", "content": message})
    
    # Call Groq
    response = await call_groq(messages)
    
    # Detect intent for logging
    intent = "GENERAL"
    lower = message.lower()
    if symbol:
        intent = "STOCK_LOOKUP"
    elif "change" in lower or "yesterday" in lower:
        intent = "CHANGE_QUERY"
    elif "why" in lower or "explain" in lower:
        intent = "EXPLANATION"
    elif "best" in lower or "buy" in lower or "recommend" in lower:
        intent = "TRADING_REFUSED"
    
    return ChatResponse(
        response=response,
        sources=sources,
        intent_detected=intent
    )


@router.get("/stock/{symbol}")
async def get_stock_stance(symbol: str, market: str = Query("US")):
    """Get current stance for a specific stock."""
    symbol = symbol.upper()
    intel = get_stock_intelligence(market, symbol)
    
    if not intel:
        # Try other market
        other_market = "IN" if market == "US" else "US"
        intel = get_stock_intelligence(other_market, symbol)
        if intel:
            market = other_market
    
    if not intel:
        raise HTTPException(status_code=404, detail=f"No intelligence found for {symbol}")
    
    return {
        "ticker": symbol,
        "market": market,
        "intent": intel.get("intent"),
        "conviction": intel.get("conviction"),
        "conviction_pct": intel.get("conviction_pct"),
        "confidence": intel.get("confidence"),
        "as_of_date": intel.get("as_of_date"),
        "rationale": intel.get("rationale"),
        "explanation": intel.get("explanation"),
        "expected_return_p50": intel.get("return_p50"),
        "cvar_95": intel.get("cvar_95"),
        "regime": intel.get("asset_regime"),
        "supporting_signals": intel.get("supporting_signals", []),
        "opposing_signals": intel.get("opposing_signals", [])
    }


@router.get("/summary")
async def get_recommendation_summary(market: str = Query("US")):
    """Get summary of all recommendations."""
    intel_dir = INTELLIGENCE_DIR / market
    
    if not intel_dir.exists():
        raise HTTPException(status_code=404, detail=f"No intelligence data for market {market}")
    
    summary = {
        "INITIATE": [],
        "HOLD": [],
        "AVOID": [],
        "counts": {"INITIATE": 0, "HOLD": 0, "AVOID": 0},
        "market": market,
        "as_of": datetime.now().isoformat()
    }
    
    try:
        for f in intel_dir.glob("*.json"):
            with open(f) as fp:
                data = json.load(fp)
                intent = data.get("intent", "HOLD")
                ticker = data.get("ticker", f.stem)
                conviction = data.get("conviction", 0)
                
                summary["counts"][intent] = summary["counts"].get(intent, 0) + 1
                
                if intent in ["INITIATE", "AVOID"]:
                    summary[intent].append({
                        "ticker": ticker,
                        "conviction": conviction,
                        "rationale": data.get("rationale", "")[:100]
                    })
        
        # Sort by conviction
        summary["INITIATE"].sort(key=lambda x: x["conviction"], reverse=True)
        summary["AVOID"].sort(key=lambda x: x["conviction"], reverse=True)
        
        # Limit to top 20 each
        summary["INITIATE"] = summary["INITIATE"][:20]
        summary["AVOID"] = summary["AVOID"][:20]
        
    except Exception as e:
        logger.error(f"Error building summary: {e}")
    
    return summary

