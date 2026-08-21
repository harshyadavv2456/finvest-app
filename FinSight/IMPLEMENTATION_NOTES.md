# FinVest AMC-Backbone Hardening — Implementation Notes

Living document. Updated at the end of every phase: what was built, decisions made and why, what's open, what was deliberately deferred.

---

## Phase 0 — Investigation & Inventory (complete)

Read `REPO_AUDIT_REPORT.md` in full first, per instruction. Cross-referencing: this hardening work and the audit are largely orthogonal — the audit fixed *where data lives and how the repo is structured*; this work is about *whether the system's own calls can be trusted over years*. One direct intersection: Phase 2's data quality monitor below is explicitly the alerting the audit report flagged as missing (§9.1) — the same gap that let `intelligence/history/` die silently for 8 weeks. Building it once, referenced from both places, not duplicated.

Classification key: **(a)** doesn't exist · **(b)** exists but stubbed/dead · **(c)** partially exists, needs extension.

### Phase 1 — Live feedback loop

| Gap | Status | Evidence |
|---|---|---|
| Outcome-tracking layer, unique ID per decision-engine call | **(a) doesn't exist** | `layer6_decision_engine.py` — no `call_id`/`decision_id`/`uuid` anywhere. Every call is fire-and-forget; nothing links a specific recommendation back to the exact state that produced it. |
| Scheduled job to revisit open calls, record outcomes | **(c) partially — adjacent system exists, not this** | `position_tracker_api.py` has real, working lifecycle logic (`get_position_timeline`, `detect_lifecycle_stage`, `sync_market_positions` with `exit_reason`/`exit_urgency`) — but this tracks *when to exit a currently-open position* based on re-reading today's intelligence, not *did our original prediction turn out to be correct*. Different question, adjacent code. Worth reusing its position-timeline plumbing rather than rebuilding, but the actual outcome-scoring logic needs to be new. |
| Feed live outcomes into `signal_efficacy_trainer.py` | **(a) doesn't exist** | `SignalEfficacyTrainer` / `train_efficacy_from_pipeline()` — no reference to "live" anywhere in the file; trains from pipeline/backtest data only. |
| Live-vs-backtest divergence report | **(a) doesn't exist** | Nothing computes this. `layer5_backtesting_engine.py` produces backtest hit rates; nothing compares them against actual live results because live results aren't tracked yet (see row 1). |
| Model drift / regime divergence detection | **(c) partially** | `layer2_regime_engine.py` already computes `regime_divergence` (asset vs. market) and `days_in_regime` per the intelligence JSON schema (`regime_divergence`, `asset_regime_confidence` fields observed directly in output during this session's earlier testing). What's missing: nothing flags when the *current* regime characteristics diverge from the regime the *model itself was validated/trained* on — that's a different comparison (live-vs-training, not asset-vs-market) and doesn't exist. |

### Phase 2 — Point-in-time data integrity

| Gap | Status | Evidence |
|---|---|---|
| Point-in-time snapshot mechanism, keyed to decision call ID | **(a) doesn't exist** | `intelligence_snapshots` (Supabase, built this session) is a live table, overwritten daily — by design, per the audit's "overwrite in place, never archive" fix. `intelligence_history` exists and *is* bounded/dated, but it's keyed to `(market, ticker, date)`, not to a specific decision call. Neither can answer "what exact data fed this specific recommendation" without a call ID to join against, which doesn't exist yet (blocked on Phase 1 row 1). |
| Data quality monitor (stale feeds, missing tickers, silent gaps) | **(c) substantially exists, needs extension** | `system_health.py` already computes per-module freshness (`fresh`/`stale`/`outdated`/`never_run`) from `state/refresh_registry.json`, and `check_free_tier_usage.py` (built this session) already has a working alert path via `notifications_api.py` (`_send_email`/`_send_telegram`). What's missing: (1) `system_health.py` is a pull-based API endpoint, nothing currently pushes an alert when a module goes stale — needs an active check, not just a passive endpoint; (2) no check for missing tickers within an otherwise-successful run (a run can report `status: fresh` while silently skipping tickers); (3) no check for the specific "history folder growing forever" pattern itself recurring elsewhere. |
| Retention/pruning rules documented | **(c) partially** | `intelligence_history`'s 90-day bounded retention + weekly downsample is implemented (`prune_old_intelligence_history()` in `supabase_schema.sql`, wired into the GitHub Actions workflow this session) and commented in-code, but not written up as a standalone policy doc anyone would find without reading the SQL. |

### Phase 3 — Portfolio truth and risk enforcement

| Gap | Status | Evidence |
|---|---|---|
| Broker reconciliation | **(a) doesn't exist** | No broker API integration found anywhere (`grep` for broker/zerodha/upstox/kite/angel across backend + quant_system returned only `execution_config.py`, which is explicitly paper-mode config, not a real connection). `portfolio_analyzer.py` analyzes a user-*submitted* portfolio object against screener/insider/hedge-fund data — it has no concept of "real broker holdings" to reconcile against. |
| Risk limits layer that blocks/flags before a call surfaces | **(a) doesn't exist** | `layer9_portfolio_risk.py` (`PortfolioRiskEngine`, `compute_portfolio_risk()`) computes risk *metrics* — no `limit`, `block`, `max_position`, `VaR`, or `drawdown` terms found anywhere in the file. It's a scoring engine, not an enforcement gate. The existing intelligence JSON does have `max_position_pct`/`recommended_position_pct` fields (confirmed in this session's regression tests) but these are *recommendations in the output*, not *enforcement before the output ships*. |
| Live drawdown/VaR tracking | **(a) doesn't exist** | Same file, same finding — no drawdown or VaR tracking at the portfolio level, live or otherwise. `layer9_portfolio_simulator.py` does historical portfolio simulation (backtest-style), not live tracking. |

### Phase 4 — Operational resilience

| Gap | Status | Evidence |
|---|---|---|
| Pipeline failure alerting | **(c) partially exists, this session** | `notifications_api.py` has working `_send_email`/`_send_telegram`. `check_free_tier_usage.py` (this session) uses them for cost alerts. The GitHub Actions workflow's `notify-status` job (this session) runs `if: always()` and is *positioned* to alert on failure but doesn't yet call the actual alert functions with real failure detail — it's a placeholder that needs wiring, not a fresh build. |
| Groq API cost/usage monitoring | **(a) doesn't exist** | Nothing tracks Groq token/request usage anywhere in the codebase. Given how many modules call Groq (`ai_engine.py`, `finbot_api.py`, `layer7_llm_interpreter.py`, FinAx, IntrinsIQ, the news pipeline), a bug in any one of them could burn budget silently — genuinely the highest-leverage item in Phase 4. |
| Graceful-degradation path (Supabase/R2 unreachable) | **(a) undefined** | Confirmed by reading `data_access.py`/`paths.py` (built this session, R2-fallback-aware) — if R2 itself is unreachable (not just the local file missing), the code raises/returns empty rather than a defined stale-serve-or-halt decision. No explicit policy chosen yet, exactly as the request states. |

### Cross-cutting notes for priority discussion

- **Phase 1 row 1 (unique call IDs) is the actual dependency root.** Phase 1's divergence report, Phase 2's point-in-time snapshots, and even a meaningful audit trail all need a call ID to key against. This should be the very first code written in Phase 1, before anything else in that phase.
- **`runtime/` and `shared/`** (referenced in the request, and flagged as suspicious scaffolding in `REPO_AUDIT_REPORT.md` §3.4) are **completely empty** — `runtime/scheduler/`, `runtime/data-bus/`, `shared/ai/`, `shared/portfolio/`, `shared/tax/` each contain only a `.gitkeep`. No hidden implementation to account for; these are pure placeholders from an earlier planning pass that never got built out. Worth deciding whether Phase 1-4 work should actually live in these directories (as apparently originally intended) or continue in `quant_system/`/`backend/app/` where everything else already lives — flagging this as a real open question, not deciding it unilaterally.
- **Governance/compliance/explainability hooks**, per instruction, are being left as noted-but-not-built. Concretely: Phase 1's call-ID/logging design will double as the governance audit trail's foundation if built with that in mind from the start (timestamp + model/config version + exact inputs is most of what a compliance log needs anyway) — worth designing Phase 1 with that reuse in mind rather than bolting it on twice later.

---

## Status update (2026-08-21, before this session): Phase 0 complete; Phase 1 (call-ID logging, live outcome scoring, live-vs-backtest divergence report) and part of Phase 4 (Groq usage tracking in `ai_analysis.py` only) shipped and verified live in a prior session, per `OVERNIGHT_STATUS.md`. Phases 2 and 3 not started. This section is being corrected rather than left stale, per this session's own instruction not to repeat that mistake.

---

## 2026-08-21 — Macro Overlay, StrataX Rebuild, UI, Full Hardening (this session)

Six workstreams (A-F), user-specified priority order: A+F together, D, E, B, C throughout. Updating this file after every meaningful commit, not just at the end.

### Workstream A + F — Macro/geopolitical overlay (in progress)

**Shipped and verified live:**
- `FinSight/quant_system/macro_signals.py` — new module. Sources: FRED (US yield curve 2Y/10Y spread, Fed funds rate, CPI index, unemployment), NASA FIRMS (active-fire count, physical-disruption proxy), USGS (significant earthquakes, no key needed), data.gov.in (India retail CPI-C — one confirmed resource ID), Mnemos 1.0's existing geopolitical/macro narrative (reused, not duplicated). Each source independently optional — verified locally with real keys: FRED/FIRMS/USGS all returned real live data; data.gov.in intermittently times out (government API, confirmed flaky via direct curl testing — sometimes <1s, sometimes 30s+) but degrades cleanly to `available: false` rather than blocking anything.
- R2-backed cache, 6h TTL (`macro/context.json`), reusing the existing `app.storage.r2_client` pattern rather than a new local-file cache.
- `FinSight/backend/app/macro_context_api.py` — new `/api/macro-context/current` endpoint, fail-open pattern matching `pm_regime_api.py`. Registered in `main.py`. Runs off the event loop (`run_in_threadpool`) since a cache-miss hits up to 5 external APIs.
- ACLED explicitly not built, per the ground rules — FIRMS + USGS cover the physical-disruption-proxy role instead.
- RBI DBIE explicitly not built this pass — confirmed no public API exists; would need a scheduled download-and-parse job against their CSV/Excel exports, tracked as an open gap in `fetch_rbi_dbie()`'s own docstring rather than silently skipped.

**Known gap, needs a 10-minute manual step, not an engineering blocker:** only 1 of the 9 requested data.gov.in datasets (retail CPI) has a confirmed resource ID. WPI, IIP, GST collection, forex reserves, crude oil production, PLFS unemployment, fiscal deficit, and GDP growth all need their resource IDs looked up via data.gov.in's catalog search UI (the site 403s on scripted/automated search) and added to `DATA_GOV_IN_RESOURCES` in `macro_signals.py` — the fetch/cache/degrade code already handles any number of them via that one config dict, so each addition is a one-line change, not new code.

**Not yet done:** A2's deeper integration (feeding `macro_context` into `layer2b_pm_regime_engine.py` as an actual strictness modifier, the way gold/silver already work) — deliberately sequenced after verifying the standalone module and API work correctly first, since threading new logic into the live decision engine's modifier chain is the higher-risk part of this workstream and deserves focused testing on its own, not a rushed add alongside six other new files. A3 (no-key graceful degradation for Groq-dependent features) — `ai_engine.py`/`finbot_api.py` already return a graceful "trouble connecting" message rather than erroring when a Groq call fails (verified working in this session's earlier live testing), so the no-key path already degrades acceptably; formal review of this specific requirement still pending.

Secrets: `FRED_API_KEY`, `FINNHUB_API_KEY`, `FIRMS_MAP_KEY`, `DATA_GOV_IN_API_KEY` set on both Render (backend runtime) and GitHub Actions (daily-refresh workflow env). AngelOne credentials (Workstream D) also set on Render and in the local `.env`, deliberately *not* added to GitHub Actions yet — sequenced to land alongside D2's provider module once auth is verified working, not added speculatively ahead of the code that uses them.

