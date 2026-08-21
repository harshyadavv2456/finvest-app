# FinVest build TODO — tracks everything requested, kept updated live

This file exists because the user explicitly asked for one: a persistent checklist of everything they asked for, updated as work happens, so nothing gets silently dropped. Check `IMPLEMENTATION_NOTES.md` for the detailed "why/how" behind each item — this file is just the checklist.

Legend: `[x]` done + verified live · `[~]` in progress · `[ ]` not started

## Credentials received and wired in (Render + GitHub Actions secrets, all verified working)
- [x] FRED_API_KEY
- [x] FINNHUB_API_KEY
- [x] FIRMS_MAP_KEY
- [x] DATA_GOV_IN_API_KEY
- [x] AngelOne: ANGELONE_API_KEY, ANGELONE_CLIENT_CODE, ANGELONE_MPIN, ANGELONE_TOTP_SECRET
- [x] Upstash Redis: REDIS_URL, UPSTASH_REDIS_REST_URL/_TOKEN

## Workstream A — Macro/geopolitical overlay
- [x] FRED ingestion (yield curve 2Y/10Y, Fed funds, CPI, unemployment) — live at `/api/macro-context/current`
- [x] NASA FIRMS (active fires, physical-disruption proxy)
- [x] USGS earthquakes (no key needed)
- [x] Finnhub — backstop quote function built (`fetch_finnhub_quote`), not yet consumed anywhere as an actual cross-check
- [x] R2 caching, 6h TTL
- [ ] A2: feed `macro_context` into `layer2b_pm_regime_engine.py` as an actual strictness modifier (module + API exist; not yet wired into the live decision engine)
- [~] A3: no-key graceful degradation for Groq features — informally true (verified live earlier), not formally reviewed against every code path

## Workstream F — India macro data
- [x] data.gov.in: retail CPI (1 of 9 datasets — the only one with a confirmed resource ID)
- [ ] data.gov.in: WPI, IIP, GST collection, forex reserves, crude oil production, PLFS unemployment, fiscal deficit, GDP growth — need resource IDs looked up manually (site blocks scripted catalog search)
- [ ] RBI DBIE — no public API exists; needs a scheduled export-scrape job, not started

## Workstream D — AngelOne SmartAPI (StrataX + Indian real-time data)
- [x] D1: Auth (TOTP + session) — verified live twice (local + Render logs)
- [x] D2: Provider module (`angelone_provider.py`) — LTP, candles, market depth, option Greeks, gainers/losers, OI buildup, read-only, no order-placement methods anywhere
- [x] D3: Fallback discipline — shared decorator, verified
- [x] Instrument master download — root-caused (Angel One's server, not client network), fixed with resumable Range downloads, verified on 3 networks
- [x] D4: Option chain reconstruction — verified live in the browser
- [x] D4/D5 widened to the FULL F&O universe (64 symbols: 4 indices + 60 stocks) — not limited to NIFTY/BANKNIFTY, per explicit instruction
- [x] D5: `/api/stratax/data-status` reflects real AngelOne health
- [ ] D5 remainder: retire/archive `nse_fetcher.py` (deliberately deferred — CSV still the safety-net fallback, not actively harmful to leave)
- [x] StrataX widened to the FULL F&O universe (64 symbols) - verified live for both NIFTY (index) and RELIANCE (stock)
- [x] **"Sensibull level, top it"** — Max Pain, PCR (OI), ATM straddle price, resistance/support strikes, OI-change tracking (R2 snapshot-diff), total call/put OI+volume - all shipped, verified live in the actual browser at finvest.fintaxlife.com/stratax with real numbers (Max Pain 24250, PCR 1.05, ATM Straddle 162.55, Resistance 24300)
- [x] **"All real-time Indian-market data should come from AngelOne"** — `/api/ticker/{ticker}/realtime` (the endpoint used app-wide for live price display) now tries AngelOne first for every IN-market ticker before yFinance. Verified live: RELIANCE.NS returns `"source": "angelone_realtime"` with a real current price, not the 15-20min-delayed yFinance figure.
- [x] Real Greeks (delta/gamma/theta/vega) - was fetching from optionGreek and discarding; now wired through schema + Delta column in the table, verified live (real delta/theta/vega values in production API response, changeInOI also now populating via the R2 snapshot-diff)
- [ ] Market depth (D2 already exposes it) not yet surfaced anywhere in the UI
- [ ] WebSocket streaming — deliberately not built (no concrete latency need yet, per the spec's own instruction not to add it speculatively)

## Workstream E — New India FinDash
- [x] E1: Feature-parity audit (full inventory written in `IMPLEMENTATION_NOTES.md`)
- [ ] E2: Build the new India-only FinDash inside `FinSight/frontend/`, AngelOne-first
- [ ] E3: Retire `FinSight/FinDash/`, `apps/FinDash/` once E2 verified

## Workstream B — UI
- [x] B1: Command palette (Ctrl+K/Cmd+K) — verified live in browser, real Vercel build
- [x] B2: Correlation-surface view — shipped, verified live in the browser. Also found the whole "Signal Reconciliation" page/route/nav item existed in the dev repo but was NEVER actually deployed to production before this — restored it while shipping B2. Also found and fixed a real N+1 query bug along the way (`/api/insights/divergent`: 32s → 3.6s live, ~500 individual Supabase queries collapsed into one bulk fetch)
- [ ] B3: Ticker dossier slide-over/modal
- [ ] B4: General visual consistency pass

## Workstream C — Remaining hardening
- [x] C1: Groq usage tracking wired into every remaining call site
- [ ] C2: AMC Phase 2 — point-in-time snapshot mechanism
- [ ] C3: AMC Phase 3 — portfolio risk limits as an enforcement gate + live VaR/drawdown
- [x] C4: NIFTYBEES.NS NaN bug — fixed as a global response-level guard
- [x] C5: `data_validator.py` — verified already a real enforced gate
- [x] C6: Pipeline failure alerting — done earlier in session
- [x] C7: Duplicate `render.yaml`/`runtime.txt` — removed

## Infra / pipeline fixes found along the way (not in the original spec, but real bugs)
- [x] GitHub Actions secrets were never configured at all — root cause of the pipeline never actually pushing data
- [x] `feedparser`/`nsepython`/`websocket-client` missing from requirements.txt
- [x] Screener/top-opportunities/Mnemos/alpha-rankings all empty — aggregate files never migrated to R2
- [x] Vercel auto-deploy broken — documented, needs a manual dashboard reconnect (can't fix via API)

## Explicit follow-up instructions still open
- [ ] Wire AngelOne as the real-time source for all Indian-market data app-wide, not just StrataX
- [ ] Build StrataX up to/past Sensibull's analytics depth
- [ ] Use FRED/Finnhub/FIRMS/data.gov.in more fully — more datapoints, more analysis surfaced in the product, not just fetched and cached
