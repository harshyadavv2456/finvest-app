"""
Mnemos API - Buy-Side Intelligence from Mnemos 1.0
===================================================
Reads daily analysis JSON files from apps/Mnemos/output/
and serves them to the FinVest frontend with weighted scoring.

Provides:
- Recent signals with confidence scores
- Historical analysis (up to 50 days) with recency-weighted scoring
- Daily summaries and memory data
- Entity profiles and thesis tracking
"""

import json
import logging
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mnemos", tags=["Mnemos"])

PROJECT_ROOT = Path(__file__).parent.parent.parent
MNEMOS_OUTPUT = PROJECT_ROOT.parent / "apps" / "Mnemos" / "output"


def _recency_weight(date_str: str, max_days: int = 50) -> float:
    """Higher weight for recent days, exponential decay."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        days_ago = (datetime.now() - dt).days
        if days_ago < 0:
            days_ago = 0
        if days_ago > max_days:
            return 0.0
        return math.exp(-0.05 * days_ago)
    except Exception:
        return 0.1


def _load_analysis(date_str: str) -> Optional[Dict[str, Any]]:
    fpath = MNEMOS_OUTPUT / f"analysis_{date_str}.json"
    if fpath.exists():
        try:
            return json.loads(fpath.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to read analysis for {date_str}: {e}")
    return None


def _load_all_analysis_dates() -> List[str]:
    """Get all available analysis dates, sorted newest first."""
    if not MNEMOS_OUTPUT.exists():
        return []
    dates = []
    for f in MNEMOS_OUTPUT.glob("analysis_*.json"):
        date_str = f.stem.replace("analysis_", "")
        dates.append(date_str)
    return sorted(dates, reverse=True)


def _load_memory_file(name: str) -> Dict[str, Any]:
    fpath = MNEMOS_OUTPUT / "memory" / name
    if fpath.exists():
        try:
            return json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


@router.get("/signals")
async def get_signals(
    days: int = Query(default=7, ge=1, le=50),
    limit: int = Query(default=50, ge=1, le=200),
):
    """Recent market signals from Mnemos with confidence scores and recency weighting."""
    all_dates = _load_all_analysis_dates()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    signals = []
    for date_str in all_dates:
        if date_str < cutoff:
            break
        analysis = _load_analysis(date_str)
        if not analysis:
            continue

        weight = _recency_weight(date_str)

        for sig in analysis.get("top_market_signals", []):
            conf = sig.get("confidence", {})
            base_score = conf.get("score", 0.5) if isinstance(conf, dict) else 0.5
            signals.append({
                "date": date_str,
                "signal": sig.get("signal", ""),
                "facts": sig.get("facts", []),
                "entities": sig.get("entities_mentioned", []),
                "numbers": sig.get("numbers_mentioned", []),
                "sources": sig.get("sources", []),
                "signal_type": sig.get("signal_type", ""),
                "confidence_score": round(base_score, 3),
                "confidence_level": conf.get("level", "MEDIUM") if isinstance(conf, dict) else "MEDIUM",
                "actionable": conf.get("actionable", False) if isinstance(conf, dict) else False,
                "weighted_score": round(base_score * weight, 3),
                "recency_weight": round(weight, 3),
            })

    signals.sort(key=lambda s: s["weighted_score"], reverse=True)
    return {
        "signals": signals[:limit],
        "total": len(signals),
        "days_lookback": days,
        "dates_available": len(all_dates),
        "status": "ok",
    }


@router.get("/daily/{date_str}")
async def get_daily_analysis(date_str: str):
    """Full analysis for a specific date."""
    analysis = _load_analysis(date_str)
    if not analysis:
        return {"status": "not_found", "date": date_str}

    return {
        "status": "ok",
        "date": date_str,
        "market_snapshot": analysis.get("market_snapshot", {}),
        "top_signals": analysis.get("top_market_signals", []),
        "india_policy": analysis.get("india_markets_policy", []),
        "global_macro": analysis.get("global_macro_geopolitics", []),
        "corporate": analysis.get("sector_corporate", []),
        "data_gaps": analysis.get("data_gaps_risks", []),
        "risk_views": analysis.get("risk_lens_views", {}),
        "intelligence_summary": analysis.get("intelligence_summary", {}),
    }


@router.get("/history")
async def get_analysis_history(
    days: int = Query(default=50, ge=1, le=90),
):
    """Summary of all available daily analyses with weighted importance."""
    all_dates = _load_all_analysis_dates()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    summaries_data = _load_memory_file("daily_summaries.json")
    stored_summaries = summaries_data.get("summaries", {})

    history = []
    for date_str in all_dates:
        if date_str < cutoff:
            break

        weight = _recency_weight(date_str, days)
        stored = stored_summaries.get(date_str, {})

        if stored:
            entry = {
                "date": date_str,
                "recency_weight": round(weight, 3),
                "top_signals_count": stored.get("top_signals_count", 0),
                "india_items_count": stored.get("india_items_count", 0),
                "global_items_count": stored.get("global_items_count", 0),
                "corporate_items_count": stored.get("corporate_items_count", 0),
                "signal_headlines": stored.get("signal_headlines", [])[:5],
                "data_gaps_count": len(stored.get("data_gaps", [])),
            }
        else:
            analysis = _load_analysis(date_str)
            if not analysis:
                continue
            entry = {
                "date": date_str,
                "recency_weight": round(weight, 3),
                "top_signals_count": len(analysis.get("top_market_signals", [])),
                "india_items_count": len(analysis.get("india_markets_policy", [])),
                "global_items_count": len(analysis.get("global_macro_geopolitics", [])),
                "corporate_items_count": len(analysis.get("sector_corporate", [])),
                "signal_headlines": [s.get("signal", "")[:100] for s in analysis.get("top_market_signals", [])[:5]],
                "data_gaps_count": len(analysis.get("data_gaps_risks", [])),
            }
        history.append(entry)

    return {
        "history": history,
        "total_days": len(history),
        "days_requested": days,
        "status": "ok",
    }


@router.get("/entities")
async def get_entity_profiles(
    limit: int = Query(default=30, ge=1, le=100),
):
    """Entity profiles with conviction tracking."""
    profiles_path = MNEMOS_OUTPUT / "intelligence" / "entities" / "entity_profiles.json"
    if not profiles_path.exists():
        return {"entities": [], "status": "no_data"}

    try:
        data = json.loads(profiles_path.read_text(encoding="utf-8"))
        profiles = data.get("companies", data.get("profiles", data)) if isinstance(data, dict) else {}

        entities = []
        for name, profile in profiles.items():
            if not isinstance(profile, dict):
                continue
            signals = profile.get("signals", [])
            mention_count = profile.get("mention_count", len(signals))
            last_seen = profile.get("last_seen") or profile.get("last_signal_date", "")
            conviction = profile.get("conviction") or profile.get("conviction_score", 0)
            categories_raw = profile.get("categories", [])
            if not categories_raw and signals:
                sig_types = set()
                for s in signals:
                    st = s.get("type", "")
                    if st:
                        sig_types.add(st)
                categories_raw = list(sig_types) if sig_types else ["general"]

            entities.append({
                "name": profile.get("name", name),
                "mention_count": mention_count,
                "first_seen": profile.get("first_seen", ""),
                "last_seen": last_seen,
                "sentiment_history": profile.get("sentiment_history", [])[-5:],
                "categories": categories_raw,
                "conviction": conviction,
            })

        entities.sort(key=lambda e: e["mention_count"], reverse=True)
        return {
            "entities": entities[:limit],
            "total": len(entities),
            "status": "ok",
        }
    except Exception as e:
        logger.warning(f"Entity profiles load failed: {e}")
        return {"entities": [], "status": "error", "error": str(e)}


@router.get("/theses")
async def get_active_theses():
    """Active investment theses being tracked by Mnemos."""
    theses_path = MNEMOS_OUTPUT / "intelligence" / "theses" / "theses.json"
    if not theses_path.exists():
        return {"theses": [], "status": "no_data"}

    try:
        data = json.loads(theses_path.read_text(encoding="utf-8"))
        raw_theses = data.get("active", data.get("theses", []))
        if isinstance(raw_theses, dict):
            raw_theses = list(raw_theses.values())

        theses = []
        for t in raw_theses:
            if not isinstance(t, dict):
                continue
            theses.append({
                "title": t.get("thesis") or t.get("title") or t.get("entity", "Unknown"),
                "name": t.get("entity") or t.get("name", ""),
                "description": t.get("signal") or t.get("description") or t.get("summary", ""),
                "type": t.get("type", ""),
                "status": t.get("status", "ACTIVE"),
                "detected_date": t.get("detected_date", ""),
                "catalysts": t.get("catalysts", []),
                "conviction_history": t.get("conviction_history", []),
                "supporting_evidence": t.get("supporting_evidence", []),
            })

        return {
            "theses": theses,
            "total": len(theses),
            "status": "ok",
        }
    except Exception as e:
        return {"theses": [], "status": "error", "error": str(e)}


@router.get("/newsletter/{date_str}")
async def get_newsletter(date_str: str):
    """Get the HTML newsletter for a specific date."""
    html_path = MNEMOS_OUTPUT / f"newsletter_{date_str}.html"
    md_path = MNEMOS_OUTPUT / f"newsletter_{date_str}.md"

    html_content = None
    md_content = None

    if html_path.exists():
        html_content = html_path.read_text(encoding="utf-8")
    if md_path.exists():
        md_content = md_path.read_text(encoding="utf-8")

    if not html_content and not md_content:
        return {"status": "not_found", "date": date_str}

    return {
        "status": "ok",
        "date": date_str,
        "html": html_content,
        "markdown": md_content,
    }


@router.get("/health")
async def mnemos_health():
    """Mnemos 1.0 availability and status check."""
    exists = MNEMOS_OUTPUT.exists()
    all_dates = _load_all_analysis_dates() if exists else []
    latest_date = all_dates[0] if all_dates else None

    memory = _load_memory_file("daily_summaries.json") if exists else {}
    themes = _load_memory_file("themes.json") if exists else {}

    return {
        "status": "available" if exists and all_dates else "unavailable",
        "version": "1.0",
        "output_path": str(MNEMOS_OUTPUT),
        "output_exists": exists,
        "total_analysis_days": len(all_dates),
        "latest_analysis": latest_date,
        "daily_summaries": len(memory.get("summaries", {})),
        "themes_tracked": len(themes.get("themes", themes)) if themes else 0,
    }
