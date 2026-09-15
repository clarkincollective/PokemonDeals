# Search Console weekly reading — 2026-09-15

Pulled with `node scripts/_gscAudit.mjs perf ...` (dataState=all, web) and the URL Inspection API.
Compare against [`gsc-baseline.md`](./gsc-baseline.md) (2026-08-10 → 09-11). GSC data lags 2–3 days, so
2026-09-13 → 09-15 is incomplete.

## Totals (2026-08-25 → 09-15): 5 clicks · 856 impressions · CTR 0.58 %

Daily impressions: ramp to 71–91/day (08-29 → 09-03), then a steady slide — 57, 48, 54, 37 (09-04 → 09-07),
31, 24, 10, 12, 25, 23, 39 (09-08 → 09-14). Impression-weighted position moved the other way: ~50 in late
August, 15–20 in the first week of September, 5–14 from 09-11. Fewer, better-placed impressions — the usual
end of a new domain's first-crawl "test" phase. The decline began 09-04, before the SEO-2 / SEO-3 (09-11) and
deal-first (09-13) releases, so those releases are not the cause.

## Family comparison — week of 09-01 → 09-07 vs 09-08 → 09-14

| Family | URLs w/ impr. | Impressions | Clicks | Impr.-weighted pos |
|---|---|---|---|---|
| `/cards/*` | 188 → **55** | 326 → **94** | 0 → 0 | 21.9 → **14.0** |
| `/deals/<id>` | 46 → 41 | 109 → 73 | 0 → 0 | 16.6 → **7.9** |
| `/` | 1 → 1 | 29 → 13 | 3 → 1 | 5.4 → 11.0 |
| `/` with query params | 18 → 2 | 25 → 2 | 0 → 0 | 6.5 → 6.5 |
| `/sealed-deals/*` | 1 → 2 | 2 → 9 | 0 → 0 | 4.0 → 12.8 |
| `/deals` (index) | 1 → 1 | 2 → 5 | 0 → 0 | 7.0 → 1.0 |
| `/pokemon/*` | 1 → 1 | 1 → 2 | 0 → 0 | 49.0 → 46.5 |
| `/guides*`, `/sets/*`, `/about`, `/methodology`, `/search`, `/privacy`, `/best-finds` | 12 → 0 | 30 → 0 | 0 → 0 | — |

Week totals: 534 impressions / 3 clicks → 198 / 1. Keyed queries in the second week: 22 (26 impressions),
all position 40–50 card-identity / card-value queries ("aegislash ex price", "charmander rc3/rc32", …) plus
one deal-intent query, "discount pokemon cards".

## GSC Pages report (UI, 2026-09-15): 1,801 indexed · 24,964 not indexed

The API does not expose this figure; it is read from the Search Console Overview.

## URL Inspection (API, 2026-09-15 ~21:00 UTC)

| URL | Verdict | Last crawl | Referring URLs seen |
|---|---|---|---|
| `/pokemon` | Crawled – currently not indexed | 2026-09-15 02:27 | a card page, a homepage param URL |
| `/cards` | **URL is unknown to Google** | — | — |
| `/deals` | **URL is unknown to Google** | — | — |
| `/sets/base-set` | **URL is unknown to Google** | — | — |
| `/guides/pokemon-card-grading-scale` (published 09-07) | **URL is unknown to Google** | — | — |
| `/pokemon/charizard` | Discovered – currently not indexed | — | — |
| `/cards/charizard-base-set` | Discovered – currently not indexed | — | `/?listing=FIXED_PRICE&page=2&country=EBAY_GB` |
| `/deals/graded` | Discovered – currently not indexed | — | `/sets/base-set-2`, `/?page=12` |

Three hub pages that are in `pages.xml` and footer-linked from every page were still unknown to Google
ten days after SEO-GSC-2 shipped the footer links. Google is processing this domain's 26k-URL sitemap
very slowly; the referring URLs it does record are homepage filter/page permutations.

## Actions taken 2026-09-15 / 16

1. **Homepage made statically cacheable** (`77cde84`, production `dpl_ASGnhQy5g8Z9m2G6ZHVXyRMoz64m`).
   `app/page.js` no longer reads `searchParams`; the feed moved to `components/HomeFeed.js` +
   `/api/deals-page?kind=home`. Every `/?…` variant now canonicalises to `/` and carries
   `X-Robots-Tag: noindex, follow` from `next.config.mjs` (verified live: `/?page=2`, `/?country=EBAY_GB`).
   Effect on the table above: the 18 → 2 "home with params" URLs will leave the index and consolidate
   into `/`.
2. **Child sitemaps submitted individually in GSC** (all nine): `pages` (36 discovered), `sets` (208),
   `pokemon` (906), `cards-high`, `cards-mid` (2,261), `cards-low` (4,576), `cards-bulk` (15,624),
   `deals` (1,239), `sealed-deals` (241). Per-family coverage is now visible in the Sitemaps report.
3. **Indexing requested via URL Inspection** (all confirmed "Indexing requested" in the UI) for `/cards`,
   `/pokemon`, `/deals`, `/sets/base-set`, `/pokemon/charizard`, `/cards/charizard-base-set`,
   `/guides/pokemon-card-grading-scale`, `/guides/how-to-check-pokemon-card-condition`, `/deals/graded`,
   `/latest-releases`. Within the hour `/guides/pokemon-card-grading-scale` (unknown to Google at 21:00 UTC)
   already read "URL is on Google", and `/guides/how-to-check-pokemon-card-condition` moved from "unknown"
   to "Crawled – currently not indexed". Quota is ~10 requests/day; the next batch (2026-09-16) should be
   `/sets`, `/guides`, `/market-data`, `/deals/uk`, `/deals/australia`, `/pokemon/pikachu`, `/pokemon/umbreon`,
   `/sets/sv10-destined-rivals`, `/best-finds`, `/methodology`.

4. **IndexNow** (`7280650`): key file live at `/7a55ee1154e991b2366b89fcc47ed41e.txt`; `npm run seo:indexnow`
   submitted all 26,319 sitemap URLs (three batches, all HTTP 200 on the second run - the first run's
   first two batches got 403 `SiteVerificationNotCompleted` while the engines fetched the key). Bing /
   DuckDuckGo / Yandex now have the full URL list; Google ignores IndexNow. Re-run after large sitemap
   changes.
5. **Second indexing-request batch (same evening):** `/market-data`, `/deals/uk`, `/deals/australia`
   (all "URL is not on Google" beforehand); `/sets` and `/guides` were already on Google and were skipped.
   Enhancement reports read: Breadcrumbs 3 valid / 0 errors; Product snippets and Merchant listings 0
   items (a card page only emits Product+Offer while it has a live listing - the sampled indexed card
   had none, so this is expected, not a regression); Core Web Vitals has no field data yet.

## What to check next Monday (2026-09-22)

- Sitemaps report: "discovered" per child should stop reading as the raw URL count and start showing
  indexed pages per family; `cards-high` in particular.
- URL Inspection on the eight URLs above: expect "Crawled" or "Indexed" instead of "unknown".
- Pages report: 1,801 indexed should rise; watch that "Alternate page with proper canonical tag" absorbs
  the homepage param URLs rather than "Excluded by noindex" growing on anything else.
- Baseline metrics 1–4 and 11 from `gsc-baseline.md` on the 28-day window ending 09-21.

Decision rule unchanged: three consecutive weekly readings before calling any of this a trend.
