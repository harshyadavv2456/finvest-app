#!/usr/bin/env python3
"""Append-only universe expansion for FinSight/tickers.txt.

Finds companies that are big and liquid in their home market but not yet in tickers.txt, and APPENDS them. It can never delete, reorder or rewrite an existing line:
the file is read as bytes, new lines are appended, and the result is verified to start with exactly the original bytes (otherwise the original is restored and the run fails).

Selection (all rules are explicit and logged to FinSight/ticker_additions.csv):
  * source: Yahoo's equity screener per home exchange (NSE, LSE, HKEX, JPX, ASX, SGX, SSE/SZSE, NYSE/Nasdaq/AMEX),
  * market cap in USD above a per-market threshold (a company "crosses" the threshold as it grows, so the weekly run picks it up),
  * traded value (3-month average volume x price) above MIN_TURNOVER_USD,
  * home-currency lines only (no depositary receipts, CDIs, international order-book copies), plain-equity symbols only (no warrants, units, preferreds, funds),
  * new names are appended in descending market-cap order, at most --max-add per run, and never beyond TOTAL_CAP lines
    (the daily refresh needs ~4 s per ticker and must finish inside its 5 h job limit; appended names are processed last, so a slow day can only delay the newest additions).
Usage:  python expand_universe.py [--dry-run] [--max-add N] [--tickers PATH] [--log PATH]"""
import argparse, csv, datetime as dt, json, re, sys, time
from pathlib import Path

FINSIGHT = Path(__file__).resolve().parents[2]
TOTAL_CAP = 4200
MIN_TURNOVER_USD = 2_000_000
# market: (screener exchange codes, home currencies, symbol regex, USD market-cap threshold, FX ticker = local currency per USD, fallback rate)
MARKETS = {
    "US": (["NMS", "NYQ", "NGM", "NCM", "ASE"], ["USD"], r"^[A-Z]{1,5}(-[AB])?$", 10e9, None, 1.0),
    "IN": (["NSI"], ["INR"], r"^[A-Z0-9&-]{1,20}\.NS$", 3e9, "INR=X", 88.0),
    "UK": (["LSE"], ["GBp", "GBP"], r"^[A-Z0-9]{2,5}\.L$", 5e9, "GBP=X", 0.75),
    "HK": (["HKG"], ["HKD"], r"^\d{4,5}\.HK$", 10e9, "HKD=X", 7.8),
    "JP": (["JPX"], ["JPY"], r"^\d{4}[A-Z]?\.T$", 5e9, "JPY=X", 150.0),
    "AU": (["ASX"], ["AUD"], r"^[A-Z0-9]{3,5}\.AX$", 3e9, "AUD=X", 1.5),
    "SG": (["SES"], ["SGD"], r"^[A-Z0-9]{3,4}\.SI$", 3e9, "SGD=X", 1.3),
    "CN": (["SHH", "SHZ"], ["CNY"], r"^\d{6}\.(SS|SZ)$", 10e9, "CNY=X", 7.2),
}
JUNK_NAME = re.compile(r"\bSDR\b|\bCDI\b|DEPOSITARY|\bGDR\b|\bADR\b|\bETF\b|\bFUND\b|\bWARRANT|\bRIGHTS?\b|\bUNITS?\b|\bPREF", re.I)
LONDON_IOB = re.compile(r"^0[0-9A-Z]{3}\.L$")           # London international order book: foreign stocks quoted in London


def norm(s):
    return s.strip().lstrip("﻿").strip().upper()


def existing_set(path):
    return {norm(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if norm(l) and not norm(l).startswith("#")}


def append_only(path, new_symbols):
    """Append symbols to the file WITHOUT touching a single existing byte; verify, and restore the original on any violation. Returns the number appended."""
    p = Path(path); before = p.read_bytes()
    have = existing_set(p); add = []
    for s in new_symbols:
        if norm(s) not in have and norm(s) not in {norm(a) for a in add}: add.append(s.strip())
    if not add: return 0
    sep = b"" if before.endswith(b"\n") or not before else b"\n"
    after = before + sep + ("\n".join(add) + "\n").encode("utf-8")
    p.write_bytes(after)
    chk = p.read_bytes()
    if not chk.startswith(before) or not existing_set(p) >= have or len(chk) != len(after):
        p.write_bytes(before); raise RuntimeError("append-only invariant violated; original restored")
    return len(add)


def _fx(ticker, fallback):
    if ticker is None: return 1.0
    try:
        import yfinance as yf
        v = float(yf.Ticker(ticker).fast_info["last_price"])
        return v if 0.001 < v < 100000 else fallback
    except Exception:
        return fallback


def screen_market(market, have):
    import pandas as pd, yfinance as yf
    from yfinance import EquityQuery as Q
    ex, cur, rx, usd_min, ft, fb = MARKETS[market]
    rate = _fx(ft, fb); loc_min = usd_min * rate
    rows, off = [], 0
    while True:
        q = Q("and", [Q("is-in", ["exchange"] + ex), Q("gt", ["intradaymarketcap", loc_min])])
        for attempt in range(3):
            try:
                r = yf.screen(q, size=250, offset=off, sortField="intradaymarketcap", sortAsc=False); break
            except Exception as e:
                r = None; time.sleep(3 * (attempt + 1))
        if not r: break
        qs = r.get("quotes", []); rows += qs
        if len(qs) < 250 or off > 6000: break
        off += 250; time.sleep(0.6)
    out = []
    pat = re.compile(rx)
    for x in rows:
        sym = str(x.get("symbol", "")).strip()
        if not sym or norm(sym) in have or not pat.match(sym.upper()): continue
        if x.get("currency") not in cur or LONDON_IOB.match(sym.upper()): continue
        name = str(x.get("shortName") or x.get("longName") or "")
        if JUNK_NAME.search(name): continue
        cap, px, vol = x.get("marketCap"), x.get("regularMarketPrice"), x.get("averageDailyVolume3Month")
        if not cap or not px or not vol: continue
        px_usd = px / rate / (100.0 if x.get("currency") == "GBp" else 1.0)
        turnover = vol * px_usd
        usd_cap = cap / rate
        if usd_cap < usd_min or turnover < MIN_TURNOVER_USD: continue
        out.append(dict(ticker=sym, market=market, name=name, usd_cap_bn=round(usd_cap / 1e9, 2), turnover_usd_m=round(turnover / 1e6, 1)))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--max-add", type=int, default=120)
    ap.add_argument("--tickers", default=str(FINSIGHT / "tickers.txt")); ap.add_argument("--log", default=str(FINSIGHT / "ticker_additions.csv"))
    a = ap.parse_args(argv)
    have = existing_set(a.tickers); room = max(0, TOTAL_CAP - len(have))
    cands = []
    for m in MARKETS:
        try: found = screen_market(m, have)
        except Exception as e: print(f"[{m}] screen failed: {str(e)[:100]}", file=sys.stderr); continue
        print(f"[{m}] new candidates above threshold: {len(found)}")
        cands += found
    cands.sort(key=lambda r: -r["usd_cap_bn"])
    pick = cands[:min(a.max_add, room)]
    summary = dict(date=dt.date.today().isoformat(), existing=len(have), total_cap=TOTAL_CAP, room=room, candidates=len(cands), selected=len(pick),
                   by_market={m: sum(1 for r in pick if r["market"] == m) for m in MARKETS}, dry_run=a.dry_run)
    if pick and not a.dry_run:
        n = append_only(a.tickers, [r["ticker"] for r in pick]); summary["appended"] = n
        newlog = not Path(a.log).exists()
        with open(a.log, "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if newlog: w.writerow(["date", "ticker", "market", "name", "usd_cap_bn", "turnover_usd_m", "source"])
            for r in pick: w.writerow([summary["date"], r["ticker"], r["market"], r["name"], r["usd_cap_bn"], r["turnover_usd_m"], "yahoo-screener"])
    elif pick:
        for r in pick[:40]: print("  would add", r["ticker"], r["market"], r["name"], f"${r['usd_cap_bn']}B")
    print(json.dumps(summary))
    return summary


if __name__ == "__main__":
    main()
