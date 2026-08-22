# FinVest

A financial intelligence platform combining a quantitative decision engine, real-time news sentiment, and institutional flow tracking — with cross-referencing between signal sources most platforms keep siloed.

**Live at:** [finvest.fintaxlife.com](https://finvest.fintaxlife.com)

## What this does for you

- **Screen ~2,300 stocks across 8 markets** (US, India, UK, Hong Kong, China, Japan, Australia, Singapore) by 40+ filters — valuation, quality, momentum, volatility, technicals — instead of checking each market separately.
- **Open any stock and see the full picture in one place**: price chart with technical overlays, fundamentals, quarterly results, peer comparison, recent news, and a computed verdict (intrinsic value vs. market price, market regime, conviction score) — no tab-hopping between a charting site, a fundamentals site, and a news site.
- **Ask for AI-generated analysis** on any ticker — a bull case, bear case, key risks, and what to watch, grounded in that stock's actual current data rather than a generic chatbot answer.
- **See what insiders and institutions are actually doing** — SEC Form 4 insider trades and 13F hedge fund positions, refreshed daily, explained in plain English (the Hedge Fund Explorer's "what this means" banner), not just raw filing tables.
- **Track India-specific flows most platforms skip**: daily FII/DII (foreign/domestic institutional investor) flows and BSE/NSE corporate announcements.
- **Everything refreshes automatically, daily** — you're not looking at stale data; the whole pipeline (prices, fundamentals, news, insider filings, institutional flows, the quant signal engine) re-runs every day without anyone manually triggering it.

## What's in here (architecture, for contributors)

- **Quant intelligence engine** (`FinSight/quant_system/`) — a 9-layer pipeline (regime detection, signal efficacy, probability modeling, backtesting, decision engine, LLM interpretation, portfolio risk) producing daily position-intent recommendations across US and Indian equity markets.
- **News intelligence** — a continuous news pipeline (sentiment/impact scoring across Reuters, Moneycontrol, Economic Times, CNBC, and others) synced into the same data layer as the quant engine.
- **Signal reconciliation** — the two sources above are cross-referenced (`/api/insights`) to flag when quant conviction and news sentiment agree or diverge on the same ticker, rather than presenting them as separate, unrelated feeds.
- **Insider/institutional flow tracking** — SEC Form 4 and 13F data, hedge fund position tracking.
- **Frontend** (`FinSight/frontend/`) — React + TypeScript + Tailwind.
- **Backend** (`FinSight/backend/`) — FastAPI, Python 3.11.

## Architecture

Data lives off-repo, on purpose:
- **Cloudflare R2** — per-ticker market data (price history, fundamentals, technicals), overwritten in place daily rather than archived, so storage stays flat instead of growing forever.
- **Supabase (Postgres)** — structured data: news articles, daily digests, live intelligence snapshots, and a *bounded* 90-day intelligence history with automatic pruning.
- **GitHub Actions** — the daily refresh pipeline, split into independent jobs so one slow step doesn't block the rest.

This repo is source code only. It does not, and will not, accumulate data snapshots in git history — that was a real problem in an earlier iteration of this project, and the fix was structural, not just a cleanup pass.

## Local development

### Backend
```bash
cd FinSight/backend
pip install -r requirements.txt
cp .env.example .env   # fill in your own R2/Supabase/Groq credentials
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd FinSight/frontend
npm install
npm run dev
```

## License

AGPL-3.0 — see [LICENSE](LICENSE). If you run a modified version of this as a network service, the AGPL requires you to make your modified source available to users of that service.
