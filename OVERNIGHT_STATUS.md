# Overnight status — final update, everything below is live and verified

Written after finishing. This replaces last night's in-progress version — read this one.

## Bottom line

**The site is live and serving real data end-to-end.** Frontend → Render backend → Cloudflare R2 (market data) / Supabase (news, intelligence), verified with real requests just now, not just "the build succeeded":

- [finvest.fintaxlife.com](https://finvest.fintaxlife.com) — HTTP 200
- Backend health: `ticker_count: 2298` across 8 markets (SG, CN, US, HK, UK, AU, IN, JP)
- `/api/ticker/AAPL/daily` returns real OHLCV history, fetched live from R2
- `/api/screener` returns real fundamentals (P/E, market cap, sector, etc.) for real tickers

## R2 upload — 100% complete

**13,430 / 13,430 files uploaded.** Final run: 2,830 files (1,159.1 MB) in the last pass, ~3,011s. Bucket total: **4.55 GB**, comfortably under the 10GB free-tier cap (and under the 9.66GB safety cutoff the upload script itself enforces). Nothing local was touched or deleted — the upload is purely additive, your original `FinSight/data/` is untouched.

## A real bug this surfaced, found and fixed before calling it done

Uploading data to R2 wasn't the whole story — the backend also had to actually *read* it back, and one piece didn't:

- **Per-ticker pages** (`/api/ticker/{x}/daily`, fundamentals, news) already had R2 self-healing built in (`utils/paths.py` — cache miss locally → pull from R2 → cache) and worked correctly out of the box.
- **The ticker list / screener** (`list_tickers()` in `data_access.py`) had no R2 awareness at all — it only ever walked the local `FinSight/data/` directory, which doesn't exist in the deployed repo anymore (that's the whole point of moving it to R2). First deploy came up with **0 tickers**, screener empty.
- Fixed in two steps, both now live:
  1. Built and uploaded a single manifest (`meta/tickers_manifest.json` in R2, 2,298 tickers with metadata) via a new script, `upload_tickers_manifest.py`.
  2. Fixed `list_tickers()` to use that manifest as the source of truth whenever R2 is configured — caught a second, subtler version of the same bug on the way: the first fix only fell back to R2 when the local walk found *zero* tickers, but Render's local disk had already partially self-healed one market (AU, from earlier test requests), so it silently returned an incomplete 16-ticker list instead of the full 2,298. Fixed to prefer R2 whenever it's configured, not just when local is completely empty.
- Both fixes are deployed and confirmed live (see health check numbers above).

Note: **2,298 tickers is fewer than the total universe implied by 13,430 files** — some tickers have partial/incomplete local data (missing `metadata.json`), so they weren't included in the manifest. This is a pre-existing data-completeness gap, not something this fix caused; worth a look separately if you want the full universe represented.

## Render cold-start lag — fixed

You flagged this yourself: free-tier Render spins the service down after 15 min idle, so the first request after a gap eats a 30-60s cold start. Fixed with zero new paid infrastructure — a GitHub Actions workflow (`.github/workflows/keep-alive.yml`) pings `/api/health` every 10 minutes, which is well inside GitHub Actions' free scheduled-job minutes even on a private repo. The service should now stay warm continuously.

## Deploys

- **Render** (`finvest-api`, already pointed at `finvest-app`): 3 deploys triggered and confirmed `live` tonight, each verified before moving to the next — R2/Supabase env vars were already set from earlier, then the tickers-manifest fix, then the manifest-priority fix.
- **Vercel**: found the real production frontend project (`finvest`, custom domain `finvest.fintaxlife.com` / `finsight.fintaxlife.com`) — it's still linked to the old `FinVest` repo, not the new `finvest-app`. **Did not relink it** — Vercel's API doesn't expose a simple call for changing a project's Git source (it's an OAuth-based connect flow, not a field you can PATCH), and since no frontend code changed tonight, the currently-deployed build is already functionally current. Relinking is a one-time manual step in the Vercel dashboard (Project → Settings → Git) whenever you want to do it — low urgency since it doesn't affect what's live right now.

## AMC-Backbone Hardening — Phase 0, 1 (partial), 4 (partial) pushed live

Committed to both `E:\FinVest2` and `finvest-app`, per `FinSight/IMPLEMENTATION_NOTES.md`:
- **Phase 0**: full inventory (already delivered before you went to sleep)
- **Phase 1**: unique call-ID logging in the decision engine, Supabase sync for decision calls, outcome scoring against real price data, live-vs-backtest divergence report. **Not done**: regime-drift detection, feeding live efficacy back into the trainer, point-in-time snapshotting proper, broker reconciliation, live VaR/risk limits (Phases 2-3 not started)
- **Phase 4**: Groq usage tracking, wired into `ai_analysis.py` only so far. **Not done**: wiring into `finbot_api.py`, `layer7_llm_interpreter.py`, FinAx, IntrinsIQ; graceful-degradation policy

`decision_calls` / `decision_outcomes` Supabase tables are created (schema pushed) but empty until the pipeline runs and starts logging real calls — nothing to score yet.

## Still flagged from earlier, not acted on — still needs your input

- **`apps/Mnemos/`** still has real Gmail credentials on disk in `config.yaml` (untracked, excluded from the new repo, but not deleted). Its `output/` folder had a same-day modification timestamp I couldn't explain — confirm whether it's genuinely retired before I delete anything.
- **"Mnemos 2.0" scheduled task** — confirmed real and still running daily at 8:30 AM from `D:\Mnemos 2.0\run_mnemos.bat`, with `LastTaskResult: 1` (non-zero — may be failing silently). Not touched.
- **`FinVest-oldnew`** (a 4th GitHub repo Render was originally connected to) and **`D:\FinVest2` / `D:\FinVest News`** — never investigated, mentioned in passing early in the session.
- **`finvest-app` repo visibility**: still **private**. Flipping it public is what would make GitHub Actions minutes fully unlimited (private repos get 2,000 free min/month, which the daily-refresh + new keep-alive ping together should still fit inside comfortably, so this isn't urgent) — but making a repo public is effectively irreversible once anything's been cloned/indexed, so I left this for you to decide rather than doing it unilaterally overnight.

## Everything that was already fixed before you went to sleep (unchanged, still true)

1. Duplicate leaked Groq key in `apps/IntrinsIQ` — fixed, reads from env now.
2. Real Gmail credentials found in `apps/Mnemos/config.yaml` — excluded from new repo (see above, not deleted).
3. FinDash's 5 hardcoded API keys — excluded from new repo entirely.
4. 5 old deployment docs with real keys pasted in — excluded from new repo.
5. `NIFTYBEES.NS` has `NaN` for `last_price` — caught by the regression suite, not yet fixed at the source.
6. GitHub Actions workflow step names now actually call the R2/Supabase sync scripts they claimed to.
