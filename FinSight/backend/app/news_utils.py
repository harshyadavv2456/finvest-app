"""News utilities: sentiment analysis and organization."""
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def analyze_sentiment(title: str, summary: str = "") -> Dict[str, Any]:
    """
    Simple sentiment analysis based on keywords.
    Returns: {"sentiment": "positive"|"negative"|"neutral", "score": float}
    """
    text = f"{title} {summary}".lower()
    
    # Positive keywords
    positive_keywords = [
        "surge", "rally", "gain", "jump", "soar", "climb", "rise", "up", "beat", "exceed",
        "growth", "profit", "revenue", "earnings", "success", "win", "deal", "partnership",
        "expansion", "acquisition", "merger", "upgrade", "bullish", "buy", "outperform",
        "strong", "record", "high", "boost", "positive", "optimistic", "approval", "launch"
    ]
    
    # Negative keywords
    negative_keywords = [
        "fall", "drop", "decline", "plunge", "crash", "down", "miss", "loss", "fail",
        "cut", "reduce", "layoff", "bankruptcy", "default", "warning", "downgrade",
        "bearish", "sell", "underperform", "weak", "concern", "risk", "negative",
        "pessimistic", "reject", "delay", "cancel", "investigation", "lawsuit", "fine"
    ]
    
    # Count matches
    positive_count = sum(1 for word in positive_keywords if word in text)
    negative_count = sum(1 for word in negative_keywords if word in text)
    
    # Calculate score (-1 to 1)
    total = positive_count + negative_count
    if total == 0:
        sentiment = "neutral"
        score = 0.0
    elif positive_count > negative_count:
        sentiment = "positive"
        score = min(0.9, 0.5 + (positive_count - negative_count) / max(total, 5))
    elif negative_count > positive_count:
        sentiment = "negative"
        score = max(-0.9, -0.5 - (negative_count - positive_count) / max(total, 5))
    else:
        sentiment = "neutral"
        score = 0.0
    
    return {
        "sentiment": sentiment,
        "score": round(score, 2)
    }


def categorize_news_relevance(news_item: Dict[str, Any], target_ticker: str, 
                              sector: Optional[str] = None, industry: Optional[str] = None) -> str:
    """
    Categorize news by relevance - AGGRESSIVE stock-specific matching:
    - "stock_specific": News directly about the ticker (prioritized)
    - "sector_peer": News about sector/industry or peers
    - "generic": Other news (only if nothing else matches)
    """
    title = (news_item.get("title", "") or "").lower()
    summary = (news_item.get("summary", "") or "").lower()
    text = f"{title} {summary}"
    news_ticker = (news_item.get("ticker", "") or "").upper()
    
    # Priority 1: Exact ticker match
    if news_ticker == target_ticker.upper():
        return "stock_specific"
    
    # Priority 2: Ticker in title/summary (very aggressive)
    ticker_clean = target_ticker.upper().replace(".", "").replace("-", "").replace(" ", "").replace("_", "")
    ticker_base = ticker_clean.split(".")[0] if "." in ticker_clean else ticker_clean
    text_clean = text.replace(".", "").replace("-", "").replace(" ", "").replace("_", "")
    
    # Check for ticker anywhere in text
    if ticker_clean in text_clean or ticker_base in text_clean:
        return "stock_specific"
    
    # Priority 3: Company name match (if available)
    company_name = news_item.get("company_name", "").lower()
    if company_name:
        # Extract company name from ticker if available
        if company_name in text:
            return "stock_specific"
    
    # Priority 4: Check if news is from yfinance/yahoo for this ticker (usually stock-specific)
    source = news_item.get("source", "").lower()
    if "yfinance" in source or "yahoo" in source:
        # If source mentions ticker or is from ticker-specific RSS
        if target_ticker.upper() in source.upper() or ticker_base in source.upper():
            return "stock_specific"
        # If it's from yfinance RSS feed, it's likely stock-specific
        if "rss" in source or "feed" in source:
            return "stock_specific"
    
    # Priority 5: Check link/URL for ticker mention
    link = (news_item.get("link", "") or "").lower()
    if ticker_clean in link or ticker_base in link:
        return "stock_specific"
    
    # Only categorize as sector/peer if NOT stock-specific
    # Check if sector/industry related
    if sector:
        sector_lower = sector.lower()
        if sector_lower in text:
            return "sector_peer"
    
    if industry:
        industry_lower = industry.lower()
        if industry_lower in text:
            return "sector_peer"
    
    # Everything else is generic
    return "generic"


def organize_news_by_relevance(news_list: List[Dict[str, Any]], target_ticker: str,
                               sector: Optional[str] = None, industry: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Organize news by relevance category.
    Returns: {
        "stock_specific": [...],
        "sector_peer": [...],
        "generic": [...]
    }
    """
    organized = {
        "stock_specific": [],
        "sector_peer": [],
        "generic": []
    }
    
    for news_item in news_list:
        # Add sentiment
        sentiment_data = analyze_sentiment(
            news_item.get("title", ""),
            news_item.get("summary", "")
        )
        news_item["sentiment"] = sentiment_data["sentiment"]
        news_item["sentiment_score"] = sentiment_data["score"]
        
        # Categorize
        category = categorize_news_relevance(news_item, target_ticker, sector, industry)
        organized[category].append(news_item)
    
    # Sort each category by timestamp (newest first)
    for category in organized:
        organized[category].sort(
            key=lambda x: x.get("provider_time_utc") or x.get("timestamp") or "",
            reverse=True
        )
    
    return organized

