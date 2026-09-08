-- Phase INFRA-DB-1 - ONE compound index for the hottest request-path
-- query. Non-destructive (adds an index, IF NOT EXISTS, CONCURRENTLY so
-- it does not lock `deals` against the refresh crons). Run in the
-- Supabase dashboard SQL Editor, this statement on its own (CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block, and the editor
-- wraps a multi-statement run in one).
--
-- WHY: fetchDealsPool / fetchHomepageLanes(grid) and the language-scoped
-- fetchDealsPage all run:
--     where is_active = true and card_language = $1
--     order by first_seen_at desc
--     limit N
-- The existing indexes cover parts of this:
--   deals_card_language_active_idx  (card_language, is_active)   -- WHERE only
--   deals_active_first_seen         (is_active, first_seen_at desc) -- from
--                                    seo_perf_indexes_migration.sql, and only
--                                    if that CONCURRENTLY build actually
--                                    completed in production (confirm in
--                                    pg_stat_user_indexes).
-- Neither serves the full (eq, eq, ordered-range) shape, so the planner
-- still sorts every matching active English row on each cache miss. At
-- today's ~840 active rows that is cheap; at the historical ~12k it is a
-- multi-thousand-row sort 480x/day per cache key. This index makes it an
-- index-ordered scan of the first N rows.
--
-- NOT required to ship the pool fix (the payload shrink alone makes the
-- pool cacheable again); recommended before active inventory recovers.

create index concurrently if not exists deals_lang_active_first_seen
  on deals (card_language, is_active, first_seen_at desc);

-- After it builds, the older (card_language, is_active) index is a
-- prefix-only subset of this one. Do NOT drop it blind: first confirm in
-- pg_stat_user_indexes (audit section 5c) that it has 0 scans across a
-- full traffic cycle, then drop separately:
--   drop index concurrently if exists deals_card_language_active_idx;
