# SEO Implementation Status

Tracking against the 26-phase brief. Updated as work completes and is verified (build + local/live checks), not merely written.

## Completed (this session, verified live in production)

- **Phase 1 — Audit**: done (architecture, schema, rendering, sitemap, robots, canonical, metadata, structured data, internal linking, pagination all inspected and documented in conversation).
- **Phase 2 — URL architecture**: `/`, `/best-finds`, `/sets`, `/sets/[slug]`, `/cards/[slug]`, `/japanese-cards`, `/sealed-deals`, `/sealed-deals/[id]`, `/deals/[id]`, `/search`, `/market-data`, `/market-data/most-listed-cards`, `/market-data/most-expensive-cards`. Adapted from the brief's example paths per its own instruction ("use existing routing conventions if better") — no `/pokemon-card-prices/` alias (would duplicate `/`), no separate `/graded/`/`/auctions/` routes (existing `?type=graded`/`?listing=AUCTION` filters cover the same intent without a new URL).
- **Phase 3 — Card pages**: `/deals/[id]` (individual listing) + `/cards/[slug]` (hub consolidating 2+ simultaneous listings of the same exact print — real fix for a verified duplicate-content problem: 69% of watched cards had 2+ active listings). Real price history, raw/graded variant grid, related-listing offers. No fabricated fields.
- **Phase 4 — Set pages**: `/sets` (index, client-filterable) + `/sets/[slug]` (175 real sets with an active deal). BreadcrumbList added.
- **Phase 6 — Deal pages**: `/`, `/best-finds`, `/japanese-cards`, `/sealed-deals` all real, paginated, filterable.
- **Phase 7 — Market data**: `/market-data`, `/market-data/most-listed-cards`, `/market-data/most-expensive-cards`. Real aggregate queries only.
- **Phase 9 — Internal linking**: set names linked from every DealCard site-wide; multi-listing deals link to their card hub; card hubs and deal-detail pages link to the Pokémon species page; homepage surfaces top-8 real card hubs; breadcrumbs on deal/card-hub/set/species pages.
- **Phase 10 — Metadata**: per-page title/description/canonical/OG/Twitter, real data, length-aware (card hub titles cap at ~60 chars, drop promotional suffix rather than truncate real card names).
- **Phase 11 — Structured data**: Product+Offer (deal detail, sealed detail, card hub — includes image), BreadcrumbList, FAQPage, WebSite+SearchAction, Organization. No invented ratings/reviews.
- **Phase 12/13 — Crawl control**: no faceted-URL bloat (filtered/paginated URLs verified to canonicalize back correctly), `/search?q=` noindex,follow, robots.txt clean with sitemap declared. **Sitemap index + segmented child sitemaps** — see Phase 15.
- **Phase 14 — Canonicals**: self-referencing per page, verified live across all page types including filter combinations.
- **Phase 15 — Sitemaps**: **sitemap index at `/sitemap.xml` + one child per page type** at `/sitemaps/<segment>.xml` (`pages` 15, `sets` 175, `pokemon` 223, `cards` 976, `deals` 5000-capped, `sealed-deals` 62). Real-data-driven, no noindex/redirect URLs. Built as route handlers (`app/sitemap.xml/route.js` + `app/sitemaps/[segment]/route.js`, shared logic in `lib/sitemap.js`) rather than Next's `sitemap.js`/`generateSitemaps` convention, which produces child files but no index and rejects a hand-rolled `/sitemap.xml` route alongside it. `fetchSets`/`fetchCardHubs`/`fetchSpeciesHubs` already `unstable_cache`d; the deal-id scan wrapped too (900s). Unknown segment → 404.
- **Phase 16 — Performance**: real Speed Insights data verified: TTFB p75 53–92ms, LCP p75 1.2–1.6s, CLS 0 (all Google "Good" band). unstable_cache data-layer caching fixed a real 3.25s→sub-second regression.
- **Phase 17 — Image SEO**: real descriptive alt text (verified, not keyword-stuffed), next/image throughout with proper sizing/lazy-loading.
- **Phase 19 — Affiliate links**: preserved throughout, eBay Partner Network + TCGPlayer/Impact.com, disclosed in every page footer and on a dedicated `/affiliate-disclosure` page (no price change to the buyer, no paid placement, links marked `rel="sponsored"`).

## Completed (this session — deployed to production & verified live 2026-08-28, commit 0506dab)

- **Phase 5 — Pokémon entity pages**: `/pokemon` (index, client-filterable) + `/pokemon/[slug]` (per-species). Aggregates every active deal for one Pokémon across all its prints/sets — the "`<pokemon>` pokemon card" / "`<pokemon>` ex deals" intent that `/cards/[slug]` (one exact print) and `/sets/[slug]` (one set) don't serve. Structure mirrors `/sets/[slug]` (paginated, filterable grid, `?page=N` self-canonical) plus a real "every print of this Pokémon" index linking to the print's `/cards/[slug]` hub. **Structured data: `BreadcrumbList` + `ItemList` of the real prints — no `Product`/`Offer`** (a species spans many differently-priced prints, so it isn't a single item — per brief Phase 11).
  - **Species identity**: `lib/pokemonSpecies.js` `extractSpecies()` maps a catalog-clean watchlist card name to a canonical National Pokédex species (`lib/pokemonSpeciesData.js`, 1025 names generated from PokéAPI by `scripts/generatePokemonSpecies.js`). Earliest whole-word species run in the name wins — handles `"Alolan Vulpix"`, `"Surfing Pikachu"`, `"Dark Charizard"`, `"Rocket's Sneasel ex"`, `"M Gyarados EX"`, `"Pikachu & Zekrom GX"` (→ first species); punctuation/diacritics/gender-glyph folded (`"Farfetch'd"`, `"Mr. Mime"`, `"Type: Null"`, `"Nidoran♀"`). Verified by `scripts/auditSpeciesExtraction.js` over real data: **94.7% of distinct English watchlist names resolve, 97.0% of active deal rows covered**; every unmatched name is a trainer/energy/stadium single (correctly no species page); no false positives in the "species not first token" sample.
  - **Indexability threshold**: `SPECIES_MIN_LISTINGS = 5` in `lib/deals.js` — a species page exists only when the Pokémon has ≥5 simultaneous active listings (currently **223 pages**, typically spanning several prints/sets). This is Phase 5's `shouldIndex()` rule: canonical species identity + genuine listing density (→ a real price *range*, not one fabricated number). Threshold is a one-line change; the audit script prints the full distribution (≥3 → 271, ≥10 → 175).
  - **Data layer** (`lib/deals.js`, all `unstable_cache`d like the sets/hub fetchers): `fetchSpeciesHubs` (900s — grouped scan, min/max price, set & print counts), `resolveSpeciesSlug` / `resolveSpeciesByName`, `fetchSpeciesPrints` (900s — the prints index, scoped `.in(watchlist_id, …)`), `fetchSpeciesDealsPage` (45s — same shape as `fetchDealsPage`, scoped by species instead of set). No new cron, no DB migration, no `next.config`/`vercel.json` change.
- **Phase 18 — Trust/methodology pages**: `/about`, `/how-it-works`, `/methodology`, `/affiliate-disclosure`, `/contact` — static pages, every claim traceable to real code/config (scan cadence from `vercel.json`; `DISCOUNT_THRESHOLD = 0.1`, `SANITY_FLOOR_PCT` = 25% floor, seller feedback ≥95% / score ≥10 from `lib/dealMatching.js`; eBay Browse API + PokemonPriceTracker as the two sources; per-condition raw pricing + 1st-Edition guard; graded sold-comp pricing; EPN + TCGPlayer/Impact affiliate model). No invented numbers or methodology — same bar as the homepage `TrustBadges`. Each page carries `BreadcrumbList` JSON-LD (`/about` also `AboutPage`, `/contact` also `ContactPage`). Contact = `pokemondealfinder@gmail.com` (mailto).
  - **`components/SiteFooter.js`** — the affiliate disclosure (previously copy-pasted, 7 slightly different variants) is now one component with an optional per-page `note` prop that preserves each page's existing caveat wording (sealed "factory sealed", Japanese "Japanese print", etc.). It also renders the trust-page links row, so all five pages are linked site-wide (Phase 9 crawlable internal linking). Inline `<footer>` blocks replaced on all ~14 pages; `/deals/[id]` (which had no site footer) gains one.
- **Phase 24 — CI SEO test suite**: `tests/seo/` — zero-dependency `node:test` suite (`npm test` / `npm run test:seo`) that runs against a live server (dev server, or `next start` auto-booted by `tests/seo/run.mjs`). 33 checks across 5 files: per-page (15 static routes + sampled dynamic URLs from the sitemap) — one self-referencing absolute canonical, one non-empty length-bounded `<title>`, meta description present, one non-empty `<h1>`, not `noindex`, valid+typed JSON-LD; cross-page title/canonical uniqueness + consistent host; priority pages link to their detail pages; `robots.txt` + `sitemap.xml` well-formed, sampled sitemap URLs 200 / not redirected / not `noindex`; internal-link crawl (no 404s/redirects); bogus slugs 404 (deal detail: 404 or noindex 200). `.github/workflows/seo-tests.yml` runs it on PRs to `main` (needs `NEXT_PUBLIC_SUPABASE_*` secrets).
  - **Two real pre-existing defects the suite caught and fixed:** (1) the homepage rendered **no `<title>` tag** — `app/page.js` `generateMetadata` returned `title: undefined` for page 1, which Next 16 renders as *no title* rather than falling back to the layout default; now omits the key so the default applies. (2) `/deals/[id]` and `/sealed-deals/[id]` titles could reach ~92 chars; both now use the card-hub's length-aware pattern (drop the "- N% below market" suffix rather than truncate the real name).
- **Phase 20 — Editorial content**: `/guides` index + four evergreen guides (`how-pokemon-card-prices-work`, `card-condition-grading`, `raw-vs-graded-pokemon-cards`, `vintage-vs-modern-pokemon-cards`). Deliberately a *fixed set*, not a blog — registry in `lib/guides.js`, shared chrome in `components/GuideLayout.js`. Hobby/market background only; how *this site* prices/matches stays on `/methodology` (guides link to it, not duplicate it). Each: unique metadata, `BreadcrumbList` + `Article` JSON-LD (author/publisher = Organization, `datePublished` = real publish date), links into real `/sets` / `/market-data` / `/sealed-deals` / other guides. Factual claims only (condition scale, grader scales, era boundaries, 1st Edition/Shadowless) — no invented prices or stats, same bar as the homepage `TrustBadges`. Linked from the header nav and the site-wide footer; in the `pages` sitemap segment.

- **Phase 21 — Indexability threshold**: **`docs/indexability.md`** states the rule (verified identity + category + meaningful data) and a per-page-type table (route → identity check → minimum data → where enforced → what happens on failure). Enforcement stays distributed — each page type checks at its own data layer — but the tunable parts are centralised in **`lib/indexability.js`**: `CARD_HUB_MIN_LISTINGS` (2), `SET_MIN_LISTINGS` (1), `SPECIES_MIN_LISTINGS` (5) as named constants (`lib/deals.js` imports them; the inline `w.count < 2` magic number is gone), and `shouldIndexDeal(row)` (row exists + `is_active`) which now backs the previously-inlined checks in `/deals/[id]` and `/sealed-deals/[id]` (`generateMetadata` and page body, behaviour-identical). "Never index empty/near-duplicate" is enforced and covered by `tests/seo/negative.test.mjs`.

- **Phase 22 — DB performance audit**: done — code fix landed, **all six indexes applied to production** (2026-08-28).
  - **`count: "exact"` → `"estimated"`** on `fetchDealsPage` / `fetchSpeciesDealsPage` — no full filtered `COUNT(*)` on every category-page request; `totalPages` only feeds the pager (capped at `MAX_LIST_PAGES`), so a rough deep-tail count is fine. Pagination verified unchanged.
  - **N+1**: none found. Every fetcher issues one query (or a bounded 1000-row paginated loop for the group-in-JS aggregates); joins are in the single `select(...watchlist!inner(...))`; `fetchMarketDataSummary` composes *cached* fetchers.
  - **Indexes applied** (`supabase/seo_perf_indexes_migration.sql`, all `CREATE INDEX CONCURRENTLY`): `deals (watchlist_id)` (FK was unindexed — every `/cards/[slug]` + species `.in(watchlist_id,…)` query was full-scanning ~16.5k rows); `deals (is_active, first_seen_at desc)`; `deals (is_active, last_seen_at desc)`; `deals (is_active, market_price desc)`; partial `deals (auction_end_at) where is_active and listing_type='AUCTION'`; `watchlist (language, "set")`. `sealed_deals` (~65 rows) left unindexed deliberately; the 900s-cached full-scan aggregates (`fetchSets`/`fetchCardHubs`/`fetchSpeciesHubs`) are a precompute-if-slow follow-up, not a wider index.

## Done — docs (deployed with the same commit)

- **Phase 25 — GSC readiness doc**: `docs/gsc-readiness.md` — verification status (HTML tag already in `app/layout.js`), submit `/sitemap.xml` (the index; children auto-discovered), URL-inspection priority order, the indexing/enhancement/CWV reports to watch and their expected "not indexed" buckets for this site, and property-specific gotchas (faceted URLs canonicalise home; `/search` noindex; expired `/deals/[id]` = noindex 200; no hreflang).
- **Phase 26 — Final report**: `docs/seo-final-report.md` — full 26-phase summary, final URL architecture, indexable vs non-indexable table, metadata/schema/sitemap/linking approach, perf + DB + eBay findings, deliberate non-goals, and the remaining-work-blocked list (index migration apply, contact mailbox, CI secrets, eBay limit increase, deploy + dev-server restart).

## Re-audit + fixes — 2026-08-29 (post currency / country-catalog work)

A fresh live audit (crawler-view HTML across ~20 routes + repo + GSC:
sitemap index parsed OK, **6,132 URLs discovered**, 0 errors) after the
viewer-currency, `deliveryCountry`, and variant-matching changes landed.

### Fixed this pass (built + `tests/seo` 40/40 + build verified)

- **Structured-data gaps** — `/market-data`, `/market-data/most-listed-cards`,
  `/market-data/most-expensive-cards`, `/best-finds`, `/japanese-cards`,
  `/sets`, `/pokemon`, `/sealed-deals`, `/search` had **no JSON-LD at all**;
  `/sealed-deals/[id]` had `Product` but no `BreadcrumbList`; `/cards/[slug]`
  had a flat 2-level `BreadcrumbList` (`Deals → card`) that didn't match its
  own visible 3-level trail. All now emit `BreadcrumbList` (+ `CollectionPage`,
  + `ItemList` on the list pages, + `SearchResultsPage` on `/search`) via new
  `lib/jsonLd.js` builders and `components/JsonLd.js`. Card-hub breadcrumb is
  now `Deals → {set} → {card}`, matching the visible one.
- **`/cards/[slug]` H1** was just the bare Pokémon name (`Zapdos`) — now
  `{name} — {set} Prices & Deals`, carrying the set + intent.
- **`/market-data*` freshness** — the three pages now show a real "Data last
  updated <timestamp>" line (from `fetchLastScanTime`) and pass it as
  `dateModified` in `CollectionPage` (brief Phase 10 / §10).
- **Crawl-budget bleed** — every filter/sort link (`FilterBar` `FilterPill`,
  `/best-finds` raw/graded toggle) and the faceted nav entries
  (`SiteHeader` / `NavMenu` "Graded", "Auctions" = `?type=`/`?listing=`) now
  carry `rel="nofollow"`. They already canonicalised back to base; this keeps
  Google from spending a new site's small crawl budget fetching thousands of
  permutations. Pagination links stay followable.
- **SEO test suite** — `tests/seo/pages.test.mjs` now asserts every indexable
  page carries ≥1 valid JSON-LD block **and** a `BreadcrumbList` (home
  excepted). This is what caught the four missing-JSON-LD pages above.

### Caching regression — FIXED (2026-08-29)

Currency + region resolution moved **client-side** so no indexable page
reads `headers()` during render:

- **`components/CurrencyProvider.js`** (`"use client"`, wraps the app in
  `app/layout.js`) fetches `/api/rates` once after hydration → `{ viewer,
  marketplace, rates }` context. **`components/Price.js`** renders the
  listing's native currency on the server / first paint and swaps to the
  viewer's currency (text-only, no layout shift) once the context resolves.
- `/api/rates` now also returns the geo-detected `marketplace`;
  `RegionRedirect` reads it from the context instead of a server `detected`
  prop. `SearchClient` + `CardMemoryStrip` use the same context (one fetch,
  was three).
- Every page (`/`, `/best-finds`, `/cards/[slug]`, `/deals/[id]`,
  `/japanese-cards`, `/pokemon/[slug]`, `/sealed-deals`,
  `/sealed-deals/[id]`, `/sets/[slug]`, `/search`) dropped its
  `viewerCurrency()` / `getUsdRates()` / `detectedMarketplace()` server
  calls; `DealCard` / `SealedDealCard` / `StickyDealCta` take no currency
  props and render `<Price>` islands.
- `/cards/[slug]`, `/deals/[id]`, `/sealed-deals/[id]` also **stopped
  reading `searchParams`** → zero request-time APIs, fully ISR-cacheable
  (data stays in `unstable_cache`). The card hub's `?country=` filter was
  removed with them (the country grids cover that intent and the audit had
  flagged the per-hub faceted URLs as crawl-budget bleed).
- `/sets/[slug]` + `/pokemon/[slug]` keep `searchParams` (paginated
  filterable grids) so they stay dynamic, but without `headers()` they no
  longer force `no-store`.
- SSR HTML verified to still contain real prices (native currency) for
  crawlers; `tests/seo` 40/40; build clean.
- Also fixed a **pre-existing sitemap bug** surfaced by the test run:
  `/sitemaps/deals.xml` could emit a duplicate `<loc>` because the deal-id
  scan ordered by non-unique `last_seen_at` across `.range()` pages —
  added an `id` tiebreaker + a de-dupe Set.

**Then made them actually edge-cache** (Next 16 keeps a dynamic-segment
route fully dynamic — `no-store`, `X-Vercel-Cache: MISS` every hit — with
no `generateStaticParams`, even when every data call is `unstable_cache`d):

- `/cards/[slug]` — `generateStaticParams` over every current hub slug
  (~724 pages prerendered, SSG + ISR).
- `/deals/[id]`, `/sealed-deals/[id]` — empty `generateStaticParams` +
  `revalidate` → ISR on demand (render once, then edge-cached +
  background-revalidated).
- **Verified live**: `/cards/[slug]`, `/deals/[id]`, `/sealed-deals/[id]`
  now return `Cache-Control: public` + `X-Vercel-Cache: HIT` (were
  `private, no-store` / MISS). ~5,700 of the indexable detail pages are
  edge-cached; SSR HTML still carries real native-currency prices.
- **`/sets/[slug]` + `/pokemon/[slug]` — now ISR too** (2026-08-29,
  commit `caa26cb`). New `<DealGrid>` client component: the host page
  renders page 1 (no filters) server-side — the crawler HTML — and
  `<DealGrid>` handles filters / page > 1 by fetching a new
  `/api/deals-page` endpoint. It reads `window.location.search` via
  `useSyncExternalStore` (**not** `useSearchParams`, which drops a static
  page to client-only rendering and blanks the grid for crawlers). Pages
  drop `searchParams`, `generateStaticParams → []` + `revalidate`.
  Canonical is always the bare path now — the `?page=N` self-canonical
  series is gone (churny paginated lists don't rank, and the sitemap
  enumerates every deal directly). **Verified live: `X-Vercel-Cache: HIT`
  on `/cards/[slug]`, `/deals/[id]`, `/sealed-deals/[id]`, `/sets/[slug]`,
  `/pokemon/[slug]` — ~6,100 pages, essentially the whole crawlable long
  tail, now edge-cached** (were `no-store` MISS). SSR HTML still carries
  the page-1 grid + JSON-LD + the species "every print" section.
- **Only `ƒ` indexable URLs left**: `/`, `/best-finds`, `/japanese-cards`,
  `/sealed-deals` (index) — 4 filtered-grid URLs, not a page *type*.
  Negligible crawl cost; the same `<DealGrid>` pattern could be applied
  later if wanted.

### Also this pass (2026-08-29)

- **Thin-content: `SET_MIN_LISTINGS` 1 → 3** (`lib/indexability.js`,
  enforced in `computeAggregates`). A set page is a browsable filterable
  grid — 1–2 deals is a card or two + boilerplate, thin, and can't serve
  "<set> card values" intent. Live data: 19 of 171 set pages sat at 1–2;
  they now 404 and drop from the sitemap. Card hubs stay at 2 (a 2-seller
  hub still carries price history + the variant grid — not thin).
- **`/cards/[slug]` `generateStaticParams` → `[]`** (not every slug):
  prerendering ~720 hubs at build fired ~720 billed, rate-limited
  PokemonPriceTracker calls (429s, degraded initial renders). Empty
  params + `revalidate` still gives ISR — each hub renders once on demand
  then edge-caches — and spreads the API load out.
- **New JSON-LD validated live** — all `BreadcrumbList` / `CollectionPage`
  / `ItemList` / `SearchResultsPage` blocks added this session parse
  cleanly on production; expired `/sealed-deals/[id]` correctly emits none
  (it's `noindex`).
- **Pokémon extraction re-verified** (`scripts/auditSpeciesExtraction.js`,
  post `deliveryCountry` + variant-match changes): **95.7%** of distinct
  watchlist names resolve (was 94.7%), **98.6%** of active deal rows
  covered (was 97.0%). All 43 unmatched names are trainer/supporter/item/
  energy/stadium singles (correctly no species page); no false positives
  in the "species token not first" sample.
- **Affiliate outbound journey audited** (`§12`): `components/AffiliateLink`
  emits `rel="sponsored noopener noreferrer"` `target="_blank"` on every
  eBay/TCGPlayer link; EPN params (`mkevt`/`mkcid`/`mkrid`/`campid`/
  `toolid`) present and per-marketplace correct (US `711-…`, GB `710-…`,
  AU `705-…`); click-tracked via Vercel Analytics; no countdown timers /
  fake scarcity / invented stock. No change needed.

## SEO levers pass — 2026-08-29

### Lever #1 — card-page price/value framing — DONE (commits `2c91cf1`, `fe39443`)

`/cards/[slug]` led with the deal grid; the reference pricing that
answers "<card> <set> price / value / PSA 10 price" was only in the
detailed variant grid at the bottom. Framing change (not a rebuild):

- **`components/CardPriceSummary.js`** — a new block directly under the
  H1: **Market value (raw, Near Mint)** from `analysis.raw.currentPrice`,
  labelled as a PokémonPriceTracker reference from sold data; a **by-
  condition raw ladder** (NM→Damaged); **graded tiers** from real
  recorded sold sales with per-tier sale counts. Everything else (variant
  grid, price history, deals, related cards, `Product`/`Offer` +
  `BreadcrumbList` JSON-LD, canonical, indexability, affiliate CTAs) is
  unchanged and still below.
- **Anti-fabrication guards (verified live):** the condition ladder only
  renders when it's a sane non-increasing sequence from Near Mint — cards
  with contaminated data (e.g. Shadowless Alakazam, where "Damaged" >
  "Near Mint") show just the NM headline + graded, no nonsense rows.
  Graded tiers need ≥ 1 real sale; low-confidence tiers are labelled "low
  confidence". Empty rows never render.
- **Live-listing figure re-framed** — was a bare bold "From $X – $Y"
  under the H1 (read as a market value); now "N active listings, from $X
  **(asking prices, not sold)**" inside the summary.
- **Metadata** — title `"<name> (<set>) Price & Deals"` (was "Compare N
  Deals"); description leads with "price and value — raw and graded
  prices from real sold data …".
- **`gradeLabel()`** now parses `psa8_5` → "PSA 8.5", `tag9` → "TAG 9"
  (also fixes the existing variant grid).
- Verified live across vintage / modern / cheap / contaminated-data
  cards: H1, title, canonical, robots (indexable), JSON-LD, affiliate
  `rel`, internal links all intact; price figures accurate; no fabricated
  or empty values. `tests/seo` 40/40; `/cards/[slug]` still SSG.

### Lever #2 — additional market-data pages — MEASURED, NOT BUILDING

Checked whether the real data can support "biggest price movers",
"vintage card prices", "Japanese market data", or another dataset. It
cannot, at the bar the brief sets ("if borderline, default to not
building"):

| Candidate | Finding | Decision |
| --- | --- | --- |
| **Biggest price movers** | `deals.price_change_24hr` is **100 % null** (the scanner writes `null`); `deals.first_seen_at` spans **~2 days**; there is **no price-history table** — the site keeps no time series of its own, only per-card live PokémonPriceTracker history (~30 pts, billed, rate-limited). Computing deltas would need weeks of persisted daily snapshots, or a few thousand PPT calls (already 429-ing at 500/min). | **Clearly insufficient — do not build.** |
| **Vintage card prices** | Would be a WOTC-era filter over the exact data behind `/market-data/most-expensive-cards` — near-duplicate intent + content. | **Borderline → do not build.** |
| **Japanese market data** | **247** distinct JP cards have a real `market_price`, across 133 sets — but 167 of them are $10–50, only ~15 are $200+, top card $1,600. Thin, low-value, overlaps `/japanese-cards`, and only 2 days of data (no "as of" / movement to show). | **Borderline → do not build.** |
| **Sets by average value / other slices** | Aggregate of the same current data the `/sets` index and `/market-data/*` pages already expose. | **Not distinct — do not build.** |

Persisting a daily per-card price snapshot (a small `price_history`
table written by `/api/refresh-catalog`) would unlock a genuine movers /
trend page in ~4–8 weeks. Noted as a future data-collection task, not
built now.

### Lever #3 — remaining dynamic routes (`/`, `/best-finds`, `/japanese-cards`, `/sealed-deals`) — REVIEWED, LEFT DYNAMIC

Measured live: TTFB ~350–520 ms (`no-store`, `X-Vercel-Cache: MISS`) vs
~40–80 ms on the now-edge-cached detail pages. So there *is* a TTFB
saving on offer — but:

- These are **4 individual URLs, not a page type**. The crawl-budget
  argument that justified the `/cards` `/deals` `/sets` `/pokemon` work
  (~6,100 pages) doesn't apply — Google crawls 4 URLs regardless.
- All four are within Google's "Good" TTFB band already, and their data
  is `unstable_cache`-warm, so the render is ~10–15 ms.
- Applying the `<DealGrid>` pattern is **not straightforward** here: it's
  coupled to `kind: "set" | "species"` + `/api/deals-page`, and these
  pages use different fetchers (`fetchBestFinds`, `fetchSealedDealsPool`),
  a deliberate page-1 shuffle rotation (`/` and `/japanese-cards`), and
  best-finds' own ranking. Generalising it across four heterogeneous
  pages is a real refactor with real regression surface.

The brief's bar is "safe **and** straightforward" — this is neither, for
a benefit that's marginal (4 URLs, already "Good" CWV). **Left dynamic
deliberately.** The homepage is the one worth revisiting if Search
Console / CrUX later flags its LCP; that would be its own scoped change.

## Not building (deliberate, documented)

- **Phase 8 — dedicated price-history pages**: not building as separate `/cards/[slug]/price-history/` routes — price history is already integrated into the card hub and deal detail pages (chart + real data), and PokemonPriceTracker doesn't expose enough historical depth to justify a separate crawlable page beyond what's already shown. Documenting this as a deliberate scope decision, not an oversight.
- **Phase 23 — 404/410/redirect infra**: 404 (`notFound()`) already correct on all dynamic routes. No redirect/410 infrastructure built — slugs are derived from live data, not stored, so they only change if the derivation logic itself changes, which hasn't happened. Documenting as a deliberate "not needed given current architecture" rather than building unused speculative code.

## Known operational issue (unrelated to SEO code)

**eBay Browse API 429s — diagnosed 2026-08-28.** Not a mysterious block: eBay's Developer Analytics `getRateLimits` confirms the app is on the **default `buy.browse` tier of 5,000 calls/day** and spends the whole allocation (usually by mid-day), after which every search 429s until the ~07:00 UTC reset. Full write-up + the daily call budget in **`docs/ebay-rate-limits.md`**.

Mitigations applied (deploy pending): **pre-flight quota guard** — `getBrowseRateLimit()` in `lib/ebay.js`; both scan routes skip the run (`{ skipped: "ebay_rate_limited" }`) when live `remaining` is below a tier-aware floor (extended yields at 1500, priority 600, sweep/sealed 250) so the daily budget can no longer be *overrun* and the cheap user-facing sweep is protected. Plus volume trims in `vercel.json` (non-US sweeps hourly→3h, priority 4h→6h, sweep `GRADED_LOOKUP_CAP` 10→6) and a transient-only retry (`fetchWithRetry` — never retries a 429). Typical daily spend now ~2,600–3,400.

**Real fix (process, not code):** request a Browse API rate-limit increase in the eBay Developer portal — the app's affiliate use is exactly the intended Buy-API case. See the doc.

Does not affect any SEO-page code; existing active deals serve normally via the rotation pool regardless.
