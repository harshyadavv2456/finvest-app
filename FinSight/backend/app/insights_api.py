"""
Cross-signal Insights API — combines the quant engine's conviction score
with the news-intelligence pipeline's sentiment/impact scoring for the
same ticker, and flags whether they agree or disagree.

Why this exists (not in the original audit, added per instruction to
focus on "insights and actionables"): FinVest has two independent signal
sources computing views on the same tickers - the 9-layer quant engine
(quant_system/, written to intelligence_snapshots) and the news pipeline
(FinVest News, synced to news_articles/daily_digest). Nothing in the
system combined them before this. A quant BUY that recent news sentiment
actively contradicts is a genuinely different, more actionable signal
than either source alone - and the reverse (quant + news agreeing) is a
stronger conviction signal than either alone.

Reads only - never writes. Both source tables are populated by the
existing sync/refresh pipelines; this just joins across them.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/insights", tags=["Insights"])


def _get_supabase():
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def _news_sentiment_for_ticker(supabase, ticker: str, lookback_days: int = 3) -> Dict[str, Any]:
    """Aggregate recent news sentiment/impact for a ticker by matching
    against the impacted_stocks text field (comma/pipe-separated tickers
    as written by the news pipeline's AI analysis step)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
    resp = (
        supabase.table("news_articles")
        .select("title, sentiment, sentiment_score, impact_level, impact_score, impacted_stocks, fetched_at_utc, url")
        .gte("fetched_at_utc", cutoff)
        .ilike("impacted_stocks", f"%{ticker}%")
        .order("fetched_at_utc", desc=True)
        .limit(20)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return {"article_count": 0, "avg_sentiment_score": None, "dominant_sentiment": None, "recent_articles": []}

    scored = [r["sentiment_score"] for r in rows if isinstance(r.get("sentiment_score"), (int, float))]
    avg_sentiment = sum(scored) / len(scored) if scored else None

    sentiments = [r.get("sentiment") for r in rows if r.get("sentiment")]
    dominant = max(set(sentiments), key=sentiments.count) if sentiments else None

    return {
        "article_count": len(rows),
        "avg_sentiment_score": round(avg_sentiment, 3) if avg_sentiment is not None else None,
        "dominant_sentiment": dominant,
        "recent_articles": [
            {"title": r["title"], "sentiment": r.get("sentiment"), "impact_level": r.get("impact_level"), "url": r.get("url")}
            for r in rows[:5]
        ],
    }


def _classify_agreement(quant_intent: str, news_sentiment: Optional[str]) -> Dict[str, Any]:
    """The actual insight: does news sentiment confirm or contradict the
    quant call? Deliberately simple/explainable rules, not another model -
    this is meant to be a transparent flag a user can reason about, not a
    black box on top of two other black boxes."""
    if not news_sentiment:
        return {"agreement": "no_news_signal", "note": "No recent news coverage to compare against."}

    bullish_intents = {"INITIATE", "BUY", "ACCUMULATE"}
    bearish_intents = {"AVOID", "SELL", "REDUCE"}
    positive_sentiments = {"positive", "bullish"}
    negative_sentiments = {"negative", "bearish"}

    news_lower = (news_sentiment or "").lower()
    quant_upper = (quant_intent or "").upper()

    quant_bullish = quant_upper in bullish_intents
    quant_bearish = quant_upper in bearish_intents
    news_positive = news_lower in positive_sentiments
    news_negative = news_lower in negative_sentiments

    if quant_bullish and news_positive:
        return {"agreement": "confirms", "note": "Quant conviction and recent news sentiment both point the same direction - stronger signal than either alone."}
    if quant_bearish and news_negative:
        return {"agreement": "confirms", "note": "Quant caution and recent news sentiment both point the same direction - stronger signal than either alone."}
    if (quant_bullish and news_negative) or (quant_bearish and news_positive):
        return {"agreement": "diverges", "note": "Quant model and recent news sentiment disagree - worth reading the news before acting on the quant call alone."}
    return {"agreement": "neutral", "note": "No strong directional overlap to flag either way."}


@router.get("/{market}/{ticker}")
async def get_cross_signal_insight(market: str, ticker: str):
    """The combined view: quant conviction + recent news sentiment +
    whether they agree. This is the actionable surface, not just two
    numbers side by side."""
    supabase = _get_supabase()
    if supabase is None:
        return {"status": "unavailable", "reason": "Supabase not configured"}

    snap_resp = (
        supabase.table("intelligence_snapshots")
        .select("payload, as_of_date")
        .eq("market", market)
        .eq("ticker", ticker)
        .limit(1)
        .execute()
    )
    if not snap_resp.data:
        return {"status": "no_quant_data", "market": market, "ticker": ticker}

    payload = snap_resp.data[0]["payload"]
    quant_intent = payload.get("intent")
    quant_conviction = payload.get("conviction_pct")

    news = _news_sentiment_for_ticker(supabase, ticker)
    agreement = _classify_agreement(quant_intent, news.get("dominant_sentiment"))

    return {
        "status": "ok",
        "market": market,
        "ticker": ticker,
        "as_of_date": snap_resp.data[0]["as_of_date"],
        "quant": {
            "intent": quant_intent,
            "conviction_pct": quant_conviction,
            "rationale": payload.get("rationale"),
        },
        "news": news,
        "cross_signal": agreement,
    }


@router.get("/divergent")
async def list_divergent_signals(
    market: str = Query(default="US"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Actionable list view: every ticker right now where the quant call
    and recent news sentiment disagree. This is the "worth a second look"
    feed, not a scored ranking - divergence is inherently a flag for human
    judgment, not something to further auto-rank."""
    supabase = _get_supabase()
    if supabase is None:
        return {"status": "unavailable", "reason": "Supabase not configured"}

    snap_resp = (
        supabase.table("intelligence_snapshots")
        .select("ticker, payload")
        .eq("market", market)
        .limit(500)  # bounded scan of the current universe, not unbounded
        .execute()
    )

    divergent: List[Dict[str, Any]] = []
    for row in snap_resp.data or []:
        ticker = row["ticker"]
        payload = row["payload"]
        news = _news_sentiment_for_ticker(supabase, ticker, lookback_days=2)
        if news["article_count"] == 0:
            continue
        agreement = _classify_agreement(payload.get("intent"), news.get("dominant_sentiment"))
        if agreement["agreement"] == "diverges":
            divergent.append({
                "ticker": ticker,
                "quant_intent": payload.get("intent"),
                "conviction_pct": payload.get("conviction_pct"),
                "news_sentiment": news.get("dominant_sentiment"),
                "article_count": news["article_count"],
            })
        if len(divergent) >= limit:
            break

    return {"status": "ok", "market": market, "divergent_count": len(divergent), "signals": divergent}
