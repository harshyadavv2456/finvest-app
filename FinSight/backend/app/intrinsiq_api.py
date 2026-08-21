"""
IntrinsIQ API v4.0 - Institutional-Grade Valuation Engine
==========================================================
Uses in-house data as foundation, enriched with live market data:
  - financials_full.json (fundamentals, balance sheet) - internal
  - history.parquet (price history) - internal
  - intelligence JSON (14-layer quant signals) - internal
  - screener metrics - internal
  - yfinance live data (real-time price, latest ratios) - enrichment

Deterministic valuation methods:
  1. Graham Number
  2. Earnings Power Value (EPV)
  3. Relative Valuation (peer P/E, P/B)
  4. 3-Phase DCF with terminal fade (high → transition → fade → terminal)
  5. Reverse DCF (market-implied growth rate)
  5. Net Asset Value (NAV / Liquidation Value)
  6. Dividend Discount Model (DDM)

Groq LLM used ONLY for narrative interpretation (never for numbers).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import os
import math
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intrinsiq", tags=["IntrinsIQ"])

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INTELLIGENCE_DIR = PROJECT_ROOT / "public" / "intelligence"

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"  # Groq deprecated the llama-3.x family (2026-08-21) - see FinSight/IMPLEMENTATION_NOTES.md
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


# ═══════════════════════════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════

class ValuationMethod(BaseModel):
    name: str
    value: Optional[float] = None
    description: str
    applicable: bool = True

class IntrinsicRange(BaseModel):
    low: float
    base: float
    high: float

class KeyMetrics(BaseModel):
    peRatio: Optional[float] = None
    eps: Optional[float] = None
    revenueGrowth: Optional[float] = None
    beta: Optional[float] = None
    dividendYield: Optional[float] = None
    debtToEquity: Optional[float] = None
    roe: Optional[float] = None
    freeCashflow: Optional[float] = None
    bookValue: Optional[float] = None

class AnalysisResult(BaseModel):
    ticker: str
    companyName: str
    currentPrice: float
    intrinsicValue: float
    intrinsicRange: Optional[IntrinsicRange] = None
    marginOfSafety: float
    recommendation: str
    valuationZone: str = "fair_value"
    valuationConfidence: float = 0.0
    companyType: Optional[str] = None
    summary: str
    detailedReport: str
    keyMetrics: KeyMetrics
    valuationMethodology: str
    valuationMethods: List[ValuationMethod] = []
    regime: Optional[str] = None
    conviction: Optional[float] = None
    reverseDCF: Optional[Dict[str, Any]] = None
    alphaSignals: Optional[Dict[str, Any]] = None
    dataSource: str = "internal"

class GroundingSource(BaseModel):
    title: str
    uri: str

class IntrinsIQResponse(BaseModel):
    analysis: AnalysisResult
    sources: List[GroundingSource]


# ═══════════════════════════════════════════════════════════════════════
# INTERNAL DATA LOADING
# ═══════════════════════════════════════════════════════════════════════

def _find_ticker_dir(ticker: str) -> Optional[Path]:
    """Find data directory for a ticker across all markets.

    Delegates to app.utils.paths.get_ticker_dir, which self-heals from R2
    on a local miss (see REPO_AUDIT_REPORT.md §6/§7). This module used to
    walk DATA_DIR directly with no R2 awareness at all, so on Render -
    where DATA_DIR only ever holds whatever another request happened to
    already cache - IntrinsIQ came back "No data found" for any ticker
    nothing else had touched yet.
    """
    from app.utils.paths import get_ticker_dir
    result = get_ticker_dir(ticker)
    if result:
        return result
    # Fall back to a same-directory case-insensitive scan for whatever is
    # already on local disk (e.g. .NS suffix variants), same as before.
    if DATA_DIR.exists():
        for market_dir in DATA_DIR.iterdir():
            if not market_dir.is_dir():
                continue
            for td in market_dir.iterdir():
                if td.is_dir() and td.name.upper() == ticker.upper():
                    return td
    return None


def _load_fundamentals(ticker_dir: Path) -> Dict[str, Any]:
    fpath = ticker_dir / "financials_full.json"
    if fpath.exists():
        try:
            return json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _load_daily(ticker_dir: Path) -> Optional[pd.DataFrame]:
    hpath = ticker_dir / "history.parquet"
    if hpath.exists():
        try:
            return pd.read_parquet(hpath)
        except Exception:
            pass
    return None


def _load_intelligence(ticker: str, market: str) -> Dict[str, Any]:
    ipath = INTELLIGENCE_DIR / market / f"{ticker}.json"
    if ipath.exists():
        try:
            return json.loads(ipath.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _load_metadata(ticker_dir: Path) -> Dict[str, Any]:
    mpath = ticker_dir / "metadata.json"
    if mpath.exists():
        try:
            return json.loads(mpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _safe(val, default=None):
    if val is None:
        return default
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return default
    return val


# ═══════════════════════════════════════════════════════════════════════
# LIVE DATA ENRICHMENT
# ═══════════════════════════════════════════════════════════════════════

def _enrich_with_live_data(ticker: str, info: Dict[str, Any]) -> Dict[str, Any]:
    """Attempt to enrich internal fundamentals with live yfinance data.
    Falls back silently to internal-only data if unavailable."""
    try:
        import yfinance as yf
        yticker = yf.Ticker(ticker)
        live = yticker.info or {}
        if not live or live.get("regularMarketPrice") is None:
            return info

        enriched = dict(info)
        live_fields = [
            "currentPrice", "regularMarketPrice", "previousClose",
            "trailingPE", "forwardPE", "priceToBook", "trailingEps",
            "bookValue", "returnOnEquity", "debtToEquity",
            "freeCashflow", "operatingCashflow", "totalRevenue",
            "revenueGrowth", "earningsGrowth", "grossMargins",
            "operatingMargins", "profitMargins", "dividendYield",
            "dividendRate", "payoutRatio", "beta",
            "marketCap", "sharesOutstanding", "ebit",
            "totalDebt", "totalCash", "enterpriseValue",
        ]
        for field in live_fields:
            val = live.get(field)
            if val is not None:
                enriched[field] = val

        return enriched
    except Exception as e:
        logger.debug(f"Live enrichment skipped for {ticker}: {e}")
        return info


# ═══════════════════════════════════════════════════════════════════════
# VALUATION METHODS (DETERMINISTIC)
# ═══════════════════════════════════════════════════════════════════════

MNEMOS2_DB = Path(r"D:\Mnemos 2.0\data\mnemos.db")
MNEMOS2_SYNC_DIR = PROJECT_ROOT.parent / "apps" / "Mnemos" / "output" / "mnemos2_sync"

_mnemos2_symbol_cache: Dict[str, Any] = {}
_mnemos2_cache_loaded = False


def _load_mnemos2_symbol_cache():
    """Load the synced symbol_summary.json into a ticker-keyed dict (for deployed env)."""
    global _mnemos2_symbol_cache, _mnemos2_cache_loaded
    if _mnemos2_cache_loaded:
        return
    _mnemos2_cache_loaded = True
    summary_path = MNEMOS2_SYNC_DIR / "symbol_summary.json"
    if not summary_path.exists():
        return
    try:
        data = json.loads(summary_path.read_text(encoding="utf-8"))
        for sym in data.get("symbols", []):
            _mnemos2_symbol_cache[sym["symbol"]] = sym
    except Exception as e:
        logger.debug(f"Mnemos2 sync cache load failed: {e}")


def _load_mnemos2_signals(ticker: str) -> Dict[str, Any]:
    """Load latest signals from Mnemos 2.0. Tries live DB first, falls back to synced JSON."""
    if MNEMOS2_DB.exists():
        try:
            import sqlite3
            conn = sqlite3.connect(str(MNEMOS2_DB))
            c = conn.cursor()
            c.execute(
                "SELECT score, confidence, explanation, signal_type, severity, created_at "
                "FROM signals WHERE symbol=? ORDER BY created_at DESC LIMIT 5",
                (ticker,)
            )
            rows = c.fetchall()
            if not rows:
                conn.close()
                return _load_mnemos2_from_sync(ticker)
            latest = rows[0]
            c.execute(
                "SELECT confidence, friction_score, liquidity_score, volatility_score "
                "FROM confidence_history WHERE symbol=? ORDER BY dt DESC LIMIT 1",
                (ticker,)
            )
            conf_row = c.fetchone()
            c.execute(
                "SELECT return_1d, return_3d, return_5d FROM outcomes "
                "WHERE symbol=? ORDER BY signal_dt DESC LIMIT 1",
                (ticker,)
            )
            outcome_row = c.fetchone()
            conn.close()
            return {
                "score": latest[0],
                "confidence": latest[1],
                "explanation": latest[2],
                "signal_type": latest[3],
                "severity": latest[4],
                "signal_count": len(rows),
                "friction_score": conf_row[1] if conf_row else None,
                "liquidity_score": conf_row[2] if conf_row else None,
                "volatility_score": conf_row[3] if conf_row else None,
                "return_1d": outcome_row[0] if outcome_row else None,
                "return_3d": outcome_row[1] if outcome_row else None,
                "return_5d": outcome_row[2] if outcome_row else None,
            }
        except Exception as e:
            logger.debug(f"Mnemos2 DB load failed for {ticker}: {e}")

    return _load_mnemos2_from_sync(ticker)


def _load_mnemos2_from_sync(ticker: str) -> Dict[str, Any]:
    """Fallback: load from synced JSON files (works on deployed server)."""
    _load_mnemos2_symbol_cache()
    sym_data = _mnemos2_symbol_cache.get(ticker, {})
    if not sym_data:
        return {}
    return {
        "score": sym_data.get("avg_score"),
        "confidence": sym_data.get("avg_conf"),
        "explanation": None,
        "signal_type": None,
        "severity": None,
        "signal_count": sym_data.get("signal_count", 0),
        "last_signal": sym_data.get("last_signal"),
    }


# ═══════════════════════════════════════════════════════════════════════
# COMPANY CLASSIFICATION ENGINE
# ═══════════════════════════════════════════════════════════════════════

def classify_company(revenue_growth, roe, pe, beta, dividend_yield, debt_equity,
                     earnings_growth=None, sector="", ticker="",
                     op_cf=None, capex=None) -> Dict[str, Any]:
    """Classify company and assign valuation parameters.
    Uses growth, PE, ROE, and reinvestment rate together."""
    rg = float(revenue_growth) if revenue_growth else 0.0
    eg = float(earnings_growth) if earnings_growth else 0.0
    effective_growth = max(rg, eg * 0.7)

    roe_v = float(roe) if roe else 0.0
    pe_v = float(pe) if pe else 0.0
    div_y = float(dividend_yield) if dividend_yield else 0.0
    de = float(debt_equity) if debt_equity else 0.0

    is_india = ticker.endswith(".NS") or ticker.endswith(".BO")

    reinvestment_rate = 0.0
    if op_cf and op_cf > 0 and capex:
        reinvestment_rate = abs(capex) / op_cf

    if effective_growth > 0.25 and roe_v > 0.15:
        ctype = "hypergrowth"
    elif effective_growth > 0.15 or (pe_v > 35 and roe_v > 0.12) or pe_v > 60:
        ctype = "growth"
    elif effective_growth > 0.03 or pe_v > 20:
        ctype = "stable"
    elif div_y > 0.03:
        ctype = "dividend"
    else:
        ctype = "value"

    confidence_profiles = {
        "hypergrowth": {"graham": 0.0, "epv": 0.2, "relative": 0.8, "dcf": 0.9, "nav": 0.0, "ddm": 0.0},
        "growth":      {"graham": 0.0, "epv": 0.3, "relative": 0.8, "dcf": 0.9, "nav": 0.1, "ddm": 0.0},
        "stable":      {"graham": 0.15,"epv": 0.5, "relative": 0.85,"dcf": 0.8, "nav": 0.2, "ddm": 0.15},
        "value":       {"graham": 0.6, "epv": 0.6, "relative": 0.7, "dcf": 0.6, "nav": 0.5, "ddm": 0.3},
        "dividend":    {"graham": 0.3, "epv": 0.4, "relative": 0.7, "dcf": 0.6, "nav": 0.2, "ddm": 0.7},
    }

    if reinvestment_rate > 0.60:
        confidence_profiles[ctype] = dict(confidence_profiles[ctype])
        confidence_profiles[ctype]["dcf"] *= 0.5
        confidence_profiles[ctype]["relative"] = min(confidence_profiles[ctype]["relative"] + 0.1, 1.0)

    terminal_base = {"hypergrowth": 0.04, "growth": 0.035, "stable": 0.03, "value": 0.025, "dividend": 0.025}
    india_bump = 0.015 if is_india else 0.0
    terminal = terminal_base[ctype] + india_bump

    pe_implied_min = 0.0
    if pe_v > 100:
        pe_implied_min = 0.25
    elif pe_v > 60:
        pe_implied_min = 0.18
    elif pe_v > 30:
        pe_implied_min = 0.10
    elif pe_v > 20:
        pe_implied_min = 0.06

    dcf_g = max(effective_growth, pe_implied_min)

    dcf_profiles = {
        "hypergrowth": {"phase1_rate": min(dcf_g * 0.8, 0.50), "phase1_years": 5,
                        "phase2_rate": 0.18, "phase2_years": 5, "fade_years": 7, "terminal": terminal},
        "growth":      {"phase1_rate": min(max(dcf_g * 0.85, 0.08), 0.30), "phase1_years": 4,
                        "phase2_rate": 0.10, "phase2_years": 4, "fade_years": 5, "terminal": terminal},
        "stable":      {"phase1_rate": min(max(dcf_g, 0.05), 0.15), "phase1_years": 3,
                        "phase2_rate": 0.06, "phase2_years": 4, "fade_years": 3, "terminal": terminal},
        "value":       {"phase1_rate": min(max(dcf_g, 0.03), 0.08), "phase1_years": 3,
                        "phase2_rate": 0.03, "phase2_years": 3, "fade_years": 2, "terminal": terminal},
        "dividend":    {"phase1_rate": min(max(dcf_g, 0.03), 0.08), "phase1_years": 3,
                        "phase2_rate": 0.03, "phase2_years": 3, "fade_years": 2, "terminal": terminal},
    }

    discount_base = {"hypergrowth": 0.100, "growth": 0.095, "stable": 0.090, "value": 0.085, "dividend": 0.085}
    if is_india:
        discount_base = {k: v + 0.01 for k, v in discount_base.items()}

    has_optionality = ctype in ("hypergrowth", "growth") and pe_v > 50

    return {
        "type": ctype,
        "confidences": confidence_profiles[ctype],
        "dcf_profile": dcf_profiles[ctype],
        "base_discount": discount_base[ctype],
        "is_india": is_india,
        "has_optionality": has_optionality,
        "reinvestment_rate": reinvestment_rate,
    }


def graham_number(eps: float, book_value: float) -> Optional[float]:
    """Benjamin Graham's intrinsic value formula: sqrt(22.5 * EPS * BVPS)"""
    if not eps or eps <= 0 or not book_value or book_value <= 0:
        return None
    return math.sqrt(22.5 * eps * book_value)


def earnings_power_value(ebit: float, tax_rate: float = 0.25,
                         wacc: float = 0.10) -> Optional[float]:
    """EPV = EBIT * (1 - tax) / WACC"""
    if not ebit or ebit <= 0:
        return None
    return (ebit * (1 - tax_rate)) / wacc


def relative_valuation(eps: float, sector_pe: float = 20.0) -> Optional[float]:
    """Simple peer-relative: fair_price = EPS * sector_avg_PE"""
    if not eps or eps <= 0:
        return None
    return eps * sector_pe


def staged_dcf_valuation(fcf: float, dcf_profile: Dict, discount_rate: float = 0.10,
                         shares: float = 1.0) -> Optional[float]:
    """3-phase DCF with terminal fade: high growth -> transition -> fade -> terminal."""
    if not fcf or fcf <= 0 or shares <= 0:
        return None

    p1_rate = dcf_profile["phase1_rate"]
    p1_years = dcf_profile["phase1_years"]
    p2_rate = dcf_profile["phase2_rate"]
    p2_years = dcf_profile["phase2_years"]
    terminal_g = dcf_profile["terminal"]
    fade_years = dcf_profile.get("fade_years", 5)

    total_pv = 0.0
    projected_fcf = fcf
    year = 0

    for _ in range(p1_years):
        year += 1
        projected_fcf *= (1 + p1_rate)
        total_pv += projected_fcf / (1 + discount_rate) ** year

    for i in range(p2_years):
        year += 1
        blend = (p2_years - i) / p2_years
        rate = p2_rate * blend + terminal_g * (1 - blend)
        rate = max(rate, terminal_g)
        projected_fcf *= (1 + rate)
        total_pv += projected_fcf / (1 + discount_rate) ** year

    last_transition_rate = terminal_g
    if p2_years > 0:
        last_blend = 1.0 / p2_years
        last_transition_rate = p2_rate * last_blend + terminal_g * (1 - last_blend)
    entry_fade = max(last_transition_rate, terminal_g)
    for i in range(fade_years):
        year += 1
        blend = (fade_years - i) / fade_years
        rate = entry_fade * blend + terminal_g * (1 - blend)
        rate = max(rate, terminal_g)
        projected_fcf *= (1 + rate)
        total_pv += projected_fcf / (1 + discount_rate) ** year

    if discount_rate > terminal_g:
        terminal_value = projected_fcf * (1 + terminal_g) / (discount_rate - terminal_g)
        total_pv += terminal_value / (1 + discount_rate) ** year

    return total_pv / shares


def reverse_dcf(current_price: float, fcf: float, dcf_profile: Dict,
                discount_rate: float, shares: float) -> Optional[float]:
    """Binary search for the phase-1 growth rate the market is implying."""
    if not fcf or fcf <= 0 or shares <= 0 or current_price <= 0:
        return None
    target = current_price

    lo, hi = -0.10, 1.50
    for _ in range(60):
        mid = (lo + hi) / 2
        test_profile = dict(dcf_profile)
        test_profile["phase1_rate"] = mid
        val = staged_dcf_valuation(fcf, test_profile, discount_rate, shares)
        if val is None:
            return None
        if val < target:
            lo = mid
        else:
            hi = mid
        if abs(hi - lo) < 0.001:
            break
    implied = round((lo + hi) / 2 * 100, 1)
    return implied


def net_asset_value(total_assets: float, total_liabilities: float,
                    shares: float = 1.0) -> Optional[float]:
    """NAV per share = (Total Assets - Total Liabilities) / Shares Outstanding"""
    if not total_assets or not shares or shares <= 0:
        return None
    nav = total_assets - (total_liabilities or 0)
    if nav <= 0:
        return None
    return nav / shares


def dividend_discount_model(dividend_rate: float, growth_rate: float = 0.05,
                            discount_rate: float = 0.10) -> Optional[float]:
    """Gordon Growth DDM: Price = D / (r - g)"""
    if not dividend_rate or dividend_rate <= 0:
        return None
    if discount_rate <= growth_rate:
        return None
    return dividend_rate / (discount_rate - growth_rate)


# ═══════════════════════════════════════════════════════════════════════
# HISTORICAL EXPECTATION TRACKING (Upgrade 3 — Proprietary Alpha Dataset)
# ═══════════════════════════════════════════════════════════════════════

TRACKING_DIR = PROJECT_ROOT / "data" / "alpha_tracking"

def _log_expectation_tracking(
    ticker: str, price: float, intrinsic: float,
    implied_growth: Optional[float], model_growth: float,
    expectation_gap: Optional[float], confidence: float,
    mispricing_score: Optional[float], mos: float,
    company_type: str, zone: str,
) -> None:
    """Append a row to the daily alpha-tracking CSV. Thread-safe via append mode."""
    try:
        TRACKING_DIR.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        csv_path = TRACKING_DIR / "expectation_log.csv"
        header_needed = not csv_path.exists()

        import csv
        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if header_needed:
                writer.writerow([
                    "date", "ticker", "price", "intrinsic_value",
                    "implied_growth", "model_growth", "expectation_gap",
                    "confidence", "mispricing_score", "mos",
                    "company_type", "zone",
                ])
            writer.writerow([
                today, ticker, round(price, 2), round(intrinsic, 2),
                implied_growth, model_growth, expectation_gap,
                round(confidence, 1), mispricing_score, round(mos, 2),
                company_type, zone,
            ])
    except Exception as e:
        logger.warning("Alpha tracking log failed for %s: %s", ticker, e)


# ═══════════════════════════════════════════════════════════════════════
# CORE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════

def compute_valuation(ticker: str) -> Dict[str, Any]:
    """Run all valuation methods using internal + live data.
    Uses company-type classification, confidence-weighted composite, realistic discount rates."""
    ticker_dir = _find_ticker_dir(ticker)
    if not ticker_dir:
        return {"error": f"No data found for {ticker}"}

    fundamentals = _load_fundamentals(ticker_dir)
    daily_df = _load_daily(ticker_dir)
    metadata = _load_metadata(ticker_dir)
    market = metadata.get("market", ticker_dir.parent.name)
    intel = _load_intelligence(ticker, market)

    info = fundamentals.get("info", {})
    info = _enrich_with_live_data(ticker, info)

    eps = _safe(info.get("trailingEps")) or _safe(info.get("dilutedEps"))
    book_value = _safe(info.get("bookValue"))
    ebit = _safe(info.get("ebit")) or _safe(info.get("operatingIncome"))
    fcf_raw = _safe(info.get("freeCashflow"))
    op_cf = _safe(info.get("operatingCashflow"))
    capex = _safe(info.get("capitalExpenditures"))
    shares = _safe(info.get("sharesOutstanding"), 1)

    fcf = fcf_raw
    if not fcf and op_cf:
        fcf = op_cf - abs(capex) if capex else op_cf * 0.85
    if not fcf and eps and eps > 0 and shares and shares > 0:
        fcf = eps * shares * 0.70
    if fcf and eps and eps > 0 and shares and shares > 0:
        fcf_ps = fcf / shares
        if fcf_ps < eps * 0.20:
            fcf = eps * shares * 0.70

    pe = _safe(info.get("trailingPE"))
    roe_val = _safe(info.get("returnOnEquity"))
    debt_equity_raw = _safe(info.get("debtToEquity"))
    debt_equity = debt_equity_raw / 100.0 if debt_equity_raw is not None else None
    _div_rate_for_norm = _safe(info.get("dividendRate"))
    _price_for_norm = _safe(info.get("currentPrice")) or _safe(info.get("previousClose"))
    if _div_rate_for_norm and _price_for_norm and _price_for_norm > 0:
        div_yield_raw = _div_rate_for_norm / _price_for_norm
    else:
        _raw_dy = _safe(info.get("dividendYield"))
        _trailing_dy = _safe(info.get("trailingAnnualDividendYield"))
        if _trailing_dy and _trailing_dy > 0:
            div_yield_raw = _trailing_dy
        elif _raw_dy is not None:
            div_yield_raw = _raw_dy / 100.0 if _raw_dy > 1.0 else _raw_dy
        else:
            div_yield_raw = None
    revenue_growth = _safe(info.get("revenueGrowth"))
    earnings_growth = _safe(info.get("earningsGrowth"))
    market_cap = _safe(info.get("marketCap"))
    company_name = info.get("longName") or info.get("shortName") or ticker
    sector = info.get("sector", "")

    current_price = 0.0
    if daily_df is not None and not daily_df.empty:
        close_col = "Adj Close" if "Adj Close" in daily_df.columns else "Close"
        if close_col in daily_df.columns:
            current_price = float(daily_df[close_col].iloc[-1])
    if current_price <= 0:
        current_price = _safe(info.get("currentPrice")) or _safe(info.get("previousClose")) or 0.0

    regime = intel.get("asset_regime", "unknown")
    conviction = _safe(intel.get("conviction"))
    intent = intel.get("intent")
    mnemos2 = _load_mnemos2_signals(ticker)

    # ── Company Classification ──
    beta = _safe(info.get("beta"), 1.0)
    company = classify_company(
        revenue_growth, roe_val, pe, beta, div_yield_raw, debt_equity,
        earnings_growth=earnings_growth, sector=sector, ticker=ticker,
        op_cf=op_cf, capex=capex,
    )
    ctype = company["type"]
    conf = dict(company["confidences"])
    dcf_profile = company["dcf_profile"]

    # ── Post-classification refinements ──
    if fcf and eps and eps > 0 and shares and shares > 0:
        fcf_ps = fcf / shares
        if fcf_ps < eps * 0.50:
            conf["dcf"] = conf["dcf"] * 0.5
    if pe and pe > 25 and ctype == "stable":
        conf["graham"] = 0.0

    # ── Realistic Discount Rate ──
    base_discount = company["base_discount"]
    if regime in ["bearish", "crisis"]:
        base_discount += 0.015
    elif regime in ["volatile", "uncertain", "distribution"]:
        base_discount += 0.005
    beta_adj = max(0.0, min((beta - 1.0) * 0.01, 0.02))
    discount_rate = min(base_discount + beta_adj, 0.13)

    # ── Sector PE with growth adjustment ──
    sector_pe_raw = _safe(info.get("sectorPE")) or _safe(info.get("industryPE"))
    if sector_pe_raw and 5 < sector_pe_raw < 80:
        sector_pe = sector_pe_raw
    else:
        sector_lower = sector.lower()
        sector_pe_map = {
            "technology": 30, "consumer cyclical": 25, "healthcare": 25,
            "financial services": 18, "energy": 20, "industrials": 22,
            "consumer defensive": 24, "utilities": 20, "communication services": 22,
            "basic materials": 18, "real estate": 22,
        }
        sector_pe = sector_pe_map.get(sector_lower, 22.0)
        if pe and pe > 0:
            capped_pe = min(pe, 80)
            sector_pe = sector_pe * 0.4 + capped_pe * 0.6

    # ── Run Valuation Methods (all computed, confidence decides inclusion) ──
    methods: List[Dict] = []

    gn = graham_number(eps, book_value)
    methods.append({
        "name": "Graham Number", "value": round(gn, 2) if gn else None,
        "description": "sqrt(22.5 * EPS * BVPS) - classic value screen",
        "applicable": gn is not None and conf["graham"] > 0,
        "weight": conf["graham"],
    })

    epv = earnings_power_value(ebit, wacc=discount_rate)
    epv_per_share = round(epv / shares, 2) if epv and shares > 0 else None
    methods.append({
        "name": "Earnings Power Value", "value": epv_per_share,
        "description": f"EBIT*(1-tax)/WACC at {discount_rate:.1%} discount",
        "applicable": epv_per_share is not None and conf["epv"] > 0,
        "weight": conf["epv"],
    })

    rv = relative_valuation(eps, sector_pe)
    methods.append({
        "name": "Relative Valuation", "value": round(rv, 2) if rv else None,
        "description": f"EPS * blended P/E ({sector_pe:.1f}x)",
        "applicable": rv is not None and conf["relative"] > 0,
        "weight": conf["relative"],
    })

    dcf_base = staged_dcf_valuation(fcf, dcf_profile, discount_rate, shares=shares)
    p1r = dcf_profile['phase1_rate']
    p2r = dcf_profile['phase2_rate']
    tg = dcf_profile['terminal']

    if company.get("has_optionality") and dcf_base and dcf_base > 0:
        bull_profile = dict(dcf_profile)
        bull_profile["phase1_rate"] = min(p1r * 1.5, 0.60)
        bull_profile["phase2_rate"] = min(p2r * 1.3, 0.25)
        bear_profile = dict(dcf_profile)
        bear_profile["phase1_rate"] = max(p1r * 0.5, 0.03)
        bear_profile["phase2_rate"] = max(p2r * 0.5, 0.02)
        dcf_bull = staged_dcf_valuation(fcf, bull_profile, discount_rate, shares=shares) or dcf_base * 1.5
        dcf_bear = staged_dcf_valuation(fcf, bear_profile, discount_rate + 0.02, shares=shares) or dcf_base * 0.5
        dcf = round(dcf_bear * 0.20 + dcf_base * 0.50 + dcf_bull * 0.30, 2)
        dcf_desc = f"Scenario DCF: bear/base/bull @ {discount_rate:.1%} disc ({regime})"
    else:
        dcf = dcf_base
        dcf_desc = f"Staged: {p1r:.0%}->{p2r:.0%}->T{tg:.1%}, {discount_rate:.1%} disc ({regime})"

    fade_yrs = dcf_profile.get("fade_years", 5)
    dcf_desc_full = dcf_desc + f" + {fade_yrs}yr fade"
    methods.append({
        "name": "Staged DCF", "value": round(dcf, 2) if dcf else None,
        "description": dcf_desc_full,
        "applicable": dcf is not None and conf["dcf"] > 0,
        "weight": conf["dcf"],
    })

    implied_growth = reverse_dcf(current_price, fcf, dcf_profile, discount_rate, shares)

    total_assets = _safe(info.get("totalAssets"))
    total_liabilities = _safe(info.get("totalDebt")) or _safe(info.get("totalLiab"))
    nav = net_asset_value(total_assets, total_liabilities, shares)
    methods.append({
        "name": "Net Asset Value", "value": round(nav, 2) if nav else None,
        "description": "Liquidation: (Assets - Liabilities) / Shares",
        "applicable": nav is not None and conf["nav"] > 0,
        "weight": conf["nav"],
    })

    div_rate = _safe(info.get("dividendRate"))
    div_yield = div_yield_raw

    growth_rate = 0.08
    if revenue_growth:
        growth_rate = max(0.02, min(float(revenue_growth), 0.50))
    div_growth = min(growth_rate, 0.06)
    ddm = dividend_discount_model(div_rate, div_growth, discount_rate)
    if ddm and current_price > 0 and ddm < current_price * 0.35:
        ddm = None
    methods.append({
        "name": "Dividend Discount Model",
        "value": round(ddm, 2) if ddm else None,
        "description": f"Gordon Growth: D/(r-g) at {div_growth:.0%} growth" if ddm else "Not applicable",
        "applicable": ddm is not None and conf["ddm"] > 0,
        "weight": conf["ddm"],
    })

    # ── Confidence-Weighted Composite Intrinsic Value ──
    valid_methods = [(m["value"], m["weight"]) for m in methods
                     if m["applicable"] and m["value"] and m["value"] > 0 and m["weight"] > 0]

    if valid_methods and current_price > 0:
        filtered = [(v, w) for v, w in valid_methods if 0.15 * current_price <= v <= 5.0 * current_price]
        if not filtered:
            filtered = valid_methods

        total_w = sum(w for _, w in filtered)
        intrinsic_value = round(sum(v * w for v, w in filtered) / total_w, 2)
    elif valid_methods:
        intrinsic_value = round(sum(v for v, _ in valid_methods) / len(valid_methods), 2)
    else:
        intrinsic_value = current_price

    # ── Minimum Intrinsic Floor ──
    floor_bv = (book_value * 0.8) if book_value and book_value > 0 else 0
    floor_epv = (epv_per_share * 0.7) if epv_per_share and epv_per_share > 0 else 0
    intrinsic_floor = max(floor_bv, floor_epv)
    if intrinsic_floor > 0 and intrinsic_value < intrinsic_floor:
        intrinsic_value = round(intrinsic_floor, 2)

    # ── Intrinsic Range (Low / Base / High) with outlier rejection ──
    vals_only = [v for v, _ in valid_methods] if valid_methods else [intrinsic_value]
    if len(vals_only) >= 3:
        sorted_v = sorted(vals_only)
        median_v = sorted_v[len(sorted_v) // 2]
        range_vals = [v for v in sorted_v if median_v * 0.30 <= v <= median_v * 3.0]
        if len(range_vals) < 2:
            range_vals = sorted_v
        iv_low = round(min(range_vals), 2)
        iv_high = round(max(range_vals), 2)
    elif len(vals_only) == 2:
        iv_low = round(min(vals_only), 2)
        iv_high = round(max(vals_only), 2)
    else:
        iv_low = round(intrinsic_value * 0.85, 2)
        iv_high = round(intrinsic_value * 1.15, 2)
    if intrinsic_floor > 0:
        iv_low = max(iv_low, round(intrinsic_floor * 0.9, 2))
    intrinsic_range = {"low": iv_low, "base": intrinsic_value, "high": iv_high}

    # ── Valuation Confidence Score ──
    data_completeness = sum(1 for v in [eps, book_value, ebit, fcf, pe, roe_val, revenue_growth] if v) / 7.0
    method_count_score = min(len(valid_methods) / 4.0, 1.0)
    if len(vals_only) >= 2 and intrinsic_value > 0:
        spread = (max(vals_only) - min(vals_only)) / intrinsic_value
        agreement_score = max(0.0, 1.0 - spread)
    else:
        agreement_score = 0.5
    val_confidence = round((data_completeness * 0.3 + method_count_score * 0.35 + agreement_score * 0.35) * 100, 1)

    margin_of_safety = 0.0
    if intrinsic_value > 0 and current_price > 0:
        margin_of_safety = round(((intrinsic_value - current_price) / current_price) * 100, 2)

    # ── Valuation Zone ──
    if margin_of_safety > 30:
        val_zone = "deep_undervalue"
    elif margin_of_safety > 10:
        val_zone = "undervalue"
    elif margin_of_safety >= -10:
        val_zone = "fair_value"
    elif margin_of_safety >= -30:
        val_zone = "overvalue"
    else:
        val_zone = "extreme_overvalue"

    valid_count = len(valid_methods)
    if margin_of_safety > 25:
        recommendation = "BUY"
    elif margin_of_safety > -25:
        recommendation = "HOLD"
    elif valid_count <= 1:
        recommendation = "HOLD"
    else:
        recommendation = "SELL"

    de_display = round(float(debt_equity), 2) if debt_equity else None
    dy_display = round(float(div_yield) * 100, 2) if div_yield is not None else None

    # ── Expectation Gap Score ──
    model_growth_pct = round(p1r * 100, 1)
    expectation_gap = None
    gap_label = None
    if implied_growth is not None:
        expectation_gap = round(model_growth_pct - implied_growth, 1)
        abs_gap = abs(expectation_gap)
        if abs_gap < 3:
            gap_label = "fairly_priced"
        elif expectation_gap > 15:
            gap_label = "strong_undervalue"
        elif expectation_gap > 5:
            gap_label = "undervalue"
        elif expectation_gap < -30:
            gap_label = "extreme_overvalue"
        elif expectation_gap < -10:
            gap_label = "overvalue"
        else:
            gap_label = "slight_mismatch"

    # ── Mispricing Probability Score ──
    mispricing_score = None
    mispricing_label = None
    if expectation_gap is not None and val_confidence > 0:
        mos_component = min(abs(margin_of_safety) / 50.0, 1.0)
        gap_component = min(abs(expectation_gap) / 30.0, 1.0)
        conf_component = val_confidence / 100.0
        raw_score = (mos_component * 0.30 + gap_component * 0.45 + conf_component * 0.25) * 100
        direction = 1 if (margin_of_safety > 0 and expectation_gap > 0) else (
            -1 if (margin_of_safety < 0 and expectation_gap < 0) else 0
        )
        if direction == 0:
            raw_score *= 0.5
        mispricing_score = round(min(raw_score, 99), 1)
        if mispricing_score >= 75:
            mispricing_label = "high"
        elif mispricing_score >= 50:
            mispricing_label = "moderate"
        elif mispricing_score >= 30:
            mispricing_label = "low"
        else:
            mispricing_label = "negligible"

    alpha_signals = None
    if expectation_gap is not None:
        alpha_direction = "undervalued" if (margin_of_safety > 0 and expectation_gap > 0) else (
            "overvalued" if (margin_of_safety < 0 and expectation_gap < 0) else "mixed"
        )
        alpha_signals = {
            "expectationGap": expectation_gap,
            "gapLabel": gap_label,
            "mispricingScore": mispricing_score,
            "mispricingLabel": mispricing_label,
            "alphaDirection": alpha_direction,
        }

    reverse_dcf_data = None
    if implied_growth is not None:
        reverse_dcf_data = {
            "impliedGrowthRate": implied_growth,
            "modelGrowthRate": model_growth_pct,
            "horizon": dcf_profile.get("phase1_years", 5),
            "expectationGap": expectation_gap,
        }

    # ── Historical Expectation Tracking (Upgrade 3) ──
    _log_expectation_tracking(
        ticker, current_price, intrinsic_value, implied_growth,
        model_growth_pct, expectation_gap, val_confidence,
        mispricing_score, margin_of_safety, ctype, val_zone,
    )

    return {
        "ticker": ticker,
        "companyName": company_name,
        "currentPrice": round(current_price, 2),
        "intrinsicValue": intrinsic_value,
        "intrinsicRange": intrinsic_range,
        "marginOfSafety": margin_of_safety,
        "recommendation": recommendation,
        "valuationZone": val_zone,
        "valuationConfidence": val_confidence,
        "companyType": ctype,
        "alphaSignals": alpha_signals,
        "methods": methods,
        "regime": regime,
        "conviction": conviction,
        "intent": intent,
        "mnemos2": mnemos2 if mnemos2 else None,
        "keyMetrics": {
            "peRatio": round(pe, 2) if pe else None,
            "eps": round(eps, 2) if eps else None,
            "revenueGrowth": round(float(revenue_growth) * 100, 2) if revenue_growth else None,
            "beta": round(float(beta), 2) if beta else None,
            "dividendYield": dy_display,
            "debtToEquity": de_display,
            "roe": round(float(roe_val) * 100, 2) if roe_val else None,
            "freeCashflow": fcf,
            "bookValue": round(book_value, 2) if book_value else None,
        },
        "reverseDCF": reverse_dcf_data,
        "market": market,
        "dataSource": "internal+live+mnemos2",
    }


# ═══════════════════════════════════════════════════════════════════════
# AI NARRATIVE (OPTIONAL - only for report text, never for numbers)
# ═══════════════════════════════════════════════════════════════════════

async def generate_narrative(valuation: Dict[str, Any]) -> str:
    """Use Groq to generate a natural-language investment report from computed numbers."""
    if not GROQ_API_KEY:
        methods_text = "\n".join(
            f"  - {m['name']}: ${m['value']}" if m['applicable'] else f"  - {m['name']}: N/A"
            for m in valuation.get("methods", [])
        )
        return (
            f"## {valuation['companyName']} ({valuation['ticker']})\n\n"
            f"**Current Price:** ${valuation['currentPrice']:.2f}\n"
            f"**Intrinsic Value:** ${valuation['intrinsicValue']:.2f}\n"
            f"**Margin of Safety:** {valuation['marginOfSafety']:.1f}%\n"
            f"**Recommendation:** {valuation['recommendation']}\n\n"
            f"### Valuation Methods\n{methods_text}\n\n"
            f"**Regime:** {valuation.get('regime', 'N/A')}\n"
            f"**Intelligence Conviction:** {valuation.get('conviction', 'N/A')}\n"
        )

    import httpx
    methods_summary = json.dumps(
        [{k: m[k] for k in ['name', 'value', 'applicable']} for m in valuation.get('methods', [])],
        indent=1
    )
    metrics_summary = json.dumps(valuation.get('keyMetrics', {}), indent=1)

    rng = valuation.get("intrinsicRange", {})
    range_text = f"Low: ${rng.get('low', 0):.2f} | Base: ${rng.get('base', 0):.2f} | High: ${rng.get('high', 0):.2f}" if rng else "N/A"
    zone = valuation.get("valuationZone", "unknown").replace("_", " ").title()
    conf = valuation.get("valuationConfidence", 0)

    rdcf = valuation.get("reverseDCF")
    if rdcf:
        rdcf_text = (f"Market-implied growth: {rdcf['impliedGrowthRate']}% vs "
                     f"Model assumption: {rdcf['modelGrowthRate']}% over {rdcf.get('horizon', 5)}yr horizon")
    else:
        rdcf_text = "N/A"

    alpha = valuation.get("alphaSignals", {}) or {}
    alpha_text = "N/A"
    if alpha:
        alpha_text = (f"Expectation Gap: {alpha.get('expectationGap', 'N/A')}% ({alpha.get('gapLabel', '')}) | "
                      f"Mispricing Probability: {alpha.get('mispricingScore', 'N/A')}% ({alpha.get('mispricingLabel', '')}) | "
                      f"Direction: {alpha.get('alphaDirection', 'N/A')}")

    prompt = f"""You are writing a clear, actionable investment analysis. Be specific to THIS company.

STOCK: {valuation['ticker']} ({valuation['companyName']})
Company Type: {valuation.get('companyType', 'unknown')} | Sector: {valuation.get('keyMetrics', {}).get('sector', 'N/A')}
Price: ${valuation['currentPrice']:.2f} | Intrinsic Value: ${valuation['intrinsicValue']:.2f}
Intrinsic Range: {range_text}
Margin of Safety: {valuation['marginOfSafety']:.1f}% | Zone: {zone}
Valuation Confidence: {conf:.0f}% | Verdict: {valuation['recommendation']}
Market Regime: {valuation.get('regime', 'unknown')} | Conviction: {valuation.get('conviction', 'N/A')}
Reverse DCF: {rdcf_text}
Alpha Signals: {alpha_text}

Methods: {methods_summary}
Metrics: {metrics_summary}

Write a CONCISE report (max 400 words) with these sections:

**What This Company Does** (1-2 sentences describing their core business and competitive position — be specific, e.g. "NVIDIA dominates GPU computing for AI data centers" not "this is a technology company")

**Is It Fairly Priced?** (Reference the intrinsic RANGE not just point estimate. Explain which methods drove the valuation. Reference the expectation gap and mispricing probability — if the gap is large, explain what it means for the investor. If market implies higher growth, flag whether that is realistic.)

**What Could Go Wrong** (2-3 SPECIFIC risks from the actual data — cite exact numbers like debt/equity ratio, PE vs growth, regime conditions)

**Bottom Line** (1-2 sentences: clear verdict referencing both the mispricing score and the expectation gap as the primary alpha signal)

RULES:
- Be specific to THIS company — never say "this company operates in XYZ sector"
- Reference the intrinsic range, confidence, expectation gap, and mispricing score
- Only cite numbers from the data provided
- Do NOT invent or assume any numbers"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are IntrinsIQ, a clear and direct investment analyst. Write actionable reports using ONLY the data provided. Use simple language. Never invent numbers. Be concise."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 2000,
                },
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning(f"Narrative generation failed: {e}")

    return f"Valuation complete. {valuation['recommendation']} with {valuation['marginOfSafety']:.1f}% margin of safety."


# ═══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════

@router.get("/analyze/{ticker}", response_model=IntrinsIQResponse)
async def analyze_stock(ticker: str):
    """Analyze a stock using INTERNAL data only."""
    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")

    valuation = compute_valuation(ticker)
    if "error" in valuation:
        raise HTTPException(status_code=404, detail=valuation["error"])

    if valuation["currentPrice"] <= 0:
        raise HTTPException(status_code=404, detail=f"No price data for {ticker}")

    narrative = await generate_narrative(valuation)
    summary_line = f"{valuation['recommendation']}: {valuation['companyName']} trades at ${valuation['currentPrice']:.2f} vs intrinsic ${valuation['intrinsicValue']:.2f} ({valuation['marginOfSafety']:.1f}% margin)."

    active_methods = [m["name"] for m in valuation["methods"] if m.get("applicable") and m.get("value")]
    methodology_label = "Composite: " + " + ".join(active_methods) if active_methods else "Composite Analysis"

    rng = valuation.get("intrinsicRange", {})
    intrinsic_range = IntrinsicRange(
        low=rng.get("low", valuation["intrinsicValue"] * 0.85),
        base=rng.get("base", valuation["intrinsicValue"]),
        high=rng.get("high", valuation["intrinsicValue"] * 1.15),
    )

    return IntrinsIQResponse(
        analysis=AnalysisResult(
            ticker=valuation["ticker"],
            companyName=valuation["companyName"],
            currentPrice=valuation["currentPrice"],
            intrinsicValue=valuation["intrinsicValue"],
            intrinsicRange=intrinsic_range,
            marginOfSafety=valuation["marginOfSafety"],
            recommendation=valuation["recommendation"],
            valuationZone=valuation.get("valuationZone", "fair_value"),
            valuationConfidence=valuation.get("valuationConfidence", 0),
            companyType=valuation.get("companyType"),
            summary=summary_line,
            detailedReport=narrative,
            keyMetrics=KeyMetrics(**valuation["keyMetrics"]),
            valuationMethodology=methodology_label,
            valuationMethods=[ValuationMethod(**m) for m in valuation["methods"]],
            regime=valuation.get("regime"),
            conviction=valuation.get("conviction"),
            reverseDCF=valuation.get("reverseDCF"),
            alphaSignals=valuation.get("alphaSignals"),
            dataSource="internal",
        ),
        sources=[
            GroundingSource(title=f"{ticker} - FinVest Intelligence", uri=f"/intelligence/{ticker}"),
            GroundingSource(title=f"{ticker} - Screener Data", uri=f"/screener?search={ticker}"),
        ],
    )


@router.get("/alpha-rankings")
async def alpha_rankings():
    """Serve pre-computed daily alpha rankings."""
    rankings_file = TRACKING_DIR / "daily_rankings.json"
    if not rankings_file.exists():
        raise HTTPException(status_code=404, detail="Rankings not yet generated. Run daily refresh.")
    try:
        data = json.loads(rankings_file.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load rankings: {e}")


@router.get("/health")
async def health_check():
    """Health check with data availability."""
    ticker_count = 0
    if DATA_DIR.exists():
        for mdir in DATA_DIR.iterdir():
            if mdir.is_dir():
                ticker_count += sum(1 for d in mdir.iterdir() if d.is_dir())

    return {
        "status": "healthy",
        "service": "IntrinsIQ v4.0 Alpha Engine",
        "data_source": "internal+live",
        "valuation_methods": ["Graham Number", "EPV", "Relative Valuation", "3-Phase Fade DCF", "Reverse DCF", "NAV", "DDM"],
        "tickers_available": ticker_count,
        "groq_configured": bool(GROQ_API_KEY),
        "timestamp": datetime.now().isoformat(),
    }
