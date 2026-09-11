# eBay Browse API rate limiting

## Diagnosis (2026-08-28)

The scan crons had been failing with `429 errorId 2001` ("The request
limit has been reached for the resource"). This is **daily-quota
exhaustion**, not a per-second throttle.

Confirmed live via eBay's Developer Analytics API
(`GET /developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse`):

| resource | limit | remaining | window | resets |
| --- | --- | --- | --- | --- |
| `buy.browse` | **5,000 / day** | **0** | 86,400 s | ~07:00 UTC (00:00 PT) |
| `buy.browse.item.bulk` | 5,000 / day | 5,000 (unused) | | |

So the app is on eBay's **default Browse tier (5,000 calls/day)** and is
spending the whole allocation, usually by mid-day, after which every
`item_summary/search` and `item/{id}` call 429s until the reset.

### Where the calls go (rough daily budget, after the mitigations below)

| Source | Cron | Calls/day |
| --- | --- | --- |
| US sweep (`searchNewlyListed`, 5 pages) | every 15 min (96×) | ~480 |
| GB/AU/CA/DE/IT sweeps (8 pages each) | every 2 h (12× each) | ~480 |
| Sweep graded lookups (`getGradingDetails`) | per sweep, capped at `GRADED_LOOKUP_CAP = 6` | ~0–500 (usually low) |
| Priority tier (~21 cards × 6 marketplaces) | every 6 h (4×) | ~500 |
| Extended tier (one country-chunk, ~980 cards) | 1×/day | ~980 |
| Sealed products (~194 × 6 marketplaces) | 1×/day at 06:00 UTC | ~1,160 |
| External discovery verify (`ingest-feed`, 1 Browse call per new board item) | hourly, ≤40/cycle, gated at `remaining >= 800` | ~240–720 (hard cap ~960) |

Typical total ≈ **4,150–5,400 / day** (after the EBAY_IT addition, the
sealed-scan expansion, and external-discovery ingestion). This is tight
against the 5,000 cap on purpose-bounded terms: the extended tier defers
first (floor 1,500), then `ingest-feed` skips entirely below `remaining`
800 — so external discovery only runs on the days there is genuine spare
capacity, and can't itself cause an overrun. Raising `ingest-feed` above
hourly / lifting its cap should wait for an approved rate-limit increase.

_Updated 2026-08-31: EBAY_IT added as the 6th marketplace (~575 calls/day
added — sweep + priority + amortised extended + sealed). The extended
tier was re-chunked 6 → 5 so 6 marketplaces still rotate through 30 daily
cron slots; per-country full-rotation cadence is unchanged at ~30 days.
FR/ES/NL remain held for the rate-limit increase; IE/AT/CH ruled out as
too thin. See the marketplace research + tiered-rollout modeling in
`IMPLEMENTATION_STATUS.md`._

**The table above is superseded — see "Current budget" below.** It
predates (a) the old "priority" + "extended" tiers being replaced by the
single `?tier=allocated` allocator (`lib/scanAllocator.js`), (b)
`verify-deals` moving to `BATCH=20` on a `*/30 * * * *` cadence, and (c)
`screen-deal-images` (a whole consumer this doc never listed). It
undercounted the real total by roughly 1,250/day.

## Current budget (2026-09-10, Phase 14Q audit)

All figures below are **modeled from the current code and cron
configuration**, not measured from production call logs (none are
retained) — labeled as estimates throughout, not exact usage.

| Source | Cron | Calls/day (ceiling) |
| --- | --- | --- |
| US sweep (`searchNewlyListed`, 5 pages) | `*/15 * * * *` (96×) | 480 |
| GB/IT/AU/CA/DE sweeps (8 pages each) | every 2 h (12× each, 5 countries) | 480 |
| `?tier=allocated` (replaces old priority+extended; `lib/scanAllocator.js`) | 2×/day × 6 marketplaces (12 runs) | ~1,700 (per the allocator's own sizing target, see `lib/scanAllocator.js` comments) |
| `verify-deals` (`BATCH=20`, `RESERVE=800`) | `*/30 * * * *` (48×) | up to 960 |
| `screen-deal-images` (`IMAGE_RECOVER_PER_RUN=12`, `RECOVER_RESERVE=900`) | `15 * * * *` (24×) | up to 288 |
| `refresh-sealed-deals` (~194 products × 6 marketplaces) | `0 6 * * *` (1×) | ~1,164 (estimate) |
| `ingest-feed` (`getItemsByLegacyIds`, opportunistic) | hourly, only when `remaining >= 800` | ~240–720 (estimate; supplemental, not additive on tight days) |

Fixed/predictable ceiling (excludes `ingest-feed`'s opportunistic
top-up): **~5,072/day** — already at/above the 5,000/day default Browse
quota before any headroom-gated extras run. This matches Phase 14P's
BORDERLINE verdict: verify-deals and screen-deal-images together
(~1,248/day) were real, correctly-necessary consumers that the pre-14Q
version of this document simply never accounted for.

Confirmed **zero** Browse calls: `refresh-catalog`, `sweep-stale-deals`,
`sync-watchlist`, `sync-card-catalog`, `sync-sealed-catalog`,
`sync-sealed-watchlist`, `screen-visual-authenticity`, `social-auto`,
`social-backlog-refill`, `check-alerts`, `send-digest`, `crm-auto`. **The
entire social/content pipeline makes zero eBay Browse calls** (it reads
PokemonPriceTracker + Supabase only).

### Sweep window overlap (Phase 14Q Part 4 — modeled, not changed)

`lib/ebay.js`'s own comment on `searchNewlyListed` establishes that one
page (200 results) covers **~4 minutes** of real listing volume in the
shared trading-card category. The US sweep fetches `pages=5`, i.e. **~20
minutes** of listing volume, every **15 minutes**. That means each run's
window overlaps the previous run's by **~5 minutes — 25% of the fetched
volume is re-seen on purpose**, so nothing posted in the gap between
scans is ever missed. This is a deliberate safety margin (see the
existing comment: "covers a wider window with overlap, so nothing posted
between scans gets missed"), not a bug, and **this phase did not change
the cadence or page count** to remove it. The same overlap is the
mechanism the Part 3 graded-lookup dedupe (below) actually recovers value
from: a listing re-seen in the overlap window (or still present a few
sweeps later) no longer triggers a second `getGradingDetails` call for a
`listing_id` this system already has `grader`/`grade` for.

### Phase 14Q freshness-aware savings (modeled, labeled as estimates)

Two changes reduce avoidable calls without touching cadence, reserves,
BATCH, or verification correctness:

1. **Image-recovery dedupe** (`lib/imageRecoveryPolicy.js`, shared by
   `verify-deals` and `screen-deal-images`) — `verify-deals` runs far
   more often (every 30 min) than `screen-deal-images` (hourly) and now
   extracts image data from the SAME snapshot call it already made for
   status/price (zero extra cost). When it recovers an image first,
   `screen-deal-images`'s own `hasStoredImages` check now finds the row
   already satisfied and skips its recovery call entirely.
2. **Graded-lookup dedupe** (`refresh-deals`) — a per-sweep `deals`
   lookup keyed on the exact `listing_id`s in that sweep skips
   `getGradingDetails` for any listing this system already has
   `grader`/`grade` for (e.g. from the ~25% sweep-window overlap above,
   or a listing still present a few 15-minute cycles later), without
   ever inferring grading from a different listing.

| Scenario | Image-recovery calls saved/day | Graded-lookup calls saved/day | Total saved/day | Revised ceiling/day |
| --- | --- | --- | --- | --- |
| LOW (10% / 5% reuse) | ~29 | ~50 | **~79** | ~4,993 |
| NORMAL (30% / 15% reuse) | ~86 | ~151 | **~237** | ~4,835 |
| HIGH (50% / 25% reuse) | ~144 | ~252 | **~396** | ~4,676 |

The Phase 14Q target was ≥300/day **if safely achievable, without forcing
it**. Only the HIGH-assumption scenario clears that bar; NORMAL does not
quite reach it. Reported as modeled, not claimed as measured — there is
no call-level production telemetry to confirm the actual reuse rate.

**Revised sustainability verdict: still BORDERLINE, not YES.** The 14Q
savings meaningfully claw back headroom (up to ~400/day under optimistic
assumptions) but `ingest-feed`'s opportunistic ~240–720/day still sits on
top whenever quota allows, so the fixed+opportunistic total can still
reach or exceed 5,000/day on a given day. A rate-limit increase (see
below) remains recommended; these fixes buy margin, they do not remove
the need for one.

## Phase 14R — real call telemetry (2026-09-10)

Every number above this section is **modeled from code and cron
configuration**, not measured. Phase 14R adds real, per-invocation
telemetry so future quota decisions (including whether to pursue a higher
official limit) can be based on production evidence instead.

### Architecture

- **Shared call-accounting chokepoint**: `lib/ebay.js`'s `fetchWithRetry`
  is the ONLY function that calls a real Browse endpoint (confirmed by
  grepping every call site) — `getAccessToken` (OAuth) and
  `getBrowseRateLimit` (Analytics) both use a plain `fetch` and never pass
  through it. `fetchWithRetry` calls `recordBrowseCall()` once per real
  HTTP attempt, so a retried request counts twice, and a call answered
  from a 14Q dedupe decision (which never reaches `fetchWithRetry` at all)
  counts zero times. `getBrowseRateLimit` calls the separate
  `recordAnalyticsCall()` instead — the two pools are never mixed.
- **Attribution**: `lib/ebayTelemetry.js` uses Node's `AsyncLocalStorage`
  to give each route invocation an explicit, in-memory context object
  (`beginJobRun({ job, mode, country })`) that every subsequent `await` in
  that invocation shares — an explicit request context, not stack
  inspection — so `fetchWithRetry` can attribute a call to whichever
  route invoked it without threading a job tag through every intermediate
  function (`searchListings`, `getGradingDetails`, ...).
- **Job attribution names** used in `job` (never a shared generic `ebay`
  bucket): `refresh-deals:sweep`, `refresh-deals:allocated`,
  `refresh-deals:manual` (the unscheduled/legacy path), `verify-deals`,
  `screen-deal-images`, `refresh-sealed-deals`, `ingest-feed`. The sweep's
  own `getGradingDetails` sub-consumer is broken out via a
  `graded_detail_calls` column on the SAME row (it happens inside the
  sweep/allocated invocation, not as a separate route).
- **Persistence**: one row per ROUTE INVOCATION (not per API call) in
  `ebay_job_runs` (`supabase/ebay_job_runs_migration.sql`), written
  best-effort in a `finally` block on every exit path (success, quota
  skip, partial/degraded success, or a caught provider error) — the same
  "analytics must never break the job it's observing" contract as the
  pre-existing `discovery_events` table. A telemetry write failure is
  swallowed and logged, never thrown. No token, credential, or raw
  response payload is ever persisted — only counts, a quota snapshot, and
  an error CLASS name (never a message or stack).
- **Ingest-feed** keeps its existing, richer `recordIngestRun` /
  `catalog_snapshot(kind='ingest_feed_runs')` history untouched (Phase 2's
  P0.3.2 observability) — Phase 14R adds an `ebay_job_runs` row alongside
  it for uniform cross-route querying, not a second competing system.

### Browse vs Analytics calls

`buy.browse` (the 5,000/day budget every number in this document is
about) and the Analytics rate-limit check (`getBrowseRateLimit`, a
different resource with its own generous limit) are separate pools.
`analytics_calls` on a row is informational only — it is never summed
into `browse_calls` and never gated against the Browse reserve floors.

### Daily report

`npm run ebay:quota-report` (optionally `-- --date 2026-09-10` or `--
--json`) reads `ebay_job_runs` for one UTC calendar day and prints: total
Browse calls, calls by job, calls by UTC hour, calls skipped by
reserve/rate-limit, Phase 14Q dedupe-savings counters
(`dedupe_saved_image`/`dedupe_saved_grading`), the latest observed quota
remaining, the largest consumer, the peak hour, and a linear end-of-day
projection from the burn rate so far (omitted in the first 15 minutes of
the day, to avoid a wild early extrapolation). The aggregation itself
(`lib/ebayQuotaReport.js`) is pure and unit-tested — the script is a thin
Supabase-read wrapper around it.

### Interpreting the dedupe-savings counters

`dedupe_saved_image` and `dedupe_saved_grading` increment ONLY at the
exact point a real eBay call was avoided because the answer was already
known from a call this system had to make anyway (verify-deals resolving
an image via a status call it always makes; a sweep reusing a
`listing_id`'s already-known grading) — never for a path that was never
going to call eBay regardless (a row that already had a stored image, a
listing a sweep never matched). Once enough days of production data
accumulate, sum these across `ebay_job_runs` and compare against the
Phase 14Q modeled LOW/NORMAL/HIGH savings table above — this is the
comparison that finally answers whether that model was accurate, and
should be labeled MEASURED, not modeled, once it is.

## Mitigations applied

1. **Pre-flight quota guard** — `getBrowseRateLimit()` in `lib/ebay.js`
   reads the live `buy.browse` remaining count (from the Analytics API, a
   different resource with its own generous limit). Both scan routes
   (`app/api/refresh-deals`, `app/api/refresh-sealed-deals`) call it once
   up front and **skip the run** (`{ skipped: "ebay_rate_limited" }`,
   HTTP 200) when `remaining` is below a floor. Floors are tier-aware so
   the cheap, user-facing **sweep** keeps running longest and the
   low-priority **extended** tier yields first:
   - sweep / sealed / manual: **250**
   - priority: **600**
   - extended: **1,500**
   A failed meta-call returns `null` → the run proceeds rather than
   blocking on it.
2. **Volume trims** (`vercel.json`): non-US sweeps hourly → every 3 h;
   priority tier every 4 h → every 6 h; sweep `GRADED_LOOKUP_CAP` 10 → 6.
3. **Transient-only retry** — `fetchWithRetry` in `lib/ebay.js` retries
   once on a 5xx / network blip. It **never retries a 429** (that just
   burns more quota and prolongs the block).
4. **Expire-on-empty guard** — `searchListings` now returns
   `{ listings, total }`. The per-card and sealed scanners only expire a
   card's existing deals (`is_active=false`) when the scan is a
   trustworthy view: it matched a listing, or eBay returned a real
   `total` (even `total:0` "nothing for sale"). An empty response with no
   `total` — a degraded/malformed 200, as opposed to a 429 — no longer
   wipes the cached deals the site falls back to. A failed sweep also
   returns a 200 (`skipped:"ebay_error"`) instead of a cron 500.

With the guard in place the daily budget can no longer be *overrun*; at
worst the extended tier is skipped for a day, which is acceptable
(it is confirm/expire duty — the sweep already finds new deals).

## The real fix: request a higher limit

5,000 Browse calls/day is eBay's default for a new app. Apps with a
legitimate, disclosed use case get much higher limits. This app drives
affiliate GMV to eBay (eBay Partner Network), which is exactly the
intended Buy-API use case.

**Action:** in the [eBay Developer Program](https://developer.ebay.com/)
portal, open **Application Growth Check** / submit a **rate limit
increase request** for the Buy → Browse API, describing the use
(affiliate deal aggregation across 5 marketplaces, ~N calls/day, growing).
Until that is granted, keep the mitigations above; once granted, the
`vercel.json` cadences and `EXTENDED_CHUNKS` can be relaxed.

## Re-checking status

```
node -e "require('dotenv').config({path:'.env.local'});
const {getBrowseRateLimit}=require('./lib/ebay');
getBrowseRateLimit().then(r=>console.log(r));"
```
