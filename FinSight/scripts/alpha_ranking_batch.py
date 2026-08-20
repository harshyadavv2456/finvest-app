#!/usr/bin/env python3
"""
Alpha Ranking Batch Scorer
===========================
Runs compute_valuation across the ticker universe, ranks by mispricing
probability, and writes daily rankings + gap trends to JSON.

Runs during daily refresh as Phase 3 step.
"""

import sys
import json
import csv
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "backend"))

from app.intrinsiq_api import compute_valuation

logger = logging.getLogger("alpha_ranking")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

OUTPUT_DIR = BASE / "data" / "alpha_tracking"
RANKINGS_FILE = OUTPUT_DIR / "daily_rankings.json"
TRACKING_CSV = OUTPUT_DIR / "expectation_log.csv"
TICKERS_FILE = BASE / "tickers.txt"

SKIP_PREFIXES = ("^", "NIFTYBEES", "SPY", "QQQ", "IVV", "VOO", "GOLDBEES", "SILVERBEES", "CNX100")
SKIP_SUFFIXES = (".SS", ".SZ", ".T", ".HK", ".SI", ".AX", ".L")

PRIORITY_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "BRK-B",
    "JPM", "V", "JNJ", "UNH", "HD", "PG", "MA", "DIS", "PYPL",
    "NFLX", "ADBE", "CRM", "INTC", "AMD", "AVGO", "COST", "KO",
    "PEP", "MCD", "NKE", "WMT", "LOW", "SBUX", "BA", "CAT",
    "GS", "MS", "C", "BAC", "WFC", "COIN", "PLTR", "SOFI",
    "SNOW", "CRWD", "NET", "DDOG", "PANW", "ZS", "SHOP",
    "SQ", "ABNB", "UBER", "RIVN", "LCID", "ARM", "SMCI", "MSTR",
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFOSYS.NS", "ICICIBANK.NS",
    "INFY.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS", "LT.NS",
    "AXISBANK.NS", "SBIN.NS", "SUNPHARMA.NS", "TATAMOTORS.NS",
    "MARUTI.NS", "TATASTEEL.NS", "TITAN.NS", "BAJFINANCE.NS",
    "WIPRO.NS", "HCLTECH.NS", "ADANIENT.NS", "ADANIPORTS.NS",
    "DRREDDY.NS", "NESTLEIND.NS", "ASIANPAINT.NS", "DIVISLAB.NS",
    "ONGC.NS", "NTPC.NS", "POWERGRID.NS", "COALINDIA.NS",
    "TRENT.NS", "ZOMATO.NS", "DMART.NS", "POLYCAB.NS",
    "ABT", "LLY", "ABBV", "TMO", "DHR", "ISRG", "REGN", "AMGN",
    "GILD", "VRTX", "SYK", "BDX", "EW", "BSX",
]


def load_tickers():
    """Load tickers, filter to US and Indian equities, deduplicate with priority list."""
    tickers = set(PRIORITY_TICKERS)

    if TICKERS_FILE.exists():
        for line in TICKERS_FILE.read_text(encoding="utf-8").splitlines():
            t = line.strip()
            if not t:
                continue
            if any(t.startswith(p) for p in SKIP_PREFIXES):
                continue
            if any(t.endswith(s) for s in SKIP_SUFFIXES):
                continue
            if t.endswith(".NS"):
                tickers.add(t)
            elif "." not in t and len(t) <= 5:
                tickers.add(t)

    return sorted(tickers)


def load_historical_gaps():
    """Load past 30 days of expectation gaps from tracking CSV."""
    gaps_by_ticker = {}
    if not TRACKING_CSV.exists():
        return gaps_by_ticker

    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    try:
        with open(TRACKING_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("date", "") < cutoff:
                    continue
                ticker = row.get("ticker", "")
                gap = row.get("expectation_gap", "")
                dt = row.get("date", "")
                if ticker and gap and gap != "None":
                    if ticker not in gaps_by_ticker:
                        gaps_by_ticker[ticker] = []
                    gaps_by_ticker[ticker].append({
                        "date": dt,
                        "gap": float(gap),
                    })
    except Exception as e:
        logger.warning("Failed to load historical gaps: %s", e)

    return gaps_by_ticker


def compute_gap_trend(ticker, current_gap, historical):
    """Compute gap trend: current vs oldest in 30-day window."""
    entries = historical.get(ticker, [])
    if not entries or current_gap is None:
        return None

    sorted_entries = sorted(entries, key=lambda x: x["date"])
    oldest_gap = sorted_entries[0]["gap"]
    delta = round(current_gap - oldest_gap, 1)
    days = (datetime.now() - datetime.strptime(sorted_entries[0]["date"], "%Y-%m-%d")).days
    if days < 1:
        days = 1

    if abs(delta) < 2:
        trend = "stable"
    elif delta > 5:
        trend = "widening_undervalue"
    elif delta > 0:
        trend = "improving"
    elif delta < -5:
        trend = "widening_overvalue"
    else:
        trend = "deteriorating"

    return {
        "delta": delta,
        "days": days,
        "trend": trend,
        "oldestGap": oldest_gap,
    }


def score_ticker(ticker):
    """Run compute_valuation for a single ticker, return summary or None."""
    try:
        r = compute_valuation(ticker)
        if "error" in r or r.get("currentPrice", 0) <= 0:
            return None

        alpha = r.get("alphaSignals") or {}
        rdcf = r.get("reverseDCF") or {}
        rng = r.get("intrinsicRange") or {}

        if not alpha.get("mispricingScore"):
            return None

        return {
            "ticker": ticker,
            "companyName": r.get("companyName", ticker),
            "companyType": r.get("companyType", "unknown"),
            "currentPrice": r.get("currentPrice", 0),
            "intrinsicValue": r.get("intrinsicValue", 0),
            "intrinsicRange": rng,
            "marginOfSafety": r.get("marginOfSafety", 0),
            "recommendation": r.get("recommendation", "HOLD"),
            "valuationZone": r.get("valuationZone", "fair_value"),
            "valuationConfidence": r.get("valuationConfidence", 0),
            "expectationGap": alpha.get("expectationGap"),
            "gapLabel": alpha.get("gapLabel"),
            "mispricingScore": alpha.get("mispricingScore"),
            "mispricingLabel": alpha.get("mispricingLabel"),
            "alphaDirection": alpha.get("alphaDirection"),
            "impliedGrowth": rdcf.get("impliedGrowthRate"),
            "modelGrowth": rdcf.get("modelGrowthRate"),
            "signalTier": (
                "strong" if alpha["mispricingScore"] >= 70 else
                "moderate" if alpha["mispricingScore"] >= 50 else
                "weak"
            ),
        }
    except Exception as e:
        logger.debug("Failed %s: %s", ticker, e)
        return None


def run_batch():
    """Score all tickers in parallel, compute rankings and trends."""
    start = time.time()
    tickers = load_tickers()
    logger.info("Scoring %d tickers...", len(tickers))

    historical = load_historical_gaps()
    results = []

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(score_ticker, t): t for t in tickers}
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            if done_count % 25 == 0:
                logger.info("  Progress: %d/%d", done_count, len(tickers))
            result = future.result()
            if result:
                gap_trend = compute_gap_trend(
                    result["ticker"],
                    result["expectationGap"],
                    historical
                )
                result["gapTrend"] = gap_trend
                results.append(result)

    undervalued = sorted(
        [r for r in results if r["alphaDirection"] == "undervalued"],
        key=lambda x: x["mispricingScore"],
        reverse=True
    )[:20]

    overvalued = sorted(
        [r for r in results if r["alphaDirection"] == "overvalued"],
        key=lambda x: x["mispricingScore"],
        reverse=True
    )[:20]

    strong_signals = [r for r in results if r["signalTier"] == "strong"]
    moderate_signals = [r for r in results if r["signalTier"] == "moderate"]

    elapsed = round(time.time() - start, 1)
    output = {
        "generatedAt": datetime.now().isoformat(),
        "elapsedSeconds": elapsed,
        "totalScored": len(results),
        "totalTickers": len(tickers),
        "topUndervalued": undervalued,
        "topOvervalued": overvalued,
        "strongSignals": len(strong_signals),
        "moderateSignals": len(moderate_signals),
        "signalSummary": {
            "strong": len(strong_signals),
            "moderate": len(moderate_signals),
            "weak": len(results) - len(strong_signals) - len(moderate_signals),
        },
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RANKINGS_FILE.write_text(json.dumps(output, indent=2, default=str), encoding="utf-8")
    logger.info(
        "Rankings complete: %d scored, %d undervalued, %d overvalued in %.1fs",
        len(results), len(undervalued), len(overvalued), elapsed
    )
    return True


if __name__ == "__main__":
    run_batch()
