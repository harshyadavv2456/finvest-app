"""
FinDash API - endpoints built for the new India-first FinDash rebuild.

Every endpoint here follows the same discipline the rest of this
session's work does: real data or an honest `available: false`, never
a mocked placeholder. Where a feature genuinely has no data source yet
(the macro catalyst timeline, for one), that's tracked in TODO.md as
not built rather than faked here.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/findash", tags=["FinDash"])


def _get_supabase():
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def _parse_impacted_stocks(raw: Optional[str]) -> List[str]:
    """impacted_stocks is stored as a JSON array string
    (e.g. '["RELIANCE", "TCS"]'), not comma-separated plain text -
    naive .split(',') mangles it into '["RELIANCE"' style fragments.
    insights_api.py's substring `in` matching on this field happens to
    still work against the raw JSON string, which is why this format
    mismatch went unnoticed there; a real ticker-badge list needs
    actual parsing."""
    if not raw:
        return []
    import json as _json
    try:
        parsed = _json.loads(raw)
        if isinstance(parsed, list):
            return [str(t).strip() for t in parsed if str(t).strip()]
    except (ValueError, TypeError):
        pass
    # Fallback for genuinely comma-separated legacy rows, if any exist.
    return [t.strip() for t in raw.split(",") if t.strip()]


# --------------------------------------------------------------- Index quotes

def _index_quotes_sync() -> Dict[str, Any]:
    from app.angelone_provider import get_index_quote

    def yf_fallback(index: str):
        try:
            import yfinance as yf
            sym = "^NSEI" if index == "NIFTY" else "^NSEBANK"
            hist = yf.Ticker(sym).history(period="2d")
            if hist is None or hist.empty:
                return None
            last = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else last
            return {"symbol": index, "ltp": float(last["Close"]), "open": float(prev["Close"]), "close": float(prev["Close"]), "source": "yfinance"}
        except Exception:  # noqa: BLE001
            return None

    out = {}
    for idx in ("NIFTY", "BANKNIFTY"):
        q = get_index_quote(idx, yfinance_fallback=yf_fallback)
        out[idx] = q or {"symbol": idx, "ltp": None, "source": "unavailable"}
    return {"available": any(v.get("ltp") for v in out.values()), "indices": out}


@router.get("/index-quotes")
async def index_quotes():
    """Live NIFTY/BANKNIFTY, AngelOne-first with yfinance fallback -
    the FinDash header's real-time market status line."""
    return await run_in_threadpool(_index_quotes_sync)


# --------------------------------------------------------------- News feed

def _news_feed_sync(sentiment: str, limit: int) -> Dict[str, Any]:
    supabase = _get_supabase()
    if supabase is None:
        return {"available": False, "reason": "Supabase not configured", "articles": []}

    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    q = (
        supabase.table("news_articles")
        .select("title, sentiment, sentiment_score, impact_level, impacted_stocks, fetched_at_utc, url, source")
        .gte("fetched_at_utc", cutoff)
        .order("fetched_at_utc", desc=True)
    )
    if sentiment == "bullish":
        q = q.gt("sentiment_score", 0)
    elif sentiment == "bearish":
        q = q.lt("sentiment_score", 0)
    resp = q.limit(limit).execute()
    rows = resp.data or []

    articles = []
    for r in rows:
        tickers = _parse_impacted_stocks(r.get("impacted_stocks"))[:4]
        score = r.get("sentiment_score")
        tag = "neutral"
        if isinstance(score, (int, float)):
            tag = "bullish" if score > 0 else ("bearish" if score < 0 else "neutral")
        articles.append({
            "title": r.get("title"),
            "source": r.get("source"),
            "url": r.get("url"),
            "fetched_at": r.get("fetched_at_utc"),
            "tickers": tickers,
            "sentiment_tag": tag,
            "sentiment_score": score,
            "impact_level": r.get("impact_level"),
        })
    return {"available": True, "count": len(articles), "articles": articles}


@router.get("/news-feed")
async def news_feed(
    sentiment: str = Query(default="all", pattern="^(all|bullish|bearish)$"),
    limit: int = Query(default=40, ge=1, le=100),
):
    """Real-time news stream with client-filterable sentiment, using the
    sentiment_score the news pipeline already computes - no new scoring."""
    return await run_in_threadpool(_news_feed_sync, sentiment, limit)


# --------------------------------------------------------- Correlation matrix

CORRELATION_UNIVERSE = {
    "NIFTY 50": "^NSEI",
    "Bank Nifty": "^NSEBANK",
    "S&P 500": "^GSPC",
    "Nasdaq": "^IXIC",
    "Gold": "GC=F",
    "Crude Oil": "CL=F",
}


def _correlation_matrix_sync(window_days: int) -> Dict[str, Any]:
    import sys
    from pathlib import Path
    import pandas as pd

    backend_dir = str(Path(__file__).resolve().parent.parent)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from app.data_access import load_daily

    closes: Dict[str, "pd.Series"] = {}
    missing: List[str] = []
    for label, ticker in CORRELATION_UNIVERSE.items():
        df = load_daily(ticker)
        if df is None or df.empty or "Close" not in df.columns:
            # Not in the pipeline's own universe (Bank Nifty index, Gold/
            # Crude futures aren't tracked tickers) - direct yfinance
            # fetch instead of just reporting it missing. Free, no new
            # infra, matches how every other on-demand price lookup in
            # this codebase already falls back to yfinance.
            try:
                import yfinance as yf
                hist = yf.Ticker(ticker).history(period="6mo")
                if hist is not None and not hist.empty and "Close" in hist.columns:
                    closes[label] = hist["Close"].tail(window_days)
                    continue
            except Exception as e:  # noqa: BLE001
                logger.debug("Correlation matrix: yfinance fallback failed for %s: %s", ticker, e)
            missing.append(label)
            continue
        closes[label] = df["Close"].tail(window_days)

    if len(closes) < 2:
        return {"available": False, "reason": "Not enough price series loaded", "missing": missing}

    # Normalize every series to a plain date index before combining -
    # load_daily's UTC-aware index and yfinance's exchange-local-tz
    # index won't align on exact timestamp otherwise, silently NaN-ing
    # out rows that are actually the same trading day.
    for label in list(closes.keys()):
        idx = pd.to_datetime(closes[label].index)
        if idx.tz is not None:
            idx = idx.tz_localize(None)
        closes[label].index = idx.normalize()

    price_df = pd.DataFrame(closes).dropna(how="all")
    returns = price_df.pct_change().dropna(how="all")
    corr = returns.corr(min_periods=max(5, window_days // 4))

    labels = list(corr.columns)
    matrix = [[
        (round(float(corr.iloc[i, j]), 3) if pd.notna(corr.iloc[i, j]) else None)
        for j in range(len(labels))
    ] for i in range(len(labels))]

    return {
        "available": True,
        "window_days": window_days,
        "labels": labels,
        "matrix": matrix,
        "missing": missing,
    }


@router.get("/correlation-matrix")
async def correlation_matrix(window_days: int = Query(default=30, ge=5, le=180)):
    """Rolling correlation between Nifty 50, Bank Nifty, S&P 500, Nasdaq,
    Gold, Crude - computed from the same daily.parquet history every
    other chart on the site already reads, no new data source. Any
    series missing from the local/R2-self-healed universe is reported
    explicitly in `missing`, not silently dropped."""
    return await run_in_threadpool(_correlation_matrix_sync, window_days)


# ----------------------------------------------------------- AI insight feed

def _ai_insight_feed_sync(market: str) -> Dict[str, Any]:
    from app.groq_client import groq_available, groq_chat_completion

    if not groq_available():
        return {"available": False, "reason": "No GROQ_API_KEY(s) configured", "insights": []}

    supabase = _get_supabase()
    news_titles: List[str] = []
    if supabase is not None:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
            resp = (
                supabase.table("news_articles")
                .select("title, sentiment, impacted_stocks")
                .gte("fetched_at_utc", cutoff)
                .order("fetched_at_utc", desc=True)
                .limit(25)
                .execute()
            )
            news_titles = [f"- {r['title']} ({r.get('sentiment', 'neutral')})" for r in (resp.data or [])]
        except Exception as e:  # noqa: BLE001
            logger.debug("AI insight feed: news fetch failed (non-fatal): %s", e)

    macro_summary = None
    try:
        import sys
        from pathlib import Path
        qs_dir = str(Path(__file__).resolve().parent.parent.parent / "quant_system")
        if qs_dir not in sys.path:
            sys.path.insert(0, qs_dir)
        from macro_signals import compute_macro_context
        macro_summary = compute_macro_context().get("summary")
    except Exception as e:  # noqa: BLE001
        logger.debug("AI insight feed: macro fetch failed (non-fatal): %s", e)

    if not news_titles and not macro_summary:
        return {"available": True, "insights": [], "note": "No recent news/macro data to summarize"}

    prompt = (
        f"You are a terse financial analyst producing a scrolling insight feed for a "
        f"{market}-focused trading dashboard. Given the recent headlines and macro "
        f"context below, write 4-6 short insight bullets (each under 20 words, no "
        f"markdown, no numbering, one per line). Focus on what's actionable or "
        f"notable, not a generic summary.\n\n"
        f"Macro context: {macro_summary or 'unavailable'}\n\n"
        f"Recent headlines:\n" + "\n".join(news_titles[:20])
    )

    response = groq_chat_completion(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-oss-120b",
        caller="findash_ai_insight_feed",
        temperature=0.4,
        max_tokens=1200,
        # gpt-oss is a reasoning model - its hidden reasoning tokens count
        # against max_tokens same as visible output. Discovered live: at
        # max_tokens=400 with default reasoning effort, every single call
        # returned finish_reason="length" with EMPTY content - the whole
        # budget got spent on reasoning before any answer text was
        # written. "low" effort + more headroom fixes it (verified: real
        # 4-bullet output, finish_reason="stop").
        reasoning_effort="low",
    )
    if not response:
        return {"available": False, "reason": "Groq call failed on all configured keys", "insights": []}

    text = response.choices[0].message.content or ""
    lines = [l.strip("-• \t") for l in text.splitlines() if l.strip()]
    return {"available": True, "insights": lines[:6], "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/ai-insight-feed")
async def ai_insight_feed(market: str = Query(default="IN")):
    """Short scrolling AI-generated insight feed - text only, built from
    news + macro context already fetched/stored, via the shared
    rotating-key Groq client. Returns available=false (not a 500, not
    fake content) when no key is configured."""
    return await run_in_threadpool(_ai_insight_feed_sync, market)
