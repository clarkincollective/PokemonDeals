-- Phase INFRA-DB-1 - Supabase pressure audit. READ-ONLY. Nothing here
-- writes, locks, or changes schema. Run in the Supabase dashboard:
-- SQL Editor > New query > paste a section > Run. These read Postgres
-- internals that are NOT reachable through PostgREST (the app's client),
-- so `npm run infra:db-health` cannot collect them - only this can.
--
-- Paste the OUTPUT of each section back to close out the phase's
-- "SUPABASE" report block.

-- ========================================================================
-- 1. RESOURCE HEADROOM - table + index sizes, dead tuples, last vacuum
-- ========================================================================
select
  relname                                   as table,
  n_live_tup                                as live_rows,
  n_dead_tup                                as dead_rows,
  round(100 * n_dead_tup / greatest(n_live_tup + n_dead_tup, 1), 1) as dead_pct,
  last_autovacuum,
  last_autoanalyze,
  pg_size_pretty(pg_total_relation_size(relid))       as total_size,
  pg_size_pretty(pg_relation_size(relid))             as heap_size,
  pg_size_pretty(pg_indexes_size(relid))              as indexes_size,
  seq_scan,
  idx_scan,
  round(100.0 * idx_scan / greatest(seq_scan + idx_scan, 1), 1) as idx_scan_pct
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 30;

-- ========================================================================
-- 2. DATABASE SIZE + CACHE HIT RATIO (whole DB; want > ~0.99)
-- ========================================================================
select pg_size_pretty(pg_database_size(current_database())) as db_size;

select
  sum(heap_blks_read)                                              as heap_read,
  sum(heap_blks_hit)                                               as heap_hit,
  round(sum(heap_blks_hit) / greatest(sum(heap_blks_hit) + sum(heap_blks_read), 1), 4) as heap_hit_ratio
from pg_statio_user_tables;

-- ========================================================================
-- 3. CONNECTIONS - count by state (pooler saturation shows here)
-- ========================================================================
select state, count(*)
from pg_stat_activity
where datname = current_database()
group by state
order by count(*) desc;

-- long-running (> 30s) non-idle queries, sanitised (no query text params)
select pid, state, wait_event_type, now() - query_start as running_for,
       left(regexp_replace(query, '\s+', ' ', 'g'), 90) as query_head
from pg_stat_activity
where datname = current_database()
  and state <> 'idle'
  and now() - query_start > interval '30 seconds'
order by running_for desc;

-- ========================================================================
-- 4. pg_stat_statements - top queries (needs the extension enabled;
--    Supabase enables it by default). Parameters are already normalised
--    to $1, $2, ... by the extension - no literal secrets in `query`.
-- ========================================================================
-- 4a. TOP BY TOTAL COST
select round(total_exec_time)::bigint as total_ms,
       calls,
       round(mean_exec_time, 2)       as mean_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_statements
order by total_exec_time desc
limit 20;

-- 4b. TOP BY FREQUENCY
select calls,
       round(total_exec_time)::bigint as total_ms,
       round(mean_exec_time, 2)       as mean_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_statements
order by calls desc
limit 20;

-- 4c. TOP BY MEAN LATENCY (min 20 calls, ignore one-off migrations)
select round(mean_exec_time, 2)       as mean_ms,
       calls,
       round(total_exec_time)::bigint as total_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_statements
where calls > 20
order by mean_exec_time desc
limit 20;

-- ========================================================================
-- 5. INDEXES ON deals + related high-volume tables
-- ========================================================================
select tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size,
       idx_scan as scans, idx_tup_read, idx_tup_fetch
from pg_stat_user_indexes
join pg_indexes using (schemaname, tablename, indexname)
where tablename in ('deals', 'card_catalog', 'price_history', 'watchlist',
                    'social_qa_runs', 'social_story_placements')
order by tablename, pg_relation_size(indexrelid) desc;

-- 5b. index DEFINITIONS (spot duplicate / near-duplicate leading columns)
select tablename, indexname, indexdef
from pg_indexes
where tablename in ('deals', 'card_catalog', 'price_history', 'watchlist')
order by tablename, indexname;

-- 5c. UNUSED indexes (0 scans since last stats reset) - candidates to drop
--     ONLY after confirming stats have accumulated for a full traffic cycle
select schemaname, relname as table, indexrelname as index,
       pg_size_pretty(pg_relation_size(indexrelid)) as size
from pg_stat_user_indexes
where idx_scan = 0
  and indexrelname not like '%_pkey'
  and relname in ('deals', 'card_catalog', 'price_history', 'watchlist')
order by pg_relation_size(indexrelid) desc;

-- ========================================================================
-- 6. EXPLAIN the hottest request-path query (the deal pool). Safe: it is
--    a bounded SELECT. Replace 'english' if auditing another catalogue.
-- ========================================================================
explain (analyze, buffers, format text)
select id, title, image_url, affiliate_url, total_price, total_price_usd,
       market_price, discount_pct, listing_type, auction_end_at, bid_count,
       is_graded, marketplace, first_seen_at, last_seen_at, exact_verified_at,
       card_name, card_set, card_language, card_tcgplayer_id, card_catalog_id, watchlist_id
from deals
where is_active = true and card_language = 'english'
order by first_seen_at desc
limit 1200;

-- ========================================================================
-- 7. INACTIVE-DEAL BACKLOG - how much of `deals` is expired inventory
-- ========================================================================
select is_active, count(*),
       min(last_seen_at) as oldest_last_seen,
       count(*) filter (where last_seen_at < now() - interval '30 days') as older_than_30d,
       count(*) filter (where last_seen_at < now() - interval '90 days') as older_than_90d
from deals
group by is_active;
