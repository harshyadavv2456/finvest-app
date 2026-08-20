#!/usr/bin/env python3
"""
Build Timeline Snapshots
========================
Creates daily snapshots from intelligence JSONs.
Each snapshot consolidates all stock recommendations for a given date.

Output: public/timeline/{market}/{YYYY-MM-DD}.json

Can be run standalone or called from the orchestrator.
"""

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
INTELLIGENCE_DIR = BASE / "public" / "intelligence"
TIMELINE_DIR = BASE / "public" / "timeline"


def build_snapshots(target_date: str = None):
    today_str = target_date or date.today().isoformat()
    total = 0

    for market in ["IN", "US"]:
        src_dir = INTELLIGENCE_DIR / market
        if not src_dir.exists():
            continue

        out_dir = TIMELINE_DIR / market
        out_dir.mkdir(parents=True, exist_ok=True)

        recommendations = []
        for f in src_dir.glob("*.json"):
            if f.name.startswith("_"):
                continue
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                recommendations.append({
                    "ticker": data.get("ticker"),
                    "market": data.get("market"),
                    "intent": data.get("intent"),
                    "conviction": data.get("conviction"),
                    "conviction_pct": data.get("conviction_pct"),
                    "direction": data.get("direction"),
                    "asset_regime": data.get("asset_regime"),
                    "market_regime": data.get("market_regime"),
                    "last_price": data.get("last_price"),
                    "price_change_1d": data.get("price_change_1d"),
                    "volatility_regime": data.get("volatility_regime"),
                    "cvar_95": data.get("cvar_95"),
                    "supporting_signals": data.get("supporting_signals", []),
                    "opposing_signals": data.get("opposing_signals", []),
                })
            except Exception:
                continue

        snapshot = {
            "date": today_str,
            "market": market,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_stocks": len(recommendations),
            "recommendations": recommendations,
        }
        out_file = out_dir / f"{today_str}.json"
        out_file.write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
        print(f"Timeline {market}: {len(recommendations)} stocks -> {out_file.name}")
        total += len(recommendations)

    return total


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    count = build_snapshots(target)
    print(f"Total: {count} stock snapshots built")
    sys.exit(0 if count > 0 else 1)
