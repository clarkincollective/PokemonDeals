# INFRA-DB-1 — Supabase resource pressure + >2 MB deal-pool cache

Supabase was warning "exhausting multiple resources". VERCEL-COST-1 had
flagged the `lib/deals.js` deal pool as the likely cause. This phase
measured it, shrank it below the cache ceiling, and audited the wider DB
surface. **No change to deal qualification, ranking, market-reference
logic, the verify allocator, verify/scanner cadence, eBay Browse, social
publishing, or Buffer schedules.** No email. NEWSROOM-3 not enabled.

## Root cause

`fetchDealsPool` / `fetchHomepageLanes(grid)` ran `select("*")` over up to
**2000** active rows and stored the result in a Next `unstable_cache`
entry.

| state | rows | serialised | cacheable (<2 MB)? |
|---|---|---|---|
| `deals-pool` before | 843 (today) | **1.52 MB** | yes, no headroom |
| `deals-pool` before, at ~2000 rows | 2000 | **~3.8 MB** | **no** |
| `homepage-lanes-v1` before (grid + 4 ranked pools, all `*`) | — | **~2.4 MB today** | **no — already over** |
| `deals-pool-v2` after | 837 | **0.89 MB** | yes, headroom |
| `deals-pool-v2` after, at 1200-row ceiling | 1200 | **~1.27 MB** | yes, headroom |
| `homepage-lanes-v2` after (all 5 pools slim) | — | **1.22 MB** | yes, headroom |

When a `unstable_cache` value exceeds ~2 MB, Next silently refuses to
persist it, so **every** cache-miss request re-ran the full Supabase
query. At the historical ~12k active English catalogue both the pool and
the lanes object were permanently uncacheable — a constant request-path
read load on the database. That is the primary pressure source this repo
controls.

### Byte breakdown of the old `select("*")` pool row

| column | share | disposition |
|---|---|---|
| `image_urls[]` | 11.0 % | DETAIL_ONLY — DealCard shows one image → **dropped from pool** |
| `affiliate_url` | 9.6 % | REQUIRED (CTA) — kept |
| `listing_url` | 5.1 % | gate-only (pre-cache) → **dropped from stored row** |
| `title` | 3.4 % | REQUIRED — kept |
| `image_url` | 3.2 % | REQUIRED — kept |
| `visual_authenticity_reason` | 3.0 % | UNUSED in listings → **dropped** |
| `*_checked_at` / `image_verdict` / `visual_authenticity_status` | ~4 % | audit stamps, UNUSED post-gate → **dropped** (`image_verdict` kept — DealImage reads it) |
| `seller_username` / `seller_feedback_pct` / `source` / `currency` / `price` / `shipping` / `grade`* | ~6 % | UNUSED post-gate → **dropped** |

## The fix (3 bounded, behaviour-preserving changes)

`lib/dealPoolShape.mjs` (new, dependency-free so scripts/tests share it):

1. **`DEAL_POOL_SELECT`** — an explicit column list: the union of what the
   pre-cache display gate (`lib/dealQuality.isDisplayableDeal`) reads and
   what every post-cache consumer (`DealCard`, `lib/homepageVariety`
   diversity keys, `dealFreshness`, `conditionLabel`, `withCard`) reads.
   Also cuts the bytes Supabase serialises and ships on each miss
   (~1.05 MB → the select payload is now the projected set only).
2. **`slimPoolRow()`** — projects each gated row to the render-only shape
   (`POOL_ROW_FIELDS` + a `watchlist` object). The gate has already run;
   its extra inputs don't need to live in the cache. Idempotent; a real
   `watchlist` embed (legacy path) is preserved.
3. **`DEAL_POOL_MAX_ROWS = 1200`** (was 2000). Measured ~1.1 KB/row after
   projection → ~1.3 MB even at full inventory. `/japanese-cards` (~750
   active) is still fully covered; the homepage grid rotates a 9-tile
   window, for which 1200 rows is ample. The paginated `/deals` browse
   views use `fetchDealsPage` (real offset pagination) and are
   **untouched**, so long-tail crawl depth is unaffected.

`lib/deals.js`:
- `fetchDealsPoolUncached` — narrow select, `.limit(DEAL_POOL_MAX_ROWS)`,
  `displayable(data).map(withCard).map(slimPoolRow)`.
- `fetchHomepageLanesUncached` — the flagship / just-added / under-$25 /
  auctions lane pools are each `.map(slimPoolRow)` after their existing
  ranking runs (grid already comes back slim).
- Cache keys bumped: `deals-pool` → `deals-pool-v2`, `homepage-lanes-v1`
  → `homepage-lanes-v2`, so a stale full-size entry from a prior deploy
  is never reused.

### Not an N+1

The pool is still **one** `deals` query. Detail-only fields removed from
the pool are already fetched by `/deals/[id]` in its own single
`select("*")` query (unchanged) — no new per-row reads anywhere.

## Query-frequency estimate (request path, deal-pool)

180 s revalidate ⇒ at most **480 pool queries/day per distinct
filter+country cache key**. Homepage default + `/japanese-cards` default
≈ **960/day combined**, independent of traffic volume (crawler-amplified
reads are absorbed by the cache once it fits again — which is the whole
point of this phase). Cron / scanner / verify / social reads are separate
and unchanged.

## Wider DB audit — what needs the owner

PostgREST only exposes the `public` schema, and this project has no
`exec_sql` RPC, so `pg_stat_statements`, `pg_indexes`,
`pg_stat_activity`, `pg_stat_user_tables` and size/bloat metrics are
**not reachable programmatically**. `npm run infra:db-health` reports
everything that *is* reachable; the rest requires the Supabase dashboard
(Reports → Database) or running **`supabase/infra_db_pressure_audit.sql`**
in the SQL editor (read-only; sections for resource headroom, cache-hit
ratio, connections, `pg_stat_statements` top-N, index list + unused
indexes, an `EXPLAIN (ANALYZE, BUFFERS)` of the pool query, and the
inactive-deal backlog).

### Findings available now

- **`deals` table: ~25,085 rows, ~903 active (~843 English).** ~24,000
  inactive/expired rows are retained — 96 % of the table. This inflates
  every sequential scan, index size, and autovacuum pass. **Recommended**
  (not done here — destructive): a retention job that hard-deletes
  `is_active = false AND last_seen_at < now() - interval '90 days'`
  rows on a weekly cron. `/deals/[id]` expired pages read a single
  inactive row by id and would be unaffected beyond 90 days of history.
- **Indexes on `deals`** (from migrations): `deals_card_language_active_idx
  (card_language, is_active)`, `deals_card_tcgplayer_idx`,
  `deals_card_set_idx`, `deals_watchlist_id`, `deals_active_first_seen
  (is_active, first_seen_at desc)`, `deals_active_last_seen`,
  `deals_active_market_price`, `deals_active_auction_end` (partial),
  `deals_feed_lifecycle_idx`, `deals_unique_listing`. The
  `seo_perf_indexes_migration.sql` set is `CREATE INDEX CONCURRENTLY` —
  **confirm in `pg_stat_user_indexes` that those actually built in
  production** (a CONCURRENTLY build can fail silently and leave an
  INVALID index).
- **One compound index proposed** (`supabase/infra_db_indexes_migration.sql`,
  idempotent, `CONCURRENTLY`): `deals (card_language, is_active,
  first_seen_at desc)` — exactly matches the pool + language-scoped
  `fetchDealsPage` `WHERE eq, eq ORDER BY … LIMIT` shape, which no
  current index fully serves. Not required to ship the pool fix; worth
  adding before active inventory recovers.

## Newsroom DB cost

| table | rows now | notes |
|---|---|---|
| `social_stories` | 10 | one row per editorial story; bounded by cadence |
| `social_story_placements` | 29 | ≤ ~3 per story |
| `social_qa_runs` | **403** | append-only; grows with every render + every Layer-5 retry |

`social_qa_runs` is the only unbounded one. NEWSROOM-3 (2×/week refill)
would add on the order of **a few dozen rows/week** at steady state
(render + STACK + VISUAL_REVIEW rows per candidate, plus retries) — small
in absolute terms but monotonic. **Retention policy proposed** (design
only, no deletion this phase): keep every row that gated a real
`BUFFER_QUEUED`/`PUBLISHED` decision indefinitely; after 180 days,
down-sample development/retry rows (`result` in `WATCH`/`FAIL` with no
linked placement state change) to one per (placement, artifact_sha, day).
Implement as a monthly cron writing to a `social_qa_runs_archive` table
before pruning — preserves compliance/debug auditability.

## Connection management

`lib/supabaseClient.js` is a module singleton (good). `lib/supabaseAdmin.js`
`supabaseAdmin()` builds a **new client per call** — acceptable because
supabase-js talks to PostgREST over HTTP (keep-alive), not a pooled PG
socket, so this is not a connection-exhaustion path. No change made; no
direct-Postgres connection introduced.

## Operator command

`npm run infra:db-health` (read-only): deal-pool bytes / rows / per-row /
projected-at-ceiling / cacheable verdict, `deals` active-vs-inactive
counts, newsroom row counts, estimated request-path pool reads/day, and
the explicit list of metrics that need the owner dashboard.

## Resource verdict

**WATCH.** The one pressure source this repo controls (an uncacheable
multi-MB pool re-queried on every miss) is fixed and proven cacheable
with headroom. Whether the project is still `PRESSURED` on CPU / memory /
connections / IO is **UNKNOWN from here** — those metrics need the
Supabase dashboard or the audit SQL. The inactive-deal backlog and the
unbuilt-index risk are real but secondary.

## NEWSROOM-3 headroom decision

**READY_WITH_GUARDRAILS.** A 2×/week backlog refill adds only a handful
of small `social_*` inserts per run and issues no deal-pool reads, so it
does not materially worsen DB pressure by itself. Guardrails: (1) confirm
the Supabase dashboard shows headroom after this deploy caches the pool;
(2) apply the `social_qa_runs` retention cron before long-run
accumulation; (3) confirm the `seo_perf` indexes are built (and add the
proposed compound index) so a recovering active-inventory count doesn't
re-introduce sort pressure on the pool query.

## Owner actions (none blocking this deploy)

1. Run `supabase/infra_db_pressure_audit.sql` in the SQL editor; paste
   the section outputs back to close the SUPABASE report block.
2. Confirm the `seo_perf_indexes_migration.sql` indexes are `valid` in
   `pg_index` / `pg_stat_user_indexes`.
3. Optionally apply `supabase/infra_db_indexes_migration.sql` (one
   `CONCURRENTLY` statement, run on its own).
4. Consider the inactive-deal 90-day retention job and the
   `social_qa_runs` archive job (both described above).
