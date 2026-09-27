# Vercel cost audit - 2026-09-27

Invoice under review: ~$233.73 for the current period. Line items (owner's figures):
Observability Events $51.83, Image Optimization Transformations $46.39, Image Optimization
Cache Writes $36.16, ISR Writes $34.36, Build CPU Minutes $23.07, Function Storage $11.46,
Fluid Provisioned Memory $10.19, Fluid Active CPU $7.55, Fast Origin Transfer $7.97.
Fast Data Transfer and Edge Requests ~$0.

Every number below marked **measured** comes from the Vercel Observability query API or the
runtime-log API for this project (prj_2TBMLoTBL0bn5TyDVPTvwBdLTofw), read on 27 Sep 2026
06:00-07:30Z. Everything marked **estimate** is derived from those numbers and stated as such.

## 1. Baseline - what the traffic actually is

**Measured, 28 Aug -> 27 Sep, requests by Vercel bot classification (4.86M total):**

| Class | Requests | Share |
|---|---|---|
| ai_crawler (meta-externalagent, amazonbot, applebot ...) | 2,929,645 | 60% |
| browser_impersonation (rotating Chrome UAs, no bot name) | 871,861 | 18% |
| unclassified (humans and unknown) | 391,245 | 8% |
| search_engine_optimization (ahrefs, semrush, seranking ...) | 350,548 | 7% |
| http_client | 197,794 | 4% |
| search_engine_crawler (Google, Bing, Yandex) | 120,304 | 2.5% |

Two waves. **1-16 Sep: AI crawlers** at 100k-300k requests/day (peak 299k on 4 Sep). They also
fetched `/_next/image` URLs, which is where the image bill came from (section 2). **13 Sep ->
now: browser impersonation** - ~20 distinct `Chrome/1xx.0.0.0 Safari/537.36` user-agent strings,
each 13k-37k requests/day, hitting EVERY page of the site in bursts of ~4 requests per page per
minute (runtime log sample: `/methodology` 06:57:04, :05, :05, :06, 06:58:02, :03, :05, :05 ...).
On 26 Sep that class alone was 275,879 of ~315,000 requests (88%). Unclassified traffic (the
closest thing to humans) is ~4-10k requests/day: `/cards/[slug]` 1.7k, `/deals/[id]` 1.2k,
`/_next/image` 1k, `/sets/[slug]` 0.7k per day.

**The bill is therefore mostly serving bots, not application behaviour** - with two real
application-side amplifiers underneath it (segment cache writes and ISR churn on the long-tail
page families, section 4) and one genuine application cost centre (page render compute, section 6).

## 2. Image Optimization ($46.39 + $36.16)

**Measured transformations per day:** 1.7k-5k (28-31 Aug) -> **112k-157k/day 1-6 Sep** -> 71k
(7 Sep) -> 17k, 12k (8-9 Sep) -> 2-5k (10-17 Sep) -> **130-800/day since 18 Sep**. 30-day total
906,398, of which 851k (94%) fell on 1-9 Sep - the AI-crawler wave, before the VERCEL-COST-1
image changes already in the tree (WebP only, two qualities, four device widths, two image
widths, `minimumCacheTTL` 31 days, eBay listing photos served `unoptimized` via
components/DealImage.js).

So the transformation and cache-write charges are **already ~99% gone at today's run-rate**
(~300/day = ~9k/month vs 906k). The remaining code-side exposure found in this audit:

- `components/BoardDealCard.js` (added 27 Sep, and the "More deals" section before it) put
  **eBay listing photos through `next/image` with `fill` + a `vw` sizes string** - unique per
  transient listing, 5,274 of them on /more-deals, up to 4 widths x 2 qualities each. That is the
  exact pattern DealImage.js was written to avoid. A crawl of the 110 pages of /more-deals would
  generate up to ~40k transformations and cache writes (estimate: 5,274 x 4 widths x up to 2
  qualities). Fixed in this pass: rendered through DealImage (unoptimized, eBay's own s-l size
  variants).
- Every other `next/image` use is a stable, reused source (TCGplayer product images by id, set
  logos, official card art) where the 31-day cache TTL pays off. Kept.

## 3. Observability Events ($51.83)

**Measured, runtime-log events in the last 24 h: ~345,000**, by source: `cache` 272,710 (CDN
hits/stale served), `function` 59,858, `middleware` 11,651, `rewrite` 1,209. By level the
APPLICATION logs are tiny: error 1,124, info 73, warn 15. **Every request produces one event**,
so the event count IS the request count (~10M/month at this rate), and the application's own
console output is ~0.3% of it.

The 1,124 errors/day are almost all `/deals/[id]` (1,042) - 404s for expired deal ids being
re-requested by the same bot wave (a 404 render is still a function invocation and a log line).

Consequence: rewriting console.* calls cannot move this line materially. Cutting the bot traffic
can (section 7). Application logging was still audited for per-item noise in the cron jobs
(section 5) and tidied where a loop logged per item.

## 4. ISR Writes ($34.36)

**Measured write units, 20-27 Sep (8 days), by route:**

| Route | Write units | Note |
|---|---|---|
| /cards/[slug] | 939,809 | 15k MISS + 6.6k STALE requests per 1.3 days - long tail, ~every request regenerates |
| /sets/[slug] | 657,713 | 66k HIT + 15.8k STALE per 1.3 days - every set page regenerates every hour because bots touch it every minute |
| /pokemon/[slug] | 218,821 | same shape |
| / (+ .segments) | 110,421 | revalidate 180 s; ~17 units per regeneration (478 KB page) |
| /deals (+ .segments) | 66,100 | revalidate 600 s |
| everything else | < 10,000 each | |

Total ~2.0M units / 8 days -> ~7.5M/month, consistent with the $34 line. **Time-based
revalidation on the three long-tail families under constant bot load is 90% of ISR writes.**
There are NO broad tag invalidations in the codebase that explain the volume - see the
invalidation graph in section 4b (the ingest run's board tag and the catalogue tag are the only
tag revalidations and both fire only on change / once a day). The `.segments` rows are Next 16's
client segment cache: each regeneration of / or /deals also writes 3 segment entries.

## 5. Functions / crons (Fluid $17.74)

**Measured GB-hours, 20-27 Sep, by route:** `/cards/[slug]` 58.7, `/deals/[id]` 17.3,
`/api/refresh-deals` 17.2, `/sets/[slug]` 10.7, `/pokemon/[slug]` 6.1, `/api/deals-page` 5.7,
`/japanese-cards` 3.4. **Page rendering for bots is ~75% of compute; the scanner
(`refresh-deals`) is the only cron that registers.** No cron change is warranted on cost grounds
(deal freshness stays as it is).

## 6. Builds ($23.07) and Function Storage ($11.46)

**Measured:** 100 production deployments between 22 Sep 11:07Z and 27 Sep 06:30Z (~19/day), one
per pushed commit; 890 commits to main in 30 days, of which **255 (29%) touched only docs/,
tests/, scripts/, supabase/, .github/ or Markdown** - each of those still ran a full Next build
(~2 min) and stored a full function bundle. Function Storage scales with retained deployments x
bundle size, so the same fix lowers both lines.

## 7. Fixes shipped in this pass (VERCEL-COST-2)

Everything below is in the tree and pinned by `tests/scanner/vercel-cost-2.test.mjs`; the
existing suites (`refresh-freshness`, `set-catalog-aggregates`) were updated where they pinned
the old behaviour. Ratchet: no new failures. `next build` clean.

| # | Change | Cost line | Expected effect (estimate unless noted) |
|---|---|---|---|
| 1 | **Bot Filter** (Vercel Firewall managed rule, action *challenge*) - NOT applied: the API call was refused by this session's permission layer. Owner action, one toggle: Project > Firewall > Bot Filter > Challenge. | Observability, ISR writes, Fluid, FOT | **Measured** 88% of current requests are browser-impersonation bots; challenging them removes that share of request events, of STALE/MISS regenerations on the long-tail pages and of page-render compute. Real browsers pass the challenge; verified search crawlers are not in this category. |
| 2 | `scripts/vercelIgnoreBuild.sh` + `vercel.json` `ignoreCommand`: a push that touched only docs/, tests/, scripts/, supabase/, .github/ or Markdown is not built. Judged against the previously deployed SHA; fails open (any doubt builds). | Build CPU, Function Storage | **Measured** 29% of the last 30 days' commits (255 of 890) were such commits. Roughly that share of builds and stored bundles disappears. |
| 3 | `.vercelignore`: ~300 MB of committed QA screenshots, docs, tests, design files left out of every deployment upload. | Build minutes, storage | Smaller upload and working set per build (**measured** sizes in section 6). |
| 4 | eBay listing photos in `BoardDealCard`, `HomeBudgetDeals`, `SealedDealCard` and the sealed detail page now render through `DealImage` (eBay's own size variants, no Vercel transformation). Two `quality={80}` uses fixed (not a configured quality: every checklist thumbnail was a 400); the checklist thumb is fixed-size (1 variant instead of 6). | Image transformations + cache writes | Prevents the /more-deals surface (5,274 transient photos x up to 8 variants) from recreating the September spike; the run-rate is already ~300/day. |
| 5 | `/api/refresh-catalog`: CRON_SECRET; compares each snapshot kind with the stored row (key-order-insensitive) and writes only what changed; expires the new `catalog-snapshot` tag (now carried by fetchSets / fetchCardHubs / fetchSpeciesHubs) only when a deal-derived aggregate changed - instead of the site-wide `deal-lists` tag on every run. | ISR writes, Fluid | Removes 48 unconditional site-wide invalidations a day (homepage, 12 category pages, every cached deals-page permutation). The invalidation the route was meant to perform (snapshot readers) now actually happens. |
| 6 | `/api/check-alerts`: CRON_SECRET (was publicly callable and sends email). | Fluid, Resend | Closes an unbounded-invocation hole. |
| 7 | `lib/jimmyFeed.fetchJimmyFeed`: stops after two consecutive refusals (403/429/1015) with nothing read. | Fluid | **Measured** the host refuses every Vercel request; each half-hourly run slept ~60 s across 24 refused requests, the daily full pass 360 s (past its 300 s ceiling). Now ~5 s per run. ~48 min/day of billed sleep removed. |
| 8 | `lib/boardDealsFeed`: the whole-store cache entry was 4.5 MB - over Next's 2 MB data-cache limit, so it was never cached and every homepage, /deals and /more-deals render re-read the store from Supabase. Replaced by a ~300 KB index + per-page reads. | Fluid, Supabase, FOT | **Measured** the build log's "items over 2MB can not be cached" warning is gone. |
| 9 | Logging (`lib/runtimeLog.js`): the per-search `[searchEngine]` line is debug-only (`LOG_DEBUG=1`); sync-watchlist's per-set line (218-442 per run) is debug-only with one summary line; refresh-deals' uncapped per-listing error lines are capped at 3 per instance with counts in ONE completion line per run and in the response. | Observability | App console output was **measured** at ~1,200 events/day (0.3% of events) - this is a tail-risk fix (a bad column could have emitted ~150k lines/day), not a headline saving. |
| 10 | outreach-worker returns before its Supabase read and Instantly probes while automation is off (96 runs/day). | Fluid | Small; removes pointless network I/O. |
| 11 | Explicit `maxDuration` on user-facing dynamic routes that inherited the 300 s default. | Fluid | Caps the cost of a hung upstream. |

### 7b. Invalidation graph after the change

- deal scan stores a deal -> `deal-lists` (unchanged; gated on `dealsFound > 0`)
- retirement (verify / sweep / ingest) -> the retired rows' `card-offers:*`, `deal-detail:*`, the affected `set-deals:*` / `species-deals:*` / `all-deals:*`, plus `deal-lists` (unchanged)
- catalogue sync writes prices -> `catalog-prices` (unchanged, once a day, write-gated)
- catalogue refresh changes an aggregate -> **`catalog-snapshot`** only (was: `deal-lists`, unconditional)
- ingest publishes/unpublishes a board row -> `board-deals` (unchanged, change-gated)

### 7c. Considered and not changed (with the reason)

- Cron schedules, scan frequency, revalidate windows: unchanged. The measured driver of ISR
  writes is bot traffic against the long-tail pages, not the windows; changing windows would
  trade freshness for money before the traffic fix is in.
- `/api/social-auto` hourly cron always returns a skip on Vercel (~730 no-op invocations a month,
  < 1 s each). Left in place: cron entries are pinned by the autonomous-ops tests and the cost is
  negligible.
- Staggering the `:00` / `:30` cron pile-up: recommended, not done (schedule pins).
- `sharp` is not a declared dependency (two screening routes degrade to "no verdict" if the
  optional build ever drops it). Recommend declaring it.

## 8. Residual risks

- The ignore command trusts `VERCEL_GIT_PREVIOUS_SHA`; if Vercel's clone lacks it the script
  builds (fail-open), so the worst case is a wasted build, never a missed one.
- `DealImage` is a client component; the four surfaces that now use it render a bare `<img>`
  with eBay's srcset for listing photos, exactly as DealCard already did.
- `refresh-catalog` now needs the cron header; `scripts/triggerScan.js` already sends it.
- The Bot Filter (item 1) is the only change with user-facing risk (a challenge page for
  flagged clients) and it is the owner's to enable; it is also the single biggest lever here.

## 8. What to verify in the Vercel dashboard

- **24 h:** Firewall > Bot Filter challenge count; Observability > Requests by bot category
  (browser_impersonation should collapse); ISR write units for /sets/[slug] and /cards/[slug]
  (expect a large drop); Image transformations still < 1k/day; Deployments list shows skipped
  builds for docs-only commits.
- **7 days:** the Usage page's Observability Events, ISR Writes, Fluid Active CPU and Fast Origin
  Transfer trend lines; Build minutes; Function Storage GB-hours.
