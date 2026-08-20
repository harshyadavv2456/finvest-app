-- ============================================================
-- FinVest — Supabase schema for structured data
-- Project: finvest-news (separate from the existing auth project,
-- per instruction — keeps the 500MB free tier clean for this data)
-- Run once in Supabase SQL Editor.
--
-- Design constraint (see REPO_AUDIT_REPORT.md §6/§9): every table here
-- either holds small structured rows (news, digests, live intelligence)
-- or has an explicit bounded-retention policy. Nothing here is allowed
-- to grow unbounded the way FinSight/public/intelligence/history/ did.
-- ============================================================

-- ----------------------------------------------------------------
-- News intelligence (mirrors FinVest News's local SQLite schema —
-- synced in by scripts/sync_news_intelligence.py, which runs locally
-- since the source .db file only exists on the local machine)
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS news_articles (
    id BIGSERIAL PRIMARY KEY,
    article_hash TEXT UNIQUE NOT NULL,
    source TEXT,
    category TEXT,
    title TEXT,
    summary TEXT,
    url TEXT,
    published_at TEXT,
    fetched_at_ist TEXT,
    fetched_at_utc TIMESTAMPTZ,
    keyword_score REAL,
    ai_analyzed BOOLEAN DEFAULT FALSE,
    sentiment TEXT,
    sentiment_score REAL,
    impact_level TEXT,
    impact_score REAL,
    impacted_sectors TEXT,
    impacted_stocks TEXT,
    impact_reasoning TEXT,
    market_action TEXT,
    key_signal TEXT,
    confidence REAL,
    alert_sent BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_fetched_at ON news_articles (fetched_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_impact ON news_articles (impact_level, impact_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles (category);

CREATE TABLE IF NOT EXISTS daily_digest (
    id BIGSERIAL PRIMARY KEY,
    digest_date DATE UNIQUE NOT NULL,
    digest_html TEXT,
    articles_count INTEGER,
    high_impact_count INTEGER,
    created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------
-- Live intelligence snapshots — one row per ticker, UPSERTED daily.
-- This is the replacement for FinSight/public/intelligence/{market}/*.json
-- Overwritten in place, not archived — mirrors R2's overwrite-in-place rule.
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS intelligence_snapshots (
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    as_of_date DATE NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (market, ticker)
);

CREATE INDEX IF NOT EXISTS idx_intel_snapshots_date ON intelligence_snapshots (as_of_date);
-- Fast filtering on the fields the frontend actually sorts/filters by,
-- without needing to pull the whole JSONB payload out first.
CREATE INDEX IF NOT EXISTS idx_intel_snapshots_intent ON intelligence_snapshots ((payload->>'intent'));
CREATE INDEX IF NOT EXISTS idx_intel_snapshots_conviction ON intelligence_snapshots (((payload->>'conviction')::numeric) DESC);

-- ----------------------------------------------------------------
-- BOUNDED historical intelligence — replacement for the abandoned,
-- unbounded FinSight/public/intelligence/history/{date}/{market}/{ticker}.json
-- archive (152,861 dead files at time of audit). Retention is enforced
-- by prune_old_intelligence_history() below, called at the end of each
-- daily refresh — never let this grow forever again.
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS intelligence_history (
    id BIGSERIAL PRIMARY KEY,
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    as_of_date DATE NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (market, ticker, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_intel_history_date ON intelligence_history (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_intel_history_ticker ON intelligence_history (market, ticker, as_of_date DESC);

-- Retention: keep 90 days of daily rows; anything older gets downsampled
-- to one snapshot per week rather than deleted outright, so long-run trend
-- data survives without unbounded growth. Call this once/day from the
-- refresh pipeline, not from the request path.
CREATE OR REPLACE FUNCTION prune_old_intelligence_history() RETURNS void AS $$
BEGIN
    -- Beyond 90 days: keep only the earliest row per ISO week per ticker.
    DELETE FROM intelligence_history t
    WHERE as_of_date < (CURRENT_DATE - INTERVAL '90 days')
      AND id NOT IN (
        SELECT DISTINCT ON (market, ticker, date_trunc('week', as_of_date)) id
        FROM intelligence_history
        WHERE as_of_date < (CURRENT_DATE - INTERVAL '90 days')
        ORDER BY market, ticker, date_trunc('week', as_of_date), as_of_date ASC
      );
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- Row Level Security — service_role (used by the backend/sync scripts)
-- bypasses RLS by default; these policies only matter if this project's
-- anon/public key is ever exposed client-side. Kept locked down since
-- this project has no auth of its own (auth lives in the other project).
-- ----------------------------------------------------------------

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digest ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_history ENABLE ROW LEVEL SECURITY;

-- Public read-only access (this is public market/news data, not user data)
DROP POLICY IF EXISTS "public read" ON news_articles;
CREATE POLICY "public read" ON news_articles FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read" ON daily_digest;
CREATE POLICY "public read" ON daily_digest FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read" ON intelligence_snapshots;
CREATE POLICY "public read" ON intelligence_snapshots FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read" ON intelligence_history;
CREATE POLICY "public read" ON intelligence_history FOR SELECT USING (true);

-- No public INSERT/UPDATE/DELETE policies are defined — writes only happen
-- via the service_role key (backend + sync scripts), which bypasses RLS.

-- ============================================================
-- Phase 1 hardening (FinSight/IMPLEMENTATION_NOTES.md) — decision
-- call tracking. Every layer6_decision_engine.py call gets a row here,
-- with the exact signal state that produced it (decision_logger.py),
-- so it can be revisited later and scored against what actually
-- happened (score_decision_outcomes.py).
--
-- HONEST CAPACITY NOTE, unlike every other table in this file: this
-- one is NOT pruned. An audit trail that gets deleted isn't an audit
-- trail. At ~1,473 tickers/day this is real, permanent growth -
-- roughly 500K+ rows/year, competing for the same 500MB free tier as
-- everything else here. check_free_tier_usage.py already alerts at
-- 80% of the DB cap; watch that alert specifically once this table is
-- live. If it becomes the actual constraint, the deferred fix is
-- compressing signal_state (not deleting the row) once a call's
-- outcome has been scored - full precision only matters while the
-- prediction is still open.
-- ============================================================

CREATE TABLE IF NOT EXISTS decision_calls (
    call_id UUID PRIMARY KEY,
    ticker TEXT NOT NULL,
    market TEXT NOT NULL,
    called_at_utc TIMESTAMPTZ NOT NULL,
    review_after_utc TIMESTAMPTZ NOT NULL,
    model_version TEXT NOT NULL,
    decision JSONB NOT NULL,       -- the Decision.to_dict() output
    signal_state JSONB NOT NULL,   -- outcome + efficacy_report at call time (point-in-time snapshot)
    status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
    synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_calls_status_review ON decision_calls (status, review_after_utc) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_decision_calls_ticker ON decision_calls (market, ticker, called_at_utc DESC);

CREATE TABLE IF NOT EXISTS decision_outcomes (
    call_id UUID PRIMARY KEY REFERENCES decision_calls(call_id),
    scored_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    price_at_call NUMERIC,
    price_at_review NUMERIC,
    actual_return NUMERIC,          -- (price_at_review - price_at_call) / price_at_call
    expected_return NUMERIC,        -- copied from decision_calls.decision at scoring time, for convenience
    direction_correct BOOLEAN,      -- did actual move agree with the decision's direction?
    magnitude_error NUMERIC,        -- abs(actual_return - expected_return)
    notes TEXT
);

ALTER TABLE decision_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON decision_calls;
CREATE POLICY "public read" ON decision_calls FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read" ON decision_outcomes;
CREATE POLICY "public read" ON decision_outcomes FOR SELECT USING (true);
