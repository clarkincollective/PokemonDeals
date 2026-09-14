# "All deals" browsing — bounded implementation brief

Prepared 2026-09-14 after integrity release r1. **Not started.** This is the next queued phase. It is separate from graded inventory growth: the graded lookup optimisation and the retention/recovery experiment stay inactive.

## Goal

One page where a buyer can browse **every eligible stored listing** across marketplaces, with useful filters, **accurate counts** and dependable pagination. It uses only listings the scanners have already stored and adds **no discovery or paid-provider calls**. The homepage stays curated.

## Current state

- **`/deals`** is a category hub ("Browse by category") with a 12-card preview. Categories (`under-25/50/100`, `graded`, `auctions`, `vintage`, `modern`, …) live in `lib/dealCategories.js` and render through `DealCategoryPage` in `app/deals/[id]/page.js`, which also serves deal ids.
- **The homepage `/`** shows curated lanes. It switches to a paginated list only for `?page≥2` or `?sort`, through `fetchDealsPage`.
- **`fetchDealsPage`** (`lib/deals.js`) is SQL-filtered offset pagination: 24 per page, capped at 25 pages, cached 180 s. It has these known limits for an "all deals" view:
  - **the count is Postgres's `estimated` count** of rows matching the SQL filter, taken **before** the display gate and dedup, so it overstates what can be shown;
  - **gated rows are dropped after the page is fetched**, so pages come up short (for example quarantined `identity:*` rows, slab-titled raw rows, stale rows);
  - **dedup is per card within a page** (graded: card + grader + grade), so two distinct listings of the same raw card cannot both appear;
  - **the 25-page cap** hides the long tail.
- **Filters** already exist and should be reused: `planDealFilters` (raw/graded, grader, grade, BIN/auction, min/max `total_price_usd`), marketplace (`deliveryCountry` semantics, local-first ordering when a country is selected), sorts (newest, savings, price, ending), and title search `q` (ILIKE on stored titles, no provider call).
- **Reusable UI:** `DealGrid`, `FilterBar`, `Pagination`, `DealCard` (plain `<a>` tiles, so no prefetch of `/deals/<id>`, which renders with a billed PPT call), and the graded pilot's pre-hydration guard and fail-safe.
- **Inventory at the integrity-r1 snapshot:** ~1,258 active card rows across 6 marketplaces. The shared pool cap `DEAL_POOL_MAX_ROWS` is 1,200.

## Scope (bounded)

1. **Route:** `/deals/all` as a new `DEAL_CATEGORIES` entry with no fixed filter, reusing `DealCategoryPage`. It needs a link from the `/deals` hub and a "More deals" entry in the nav model (shared by the desktop dropdown, mobile menu and footer). **Not** a homepage change.
2. **Eligibility:** exactly the rows `isDisplayableDeal` accepts (single cards, active, every quality/identity/freshness gate, including quarantine reasons). A plain listing with no trusted reference stays visible but is labelled plain and never ranked by savings (existing `savingsClaimTrusted`). Sealed and Japanese stay on their own pages.
3. **Accurate counts:** the count shown is the number of **eligible distinct listings** for the current filters. It is not an estimate, and it is never the length of the current page presented as the total.
   - *Recommended approach:* an eligible-listing index built server-side from a paginated read of active rows (SQL pre-filter: `is_active`, `disqualified_reason IS NULL`, language). Apply the real display gate and listing-level dedup in code, cache it on the existing 180 s pool cadence, then filter, sort and paginate in memory. At ~1.3k rows that is two 1,000-row reads.
   - Add a measured row ceiling with a documented fallback (the SQL path with a clearly labelled "about N" count) if active inventory outgrows it.
4. **Listing-level dedup:** one tile per eBay listing.
   - The same listing stored for several marketplaces collapses to one offer in "All marketplaces", with the listing's own marketplace shown.
   - Within one marketplace, distinct listings of the same card are all shown. This is a deliberate change from the per-card dedup the category pages use; keep that behaviour on those pages.
5. **Filters:** marketplace (all / each), raw/graded with grader and grade, BIN/auction, price min/max, sort (newest, savings where trusted, price ↑/↓, ending soon for auctions), and title search.
   - Applied-filter chips, and a single clear-all that resets the page.
   - Filter changes reset `page`. The graded pilot's cold-navigation guard applies.
6. **Pagination:** 24 per page with a stable order (sort column, then `id`). "Showing a–b of N" uses the exact N.
   - No arbitrary page cap while the index path is used.
   - An out-of-range page renders the last valid page or an explicit empty state, never an error.
7. **Prices:** shown in the viewer's geo-detected currency, converted-only, marked ≈ (existing rule). Filter bounds stay in canonical USD, with the label saying so.

## Non-goals

- No change to the homepage's curated lanes or ranking.
- No scanner, allocator, verifier, quota or provider change; no new discovery.
- No graded optimisation, retention or recovery work.
- No sealed/Japanese merge, no new SEO landing pages beyond `/deals/all`, no sitemap change.

## Owner decisions needed before implementation

1. **Indexing:** page 1 of `/deals/all` indexable with canonical `/deals/all`, and filtered/paged views `noindex,follow` (recommended), or all `noindex`.
2. **Nav placement:** "More deals" group (recommended, keeps the mobile shortcut tiles unchanged) or replace the "Browse Deals" shortcut target.
3. **Dedup change** (scope item 4): accept listing-level dedup on this page only.
4. **Row ceiling for the index path:** proposed 5,000 active rows, above which it falls back to the labelled estimate.

## Acceptance

- **Counts are exact:** over the provider-disabled fixture, N equals the sum of the tiles rendered across all pages for every tested filter combination (all, each marketplace, graded+PSA, BIN, price band, search), with no duplicates or gaps across page boundaries.
- **Exclusions:** quarantined rows (`identity:collector_number_conflict`), slab-titled raw rows (`identity:graded_title_on_raw`), stale, inactive, sold/ended and wrong-language rows never appear and are not counted.
- **Multi-marketplace listings:** a listing stored for two marketplaces counts once in "All" and once in each of its marketplaces.
- **Filters and back/forward:** filter changes reset to page 1; back and forward restore the exact result set; no-JS shows server-rendered page 1 with an honest note if client filtering needs JS.
- **No provider calls:** the fixture passes `R3ProviderIsolation`; no route on the page reaches eBay or PPT; tiles do not prefetch `/deals/<id>`.
- **Unchanged pages:** homepage output identical before and after (curated lanes unchanged); existing category pages keep their counts and dedup.
- **Performance:** server render ≤ existing category pages (measure p95 on the fixture and one production read-only sample); cache hit path does no per-request full scan.
- **Layout:** 320/390/430/1280 px, light and dark, keyboard and touch; the scanner baseline failure set unchanged.

## Verification plan

Offline fixture first, using the existing R3 runtime plus the integrity harness pattern for data paths. Then a guarded production check: plain GETs of `/deals/all` and `/api/deals-page` only, no deal-detail or affiliate navigation, no browser automation unless approved.
