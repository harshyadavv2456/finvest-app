# FinVest / FinSight — Full Repository Audit & Action Reference
**Date:** 2026-08-20 (living document, updated through this session) · **Scope:** Entire `E:\FinVest2` repo (171,667 git-tracked files) · **Mode:** Analysis only, zero changes made

**This is the one file to refer back to.** It consolidates everything found across the full audit: what the system currently has (§3A), what's broken and why (§0–§3), what to fix and in what order (§7), how to run it for free going forward (§6–§6A), and what's worth adding on top (§9). If a decision needs to be made, it's captured as an open question in §8.

---

## 0. TL;DR — what's actually broken

1. **You are using Git/GitHub as a database, and it has already failed.** 168,000+ of your 171,667 tracked files are *data*, not code — daily-refreshed JSON/CSV/Parquet committed straight into the repo. The local `.git` folder measured **173.7 GB**. GitHub's free/normal tier is built around repos in the tens-to-low-hundreds-of-MB range; this is 1,000x that. This isn't a "getting close to a limit" situation, it's a "the tool being used is fundamentally the wrong tool" situation.
2. **The single biggest offender is dead code that's still bleeding storage into history.** `FinSight/public/intelligence/history/` = **152,861 tracked files** (~600MB+ in the working tree alone), a full snapshot of every ticker's intelligence JSON, once per day, kept forever. It's been silently **broken/abandoned since 2026-06-28** (nothing written to it since) but the 152K files are still sitting in the repo being reshipped on every clone/deploy.
3. **`.gitignore` already tries to exclude the data folders — and it does nothing.** Lines 77–78 (`FinSight/data/`, `FinSight/public/`) were added *after* those folders were already committed. Git ignores unmatched untracked files only; already-tracked files keep being tracked and keep growing. This is why the "fix" you may have already tried never worked.
4. **The repo was already reset once.** Git history starts at `Initial commit` on **2026-06-27** — 50 commits total, ~54 days old. That's a strong signal the *previous* repo hit a GitHub size/limit wall and someone force-reinitialized it — and then immediately re-committed the same 168K-file data tree into the fresh repo, restarting the same clock.
5. **Massive duplication at the code level**, independent of the data problem: 3 copies of the FinDash frontend, 4 different "unified" frontend shells, ~12 competing daily-refresh orchestrators, ~10 duplicate start scripts, 3 copies of `Indian_Announcements` CSVs, dozens of one-off session-summary `.md` files, and a literal `sec_10y_pipeline (7).py` (a Windows duplicate-download artifact) committed to source control.
6A. **A second, more urgent secret exposure was found outside the repo — resolved by design, not by editing it.** `E:\FinVest News\finvest_news_intelligence_v2.py` — a genuinely valuable, currently-live 24/7 news-intelligence system (see §3A.5) — has four secrets hardcoded in plaintext, including a **Gmail App Password** and a Groq key confirmed actively in production use right now. **Per your direction: this script keeps running locally exactly as it is, untouched, forever — it never enters the repo, so the secrets never enter git either.** The integration is a one-way sync (§3A.5/§7 Phase 1B) that reads the SQLite DB and pushes rows to Supabase; the script and its hardcoded values are simply never part of that path. Only discipline required: never `git add` that folder.
6. **Free-infra story is already half-built and forgotten — twice.** Supabase is already wired up (`FinSight/SUPABASE_SETUP.md`) but only for auth. Separately, the backend already contains a **half-built GitHub Releases fallback** (`app/download_data.py`, actively called on every startup) that tries to download a data ZIP from a GitHub Release if the local data folder is empty — proof someone already recognized "data doesn't belong in the git tree" and started down the right path, then abandoned it: the release URL points at a `data-v1` tag with no refresh mechanism, no script anywhere uploads a new ZIP, and it doesn't fire unless the folder is *completely* empty. It's a dead stub, not a working pipeline — but it's evidence the fix direction was already correct, just never finished.
7. **A live API key is committed in plaintext, in a public-readable git history.** `apps/FinAx/groq_key.txt` contains a real Groq API key (`gsk_76N7...`, full value redacted here but present in the file and in every commit that touched it). This needs to be **rotated immediately**, independent of anything else in this report, and is the reason the repo must **not** be made public (see §7) until it and its git history are cleaned.

Everything below is the evidence trail, then a concrete migration plan.

---

## 1. Scale of the repository (hard numbers)

| Metric | Value |
|---|---|
| Git-tracked files (`git ls-files`) | **171,667** |
| Total commits | 50 (all since 2026-06-27) |
| **`.git` directory size (measured)** | **≈ 173.7 GB** (177,849 MB) on disk locally. This is not an estimate — it's a direct `Get-ChildItem -Recurse` sum over `.git`, and it took several minutes just to enumerate. For scale: GitHub actively emails owners and restricts pushes well before 5GB, and hard-blocks individual files over 100MB. A 173GB `.git` is not "approaching" the limit, it has blown past anything GitHub free tier is designed to host, by roughly 30-170x depending which threshold you compare to. |
| `.github/workflows/` | **Empty directory** — despite README claiming "GitHub Actions automatically refreshes data at 6:00 AM IST daily," no workflow file exists anywhere in the tree. The daily refresh is actually run **manually/locally** via batch scripts on your machine. |

**Additional git-health red flag found while measuring this:** `.git/objects/pack/` contains multiple `tmp_pack_*` files and pack files with **no corresponding `.idx` index** (git itself calls these out as "garbage found" / "no corresponding .idx"). These are leftovers from **interrupted `git gc` or interrupted push/fetch operations** — consistent with repeatedly trying to push a repo that's too large for the connection/remote to accept cleanly, timing out mid-operation, and leaving orphaned pack data on disk that a normal `git gc` never got the chance to clean up. This compounds the 173.7GB figure with junk that isn't even reachable from any commit.

**This turns out to be a much bigger effect than a footnote.** A direct listing of `.git/objects/pack/` shows **918 pack-file entries**, and the directory's own reported total is **≈156.6GB** — i.e. the pack directory alone accounts for roughly 90% of the entire 173.7GB `.git` size. A large share of those entries are **orphaned `.tmp-20212-pack-<hash>.pack` / `.idx` / `.rev` triplets, each pack ~100MB, all stamped from a single process (PID 20212) repeating throughout 2026-08-12** — i.e. one git operation (almost certainly a `git gc`, repack, or a push/fetch that kept retrying and failing) that ran for hours on Aug 12, wrote dozens of ~100MB pack fragments, and never finished cleanly, leaving all of them orphaned on disk instead of being consolidated or discarded.

**This is the single cheapest, safest win in this entire audit.** Orphaned `.tmp-*` pack fragments are not reachable from any commit — they are not "your data," they're debris from a crashed/interrupted git maintenance operation. A normal `git gc` (or manually clearing `.git/objects/pack/.tmp-*`) should reclaim a very large fraction of the 173.7GB **without deleting a single tracked file or touching history** — likely tens of GB back before touching the actual `FinSight/data`/`public` bloat described above at all. Worth doing first, before any of the Phase 1-4 work below, purely to see the real baseline size once garbage is cleared.

### File count by top-level area
```
155,787  FinSight/public        ← 90% of the entire repo's file count
 13,413  FinSight/data
  1,134  FinSight/InsiderFlow
    464  apps/Mnemos
    308  FinSight/frontend
    152  apps/FinDash
    152  FinSight/FinDash
     54  FinSight/backend
     34  apps/finvest
     30  FinSight/quant_system
     17  apps/IntrinsIQ
     11  FinSight/artifacts
```

### `FinSight/public` breakdown — the smoking gun
```
154,335  FinSight/public/intelligence
  1,030  FinSight/public/insights
    418  FinSight/public/timeline
```
```
152,861  FinSight/public/intelligence/history/{DATE}/{MARKET}/{TICKER}.json   ← unbounded daily archive, ABANDONED since 2026-06-28
    855  FinSight/public/intelligence/IN/{TICKER}.json    ← current snapshot, ~4KB each
    619  FinSight/public/intelligence/US/{TICKER}.json    ← current snapshot, ~4KB each
```
- `history/` contains **111 distinct dates** (2026-02-22 → 2026-06-26), each with ~1,472 per-ticker JSON files (IN + US combined). Average file size ≈ 4KB → **~600MB of pure historical snapshot data**, none of it ever pruned, none of it referenced by any code path found in the backend (`timeline_api.py` reads `public/timeline/`, not `public/intelligence/history/`).
- It stopped updating on **2026-06-28**, the same day as the repo reset. Nobody appears to have noticed — the feature it fed (if any) has been silently stale for ~8 weeks and nobody is being told.
- **This alone is worth deleting.** It is dead weight that grew the repo by hundreds of MB for zero current benefit.

### `FinSight/data` — the actual live, growing cost center
Sampled directly (`FinSight/data/US/AAPL/`):
```
financials_full.json      42 KB
history.parquet          170 KB
metadata.json              0.2 KB
minute_1m.parquet      2,941 KB   ← minute-level intraday bars
news.parquet            1,480 KB
tech_indicators.parquet   192 KB
------------------------------------
≈ 4.8 MB per US ticker
```
Ticker-folder counts per market (rough, from file-count / ~6 files-per-ticker):
```
IN ≈ 818 tickers   US ≈ 615   UK ≈ 160   HK ≈ 153   CN ≈ 148   JP ≈ 143   AU ≈ 134   SG ≈ 64
≈ 2,235 tickers total across 8 markets
```
At even a conservative 2–3MB/ticker average (IN/smaller markets carry less minute data than US), that's **roughly 5–7GB of working-tree data**, rewritten in large part **every single day** by the refresh pipeline. Parquet is a binary/compressed format — git's delta compression gets very little purchase on day-over-day diffs of `minute_1m.parquet`, so each daily commit adds close to the full file size again into the pack, forever. This is the real engine of the "exceeding GitHub limit" problem, not just the dead history folder.

### `FinSight/InsiderFlow` — smaller, but structurally wasteful
- 1,121 files under `sec_output_10y/`, of which **560 are `.full_fetch_done` marker files** — i.e. exactly half the file count in that directory is empty sentinel files, doubling directory entries for no data value. Trivial to consolidate into one manifest/state JSON.
- A literal duplicate-download artifact is committed: `FinSight/InsiderFlow/sec_10y_pipeline (7).py` sitting next to the real `sec_10y_pipeline.py`.

---

## 2. Why `.gitignore` isn't helping (root cause of "it should have stopped growing but didn't")

```
.gitignore (lines 77-80):
FinSight/data/
FinSight/public/
*.parquet
*.CORRUPTED_*
```
These rules were added at some point, presumably specifically to stop this bleeding — but `git ls-files` proves **all 155,787 + 13,413 files under these paths are still tracked**. `.gitignore` only prevents *new, untracked* files from being staged; it has zero effect on paths already known to git. Every `git add -A` in `daily_refresh.py`'s `git_commit_and_push()` step keeps re-adding changes to these already-tracked files, ignoring the ignore rule entirely. This needs an explicit `git rm -r --cached` pass (not done in this analysis, per your instructions) before the ignore rules do anything.

---

## 3. The daily-refresh pipeline: how data actually gets in, and where it's badly duplicated

### 3.1 Entry points (all of these exist simultaneously, overlapping in responsibility)

| File | Role (as written) |
|---|---|
| `daily_refresh.bat` (root) | Delegates to `FinSight/refresh_and_deploy.bat`, then separately calls `InsiderFlow/build_signals.py` |
| `daily_refresh.py` (root) | Full standalone Python orchestrator: stock data → screener → InsiderFlow → FII/DII → announcements → StrataX → intelligence → **git add/commit/push itself** |
| `daily_refresh2.py` (root) | A *second*, newer standalone orchestrator ("v2.1"), also full pipeline, adds internet-connectivity retry logic and a 90-min cap specifically for InsiderFlow, writes `public/timeline/{market}/{date}.json` snapshots (this is a **second unbounded daily archive**, currently active, growing ~2 files/day forever) |
| `FinSight/daily_refresh.py` | A **third**, separate file with the same name, different content, inside `FinSight/` |
| `FinSight/daily_refresh_final.py` | A fourth orchestrator — referenced in `daily_refresh2.py`'s own docstring as what it "calls," but it doesn't actually call it; the docstring is stale |
| `FinSight/daily_refresh_orchestrator.py` | A fifth orchestrator |
| `FinSight/refresh_and_deploy.bat` | The one the root `.bat` actually delegates to |
| `FinSight/data_refresh/` (package) | `__main__.py`, `refresh_market_data.py`, `refresh_positions.py`, `refresh_signals.py`, `run_daily_simulation.py`, `test_3_days.py` — a **sixth**, more structured take on the same problem, apparently unused by any of the above |
| `FinSight/scripts/refresh_all.py`, `automation_runner.py`, `alpha_ranking_batch.py` | More refresh entry points |
| `FinSight/build_timeline_snapshots.py`, `FinSight/sync_positions.py` | Standalone pieces that overlap with steps already inside the orchestrators above |

**Net effect:** nobody reading this repo today — including future-you — can tell which script is the source of truth. At minimum 3 of these (`daily_refresh.py` root, `daily_refresh2.py` root, `FinSight/daily_refresh.py`) claim to be "the" complete daily refresh. Given the git log shows same-day duplicate commits on 5 separate dates (2026-08-08, 07-29, 07-25, 07-21, and 06-29 each have two "Daily refresh" commits), it's likely more than one of these has actually been run in production, sometimes on the same day, sometimes producing conflicting/duplicate commits.

### 3.2 Start / launch script sprawl (10 files, same job)
`start.bat`, `start.ps1` (root), `FinSight/START.ps1`, `FinSight/start_all.bat`, `FinSight/start_all.ps1`, `FinSight/start_backend.bat`, `FinSight/start_backend.ps1`, `FinSight/start_frontend.bat`, `FinSight/start_frontend.ps1`, `FinSight/start_production.bat`, `FinSight/launcher.bat`.

### 3.3 GitHub-push script sprawl (3 files, same job)
`FinSight/push_automation.ps1`, `FinSight/push_to_github.ps1`, `FinSight/setup_github.ps1`.

### 3.4 Frontend app quadruplication
1. `FinSight/frontend/` — the "real" FinSight React app per README
2. `FinSight/FinDash/` — a FinDash copy
3. `FinSight/FinDash/FinDash/` — a **second, nested copy of the same FinDash app inside itself** (same `App.tsx`, same `components/`, same `services/` — e.g. `services/geminiService.ts`, `services/telegramService.ts`, `AIChatbot.tsx`, all duplicated verbatim)
4. `apps/FinDash/` — a **third** copy of FinDash, at the top level
5. `apps/finvest/` — a **fourth**, separate React app: an in-progress "unified authority" shell (`src/authority/findash/`, `src/authority/finsight/`, `src/pages/FinDashPage.tsx`, `src/pages/FinSightPage.tsx`) that appears to be an abandoned attempt to merge FinDash + FinSight into one app. Not referenced in `vercel.json`, not documented in the README.

You are paying (in file count, in `npm install` time, in mental overhead) for four frontends where one — maybe two if the merge-into-one-app idea (`apps/finvest`) gets finished — is needed.

### 3.5 Other duplication
- `Indian_Announcements/*.csv` exists **three times**: at repo root, in `FinSight/Indian_Announcements/`, and again inside `FinSight/Indian_Announcements/indian_market_filings/`.
- `render.yaml` and `runtime.txt` each exist in two places (root and `FinSight/backend/`), with no indication which one Render actually reads.
- `tickers.txt` and `tickers_old.txt` both tracked.
- Docs: 20+ ad-hoc status/summary markdown files with no lifecycle (`DEPLOY_NOW.md`, `FINAL_DEPLOYMENT_SUMMARY.md`, `FINAL_FIXES_SUMMARY.md`, `FIXES_COMPLETED.md`, `FIXES_IMPLEMENTED.md`, `DEPLOYMENT_VERIFICATION.md`, `PUSH_NOW.md`, 8 separate `STRATAX_*.md` files). These read like leftover session summaries from previous AI-assisted work sessions, never cleaned up. Harmless in size, but they actively make it harder to find the *current* truth about deployment/config.
- `FinSight/quant_system/_LEGACY_DISABLED_run_daily_intelligence.py` — explicitly named as dead, still committed.

---

## 3A. System capability inventory — everything this codebase currently does

This is the full functional map: every backend module, every quant layer, every frontend page, and every satellite app, so decisions in §6–§7 can be made against what's actually live, not guessed at.

### Backend (`FinSight/backend/app/`) — FastAPI, 18 routers + ~45 inline routes in `main.py`

| Module | What it does |
|---|---|
| `stock_intelligence.py` | Deep per-stock analytics combining all data sources |
| `analytics_engine.py` | Technical analysis, pattern detection, multi-factor scoring |
| `hedge_fund_tracker.py` | Tracks 145+ institutional investors from 13F filings |
| `insider_intelligence.py` | Insider-trade cluster detection + insider track records |
| `insider_flow.py` | SEC Form 4 + 13F API surface; FII/DII daily analysis |
| `ai_engine.py` / `ai_analysis.py` | Groq-LLM-powered narrative insights across all data sources |
| `portfolio_analyzer.py` | Portfolio analysis with smart-money overlay |
| `intelligence_api.py` | Serves the 14-layer quant intelligence JSON per ticker |
| `announcements_api.py` | Corporate announcements, insider filings, institutional flows |
| `finbot_api.py` | Natural-language Q&A over platform data (Groq LLaMA) |
| `timeline_api.py` | **The currently-active** daily recommendation history store (writes `public/timeline/`) |
| `position_tracker_api.py` | Historical recommendation memory with exit signals |
| `pm_regime_api.py` | Precious-metals macro regime context (gold/silver ETF based) |
| `intrinsiq_api.py` | Institutional-grade valuation engine |
| `stock_dashboard_api.py` | One consolidated "everything about this stock" endpoint |
| `notifications_api.py` | Unified alert routing (email/Telegram) |
| `mnemos_api.py` | Serves Mnemos' daily buy-side intelligence briefs |
| `system_health.py` | Reads `state/refresh_registry.json`, reports per-module data freshness — **this already exists and is exactly the piece needed for automation monitoring, see §6** |
| `cusip_mapper.py` | Maps 13F CUSIPs to tickers |
| `screener_engine.py` / `screener_snapshot.py` | Builds the cross-market screener table |
| `data_access.py` | Local parquet/JSON read layer — the thing that has to change first if data moves off-disk |
| `download_data.py` | Abandoned GitHub-Releases data-fetch fallback (see finding above) |
| `stratax/` (7 files) | NSE option-chain fetching, sector rotation, AI-assisted strategy analysis |

Plus ~45 routes defined directly inside `main.py` (2,788 lines) covering tickers, screener, ratios, minute/daily price data, fundamentals, peers, quarterly financials, realtime quotes, news, AI insights, insider-flow signals, smart-money summaries, market overview, portfolio snapshot/simulation, top opportunities, and system status. **Having ~45 routes live in the main app file instead of routers is itself worth cleaning up separately from the storage problem** — it makes the file hard to navigate and is a likely source of the "which script is canonical" confusion seen elsewhere in this repo.

### Quant system (`FinSight/quant_system/`) — the actual insight-generation engine

A genuine 9-layer (some numbered up to 14 in output metadata) institutional-style pipeline, not a toy:

1. **Signal Factory** — normalizes raw market data into timestamped signals (price/vol state, technical, fundamental)
2. **Regime Engine** — Hidden Markov Model market + asset regime classification, separated (market regime vs. this-asset regime vs. relative strength)
3. **PM Regime Engine** — gold/silver-based systemic risk overlay that modifies how strict the rest of the system is
4. **Signal Efficacy** — walk-forward validation of which signals actually work, conditional on regime, with pairwise correlation tracking to avoid double-counting correlated signals
5. **Probability Engine** — return-distribution percentiles, conditional volatility forecasting, downside risk (CVaR at multiple stress levels)
6. **Backtesting Engine** — realistic walk-forward backtests with "failure attribution memory" (tracks *why* a setup failed, not just that it did)
7. **Decision Engine** — combines probability + valuation gap + smart-money alignment + risk into an actionable position intent (not just a direction bias)
8. **LLM Interpreter** — turns the structured numeric output into the human-readable rationale text seen in the frontend, under explicit non-negotiable constraints (presumably to stop the LLM from inventing numbers)
9. **Meta-Backtest** — audits the *decisions themselves*: does the system protect capital better than doing nothing, not just "were the trades profitable"
10. **Portfolio Risk / Portfolio Simulator** — correlation-aware position sizing, marginal risk contribution, and a full simulated-capital-over-time run if a user had followed every recommendation

This is the most sophisticated part of the codebase and clearly the most invested-in. It is **not** where the duplication/bloat problem lives — the quant layers are one clean pipeline with one entry point (`run_full_daily_intelligence.py`). One concrete data-quality flag surfaced earlier in this audit: the sampled `AAPL.json` output carries `"top_signals_ic": {}` — an empty object where per-signal information-coefficient data clearly belongs. Worth a dedicated look at Layer 3 independent of this storage-focused pass.

### Frontend (`FinSight/frontend/`) — the live product surface, 42 pages

Grouped by what a user actually sees:
- **Core research**: Stock Dashboard, Stock Detail, Stock Intelligence, Market Intel, Market Overview, Alpha Rankings, Top Opportunities
- **Smart money / institutional**: Insider Flow, Smart Money, Hedge Fund Explorer
- **Decision transparency**: Decision Audit, Decision Review, Decision Timeline View, Confidence Timeline View, Audit Decision, Trust Dashboard — a whole family of pages dedicated to showing *why* the system recommended what it did, which lines up with Layer 6–9's design intent
- **Portfolio**: Portfolio, Portfolio Analyzer, Portfolio Simulator, Active Positions, Tax
- **Satellite-app embeds**: FinDash Page, FinAx Page, IntrinsIQ Page, StrataX Page — the frontend already has first-class pages wrapping the other apps in `apps/`, which argues for consolidating those apps' *logic* here rather than maintaining 4 separate frontend shells (see §3.4)
- **Ops / meta**: System Health, System Status, System Usage, Authority Status, Daily Brief, Daily Command Center, Alerts, Settings, Billing, Auth
- **Sandbox**: AI Pilot Page, Execution Sandbox Page, Friction Page, Disabled Feature Page (naming suggests in-progress/parked features)

### Satellite apps (`apps/`) — separate tools, separate concerns

| App | What it does |
|---|---|
| `Mnemos` (1.0) | **Deprecated per your call — stopped, replaced.** Read the user's Gmail (WSJ/Reuters/Substack newsletters), analyzed with Groq, correlated against a 30-day memory. Writes one dated JSON per day to `apps/Mnemos/output/` — 464 files, unbounded like the other archives. Backend still serves it via `mnemos_api.py`. Slated for removal in Phase 1, replaced by the system below. |
| `IntrinsIQ` | A Gemini-powered valuation tool, originated from Google AI Studio (per its own README) — a scaffold app, not custom-built for this repo |
| `FinAx` | RSS/newsletter feed classifier using Groq — the one with the exposed API key |
| `StrataX` | NSE option-chain fetching + sector-rotation analytics; only 2 dated CSVs present, looks manually run rather than part of the daily cycle |
| `finvest` | The unmerged "authority" shell attempting to unify FinDash + FinSight (see §3.4) — **this name is now the decided public identity for the whole OSS release (§10). Worth finishing this consolidation as the actual public frontend rather than building a new shell — the name-matching folder is already half-built for exactly this job.** |

### 3A.5 FinVest News — a live, working system found outside the repo entirely (new, 2026-08-20)

Not part of the audited repo — lives in a sibling folder, `E:\FinVest News\`, currently untracked by git. Found in response to a direct pointer; worth documenting in full because it's a genuine asset, better than what it replaces, and not a small thing to fold in casually.

| Fact | Detail |
|---|---|
| What it is | `finvest_news_intelligence_v2.py` — a standalone, currently-running 24/7 news intelligence pipeline. Confirmed live: the log shows successful Groq API calls and Telegram sends within the last hour of this audit. |
| Sources | 8 RSS feeds: Reuters Business, Reuters India, Moneycontrol, Economic Times, Business Standard, CNBC Finance, OilPrice, Nasdaq — covering global macro, India markets, US markets, commodities |
| Cycle | Every 15 minutes, continuously |
| Processing | Groq-based sentiment scoring, impact scoring, sector/stock tagging, and reasoning per article; alerts above a threshold score pushed to Telegram; a daily HTML digest email is generated |
| Data volume (as of this audit) | `finvest_news_intelligence.db` (SQLite, 24.8MB): **24,758 articles** in `news_articles`, **110 daily digests** in `daily_digest`, running since ~April 2026 |
| Schema | `news_articles`: id, article_hash, source, category, title, summary, url, published_at, fetched_at (IST/UTC), keyword_score, ai_analyzed, sentiment, sentiment_score, impact_level, impact_score, impacted_sectors, impacted_stocks, impact_reasoning, market_action, key_signal, confidence, alert_sent. `daily_digest`: id, date, digest_html, articles_count, high_impact_count, created_at |
| Delivery | Telegram bot (`@mnemos2`) for real-time alerts, email for daily digest |
| Relationship to `apps/Mnemos` | **This replaces it.** Per your direction, Mnemos 1.0 (Gmail-reading, apps/Mnemos) is stopped/deprecated. This is the working successor — better sourcing (direct RSS, no Gmail dependency), continuous cycle instead of daily batch, and a real relational schema instead of one JSON file per day. |
| Secrets in the script | Four hardcoded in plaintext: a live Groq API key, a live Telegram bot token, a personal Gmail address, a Gmail App Password. **Not a blocker** — per your direction, this script runs locally 24/7, untouched, forever, and never enters the repo. The only new thing being built (below) never touches this file. |
| **What you actually need built** | A one-way **sync script**, separate from `finvest_news_intelligence_v2.py` (which stays exactly as-is), that runs locally alongside it: reads new rows from `finvest_news_intelligence.db` (tracking a watermark — last synced `id` or `fetched_at_utc` — so it only pushes what's new since last run) and upserts them into Supabase Postgres tables mirroring `news_articles` and `daily_digest`. This is the actual deliverable for Phase 1B. |
| Where it fits in the plan | **Phase 1B** (see §7): the sync script is new code living in the FinVest repo (e.g. `FinSight/backend/scripts/sync_news_intelligence.py`), scheduled locally (Windows Task Scheduler, e.g. every 15–30 min) since it needs local filesystem access to the SQLite file — this is the one piece of the pipeline that *can't* move to GitHub Actions, because the data source itself lives on your machine, not the cloud. The cloud backend (`mnemos_api.py` or a renamed successor) then reads from Supabase like any other data source, no direct DB access needed. Retire `apps/Mnemos` (1.0) for real once this is live. |
| Why this matters for §10 (OSS release) | This is genuinely good demo material — a live, continuously-updating, real financial news feed with sentiment/impact scoring is a much stronger "wow, this actually works" moment for a first-time visitor than a JSON of quant numbers. Worth featuring prominently once the secrets are extracted and it's wired into the public demo. |

### What this means for decisions in §7
The system is **not** thin — this is a lot of real, working functionality across market data, insider/institutional flow, a 9-layer quant decision engine, portfolio simulation, an LLM narrative layer, and a Gmail-reading newsletter analyst. None of that changes with the storage fix. The storage/duplication problem is entirely in *how data gets in and stays around*, not in what the system computes or shows — which is good news: the migration in §6–§7 touches the data layer only (`data_access.py`, the refresh scripts, `.gitignore`) and doesn't require rewriting any of the analysis logic above.

## 4. Data input points (what actually feeds the system)

| Source | Feeds | Frequency | Script |
|---|---|---|---|
| Yahoo Finance (`yfinance`) | Price/volume, minute bars, fundamentals, news per ticker, 8 markets | Daily | `update_all_data.py`, `stock_crawler.py` |
| SEC EDGAR (Form 4 + 13F) | Insider trades, hedge fund holdings | Daily (incremental after first run), 90-min cap | `InsiderFlow/run_finsight_pipeline.py`, `sec_10y_pipeline.py` |
| NSE India | FII/DII flows, corporate announcements, insider filings (India) | Daily | `Smart Money Flow/fii_dii_pipeline.py`, `Indian_Announcements/run_collector_fixed.py` |
| NSE option chain | Option chain snapshots (StrataX) | Ad hoc | `StrataX/bulk_option_chain_fetch.py` (only 2 dated CSVs present — looks manually run, not part of the daily cycle) |
| Internal quant pipeline | 9–14 "layers" of derived signals → per-ticker intelligence JSON | Daily | `quant_system/run_full_daily_intelligence.py` (layers 1–9: signal factory, regime engine, probability engine, backtesting, decision engine, LLM interpreter, portfolio risk) |
| Groq / Gemini LLM APIs | Narrative rationale text inside intelligence JSON, chatbot | Per-refresh / on-demand | `ai_engine.py`, `ai_analysis.py`, `finbot_api.py`, FinDash `geminiService.ts`/`groqService.ts` |
| Supabase (Postgres) | **Auth only** — user profiles, OAuth, activity log | On login | `SUPABASE_SETUP.md`, frontend auth calls |

The intelligence JSON output itself is genuinely sophisticated (regime detection, CVaR at 3 confidence levels, percentile return distributions, comparable-setup win rates, sortino ratio, position sizing, upgrade/downgrade conditions) — this is not a toy. But note: in the AAPL sample pulled, `"top_signals_ic": {}` is an **empty object** in a field clearly meant to carry per-signal information-coefficient data. That's either an unpopulated/broken feature or a placeholder shipped to production — worth a dedicated code-level review of `quant_system/layer3_signal_efficacy.py` and `signal_registry.py`, separate from this storage-focused audit.

---

## 5. Current hosting/infra reality (as you described + confirmed in repo config)

| Component | Platform | Plan | Known problem |
|---|---|---|---|
| Frontend (FinSight, FinDash) | Vercel | Free | Fine — Vercel's free static-hosting tier is not the bottleneck |
| Backend API | Render | Free | Free-tier services **spin down after inactivity** and cold-start slowly (the "takes some time to load" you described) — this is standard free-tier behavior, not misconfiguration |
| Data pipeline execution | **Your local machine** | N/A | No GitHub Actions workflow exists despite README claiming one. The pipeline only runs when your machine is on, online, and someone (a script or you) triggers it. `daily_refresh2.py`'s "wait for internet" retry loop is direct evidence this is a machine that isn't always online — i.e., a personal PC, not a server |
| Data storage | **Git/GitHub itself** | Free (repo-hosted) | This is the core anti-pattern. GitHub has no hard "size limit" API block, but it actively warns above ~1GB, degrades clone/fetch performance well before that, and Render's free-tier build pulls the *entire* repo (all 5-7GB+ of history-laden data) on every deploy — this is almost certainly why deploys are slow, not just Render's cold start |
| Auth/user data | Supabase | Free (500MB Postgres, unlimited API requests, 50K MAU per `SUPABASE_SETUP.md`) | Underused — only handles auth, not the financial dataset |

---

## 6. Free-infrastructure recommendation (no code changed, plan only)

The right shape: **stop using git for anything that isn't source code.** Split "what changes daily" from "what defines the system."

| Data type | Current location | Recommended free home | Why |
|---|---|---|---|
| Per-ticker parquet/JSON (`FinSight/data/`) | Git | **Cloudflare R2** (10GB free storage, free egress — the killer feature, since most object stores charge for egress) or **Supabase Storage** (1GB free, but you already have the Supabase project) | Object storage is *built* for exactly this: many small/medium files, overwritten daily, fetched by key. R2's free egress matters a lot given a backend that reads this on every API request |
| Per-ticker intelligence JSON snapshots (current, `public/intelligence/{IN,US}/`) | Git | Same object store, or directly into **Supabase Postgres** (jsonb column, one row per ticker, upserted daily) since it's already wired for auth — this also gets you queryability (filter/sort by conviction, intent, etc.) for free instead of "download every JSON and filter client-side" | You already pay $0 for this Postgres instance; use it |
| Historical daily snapshots (`intelligence/history/`, `public/timeline/`) | Git (dead/growing) | If you want history at all: Postgres table `(date, ticker, market, payload jsonb)` with a retention policy (e.g. keep 90 days, or downsample to weekly after 30 days) — never keep this as a file-per-day-per-ticker on disk again | Bounded growth instead of unbounded |
| InsiderFlow CSVs, FII/DII CSVs | Git | Same object store, or Postgres tables (this is small enough — a few MB — that Postgres is genuinely fine) | Small, structured, benefits from being queryable |
| Source code (backend, frontend, quant_system) | Git | **Stays in Git.** This is what Git is for. | — |
| Scheduled daily refresh | Your local PC, manually/semi-manually triggered | **GitHub Actions on a public code-only repo** — see §6 for why this specifically, and why Render Cron is *not* actually a free option | This removes the dependency on your PC being on and online, and is what your own README already claims exists but doesn't |
| Backend API hosting | Render free (sleeps) | Stays on Render free, **or** move to **Fly.io free tier** / **Railway free trial** if cold-start latency is unacceptable — but note: once the repo itself is small (code-only), Render cold-start improves dramatically because the deploy no longer clones gigabytes of data | Often the "Render is slow" complaint is actually "cloning a bloated repo is slow," which the storage fix mostly resolves on its own |
| Auth | Supabase free | **No change** — already correct | — |

### Why this combination specifically (all free, all real limits checked against your actual scale)
- Cloudflare R2 free tier: 10GB storage + 1M Class A / 10M Class B ops/month + **zero egress fees**. Your estimated ~5-7GB of ticker data fits with room to spare, and free egress matters because your backend will fetch this on every request.
- Supabase free tier: 500MB Postgres, 1GB file storage, 50K MAU, unlimited API requests (per your own `SUPABASE_SETUP.md`) — plenty for structured intelligence rows, signals, and history if you bound retention.
- GitHub Actions free minutes are more than enough for a daily 1-3 hour pipeline run (2,000 min/month ÷ 30 days ≈ 66 min/day budget on private repos with the free tier multiplier, more on a public repo — your `--insider` 90-min cap already shows awareness of exactly this kind of budget).

---

## 6A. Automation architecture — running this on a schedule, for free, without recreating the problem

You asked specifically: not to automate the multi-hour refresh logic itself right now, but to work out how the *whole system* can run on a regular schedule, unattended, without landing back in the same GitHub-limit hole. Two facts (checked live, not from memory) determine the shape of the answer:

- **GitHub Actions is genuinely free and unlimited on public repositories** — no minute cap, single job capped at 6 hours on any plan. On a *private* repo, the free tier is only 2,000 minutes/month (~66 min/day) — nowhere near enough for a 2–4 hour daily job. ([GitHub Actions limits](https://docs.github.com/en/actions/reference/limits), [GitHub Actions free tier explained](https://cicdcalculator.com/github-actions-free-tier))
- **Render Cron Jobs are not free** — they start at $1/month, billed per minute, regardless of plan. Render's web-service free tier (the one hosting the API) is a separate thing from Cron Jobs, and current reporting on whether the web-service free tier itself still exists is inconsistent enough to verify directly on Render's pricing page before relying on it. ([Render pricing 2026](https://www.saaspricepulse.com/tools/render), [Render free-tier status discussion](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026))

**This means, concretely:** the only genuinely free way to run an unattended multi-hour job on a schedule, with no execution-time budget anxiety, is **GitHub Actions on a public repository**. That's a real decision, not a technicality — it means the *code* (not the data, which is moving to R2/Supabase per §6) becomes publicly visible. Two things have to happen before that's safe:

1. **Rotate the leaked Groq key** (§0/§3A) and any other credentials found the same way.
2. **Scrub git history**, not just the current file — the key is in every past commit that touched `groq_key.txt`, which is exactly the `git filter-repo` work already listed as Phase 4. If public-repo automation is the direction, Phase 4 needs to move earlier, before Phase 3.

If you'd rather not make the repo public at all, the fallback is **a genuinely free always-on VM** (e.g. Oracle Cloud's Always Free tier, which — unlike Render/most others — offers a real free-forever ARM compute instance, not a trial) running its own cron via plain `cron`/systemd timers, with no GitHub Actions minute budget to manage at all. This trades "GitHub manages the schedule and shows you a run history" for "one more account to maintain," but sidesteps the public-repo question entirely.

### The design, either way
- **The automation job never runs `git add`/`commit`/`push` for data.** This is the structural fix, not just a policy: once the refresh scripts write to R2/Supabase instead of `FinSight/data/`/`public/`, there is nothing left in the daily job that touches the repo at all — so the "did we forget to exclude a folder" failure mode that got you here can't recur, regardless of how disciplined anyone is later. Only actual code changes go through git, and only via normal commits/PRs, not a scheduled job.
- **Split the monolithic run into independent scheduled jobs**, each within its own time budget, instead of one 2–4 hour block. The code already has the seams for this: `InsiderFlow` already supports `--incremental --max-age-hours 24` and a 90-minute cap (`daily_refresh2.py`), and the step functions in that same file (`step_market_data`, `step_screener`, `step_insider_flow`, `step_fii_dii`, `step_indian_announcements`, `step_intelligence`, `step_timeline`) are already independently callable. Turning each into its own GitHub Actions workflow/job (or a matrix job per market for the market-data step) shortens wall-clock time per run and means one slow/failing step (historically InsiderFlow) doesn't block the rest.
- **Reuse the monitoring you already built, don't build new.** `system_health.py` + `state/refresh_registry.json` already exist specifically to report per-module data freshness, and the frontend already has a `SystemHealthPage.tsx` / `SystemStatus.tsx` / `SystemUsage.tsx` family of pages. Point these at whatever the new scheduled jobs write as their completion state (a timestamp in Supabase, or the existing JSON files relocated off the git-tracked path) and the "is automation actually working" visibility is solved with code that already exists, not a new dashboard.
- **Geography note, worth testing before committing:** GitHub-hosted runners execute from US/EU datacenter IPs; NSE India in particular has historically been sensitive to scraping from outside expected ranges. Worth a one-off manual trigger of the FII/DII and Indian-announcements steps from a GitHub Actions runner early, specifically to confirm NSE doesn't block it, before assuming this part of the automation "just works."

## 7. Prioritized action plan (for your review — nothing executed)

**Phase 0 — today, zero risk**
1. **Full backup of `E:\FinVest2` (code + data + full `.git`) to a separate drive before anything else runs.** In progress as of this update — nothing in Phase 0 onward proceeds until this is confirmed complete and verified.
2. Run `git gc` / clear `.git/objects/pack/.tmp-*` — likely reclaims a large fraction of the 173.7GB before anything else is touched (§1).
3. **Groq key, `apps/FinAx/groq_key.txt`: remove, do not regenerate** — confirmed unused per your direction. Delete the file and scrub it from history (§7 Phase 3); no replacement key needed here.
4. **`E:\FinVest News\finvest_news_intelligence_v2.py`: no action needed.** Confirmed out of scope — it keeps running locally exactly as-is, forever, and never enters the repo, so its four hardcoded secrets never enter git either. Nothing to extract, nothing to rotate.

**Phase 1 — Stop the bleeding (biggest ROI, safest)**
5. Delete `FinSight/public/intelligence/history/` (152,861 dead files, unreferenced by code, already broken since June).
6. `git rm -r --cached FinSight/data FinSight/public` so the existing `.gitignore` rules actually start working, then decide Phase 2 destination before those files vanish from tracking.
7. Consolidate the 12 refresh orchestrators down to **one** canonical script; delete/archive the rest. Same for the 10 start scripts and 3 push scripts.
8. Delete the confirmed cruft: `sec_10y_pipeline (7).py`, `_LEGACY_DISABLED_run_daily_intelligence.py`, `tickers_old.txt`, one of the three `Indian_Announcements` CSV copies. Retire `apps/Mnemos` (1.0) entirely — confirmed stopped/replaced.
9. Consolidate the frontend around `apps/finvest` (§3A.5's naming already matches the decided public identity — finish this consolidation rather than starting a new shell) rather than keeping `FinSight/FinDash`, `apps/FinDash`, and the nested nested-`FinDash/FinDash` copy alive alongside it.

**Phase 1B — Build the news-intelligence sync (new, §3A.5)**
10. `finvest_news_intelligence_v2.py` itself is untouched, out of scope, stays local forever. What gets built: a separate local sync script that reads `finvest_news_intelligence.db` (24.8MB, 24,758 articles, 110 digests, tracked via a watermark so only new rows get pushed) and upserts into Supabase Postgres, scheduled locally (Task Scheduler) since it needs filesystem access to a file that only exists on your machine. Wire `mnemos_api.py` (or its renamed successor) to read from Supabase, and retire `apps/Mnemos` (1.0) for real.

**Phase 2 — Move data off git**
11. Stand up Cloudflare R2 bucket; point the refresh pipeline's write step at R2 instead of `FinSight/data/`/`FinSight/public/`.
12. Point backend `data_access.py` reads at R2 (or Supabase) instead of local filesystem paths.
13. Decide + implement a bounded retention policy for historical snapshots in Postgres.

**Phase 3 — History scrub (moved earlier than originally planned — see §6A)**
10. If public-repo GitHub Actions automation (§6A) is the chosen path, this has to happen *before* Phase 4, not after: use `git filter-repo` (not `filter-branch`) to strip the leaked key and the historical data bloat out of the existing 50 commits. Requires a force-push and a full re-clone by anyone with a local copy.

**Phase 4 — Move execution off your PC**
11. Stand up the GitHub Actions workflow(s) per §6A — split by module, reusing the incremental flags already in `daily_refresh2.py`. Wire completion state into the existing `system_health.py` / `SystemHealthPage.tsx`.
12. Once code-only and public (or on the Oracle-VM fallback), re-measure repo size and Render deploy time to confirm the "slow to load" complaint is resolved.

---

## 8. Open questions worth answering before executing the plan
- Which of the 4 frontend apps (`FinSight/frontend`, `FinSight/FinDash`, `apps/FinDash`, `apps/finvest`) is actually deployed at `finsight.fintaxlife.com` / `findash.fintaxlife.com` right now? Vercel dashboard will confirm — this determines what's safe to delete.
- Which of `render.yaml` (root) vs `FinSight/render.yaml` is the one Render is actually reading? Check the Render dashboard's connected root directory.
- Is `apps/finvest` (the unified authority shell) an active direction or an abandoned experiment? If active, it should absorb FinDash+FinSight rather than living as a fourth option.
- Was `public/intelligence/history/` feeding a frontend feature that quietly broke in June, or was it always write-only/unused? Worth a quick frontend-code grep for `intelligence/history` before deleting, to be certain nothing reads it (a first pass here found no reference in `timeline_api.py`, but a full frontend grep wasn't run as part of this pass).
- ~~Are you comfortable with the code repo being public...~~ **Decided: yes, go public.** Automation runs on GitHub Actions per §6A, once the key is rotated and history is scrubbed (Phase 0 → Phase 3 → Phase 4, in that order, not skipped).
- Is `apps/FinAx/groq_key.txt`'s key still active anywhere else (other apps, other `.env` files not caught by this pass)? Worth a full-repo grep for that specific key string, not just for the pattern `key/secret/token`, before considering the leak contained.
- `apps/Mnemos` (reads the user's Gmail) only has `config.yaml.example` tracked, not a real `config.yaml` — checked directly, looks clean. Its actual Gmail/Groq credentials must live in an untracked local file; worth confirming that's still true going forward (it's an easy thing to accidentally commit later).

---

## 9. What to add — stability layers and one external reference worth borrowing from

Two sources for this section: (a) gaps this audit surfaced that go beyond "fix the storage problem," and (b) [World Monitor](https://www.worldmonitor.app/) ([source](https://github.com/koala73/worldmonitor)), which the user pointed at directly as something to consider folding in — evaluated below on its actual merits, not just because it was suggested.

### 9.1 Stability additions (none of these block the storage migration, but they stop the same failure pattern from recurring)

| Add | Why | Effort |
|---|---|---|
| **Wire pipeline failures into `notifications_api.py`** | `system_health.py` already tracks per-module freshness, but it's passive — someone has to open a page. Once the pipeline runs unattended on GitHub Actions, a silent failure is invisible again, exactly like `intelligence/history/` going dark for 8 weeks with nobody noticing. The alert plumbing already exists (email/Telegram); it just isn't pointed at pipeline health yet. | ~1 hour |
| **Make `quant_system/data_validator.py` a hard publish gate** | Confirm it's actually enforced, not just present. A bad run shouldn't be able to overwrite live intelligence JSON with garbage — hold and alert instead of publishing if NaN counts spike or the AVOID/INITIATE ratio swings wildly vs. yesterday. | Small, high leverage |
| **Add a minimal regression test suite for the quant layers** | No automated tests were found anywhere in this codebase, for a system that outputs position-sizing recommendations. Doesn't need to be exhaustive — even "Layer 4's output stays in sane bounds," "Layer 6 never emits a null intent" would have caught the empty `top_signals_ic` and the abandoned history folder automatically instead of relying on someone eyeballing a JSON file. | Medium, ongoing value |
| **Turn on GitHub secret scanning + push protection explicitly** | Free and automatic on public repos once the repo goes public (§6A) — would have caught the Groq key before it was ever committed. Don't rely on the default; confirm push protection is actually turned on, not just scanning-and-reporting after the fact. | Minutes, free |
| **Real backup strategy once data leaves git** | Git accidentally served as a backup until now. Once data lives in R2 + Supabase, that accidental backup is gone — turn on R2 bucket versioning and check what Supabase's free-tier point-in-time-recovery window actually is (it's limited, not unlimited). Otherwise a bad `DELETE` or a botched migration script has no undo. | Config only, do it during Phase 2 |
| **Split `main.py`'s ~45 inline routes into routers; pick one frontend** | Same disease that produced 12 competing refresh scripts — "which one is canonical" confusion. Not urgent enough to block the migration, but worth doing once. | Medium |

### 9.2 World Monitor — what's actually worth taking from it

World Monitor is a real-time geopolitical/markets intelligence dashboard (maritime tracking, conflict monitoring, a "Country Instability Index," a finance radar for markets/commodities/crypto) built by a different team, open source under **AGPL-3.0**. It is not a stock-decision engine — it doesn't do anything close to FinVest's 9-layer quant pipeline — so this isn't "go integrate their product." Three things from its architecture are worth taking on their own merits:

1. **Add a Redis caching layer (Upstash's free tier) to the storage stack in §6.** World Monitor's core pattern for cheaply serving lots of live external data is a 3-tier cache: Redis → CDN → service worker, rather than archiving every pull to disk forever. That's the exact discipline `intelligence/history/` lacked. Concretely for FinVest: cache hot API responses (screener, per-ticker snapshots) in Upstash Redis with a short TTL. This both keeps Render's free-tier cold starts from recomputing everything from scratch *and* reduces read pressure on R2/Supabase. Upstash's free tier (10K commands/day, no credit card) fits comfortably alongside R2 + Supabase in the already-free stack — this is a genuine addition to §6, not just inspiration.
2. **A "no API key needed" local fallback mode is worth copying as a pattern, not just a feature.** World Monitor runs fully offline/local via Ollama with zero cloud API keys required. FinVest's `ai_engine.py` / `finbot_api.py` / Groq calls have no such fallback today — and the absence of an easy no-key local dev path is plausibly *why* someone hardcoded a real key into `apps/FinAx/groq_key.txt` in the first place, instead of using an env var from day one. Adding a "works with no key, degrades gracefully" local mode removes the temptation that caused the actual leak this audit found.
3. **A future "Macro Radar" addition, not urgent:** World Monitor's Country Instability Index and commodity-chokepoint monitoring are a natural extension of the *existing* `pm_regime_api.py` / Layer 2B (which already does gold/silver-based macro regime context) — a small set of free geopolitical/macro signals feeding into the same regime-modifier role PM data plays today. This is a genuine product idea worth a future ticket, not part of the storage-fix critical path.

**One caution, not a blocker:** World Monitor is AGPL-3.0. That license is copyleft/viral — if any of its actual *code* gets copied into FinVest (as opposed to just the architectural ideas above, which are not copyrightable), FinVest's own "Proprietary — © 2025 FinTaxLife" license would be in direct conflict. Safe to take: the caching-layer idea, the no-key-fallback pattern, the macro-overlay concept. Not safe without a licensing conversation first: copying their actual TypeScript/Rust source.

### 9.3 Updated free-stack summary (supersedes the table in §6)

| Layer | Service | Free tier | Role |
|---|---|---|---|
| Object storage | Cloudflare R2 | 10GB storage, zero egress | Per-ticker parquet/JSON |
| Structured data + auth | Supabase (already integrated) | 500MB Postgres, unlimited API requests | Live intelligence rows, bounded history, user auth |
| **Hot cache (new, from §9.2)** | **Upstash Redis** | **10K commands/day, no card required** | Short-TTL cache in front of R2/Supabase reads — cuts Render cold-start pain and read load |
| Scheduled execution | GitHub Actions, public repo | Free & unlimited on public repos | Runs the daily pipeline, split by module |
| Backend hosting | Render (free tier, unchanged) | 750 compute hrs/month (verify current terms directly — reporting on this was inconsistent as of this audit) | API server |
| Frontend hosting | Vercel (unchanged) | Static hosting, generous free tier | Not a bottleneck, no change needed |

Every layer in this table is free. Nothing in this plan requires a paid tier at FinVest's current scale.

---

## 10. Open-source / trending-repo readiness — locked plan

**Decided (2026-08-20):** go public, and shape the release deliberately to give it a real shot at visibility, not just flip the visibility toggle.

**One thing to be honest about before locking anything else in:** *"trending" is not an engineering deliverable.* GitHub's trending page and star counts respond to timing, who shares it, launch-day distribution (Hacker News, Reddit, X), and luck — none of which a repo's internal quality controls. What I can commit an ETA to is **getting the repo into the best possible shape to earn that outcome if it gets seen** — a real, honest target — not a guarantee of the outcome itself. The plan below is written against that honest target.

### 10.1 Why the repo isn't shot-ready today (recap, so the fixes below map to real causes)
- Nothing works without a 2–4 hour data pipeline first — no seed/demo dataset exists
- Multiple required API keys just to see it run (Groq, Supabase, Gmail for Mnemos) — no zero-key path
- Seven names for pieces of one system (FinVest, FinSight, FinDash, StrataX, IntrinsIQ, FinAx, Mnemos) — no single identity
- 20+ scattered status markdown files, no README-driven onboarding, no screenshots/GIF
- Output is a JSON of numbers, not inherently visual — the genuinely novel part (the 9-layer quant engine) isn't packaged as something a stranger can try in isolation
- Currently licensed "Proprietary" — needs a deliberate real-license decision
- The leaked Groq key and the 173.7GB of bloat are disqualifying on their own regardless of any polish — a security embarrassment on day one kills credibility faster than anything else on this list

### 10.2 The locked build plan

| Workstream | What it means concretely | Depends on |
|---|---|---|
| **A. Prerequisite hygiene** | Everything in §7's Phase 0–4: garbage cleared, key rotated, dead files gone, data off git, history scrubbed, repo public. This is not optional groundwork — a stranger's first impression of a "trending" repo with a live leaked key in its history, or a 10-minute clone time, is the fastest way to guarantee it never trends. | You: key rotation, R2/Supabase account setup |
| **B. One identity** | **Decided: `finvest`, hosted at `finvest.fintaxlife.com` on Vercel.** Conveniently, `apps/finvest` already exists as an in-progress unified shell with this exact name (§3A) — finish that consolidation as the real public frontend instead of starting fresh. | Done |
| **C. A true zero-config demo mode** | Bundle a small synthetic/sample dataset (a few dozen tickers) so `git clone && install && run` shows a working, populated dashboard within minutes — no API keys, no multi-hour pipeline, clearly labeled as sample data (not live financial advice). This is the single highest-leverage item on this list and the most work: it means building a seed-data generator and verifying the full stack actually runs end-to-end against it. | A, B |
| **D. No-API-key fallback for AI features** | LLM narrative features degrade gracefully (skip or stub) with no key present, mirroring World Monitor's Ollama-optional pattern from §9.2. Removes the exact temptation that caused the original key leak. | C |
| **E. README & visuals** | One-line pitch, hero screenshot or short GIF of the actual running dashboard, badges, architecture diagram, quickstart. Needs a working demo (C) to screenshot honestly — can't be written first. | C, D |
| **F. Real license decision** | **Decided: AGPL-3.0** — same license World Monitor uses, protects against someone SaaS-wrapping the code and competing with you directly. | Done |
| **G. Standard OSS hygiene** | CONTRIBUTING.md, issue templates, a real CI badge (the GitHub Actions workflow from §6A doubles as this), CODE_OF_CONDUCT if desired. | A |
| **H. Launch distribution** | Posting to Hacker News / Reddit / X at a deliberate time, ideally with a working live demo link. **This step is outside repo engineering — it's on you (or whoever you designate) to actually post it; I can help write the launch copy, but I don't post to external platforms on your behalf.** | E, F |

### 10.3 Final ETA, locked

| Milestone | What's included | Realistic elapsed time |
|---|---|---|
| **Storage/security fix live** (§7 Phase 0–4) | Repo is small, clean, public, automated, secure | 1–2 days, mostly gated on your account/key steps (unchanged from earlier estimate) |
| **+ OSS packaging** (§10.2 B–D) | One identity, working zero-config demo, no-key AI fallback | +2–3 additional days of engineering — the demo-data workstream (C) is the long pole, since it means actually building and verifying a working seed dataset against the full stack, not just writing docs |
| **+ Polish & launch-ready** (§10.2 E–G) | README, visuals, license applied, OSS hygiene files | +1 day, but E can't start honestly until C is done and actually running |
| **Total: "genuinely trending-ready" repo** | Everything above | **~4–6 days of combined elapsed time**, interleaved with your review at each phase and your few required manual steps (key rotation, account setup, license decision, launch post) |
| **Actual trending/stars** | Not an engineering milestone | **No ETA exists for this — it's not a deliverable this plan can promise, only a shot this plan maximizes** |

Nothing above has been started. This is the locked plan to execute against once you say go — and F (license) and B (final name) need your decision before B–E can proceed, since I'm not choosing your license or your brand for you.
